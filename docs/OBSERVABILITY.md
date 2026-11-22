# CrediFlow observability

The Operations Center at `/admin/operations` is available to BNPL administrators. Every operational result comes from PostgreSQL records. Installation does not manufacture historical events. Existing purchases, payment records, audit, journals, jobs, simulation logs, inbox and outbox remain authoritative.

## Storage and reliability

Database triggers append `bnpl.OperationEvent` or `bank.OperationEvent` inside each business transaction. A rollback removes both the state change and its event. Events cover purchase and installment transitions, payment intents, audits, job attempts, inbox acceptance and duplicates, bank operations, reservations, outbox events, deliveries, journals, simulation outcomes and reconciliation. Identity triggers record registration and successful login without copying credentials. A worker crash after commit cannot lose its committed event.

Technical HTTP and transaction-failure diagnostics use `TechnicalLog`, independently of the financial transaction. Only allowlisted metadata is accepted. Ingestion errors are caught and emit a fixed fallback warning. No request bodies, authentication headers, full idempotency keys, cookies or arbitrary exception text are stored there. Business declines are informational state changes, authorization/validation failures are warnings, infrastructure failures are errors and unresolved financial reconciliation findings are critical.

Events and audit are append-only through runtime roles and database mutation triggers. Trigger writers use narrowly scoped SECURITY DEFINER functions with a fixed search path. A privileged database owner can change schema or history; these controls do not claim cryptographic immutability or protection against that owner.

## Verification

The integration suite uses real PostgreSQL and HTTP boundaries. It exercises a first installment whose debit commits before response loss, retries the original durable job, delivers a delayed signed webhook twice, repeats a payment request and verifies one collection journal. Separate tests cover pre-commit timeout, dead-job recovery, role isolation, filtering, pagination, CSV, rollback and noncritical telemetry ingestion failure. See `IMPLEMENTATION_STATUS.md` for the actual check results and remaining limitations.
