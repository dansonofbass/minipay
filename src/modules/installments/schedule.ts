/** AMD amounts are whole drams (no minor-unit fraction). Dates use an anchored UTC calendar day. */
export function schedule(total: bigint, count: number, start: Date) {
  if ((count !== 4 && count !== 6) || total < BigInt(count))
    throw new RangeError('Choose 4 or 6 installments and a valid amount');
  const base = total / BigInt(count),
    remainder = total % BigInt(count);
  return Array.from({ length: count }, (_, i) => {
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 0),
    ).getUTCDate();
    return {
      number: i + 1,
      amount: base + (BigInt(i) < remainder ? 1n : 0n),
      dueAt: new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth() + i,
          Math.min(start.getUTCDate(), lastDay),
          12,
        ),
      ),
    };
  });
}
