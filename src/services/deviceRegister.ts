import axios from 'axios';
import dotenv from 'dotenv';
import { makeSignature } from '../lib/hmac';

dotenv.config();

const MAIN_BASE = (process.env.MAIN_BASE_URL || 'https://api.habea.mn').replace(/\/+$/, '');
const BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : MAIN_BASE + '/api';

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || '';

export async function registerDeviceToMain({
  deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos
}: {
  deviceKey: string; siteId: string; name: string; type: string;
  domain?: string; deviceClass?: string; roomId?: string; floorId?: string; pos?: any;
}) {
  const path = '/devices/register';
  const url = `${BASE}${path}`;
  const signPath = new URL(url).pathname;

  const payload = { householdId: HOUSEHOLD_ID, deviceKey, siteId, name, type, domain, deviceClass, roomId, floorId, pos };

  const ts = Date.now().toString();  // ✅ timestamp үүсгэх
  const { sig, bodyStr } = makeSignature('POST', signPath, ts, payload, process.env.EDGE_SHARED_SECRET!);

  const res = await axios.post(url, bodyStr, {
    headers: {
      'content-type': 'application/json',
      'x-edge-id': process.env.EDGE_ID || 'edge_nas_01',
      'x-timestamp': ts,
      'x-signature': sig,
    },
    timeout: 10_000,
  });

  return res.data?.device;
}
