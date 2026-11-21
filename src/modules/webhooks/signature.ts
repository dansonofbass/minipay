import { createHmac } from 'node:crypto';
import { equalSecret } from '@/lib/http';
export function sign(body: string, timestamp: string, secret: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}
export function verify(
  body: string,
  timestamp: string,
  signature: string,
  secrets: string[],
  now = Date.now(),
) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300000) return false;
  return secrets.some(
    (secret) => secret.length >= 32 && equalSecret(sign(body, timestamp, secret), signature),
  );
}
