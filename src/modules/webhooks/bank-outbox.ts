import { db } from '@/lib/db';
import { appUrl, serialize } from '@/lib/http';
import { sign } from './signature';
import { defaults, random, simulatorSchema } from '@/modules/banking/simulator';
export async function deliverEvents() {
  const config = simulatorSchema.parse(
    (await db('bank').simulator.findUnique({ where: { id: 'default' } }))?.config ?? defaults,
  );
  const events = await db('bank').bankEvent.findMany({
    where: { status: { in: ['READY', 'RETRY'] }, availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const event of events) {
    const payload = event.payload as { scenario?: string };
    let status = 0,
      error: string | undefined;
    try {
      if (
        (payload.scenario === 'WEBHOOK_FAILURE' && event.attempts < 2) ||
        random(`${event.id}:${event.attempts}:failure`) * 100 < config.webhookFailureRate
      )
        throw new Error('Injected webhook delivery failure');
      const body = serialize(event.payload),
        timestamp = Date.now().toString();
      const secret = process.env.WEBHOOK_SECRET;
      if (!secret || secret.length < 32)
        throw new Error('Webhook signing secret is not configured');
      const send = () =>
        fetch(`${appUrl()}/api/webhooks/bank`, {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: {
            'content-type': 'application/json',
            'x-bank-timestamp': timestamp,
            'x-bank-signature': sign(body, timestamp, secret),
          },
          body,
        });
      const response = await send();
      status = response.status;
      if (!response.ok) throw new Error(`Webhook HTTP ${status}`);
      if (
        payload.scenario === 'DUPLICATE_WEBHOOK' ||
        random(`${event.id}:duplicate`) * 100 < config.webhookDuplicateRate
      ) {
        const duplicate = await send();
        await db('bank').delivery.create({ data: { eventId: event.id, status: duplicate.status } });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delivery failed';
    }
    await db('bank').$transaction(async (tx) => {
      await tx.delivery.create({ data: { eventId: event.id, status, error } });
      await tx.bankEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          status: error ? (event.attempts >= 7 ? 'DEAD' : 'RETRY') : 'DELIVERED',
          deliveredAt: error ? undefined : new Date(),
          availableAt: new Date(
            Date.now() +
              Math.min(3600000, 1000 * 2 ** Math.min(event.attempts, 12)) +
              Math.floor(random(`${event.id}:${event.attempts}:jitter`) * 1000),
          ),
        },
      });
    });
  }
  const next = await db('bank').bankEvent.findFirst({
    where: { status: { in: ['READY', 'RETRY'] } },
    orderBy: { availableAt: 'asc' },
    select: { availableAt: true },
  });
  return { attempted: events.length, nextAt: next?.availableAt.toISOString() ?? null };
}
