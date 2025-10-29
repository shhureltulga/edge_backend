import 'dotenv/config';
import crypto from 'crypto';

const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET!;
const DEBUG_HMAC = process.env.DEBUG_HMAC === '0';

function stableQueryString(obj: Record<string, any>): string {
  const keys = Object.keys(obj || {}).sort();          // A→Z
  const qs = new URLSearchParams();
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  return qs.toString();
}

export function signHmacRaw(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
export function makeSignature(
  method: string,
  path: string,          // ж: "/api/devices/register"
  timestamp: string,     // ж: Date.now().toString()
  body: unknown,
  secret: string
) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const base    = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
  const sig     = signHmacRaw(secret, base);
  return { sig, base, bodySha, bodyStr };
}

export function createHmacHeaders(method: string, path: string, _signPayload?: any) {
  const upper = method.toUpperCase();

  // ✅ Server-side: JSON.stringify(req.body || {}) → GET үед '{}' хэшлэнэ
  const raw =
    upper === 'GET'
      ? '{}'                                           // ← ЭНЭГЭЭР тогтооно
      : (_signPayload === undefined
          ? ''
          : (typeof _signPayload === 'string'
              ? _signPayload
              : JSON.stringify(_signPayload ?? {})));

  const ts = Date.now().toString();
  const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');
  const base = `${upper}|${path}|${ts}|${bodyHash}`;
  const signature = crypto.createHmac('sha256', EDGE_SHARED_SECRET!).update(base).digest('hex');

  if (DEBUG_HMAC) console.log('[HMAC]', { method: upper, path, ts, raw, bodyHash, base, signature });
  console.log('[EDGE HMAC] method=', upper);
  console.log('[EDGE HMAC] path  =', path);
  console.log('[EDGE HMAC] ts    =', ts);
  console.log('[EDGE HMAC] body  =', raw);        // ← одоо raw JSON
  console.log('[EDGE HMAC] bodySha=', bodyHash);  // ← жинхэнэ sha256
  console.log('[EDGE HMAC] base  =', base);
  console.log('[EDGE HMAC] sig   =', signature);
  return {
    'x-edge-id': process.env.EDGE_ID!,
    'x-household-id': process.env.HOUSEHOLD_ID!,
    'x-timestamp': ts,
    'x-signature': signature,
    'content-type': 'application/json',
  };
}