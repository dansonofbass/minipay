import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
console.log('Local HTTP worker running. Production uses Vercel Queues.');
while (!stopped) {
  try {
    const response = await fetch(`${process.env.APP_URL}/api/internal/tick`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) console.error(`Worker HTTP ${response.status}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Worker unavailable');
  }
  await delay(2000);
}
