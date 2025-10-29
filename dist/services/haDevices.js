"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findHaDeviceIdByKey = findHaDeviceIdByKey;
// src/services/haDevices.ts
const haWs_1 = require("./haWs");
/**
 * HA device_registry-г бүрэн авчраад deviceKey-р таних.
 * Бид identifiers доторх хэд хэдэн хэлбэрийг дэмжинэ:
 *  - ["habea", deviceKey]
 *  - { domain: "habea", id: deviceKey }
 *  - "habea:deviceKey"  (зарим интеграц ингэж хадгалсан байж болно)
 *  - эс бол name === deviceKey
 */
function identifiersMatch(identifiers, deviceKey) {
    if (!identifiers)
        return false;
    // Array of tuples or mixed
    if (Array.isArray(identifiers)) {
        return identifiers.some((it) => {
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
        const maybeTuple = identifiers.values || identifiers.list;
        if (Array.isArray(maybeTuple)) {
            return maybeTuple.some((it) => Array.isArray(it) && it[0] === 'habea' && it[1] === deviceKey);
        }
    }
    return false;
}
/**
 * HA-с device_id-г deviceKey-оор олно.
 * Олдохгүй бол undefined буцаана.
 */
async function findHaDeviceIdByKey(deviceKey) {
    const { call } = await (0, haWs_1.connectHA)();
    const devices = await call({ type: 'config/device_registry/list' });
    const found = devices.find(d => identifiersMatch(d.identifiers, deviceKey) ||
        d.name === deviceKey // fallback: нэрээр хайх
    );
    return found?.id;
}
