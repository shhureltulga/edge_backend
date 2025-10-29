"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFloorsMissingHa = fetchFloorsMissingHa;
exports.syncFloorsForSite = syncFloorsForSite;
// src/services/floorSync.ts
const axios_1 = __importDefault(require("axios"));
const ha_1 = require("../utils/ha");
const hmac_1 = require("../utils/hmac"); // poller-т ашигладагтай ижил
// --- BASES ---
const MAIN_BASE = (process.env.MAIN_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const API_BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : `${MAIN_BASE}/api`;
// --- Туслах HMAC wrapper-ууд ---
//  pathForSig нь ЯГ ROUTER дээрх literal path байх ёстой: жишээ нь '/api/floors'
async function hmacGet(pathForSig, params, timeout = 10000) {
    const url = `${MAIN_BASE}${pathForSig}`;
    const headers = (0, hmac_1.createHmacHeaders)('GET', pathForSig, params ?? {});
    const { data } = await axios_1.default.get(url, { params, headers, timeout });
    return data;
}
async function hmacPatch(pathForSig, body, timeout = 10000) {
    const url = `${MAIN_BASE}${pathForSig}`;
    const headers = (0, hmac_1.createHmacHeaders)('PATCH', pathForSig, body ?? {});
    const { data } = await axios_1.default.patch(url, body, { headers, timeout });
    return data;
}
// --- /api/floors?siteId=...&missingHa=1 авч явах ---
async function fetchFloorsMissingHa(siteId) {
    const pathForSig = '/api/floors';
    const params = { siteId, missingHa: 1 };
    const data = await hmacGet(pathForSig, params);
    return (data.floors || []);
}
// --- Гол sync функц: batch байдлаар floors → HA → Main PATCH ---
async function syncFloorsForSite(siteId) {
    const floors = await fetchFloorsMissingHa(siteId);
    console.log(`[floorSync] missingHa=${floors.length} siteId=${siteId}`);
    let ok = 0;
    let fail = 0;
    for (const f of floors) {
        try {
            // 1) HA дээр баталгаажуулна/үүсгэнэ
            const haFloor = await (0, ha_1.ensureFloorByName)(f.name); // { floor_id, name, ... } (utils/ha-ийнх)
            const haFloorId = haFloor?.floor_id ?? haFloor?.id ?? undefined;
            if (!haFloorId) {
                console.warn('[floorSync] ensureFloorByName returned no floor_id', { floor: f });
                fail++;
                continue;
            }
            // 2) Main дээр PATCH: /api/floors/:id/ha  (HMAC body яг таарах хэрэгтэй)
            const pathForSig = `/api/floors/${f.id}/ha`;
            await hmacPatch(pathForSig, { haFloorId, siteId });
            console.log('[floorSync] PATCH ok', { floorId: f.id, haFloorId });
            ok++;
        }
        catch (e) {
            const msg = e?.response?.data || e?.message || String(e);
            console.error('[floorSync] floor failed', { id: f.id, name: f.name, err: msg });
            fail++;
        }
    }
    const result = { ok, fail, total: floors.length };
    console.log('[floorSync] done', result);
    return result;
}
// --- CLI байдлаар ганцаараа ажиллуулахад хэрэгтэй жижиг main guard ---
if (require.main === module) {
    (async () => {
        try {
            const siteId = process.env.SITE_ID || '';
            if (!siteId) {
                console.error('SITE_ID env хоосон байна. Жишээ: SITE_ID=73f... node dist/services/floorSync.js');
                process.exit(2);
            }
            const res = await syncFloorsForSite(siteId);
            console.log('[floorSync] result:', res);
            process.exit(res.fail > 0 ? 1 : 0);
        }
        catch (e) {
            console.error('[floorSync] fatal:', e?.response?.data || e?.message || String(e));
            process.exit(1);
        }
    })();
}
