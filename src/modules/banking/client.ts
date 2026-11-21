import { appUrl, DomainError } from '@/lib/http';
export async function bankCall(path: string, body?: unknown, correlationId?: string) {
  const response = await fetch(`${appUrl()}/api/bank/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    headers: {
      authorization: `Bearer ${process.env.BANK_SERVICE_SECRET}`,
      'content-type': 'application/json',
      'x-correlation-id': correlationId ?? crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new DomainError(
      result.error?.code ?? 'BANK_ERROR',
      result.error?.message ?? 'Bank unavailable',
      response.status,
    );
  return result.data;
}
