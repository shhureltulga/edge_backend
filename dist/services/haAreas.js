"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAreas = listAreas;
exports.upsertArea = upsertArea;
exports.assignDeviceArea = assignDeviceArea;
// Edge: Area registry helpers
const haWs_1 = require("./haWs");
async function listAreas() {
    const { ws, call } = await (0, haWs_1.connectHA)();
    try {
        const areas = await call({ type: 'config/area_registry/list' });
        return areas;
    }
    finally {
        // intentionally keep open only per call; close to be safe
    }
}
async function upsertArea(areaId, name) {
    const { call } = await (0, haWs_1.connectHA)();
    const areas = await call({ type: 'config/area_registry/list' });
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
async function assignDeviceArea(deviceId, areaId) {
    const { call } = await (0, haWs_1.connectHA)();
    await call({
        type: 'config/device_registry/update',
        device_id: deviceId,
        area_id: areaId,
    });
}
