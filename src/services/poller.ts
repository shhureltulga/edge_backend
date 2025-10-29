// src/services/poller.ts
import axios from 'axios';
import { createHmacHeaders } from '../utils/hmac';
import { executeCommand } from './executeCommand';
import { prisma } from '../lib/prisma';
import { EdgeCmdStatus } from '@prisma/client';

type MainEdgeCommand = {
  id: string;
  payload?: any;
  [k: string]: any;
};


const BUILD_TAG = 'poller-v4 @ 2025-10-28';
console.log('[BOOT]', BUILD_TAG, { file: __filename, cwd: process.cwd() });


function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function deriveType(raw: any, payload: any): string | undefined {
  const t = payload?.type ?? payload?.op ?? raw?.type ?? raw?.op;
  return typeof t === 'string' ? t.trim() : t;
}

function deriveDeviceKey(raw: any, payload: any, type?: string): string | undefined {
  let dk =
    payload?.deviceKey ??
    raw?.deviceKey ??
    (payload?.room?.id ? `room_${payload.room.id}` : undefined) ??
    (raw?.room?.id ? `room_${raw.room.id}` : undefined) ??
    (payload?.roomId ? `room_${payload.roomId}` : undefined) ??
    (raw?.roomId ? `room_${raw.roomId}` : undefined) ??
    // ⬇️ FLOOR fallback-ууд
    (payload?.floor?.id ? `floor_${payload.floor.id}` : undefined) ??
    (raw?.floor?.id ? `floor_${raw.floor.id}` : undefined) ??
    (payload?.floorId ? `floor_${payload.floorId}` : undefined) ??
    (raw?.floorId ? `floor_${raw.floorId}` : undefined);

  if (!dk && (type?.startsWith('ha.area.') || type?.startsWith('room.'))) {
    const rid = payload?.room?.id ?? raw?.room?.id ?? payload?.roomId ?? raw?.roomId;
    if (rid) dk = `room_${rid}`;
  }
  if (!dk && (type?.startsWith('ha.floor.') || type?.startsWith('floor.'))) {
    const fid = payload?.floor?.id ?? raw?.floor?.id ?? payload?.floorId ?? raw?.floorId;
    if (fid) dk = `floor_${fid}`;
  }
  return typeof dk === 'string' ? dk.trim() : dk;
}
// --- ADD: helper to sync haFloorId to MAIN (Bearer→HMAC fallback)

async function syncFloorHaIdToMain(baseUrl: string, floorId: string, haFloorId: string) {
  const path = `/api/floors/${floorId}/ha`;
  const url  = `${baseUrl}${path}`;
  const body = { haFloorId: String(haFloorId), siteId: process.env.SITE_ID || undefined };

  const EDGE_JWT = process.env.EDGE_JWT || '';
  const tryBearer = async () => {
    const headers = { Authorization: `Bearer ${EDGE_JWT}` };
    return axios.patch(url, body, { headers, timeout: 10000 });
  };
  const tryHmac = async () => {
    const headers = createHmacHeaders('PATCH', path, body);
    return axios.patch(url, body, { headers, timeout: 10000 });
  };

  try {
    if (EDGE_JWT) {
      const r = await tryBearer();
      if (r.status >= 200 && r.status < 300) {
        console.log('[SYNC] Floor haFloorId -> main OK (Bearer)', { floorId, haFloorId });
        return true;
      }
    }
    // Bearer алгассан эсвэл амжилтгүй бол HMAC
    const r2 = await tryHmac();
    if (r2.status >= 200 && r2.status < 300) {
      console.log('[SYNC] Floor haFloorId -> main OK (HMAC)', { floorId, haFloorId });
      return true;
    }
    throw new Error(`sync_failed_status_${r2.status}`);
  } catch (err: any) {
    const s = err?.response?.status;
    console.error('[SYNC] PATCH /api/floors/:id/ha failed:', s, err?.response?.data || err?.message);
    throw err;
  }
}

