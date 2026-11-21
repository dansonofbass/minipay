import { randomUUID } from 'node:crypto';
import { db, lock, transaction, type Tx } from '@/lib/db';
import { invariant } from '@/lib/http';
import { fingerprint } from '@/lib/hash';
import { post } from '@/modules/ledger/post';
import { defaults, simulatorSchema } from './simulator';
import { z } from 'zod';

export const amountSchema = z
  .string()
  .regex(/^[0-9]{1,13}$/)
  .transform(BigInt)
  .refine((n) => n > 0n && n <= 1_000_000_000_000n, 'Invalid monetary amount');
export const operationSchema = z.object({
  id: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  kind: z.enum(['RESERVE', 'PAYMENT', 'RELEASE']),
  amount: amountSchema,
  purchaseId: z.string().max(160).optional(),
  reservationId: z.string().max(160).optional(),
});
export type OperationInput = z.infer<typeof operationSchema>;
export async function bankAccount(id: string) {
  const account = await db('bank').bankAccount.findUnique({ where: { id } });
  invariant(account, 'NOT_FOUND', 'Bank account does not exist', 404);
  return {
    ...account,
    availableCredit: account.creditLimit - account.used - account.reserved,
    observedAt: new Date(),
  };
}
async function event(
  tx: Tx,
  operation: {
    id: string;
    kind: string;
    status: string;
    accountId: string;
    amount: bigint;
    version: number;
    reason: string | null;
  },
  scenario: string,
) {
  const settings = await tx.simulator.findUnique({ where: { id: 'default' } });
  const config = simulatorSchema.parse(settings?.config ?? defaults);
  const type =
    operation.kind === 'PAYMENT'
      ? `payment.${operation.status === 'SUCCEEDED' ? 'succeeded' : 'failed'}`
      : `credit.${operation.kind === 'RESERVE' ? (operation.status === 'SUCCEEDED' ? 'reserved' : 'reservation_failed') : 'released'}`;
  const id = randomUUID();
  const payload = {
    eventId: id,
    type,
    schemaVersion: 1,
    operationId: operation.id,
    accountId: operation.accountId,
    amount: operation.amount.toString(),
    currency: 'AMD',
    status: operation.status,
    version: operation.version,
    reason: operation.reason,
    timestamp: new Date().toISOString(),
    scenario,
  };
  await tx.bankEvent.create({
    data: {
      id,
      operationId: operation.id,
      type,
      payload,
      availableAt: new Date(
        Date.now() + (scenario === 'DELAYED_WEBHOOK' ? 60000 : config.webhookDelayMs),
      ),
    },
  });
  if (
    scenario === 'OUT_OF_ORDER' &&
    operation.kind === 'PAYMENT' &&
    operation.status === 'SUCCEEDED'
  ) {
    const oldId = randomUUID();
    await tx.bankEvent.create({
      data: {
        id: oldId,
        operationId: operation.id,
        type: 'payment.pending',
        payload: {
          ...payload,
          eventId: oldId,
          type: 'payment.pending',
          status: 'PENDING',
          version: 1,
          timestamp: new Date(Date.now() - 1000).toISOString(),
        },
        availableAt: new Date(Date.now() + config.webhookDelayMs + 5000),
      },
    });
  }
}
export async function operate(input: OperationInput, scenario = 'HEALTHY') {
  return transaction('bank', async (tx) => {
    await lock(tx, `operation:${input.id}`);
    const hash = fingerprint(input);
    const existing = await tx.bankOperation.findUnique({ where: { id: input.id } });
    if (existing) {
      invariant(
        existing.hash === hash,
        'IDEMPOTENCY_CONFLICT',
        'Operation ID was used with different parameters',
      );
      return existing;
    }
    await lock(tx, `account:${input.accountId}`);
    const account = await tx.bankAccount.findUnique({ where: { id: input.accountId } });
    invariant(account, 'NOT_FOUND', 'Bank account does not exist', 404);
    let reason: string | null = null;
    if (input.kind !== 'RELEASE' && (account.status !== 'ACTIVE' || scenario === 'FROZEN'))
      reason = 'ACCOUNT_FROZEN';
    if (scenario === 'DECLINED') reason = 'SIMULATED_DECLINE';
    const reservation = input.reservationId
      ? await tx.reservation.findUnique({ where: { id: input.reservationId } })
      : null;
    if (!reason && input.kind === 'RESERVE') {
      invariant(input.purchaseId, 'INVALID_REQUEST', 'Purchase reference is required', 400);
      if (
        account.creditLimit - account.used - account.reserved < input.amount ||
        scenario === 'INSUFFICIENT_CREDIT'
      )
        reason = 'INSUFFICIENT_CREDIT';
      else {
        await tx.reservation.create({
          data: {
            id: input.id,
            accountId: account.id,
            purchaseId: input.purchaseId,
            amount: input.amount,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { reserved: { increment: input.amount } },
        });
      }
    }
    if (!reason && input.kind === 'PAYMENT') {
      invariant(
        reservation && reservation.accountId === account.id,
        'INVALID_RESERVATION',
        'A matching credit reservation is required',
      );
      if (account.cash < input.amount || scenario === 'INSUFFICIENT_FUNDS')
        reason = 'INSUFFICIENT_FUNDS';
      else if (!['RESERVED', 'COMMITTED'].includes(reservation.status))
        reason = 'RESERVATION_CLOSED';
      else if (reservation.status === 'RESERVED' && reservation.expiresAt.getTime() <= Date.now())
        reason = 'RESERVATION_EXPIRED';
      else {
        invariant(
          input.amount <=
            (reservation.status === 'RESERVED' ? reservation.amount : reservation.outstanding),
          'EXCESS_REPAYMENT',
          'Payment exceeds outstanding principal',
        );
        const initial = reservation.status === 'RESERVED';
        await tx.bankAccount.update({
          where: { id: account.id },
          data: {
            cash: { decrement: input.amount },
            reserved: initial ? { decrement: reservation.amount } : undefined,
            used: initial
              ? { increment: reservation.amount - input.amount }
              : { decrement: input.amount },
          },
        });
        await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            status: 'COMMITTED',
            outstanding: initial
              ? reservation.amount - input.amount
              : reservation.outstanding - input.amount,
          },
        });
        if (initial)
          await post(
            tx,
            'bank',
            `originate:${reservation.id}`,
            'FINANCING',
            reservation.purchaseId,
            'LOAN_RECEIVABLE',
            'PROVIDER_FUNDING',
            reservation.amount,
          );
        await post(
          tx,
          'bank',
          `cash:${input.id}`,
          'CASH_COLLECTION',
          input.id,
          `CUSTOMER_DEPOSITS:${account.id}`,
          'BNPL_CLEARING',
          input.amount,
        );
        await post(
          tx,
          'bank',
          `principal:${input.id}`,
          'PRINCIPAL_REPAYMENT',
          input.id,
          'BNPL_CLEARING',
          'LOAN_RECEIVABLE',
          input.amount,
        );
      }
    }
    if (!reason && input.kind === 'RELEASE') {
      invariant(
        reservation && reservation.accountId === account.id,
        'INVALID_RESERVATION',
        'Reservation not found',
      );
      invariant(
        input.amount === reservation.amount,
        'INVALID_AMOUNT',
        'Release must match reservation',
      );
      if (reservation.status === 'RESERVED') {
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { reserved: { decrement: reservation.amount } },
        });
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
      } else
        invariant(
          reservation.status === 'RELEASED',
          'ALREADY_COMMITTED',
          'Committed financing cannot be released',
        );
    }
    const operation = await tx.bankOperation.create({
      data: {
        id: input.id,
        accountId: account.id,
        kind: input.kind,
        hash,
        amount: input.amount,
        reservationId: input.reservationId ?? (input.kind === 'RESERVE' ? input.id : undefined),
        status: reason ? 'DECLINED' : 'SUCCEEDED',
        version: scenario === 'OUT_OF_ORDER' ? 2 : 1,
        reason,
      },
    });
    await event(tx, operation, scenario);
    return operation;
  });
}

