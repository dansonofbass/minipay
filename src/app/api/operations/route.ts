import { redactOperational } from '@/modules/observability/context';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { db, transaction, lock } from '@/lib/db';
import { endpoint, invariant, readJson, sameOrigin } from '@/lib/http';
import { operationsData, parseFilters, sections, csvCell } from '@/modules/observability/queries';
import { reconcile } from '@/modules/reconciliation/service';
import { wake } from '@/modules/jobs/worker';

export const maxDuration = 60;

export async function GET(request: Request) {
  const result = await endpoint(async () => {
    await requireUser('BNPL_ADMIN', request.headers);

    const params = new URL(request.url).searchParams;

    const section = z.enum(sections).parse(params.get('section') ?? 'overview');

    const filters = parseFilters(params);

    const data = await operationsData(section, filters);

    return {
      ...(redactOperational(data) as typeof data),
      filters,
      updatedAt: new Date(),
      freshness:
        'Near-real-time polling every 15 seconds. Reports are historical cohorts; principal is current.',
    };
  }, request);

  if (new URL(request.url).searchParams.get('format') !== 'csv' || !result.ok) return result;

  const payload = await result.json();

  const rows = payload.data.metrics
    ? Object.entries(payload.data.metrics).map(([metric, value]) => ({ metric, value }))
    : payload.data.rows;

  const keys = [
    ...new Set<string>(rows.flatMap((row: Record<string, unknown>) => Object.keys(row))),
  ];

  const body = [
    keys.map(csvCell).join(','),
    ...rows.map((row: Record<string, unknown>) =>
      keys
        .map((key) => csvCell(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key]))
        .join(','),
    ),
  ].join('\r\n');

  const user = await requireUser('BNPL_ADMIN', request.headers);

  await db().audit.create({
    data: {
      actor: user.id,
      action: 'OPERATIONS_EXPORTED',
      reference: 'operations',
      detail: { rows: rows.length },
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="crediflow-operations.csv"',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);

    const user = await requireUser('BNPL_ADMIN', request.headers);

    const input = z
      .object({
        action: z.enum(['RETRY_JOB', 'REPLAY_WEBHOOK', 'RECONCILE', 'REVIEW_ERROR']),
        id: z.string().max(250).default('all'),
        confirmed: z.literal(true),
        note: z.string().min(4).max(1000),
        status: z.enum(['ACKNOWLEDGED', 'RESOLVED']).optional(),
      })
      .parse(await readJson(request));

    if (input.action === 'RECONCILE') return reconcile(user.id, input.note);

    if (input.action === 'RETRY_JOB') {
      await transaction('bnpl', async (tx) => {
        await lock(tx, `manual-retry:${input.id}`);

        const result = await tx.job.updateMany({
          where: {
            id: input.id,
            status: { in: ['DEAD', 'RETRY'] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: { status: 'READY', availableAt: new Date(), leaseToken: null, leaseUntil: null },
        });

        invariant(
          result.count === 1,
          'INELIGIBLE_JOB',
          'Only failed, unleased jobs may be retried.',
        );

        await tx.audit.create({
          data: {
            actor: user.id,
            action: 'JOB_RETRIED',
            reference: input.id,
            detail: { note: input.note },
          },
        });
      });

      await wake();
    } else if (input.action === 'REPLAY_WEBHOOK') {
      // Bank state change and bank audit event commit together; the original event/operation ID survives.

      await transaction('bank', async (tx) => {
        await lock(tx, `replay:${input.id}`);

        const e = await tx.bankEvent.findUniqueOrThrow({ where: { id: input.id } });

        await tx.bankEvent.update({
          where: { id: e.id },
          data: { status: 'READY', availableAt: new Date() },
        });

        await tx.$executeRaw`INSERT INTO bank."Audit" (actor,action,reference,detail) VALUES (${user.id},'MANUAL_WEBHOOK_REPLAY',${e.operationId},jsonb_build_object('webhookEventId',${e.id}::text))`;
      });

      await wake();
    } else {
      await transaction('bnpl', async (tx) => {
        await tx.$executeRaw`INSERT INTO bnpl."ErrorReview" (id,status,note,actor) VALUES (${input.id},${input.status ?? 'ACKNOWLEDGED'},${input.note},${user.id}) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,actor=EXCLUDED.actor,"updatedAt"=clock_timestamp()`;

        await tx.audit.create({
          data: {
            actor: user.id,
            action: 'ERROR_REVIEWED',
            reference: input.id,
            detail: { status: input.status ?? 'ACKNOWLEDGED', note: input.note },
          },
        });
      });
    }

    return { accepted: true };
  }, request);
}
