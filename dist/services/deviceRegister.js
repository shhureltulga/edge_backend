"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDeviceToMain = registerDeviceToMain;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const hmac_1 = require("../utils/hmac");
dotenv_1.default.config();
const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : MAIN_BASE + '/api';
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || '';
const EDGE_ID = process.env.EDGE_ID || 'edge_device_01';
const SECRET = process.env.EDGE_SHARED_SECRET || 'change-me';
async function registerDeviceToMain({ deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos }) {
    const path = '/devices/register';
    const url = `${BASE}${path}`; // https://.../api/devices/register
    const signPath = new URL(url).pathname; // /api/devices/register  ← HMAC хэсэгт ХҮРЭХГҮЙ
    const payload = { householdId: HOUSEHOLD_ID, deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos };
    const ts = Date.now().toString();
    const { sig, bodyStr } = (0, hmac_1.makeSignature)('POST', signPath, ts, payload, SECRET);
    const res = await axios_1.default.post(url, bodyStr, {
        timeout: 10000,
        // ⬇️ Axios-г дахин stringify хийхээс сэргийлэх
        transformRequest: [(d) => d],
        headers: {
            'content-type': 'application/json',
            'x-edge-id': EDGE_ID,
            'x-household-id': HOUSEHOLD_ID, // ⬅️ заавал хэрэгтэй
            'x-timestamp': ts,
            'x-signature': sig,
        },
    });
    return res.data?.device;
}
