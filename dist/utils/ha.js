"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignDeviceToArea = exports.listDevices = exports.deleteFloor = exports.updateFloor = exports.createFloor = exports.listFloors = exports.deleteArea = exports.updateArea = exports.createArea = exports.listAreas = void 0;
exports.findAreaByName = findAreaByName;
exports.ensureAreaByName = ensureAreaByName;
exports.findFloorByName = findFloorByName;
exports.ensureFloorByName = ensureFloorByName;
exports.assignAreaToFloor = assignAreaToFloor;
exports.findHaDeviceIdByKey = findHaDeviceIdByKey;
// src/utils/ha.ts
const ws_1 = __importDefault(require("ws"));
// --- ENV (dotenv/config-ийг entry дээрээ import хийсэн байх) ---
const HA_WS_URL = process.env.HA_WS_URL || 'ws://homeassistant.local:8123/api/websocket';
const HA_TOKEN = process.env.HA_TOKEN || '';
// --- WS singleton ---
let ws = null;
let authed = false;
let nextId = 1;
const waiters = new Map();
let keepAliveTimer = null;
function clearKeepAlive() {
    if (keepAliveTimer)
        clearInterval(keepAliveTimer);
    keepAliveTimer = null;
}
function startKeepAlive() {
    clearKeepAlive();
    // HA supports ping/pong over WS
    keepAliveTimer = setInterval(() => {
        try {
            if (ws && ws.readyState === ws_1.default.OPEN && authed) {
                const id = nextId++;
                ws.send(JSON.stringify({ id, type: 'ping' }));
                // no need to wait for pong explicitly
            }
        }
        catch { }
    }, 20000);
}
async function connect() {
    if (!HA_TOKEN)
        throw new Error('HA_TOKEN is empty');
    return new Promise((resolve, reject) => {
        ws = new ws_1.default(HA_WS_URL);
        let settled = false;
        ws.on('open', () => {
            // waiting for auth_required
        });
        ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'auth_required') {
                ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
                return;
            }
            if (msg.type === 'auth_ok') {
                authed = true;
                startKeepAlive();
                if (!settled) {
                    settled = true;
                    resolve();
                }
                return;
            }
            if (msg.type === 'auth_invalid') {
                authed = false;
                if (!settled) {
                    settled = true;
                    reject(new Error(`HA auth_invalid: ${msg.message || ''}`));
                }
                return;
            }
            // result / event: resolve waiter
            const anyMsg = msg;
            if (typeof anyMsg.id === 'number') {
                const waiter = waiters.get(anyMsg.id);
                if (waiter) {
                    waiters.delete(anyMsg.id);
                    waiter(msg);
                }
            }
        });
        ws.on('close', () => {
            authed = false;
            clearKeepAlive();
            // retry connection in background
            setTimeout(() => {
                connect().catch(() => { });
            }, 1500);
        });
        ws.on('error', (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        });
    });
}
async function ensureConnected() {
    if (!ws || ws.readyState !== ws_1.default.OPEN || !authed) {
        await connect();
    }
}
async function call(type, payload = {}, timeoutMs = 10000) {
    await ensureConnected();
    return new Promise((resolve, reject) => {
        const id = nextId++;
        let timeout = setTimeout(() => {
            if (waiters.has(id)) {
                waiters.delete(id);
                timeout = null;
                reject(new Error(`HA call timeout for ${type}`));
            }
        }, timeoutMs);
        waiters.set(id, (msg) => {
            if (timeout)
                clearTimeout(timeout);
            if (msg.type === 'result' && msg.success === false) {
                return reject(new Error(msg.error?.message || `HA call failed for ${type}`));
            }
            // @ts-ignore
            resolve(msg.result ?? msg);
        });
        ws.send(JSON.stringify({ id, type, ...payload }));
    });
}
/* --------------------- Areas API wrappers --------------------- */
const listAreas = async () => call('config/area_registry/list');
exports.listAreas = listAreas;
const createArea = async (name) => call('config/area_registry/create', { name });
exports.createArea = createArea;
const updateArea = async (area_id, name) => call('config/area_registry/update', { area_id, name });
exports.updateArea = updateArea;
const deleteArea = async (area_id) => call('config/area_registry/delete', { area_id });
exports.deleteArea = deleteArea;
async function findAreaByName(name) {
    const areas = await (0, exports.listAreas)();
    return areas.find((a) => a.name === name) || null;
}
async function ensureAreaByName(name) {
    const found = await findAreaByName(name);
    return found ?? (await (0, exports.createArea)(name));
}
/* --------------------- Floors API wrappers --------------------- */
const listFloors = async () => call('config/floor_registry/list');
exports.listFloors = listFloors;
const createFloor = async (name) => call('config/floor_registry/create', { name });
exports.createFloor = createFloor;
const updateFloor = async (floor_id, patch) => call('config/floor_registry/update', { floor_id, ...patch });
exports.updateFloor = updateFloor;
const deleteFloor = async (floor_id) => call('config/floor_registry/delete', { floor_id });
exports.deleteFloor = deleteFloor;
async function findFloorByName(name) {
    const floors = await (0, exports.listFloors)();
    const key = name.trim().toLowerCase();
    return floors.find(f => (f.name || '').toString().trim().toLowerCase() === key) || null;
}
async function ensureFloorByName(name) {
    const found = await findFloorByName(name);
    return found ?? (await (0, exports.createFloor)(name));
}
// ⬇️ Area-г давхарт оноох (optional)
async function assignAreaToFloor(area_id, floor_id) {
    // floor_id=null → салгах
    return (0, exports.updateArea)(area_id, floor_id ? { floor_id } : { floor_id: null });
}
// Бүх device-үүдийг татна
const listDevices = async () => call('config/device_registry/list');
exports.listDevices = listDevices;
// Тухайн төхөөрөмжийг area-д оноох (area_id=null хийвэл area-гаас салгана)
const assignDeviceToArea = async (device_id, area_id) => call('config/device_registry/update', { device_id, area_id });
exports.assignDeviceToArea = assignDeviceToArea;
// Төхөөрөмжийг identifiers-ээр нь хайх.
// Бид 2 хэлбэрийг шалгана:
//   1) ['habea', deviceKey]
//   2) ['habea', `${edgeId}:${deviceKey}`]   // хэрэв edgeId-г identifiers-д хавсаргадаг бол
async function findHaDeviceIdByKey(deviceKey, edgeId) {
    const devices = await (0, exports.listDevices)();
    for (const d of devices) {
        if (!Array.isArray(d.identifiers))
            continue;
        const hasSimple = d.identifiers.some(([dom, id]) => dom === 'habea' && id === deviceKey);
        const hasWithEdge = edgeId
            ? d.identifiers.some(([dom, id]) => dom === 'habea' && id === `${edgeId}:${deviceKey}`)
            : false;
        if (hasSimple || hasWithEdge)
            return d.id;
    }
    return null;
}
