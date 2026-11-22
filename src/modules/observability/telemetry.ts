import { db } from '@/lib/db';
import { safeMetadata, tracing } from './context';
export async function telemetry(
  type: string,
  metadata: Record<string, unknown>,
  domain: 'bnpl' | 'bank' = 'bnpl',
) {
  const context = tracing.getStore();
  try {
    const data = JSON.stringify(safeMetadata(metadata));
    const code =
      typeof metadata.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(metadata.code)
        ? metadata.code
        : null;
    const severity = ['BANK_MISMATCH', 'LEDGER_MISMATCH'].includes(String(metadata.code))
      ? 'CRITICAL'
      : Number(metadata.httpStatus) >= 500
        ? 'ERROR'
        : Number(metadata.httpStatus) >= 400
          ? 'WARN'
          : 'INFO';
    if (domain === 'bank')
      await db('bank')
        .$executeRaw`INSERT INTO bank."TechnicalLog" (type, severity, "correlationId", "requestId", "traceId", code, metadata) VALUES (${type}, ${severity}, ${context?.correlationId ?? 'unscoped'}, ${context?.requestId ?? null}, ${context?.traceId ?? null}, ${code}, ${data}::jsonb)`;
    else
      await db()
        .$executeRaw`INSERT INTO bnpl."TechnicalLog" (type, severity, "correlationId", "requestId", "traceId", code, metadata) VALUES (${type}, ${severity}, ${context?.correlationId ?? 'unscoped'}, ${context?.requestId ?? null}, ${context?.traceId ?? null}, ${code}, ${data}::jsonb)`;
  } catch {
    console.warn(JSON.stringify({ type: 'TELEMETRY_UNAVAILABLE', service: domain }));
  }
}
