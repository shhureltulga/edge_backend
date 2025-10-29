// src/services/executeCommand.ts
import axios from 'axios';
import { assignAreaToFloor, ensureAreaByName, ensureFloorByName } from '../utils/ha';
import { createHmacHeaders } from '../utils/hmac';

export interface EdgeCommandInput {
  id: string;
  type: string;
  deviceKey: string;
  room?: { id: string; name: string };
  floor?: { id?: string; name?: string; haFloorId?: string; floor_id?: string };
  [k: string]: any;
}

export type ExecAckMeta = {
  haAreaId?: string;
  haAreaName?: string;
  roomId?: string | null;
  ok?: boolean;
  haFloorId?: string;
  haFloorName?: string;
  floorId?: string | null;
};

export type ExecResult =
  | { ack: ExecAckMeta }
  | { error: { code: string; message: string; details?: any } }
  | void;

const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/,'');
const BUILD_TAG = 'executeCommand-floor-fix @ 2025-10-28';

async function patchFloorHaIdToMain(floorId: string, haFloorId: string) {
const pathForSig = `/api/floors/${floorId}/ha`;
const body = { haFloorId: String(haFloorId) };
const headers = {
  ...createHmacHeaders('PATCH', pathForSig, body),
  'Content-Type': 'application/json',
  'x-edge-id': process.env.EDGE_ID || 'edge_nas_01',
};
await axios.patch(`${MAIN_BASE}${pathForSig}`, body, { headers, timeout: 10000 });
}

export async function executeCommand(cmd: EdgeCommandInput): Promise<ExecResult> {
  const type = (cmd.type ?? '').toString().trim();
  console.log(`[EXEC] ${type} -> ${cmd.deviceKey}`);
  console.log('[BOOT]', 'executeCommand-v2 @ 2025-10-28', { file: __filename });

  switch (type) {
    case 'light.set': {
      const payload = JSON.stringify({
        on: cmd.on === undefined ? true : !!cmd.on,
        brightness: typeof cmd.brightness === 'number' ? cmd.brightness : 100,
      });
      const topic = `edge/${cmd.deviceKey}/set`;
      console.log(`[MQTT] ${topic} <- ${payload}`);
      return { ack: { ok: true } };
    }

    case 'ha.area.ensure': {
      const room = cmd.room ?? cmd.payload?.room ?? null;
      const roomName = room?.name?.toString().trim();
      if (!roomName) {
        console.warn('[ha.area.ensure] Missing room name', { got: room });
        return { error: { code: 'bad_payload', message: 'Missing room.name', details: { room } } };
      }
      const haArea = await ensureAreaByName(roomName);
      console.log(`[ha.area.ensure] ${roomName} -> ${haArea.area_id}`);
      return {
        ack: {
          ok: true,
          haAreaId: haArea.area_id,
          haAreaName: haArea.name ?? roomName,
          roomId: (room?.id as string) ?? (cmd.deviceKey?.startsWith('room_') ? cmd.deviceKey.slice(5) : null),
        },
      };
    }

    case 'ha.floor.ensure': {
      const floor = cmd.floor ?? cmd.payload?.floor ?? null;
      const floorName = floor?.name?.toString().trim();
      if (!floorName) {
        console.warn('[ha.floor.ensure] missing floor name', { floor });
        return { error: { code: 'bad_payload', message: 'Missing floor.name', details: { floor } } };
      }

      // 1) HA талд давхрыг ensure
      const haFloor = await ensureFloorByName(floorName);
      const fid = (haFloor as any)?.floor_id || (haFloor as any)?.id;
      const floorId = floor?.id ? String(floor.id) : null;

      // 2) Main руу HMAC PATCH { haFloorId }  (Bearer БИШ!)
      if (fid && floorId) {
        try {
          await patchFloorHaIdToMain(floorId, String(fid));
          console.log('[SYNC] Floor haFloorId -> main OK', { floorId, haFloorId: String(fid) });
        } catch (err: any) {
          console.error('[SYNC] PATCH /api/floors/:id/ha failed:',
            err?.response?.status, err?.response?.data || err?.message);
          // PATCH амжилтгүй байсан ч ACK-ээ явуулна, queue-г түгжихгүй
        }
      } else {
        console.warn('[ha.floor.ensure] skip PATCH: missing fid or floorId', { fid, floorId });
      }

      // 3) ACK (хоосон талбаруудыг буцаахгүй)
      return {
        ack: {
          ok: true,
          ...(fid ? { haFloorId: String(fid) } : {}),
          haFloorName: (haFloor as any)?.name ?? floorName,
          floorId,
        },
      };
    }

    case 'ha.area.set_floor': {
      const areaId = cmd.area?.haAreaId || cmd.area?.area_id || cmd.area?.id || cmd.haAreaId;
      const floorHaId = cmd.floor?.haFloorId || cmd.floor?.floor_id || cmd.haFloorId || null;

      if (!areaId) {
        console.warn('[ha.area.set_floor] missing area id in payload');
        return { error: { code: 'bad_payload', message: 'Missing areaId' } };
      }
      await assignAreaToFloor(String(areaId), floorHaId ? String(floorHaId) : null);
      return {
        ack: { ok: true, haAreaId: String(areaId), ...(floorHaId ? { haFloorId: String(floorHaId) } : {}) },
      };
    }

    default: {
      const t = (cmd.type ?? '').toString().trim();
      console.warn('[EXEC] unknown type:', t);
      throw new Error(`unknown_type:${t}`);
    }
  }
}
