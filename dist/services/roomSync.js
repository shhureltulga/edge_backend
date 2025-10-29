"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRooms = fetchRooms;
exports.syncRoomsToHA = syncRoomsToHA;
exports.syncRoomsForSite = syncRoomsForSite;
const axios_1 = __importDefault(require("axios"));
const haAreas_1 = require("./haAreas");
const ha_1 = require("../utils/ha");
const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : MAIN_BASE + '/api';
const EDGE_ID = process.env.EDGE_ID || 'edge_nas_01';
async function fetchRooms(siteId) {
    // Та өөрийн main API-ийн бодит замаа ашиглана.
    // Доорх хоёр хувилбараас ажилдагаа сонго:
    // 1) /api/sites/:siteId/rooms
    // 2) /api/rooms?siteId=...
    const url = `${BASE}/sites/${siteId}/rooms`;
    const { data } = await axios_1.default.get(url, { timeout: 10000 });
    // data.rooms гэж буудаг гэж үзье
    return (data.rooms || []);
}
async function syncRoomsToHA(siteId) {
    const rooms = await fetchRooms(siteId);
    for (const r of rooms) {
        const areaId = r.code || r.id; // code байхгүй бол түр r.id ашиглаж болно
        const name = r.name || r.code || r.id;
        await (0, haAreas_1.upsertArea)(areaId, name);
    }
    return { count: rooms.length };
}
async function syncRoomsForSite(siteId) {
    // 1) HA area байхгүй rooms-оо авна
    const { data } = await axios_1.default.get(`${BASE}/rooms`, { params: { siteId, missingHa: 1 } });
    const rooms = data.rooms || [];
    for (const room of rooms) {
        // 2) HA талд area-г нэрээр нь ensure
        const area = await (0, ha_1.ensureAreaByName)(room.name); // { area_id, name, ... }
        // 3) area_id-г main дээр буцааж хадгалах
        await axios_1.default.patch(`${BASE}/rooms/${room.id}/ha`, { haAreaId: area.area_id });
        // 4) тухайн room-ийн device-үүдийг area-д оноох (optional боловч ихэвчлэн хэрэгтэй)
        const devRes = await axios_1.default.get(`${BASE}/devices`, { params: { roomId: room.id } });
        const devices = devRes.data?.devices || [];
        for (const d of devices) {
            const haDeviceId = await (0, ha_1.findHaDeviceIdByKey)(d.deviceKey, EDGE_ID);
            if (haDeviceId) {
                await (0, ha_1.assignDeviceToArea)(haDeviceId, area.area_id);
            }
        }
    }
}
