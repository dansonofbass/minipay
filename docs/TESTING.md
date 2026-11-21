# Testing evidence

Latest recorded local verification: 2026-11-21.

| Check                                            | Actual result                        |
| ------------------------------------------------ | ------------------------------------ |
| Prisma schema generation and five migrations     | PASS on real local PostgreSQL        |
| Production Next.js build                         | PASS                                 |
| TypeScript                                       | PASS                                 |
| ESLint                                           | PASS                                 |
| Unit tests                                       | 20 passed                            |
| PostgreSQL + real HTTP integration tests         | 18 passed                            |
| Playwright Chrome tests                          | 3 passed                             |
| Production dependency audit                      | 0 reported vulnerabilities           |
| GitHub Actions execution                         | PASS: main-branch run 44844067770    |
| Hosted database, Queues and Vercel browser flows | PASS; actual production verification |

Integration tests use the actual running Next.js server and PostgreSQL runtime roles. They create fictional accounts and operations and exercise registration, RBAC, CSRF, server-authoritative pricing, manual review, reservation, first payment, insufficient-cash decline, 100 concurrent requests, response-loss recovery, repeated reconciliation, duplicate/out-of-order notifications, expired worker leases, credit races, journal constraints, and schema isolation.

Worker interruption tests persist abandoned leases and replay jobs with ten simultaneous contenders; they do not claim an actual operating-system worker process was killed. Tests intentionally leave fictional evidence for operational inspection. Use an isolated test database in CI; do not run these tests against a shared production demo.

Playwright uses the installed Chrome channel and verifies real cookie login, customer catalog/cart, administrator dashboards, simulator save and mobile landing layout. Screenshots are in `docs/screenshots`. The first browser run had one ambiguous selector matching two links; the test selector was corrected and all three tests passed on rerun.

Additional gaps are listed in the implementation report. Passing these tests does not establish regulatory suitability, production load capacity, or hosted infrastructure availability.

## Hosted verification

Verified actual browser login for all three roles, cart reload, mobile layout, managed PostgreSQL isolation, automatic queue processing, five signed webhook replays, response-loss recovery and repeated matching reconciliation. A separate live run sent 100 concurrent Pay requests with one intent, one bank debit and one posting. The daily cron firing and sustained capacity remain unverified. See `docs/verification/hosted-results.json`.

A live lost-wakeup race was fixed with independent notification identities and a regression test for two mutations sharing a clock tick. The original pending operation survived deployment and recovered by its original ID.
