import { endpoint, invariant, equalSecret } from '@/lib/http';
import { tick, wake } from '@/modules/jobs/worker';
import { reconcile } from '@/modules/reconciliation/service';
export const maxDuration = 300;
export async function GET(request: Request) {
  return endpoint(async () => {
    invariant(
      process.env.CRON_SECRET &&
        equalSecret(
          request.headers.get('authorization') ?? '',
          `Bearer ${process.env.CRON_SECRET}`,
        ),
      'UNAUTHORIZED',
      'Worker authentication required',
      401,
    );
    const result = await tick();
    if (new URL(request.url).searchParams.get('reconcile') === 'true') await reconcile('scheduler');
    await wake();
    return result;
  });
}
