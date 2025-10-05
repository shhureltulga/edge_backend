// src/services/haSync.ts
import { fetchCommands, ackCommand } from './mainClient';
import {
  ensureAreaByName,
  updateArea,
  deleteArea,
  findAreaByName,
} from '../utils/ha';

type EdgeCommand = {
  id: string;
  payload: any;
};

async function handleCommand(c: EdgeCommand) {
  let status: 'acked' | 'failed' = 'acked';
  let error: string | null = null;

  try {
    const p = c.payload || {};
    const op = p?.op as string | undefined;

    // Нийтлэг талбарууд
    const roomName = p?.room?.name as string | undefined; // ensure/delete fallback
    const haAreaId = (p?.haAreaId || p?.areaId) as string | undefined;

    switch (op) {
      case 'ha.area.ensure': {
        if (!roomName) throw new Error('missing room.name');
        await ensureAreaByName(roomName);
        break;
      }

      case 'ha.area.rename': {
        // main-аас ирэх шинэ талбарууд
        const fromName = p?.fromName as string | undefined;
        const toName = (p?.toName as string | undefined) ?? roomName;

        if (!toName) throw new Error('missing toName');

        // 1) area_id өгөгдвөл шууд rename
        if (haAreaId) {
          await updateArea(haAreaId, toName);
          break;
        }

        // 2) fromName-аар хайж rename
        if (fromName) {
          const a = await findAreaByName(fromName);
          if (a?.area_id) {
            await updateArea(a.area_id, toName);
            break;
          }
        }

        // 3) fallback: toName өөрөө байхгүй бол шинээр үүсгэе,
        //    байгаад нэр нь яг ижил байвал юу ч хийхгүй.
        const exists = await findAreaByName(toName);
        if (!exists) {
          await ensureAreaByName(toName);
        }
        break;
      }

      case 'ha.area.delete': {
        // 1) area_id байвал шууд устга
        if (haAreaId) {
          await deleteArea(haAreaId);
          break;
        }
        // 2) нэрээр хайж устга
        const targetName = roomName || p?.name;
        if (targetName) {
          const a = await findAreaByName(targetName);
          if (a?.area_id) {
            await deleteArea(a.area_id);
          }
        }
        break;
      }

      default: {
        status = 'failed';
        error = `unknown_op: ${op}`;
      }
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message || String(e);
  }

  try {
    await ackCommand(c.id, status === 'acked', error ?? undefined);
  } catch {
    // чимээгүй — дараагийн polling дээр дахин оролдоно
  }
}

async function pollOnce() {
  try {
    const cmds = await fetchCommands();
    if (!cmds?.length) return;
    for (const c of cmds) {
      await handleCommand(c);
    }
  } catch {
    // чимээгүй алгасна
  }
}

export function startHaSyncWorker(intervalMs = 2000) {
  setInterval(pollOnce, intervalMs);
}
