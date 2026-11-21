# Acceptance matrix

Checkpoint: 2026-11-21. VERIFIED below means local evidence only. All deployment-specific criteria remain NOT VERIFIED until tested on Vercel with managed PostgreSQL.

| Criterion                         | Status       | Evidence / limit                                                           |
| --------------------------------- | ------------ | -------------------------------------------------------------------------- |
| Persistent mock-bank accounts     | VERIFIED     | Real PostgreSQL records and browser API                                    |
| Authorized balance changes        | VERIFIED     | Audited adjustment API and integration fixtures                            |
| Credit-limit changes              | VERIFIED     | Bank-admin service and credit-in-use validation                            |
| Available credit arithmetic       | VERIFIED     | Alice example and credit-race assertions                                   |
| Atomic bank operations            | VERIFIED     | Transactions, constraints and debit race                                   |
| Configurable API failures         | VERIFIED     | Persisted simulator controls, transport classification                     |
| Configurable millisecond latency  | VERIFIED     | Simulator input and persisted simulation logs                              |
| Post-commit response loss         | VERIFIED     | Recovery integration test, one debit                                       |
| Customer registration/login       | VERIFIED     | Real HTTP registration and Chrome cookie login                             |
| Product browsing                  | VERIFIED     | Chrome catalog test                                                        |
| Purchase requests                 | VERIFIED     | Server-priced HTTP checkout tests                                          |
| Admin review                      | VERIFIED     | Credit-check requirement and manual decision API                           |
| Bank-provided credit inspection   | VERIFIED     | Timestamped persisted HTTP snapshot                                        |
| Approve and reject                | VERIFIED     | Decision state checks and seeded bank declines                             |
| Credit reservation                | VERIFIED     | Atomic reservation and competing-credit test                               |
| Installment schedules             | VERIFIED     | Remainders, calendar edge cases and persisted plan                         |
| Fictional installment payments    | VERIFIED     | First payment, decline, subsequent repayment                               |
| Payment idempotency               | VERIFIED     | Stable IDs, canonical hashes, conflict tests                               |
| Double-click safety               | VERIFIED     | 100 concurrent HTTP requests; one economic effect                          |
| Concurrent-request safety         | VERIFIED     | Same-installment, credit, debit and stock races                            |
| Duplicate webhook safety          | VERIFIED     | Five repeated signed receipts; one posting                                 |
| Out-of-order safety               | VERIFIED     | Stale pending payload cannot overwrite bank-confirmed success              |
| Timeout reconciliation            | VERIFIED     | Pending state recovered by original-ID inquiry                             |
| Interrupted worker recovery       | VERIFIED     | Expired lease, ten competing resumptions; controlled checkpoint simulation |
| Atomic local database changes     | VERIFIED     | PostgreSQL transactions and invariant constraints                          |
| Cross-domain recovery logic       | VERIFIED     | Query-before-resend and reconciliation tests                               |
| Balanced immutable ledgers        | VERIFIED     | Balance and mutation-rejection integration tests                           |
| Functional reconciliation         | VERIFIED     | Repeated runs without duplicate posting                                    |
| Role isolation                    | VERIFIED     | API and authenticated-route tests                                          |
| Customer ownership                | VERIFIED     | Different customer's payment denied                                        |
| Admin audit records               | VERIFIED     | Decisions, inquiries, retries and reconciliation persisted                 |
| Authenticated webhooks            | VERIFIED     | Valid, modified, unsigned and expired signature tests                      |
| Protected bank APIs               | VERIFIED     | Service bearer authorization test                                          |
| Server-controlled amounts         | VERIFIED     | Manipulated client price ignored                                           |
| No committed secrets              | VERIFIED     | Staged source pattern scan passed; ignored credentials excluded            |
| GitHub repository exists          | VERIFIED     | https://github.com/dansonofbass/minipay, user-published private repository |
| Production build                  | VERIFIED     | Actual Next.js build passed                                                |
| Managed persistent database       | NOT VERIFIED | Local PostgreSQL only; Neon connection unconfirmed                         |
| Live Vercel deployment            | NOT VERIFIED | Project exists; no deployment URL claimed                                  |
| Hosted authentication and portals | NOT VERIFIED | Local verification is not hosted evidence                                  |
| Hosted background jobs            | NOT VERIFIED | Queue configuration authored; entitlement/delivery not tested              |
| Hosted webhooks                   | NOT VERIFIED | Local real HTTP only                                                       |
| Complete browser demo on Vercel   | NOT VERIFIED | Browser walkthrough and local screenshots exist                            |

Broader limits, including email delivery, reset/refund workflows, monitoring and backups, are recorded in the implementation report.
