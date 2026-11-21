import { db } from '@/lib/db';
import { json } from '@/lib/http';
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    await db('bank').$queryRaw`SELECT 1`;
    return json({ status: 'ok', database: 'reachable', simulation: true });
  } catch {
    return json({ status: 'unavailable', database: 'not configured or unreachable' }, 503);
  }
}
