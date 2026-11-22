import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { telemetry } from '@/modules/observability/telemetry';
import { tracing } from '@/modules/observability/context';

const clients = globalThis as unknown as { bnpl?: PrismaClient; bank?: PrismaClient };
export function db(domain: 'bnpl' | 'bank' = 'bnpl') {
  const key = domain === 'bank' ? 'BANK_DATABASE_URL' : 'DATABASE_URL';
  if (!process.env[key]) throw new Error(`${key} is not configured`);
  return (clients[domain] ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env[key]!, max: 12, options: '-c timezone=UTC' }),
  }));
}
export type Tx = Prisma.TransactionClient;
export async function transaction<T>(
  domain: 'bank' | 'bnpl',
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db(domain).$transaction(
        async (tx) => {
          const context = tracing.getStore();
          if (context)
            await tx.$executeRaw`SELECT set_config('crediflow.correlation', ${context.correlationId}, true), set_config('crediflow.request', ${context.requestId}, true), set_config('crediflow.trace', ${context.traceId}, true), set_config('crediflow.actor', ${context.actorId ?? ''}, true)`;
          return fn(tx);
        },
        { maxWait: 30000, timeout: 30000 },
      );
    } catch (error) {
      if (
        attempt < 5 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        continue;
      await telemetry(
        'DATABASE_TRANSACTION_ROLLED_BACK',
        {
          code:
            error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : 'TRANSACTION_ABORTED',
          httpStatus: error instanceof Prisma.PrismaClientKnownRequestError ? 500 : 409,
        },
        domain,
      );
      throw error;
    }
  }
}
export async function lock(tx: Tx, scope: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
}
