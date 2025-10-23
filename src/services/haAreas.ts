// Edge: Area registry helpers
import { connectHA } from './haWs';

export async function listAreas() {
  const { ws, call } = await connectHA();
  try {
    const areas = await call<any[]>({ type: 'config/area_registry/list' });
    return areas as Array<{ area_id: string; name: string }>;
  } finally {
    // intentionally keep open only per call; close to be safe
  }
}

export async function upsertArea(areaId: string, name: string) {
  const { call } = await connectHA();
  const areas = await call<any[]>({ type: 'config/area_registry/list' });
  const found = areas.find(a => a.area_id === areaId);
  if (!found) {
    await call({ type: 'config/area_registry/create', name, area_id: areaId });
    return { created: true };
  }
  if (found.name !== name) {
    await call({ type: 'config/area_registry/update', area_id: areaId, name });
    return { updated: true };
  }
  return { noop: true };
}

export async function assignDeviceArea(deviceId: string, areaId: string) {
  const { call } = await connectHA();
  await call({
    type: 'config/device_registry/update',
    device_id: deviceId,
    area_id: areaId,
  });
}
