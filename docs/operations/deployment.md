# Deployment and operational runbook

The existing Vercel project is `crediflow-bnpl-simulator`; do not recreate it. Local linkage preserves project ID `prj_v8VfBDmVwEJYWKLUZpNkLt8bBb5a`. The verified canonical application is https://crediflow-bnpl-simulator.vercel.app.

## Provisioned resources

Neon resource `crediflow-postgres` is provisioned on free_v3. Five migrations, restricted runtime roles and schema-specific grants were applied and verified. Temporary owner binding was removed. Owner credentials stay outside application runtime. The local PostgreSQL cluster is development-only.

The source repository is https://github.com/dansonofbass/minipay, published privately by the user through GitHub Desktop. Preserve its existing visibility and history. Normal Windows-user Git access is verified; commits made during this work use `dansonofbass`. The initial CI run passed.

Production stores the explicitly authorized six Secrets: DATABASE_URL, BANK_DATABASE_URL, BETTER_AUTH_SECRET, BANK_SERVICE_SECRET, WEBHOOK_SECRET and CRON_SECRET. The application discovers its canonical origin from Vercel system metadata; APP_URL/BETTER_AUTH_URL can override it. Owner and demo-password credentials are not runtime settings. Private hosted demo access is in ignored `.local/production-demo-access.txt`.

The Queues consumer is registered in `vercel.json`. It stores jobs before enqueueing, processes leases idempotently, and sends delayed heartbeat messages based on the next job or outbox deadline. Idle wakeups are fifteen minutes apart; pending work wakes sooner. The daily cron authenticates using `CRON_SECRET`, reconciles, and wakes the queue. Managed queue execution, automatic recovery and signed HTTP delivery were verified. The next daily cron calendar firing has not been waited for. Deployment Protection must allow the authenticated internal bank and webhook calls through an authorized supported mechanism; do not disable protections as a workaround without authorization.

## Costs and limits

Prefer the free Neon plan and existing Vercel plan. No paid upgrade has been enabled. Neon advertises free-plan compute and storage limits; the selected resource is on free_v3. Vercel Queues has usage-based operations and retention limits, and the heartbeat consumes ongoing invocations even when idle. Confirm account quotas and budget controls before enabling persistent hosted scheduling. See [Neon pricing](https://neon.com/pricing) and [Vercel Queues pricing](https://vercel.com/docs/queues/pricing); no unlimited-free assumption is made.

## Recovery

Unknown payment: keep its original intent ID, run reconciliation, inspect the authoritative bank operation and retry the durable job only if needed. Never create another payment to compensate for a missing HTTP response.

Dead job: inspect last error and immutable payment history, correct the service configuration, then use `/admin/workers` to retry. Running jobs recover after their lease expires. Expired unused reservations are released by reconciliation; committed financing cannot be released.

Dead webhook: correct signing or delivery configuration, then replay the same event from `/bank/webhooks`. Inbox IDs prevent repeated effects. Rotate keys by configuring the new current and old previous secret, then retire the previous secret after the replay window and pending-delivery review.

Reconciliation mismatch: inspect findings and both journals; preserve history. Refund/reversal workflows are not implemented. Do not edit posted records or erase mismatches to make a report look clean.

Backup restore testing and external monitoring remain pending. Actual deployed smoke, financial and browser tests passed. `/api/health` checks both runtime database connections; it does not prove Queues delivery.
