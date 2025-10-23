"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendHeartbeat = sendHeartbeat;
const axios_1 = __importDefault(require("axios"));
const hmac_1 = require("../utils/hmac");
async function sendHeartbeat() {
    const baseUrl = process.env.MAIN_BASE_URL?.replace(/\/$/, '');
    if (!baseUrl)
        throw new Error('MAIN_BASE_URL missing');
    const EDGE_ID = process.env.EDGE_ID;
    const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID;
    const SITE_ID = process.env.SITE_ID; // 👈 шинэ
    const pathForSig = '/edge/heartbeat';
    const url = `${baseUrl}/edgehooks${pathForSig}`;
    const body = {
        edgeId: EDGE_ID,
        householdId: HOUSEHOLD_ID,
        siteId: SITE_ID, // 👈 шинэ (server заавал нэхэж байна)
        status: 'online',
        ts: new Date().toISOString(),
    };
    const headers = (0, hmac_1.createHmacHeaders)('POST', pathForSig, body);
    try {
        const r = await axios_1.default.post(url, body, { headers, timeout: 10000 });
        console.log('[heartbeat]', r.data);
    }
    catch (e) {
        console.error('[heartbeat error]', e.response?.data || e.message);
    }
}
// runner
if (require.main === module) {
    console.log('[heartbeat] sending…');
    sendHeartbeat().catch(err => {
        console.error('[heartbeat error]', err?.response?.data || err?.message || err);
        process.exit(1);
    });
}
