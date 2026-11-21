import type { Tx } from '@/lib/db';
export async function job(tx: Tx, id: string, kind: string, reference: string) {
  return tx.job.upsert({ where: { id }, create: { id, kind, reference }, update: {} });
}
