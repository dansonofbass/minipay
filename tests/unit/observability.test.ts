import { describe, it, expect } from 'vitest';
import { safeMetadata, redactOperational } from '@/modules/observability/context';
import { csvCell, parseFilters } from '@/modules/observability/queries';
import { explainEvent, learningTopics } from '@/modules/observability/learning';
describe('operational safety and explanations', () => {
  it('allowlists telemetry fields and excludes credentials and request bodies', () => {
    expect(
      safeMetadata({
        httpStatus: 504,
        code: 'RESPONSE_LOST',
        password: 'hidden',
        authorization: 'Bearer hidden',
        body: { secret: 'hidden' },
        route: 'postgresql://secret',
      }),
    ).toEqual({ httpStatus: 504, code: 'RESPONSE_LOST' });
  });
  it('redacts nested operational credentials and unknown diagnostic messages', () => {
    process.env.TEST_SECRET = 'sensitive-fixture';
    expect(
      redactOperational({
        token: 'hidden',
        nested: { signature: 'hidden', note: 'sensitive-fixture', error: 'private DB connection' },
      }),
    ).toEqual({
      nested: {
        note: '[REDACTED]',
        error: 'Diagnostic text withheld; inspect the structured error code',
      },
    });
    delete process.env.TEST_SECRET;
  });
  it('neutralizes CSV formulas and quotes cells', () => {
    expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
  it('bounds date ranges, pagination and latency', () => {
    expect(() => parseFilters(new URLSearchParams('page=0'))).toThrow();
    expect(() => parseFilters(new URLSearchParams('minLatency=-1'))).toThrow();
    expect(() => parseFilters(new URLSearchParams('from=2020-01-01&to=2026-01-01'))).toThrow();
  });
  it('explains uncertain bank outcomes without advising a replacement debit', () => {
    expect(explainEvent('PAYMENT_OUTCOME_UNKNOWN').why).toContain('original operation');
    expect(explainEvent('DUPLICATE_WEBHOOK_DETECTED').why).toContain('unique database constraints');
    expect(Object.keys(learningTopics)).toHaveLength(24);
  });
});
