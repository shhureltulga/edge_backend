import axios from 'axios';
import { makeSignature } from '../lib/hmac';

const MAIN_BASE_URL = process.env.MAIN_BASE_URL || 'http://localhost:5000';
const EDGE_ID = process.env.EDGE_ID || 'edge_local';
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || '';
const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET || 'dev_secret';

// ⬇️ axios instance
const http = axios.create({
  baseURL: MAIN_BASE_URL.replace(/\/+$/, ''), // trailing slash арилгана
  timeout: 10000,
  headers: { 'content-type': 'application/json' },
});

// ⬇️ request interceptor: signature-аа үргэлж ижил аргаар барина
http.interceptors.request.use((config) => {
  const method = (config.method || 'GET').toUpperCase();

  // URL-ийн зөв path-ыг гаргаж авах (baseURL + url → pathname)
  const full = new URL((config.url || ''), (config.baseURL || 'http://x') + '/');
  const path = full.pathname; // ж: "/edge/heartbeat"

  // Body-г ТОДОРХОЙ JSON string болгоно (axios өөрөө stringify хийдэг ч signature-д бид тогтмол string ашиглана)
  const bodyStr =
    config.data == null
      ? ''
      : typeof config.data === 'string'
      ? config.data
      : JSON.stringify(config.data);

  // ⬇️ TS-ийн нэгж: ихэнх backend секунд хэрэглэдэг. Хэрвээ танай Main миллисекунд хүлээдэг бол tsMs ашиглаад сольж болно.
//   const tsSec = Math.floor(Date.now() / 1000).toString();
const tsMs = Date.now().toString();           // ✅ millis
const sig = makeSignature(method, path, tsMs, bodyStr, EDGE_SHARED_SECRET);
//   const sig = makeSignature(method, path, tsSec, bodyStr, EDGE_SHARED_SECRET);

  // AxiosHeaders ашиглан тавих (типийн алдаанаас сэргийлнэ)
  config.headers.set?.('x-edge-id', EDGE_ID);
  config.headers.set?.('x-household-id', HOUSEHOLD_ID);
  config.headers.set?.('x-timestamp', tsMs);
  config.headers.set?.('x-signature', sig);
  config.headers.set?.('content-type', 'application/json');

  return config;
});

// (сонголт) main-ийн хариуг логлож оношилгоо амар болгоё
http.interceptors.response.use(
  (r) => {
    console.log('MAIN RESP', r.status, r.config.method?.toUpperCase(), r.config.url);
    return r;
  },
  (e) => {
    console.error(
      'MAIN ERR',
      e.response?.status,
      e.config?.method?.toUpperCase(),
      e.config?.url,
      e.response?.data || String(e)
    );
    return Promise.reject(e);
  }
);

export async function pushReadings(batch: Array<{ deviceKey: string; type: string; value: number; ts?: string | Date }>) {
  const payload = {
    householdId: HOUSEHOLD_ID,
    edgeId: EDGE_ID,
    readings: batch.map((r) => ({
      deviceKey: r.deviceKey,
      type: r.type,
      value: Number(r.value),
      ts: r.ts ? new Date(r.ts) : new Date(),
    })),
  };
  await http.post('/edge/ingest', payload);
}

export async function heartbeat(status: 'online' | 'offline' = 'online') {
  await http.post('/edge/heartbeat', { householdId: HOUSEHOLD_ID, edgeId: EDGE_ID, status });
}

export async function fetchCommands(since?: string) {
  const { data } = await http.get('/edge/commands', {
    params: { householdId: HOUSEHOLD_ID, edgeId: EDGE_ID, since },
  });
  return data?.commands ?? [];
}

export async function ackCommand(cmdId: string, ok: boolean, error?: string) {
  await http.post('/edge/commands/ack', {
    householdId: HOUSEHOLD_ID,
    edgeId: EDGE_ID,
    commandId: cmdId,
    status: ok ? 'acked' : 'failed',
    error,
  });
}
