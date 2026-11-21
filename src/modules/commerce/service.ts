import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction, lock } from '@/lib/db';
import { invariant } from '@/lib/http';
import { bankCall } from '@/modules/banking/client';
import { fingerprint } from '@/lib/hash';
import { schedule } from '@/modules/installments/schedule';
import { job } from '@/modules/jobs/records';
export const checkoutSchema = z.object({
  key: z.string().uuid(),
  count: z.union([z.literal(4), z.literal(6)]),
  items: z
    .array(z.object({ productId: z.string().max(100), quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(20),
});
export async function linkBank(user: { id: string; name: string }) {
  const account = await bankCall('accounts', { customerId: user.id, name: user.name });
  return db().bankLink.upsert({
    where: { userId: user.id },
    create: { userId: user.id, accountId: account.id },
    update: {},
  });
}
export async function checkout(customerId: string, raw: unknown) {
  const input = checkoutSchema.parse(raw);
  invariant(
    new Set(input.items.map((i) => i.productId)).size === input.items.length,
    'DUPLICATE_ITEMS',
    'Each product must appear once',
    400,
  );
  return transaction('bnpl', async (tx) => {
    await lock(tx, `checkout:${customerId}:${input.key}`);
    const id = `${customerId}:checkout:${input.key}`,
      hash = fingerprint(input);
    const prior = await tx.idempotency.findUnique({ where: { id } });
    if (prior) {
      invariant(prior.hash === hash, 'IDEMPOTENCY_CONFLICT', 'Checkout key conflict');
      return tx.purchase.findUniqueOrThrow({ where: { id: prior.reference } });
    }
    const link = await tx.bankLink.findUnique({ where: { userId: customerId } });
    invariant(link, 'BANK_LINK_REQUIRED', 'Create your fictional bank account before checkout');
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
    });
    invariant(
      products.length === input.items.length,
      'PRODUCT_NOT_FOUND',
      'A product no longer exists',
      404,
    );
    const items = input.items.map((item) => {
      const p = products.find((p) => p.id === item.productId)!;
      invariant(p.stock >= item.quantity, 'OUT_OF_STOCK', `${p.name} is out of stock`);
      return { productId: p.id, name: p.name, unitPrice: p.price, quantity: item.quantity };
    });
    const total = items.reduce((n, i) => n + i.unitPrice * BigInt(i.quantity), 0n);
    invariant(total <= 1_000_000_000_000n, 'AMOUNT_TOO_LARGE', 'Purchase exceeds the demo limit');
    const purchase = await tx.purchase.create({
      data: {
        customerId,
        accountId: link.accountId,
        total,
        count: input.count,
        items: { create: items },
      },
    });
    await tx.idempotency.create({ data: { id, hash, reference: purchase.id } });
    await lock(tx, `cart:${customerId}`);
    await tx.cartItem.deleteMany({
      where: { userId: customerId, productId: { in: items.map((i) => i.productId) } },
    });
    await tx.audit.create({
      data: { actor: customerId, action: 'PURCHASE_SUBMITTED', reference: purchase.id },
    });
    return purchase;
  });
}
export async function checkCredit(id: string, actor: string) {
  const purchase = await db().purchase.findUniqueOrThrow({ where: { id } });
  const snapshot = await bankCall(
    `accounts/${encodeURIComponent(purchase.accountId)}/credit`,
    undefined,
    id,
  );
  await db().$transaction([
    db().purchase.update({ where: { id }, data: { bankCheck: snapshot } }),
    db().audit.create({
      data: { actor, action: 'BANK_CREDIT_CHECKED', reference: id, detail: snapshot },
    }),
  ]);
  return snapshot;
}
export async function decide(id: string, actor: string, approve: boolean, reason: string) {
  invariant(reason.trim().length >= 4, 'REASON_REQUIRED', 'Enter a decision reason', 400);
  return transaction('bnpl', async (tx) => {
    await lock(tx, `purchase:${id}`);
    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    invariant(
      purchase.status === 'PENDING_REVIEW',
      'INVALID_STATE',
      'Request has already been decided',
    );
    if (approve) {
      invariant(purchase.bankCheck, 'BANK_CHECK_REQUIRED', 'Check bank credit before approving');
      for (const item of [...purchase.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        const changed = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        invariant(changed.count === 1, 'OUT_OF_STOCK', `${item.name} no longer has enough stock`);
      }
      await job(tx, `approve:${id}`, 'APPROVE', id);
    }
    const result = await tx.purchase.update({
      where: { id },
      data: {
        status: approve ? 'AWAITING_BANK_CONFIRMATION' : 'REJECTED',
        reason,
        decisionBy: actor,
        decisionAt: new Date(),
      },
    });
    await tx.audit.create({
      data: {
        actor,
        action: approve ? 'ADMIN_APPROVED' : 'ADMIN_REJECTED',
        reference: id,
        detail: { reason },
      },
    });
    return result;
  });
}
export async function completeApproval(id: string, operation: { status: string; reason?: string }) {
  return transaction('bnpl', async (tx) => {
    await lock(tx, `purchase:${id}`);
    const p = await tx.purchase.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (p.status !== 'AWAITING_BANK_CONFIRMATION') return p;
    if (operation.status !== 'SUCCEEDED') {
      for (const item of p.items)
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      await tx.purchase.update({
        where: { id },
        data: { status: 'REJECTED', reason: operation.reason ?? 'Bank declined reservation' },
      });
    } else {
      await tx.installment.createMany({
        data: schedule(p.total, p.count, new Date()).map((s) => ({ ...s, purchaseId: id })),
      });
      await tx.purchase.update({
        where: { id },
        data: {
          status: 'APPROVED_AWAITING_PAYMENT',
          reservationId: `approve:${id}`,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    }
    await tx.audit.create({
      data: {
        actor: 'worker',
        action: operation.status === 'SUCCEEDED' ? 'CREDIT_RESERVED' : 'CREDIT_DECLINED',
        reference: id,
      },
    });
  });
}
export async function initiatePayment(customerId: string, installmentId: string, key: string) {
  z.string().uuid().parse(key);
  return transaction('bnpl', async (tx) => {
    const preliminary = await tx.installment.findUniqueOrThrow({ where: { id: installmentId } });
    await lock(tx, `purchase:${preliminary.purchaseId}`);
    const installment = await tx.installment.findUniqueOrThrow({
      where: { id: installmentId },
      include: { purchase: true, payments: { orderBy: { attempt: 'desc' } } },
    });
    const p = installment.purchase;
    invariant(
      p.customerId === customerId,
      'FORBIDDEN',
      'This installment belongs to another customer',
      403,
    );
    const id = `${customerId}:payment:${key}`,
      hash = fingerprint({ installmentId });
    const prior = await tx.idempotency.findUnique({ where: { id } });
    if (prior) {
      invariant(prior.hash === hash, 'IDEMPOTENCY_CONFLICT', 'Payment key conflict');
      return tx.payment.findUniqueOrThrow({ where: { id: prior.reference } });
    }
    const latest = installment.payments[0];
    if (latest && latest.status !== 'DECLINED') {
      await tx.idempotency.create({ data: { id, hash, reference: latest.id } });
      return latest;
    }
    invariant(
      ['APPROVED_AWAITING_PAYMENT', 'ACTIVE'].includes(p.status),
      'INVALID_STATE',
      'Purchase is not ready for payment',
    );
    invariant(
      installment.number === 1 || p.status === 'ACTIVE',
      'FIRST_PAYMENT_REQUIRED',
      'Complete the first installment before repayments',
    );
    const earlier = await tx.installment.count({
      where: { purchaseId: p.id, number: { lt: installment.number }, status: { not: 'PAID' } },
    });
    invariant(earlier === 0, 'PAYMENT_ORDER', 'Pay earlier installments first');
    invariant(installment.status !== 'PAID', 'ALREADY_PAID', 'Installment already paid');
    const payment = await tx.payment.create({
      data: {
        id: randomUUID(),
        installmentId,
        attempt: (latest?.attempt ?? 0) + 1,
        accountId: p.accountId,
        amount: installment.amount,
      },
    });
    await tx.idempotency.create({ data: { id, hash, reference: payment.id } });
    await tx.installment.update({
      where: { id: installmentId },
      data: { status: 'PAYMENT_PENDING' },
    });
    if (installment.number === 1)
      await tx.purchase.update({ where: { id: p.id }, data: { status: 'PAYMENT_PENDING' } });
    await job(tx, `pay:${payment.id}`, 'PAYMENT', payment.id);
    await tx.audit.create({
      data: {
        actor: customerId,
        action: 'PAYMENT_INITIATED',
        reference: p.id,
        detail: { paymentId: payment.id, installmentId },
      },
    });
    return payment;
  });
}
