'use client';
import { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { learningTopics, explainEvent } from '@/modules/observability/learning';
const sections = [
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
];
type Row = Record<string, unknown>;
type Result = {
  rows: Row[];
  total: number;
  metrics?: Record<string, unknown>;
  updatedAt: string;
  freshness: string;
};
const title = (s: string) => s.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export function Operations({
  section,
  initialQuery = '',
}: {
  section: string;
  initialQuery?: string;
}) {
  const page = sections.includes(section) ? section : 'overview';
  const [data, setData] = useState<Result>(),
    [error, setError] = useState(''),
    [technical, setTechnical] = useState(false),
    [pending, setPending] = useState(false),
    [paused, setPaused] = useState(false);
  const [filters, setFilters] = useState({
      q: initialQuery,
      severity: '',
      from: '',
      to: '',
      status: '',
      route: '',
      minLatency: '',
    }),
    [active, setActive] = useState(filters),
    [number, setNumber] = useState(1);
  const [action, setAction] = useState<{ action: string; id: string; status?: string } | null>(
      null,
    ),
    [note, setNote] = useState('');
  const previousRecords = useRef<{ params: string; ids: Set<string> } | null>(null);
  const [newRecords, setNewRecords] = useState(0);
  const params = new URLSearchParams({
    section: page,
    page: String(number),
    ...Object.fromEntries(
      Object.entries(active)
        .filter(([, v]) => v)
        .map(([key, value]) => [
          key,
          ['from', 'to'].includes(key) ? new Date(value).toISOString() : value,
        ]),
    ),
  }).toString();
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/operations?${params}`, { cache: 'no-store', signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? 'Unable to load operations');
        const ids = new Set<string>(payload.data.rows.map((r: Row) => String(r.id)));
        setNewRecords(
          previousRecords.current?.params === params
            ? [...ids].filter((id) => !previousRecords.current!.ids.has(id)).length
            : 0,
        );
        previousRecords.current = { params, ids };
        setData(payload.data);
        setError('');
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError'))
          setError(e instanceof Error ? e.message : 'Unable to load operations');
      }
    },
    [params],
  );
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void refresh(controller.signal), 0);
    const interval = setInterval(() => {
      if (!paused && !document.hidden) void refresh(controller.signal);
    }, 15000);
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh, paused]);
  async function perform() {
    if (!action) return;
    setPending(true);
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...action, note, confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Action failed');
      setAction(null);
      setNote('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="operations-shell">
      <aside className="operations-nav">
        <Link href="/admin" className="operations-brand">
          CrediFlow <small>Administration</small>
        </Link>
        <p>OPERATIONS CENTER</p>
        <nav aria-label="Operations pages">
          {sections.map((s) => (
            <Link
              key={s}
              href={`/admin/operations/${s}`}
              aria-current={page === s ? 'page' : undefined}
            >
              {title(s)}
            </Link>
          ))}
        </nav>
        <Link href="/admin">Back to BNPL portal</Link>
      </aside>
      <main className="operations-main">
        <header>
          <div>
            <small>OBSERVABILITY & LEARNING</small>
            <h1>{title(page)}</h1>
            <p>Follow the evidence. Understand each financial step.</p>
          </div>
          <div className="operations-actions">
            <button className="button secondary" onClick={() => setTechnical(!technical)}>
              {technical ? 'Technical mode' : 'Simple mode'}
            </button>
            <button className="button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        </header>
        <div className="operations-freshness">
          <span>
            {newRecords > 0 ? `${newRecords} new records - ` : ''}
            {data?.updatedAt
              ? `Updated ${new Date(data.updatedAt).toLocaleString()}`
              : 'Loading persisted records…'}{' '}
            · {paused ? 'Polling paused' : 'Near-real-time · 15 second polling'}
          </span>
          <label>
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />{' '}
            Pause updates
          </label>
        </div>
        <form
          className="operations-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setNumber(1);
            setActive({ ...filters });
          }}
        >
          <label>
            Correlation / purchase / payment / job ID
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Search a durable identifier"
            />
          </label>
          <label>
            Severity
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            >
              <option value="">All severities</option>
              {['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          {['api-logs', 'workers', 'webhooks'].includes(page) && (
            <label>
              Status
              <input
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                placeholder={page === 'api-logs' ? '504' : 'RETRY'}
              />
            </label>
          )}
          {page === 'api-logs' && (
            <>
              <label>
                Endpoint
                <input
                  value={filters.route}
                  onChange={(e) => setFilters({ ...filters, route: e.target.value })}
                />
              </label>
              <label>
                Minimum latency (ms)
                <input
                  type="number"
                  min="0"
                  value={filters.minLatency}
                  onChange={(e) => setFilters({ ...filters, minLatency: e.target.value })}
                />
              </label>
            </>
          )}
          <button className="button" type="submit">
            Apply filters
          </button>
        </form>
        <p className="operations-caption">
          Active filters:{' '}
          {Object.entries(active)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ') || 'Last seven days · all records'}
          . All timestamps use your browser timezone.
        </p>
        {error && (
          <p role="alert" className="operations-error">
            {error}
          </p>
        )}
        <div className="operations-actions operations-toolbar">
          <a className="button secondary" href={`/api/operations?${params}&format=csv`}>
            Export this page as CSV
          </a>
          {['reports', 'overview'].includes(page) && (
            <button className="button secondary" onClick={() => window.print()}>
              Print summary
            </button>
          )}
          {page === 'reconciliation' && (
            <button
              className="button"
              onClick={() => setAction({ action: 'RECONCILE', id: 'all' })}
            >
              Run reconciliation
            </button>
          )}
        </div>
        {action && (
          <section
            className="operations-confirm"
            role="region"
            aria-label="Confirm operational action"
          >
            <h2>Confirm {title(action.action.toLowerCase())}</h2>
            <p>
              Target: <code>{action.id}</code>. This action is audited and preserves the original
              economic operation ID.
            </p>
            <label>
              Investigation note
              <input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="operations-actions">
              <button
                className="button"
                disabled={pending || note.trim().length < 4}
                onClick={() => void perform()}
              >
                {pending ? 'Processing…' : 'Confirm action'}
              </button>
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
        {data?.metrics && (
          <>
            <div className="operations-metrics">
              {Object.entries(data.metrics)
                .filter(([k]) => k !== 'scope')
                .map(([key, value]) => (
                  <article key={key}>
                    <small>{key.replace(/([A-Z])/g, ' $1')}</small>
                    <strong>
                      {value === null
                        ? 'Unavailable'
                        : key.toLowerCase().includes('rate')
                          ? `${(Number(value) * 100).toFixed(1)}%`
                          : typeof value === 'number'
                            ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : String(value)}
                    </strong>
                  </article>
                ))}
            </div>
            <p>{String(data.metrics.scope)}</p>
          </>
        )}
        {page === 'learning' && (
          <section className="operations-learning">
            <h2>Backend field guide</h2>
            <p>
              Curated explanations, connected to the persisted events below. No AI service is used.
            </p>
            {Object.entries(learningTopics).map(([topic, text]) => (
              <details key={topic}>
                <summary>{topic}</summary>
                <p>{text}</p>
              </details>
            ))}
          </section>
        )}
        {page === 'transactions' && (
          <p>
            Enter a purchase or payment ID to trace its related bank operations, workers, webhooks
            and ledger. Each entry below represents a persisted event; no historical steps are
            inferred.
          </p>
        )}
        {page === 'api-logs' && data && (
          <section className="operations-learning">
            <h2>Observed latency · current page</h2>
            {data.rows.map((r) => {
              const m = r.metadata as Record<string, unknown>;
              return (
                <div className="operations-latency" key={String(r.id)}>
                  <span>{String(m?.route ?? r.type)}</span>
                  <meter
                    min={0}
                    max={Math.max(
                      12000,
                      ...data.rows.map((x) => Number((x.metadata as Row)?.durationMs ?? 0)),
                    )}
                    value={Number(m?.durationMs ?? 0)}
                  />
                  <span>
                    {String(m?.durationMs ?? 0)} ms · HTTP {String(m?.httpStatus ?? 'unavailable')}
                  </span>
                </div>
              );
            })}
          </section>
        )}
        <section aria-label="Persisted operation records" className="operations-timeline">
          {(page === 'transactions' && active.q
            ? [...(data?.rows ?? [])].reverse()
            : data?.rows
          )?.map((row, index) => {
            const type = String(
                row.type ?? row.action ?? row.kind ?? row.code ?? row.status ?? page,
              ),
              status = String(row.status ?? '');
            const explanation = explainEvent(type, status);
            const id = String(row.id ?? index),
              date = row.createdAt ?? row.receivedAt ?? row.updatedAt;
            return (
              <article className="operations-event" key={`${id}:${index}`}>
                <div className="operations-event-heading">
                  <span
                    className={`operations-severity ${String(row.severity ?? 'INFO').toLowerCase()}`}
                  >
                    {String(row.severity ?? status ?? 'INFO')}
                  </span>
                  <time>
                    {date
                      ? new Date(String(date)).toLocaleString(undefined, {
                          fractionalSecondDigits: 3,
                        })
                      : 'Timestamp unavailable'}
                  </time>
                  <small>{String(row.service ?? row.source ?? page)}</small>
                </div>
                <h2>{technical ? type : explanation.simple}</h2>
                <p>
                  <code>{id}</code>
                </p>
                {row.correlationId != null && (
                  <Link
                    className="operations-link"
                    href={`/admin/operations/transactions?q=${encodeURIComponent(String(row.correlationId))}`}
                  >
                    Trace correlation {String(row.correlationId)}
                  </Link>
                )}
                {!technical && (
                  <details>
                    <summary>Why did this happen?</summary>
                    <p>{explanation.why}</p>
                  </details>
                )}
                <details open={technical}>
                  <summary>Technical details and authoritative record</summary>
                  <pre>{JSON.stringify(row, null, 2)}</pre>
                </details>
                {page === 'workers' && ['DEAD', 'RETRY'].includes(status) && (
                  <button
                    className="button secondary"
                    onClick={() => setAction({ action: 'RETRY_JOB', id })}
                  >
                    Retry original job
                  </button>
                )}
                {page === 'webhooks' && (
                  <button
                    className="button secondary"
                    onClick={() => setAction({ action: 'REPLAY_WEBHOOK', id })}
                  >
                    Replay original webhook
                  </button>
                )}
                {page === 'errors' && (
                  <>
                    <p>
                      Resolution: {String((row.review as Row)?.status ?? 'OPEN')}. Review related
                      logs and reconcile authoritative state before resolving.
                    </p>
                    <Link className="operations-link" href="/admin/operations/api-logs">
                      Inspect API logs
                    </Link>
                    <button
                      className="button secondary"
                      onClick={() => setAction({ action: 'REVIEW_ERROR', id })}
                    >
                      Acknowledge error
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setAction({ action: 'REVIEW_ERROR', id, status: 'RESOLVED' })}
                    >
                      Resolve with evidence
                    </button>
                  </>
                )}
              </article>
            );
          })}
          {data && data.rows.length === 0 && !data.metrics && (
            <div className="operations-empty">
              <h2>No persisted records in this range</h2>
              <p>
                Run a workflow or adjust filters. Events are recorded from installation onward;
                older history is available in authoritative records and audit.
              </p>
            </div>
          )}
        </section>
        {data && !data.metrics && (
          <footer className="operations-actions">
            <button
              className="button secondary"
              disabled={number <= 1}
              onClick={() => setNumber(number - 1)}
            >
              Previous
            </button>
            <span>
              Page {number} · {data.total} records
            </span>
            <button
              className="button secondary"
              disabled={number * 30 >= data.total}
              onClick={() => setNumber(number + 1)}
            >
              Next
            </button>
          </footer>
        )}
      </main>
    </div>
  );
}
