import { ZodError } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function invariant(ok: unknown, code: string, message: string, status = 409): asserts ok {
  if (!ok) throw new DomainError(code, message, status);
}
export function serialize(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}
export function json(value: unknown, status = 200) {
  return new Response(serialize(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
export async function endpoint(fn: () => Promise<unknown>) {
  const requestId = randomUUID();
  try {
    return json({ data: await fn(), requestId });
  } catch (error) {
    if (error instanceof DomainError)
      return json({ error: { code: error.code, message: error.message }, requestId }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error: {
            code: 'VALIDATION',
            message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
          requestId,
        },
        400,
      );
    console.error(
      JSON.stringify({
        level: 'error',
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    return json(
      {
        error: {
          code: 'INTERNAL',
          message:
            'The operation could not be completed. Check the service configuration and retry.',
        },
        requestId,
      },
      500,
    );
  }
}
export function equalSecret(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function serviceAuth(request: Request) {
  const expected = process.env.BANK_SERVICE_SECRET;
  invariant(
    expected && equalSecret(request.headers.get('authorization') ?? '', `Bearer ${expected}`),
    'UNAUTHORIZED',
    'Service authentication required',
    401,
  );
}
export function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
export function sameOrigin(request: Request) {
  invariant(
    request.headers.get('origin') === new URL(appUrl()).origin,
    'CSRF',
    'A same-origin request is required',
    403,
  );
}
export async function readJson(request: Request, maxBytes = 64000): Promise<unknown> {
  const reader = request.body?.getReader();
  invariant(reader, 'INVALID_JSON', 'A JSON request body is required', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new DomainError('PAYLOAD_TOO_LARGE', 'Request exceeds the maximum size', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError('INVALID_JSON', 'Malformed JSON body', 400);
  }
}
