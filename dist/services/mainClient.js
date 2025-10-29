"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.heartbeat = heartbeat;
exports.pushReadings = pushReadings;
exports.fetchCommands = fetchCommands;
exports.ackCommand = ackCommand;
// src/services/mainClient.ts
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
/**
 * BASE: Main-ын үндсэн URL (ж: https://api.habea.mn)
 * PREFIX: Зөвхөн URL дээр ашиглана (default: /edgehooks) — HMAC-д ОРОХГҮЙ
 */
const BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const PREFIX = (process.env.EDGEHOOKS_PREFIX || '/edgehooks').replace(/\/+$/, '');
const EDGE_ID = process.env.EDGE_ID || 'edge_local';
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || '';
const SITE_ID = process.env.SITE_ID || '';
const SECRET = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';
const HTTP_TIMEOUT_MS = 10000;
/* -------------------------- дотоод туслахууд -------------------------- */
function urlFor(path) {
    // path ж: '/edge/heartbeat' — prefix зөвхөн URL-д
    return `${BASE}${PREFIX}${path}`;
}
/** server-ын verifyHmac-тэй адил serialize:
 * - string бол тэр чигт нь
 * - бусад үед JSON.stringify(body ?? {})
 */
function serializeBody(body) {
    return typeof body === 'string' ? body : JSON.stringify(body ?? {});
}
/** HMAC sign format:
 *   METHOD|path|timestamp|sha256(bodyStr)
 *  - path: зөвхөн router path (ж: '/edge/heartbeat'), PREFIX ОРОХГҮЙ
 *  - timestamp: секундээр (string)
 */
function makeSignature(method, path, body) {
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyStr = serializeBody(body);
    const bodySha = (0, crypto_1.createHash)('sha256').update(bodyStr).digest('hex');
    const base = `${method.toUpperCase()}|${path}|${ts}|${bodySha}`;
    const sig = (0, crypto_1.createHmac)('sha256', SECRET).update(base).digest('hex');
    return { ts, sig, bodyStr };
}
/** Нэг төрлийн header-уудыг үүсгэнэ */
function signedHeaders(edgeId, ts, sig, contentType) {
    const h = {
        'x-edge-id': edgeId,
        'x-timestamp': ts,
        'x-signature': sig,
    };
    if (contentType)
        h['content-type'] = contentType;
    return h;
}
/* ------------------------------ API-ууд ------------------------------- */
/** ---- Heartbeat ---- */
async function heartbeat(status = 'online') {
    const path = '/edge/heartbeat';
    const url = urlFor(path);
    const payload = {
        householdId: HOUSEHOLD_ID,
        siteId: SITE_ID,
        edgeId: EDGE_ID,
        status,
    };
    const { ts, sig, bodyStr } = makeSignature('POST', path, payload);
    return axios_1.default.post(url, bodyStr, {
        headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
        timeout: HTTP_TIMEOUT_MS,
        // validateStatus: () => true,
    });
}
async function pushReadings(readings) {
    const path = '/edge/ingest';
    const url = urlFor(path);
    const payload = {
        householdId: HOUSEHOLD_ID,
        siteId: SITE_ID,
        edgeId: EDGE_ID,
        readings,
    };
    const { ts, sig, bodyStr } = makeSignature('POST', path, payload);
    return axios_1.default.post(url, bodyStr, {
        headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
        timeout: HTTP_TIMEOUT_MS,
    });
}
/** ---- Commands татах (GET) ---- */
async function fetchCommands() {
    const path = '/edge/commands';
    const url = urlFor(path);
    // GET үед body-г {} гэж үзэж sign хийдэг (server талын verifyHmac-тэй таарна)
    const { ts, sig } = makeSignature('GET', path, {});
    const res = await axios_1.default.get(url, {
        headers: signedHeaders(EDGE_ID, ts, sig),
        timeout: HTTP_TIMEOUT_MS,
    });
    return res.data?.commands ?? [];
}
/* Нэг implementation (хамгийн өргөн signature) */
async function ackCommand(commandId, ok, error, meta) {
    const path = '/edge/commands/ack';
    const url = urlFor(path);
    const payload = {
        commandId,
        status: ok ? 'acked' : 'failed',
        edgeId: EDGE_ID,
        householdId: HOUSEHOLD_ID,
        siteId: SITE_ID,
    };
    // error талбарыг тодорхой утгатай үед л оруулна (HMAC яг энэ payload-аар гарна)
    if (error !== undefined)
        payload.error = error;
    if (meta)
        payload.meta = meta; // ← META-г ACK боди руу шингээв
    const { ts, sig, bodyStr } = makeSignature('POST', path, payload);
    console.log('[ACK -> main] body =', bodyStr);
    await axios_1.default.post(url, bodyStr, {
        headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
        timeout: HTTP_TIMEOUT_MS,
    });
}
