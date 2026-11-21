# CrediFlow browser-only demonstration

Use http://localhost:3000 for the running local application. A production address will be added only after deployment and verification. The engineer starts the required local processes; no terminal, Docker or Linux setup is required from the demo user.

## Sign in

Open `/login`. Use your private local demo password from `.local/demo-access.txt` with `alice@crediflow.demo` (customer), `admin@crediflow.demo` (BNPL administrator), or `bank@crediflow.demo` (bank administrator). Keep passwords private. Use separate browser profiles or sign out between roles; accounts cannot switch their own role. Additional fictional customer accounts can register and create their own initially empty bank account.

## Prepare the bank

1. Sign in as the bank administrator and open `/bank/accounts`.
2. Expand Alice's account. Set cash to `100000`, credit limit to `500000`, status Active, and enter a reason. Save the audited adjustment. Existing debt or reservations prevent lowering the limit below commitments.
3. Open `/bank/simulator`, choose Healthy and Save configuration. This disables probabilistic failures for the first demonstration. To show latency, enable injection, keep all transport probabilities zero, set base latency to 500 and random latency to zero, then save.
4. The simulator provides sliders and number fields for HTTP errors, pre-commit timeouts, committed-response loss, retryable errors, latency, webhook delay, duplication and failure. The four transport probabilities must total at most 100. An explicitly selected next-operation scenario is consumed once.

## Request and approve a purchase

1. Sign in as Alice. Open Explore products, select Studio Wireless Headphones at 240,000 AMD, and add one to the bag.
2. Choose four installments. Review the four 60,000 AMD payments and submit the request. Its status is Pending review. The server controls the price.
3. Sign in as the BNPL administrator. Open `/admin/requests` and expand Alice's request.
4. Click Check bank credit. Review cash, limit, available credit and observation timestamp.
5. Enter a decision reason and Approve request. The worker requests an atomic bank credit reservation. Wait for Approved awaiting payment; a transport problem can instead leave Awaiting bank confirmation until recovery.

## Confirm and repay

1. Return to Alice's My requests and confirm the first 60,000 AMD payment.
2. Wait for the worker and portal refresh. The purchase becomes Active, the first installment becomes Paid, cash becomes 40,000 AMD, principal becomes 180,000 AMD and available credit becomes 320,000 AMD. Reserved credit becomes zero.
3. Open My installments to pay later installments in order. The bank must have enough fictional cash; the bank administrator can make an audited top-up first.
4. Payment history shows actual persisted intents and declines. All installments paid changes the purchase to Completed.

## Reliability experiments

- **Duplicate clicks:** rapid repeated Pay requests refer to the same stored installment. Buttons help prevent mistakes, while backend locks and constraints prevent repeated effects. The automated integration test sends 100 concurrent HTTP requests; browser button disabling is not the correctness mechanism.
- **Duplicate webhooks:** open `/bank/webhooks` and replay a successful event. Repeat after delivery completes. `/admin/webhooks` counts repeat receipts while ledger postings remain unchanged.
- **Lost response after commit:** arm Response lost in `/bank/simulator`, save, then initiate the next payable installment. The bank commits once; BNPL records Pending reconciliation. Run `/admin/reconciliation` or wait for recovery. Confirm one bank debit and one posting in the transaction inspector.
- **Pre-commit timeout:** arm Timeout. The initial bank request has no confirmed financial result; the same intent is retried or reconciled. No new economic operation ID is created.
- **Worker interruption:** arm Worker crash before or after and save. The next approval/payment job stops at the selected checkpoint with its lease retained. Inspect `/admin/workers`, wait for the lease and a subsequent worker tick, and verify recovery with no repeated posting. This is a controlled interruption simulation.
- **Webhook failures:** set delivery failure probability to 100, save, and perform a payment. Inspect attempts and eventual dead delivery state. Restore Healthy, save, then replay the original event. Event-specific Webhook failure instead fails its first two attempts.
- **Out-of-order events:** arm Out of order before a payment. A success notification is followed by an older pending event. The authoritative bank inquiry preserves success.
- **Reconciliation:** open `/admin/reconciliation` and run it twice. Expand each run to inspect findings. Existing intentional fault-test records may be flagged; reports never invent clean matches.

## Inspect the evidence

`/bank/transactions` shows bank outcomes and journals; `/bank/logs` shows applied scenarios and latency. `/admin/transactions` shows payment intents, journal entries and persisted audit events. `/admin/workers` shows job attempts and failures. The portals refresh periodically and have a manual refresh control.

No refund, production reset, real bank linking, real payment collection or email-verification button is provided. These actions are not part of the verified implementation.
