import { assignDeviceArea, upsertArea } from './haAreas';
import axios from 'axios';
import { findHaDeviceIdByKey } from './haDevices';

const MAIN = (process.env.MAIN_BASE_URL || '').replace(/\/+$/,'');
const BASE = MAIN.endsWith('/api') ? MAIN : MAIN + '/api';

export async function mapDeviceToAreaByRoomId(deviceKey: string, householdId: string, roomId: string) {
  // Main-аас room авч code/name-аа тодорхойлно
  const { data } = await axios.get(`${BASE}/rooms/${roomId}`, { timeout: 10000 });
  const room = data.room;
  const areaId = room.code || room.id;
  const areaName = room.name || areaId;

  // Эхлээд area-г upsert
  await upsertArea(areaId, areaName);

  // Дараа нь тухайн HA device_id-г олж area онооно
  // Таны орчинд deviceKey -> haDeviceId map байдаг:
  const haDeviceId = await findHaDeviceIdByKey(deviceKey); // өөрийн lookup
  if (haDeviceId) {
    await assignDeviceArea(haDeviceId, areaId);
  }
}
