import axios from 'axios';
import { upsertArea } from './haAreas';
import { ensureAreaByName, assignDeviceToArea, findHaDeviceIdByKey } from '../utils/ha';

const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/,'');
const BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : MAIN_BASE + '/api';
const EDGE_ID = process.env.EDGE_ID || 'edge_nas_01';
export type MainRoom = {
  id: string;                 // UUID
  code: string;               // 👈 HA-ийн area_id (slug/immutable)
  name: string;
  householdId: string;
  siteId: string;
  floorId?: string | null;
  pos?: any;
};

export async function fetchRooms(siteId: string) {
  // Та өөрийн main API-ийн бодит замаа ашиглана.
  // Доорх хоёр хувилбараас ажилдагаа сонго:
  // 1) /api/sites/:siteId/rooms
  // 2) /api/rooms?siteId=...
  const url = `${BASE}/sites/${siteId}/rooms`;
  const { data } = await axios.get(url, { timeout: 10000 });
  // data.rooms гэж буудаг гэж үзье
  return (data.rooms || []) as MainRoom[];
}

export async function syncRoomsToHA(siteId: string) {
  const rooms = await fetchRooms(siteId);
  for (const r of rooms) {
    const areaId = r.code || r.id;      // code байхгүй бол түр r.id ашиглаж болно
    const name = r.name || r.code || r.id;
    await upsertArea(areaId, name);
  }
  return { count: rooms.length };
}

export async function syncRoomsForSite(siteId: string) {
  // 1) HA area байхгүй rooms-оо авна
  const { data } = await axios.get(`${BASE}/rooms`, { params: { siteId, missingHa: 1 } });
  const rooms: Array<{ id: string; name: string; haAreaId?: string | null }> = data.rooms || [];

  for (const room of rooms) {
    // 2) HA талд area-г нэрээр нь ensure
    const area = await ensureAreaByName(room.name); // { area_id, name, ... }

    // 3) area_id-г main дээр буцааж хадгалах
    await axios.patch(`${BASE}/rooms/${room.id}/ha`, { haAreaId: area.area_id });

    // 4) тухайн room-ийн device-үүдийг area-д оноох (optional боловч ихэвчлэн хэрэгтэй)
    const devRes = await axios.get(`${BASE}/devices`, { params: { roomId: room.id } });
    const devices: Array<{ deviceKey: string }> = devRes.data?.devices || [];
    for (const d of devices) {
      const haDeviceId = await findHaDeviceIdByKey(d.deviceKey, EDGE_ID);
      if (haDeviceId) {
        await assignDeviceToArea(haDeviceId, area.area_id);
      }
    }
  }
}