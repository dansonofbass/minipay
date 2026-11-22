import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type TraceContext = {
  requestId: string;
  correlationId: string;
  traceId: string;
  actorId?: string;
};
export const tracing = new AsyncLocalStorage<TraceContext>();
export function requestContext(request?: Request): TraceContext {
  const safe = (value: string | null | undefined) =>
    value && /^[a-zA-Z0-9:_-]{1,160}$/.test(value) ? value : undefined;
  return {
    requestId: randomUUID(),
    correlationId: safe(request?.headers.get('x-correlation-id')) ?? randomUUID(),
    traceId:
      request?.headers.get('traceparent')?.match(/^00-([a-f0-9]{32})-[a-f0-9]{16}-0[01]$/)?.[1] ??
      randomUUID().replaceAll('-', ''),
  };
}
/** Only allowlisted diagnostic fields enter telemetry. Bodies, headers and arbitrary errors never do. */
export function safeMetadata(input: Record<string, unknown>) {
  const allowed = new Set([
    'code',
    'method',
    'route',
    'httpStatus',
    'durationMs',
    'attempt',
    'scenario',
    'configVersion',
    'latencyMs',
    'committed',
    'status',
    'previousStatus',
    'jobId',
    'paymentId',
    'purchaseId',
    'webhookEventId',
    'bankOperationId',
    'verification',
    'duplicate',
    'retryPolicy',
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        allowed.has(key) &&
        (typeof value === 'number' ||
          typeof value === 'boolean' ||
          (typeof value === 'string' &&
            value.length <= 200 &&
            !/bearer |postgres(?:ql)?:\/\/|password|secret|token=/i.test(value))),
    ),
  );
}

export function redactOperational(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactOperational);
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(password|token|accessToken|refreshToken|idToken|cookie|authorization|signature|secret|hash|leaseToken|payload|email|number)$/i.test(
              key,
            ),
        )
        .map(([key, v]) => [
          key,
          /^(error|lastError|stack)$/i.test(key) && v
            ? 'Diagnostic text withheld; inspect the structured error code'
            : redactOperational(v),
        ]),
    );
  if (typeof value === 'string') {
    let text = value.replace(/postgres(?:ql)?:\/\/[^\s]+|Bearer\s+[^\s]+/gi, '[REDACTED]');
    for (const [key, secret] of Object.entries(process.env))
      if (/SECRET|PASSWORD|DATABASE_URL|TOKEN|API_KEY/.test(key) && secret && secret.length >= 8)
        text = text.split(secret).join('[REDACTED]');
    return text;
  }
  return value;
}
