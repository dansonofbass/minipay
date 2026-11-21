# Deployment and operational runbook

The existing Vercel project is `crediflow-bnpl-simulator`; do not recreate it. Local linkage preserves project ID `prj_v8VfBDmVwEJYWKLUZpNkLt8bBb5a`. No live deployment URL is reported because deployment has not succeeded yet.

## Remaining external steps

Authorize the Neon integration to provision a managed PostgreSQL database. Generate separate runtime roles, apply the migration history using the owner connection, and apply schema-specific grants. Keep the owner connection out of application runtime settings. The local PostgreSQL cluster is development-only.

The source repository is https://github.com/dansonofbass/minipay, published privately by the user through GitHub Desktop. Preserve its existing visibility and history. Normal Windows-user Git access is verified; commits made during this work use `dansonofbass`. The initial CI run passed.

Production environment settings need `DATABASE_URL`, `BANK_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `BANK_SERVICE_SECRET`, `WEBHOOK_SECRET`, and `CRON_SECRET`. A previous signing secret is optional for rotation. Migration and seed secrets belong only in the authorized provisioning environment. Use a separate private production demo password and seed explicitly once; normal deploys never reset seed data.

The Queues consumer is registered in `vercel.json`. It stores jobs before enqueueing, processes leases idempotently, and sends delayed heartbeat messages based on the next job or outbox deadline. Idle wakeups are fifteen minutes apart; pending work wakes sooner. The daily cron authenticates using `CRON_SECRET`, reconciles, and wakes the queue. Verify Queues entitlement, cron delivery, heartbeat recovery and webhook HTTP access in the target account. Deployment Protection must allow the authenticated internal bank and webhook calls through an authorized supported mechanism; do not disable protections as a workaround without authorization.

## Costs and limits

Prefer the free Neon plan and existing Vercel plan. No paid upgrade has been enabled. Neon advertises free-plan compute and storage limits; confirm the actual selected plan before provisioning. Vercel Queues has usage-based operations and retention limits, and the heartbeat consumes ongoing invocations even when idle. Confirm account quotas and budget controls before enabling persistent hosted scheduling. See [Neon pricing](https://neon.com/pricing) and [Vercel Queues pricing](https://vercel.com/docs/queues/pricing); no unlimited-free assumption is made.

## Recovery

Unknown payment: keep its original intent ID, run reconciliation, inspect the authoritative bank operation and retry the durable job only if needed. Never create another payment to compensate for a missing HTTP response.

Dead job: inspect last error and immutable payment history, correct the service configuration, then use `/admin/workers` to retry. Running jobs recover after their lease expires. Expired unused reservations are released by reconciliation; committed financing cannot be released.

Dead webhook: correct signing or delivery configuration, then replay the same event from `/bank/webhooks`. Inbox IDs prevent repeated effects. Rotate keys by configuring the new current and old previous secret, then retire the previous secret after the replay window and pending-delivery review.

Reconciliation mismatch: inspect findings and both journals; preserve history. Refund/reversal workflows are not implemented. Do not edit posted records or erase mismatches to make a report look clean.

Backups, restore testing, managed monitoring and actual deployed smoke tests remain pending. `/api/health` checks both runtime database connections; it does not prove Queues delivery.
