# Investigating and recovering failures

## Unknown bank payment result

A timeout does not establish that the bank declined. Open the transaction, inspect the persisted bank operation and simulation record, and inspect the durable payment job. Keep the original operation ID. An eligible retry queries original bank status; a confirmed result finalizes the local state and balanced ledger atomically. Never create a replacement debit just to make an unknown result disappear.

## Failed webhook

Delivery success, signature-verified inbox acceptance, inbox processing and financial effect are separate evidence. Use Webhooks to inspect attempts, then the related transaction and collection journal. Replay the original event after correcting the transport/configuration issue. The durable inbox and unique economic journals prevent duplicate financial processing.

## Dead or interrupted job

Inspect kind, reference, attempts, schedule, lease expiry and history. A live lease cannot be manually stolen. Only a failed unleased job can be retried. Manual retry retains attempt history and the economic ID. A worker that crashed after a bank commit recovers by inquiry. An interrupted process may have no finish timestamp: lease expiry and subsequent claims provide the actual evidence.

## Financial mismatch

A reconciliation run with NEEDS_REVIEW is a critical finding. Read its unresolved references and compare authoritative bank state, unpaid installments and immutable journals. Do not edit journals or historical bank outcomes. Acknowledge the group while investigating; resolve it manually only with a note explaining verified evidence. Absence of recent errors is not resolution.

## Database transaction failure

Durable events participate in the business transaction and roll back with it. A separate safe diagnostic records an aborted transaction where the transaction wrapper observes it. Not every provider-level rollback is visible to application code. Read-only diagnostics expose no SQL console, and unavailable provider metrics are reported honestly.

All operational mutations require role checks, same-origin validation and confirmation. Audits retain the actor, target and outcome; bank replay audits commit with replay scheduling, job retry audits with job state, and reconciliation audit with its report.
