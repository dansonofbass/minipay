import { z } from 'zod';
import { db, lock, transaction } from '@/lib/db';
import { endpoint, invariant, serviceAuth, readJson } from '@/lib/http';
import { bankAccount, createAccount, operate, operationSchema } from '@/modules/banking/service';
import { simulated } from '@/modules/banking/transport';
import { deliverEvents } from '@/modules/webhooks/bank-outbox';
export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    serviceAuth(request);
    const { path } = await context.params;
    if (path[0] === 'worker-control')
      return transaction('bank', async (tx) => {
        await lock(tx, 'simulator');
        const settings = await tx.simulator.findUnique({ where: { id: 'default' } });
        const phase = new URL(request.url).searchParams.get('phase');
        const expected = phase === 'BEFORE' ? 'WORKER_CRASH_BEFORE' : 'WORKER_CRASH_AFTER';
        if (settings?.nextScenario !== expected) return { interrupt: false };
        await tx.simulator.update({ where: { id: 'default' }, data: { nextScenario: null } });
        return { interrupt: true };
      });
    if (path[0] === 'outbox') return deliverEvents();
    if (path[0] === 'integrity') {
      const accounts = await db('bank').bankAccount.findMany({ include: { reservations: true } });
      const journals = await db('bank').bankJournal.findMany({ include: { entries: true } });
      return {
        reservations: accounts.flatMap((a) => a.reservations),
        payments: await db('bank').bankOperation.findMany({
          where: { kind: 'PAYMENT' },
          select: { id: true, status: true, reservationId: true, amount: true },
        }),
        accounts: accounts.map((a) => ({
          id: a.id,
          used: a.used,
          reserved: a.reserved,
          actualUsed: a.reservations
            .filter((r) => r.status === 'COMMITTED')
            .reduce((n, r) => n + r.outstanding, 0n),
          actualReserved: a.reservations
            .filter((r) => r.status === 'RESERVED')
            .reduce((n, r) => n + r.amount, 0n),
        })),
        unbalanced: journals
          .filter((j) => j.entries.reduce((n, e) => n + e.debit - e.credit, 0n) !== 0n)
          .map((j) => j.id),
      };
    }
    if (path[0] === 'accounts' && path[1])
      return simulated(
        path[1],
        request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
        false,
        () => bankAccount(path[1]),
      );
    if (['operations', 'payments'].includes(path[0]) && path[1])
      return {
        operation: await db('bank').bankOperation.findUnique({
          where: { id: path.slice(1).join('/') },
        }),
      };
    if (path[0] === 'credit' && path[1] === 'reservations' && path[2])
      return { reservation: await db('bank').reservation.findUnique({ where: { id: path[2] } }) };
    invariant(false, 'NOT_FOUND', 'Bank endpoint not found', 404);
  });
}
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    serviceAuth(request);
    const { path } = await context.params;
    if (path[0] === 'accounts') {
      const input = z
        .object({ customerId: z.string().max(160), name: z.string().max(100) })
        .parse(await readJson(request));
      return createAccount(input.customerId, input.name);
    }
    if (
      path[0] === 'credit' &&
      path[1] === 'reservations' &&
      path[2] &&
      ['commit', 'release'].includes(path[3])
    ) {
      const input = z
        .object({ id: z.string().min(1).max(160), amount: z.string().regex(/^\d+$/).optional() })
        .parse(await readJson(request));
      const reservation = await db('bank').reservation.findUnique({ where: { id: path[2] } });
      invariant(reservation, 'NOT_FOUND', 'Reservation not found', 404);
      const committing = path[3] === 'commit';
      if (committing)
        invariant(
          reservation.status === 'RESERVED' ||
            (await db('bank').bankOperation.findUnique({ where: { id: input.id } })),
          'ALREADY_COMMITTED',
          'Commit retry must use the original payment operation ID',
        );
      const operation = operationSchema.parse({
        id: input.id,
        accountId: reservation.accountId,
        kind: committing ? 'PAYMENT' : 'RELEASE',
        amount: committing ? input.amount : reservation.amount.toString(),
        reservationId: reservation.id,
      });
      return simulated(
        operation.id,
        request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
        true,
        (scenario) => operate(operation, scenario),
      );
    }
    if (path[0] === 'payments' || (path[0] === 'credit' && path[1] === 'reservations')) {
      const input = operationSchema.parse(await readJson(request));
      invariant(
        path[0] === 'payments' ? input.kind === 'PAYMENT' : input.kind !== 'PAYMENT',
        'INVALID_OPERATION',
        'Operation does not match endpoint',
        400,
      );
      return simulated(
        input.id,
        request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
        true,
        (scenario) => operate(input, scenario),
      );
    }
    invariant(false, 'NOT_FOUND', 'Bank endpoint not found', 404);
  });
}
