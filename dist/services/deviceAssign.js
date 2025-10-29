"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapDeviceToAreaByRoomId = mapDeviceToAreaByRoomId;
const haAreas_1 = require("./haAreas");
const axios_1 = __importDefault(require("axios"));
const haDevices_1 = require("./haDevices");
const MAIN = (process.env.MAIN_BASE_URL || '').replace(/\/+$/, '');
const BASE = MAIN.endsWith('/api') ? MAIN : MAIN + '/api';
async function mapDeviceToAreaByRoomId(deviceKey, householdId, roomId) {
    // Main-аас room авч code/name-аа тодорхойлно
    const { data } = await axios_1.default.get(`${BASE}/rooms/${roomId}`, { timeout: 10000 });
    const room = data.room;
    const areaId = room.code || room.id;
    const areaName = room.name || areaId;
    // Эхлээд area-г upsert
    await (0, haAreas_1.upsertArea)(areaId, areaName);
    // Дараа нь тухайн HA device_id-г олж area онооно
    // Таны орчинд deviceKey -> haDeviceId map байдаг:
    const haDeviceId = await (0, haDevices_1.findHaDeviceIdByKey)(deviceKey); // өөрийн lookup
    if (haDeviceId) {
        await (0, haAreas_1.assignDeviceArea)(haDeviceId, areaId);
    }
}
