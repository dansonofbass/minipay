import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { invariant } from '@/lib/http';
export const sections = [
  'overview',
  'events',
  'transactions',
  'api-logs',
  'webhooks',
  'workers',
  'database',
  'reconciliation',
  'errors',
  'audit',
  'reports',
  'learning',
] as const;
export type Section = (typeof sections)[number];
export type Filters = {
  q: string;
  severity: string;
  from: Date;
  to: Date;
  page: number;
  limit: number;
  status: string;
  route: string;
  minLatency: number;
};
export function parseFilters(params: URLSearchParams): Filters {
  const page = Number(params.get('page') ?? 1),
    limit = Number(params.get('limit') ?? 30);
  const from = new Date(params.get('from') || Date.now() - 7 * 86400000),
    to = new Date(params.get('to') || Date.now());
  invariant(
    Number.isInteger(page) &&
      page >= 1 &&
      page <= 100 &&
      Number.isInteger(limit) &&
      limit >= 1 &&
      limit <= 100 &&
      Number.isFinite(+from) &&
      Number.isFinite(+to) &&
      from <= to &&
      +to - +from <= 366 * 86400000,
    'INVALID_FILTER',
    'Use a valid range of at most 366 days and pages 1–100.',
    400,
  );
  const severity = params.get('severity') ?? '';
  invariant(
    !severity || ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'].includes(severity),
    'INVALID_FILTER',
    'Invalid severity',
    400,
  );
  const minLatency = Number(params.get('minLatency') || 0);
  invariant(
    Number.isFinite(minLatency) && minLatency >= 0,
    'INVALID_FILTER',
    'Invalid latency',
    400,
  );
  return {
    q: (params.get('q') ?? '').slice(0, 160),
    severity,
    from,
    to,
    page,
    limit,
    status: (params.get('status') ?? '').slice(0, 40),
    route: (params.get('route') ?? '').slice(0, 160),
    minLatency,
  };
}
export async function relatedIds(q: string) {
  if (!q) return [];
  let purchaseId = q;
  const payment = await db().payment.findUnique({
    where: { id: q },
    include: { installment: true },
  });
  const job = await db().job.findUnique({ where: { id: q } });
  const inbox = await db().inbox.findUnique({ where: { id: q } });
  if (payment) purchaseId = payment.installment.purchaseId;
  else if (job) {
    const p = await db().payment.findUnique({
      where: { id: job.reference },
      include: { installment: true },
    });
    purchaseId = p?.installment.purchaseId ?? job.reference.replace(/^approve:/, '');
  } else if (inbox) {
    const op = (inbox.payload as { operationId: string }).operationId;
    const p = await db().payment.findUnique({ where: { id: op }, include: { installment: true } });
    purchaseId = p?.installment.purchaseId ?? op.replace(/^approve:/, '');
  } else if (q.startsWith('approve:')) purchaseId = q.slice(8);
  const payments = await db().payment.findMany({
    where: { installment: { purchaseId } },
    select: { id: true },
    take: 1000,
  });
  return [
    ...new Set([
      q,
      purchaseId,
      `approve:${purchaseId}`,
      `release:${purchaseId}`,
      ...payments.map((p) => p.id),
    ]),
  ];
}
type Row = Record<string, unknown> & { id: string; createdAt: Date };
export async function eventRows(f: Filters, technical = false) {
  const ids = await relatedIds(f.q);
  if (technical && ids.length) {
    const contexts = await db().bnpl_OperationEvent.findMany({
      where: { OR: [{ correlationId: { in: ids } }, { operationId: { in: ids } }] },
      select: { requestId: true },
      take: 1000,
    });
    ids.push(...contexts.flatMap((c) => (c.requestId ? [c.requestId] : [])));
  }
  const table = technical ? 'TechnicalLog' : 'OperationEvent';
  const results = await Promise.all(
    (['bnpl', 'bank'] as const).map(async (domain) => {
      const name = Prisma.raw(`${domain}."${table}"`);
      const where = Prisma.sql`"createdAt">=${f.from} AND "createdAt"<=${f.to}
   ${f.severity ? Prisma.sql`AND severity=${f.severity}` : Prisma.empty}
   ${ids.length ? Prisma.sql`AND ("correlationId" IN (${Prisma.join(ids)}) ${technical ? Prisma.sql`OR "requestId" IN (${Prisma.join(ids)})` : Prisma.sql`OR "operationId" IN (${Prisma.join(ids)})`})` : Prisma.empty}
   ${technical && f.route ? Prisma.sql`AND metadata->>'route' LIKE ${`%${f.route}%`}` : Prisma.empty}
   ${technical && f.status ? Prisma.sql`AND metadata->>'httpStatus'=${f.status}` : Prisma.empty}
   ${technical ? Prisma.sql`AND COALESCE((metadata->>'durationMs')::numeric,0)>=${f.minLatency}` : Prisma.empty}`;
      const rows = await db(domain).$queryRaw<Row[]>(
        Prisma.sql`SELECT *, ${domain}::text AS source FROM ${name} WHERE ${where} ORDER BY "createdAt" DESC,id DESC LIMIT ${f.page * f.limit}`,
      );
      const [count] = await db(domain).$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) FROM ${name} WHERE ${where}`,
      );
      return { rows, count: Number(count.count) };
    }),
  );
  const rows = results
    .flatMap((r) => r.rows)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id));
  return {
    rows: rows.slice((f.page - 1) * f.limit, f.page * f.limit),
    total: results.reduce((n, r) => n + r.count, 0),
  };
}
export async function report(f: Filters) {
  const createdAt = { gte: f.from, lte: f.to };
  const [
    purchases,
    payments,
    principal,
    webhooks,
    duplicates,
    retries,
    reconciliations,
    recovered,
    api,
  ] = await Promise.all([
    db().purchase.groupBy({
      by: ['status'],
      where: { createdAt },
      _count: true,
      _sum: { total: true },
    }),
    db().payment.groupBy({ by: ['status'], where: { createdAt }, _count: true }),
    db().installment.aggregate({
      where: { status: { not: 'PAID' }, purchase: { status: { in: ['ACTIVE', 'COMPLETED'] } } },
      _sum: { amount: true },
    }),
    db('bank').bankEvent.groupBy({ by: ['status'], where: { createdAt }, _count: true }),
    db().inbox.aggregate({
      where: { receivedAt: createdAt },
      _sum: { deliveries: true },
      _count: true,
    }),
    db().jobAttempt.count({ where: { createdAt, status: { in: ['FAILED', 'INTERRUPTED'] } } }),
    db().reconciliation.groupBy({ by: ['status'], where: { createdAt }, _count: true }),
    db().audit.count({ where: { createdAt, action: 'PAYMENT_RECOVERED' } }),
    db('bank').$queryRaw<
      {
        requests: bigint;
        errors: bigint;
        average: number | null;
        p95: number | null;
        timeouts: bigint;
      }[]
    >`SELECT count(*) AS requests,count(*) FILTER(WHERE (metadata->>'httpStatus')::int>=500) AS errors,avg((metadata->>'durationMs')::numeric)::float8 AS average,percentile_cont(0.95) WITHIN GROUP(ORDER BY (metadata->>'durationMs')::numeric)::float8 AS p95,count(*) FILTER(WHERE metadata->>'httpStatus'='504' AND metadata->>'route'='/api/bank/v1/payments') AS timeouts FROM bank."TechnicalLog" WHERE type='HTTP_REQUEST' AND "createdAt">=${f.from} AND "createdAt"<=${f.to}`,
  ]);
  const [mismatches] = await db().$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM bnpl."Reconciliation" r CROSS JOIN LATERAL jsonb_array_elements(r.findings) f WHERE r."createdAt">=${f.from} AND r."createdAt"<=${f.to} AND f->>'resolved'='false'`;
  const total = purchases.reduce((n, p) => n + p._count, 0),
    rejected = purchases.filter((p) => p.status === 'REJECTED').reduce((n, p) => n + p._count, 0),
    approved = purchases
      .filter(
        (p) => !['PENDING_REVIEW', 'REJECTED', 'AWAITING_BANK_CONFIRMATION'].includes(p.status),
      )
      .reduce((n, p) => n + p._count, 0);
  const hooks = webhooks.reduce((n, w) => n + w._count, 0);
  return {
    purchaseRequests: total,
    approvalRate: total ? approved / total : null,
    rejectionRate: total ? rejected / total : null,
    totalPurchaseValueAMD: purchases.reduce((n, p) => n + (p._sum.total ?? 0n), 0n).toString(),
    currentOutstandingPrincipalAMD: (principal._sum.amount ?? 0n).toString(),
    successfulPayments: payments.find((p) => p.status === 'SUCCEEDED')?._count ?? 0,
    failedPayments: payments.find((p) => p.status === 'DECLINED')?._count ?? 0,
    paymentTimeouts: Number(api[0].timeouts),
    bankApiErrorRate: Number(api[0].requests)
      ? Number(api[0].errors) / Number(api[0].requests)
      : null,
    averageLatencyMs: api[0].average,
    p95LatencyMs: api[0].p95,
    webhookDeliverySuccessRate: hooks
      ? (webhooks.find((w) => w.status === 'DELIVERED')?._count ?? 0) / hooks
      : null,
    duplicateWebhooks: (duplicates._sum.deliveries ?? 0) - duplicates._count,
    workerRetries: retries,
    reconciliationRunsNeedingReview:
      reconciliations.find((r) => r.status === 'NEEDS_REVIEW')?._count ?? 0,
    recoveredPaymentCount: recovered,
    reconciliationMismatchCount: Number(mismatches.count),
    scope:
      'Purchase/payment cohorts use creation date; delivery cohorts use event creation date. Outstanding principal is current, across all dates. API metrics cover retained technical logs only.',
  };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function operationsData(section: Section, f: Filters) {
  const paging = { skip: (f.page - 1) * f.limit, take: f.limit };
  const dates = { gte: f.from, lte: f.to };
  if (['events', 'transactions', 'learning'].includes(section)) return eventRows(f);
  if (section === 'api-logs') return eventRows(f, true);
  if (section === 'reports' || section === 'overview')
    return { metrics: await report(f), rows: [], total: 0 };
  if (section === 'audit') {
    const sources = await Promise.all(
      (['bnpl', 'bank'] as const).map(async (domain) => {
        const where = Prisma.sql`"createdAt">=${f.from} AND "createdAt"<=${f.to} ${f.q ? Prisma.sql`AND (reference=${f.q} OR actor=${f.q} OR action LIKE ${'%' + f.q + '%'})` : Prisma.empty}`;
        const table = Prisma.raw(`${domain}."Audit"`);
        const rows = await db(domain).$queryRaw<Row[]>(
          Prisma.sql`SELECT *,${domain}::text AS service FROM ${table} WHERE ${where} ORDER BY "createdAt" DESC,id DESC LIMIT ${f.page * f.limit}`,
        );
        const [count] = await db(domain).$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM ${table} WHERE ${where}`,
        );
        return { rows, total: Number(count.count) };
      }),
    );
    const rows = sources
      .flatMap((s) => s.rows)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id));
    return {
      rows: rows.slice(paging.skip, paging.skip + f.limit),
      total: sources.reduce((n, s) => n + s.total, 0),
    };
  }
  if (section === 'workers') {
    const where = {
      createdAt: dates,
      ...(f.q ? { OR: [{ id: f.q }, { reference: f.q }] } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    const jobs = await db().job.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging });
    const attempts = await db().jobAttempt.findMany({
      where: { jobId: { in: jobs.map((j) => j.id) } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const transitions = await db().bnpl_OperationEvent.findMany({
      where: {
        OR: jobs.map((j) => ({ metadata: { path: ['jobId'], equals: j.id } })),
        type: { in: ['Job_RUNNING', 'Job_DONE', 'Job_RETRY', 'Job_DEAD'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return {
      rows: jobs.map(
        ({ leaseToken: _leaseToken, ...j }) => (
          void _leaseToken,
          {
            ...j,
            history: attempts.filter((a) => a.jobId === j.id),
            operationalStatus:
              (
                {
                  READY: 'QUEUED',
                  RUNNING: 'RUNNING',
                  RETRY: 'RETRY_SCHEDULED',
                  DONE: 'SUCCEEDED',
                  DEAD: 'DEAD_LETTERED',
                } as Record<string, string>
              )[j.status] ?? j.status,
            latestTransitions: transitions
              .filter((e) => (e.metadata as { jobId?: string }).jobId === j.id)
              .slice(0, 20),
            retryPolicy: '8 automatic attempts, exponential backoff, original operation ID',
          }
        ),
      ),
      total: await db().job.count({ where }),
    };
  }
  if (section === 'webhooks') {
    const ids = await relatedIds(f.q);
    const where = {
      createdAt: dates,
      ...(ids.length ? { OR: [{ id: f.q }, { operationId: { in: ids } }] } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    const events = await db('bank').bankEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paging,
    });
    const deliveries = await db('bank').delivery.findMany({
      where: { eventId: { in: events.map((e) => e.id) } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const inbox = await db().inbox.findMany({ where: { id: { in: events.map((e) => e.id) } } });
    const postingIds = await db().journal.findMany({
      where: { id: { in: events.map((e) => `payment:${e.operationId}`) } },
      select: { id: true },
    });
    return {
      rows: events.map(
        ({ payload: _payload, ...e }) => (
          void _payload,
          {
            ...e,
            financialEffectApplied: postingIds.some((p) => p.id === `payment:${e.operationId}`),
            signatureVerification: inbox.some((i) => i.id === e.id)
              ? 'VERIFIED'
              : 'NO_ACCEPTED_INBOX_RECORD',
            deliveries: deliveries.filter((d) => d.eventId === e.id),
            inbox: inbox
              .filter((i) => i.id === e.id)
              .map(({ payload: _payload, ...i }) => (void _payload, i)),
            explanation:
              'Delivery, verified acceptance, inbox processing and financial posting are distinct. Inspect the transaction to confirm the effect.',
          }
        ),
      ),
      total: await db('bank').bankEvent.count({ where }),
    };
  }
  if (section === 'reconciliation')
    return {
      rows: await db().reconciliation.findMany({
        where: { createdAt: dates },
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
      total: await db().reconciliation.count({ where: { createdAt: dates } }),
    };
  if (section === 'errors') {
    const results = await Promise.all(
      (['bnpl', 'bank'] as const).map((domain) =>
        db(domain).$queryRaw<Row[]>(
          Prisma.sql`SELECT COALESCE(code,type) || ':' || ${domain} || ':' || COALESCE(metadata->>'route','') || ':' || severity AS id,COALESCE(code,type) AS code,${domain} AS service,metadata->>'route' AS endpoint,severity,count(*) AS count,min("createdAt") AS "firstOccurrence",(array_agg("correlationId" ORDER BY "createdAt" DESC))[1] AS "correlationId",max("createdAt") AS "createdAt" FROM ${Prisma.raw(`${domain}."TechnicalLog"`)} WHERE severity IN ('ERROR','CRITICAL') AND "createdAt">=${f.from} AND "createdAt"<=${f.to} GROUP BY code,type,metadata->>'route',severity`,
        ),
      ),
    );
    const durable = await Promise.all(
      (['bnpl', 'bank'] as const).map((domain) =>
        db(domain).$queryRaw<Row[]>(
          Prisma.sql`SELECT type || ':' || ${domain} || ':durable' AS id,type AS code,${domain} AS service,severity,count(*) AS count,min("createdAt") AS "firstOccurrence",(array_agg("correlationId" ORDER BY "createdAt" DESC))[1] AS "correlationId",max("createdAt") AS "createdAt" FROM ${Prisma.raw(`${domain}."OperationEvent"`)} WHERE severity IN ('ERROR','CRITICAL') AND "createdAt">=${f.from} AND "createdAt"<=${f.to} GROUP BY type,severity LIMIT 1000`,
        ),
      ),
    );
    const groups = [...results.flat(), ...durable.flat()].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    const reviews = await db().$queryRaw<
      Record<string, unknown>[]
    >`SELECT * FROM bnpl."ErrorReview" WHERE id IN (${Prisma.join(groups.length ? groups.map((g) => g.id) : ['none'])})`;
    return {
      rows: groups
        .slice(paging.skip, paging.skip + f.limit)
        .map((g) => ({ ...g, review: reviews.find((r) => r.id === g.id) ?? { status: 'OPEN' } })),
      total: groups.length,
    };
  }
  const [connection, bankConnection, counts, unbalanced, migrations] = await Promise.all([
    db().$queryRaw`SELECT 1 AS connected`,
    db('bank').$queryRaw`SELECT 1 AS connected`,
    Promise.all([
      db().purchase.count(),
      db().payment.count(),
      db().journal.count(),
      db().job.count(),
    ]),
    db()
      .$queryRaw`SELECT j.id FROM bnpl."Journal" j LEFT JOIN bnpl."Entry" e ON e."journalId"=j.id GROUP BY j.id HAVING count(e.id)<2 OR COALESCE(sum(e.debit-e.credit),0)<>0 LIMIT 100`,
    db()
      .$queryRaw`SELECT migration_name,finished_at FROM public._prisma_migrations ORDER BY started_at DESC LIMIT 20`.catch(
      () => 'Unavailable to runtime role',
    ),
  ]);
  return {
    rows: [
      {
        id: 'database',
        connection,
        bankConnection,
        counts: { purchases: counts[0], payments: counts[1], journals: counts[2], jobs: counts[3] },
        unbalanced,
        migrations,
        slowQueries: 'Unavailable: provider query metrics are not configured',
        retention: 'Technical logs: 30 days; durable business events and audit: retained',
      },
    ],
    total: 1,
  };
}
