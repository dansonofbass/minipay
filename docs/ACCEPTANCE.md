# Acceptance matrix

Checkpoint: 2026-11-21. VERIFIED means actual evidence at the scope listed. Core deployment checks have now been exercised on Vercel with managed PostgreSQL; broader limits remain explicit.

| Criterion                         | Status   | Evidence / limit                                                           |
| --------------------------------- | -------- | -------------------------------------------------------------------------- |
| Persistent mock-bank accounts     | VERIFIED | Real PostgreSQL records and browser API                                    |
| Authorized balance changes        | VERIFIED | Audited adjustment API and integration fixtures                            |
| Credit-limit changes              | VERIFIED | Bank-admin service and credit-in-use validation                            |
| Available credit arithmetic       | VERIFIED | Alice example and credit-race assertions                                   |
| Atomic bank operations            | VERIFIED | Transactions, constraints and debit race                                   |
| Configurable API failures         | VERIFIED | Persisted simulator controls, transport classification                     |
| Configurable millisecond latency  | VERIFIED | Simulator input and persisted simulation logs                              |
| Post-commit response loss         | VERIFIED | Recovery integration test, one debit                                       |
| Customer registration/login       | VERIFIED | Real HTTP registration and Chrome cookie login                             |
| Product browsing                  | VERIFIED | Chrome catalog test                                                        |
| Purchase requests                 | VERIFIED | Server-priced HTTP checkout tests                                          |
| Admin review                      | VERIFIED | Credit-check requirement and manual decision API                           |
| Bank-provided credit inspection   | VERIFIED | Timestamped persisted HTTP snapshot                                        |
| Approve and reject                | VERIFIED | Decision state checks and seeded bank declines                             |
| Credit reservation                | VERIFIED | Atomic reservation and competing-credit test                               |
| Installment schedules             | VERIFIED | Remainders, calendar edge cases and persisted plan                         |
| Fictional installment payments    | VERIFIED | First payment, decline, subsequent repayment                               |
| Payment idempotency               | VERIFIED | Stable IDs, canonical hashes, conflict tests                               |
| Double-click safety               | VERIFIED | 100 local and 100 hosted requests; one economic effect                     |
| Concurrent-request safety         | VERIFIED | Same-installment, credit, debit and stock races                            |
| Duplicate webhook safety          | VERIFIED | Five repeated signed receipts; one posting                                 |
| Out-of-order safety               | VERIFIED | Stale pending payload cannot overwrite bank-confirmed success              |
| Timeout reconciliation            | VERIFIED | Pending state recovered by original-ID inquiry                             |
| Interrupted worker recovery       | VERIFIED | Expired lease, ten competing resumptions; controlled checkpoint simulation |
| Atomic local database changes     | VERIFIED | PostgreSQL transactions and invariant constraints                          |
| Cross-domain recovery logic       | VERIFIED | Query-before-resend and reconciliation tests                               |
| Balanced immutable ledgers        | VERIFIED | Balance and mutation-rejection integration tests                           |
| Functional reconciliation         | VERIFIED | Repeated runs without duplicate posting                                    |
| Role isolation                    | VERIFIED | API and authenticated-route tests                                          |
| Customer ownership                | VERIFIED | Different customer's payment denied                                        |
| Admin audit records               | VERIFIED | Decisions, inquiries, retries and reconciliation persisted                 |
| Authenticated webhooks            | VERIFIED | Valid, modified, unsigned and expired signature tests                      |
| Protected bank APIs               | VERIFIED | Service bearer authorization test                                          |
| Server-controlled amounts         | VERIFIED | Manipulated client price ignored                                           |
| No committed secrets              | VERIFIED | Staged source pattern scan passed; ignored credentials excluded            |
| GitHub repository exists          | VERIFIED | https://github.com/dansonofbass/minipay, user-published private repository |
| Production build                  | VERIFIED | Actual Next.js build passed                                                |
| Managed persistent database       | VERIFIED | Neon free_v3; restricted-role connectivity and isolation checked           |
| Live Vercel deployment            | VERIFIED | https://crediflow-bnpl-simulator.vercel.app, READY and health 200          |
| Hosted authentication and portals | VERIFIED | Three real Chrome cookie logins; zero browser JS errors                    |
| Hosted background jobs            | VERIFIED | Automatic reservation, payment, inbox/outbox and response-loss recovery    |
| Hosted webhooks                   | VERIFIED | Real signed delivery and five replays; one posting                         |
| Complete browser demo on Vercel   | VERIFIED | Core walkthrough and real hosted screenshots; broader limits in report     |

Broader limits, including email delivery, reset/refund workflows, monitoring and backups, are recorded in the implementation report.
