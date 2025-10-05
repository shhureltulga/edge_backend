// src/lib/hmac.ts (edge_backend)
import crypto from 'node:crypto';

export function signHmacRaw(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Main backend verifyHmac-тэй яг адил логик:
 * - body нь string бол яг тэрээр
 * - эсрэг тохиолдолд JSON.stringify(body ?? {})
 */
export function makeSignature(
  method: string,
  path: string,
  timestamp: string,
  body: unknown,
  secret: string
) {
  const bodyStr =
    typeof body === 'string'
      ? body
      : JSON.stringify(body ?? {}); // GET үед {} гэж үзнэ

  const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const base = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
  const sig = signHmacRaw(secret, base);
  return { sig, base, bodySha, bodyStr };
}


// import crypto from 'crypto';

// export function signHmac(secret: string, data: string) {
//   return crypto.createHmac('sha256', secret).update(data).digest('hex');
// }

// /**
//  * Бид дараах форматаар гарын үсэг зурна:
//  *   method|path|timestamp|bodySha256
//  */
// export function makeSignature(
//   method: string,
//   path: string,
//   timestamp: string,
//   body: unknown,
//   secret: string
// ) {
//   const bodyStr = body ? JSON.stringify(body) : '';
//   const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
//   const toSign = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
//   return signHmac(secret, toSign);
// }
