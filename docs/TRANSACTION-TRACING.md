# Tracing a financial transaction

Use a purchase ID as the durable workflow root. A payment ID identifies one economic withdrawal; its bank operation uses that same ID. Reservation operation IDs are `approve:<purchaseId>`. Jobs use stable IDs such as `pay:<paymentId>`, and webhook inbox/outbox share an event ID.

Each HTTP handler establishes a new request ID and a trace ID. A validated correlation header propagates across the bank HTTP boundary; validated W3C traceparent headers preserve a trace across synchronous calls. Responses expose request and correlation IDs. Transaction helpers place request, trace, actor and correlation context into transaction-local PostgreSQL settings. Trigger events copy available context while linking purchases/payments through authoritative records. Background workers establish a fresh technical context and keep the durable operation reference. Webhook deliveries propagate the original bank operation ID.

Technical IDs are optional where database changes happen outside the contextual transaction helper. Durable financial references remain available. A workflow taking minutes can therefore be reconstructed even when no original technical trace remains. This implementation propagates trace context but does not install an OpenTelemetry exporter or invent missing spans.

## Investigation example

1. Open Transactions and enter a purchase or payment ID.
2. Find submission, administrator approval and credit reservation records.
3. Find payment creation and the bank operation. A SimulationLog with RESPONSE_LOST and committed=true records response loss after commit; a pre-commit TIMEOUT has no matching committed operation.
4. Inspect the job's failed attempt, next schedule and later successful attempt. Workers query original bank status before attempting its idempotent financial request.
5. Find PAYMENT_RECOVERED, journal creation and installment PAID state.
6. Inspect bank delivery and inbox acceptance/processing. Duplicate delivery increments inbox deliveries and produces a duplicate event; it does not imply another debit or collection.
7. Inspect PRINCIPAL_RECONCILED and the reconciliation run's actual findings.

Event timestamps come from database writes; latency comes from actual measured durations. Missing historical records are not reconstructed as fictional events. Database connections use UTC, and the browser formats display times in its local timezone.
