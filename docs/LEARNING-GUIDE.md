# Learning with actual CrediFlow events

Start at `/admin/operations/learning`. Its 24 curated topics explain HTTP, timeouts, status codes, webhooks, idempotency, transactions, ACID, atomicity, race conditions, locking, optimistic concurrency, distributed transactions, sagas, outbox/inbox, workers, backoff, dead letters, double-entry accounting, credit reservations, reconciliation, tracing, auditing and invariants. No AI API generates explanations.

Choose a transaction and read Simple mode first. Expand **Why did this happen?** to connect an event to its engineering concept. Switch to Technical mode to inspect exact type, timestamp, service, status, operation and safe metadata. Some fields are absent when the source did not record them; absence is preferable to invented timing or causes.

Try these exercises with fictional funds:

- Healthy purchase: identify submission, administrator decision, reservation, first installment, financing and collection journals.
- Lost response: select RESPONSE_LOST in the simulator, submit a payment, then follow PENDING_RECONCILIATION and original-ID worker recovery. Observe that a committed debit survives HTTP failure.
- Duplicate delivery: replay the same signed webhook and compare inbox delivery count with the one collection journal.
- Worker interruption: use the simulator checkpoint and inspect retained jobs, lease expiry and later attempts.
- Reconciliation: run a confirmed check and follow the persisted report plus purchase-level principal comparison events.

The simulator's configured percentages are probabilities across repeated trials. They are not guaranteed exact percentages in a small sample. One-shot scenarios provide reproducible demonstrations; persisted scenario/configuration version and measured latency explain an individual execution.

After each exercise answer: what committed, which identifier stayed stable, what the caller observed, what retried, and which database constraint prevented a duplicate effect? Use bank execution details and the transaction timeline as evidence.
