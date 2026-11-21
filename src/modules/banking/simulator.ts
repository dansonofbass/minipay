import { z } from 'zod';
const percent = z.number().int().min(0).max(100);
export const simulatorSchema = z
  .object({
    simulationEnabled: z.boolean(),
    httpErrorRate: percent,
    timeoutRate: percent,
    timeoutAfterCommitRate: percent,
    retryableErrorRate: percent,
    webhookDuplicateRate: percent,
    webhookFailureRate: percent,
    baseLatencyMs: z.number().int().min(0).max(5000),
    randomLatencyMs: z.number().int().min(0).max(5000),
    webhookDelayMs: z.number().int().min(0).max(86400000),
    randomSeed: z.string().min(1).max(100),
  })
  .refine(
    (c) => c.httpErrorRate + c.timeoutRate + c.timeoutAfterCommitRate + c.retryableErrorRate <= 100,
    'Combined transport probabilities must not exceed 100',
  );
export const defaults = {
  simulationEnabled: true,
  httpErrorRate: 10,
  timeoutRate: 10,
  timeoutAfterCommitRate: 0,
  retryableErrorRate: 0,
  baseLatencyMs: 500,
  randomLatencyMs: 1200,
  webhookDelayMs: 2000,
  webhookDuplicateRate: 0,
  webhookFailureRate: 0,
  randomSeed: 'crediflow',
};
export const scenarios = [
  'HEALTHY',
  'SLOW',
  'HTTP_ERROR',
  'TIMEOUT',
  'OFFLINE',
  'INSUFFICIENT_FUNDS',
  'INSUFFICIENT_CREDIT',
  'FROZEN',
  'SUCCESS',
  'DECLINED',
  'RESPONSE_LOST',
  'DELAYED_WEBHOOK',
  'DUPLICATE_WEBHOOK',
  'WEBHOOK_FAILURE',
  'OUT_OF_ORDER',
  'WORKER_CRASH_BEFORE',
  'WORKER_CRASH_AFTER',
] as const;
export function random(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash << 13;
  hash ^= hash >>> 17;
  hash ^= hash << 5;
  return (hash >>> 0) / 4294967296;
}
export function choose(
  config: z.infer<typeof simulatorSchema>,
  requestId: string,
  override?: string | null,
) {
  if (override) return override;
  if (!config.simulationEnabled) return 'HEALTHY';
  const r = random(`${config.randomSeed}:${requestId}`) * 100;
  if (r < config.httpErrorRate) return 'HTTP_ERROR';
  if (r < config.httpErrorRate + config.timeoutRate) return 'TIMEOUT';
  if (r < config.httpErrorRate + config.timeoutRate + config.timeoutAfterCommitRate)
    return 'RESPONSE_LOST';
  if (
    r <
    config.httpErrorRate +
      config.timeoutRate +
      config.timeoutAfterCommitRate +
      config.retryableErrorRate
  )
    return 'OFFLINE';
  return 'HEALTHY';
}
