// src/services/mainClient.ts
import axios from 'axios';
import { createHash, createHmac } from 'crypto';

/**
 * BASE: Main-ын үндсэн URL (ж: https://api.habea.mn)
 * PREFIX: Зөвхөн URL дээр ашиглана (default: /edgehooks) — HMAC-д ОРОХГҮЙ
 */
const BASE   = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const PREFIX = (process.env.EDGEHOOKS_PREFIX || '/edgehooks').replace(/\/+$/, '');

const EDGE_ID       = process.env.EDGE_ID || 'edge_local';
const HOUSEHOLD_ID  = process.env.HOUSEHOLD_ID || '';
const SITE_ID       = process.env.SITE_ID || '';
const SECRET        = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';

const HTTP_TIMEOUT_MS = 10_000;

/* -------------------------- дотоод туслахууд -------------------------- */

function urlFor(path: string) {
  // path ж: '/edge/heartbeat' — prefix зөвхөн URL-д
  return `${BASE}${PREFIX}${path}`;
}

/** server-ын verifyHmac-тэй адил serialize:
 * - string бол тэр чигт нь
 * - бусад үед JSON.stringify(body ?? {})
 */
function serializeBody(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body ?? {});
}

/** HMAC sign format:
 *   METHOD|path|timestamp|sha256(bodyStr)
 *  - path: зөвхөн router path (ж: '/edge/heartbeat'), PREFIX ОРОХГҮЙ
 *  - timestamp: секундээр (string)
 */
function makeSignature(method: string, path: string, body: unknown) {
  const ts = String(Math.floor(Date.now() / 1000));
  const bodyStr = serializeBody(body);
  const bodySha = createHash('sha256').update(bodyStr).digest('hex');
  const base    = `${method.toUpperCase()}|${path}|${ts}|${bodySha}`;
  const sig     = createHmac('sha256', SECRET).update(base).digest('hex');
  return { ts, sig, bodyStr };
}

/** Нэг төрлийн header-уудыг үүсгэнэ */
function signedHeaders(edgeId: string, ts: string, sig: string, contentType?: string) {
  const h: Record<string, string> = {
    'x-edge-id': edgeId,
    'x-timestamp': ts,
    'x-signature': sig,
  };
  if (contentType) h['content-type'] = contentType;
  return h;
}

/* ------------------------------ API-ууд ------------------------------- */

/** ---- Heartbeat ---- */
export async function heartbeat(status: 'online' | 'offline' = 'online') {
  const path = '/edge/heartbeat';
  const url  = urlFor(path);

  const payload = {
    householdId: HOUSEHOLD_ID,
    siteId: SITE_ID,
    edgeId: EDGE_ID,
    status,
  };

  const { ts, sig, bodyStr } = makeSignature('POST', path, payload);

  // Axios-д яг SIGN-д ашигласан bodyStr-ээ шууд дамжуулж илгээнэ
  return axios.post(url, bodyStr, {
    headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
    timeout: HTTP_TIMEOUT_MS,
    // validateStatus: () => true, // Хэрэв 4xx/5xx дээр throw хийхийг хүсэхгүй бол нээ
  });
}

/** ---- Readings ingest ---- */
type Reading = { deviceKey: string; type: string; value: number; ts?: string | Date };

export async function pushReadings(readings: Reading[]) {
  const path = '/edge/ingest';
  const url  = urlFor(path);

  const payload = {
    householdId: HOUSEHOLD_ID,
    siteId: SITE_ID,
    edgeId: EDGE_ID,
    readings,
  };

  const { ts, sig, bodyStr } = makeSignature('POST', path, payload);

  return axios.post(url, bodyStr, {
    headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
    timeout: HTTP_TIMEOUT_MS,
  });
}

/** ---- Commands татах (GET) ---- */
export async function fetchCommands(): Promise<Array<{ id: string; payload: any }>> {
  const path = '/edge/commands';
  const url  = urlFor(path);

  // GET үед body-г {} гэж үзэж sign хийдэг (server талын verifyHmac-тэй таарна)
  const { ts, sig } = makeSignature('GET', path, {});

  const res = await axios.get(url, {
    headers: signedHeaders(EDGE_ID, ts, sig),
    timeout: HTTP_TIMEOUT_MS,
  });

  // 2xx биш үед axios throw хийнэ; шаардвал validateStatus дээр өөрчилж болно
  return res.data?.commands ?? [];
}

/** ---- Commands ACK ---- */
export async function ackCommand(commandId: string, ok: boolean, error?: string) {
  const path = '/edge/commands/ack';
  const url  = urlFor(path);

  const payload = {
    commandId,
    status: ok ? 'acked' : 'failed',
    error: error ?? null,
    edgeId: EDGE_ID,
    householdId: HOUSEHOLD_ID,
    siteId: SITE_ID, // сонголттой; main тал FK шалгалтад ашиглаж болно
  };

  const { ts, sig, bodyStr } = makeSignature('POST', path, payload);

  return axios.post(url, bodyStr, {
    headers: signedHeaders(EDGE_ID, ts, sig, 'application/json'),
    timeout: HTTP_TIMEOUT_MS,
  });
}
