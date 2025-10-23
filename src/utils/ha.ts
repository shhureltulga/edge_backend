// src/utils/ha.ts
import WebSocket from 'ws';

// --- ENV (dotenv/config-ийг entry дээрээ import хийсэн байх) ---
const HA_WS_URL = process.env.HA_WS_URL || 'ws://homeassistant.local:8123/api/websocket';
const HA_TOKEN  = process.env.HA_TOKEN || '';

type HaAuthRequired = { type: 'auth_required' };
type HaAuthOk       = { type: 'auth_ok' };
type HaAuthInvalid  = { type: 'auth_invalid'; message?: string };
type HaResult       = { type: 'result'; id: number; success: boolean; result?: any; error?: { message?: string } };
type HaEvent        = { type: 'event'; id: number; event?: any };
type HaMsg          = HaAuthRequired | HaAuthOk | HaAuthInvalid | HaResult | HaEvent;

export interface HaArea {
  area_id: string;
  name: string;
  [k: string]: unknown;
}

// --- WS singleton ---
let ws: WebSocket | null = null;
let authed = false;
let nextId = 1;
const waiters = new Map<number, (msg: HaMsg) => void>();
let keepAliveTimer: NodeJS.Timeout | null = null;

function clearKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function startKeepAlive() {
  clearKeepAlive();
  // HA supports ping/pong over WS
  keepAliveTimer = setInterval(() => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN && authed) {
        const id = nextId++;
        ws.send(JSON.stringify({ id, type: 'ping' }));
        // no need to wait for pong explicitly
      }
    } catch {}
  }, 20_000);
}

async function connect(): Promise<void> {
  if (!HA_TOKEN) throw new Error('HA_TOKEN is empty');
  return new Promise((resolve, reject) => {
    ws = new WebSocket(HA_WS_URL);
    let settled = false;

    ws.on('open', () => {
      // waiting for auth_required
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as HaMsg;

      if (msg.type === 'auth_required') {
        ws!.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
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
          reject(new Error(`HA auth_invalid: ${(msg as HaAuthInvalid).message || ''}`));
        }
        return;
      }

      // result / event: resolve waiter
      const anyMsg = msg as any;
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
        connect().catch(() => {});
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

async function ensureConnected(): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN || !authed) {
    await connect();
  }
}

async function call<T = any>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
  await ensureConnected();

  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      if (waiters.has(id)) {
        waiters.delete(id);
        timeout = null;
        reject(new Error(`HA call timeout for ${type}`));
      }
    }, timeoutMs);

    waiters.set(id, (msg) => {
      if (timeout) clearTimeout(timeout);
      if (msg.type === 'result' && msg.success === false) {
        return reject(new Error(msg.error?.message || `HA call failed for ${type}`));
      }
      // @ts-ignore
      resolve((msg as any).result ?? (msg as any));
    });

    ws!.send(JSON.stringify({ id, type, ...payload }));
  });
}

/* --------------------- Areas API wrappers --------------------- */
export const listAreas = async (): Promise<HaArea[]> =>
  call<HaArea[]>('config/area_registry/list');

export const createArea = async (name: string): Promise<HaArea> =>
  call<HaArea>('config/area_registry/create', { name });

export const updateArea = async (area_id: string, name: string): Promise<HaArea> =>
  call<HaArea>('config/area_registry/update', { area_id, name });

export const deleteArea = async (area_id: string): Promise<boolean> =>
  call<boolean>('config/area_registry/delete', { area_id });

export async function findAreaByName(name: string): Promise<HaArea | null> {
  const areas = await listAreas();
  return areas.find((a) => a.name === name) || null;
}

export async function ensureAreaByName(name: string): Promise<HaArea> {
  const found = await findAreaByName(name);
  return found ?? (await createArea(name));
}

/* --------------------- Devices API wrappers --------------------- */

// Home Assistant device registry-н бичлэгийн хамгийн хэрэгтэй талбарууд
export interface HaDevice {
  id: string;
  name_by_user?: string | null;
  area_id?: string | null;
  identifiers: Array<[string, string]>; // ж: [['habea', 'edge_nas_01:lr_temp_1']]
  [k: string]: unknown;
}

// Бүх device-үүдийг татна
export const listDevices = async (): Promise<HaDevice[]> =>
  call<HaDevice[]>('config/device_registry/list');

// Тухайн төхөөрөмжийг area-д оноох (area_id=null хийвэл area-гаас салгана)
export const assignDeviceToArea = async (device_id: string, area_id: string | null) =>
  call('config/device_registry/update', { device_id, area_id });

// Төхөөрөмжийг identifiers-ээр нь хайх.
// Бид 2 хэлбэрийг шалгана:
//   1) ['habea', deviceKey]
//   2) ['habea', `${edgeId}:${deviceKey}`]   // хэрэв edgeId-г identifiers-д хавсаргадаг бол
export async function findHaDeviceIdByKey(deviceKey: string, edgeId?: string): Promise<string | null> {
  const devices = await listDevices();
  for (const d of devices) {
    if (!Array.isArray(d.identifiers)) continue;
    const hasSimple = d.identifiers.some(([dom, id]) => dom === 'habea' && id === deviceKey);
    const hasWithEdge = edgeId
      ? d.identifiers.some(([dom, id]) => dom === 'habea' && id === `${edgeId}:${deviceKey}`)
      : false;

    if (hasSimple || hasWithEdge) return d.id;
  }
  return null;
}
