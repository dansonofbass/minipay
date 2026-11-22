import { transaction, lock } from '@/lib/db';
import { invariant } from '@/lib/http';
import { post } from '@/modules/ledger/post';
import { schedule } from '@/modules/installments/schedule';
export type BankResult = {
  id: string;
  status: string;
  amount: string;
  accountId: string;
  version: number;
  kind: string;
  reason?: string | null;
};
/** Called only with an authenticated bank status inquiry; webhook bodies never directly authorize postings. */
export async function finalize(id: string, result: BankResult) {
  return transaction('bnpl', async (tx) => {
    const initial = await tx.payment.findUniqueOrThrow({
      where: { id },
      include: { installment: true },
    });
    await lock(tx, `purchase:${initial.installment.purchaseId}`);
    const p = await tx.payment.findUniqueOrThrow({
      where: { id },
      include: { installment: { include: { purchase: true } } },
    });
    invariant(
      result.id === p.id &&
        result.kind === 'PAYMENT' &&
        result.accountId === p.accountId &&
        BigInt(result.amount) === p.amount,
      'BANK_MISMATCH',
      'Bank confirmation does not match payment',
    );
    if (p.status === 'SUCCEEDED' || p.bankVersion >= result.version) {
      await tx.audit.create({
        data: {
          actor: 'bank-confirmation',
          action: 'DUPLICATE_FINANCIAL_EFFECT_PREVENTED',
          reference: p.installment.purchaseId,
          detail: { paymentId: id },
        },
      });
      return p;
    }
    invariant(
      ['SUCCEEDED', 'DECLINED'].includes(result.status),
      'BANK_PENDING',
      'Authoritative bank result is not final',
    );
    const installment = p.installment,
      purchase = installment.purchase;
    const success = result.status === 'SUCCEEDED';
    if (success) {
      invariant(
        installment.status !== 'PAID',
        'ALREADY_PAID',
        'A different payment already settled this installment',
      );
      if (installment.number === 1) {
        await post(
          tx,
          'bnpl',
          `settlement:${purchase.id}`,
          'MERCHANT_SETTLEMENT',
          purchase.id,
          'CUSTOMER_RECEIVABLE',
          'MERCHANT_PAYABLE',
          purchase.total,
        );
        await post(
          tx,
          'bnpl',
          `funding:${purchase.id}`,
          'MERCHANT_FUNDING',
          purchase.id,
          'MERCHANT_PAYABLE',
          'PROVIDER_FUNDING',
          purchase.total,
        );
        const dates = schedule(purchase.total, purchase.count, new Date());
        for (const s of dates)
          await tx.installment.update({
            where: { purchaseId_number: { purchaseId: purchase.id, number: s.number } },
            data: { dueAt: s.dueAt },
          });
      }
      await post(
        tx,
        'bnpl',
        `payment:${id}`,
        'CUSTOMER_COLLECTION',
        id,
        'BANK_CASH',
        'CUSTOMER_RECEIVABLE',
        p.amount,
      );
      await tx.installment.update({
        where: { id: installment.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
    } else
      await tx.installment.update({ where: { id: installment.id }, data: { status: 'SCHEDULED' } });
    if (installment.number === 1)
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: success ? 'ACTIVE' : 'APPROVED_AWAITING_PAYMENT' },
      });
    if (
      success &&
      (await tx.installment.count({
        where: { purchaseId: purchase.id, status: { not: 'PAID' } },
      })) === 0
    ) {
      await tx.purchase.update({ where: { id: purchase.id }, data: { status: 'COMPLETED' } });
    }
    await tx.payment.update({
      where: { id },
      data: {
        status: result.status,
        bankVersion: result.version,
        lastError: result.reason ?? null,
      },
    });
    if (success && p.status === 'PENDING_RECONCILIATION')
      await tx.audit.create({
        data: {
          actor: 'bank-confirmation',
          action: 'PAYMENT_RECOVERED',
          reference: purchase.id,
          detail: { paymentId: id },
        },
      });
    await tx.audit.create({
      data: {
        actor: 'bank-confirmation',
        action: success ? 'PAYMENT_FINALIZED' : 'PAYMENT_DECLINED',
        reference: purchase.id,
        detail: { paymentId: id, bankVersion: result.version, reason: result.reason ?? null },
      },
    });
  });
}
