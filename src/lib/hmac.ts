import crypto from 'crypto';

export function signHmac(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Бид дараах форматаар гарын үсэг зурна:
 *   method|path|timestamp|bodySha256
 */
export function makeSignature(
  method: string,
  path: string,
  timestamp: string,
  body: unknown,
  secret: string
) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const toSign = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
  return signHmac(secret, toSign);
}
