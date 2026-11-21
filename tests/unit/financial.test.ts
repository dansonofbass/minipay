import { describe, it, expect } from 'vitest';
import { schedule } from '@/modules/installments/schedule';
import { choose, defaults, random, simulatorSchema } from '@/modules/banking/simulator';
import { sign, verify } from '@/modules/webhooks/signature';
import { fingerprint } from '@/lib/hash';
describe('integer installment schedules', () => {
  it('exactly splits the Alice example', () =>
    expect(schedule(240000n, 4, new Date('2026-01-31T23:00:00Z')).map((i) => i.amount)).toEqual([
      60000n,
      60000n,
      60000n,
      60000n,
    ]));
  it.each([4, 6])('preserves every dram for %i installments', (count) => {
    for (let n = count; n < 1000; n++) {
      const s = schedule(BigInt(n), count, new Date('2026-01-01'));
      expect(s.reduce((n, i) => n + i.amount, 0n)).toBe(BigInt(n));
      expect(s[0].amount - s[s.length - 1].amount).toBeLessThanOrEqual(1n);
    }
  });
  it('clamps February and restores the original month-end anchor', () =>
    expect(
      schedule(24n, 4, new Date('2026-01-31T23:59:59Z')).map((s) =>
        s.dueAt.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']));
  it('handles leap years', () =>
    expect(schedule(24n, 4, new Date('2028-01-31'))[1].dueAt.toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    ));
  it('uses the UTC date across timezone boundaries', () =>
    expect(schedule(24n, 4, new Date('2026-02-01T01:00:00+04:00'))[0].dueAt.toISOString()).toBe(
      '2026-01-31T12:00:00.000Z',
    ));
  it('rejects unsupported plans and tiny amounts', () => {
    expect(() => schedule(10n, 3, new Date())).toThrow();
    expect(() => schedule(3n, 4, new Date())).toThrow();
  });
});
describe('failure classification', () => {
  it('rejects overlapping probability totals', () =>
    expect(
      simulatorSchema.safeParse({ ...defaults, httpErrorRate: 95, timeoutRate: 10 }).success,
    ).toBe(false));
  it('rejects negative delays', () =>
    expect(simulatorSchema.safeParse({ ...defaults, baseLatencyMs: -1 }).success).toBe(false));
  it('gives explicit scenarios precedence', () =>
    expect(choose({ ...defaults, simulationEnabled: false }, 'a', 'RESPONSE_LOST')).toBe(
      'RESPONSE_LOST',
    ));
  it('returns healthy when disabled', () =>
    expect(choose({ ...defaults, simulationEnabled: false }, 'a')).toBe('HEALTHY'));
  it('produces deterministic mutually exclusive outcomes', () => {
    for (let i = 0; i < 100; i++) {
      expect(choose(defaults, String(i))).toBe(choose(defaults, String(i)));
      expect(random(String(i))).toBeGreaterThanOrEqual(0);
      expect(random(String(i))).toBeLessThan(1);
    }
  });
});
describe('signed webhooks and canonical operation hashes', () => {
  const key = 'a'.repeat(64),
    body = '{"status":"SUCCEEDED"}',
    timestamp = String(Date.now());
  it('verifies a valid raw body signature', () =>
    expect(verify(body, timestamp, sign(body, timestamp, key), [key])).toBe(true));
  it('rejects modified payloads', () =>
    expect(verify(`${body} `, timestamp, sign(body, timestamp, key), [key])).toBe(false));
  it('rejects stale signed requests', () =>
    expect(
      verify(body, timestamp, sign(body, timestamp, key), [key], Number(timestamp) + 300001),
    ).toBe(false));
  it('supports previous-key rotation', () =>
    expect(verify(body, timestamp, sign(body, timestamp, key), ['b'.repeat(64), key])).toBe(true));
  it('rejects malformed timestamps', () =>
    expect(verify(body, 'NaN', sign(body, 'NaN', key), [key])).toBe(false));
  it('hashes equivalent request key ordering identically', () =>
    expect(fingerprint({ b: 2, a: 1n })).toBe(fingerprint({ a: '1', b: 2 })));
  it('detects a changed financial intent', () =>
    expect(fingerprint({ amount: '10' })).not.toBe(fingerprint({ amount: '11' })));
});
