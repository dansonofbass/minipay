import { db, lock, transaction } from '@/lib/db';
import { choose, defaults, random, simulatorSchema } from './simulator';
import { DomainError } from '@/lib/http';
import { setTimeout as delay } from 'node:timers/promises';
/** Delay simulates an HTTP boundary only. Durable work is never scheduled with timers. */
export async function simulated<T>(
  operationId: string,
  correlationId: string,
  financial: boolean,
  fn: (scenario: string) => Promise<T>,
) {
  const started = Date.now();
  const settings = await transaction('bank', async (tx) => {
    await lock(tx, 'simulator');
    const settings = await tx.simulator.upsert({
      where: { id: 'default' },
      create: { config: defaults },
      update: {},
    });
    if (financial && settings.nextScenario && !settings.nextScenario.startsWith('WORKER_CRASH_'))
      await tx.simulator.update({ where: { id: 'default' }, data: { nextScenario: null } });
    return settings;
  });
  const config = simulatorSchema.parse(settings.config);
  const scenario = choose(
    config,
    correlationId,
    financial && !settings.nextScenario?.startsWith('WORKER_CRASH_') ? settings.nextScenario : null,
  );
  const latency =
    scenario === 'SLOW'
      ? 5000
      : config.simulationEnabled
        ? config.baseLatencyMs +
          Math.floor(random(`${correlationId}:latency`) * config.randomLatencyMs)
        : 0;
  let status = 200;
  try {
    if (latency) await delay(latency);
    if (['HTTP_ERROR', 'OFFLINE', 'TIMEOUT', 'WORKER_CRASH_BEFORE'].includes(scenario))
      throw new DomainError(
        scenario,
        'Simulated pre-commit transport failure; outcome requires inquiry',
        scenario === 'TIMEOUT' ? 504 : 503,
      );
    const result = await fn(scenario);
    if (['RESPONSE_LOST', 'WORKER_CRASH_AFTER'].includes(scenario))
      throw new DomainError(
        'RESPONSE_LOST',
        'Bank committed; response lost. Query the original operation.',
        504,
      );
    return result;
  } catch (error) {
    status = error instanceof DomainError ? error.status : 500;
    throw error;
  } finally {
    await db('bank')
      .simulationLog.create({
        data: {
          operationId,
          correlationId,
          scenario,
          configVersion: settings.version,
          latencyMs: latency,
          durationMs: Date.now() - started,
          httpStatus: status,
        },
      })
      .catch(() => console.warn(JSON.stringify({ type: 'SIMULATION_TELEMETRY_UNAVAILABLE' })));
  }
}
