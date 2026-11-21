import { handleCallback, send } from '@vercel/queue';
import { tick } from '@/modules/jobs/worker';
import { reconcile } from '@/modules/reconciliation/service';
import { db } from '@/lib/db';
export const maxDuration = 300;
export const POST = handleCallback(async () => {
  const result = await tick();
  const last = await db().reconciliation.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last || Date.now() - last.createdAt.getTime() >= 900000) await reconcile('scheduled-worker');
  await send(
    'crediflow-jobs',
    { tick: Date.now() },
    {
      delaySeconds: result.nextWakeSeconds,
      idempotencyKey: `heartbeat:${Math.floor(Date.now() / 1000) + result.nextWakeSeconds}`,
    },
  );
});
