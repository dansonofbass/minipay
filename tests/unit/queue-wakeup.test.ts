import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@vercel/queue', () => ({ send: vi.fn().mockResolvedValue({ messageId: 'accepted' }) }));
import { send } from '@vercel/queue';
import { wake } from '@/modules/jobs/worker';
it('does not discard a later committed mutation in the same clock tick', async () => {
  vi.stubEnv('VERCEL', '1');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-21T00:00:00Z'));
  await wake();
  await wake();
  const requests = vi.mocked(send).mock.calls;
  expect(requests).toHaveLength(2);
  expect(requests[0][2]?.idempotencyKey).not.toBe(requests[1][2]?.idempotencyKey);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
