import { randomUUID } from 'node:crypto';
import { send } from '@vercel/queue';
import { db, lock } from '@/lib/db';
import { bankCall } from '@/modules/banking/client';
import { completeApproval } from '@/modules/commerce/service';
import { finalize } from '@/modules/payments/finalize';
import { DomainError } from '@/lib/http';

export async function wake() {
  if (!process.env.VERCEL) return;
  try {
    await send('crediflow-jobs', { tick: Date.now() }, { idempotencyKey: `wake:${randomUUID()}` });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Queue publish failed; database jobs retained for scheduled recovery',
        error: String(error),
      }),
    );
  }
}
async function execute(kind: string, reference: string) {
  if (kind === 'APPROVE') {
    const p = await db().purchase.findUniqueOrThrow({ where: { id: reference } });
    if (p.status !== 'AWAITING_BANK_CONFIRMATION') return;
    const id = `approve:${p.id}`;
    const status = await bankCall(`operations/${encodeURIComponent(id)}`);
    const result =
      status.operation ??
      (await bankCall(
        'credit/reservations',
        {
          id,
          accountId: p.accountId,
          kind: 'RESERVE',
          amount: p.total.toString(),
          purchaseId: p.id,
        },
        p.id,
      ));
    await completeApproval(p.id, result);
  } else if (kind === 'PAYMENT') {
    const p = await db().payment.findUniqueOrThrow({
      where: { id: reference },
      include: { installment: { include: { purchase: true } } },
    });
    if (['SUCCEEDED', 'DECLINED'].includes(p.status)) return;
    try {
      const status = await bankCall(`operations/${encodeURIComponent(p.id)}`);
      const result =
        status.operation ??
        (await bankCall(
          'payments',
          {
            id: p.id,
            accountId: p.accountId,
            kind: 'PAYMENT',
            amount: p.amount.toString(),
            reservationId: p.installment.purchase.reservationId,
          },
          p.id,
        ));
      await finalize(p.id, result);
    } catch (error) {
      await db().$transaction(async (tx) => {
        await lock(tx, `purchase:${p.installment.purchaseId}`);
        const current = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
        if (['SUCCEEDED', 'DECLINED'].includes(current.status)) return;
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: 'PENDING_RECONCILIATION',
            lastError: error instanceof Error ? error.message : 'Bank transport failure',
          },
        });
        await tx.installment.update({
          where: { id: p.installmentId },
          data: { status: 'PENDING_RECONCILIATION' },
        });
        if (p.installment.number === 1)
          await tx.purchase.update({
            where: { id: p.installment.purchaseId },
            data: { status: 'PENDING_RECONCILIATION' },
          });
        await tx.audit.create({
          data: {
            actor: 'worker',
            action: 'PAYMENT_OUTCOME_UNKNOWN',
            reference: p.installment.purchaseId,
            detail: { paymentId: p.id },
          },
        });
      });
      throw error;
    }
  } else if (kind === 'INBOX') {
    const inbox = await db().inbox.findUniqueOrThrow({ where: { id: reference } });
    if (inbox.processedAt) return;
    const payload = inbox.payload as { operationId: string };
    const payment = await db().payment.findUnique({ where: { id: payload.operationId } });
    if (payment) {
      const { operation } = await bankCall(`operations/${encodeURIComponent(payment.id)}`);
      if (!operation)
        throw new DomainError('BANK_UNKNOWN', 'Bank has not confirmed this operation', 503);
      await finalize(payment.id, operation);
    }
    await db().inbox.update({ where: { id: reference }, data: { processedAt: new Date() } });
  }
}
export async function runJob(id: string) {
  const token = randomUUID(),
    now = new Date();
  const claimed = await db().job.updateMany({
    where: {
      id,
      status: { in: ['READY', 'RETRY', 'RUNNING'] },
      availableAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      status: 'RUNNING',
      leaseToken: token,
      leaseUntil: new Date(Date.now() + 90000),
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) return;
  const record = await db().job.findUniqueOrThrow({ where: { id } });
  try {
    const interrupt = async (phase: 'BEFORE' | 'AFTER') => {
      if (!['PAYMENT', 'APPROVE'].includes(record.kind)) return false;
      const control = await bankCall(`worker-control?phase=${phase}`);
      if (!control.interrupt) return false;
      await db().$transaction([
        db().job.updateMany({
          where: { id, leaseToken: token },
          data: {
            error: `Simulated worker interruption ${phase.toLowerCase()} financial processing`,
            leaseUntil: new Date(Date.now() + 5000),
          },
        }),
        db().jobAttempt.create({
          data: {
            jobId: id,
            attempt: record.attempts,
            status: 'INTERRUPTED',
            error: `Worker stopped at ${phase} checkpoint; acknowledgment withheld`,
          },
        }),
      ]);
      return true;
    };
    if (await interrupt('BEFORE')) return;
    await execute(record.kind, record.reference);
    if (await interrupt('AFTER')) return;
    await db().$transaction([
      db().job.updateMany({
        where: { id, leaseToken: token },
        data: { status: 'DONE', leaseToken: null, leaseUntil: null, error: null },
      }),
      db().jobAttempt.create({ data: { jobId: id, attempt: record.attempts, status: 'DONE' } }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker failed';
    await db().$transaction([
      db().job.updateMany({
        where: { id, leaseToken: token },
        data: {
          status: record.attempts >= 8 ? 'DEAD' : 'RETRY',
          error: message,
          leaseToken: null,
          leaseUntil: null,
          availableAt: new Date(
            Date.now() +
              Math.min(300000, 1000 * 2 ** record.attempts) +
              Math.floor(Math.random() * 500),
          ),
        },
      }),
      db().jobAttempt.create({
        data: { jobId: id, attempt: record.attempts, status: 'FAILED', error: message },
      }),
    ]);
  }
}
export async function tick() {
  const now = new Date(),
    dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    dayEnd = new Date(dayStart.getTime() + 86400000);
  await db().installment.updateMany({
    where: { status: 'SCHEDULED', dueAt: { lt: dayStart }, purchase: { status: 'ACTIVE' } },
    data: { status: 'OVERDUE' },
  });
  await db().installment.updateMany({
    where: {
      status: 'SCHEDULED',
      dueAt: { gte: dayStart, lt: dayEnd },
      purchase: { status: 'ACTIVE' },
    },
    data: { status: 'DUE' },
  });
  const records = await db().job.findMany({
    where: {
      status: { in: ['READY', 'RETRY', 'RUNNING'] },
      availableAt: { lte: new Date() },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 12,
  });
  for (const record of records) await runJob(record.id);
  let outboxNext: number | null = null;
  try {
    const outbox = await bankCall('outbox');
    if (outbox.nextAt) outboxNext = new Date(outbox.nextAt).getTime();
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'warn', message: 'Bank outbox unavailable', error: String(error) }),
    );
  }
  const pending = await db().job.findMany({
    where: { status: { in: ['READY', 'RETRY', 'RUNNING'] } },
    select: { availableAt: true, leaseUntil: true },
  });
  const nextAt = Math.min(
    Date.now() + 900000,
    ...pending.map((j) => Math.max(j.availableAt.getTime(), j.leaseUntil?.getTime() ?? 0)),
    ...(outboxNext === null ? [] : [outboxNext]),
  );
  return {
    scanned: records.length,
    nextWakeSeconds: Math.max(1, Math.min(900, Math.ceil((nextAt - Date.now()) / 1000))),
  };
}
