import axios from 'axios';
import { createHmacHeaders } from '../utils/hmac';
import { executeCommand } from './executeCommand';
import { prisma } from '../lib/prisma';
import { EdgeCmdStatus } from '@prisma/client';
import { syncRoomsForSite, syncRoomsToHA } from './roomSync';

type MainEdgeCommand = {
  id: string;            // main талын command id (ACK-д ашиглана)
  [k: string]: any;      // type/deviceKey зэрэг нь payload эсвэл root-д байж болно
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startCommandPoller(): Promise<void> {
  const baseUrl = process.env.MAIN_BASE_URL?.replace(/\/$/, '');
  const edgeId = process.env.EDGE_ID;
  if (!baseUrl || !edgeId) throw new Error('Missing env: MAIN_BASE_URL or EDGE_ID');

  let since = new Date(0).toISOString();
  let backoff = 1000;

 while (true) {
  // ✅ HMAC-д ОРОХ path (mount prefix-гүй)
  const pathForSig = '/edge/commands';
  // ✅ Жинхэнэ URL (mount prefix-тэй)
  const url = `${baseUrl}/edgehooks${pathForSig}`;

  const params = { edgeId, since, siteId: process.env.SITE_ID }; // siteId-ыг сервер нэхдэг бол нэм

  const headers = createHmacHeaders('GET', pathForSig, params);         // ✅ pathForSig-ийг ашиглана

  try {
    const res = await axios.get(url, { headers, params, timeout: 20000 });
      console.log('[poll] raw:', res.status, JSON.stringify(res.data));
      const data = res.data as any;
      const items: MainEdgeCommand[] = (data.items ?? data.commands ?? []) as MainEdgeCommand[];
      const serverTime: string = data.serverTime ?? new Date().toISOString();

      console.log('[poll] raw:', res.status, JSON.stringify(data));
      console.log('[poll] got', items.length, 'items');
      if (items.length) console.log('[poll] got', items.length, 'items');

      for (const item of items) {
        console.log('[command]', item);

  // ✅ Payload-ийг илүү найдвартай ялгаж авна
  const payload = item.payload ?? item;

  // ✅ Type болон deviceKey-г payload эсвэл fallback-оос онооно
  const type: string | undefined = payload.type ?? payload.op;
  let deviceKey: string | undefined = payload.deviceKey;

  // ✅ fallback: room.id-аар deviceKey үүсгэнэ
  if (!deviceKey && payload.room?.id) {
    deviceKey = `room_${payload.room.id}`;
  }

  // ✅ skip нөхцөл
  if (!item.id || !type || !deviceKey) {
    console.warn('[poll] skip: missing id/type/deviceKey', {
      id: item.id,
      type,
      deviceKey,
      payload,
    });
    continue;
  }

        if (!item.id || !type || !deviceKey) {
          console.warn('[poll] skip: missing id/type/deviceKey', item);
          continue;
        }


        // === ЛОКАЛ INBOX (payload-only, идемпотент) ===
        const existing = await prisma.edgeCommand.findFirst({
          where: { correlationId: item.id },
        });

        if (!existing) {
          await prisma.edgeCommand.create({
            data: {
              correlationId: item.id,
            type,                  // ✅ REQUIRED талбар — заавал өг
            deviceKey, 
              payload: item as any,                // 👈 зөвхөн payload хадгална
              status: EdgeCmdStatus.queued,
            },
          });
        } else {
          await prisma.edgeCommand.update({
            where: { id: existing.id },
            data: {
                 type: { set: type },               // ✅ schema-д required тул sync-лэе
                deviceKey: { set: deviceKey },     // ✅
              payload: item as any,
              status: { set: EdgeCmdStatus.queued },
            },
          });
        }

        // === PROCESS ===
        let ok = false;
        const row = await prisma.edgeCommand.findFirst({ where: { correlationId: item.id } });
        if (row) {
          await prisma.edgeCommand.update({
            where: { id: row.id },
            data: { status: { set: EdgeCmdStatus.processing } },
          });
        }

        try {
          await executeCommand({ id: item.id, type, deviceKey, ...payload });

          if (row) {
            await prisma.edgeCommand.update({
              where: { id: row.id },
              data: { status: { set: EdgeCmdStatus.done }, processedAt: new Date() },
            });
          }
          ok = true;
        } catch (err: any) {
          console.error('[execute error]', err?.message || String(err));
          if (row) {
            await prisma.edgeCommand.update({
              where: { id: row.id },
              data: { status: { set: EdgeCmdStatus.processing }, error: String(err) },
            });
          }
        }

        // === ACK (амжилттай үед) ===
        if (ok) {
         const ackPath = '/edge/commands/ack';
          const ackUrl  = `${baseUrl}/edgehooks${ackPath}`;
          const ackBody = { commandId: item.id, status: 'acked' as const }; // амжилттай бол 'acked'
          const ackHeaders = createHmacHeaders('POST', ackPath, ackBody);

          try {
            const ackRes = await axios.post(ackUrl, ackBody, { headers: ackHeaders, timeout: 10000 });
            console.log('[ack ok]', item.id, ackRes.status, JSON.stringify(ackRes.data));
          } catch (ae: any) {
            console.error('[ack error]', item.id, ae?.response?.status, ae?.response?.data || ae?.message);
          }
        }
      }

      since = serverTime;
      backoff = 1000; // reset
    } catch (e: any) {
      console.error('[poll error]', e?.response?.data || e?.message);
      backoff = Math.min(backoff * 2, 30000);
    }

    await sleep(backoff);
  }
}

if (require.main === module) {
  console.log('[poller] starting…');
  startCommandPoller().catch((err) => {
    console.error('[poller fatal]', err?.response?.data || err?.message || err);
    process.exit(1);
  });
}

async function main() {
  const siteId = process.env.SITE_ID;
  if (!siteId) {
    throw new Error('SITE_ID env хоосон байна. .env дотор SITE_ID=... заавал тохируул.');
  }

  console.log('[rooms] syncing to HA…');
  const result = await syncRoomsForSite(siteId);
  // Хэрвээ syncRoomsForSite ямар нэгэн үр дүн (тоо гэх мэт) буцаадаг бол логлоно
  console.log('[rooms] synced:', result ?? 'ok');
  // …хүсвэл энд devices assign гэх мэт дараагийн workflow-уудыг дуудаарай
}

main().catch((e) => {
  console.error('[poller] error', e);
  process.exit(1);
});