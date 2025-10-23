// src/services/haDevices.ts
import { connectHA } from './haWs';

/**
 * HA device_registry-г бүрэн авчраад deviceKey-р таних.
 * Бид identifiers доторх хэд хэдэн хэлбэрийг дэмжинэ:
 *  - ["habea", deviceKey]
 *  - { domain: "habea", id: deviceKey }
 *  - "habea:deviceKey"  (зарим интеграц ингэж хадгалсан байж болно)
 *  - эс бол name === deviceKey
 */
function identifiersMatch(identifiers: any, deviceKey: string) {
  if (!identifiers) return false;

  // Array of tuples or mixed
  if (Array.isArray(identifiers)) {
    return identifiers.some((it: any) => {
      if (Array.isArray(it)) {
        // tuple style: ["habea", "lr_temp_1"]
        return it[0] === 'habea' && it[1] === deviceKey;
      }
      if (typeof it === 'string') {
        // string style: "habea:lr_temp_1"
        return it === `habea:${deviceKey}`;
      }
      if (it && typeof it === 'object') {
        // object style: { domain: "habea", id: "lr_temp_1" }
        return it.domain === 'habea' && it.id === deviceKey;
      }
      return false;
    });
  }

  // Object bag style
  if (typeof identifiers === 'object') {
    const maybeTuple = (identifiers as any).values || (identifiers as any).list;
    if (Array.isArray(maybeTuple)) {
      return maybeTuple.some((it: any) => Array.isArray(it) && it[0] === 'habea' && it[1] === deviceKey);
    }
  }

  return false;
}

/**
 * HA-с device_id-г deviceKey-оор олно.
 * Олдохгүй бол undefined буцаана.
 */
export async function findHaDeviceIdByKey(deviceKey: string): Promise<string | undefined> {
  const { call } = await connectHA();
  const devices = await call<any[]>({ type: 'config/device_registry/list' });

  const found = devices.find(d =>
    identifiersMatch(d.identifiers, deviceKey) ||
    d.name === deviceKey // fallback: нэрээр хайх
  );

  return found?.id;
}
