import type { Tx } from '@/lib/db';
import { invariant } from '@/lib/http';
export async function post(
  tx: Tx,
  domain: 'bank' | 'bnpl',
  id: string,
  kind: string,
  reference: string,
  debit: string,
  credit: string,
  amount: bigint,
) {
  invariant(
    amount > 0n && debit !== credit,
    'INVALID_JOURNAL',
    'Journal amount and account combination must be valid',
  );
  const data = {
    id,
    reference,
    kind,
    entries: {
      create: [
        { account: debit, debit: amount, credit: 0n },
        { account: credit, debit: 0n, credit: amount },
      ],
    },
  };
  if (domain === 'bank') {
    for (const code of [debit, credit])
      await tx.bankLedgerAccount.upsert({ where: { code }, create: { code }, update: {} });
    await tx.bankJournal.create({ data });
  } else {
    for (const code of [debit, credit])
      await tx.ledgerAccount.upsert({ where: { code }, create: { code }, update: {} });
    await tx.journal.create({ data });
  }
}
