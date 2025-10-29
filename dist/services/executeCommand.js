"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCommand = executeCommand;
// src/services/executeCommand.ts
const axios_1 = __importDefault(require("axios"));
const ha_1 = require("../utils/ha");
const hmac_1 = require("../utils/hmac");
const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const BUILD_TAG = 'executeCommand-floor-fix @ 2025-10-28';
async function patchFloorHaIdToMain(floorId, haFloorId) {
    const pathForSig = `/api/floors/${floorId}/ha`;
    const body = { haFloorId: String(haFloorId) };
    const headers = {
        ...(0, hmac_1.createHmacHeaders)('PATCH', pathForSig, body),
        'Content-Type': 'application/json',
        'x-edge-id': process.env.EDGE_ID || 'edge_nas_01',
    };
    await axios_1.default.patch(`${MAIN_BASE}${pathForSig}`, body, { headers, timeout: 10000 });
}
async function executeCommand(cmd) {
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
            const haArea = await (0, ha_1.ensureAreaByName)(roomName);
            console.log(`[ha.area.ensure] ${roomName} -> ${haArea.area_id}`);
            return {
                ack: {
                    ok: true,
                    haAreaId: haArea.area_id,
                    haAreaName: haArea.name ?? roomName,
                    roomId: room?.id ?? (cmd.deviceKey?.startsWith('room_') ? cmd.deviceKey.slice(5) : null),
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
            const haFloor = await (0, ha_1.ensureFloorByName)(floorName);
            const fid = haFloor?.floor_id || haFloor?.id;
            const floorId = floor?.id ? String(floor.id) : null;
            // 2) Main руу HMAC PATCH { haFloorId }  (Bearer БИШ!)
            if (fid && floorId) {
                try {
                    await patchFloorHaIdToMain(floorId, String(fid));
                    console.log('[SYNC] Floor haFloorId -> main OK', { floorId, haFloorId: String(fid) });
                }
                catch (err) {
                    console.error('[SYNC] PATCH /api/floors/:id/ha failed:', err?.response?.status, err?.response?.data || err?.message);
                    // PATCH амжилтгүй байсан ч ACK-ээ явуулна, queue-г түгжихгүй
                }
            }
            else {
                console.warn('[ha.floor.ensure] skip PATCH: missing fid or floorId', { fid, floorId });
            }
            // 3) ACK (хоосон талбаруудыг буцаахгүй)
            return {
                ack: {
                    ok: true,
                    ...(fid ? { haFloorId: String(fid) } : {}),
                    haFloorName: haFloor?.name ?? floorName,
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
            await (0, ha_1.assignAreaToFloor)(String(areaId), floorHaId ? String(floorHaId) : null);
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
