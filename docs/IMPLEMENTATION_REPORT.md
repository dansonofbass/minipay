# Implementation report

Checkpoint: 2026-11-21. The immediate runnable-application milestone is implemented and locally tested; the complete original production acceptance target is not yet achieved.

## Verified locally

Authentication and registration, database sessions, customer/admin/bank role isolation, customer ownership, origin checks, server-authoritative prices, product catalog, cart checkout, manual approval, bank credit checks, stock reservation, persistent bank accounts, audited adjustments, credit limits, frozen accounts, atomic reservations/debits, first-payment financing conversion, installment repayments, canonical idempotency, real bank HTTP boundaries, signed webhook intake/delivery, duplicate handling, unknown-outcome recovery, leased jobs, reconciliation, balanced immutable journals and three rendered portals.

Evidence: 19 unit tests, 18 PostgreSQL/HTTP integration tests, 3 Playwright Chrome tests, a passing production build, passing lint/type checks, and zero reported production dependency advisories after patched overrides. The integration test creates 100 concurrent first-payment requests and proves one bank debit and one BNPL payment journal. Browser screenshots are included. PostgreSQL-backed cart persistence, stored-payment activity charts, OpenAPI core contracts, and the Edward/Bob/Charlie/Diana demonstration workflow seed are also implemented and locally verified.

## Not verified or incomplete

| Requirement                                        | Status and limit                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed PostgreSQL                                 | NOT VERIFIED; Neon connection pending                                                                                                        |
| Vercel deployed application                        | NOT VERIFIED; existing project preserved, no live URL claimed                                                                                |
| Deployed Queues, heartbeat, cron, webhooks         | NOT VERIFIED; source configuration and local persistence tests exist                                                                         |
| Public email verification and password recovery    | NOT VERIFIED; email service not configured                                                                                                   |
| Automated production migrations                    | NOT VERIFIED; migration files and CI validation exist; production provisioning gate required                                                 |
| Protected demo reset                               | NOT VERIFIED; intentionally no destructive reset action implemented                                                                          |
| Refunds and payment reversals                      | NOT VERIFIED; no claimed economic reversal workflow                                                                                          |
| Full crash matrix / operating-system kill          | NOT VERIFIED; tested durable lease recovery and deterministic checkpoint interruption                                                        |
| Full stock/debit race matrix and load capacity     | NOT VERIFIED; tested same-installment, credit reservation, bank debit and last-unit stock races; production load capacity is not established |
| External error monitoring and backup restore tests | NOT VERIFIED                                                                                                                                 |

## External access

The user published https://github.com/dansonofbass/minipay through GitHub Desktop. Repository access and Git push credentials were verified under the normal Windows account. Future commits use the author name `dansonofbass`; existing history is preserved. The initial main-branch CI passed: https://github.com/dansonofbass/minipay/actions/runs/44844067770.

Vercel project identity is preserved and Node.js is configured to the locally tested 24.x runtime. No managed database integration or project environment variables are configured yet. Neon connection/provisioning is still pending.

No secrets are included in tracked source. Private local access is in ignored `.local/demo-access.txt`. The local application currently runs at http://localhost:3000 with real PostgreSQL. Source and documentation are prepared for further hosted verification; they are not evidence of a completed deployment.
