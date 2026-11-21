import { z } from 'zod';
import { endpoint, invariant } from '@/lib/http';
import { db, lock } from '@/lib/db';
import { fingerprint } from '@/lib/hash';
import { verify } from '@/modules/webhooks/signature';
import { job } from '@/modules/jobs/records';
const payloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string().max(80),
  schemaVersion: z.literal(1),
  operationId: z.string().min(1).max(160),
  accountId: z.string(),
  amount: z.string().regex(/^\d+$/),
  currency: z.literal('AMD'),
  status: z.string(),
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const raw = await request.text();
    invariant(raw.length <= 16000, 'PAYLOAD_TOO_LARGE', 'Webhook exceeds maximum size', 413);
    invariant(
      verify(
        raw,
        request.headers.get('x-bank-timestamp') ?? '',
        request.headers.get('x-bank-signature') ?? '',
        [process.env.WEBHOOK_SECRET ?? '', process.env.WEBHOOK_PREVIOUS_SECRET ?? ''].filter(
          Boolean,
        ),
      ),
      'INVALID_SIGNATURE',
      'Invalid or expired webhook signature',
      401,
    );
    const payload = payloadSchema.parse(JSON.parse(raw));
    await db().$transaction(async (tx) => {
      await lock(tx, `inbox:${payload.eventId}`);
      const prior = await tx.inbox.findUnique({ where: { id: payload.eventId } });
      invariant(
        !prior || fingerprint(prior.payload) === fingerprint(payload),
        'EVENT_CONFLICT',
        'Event ID was reused with a different payload',
        409,
      );
      await tx.inbox.upsert({
        where: { id: payload.eventId },
        create: { id: payload.eventId, payload },
        update: { deliveries: { increment: 1 } },
      });
      await job(tx, `inbox:${payload.eventId}`, 'INBOX', payload.eventId);
    });
    return { accepted: true };
  });
}
