import { db, lock, transaction } from '@/lib/db';
import { bankCall } from '@/modules/banking/client';
import { completeApproval } from '@/modules/commerce/service';
import { finalize } from '@/modules/payments/finalize';
export async function reconcile(actor: string) {
  const findings: { reference: string; issue: string; resolved: boolean }[] = [];
  const pending = await db().payment.findMany({
    where: { status: { in: ['PENDING', 'PENDING_RECONCILIATION'] } },
  });
  for (const payment of pending) {
    try {
      const { operation } = await bankCall(`operations/${encodeURIComponent(payment.id)}`);
      if (operation) {
        await finalize(payment.id, operation);
        findings.push({ reference: payment.id, issue: 'BANK_OUTCOME_RECOVERED', resolved: true });
      } else
        findings.push({
          reference: payment.id,
          issue: 'BANK_OPERATION_NOT_FOUND',
          resolved: false,
        });
    } catch {
      findings.push({ reference: payment.id, issue: 'BANK_INQUIRY_UNAVAILABLE', resolved: false });
    }
  }
  const approvals = await db().purchase.findMany({
    where: { status: 'AWAITING_BANK_CONFIRMATION' },
  });
  for (const p of approvals) {
    try {
      const { operation } = await bankCall(`operations/${encodeURIComponent(`approve:${p.id}`)}`);
      if (operation) await completeApproval(p.id, operation);
    } catch {
      findings.push({ reference: p.id, issue: 'RESERVATION_INQUIRY_UNAVAILABLE', resolved: false });
    }
  }
  const expired = await db().purchase.findMany({
    where: { status: 'APPROVED_AWAITING_PAYMENT', expiresAt: { lt: new Date() } },
    include: { items: true },
  });
  for (const p of expired) {
    try {
      const result = await bankCall(
        'credit/reservations',
        {
          id: `release:${p.id}`,
          kind: 'RELEASE',
          accountId: p.accountId,
          amount: p.total.toString(),
          reservationId: p.reservationId,
        },
        p.id,
      );
      if (result.status === 'SUCCEEDED')
        await transaction('bnpl', async (tx) => {
          await lock(tx, `purchase:${p.id}`);
          const current = await tx.purchase.findUniqueOrThrow({ where: { id: p.id } });
          if (current.status !== 'APPROVED_AWAITING_PAYMENT') return;
          await tx.purchase.update({
            where: { id: p.id },
            data: { status: 'CANCELLED', reason: 'Credit reservation expired' },
          });
          await tx.installment.updateMany({
            where: { purchaseId: p.id },
            data: { status: 'CANCELLED' },
          });
          for (const item of p.items)
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          await tx.audit.create({
            data: { actor, action: 'RESERVATION_EXPIRED', reference: p.id },
          });
        });
    } catch {
      findings.push({ reference: p.id, issue: 'RESERVATION_EXPIRY_UNRESOLVED', resolved: false });
    }
  }
  const journals = await db().journal.findMany({ include: { entries: true } });
  for (const journal of journals)
    if (journal.entries.reduce((n, e) => n + e.debit - e.credit, 0n) !== 0n)
      findings.push({ reference: journal.id, issue: 'UNBALANCED_BNPL_JOURNAL', resolved: false });
  try {
    const integrity = await bankCall('integrity');
    for (const a of integrity.accounts)
      if (a.used !== a.actualUsed || a.reserved !== a.actualReserved)
        findings.push({ reference: a.id, issue: 'BANK_CREDIT_MISMATCH', resolved: false });
    for (const id of integrity.unbalanced)
      findings.push({ reference: id, issue: 'UNBALANCED_BANK_JOURNAL', resolved: false });
    const purchases = await db().purchase.findMany({ include: { installments: true } });
    for (const reservation of integrity.reservations) {
      const purchase = purchases.find((p) => p.reservationId === reservation.id);
      if (!purchase) {
        findings.push({
          reference: reservation.id,
          issue: 'ORPHANED_BANK_RESERVATION',
          resolved: false,
        });
        continue;
      }
      if (reservation.status === 'COMMITTED') {
        const expected = purchase.installments
          .filter((i) => i.status !== 'PAID')
          .reduce((n, i) => n + i.amount, 0n);
        if (expected !== BigInt(reservation.outstanding))
          findings.push({
            reference: purchase.id,
            issue: 'OUTSTANDING_PRINCIPAL_MISMATCH',
            resolved: false,
          });
      }
    }
    const known = await db().payment.findMany({ select: { id: true } });
    const ids = new Set(known.map((p) => p.id));
    for (const payment of integrity.payments)
      if (!ids.has(payment.id))
        findings.push({ reference: payment.id, issue: 'ORPHANED_BANK_PAYMENT', resolved: false });
  } catch {
    findings.push({ reference: 'bank', issue: 'INTEGRITY_INQUIRY_FAILED', resolved: false });
  }
  const run = await db().reconciliation.create({
    data: { status: findings.some((f) => !f.resolved) ? 'NEEDS_REVIEW' : 'MATCHED', findings },
  });
  await db().audit.create({
    data: {
      actor,
      action: 'RECONCILIATION_RUN',
      reference: run.id,
      detail: { findings: findings.length },
    },
  });
  return run;
}