export async function startCommandPoller(): Promise<void> {
  const baseUrl = process.env.MAIN_BASE_URL?.replace(/\/$/, '');
  const edgeId = process.env.EDGE_ID;
  if (!baseUrl || !edgeId) throw new Error('Missing env: MAIN_BASE_URL or EDGE_ID');

  let since = new Date(0).toISOString();
  let backoff = 1000;

  // Нэг удаагийн since reset (шаардлагатай бол RESET_SINCE=1 тавиад restart)
  if (process.env.RESET_SINCE === '1') {
    console.warn('[poll] RESET_SINCE is ON: resetting since to epoch');
    since = new Date(0).toISOString();
  }

  while (true) {
    const pathForSig = '/edge/commands';
    const url = `${baseUrl}/edgehooks${pathForSig}`;
    const params = { edgeId, since, siteId: process.env.SITE_ID };
    const headers = createHmacHeaders('GET', pathForSig, params);

    try {
      const res = await axios.get(url, { headers, params, timeout: 20000 });
      const data = res.data as any;
      const items: MainEdgeCommand[] = (data.items ?? data.commands ?? []) as MainEdgeCommand[];
      const serverTime: string = data.serverTime ?? new Date().toISOString();

      console.log('[poll] got', items.length, 'items');

      let anyAcked = false;

      for (const item of items) {
        const raw: any = item as any;
        const payload: any = raw.payload ?? raw;

        console.log(
          '[POLL] item=',
          { id: item.id, type: payload?.type ?? payload?.op ?? raw?.type ?? raw?.op, keys: Object.keys(payload || {}) }
        );

        let type = deriveType(raw, payload);
        let deviceKey = deriveDeviceKey(raw, payload, type);

        // Guard + force-derive fallback for ha.area.ensure / ha.floor.ensure
        if (!item?.id || !type || !deviceKey) {
          if ((payload?.op === 'ha.area.ensure' || raw?.op === 'ha.area.ensure') && (payload?.room?.id || raw?.room?.id)) {
            type = 'ha.area.ensure';
            const rid = payload?.room?.id ?? raw?.room?.id!;
            deviceKey = `room_${rid}`;
            console.warn('[poll] force-derive for ha.area.ensure', { id: item?.id, type, deviceKey });
          } else if ((payload?.op === 'ha.floor.ensure' || raw?.op === 'ha.floor.ensure') && (payload?.floor?.id || raw?.floor?.id)) {
            type = 'ha.floor.ensure';
            const fid = payload?.floor?.id ?? raw?.floor?.id!;
            deviceKey = `floor_${fid}`;
            console.warn('[poll] force-derive for ha.floor.ensure', { id: item?.id, type, deviceKey });
          } else {
            console.warn('[poll] skip: missing id/type/deviceKey (PATCH3)', {
              id: item?.id,
              gotType: type,
              gotDeviceKey: deviceKey,
              roomInPayload: payload?.room,
              floorInPayload: payload?.floor,
              keys: Object.keys(payload || {}),
            });
            continue;
          }
        }

        // === Inbox upsert (idempotent)
        const existing = await prisma.edgeCommand.findFirst({
          where: { correlationId: item.id },
          select: { id: true },
        });
        let rowId: string;

        if (!existing) {
          const created = await prisma.edgeCommand.create({
            data: {
              correlationId: item.id,
              type,
              deviceKey,
              payload,
              status: EdgeCmdStatus.queued,
            },
            select: { id: true },
          });
          rowId = created.id;
        } else {
          const updated = await prisma.edgeCommand.update({
            where: { id: existing.id },
            data: {
              type: { set: type },
              deviceKey: { set: deviceKey },
              payload,
              status: { set: EdgeCmdStatus.queued },
            },
            select: { id: true },
          });
          rowId = updated.id;
        }

        // === PROCESS
        let ok = false;
        let execRes: any = null;

        await prisma.edgeCommand.update({
          where: { id: rowId },
          data: { status: { set: EdgeCmdStatus.processing } },
        });

    
try {
  execRes = await executeCommand({ id: item.id, type, deviceKey, ...payload });

  // ❗ executeCommand хоосон/алдаатай бол ACK хийхгүй
  if (!execRes || (typeof execRes === 'object' && (execRes as any).error)) {
    const err = (execRes as any)?.error || { code: 'no_result', message: 'executeCommand returned empty result' };
    console.error('[EXEC:FAIL]', { id: item.id, type, err });

    await prisma.edgeCommand.update({
      where: { id: rowId },
      data: { status: { set: EdgeCmdStatus.error }, error: JSON.stringify(err) },
    });

    ok = false;                  // ❌ ACK хийхгүй
  } else {
    // === Floor sync (haFloorId авсан үед)
    let patched = true;
// ⬇️ Floor sync (HMAC-тай, path нь ЯГ /api/floors/:id/ha байх ёстой)
if (execRes && execRes.ack && execRes.ack.haFloorId) {
  const floorId =
    payload?.floor?.id ??
    payload?.floorId ??
    (deviceKey?.startsWith('floor_') ? deviceKey.slice(6) : null) ??
    null;

  if (floorId) {
    try {
      // ❶ pathForSig нь яг router-ийн path — query, origin ОРОХГҮЙ
      const pathForSig = `/api/floors/${floorId}/ha`;

      // ❷ body-г яг энэ бүтэцтэй явуулна (илүү талбар нэмэхгүй!)
      const body = { haFloorId: String(execRes.ack.haFloorId) };

      // ❸ одоо байгаа createHmacHeaders утсаараа гарын үсэг зурна
      const headers = createHmacHeaders('PATCH', pathForSig, body);

      // ❹ PATCH request — URL нь baseUrl + pathForSig
      const url = `${baseUrl}${pathForSig}`;
      await axios.patch(url, body, { headers, timeout: 10000 });

      console.log('[SYNC] Floor haFloorId -> main OK', {
        floorId,
        haFloorId: body.haFloorId,
      });
    } catch (e: any) {
      console.error(
        '[SYNC] PATCH /api/floors/:id/ha failed:',
        e?.response?.status,
        e?.response?.data || e?.message,
      );
      // PATCH амжилтгүй бол ACK хийхгүй
      ok = false;
    }
  } else {
    console.warn('[SYNC] haFloorId present but floorId not derivable from payload/deviceKey');
  }
}

    if (!patched) {
      // ❌ PATCH бүтээгүй бол ACK БҮҮ явуул — дахин татагдаж, дахин оролд
      await prisma.edgeCommand.update({
        where: { id: rowId },
        data: { status: { set: EdgeCmdStatus.error }, error: 'floor_patch_failed' },
      });
      ok = false;
    } else {
      await prisma.edgeCommand.update({
        where: { id: rowId },
        data: { status: { set: EdgeCmdStatus.done }, processedAt: new Date() },
      });
      ok = true;
    }
  }
} catch (err: any) {
  console.error('[execute error]', err?.message || String(err));
  await prisma.edgeCommand.update({
    where: { id: rowId },
    data: { status: { set: EdgeCmdStatus.error }, error: String(err) },
  });
}

// === ACK зөвхөн ok=true үед
if (ok) {
  const ackPath = '/edge/commands/ack';
  const ackUrl  = `${baseUrl}/edgehooks${ackPath}`;
  const ackBody: any = { commandId: item.id, status: 'acked' as const };
  if (execRes && typeof execRes === 'object' && execRes.ack) ackBody.meta = execRes.ack;

  const ackHeaders = createHmacHeaders('POST', ackPath, ackBody);
  console.log('[ACK->main]', ackBody);
  try {
    const ackRes = await axios.post(ackUrl, ackBody, { headers: ackHeaders, timeout: 10000 });
    console.log('[ack ok]', item.id, ackRes.status, JSON.stringify(ackRes.data));
    anyAcked = true;
  } catch (ae: any) {
    console.error('[ack error]', item.id, ae?.response?.status, ae?.response?.data || ae?.message);
  }
}

      }

      // since ахиулах логик
      if (items.length === 0) {
        // keep since as-is
      } else if (anyAcked) {
        since = serverTime;
      } else {
        console.warn('[poll] no successful ACK; keep since as-is to re-fetch');
      }

      backoff = 1000;

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
