import { ZodError } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { requestContext, tracing } from '@/modules/observability/context';
import { telemetry } from '@/modules/observability/telemetry';
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
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(tracing.getStore()
        ? {
            'x-correlation-id': tracing.getStore()!.correlationId,
            'x-request-id': tracing.getStore()!.requestId,
          }
        : {}),
    },
  });
}
export async function endpoint(fn: () => Promise<unknown>, request?: Request) {
  const context = requestContext(request);
  return tracing.run(context, async () => {
    const { requestId } = context;
    const started = Date.now();
    let status = 200,
      code: string | undefined;
    try {
      return json({ data: await fn(), requestId });
    } catch (error) {
      if (error instanceof DomainError) {
        status = error.status;
        code = error.code;
        return json(
          { error: { code: error.code, message: error.message }, requestId },
          error.status,
        );
      }
      if (error instanceof ZodError) {
        status = 400;
        code = 'VALIDATION';
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
      }
      status = 500;
      code = 'INTERNAL';
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          code: 'INTERNAL',
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
    } finally {
      const route = request ? new URL(request.url).pathname : 'internal';
      if (!route.startsWith('/api/operations') || status >= 400)
        await telemetry(
          'HTTP_REQUEST',
          {
            method: request?.method ?? 'INTERNAL',
            route: route.replace(/[a-f0-9-]{36}/gi, ':id'),
            httpStatus: status,
            durationMs: Date.now() - started,
            code,
          },
          route.startsWith('/api/bank/') ? 'bank' : 'bnpl',
        );
    }
  });
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
  if (process.env.APP_URL) return process.env.APP_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : 'http://localhost:3000';
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
