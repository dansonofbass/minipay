# Using the Operations Center

Sign into the BNPL administrator portal and choose **Operations center**. Customers and bank administrators cannot access the aggregate operational API or its exports. Bank administrators retain their existing bank simulator and execution logs.

| Page           | Persisted evidence and purpose                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| Overview       | Financial cohorts and observed transport metrics                                 |
| Events         | Structured business events across bank and BNPL                                  |
| Transactions   | Purchase/payment/job/webhook ID lookup and event timeline                        |
| API logs       | Method, route, status, duration, correlation, and observed latency bars          |
| Webhooks       | Outbox record, delivery attempts, verified inbox acceptance and processing       |
| Workers        | Durable status, attempts, schedule, lease expiry and attempt history             |
| Database       | Allowlisted connection checks, counts and unbalanced-journal diagnostics         |
| Reconciliation | Actual runs and unresolved findings                                              |
| Errors         | Persisted technical and durable failure groups, manual acknowledgment/resolution |
| Audit          | Append-only administrative history from both domains                             |
| Reports        | Authoritative aggregates, CSV and printable summary                              |
| Learning       | Curated deterministic explanations and related actual event records              |

Apply dates and an identifier to narrow an investigation. The default range is seven days, the maximum is 366 days. API logs also accept endpoint, status and minimum observed latency. Worker and webhook filters use their durable status values. Event queries support severity. Read the active-filter label before interpreting a result; different pages advertise their supported filters in the form.

Polling runs every 15 seconds while the tab is visible and can be paused. Manual refresh is always available. Simple and Technical mode switch locally without reloading. Technical details expand the sanitized persisted record. Timelines are paginated; inspect earlier pages to reach the start of a long workflow. Select the correlation link to open its related transaction.

Recovery actions require an explicit browser confirmation and investigation note. Retry only failed, unleased jobs. Replaying a webhook retains its event and economic operation IDs. The system never offers direct ledger edits, force-success or a new debit to recover an unknown outcome. All manual changes commit an audit record with the change. CSV exports record their actor and row count and neutralize spreadsheet formulas. Exports contain the authorized current page, not an unbounded database dump. Print reports using the print-summary button.

Database migration visibility can be unavailable under restricted credentials. Slow-query, provider CPU and lock metrics are explicitly unavailable until a provider integration exists. Empty results mean no matching records, not a healthy invented sample.
