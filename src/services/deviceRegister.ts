import axios from 'axios';
import dotenv from 'dotenv';
import { makeSignature } from '../utils/hmac';

dotenv.config();

const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const BASE      = MAIN_BASE.endsWith('/api') ? MAIN_BASE : MAIN_BASE + '/api';

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || '';
const EDGE_ID      = process.env.EDGE_ID || 'edge_device_01';
const SECRET       = process.env.EDGE_SHARED_SECRET || 'change-me';

export async function registerDeviceToMain({
  deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos
}: {
  deviceKey: string; siteId: string; name: string; type: string;
  domain?: string; deviceClass?: string; roomId?: string; floorId?: string; pos?: any;
}) {
  const path     = '/devices/register';
  const url      = `${BASE}${path}`;           // https://.../api/devices/register
  const signPath = new URL(url).pathname;      // /api/devices/register  ← HMAC хэсэгт ХҮРЭХГҮЙ

  const payload = { householdId: HOUSEHOLD_ID, deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos };

  const ts = Date.now().toString();
  const { sig, bodyStr } = makeSignature('POST', signPath, ts, payload, SECRET);

  const res = await axios.post(url, bodyStr, {
    timeout: 10_000,
    // ⬇️ Axios-г дахин stringify хийхээс сэргийлэх
    transformRequest: [(d) => d],
    headers: {
      'content-type'   : 'application/json',
      'x-edge-id'      : EDGE_ID,
      'x-household-id' : HOUSEHOLD_ID,     // ⬅️ заавал хэрэгтэй
      'x-timestamp'    : ts,
      'x-signature'    : sig,
    },
  });

  return res.data?.device;
}
