// src/services/floorSync.ts
import axios from 'axios';
import { ensureFloorByName } from '../utils/ha';
import { createHmacHeaders } from '../utils/hmac'; // poller-т ашигладагтай ижил

// --- BASES ---
const MAIN_BASE = (process.env.MAIN_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const API_BASE = MAIN_BASE.endsWith('/api') ? MAIN_BASE : `${MAIN_BASE}/api`;

// --- Туслах HMAC wrapper-ууд ---
//  pathForSig нь ЯГ ROUTER дээрх literal path байх ёстой: жишээ нь '/api/floors'
async function hmacGet<T>(pathForSig: string, params?: Record<string, any>, timeout = 10000): Promise<T> {
  const url = `${MAIN_BASE}${pathForSig}`;
  const headers = createHmacHeaders('GET', pathForSig, params ?? {});
  const { data } = await axios.get(url, { params, headers, timeout });
  return data as T;
}

async function hmacPatch<T>(pathForSig: string, body: Record<string, any>, timeout = 10000): Promise<T> {
  const url = `${MAIN_BASE}${pathForSig}`;
  const headers = createHmacHeaders('PATCH', pathForSig, body ?? {});
  const { data } = await axios.patch(url, body, { headers, timeout });
  return data as T;
}

// --- Төрлүүд ---
type FloorRow = {
  id: string;
  name: string;
  haFloorId?: string | null;
};

// --- /api/floors?siteId=...&missingHa=1 авч явах ---
export async function fetchFloorsMissingHa(siteId: string) {
  const pathForSig = '/api/floors';
  const params = { siteId, missingHa: 1 };
  const data = await hmacGet<{ floors?: FloorRow[] }>(pathForSig, params);
  return (data.floors || []) as FloorRow[];
}

// --- Гол sync функц: batch байдлаар floors → HA → Main PATCH ---
export async function syncFloorsForSite(siteId: string) {
  const floors = await fetchFloorsMissingHa(siteId);
  console.log(`[floorSync] missingHa=${floors.length} siteId=${siteId}`);

  let ok = 0;
  let fail = 0;

  for (const f of floors) {
    try {
      // 1) HA дээр баталгаажуулна/үүсгэнэ
      const haFloor = await ensureFloorByName(f.name); // { floor_id, name, ... } (utils/ha-ийнх)
      const haFloorId: string | undefined =
        (haFloor as any)?.floor_id ?? (haFloor as any)?.id ?? undefined;

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
    } catch (e: any) {
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
    } catch (e: any) {
      console.error('[floorSync] fatal:', e?.response?.data || e?.message || String(e));
      process.exit(1);
    }
  })();
}
