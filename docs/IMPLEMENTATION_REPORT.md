# Implementation report

Checkpoint: 2026-11-21. The core BNPL and Mock Bank milestone is implemented, published, deployed and tested end to end. This remains a fictional educational simulator with the broader limits below.

## Delivered

- Source: https://github.com/dansonofbass/minipay
- Live: https://crediflow-bnpl-simulator.vercel.app
- Customer `/app`, BNPL administrator `/admin`, Mock Bank `/bank`.
- Persistent managed Neon PostgreSQL, isolated runtime roles and five applied migrations.
- Authentication, catalog/cart, manual review, credit authorization, installments, payments and bank administration.
- Transactional financial correctness, immutable balanced journals, durable jobs, real signed webhooks and reconciliation.
- Fault simulator, operational inspectors, real metrics, API documentation, diagrams, CI and browser walkthrough.
- Private hosted demo access: ignored `.local/production-demo-access.txt`; no password is published.

## Evidence

The runtime-change [CI run passed](https://github.com/dansonofbass/minipay/actions/runs/44847350184): 20 unit tests, 18 real PostgreSQL/HTTP integration tests, 3 Playwright Chrome tests, lint, type checking, build, migrations, schema drift, seed, audit and credential-pattern checks.

Live testing verified registration, all three browser logins with zero JS errors, cart reload, automatic managed jobs, credit reservation, first installment activation, signed HTTP webhooks, five replays without another posting, committed-response-loss recovery by the original ID, and matching repeated reconciliation.

The hosted concurrency run sent 100 simultaneous Pay requests for one fictional installment: 100 successes, one intent, one bank debit journal and one BNPL collection journal. The test account ended at 40,000 AMD cash and 60,000 AMD principal. Seeded Alice's balances were preserved.

The first live recovery attempt found a genuine notification race: time-bucketed wakeup keys could suppress a later committed job in the same second. The key was corrected, a regression test added, and the original pending payment recovered across deployment. A fresh complete hosted run and 100-request test then passed. This initial failure was not reported as a success.

See `docs/verification/hosted-results.json`, `docs/TESTING.md`, `docs/ACCEPTANCE.md` and hosted screenshots for exact evidence scopes.

## Remaining limits

| Requirement                              | Status / limit                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Future automated production migrations   | NOT VERIFIED; current migrations applied, future release gates need scoped credentials |
| Email verification/recovery and MFA      | NOT VERIFIED; no delivery provider or MFA setup                                        |
| Global protected demo reset              | NOT VERIFIED; no destructive reset endpoint                                            |
| Refunds/reversals                        | NOT VERIFIED; require compensating accounting workflows                                |
| OS process-kill crash matrix             | NOT VERIFIED; lease interruptions, deployment recovery and unknown outcomes tested     |
| Sustained production capacity            | NOT VERIFIED; 100 duplicate requests are not a broad capacity benchmark                |
| External monitoring and restore exercise | NOT VERIFIED                                                                           |
| Next daily cron calendar firing          | NOT VERIFIED; configured, managed queue processing proven                              |

Bank fault probabilities are deliberate. Choose Healthy and save before the successful demonstration. No real banks, real money, credit bureaus or personal financial data are involved.

## Ownership and security

The private user-published minipay repository and its existing history were preserved. Subsequent commits use `dansonofbass`. The original Vercel project was reused. Neon uses the selected free plan; Vercel remains on Hobby, with no paid upgrade enabled. Quotas still apply.

Runtime contains only the explicitly authorized six application Secrets. Owner provisioning credentials and demo passwords remain outside runtime and version control. Temporary QA automation access was revoked after tests. The deployment runbook explains recovery and remaining operations work.