export const adjustmentSchema = z.object({
  id: z.string().min(1).max(160),
  accountId: z.string(),
  cash: z
    .string()
    .regex(/^\d{1,13}$/)
    .transform(BigInt),
  creditLimit: z
    .string()
    .regex(/^\d{1,13}$/)
    .transform(BigInt),
  status: z.enum(['ACTIVE', 'FROZEN']),
  reason: z.string().min(4).max(300),
});
export async function adjustAccount(raw: unknown, actor: string) {
  const input = adjustmentSchema.parse(raw);
  return transaction('bank', async (tx) => {
    await lock(tx, `adjust:${input.id}`);
    const prior = await tx.bankOperation.findUnique({ where: { id: input.id } });
    const hash = fingerprint({ ...input, actor });
    if (prior) {
      invariant(prior.hash === hash, 'IDEMPOTENCY_CONFLICT', 'Adjustment reference conflict');
      return prior;
    }
    await lock(tx, `account:${input.accountId}`);
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.accountId } });
    invariant(
      input.creditLimit >= account.used + account.reserved,
      'CREDIT_IN_USE',
      'Credit limit cannot fall below used plus reserved credit',
    );
    const delta = input.cash - account.cash;
    if (delta !== 0n)
      await post(
        tx,
        'bank',
        `adjust:${input.id}`,
        'CASH_ADJUSTMENT',
        input.id,
        delta > 0n ? 'SIMULATED_TREASURY' : `CUSTOMER_DEPOSITS:${account.id}`,
        delta > 0n ? `CUSTOMER_DEPOSITS:${account.id}` : 'SIMULATED_TREASURY',
        delta > 0n ? delta : -delta,
      );
    await tx.bankAccount.update({
      where: { id: account.id },
      data: { cash: input.cash, creditLimit: input.creditLimit, status: input.status },
    });
    return tx.bankOperation.create({
      data: {
        id: input.id,
        accountId: account.id,
        kind: 'ADJUSTMENT',
        hash,
        amount: delta > 0n ? delta : -delta,
        status: 'SUCCEEDED',
        reason: `${actor}: ${input.reason}`,
      },
    });
  });
}
export async function createAccount(customerId: string, name: string) {
  const id = `demo-${customerId}`;
  return db('bank').bankAccount.upsert({
    where: { customerId },
    create: {
      id,
      customerId,
      name,
      number: `CF-${fingerprint(customerId).slice(0, 16).toUpperCase()}`,
    },
    update: {},
  });
}
