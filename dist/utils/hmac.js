"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signHmacRaw = signHmacRaw;
exports.makeSignature = makeSignature;
exports.createHmacHeaders = createHmacHeaders;
require("dotenv/config");
const crypto_1 = __importDefault(require("crypto"));
const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET;
const DEBUG_HMAC = process.env.DEBUG_HMAC === '0';
function stableQueryString(obj) {
    const keys = Object.keys(obj || {}).sort(); // A→Z
    const qs = new URLSearchParams();
    for (const k of keys) {
        const v = obj[k];
        if (v === undefined || v === null)
            continue;
        qs.append(k, String(v));
    }
    return qs.toString();
}
function signHmacRaw(secret, data) {
    return crypto_1.default.createHmac('sha256', secret).update(data).digest('hex');
}
function makeSignature(method, path, // ж: "/api/devices/register"
timestamp, // ж: Date.now().toString()
body, secret) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    const bodySha = crypto_1.default.createHash('sha256').update(bodyStr).digest('hex');
    const base = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
    const sig = signHmacRaw(secret, base);
    return { sig, base, bodySha, bodyStr };
}
function createHmacHeaders(method, path, _signPayload) {
    const upper = method.toUpperCase();
    // ✅ Server-side: JSON.stringify(req.body || {}) → GET үед '{}' хэшлэнэ
    const raw = upper === 'GET'
        ? '{}' // ← ЭНЭГЭЭР тогтооно
        : (_signPayload === undefined
            ? ''
            : (typeof _signPayload === 'string'
                ? _signPayload
                : JSON.stringify(_signPayload ?? {})));
    const ts = Date.now().toString();
    const bodyHash = crypto_1.default.createHash('sha256').update(raw).digest('hex');
    const base = `${upper}|${path}|${ts}|${bodyHash}`;
    const signature = crypto_1.default.createHmac('sha256', EDGE_SHARED_SECRET).update(base).digest('hex');
    if (DEBUG_HMAC)
        console.log('[HMAC]', { method: upper, path, ts, raw, bodyHash, base, signature });
    return {
        'x-edge-id': process.env.EDGE_ID,
        'x-household-id': process.env.HOUSEHOLD_ID,
        'x-timestamp': ts,
        'x-signature': signature,
        'content-type': 'application/json',
    };
}
