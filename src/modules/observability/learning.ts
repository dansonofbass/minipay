export const learningTopics: Record<string, string> = {
  'HTTP Requests and Responses':
    'A request asks a service to act or read state. A response describes what the caller observed. Use API logs to compare status and duration.',
  'API Timeouts':
    'A timeout is an unknown transport outcome. The bank may already have committed. Query the original operation before another debit.',
  'HTTP 4xx vs 5xx':
    '4xx usually means authorization, validation or a business constraint rejected the request. 5xx means the service could not fulfil the request. A business decline is not an infrastructure outage.',
  Webhooks:
    'The bank delivers signed event notifications. Delivered means HTTP succeeded; accepted means signature verified and inbox stored; processed means a worker handled it. Inspect ledger records to confirm the effect.',
  Idempotency:
    'A stable economic operation ID and unique database constraints make repeated requests converge on one result. A different HTTP request ID is not a new payment.',
  'Database Transactions':
    'Events, financial state and journals commit together. If validation fails the whole transaction rolls back; successful event rows never describe an uncommitted financial change.',
  ACID: 'Atomicity groups writes, consistency enforces constraints, isolation controls concurrency, and durability preserves commits after crashes.',
  Atomicity:
    'All changes inside a transaction commit together or roll back together. The event trigger participates in that same transaction.',
  'Race Conditions':
    'Two workers may observe the same pending payment. Locks, final-state checks and unique journals prevent both from charging or posting it twice.',
  'Row-Level Locking':
    'PostgreSQL updates lock affected rows. CrediFlow also uses transaction-scoped advisory locks to serialize a purchase workflow.',
  'Optimistic Concurrency':
    'The bank version is compared with the last applied version. An old confirmation cannot replace a newer result.',
  'Distributed Transactions':
    'The bank and BNPL use separate credentials and transactions. HTTP cannot make those commits atomic together; durable recovery closes the gap.',
  'Saga Pattern':
    'A workflow makes durable steps across services. Reservation release is a compensating step; posted payment history is never rewritten.',
  'Transactional Outbox':
    'The bank creates its event in the financial transaction. A separate delivery loop sends it later, so a process crash cannot erase the notification.',
  'Durable Inbox':
    'The receiver stores a verified event under a unique event ID. Duplicate deliveries increase the delivery count rather than duplicate a financial effect.',
  'Background Workers':
    'Database jobs survive process restarts. A lease lets another worker recover abandoned work after expiry.',
  'Retries and Exponential Backoff':
    'Failures schedule increasing delays with jitter. Workers inquire about the original operation before repeating its idempotent request.',
  'Dead Letter Queues':
    'After eight automatic attempts a job becomes DEAD. Inspect its transaction before requesting an audited retry under the same operation ID.',
  'Double-Entry Ledger':
    'Every journal has equal debits and credits. Deferred constraints reject incomplete or unbalanced journals at commit.',
  'Credit Reservations':
    'Approval reserves credit without immediately financing the full purchase. The first successful installment commits financing; expiry releases unused reservations.',
  Reconciliation:
    'Reconciliation compares local records with authoritative bank state, recovers missing confirmations and persists unresolved findings for review.',
  'Distributed Tracing':
    'Request IDs identify HTTP calls. Trace IDs link technical work. Durable purchase and payment IDs connect later workers and webhooks even after the original trace ends.',
  'Audit Logging':
    'Sensitive actions retain actor, target, timestamp and outcome. Database triggers and restricted roles prevent ordinary administrators changing posted history. A privileged database owner remains a trust boundary.',
  'Financial Invariants':
    'Cash and credit cannot be negative, used plus reserved credit cannot exceed the limit, and a paid installment has one economic collection.',
};
export function explainEvent(type: string, status?: string) {
  if (/TIMEOUT|RESPONSE_LOST/.test(type)) return {simple:'The bank HTTP response was not received successfully. Check the persisted bank operation before any recovery action.',why:learningTopics['API Timeouts']};
  if (/HTTP_ERROR|OFFLINE|INTERNAL|WORKER_EXECUTION_FAILED/.test(type)) return {simple:'A service or worker could not complete this attempt. Inspect the related transaction and original operation status before an eligible retry.',why:learningTopics['Background Workers']};
  if (/DUPLICATE|IDEMPOTENCY/.test(type))
    return {
      simple: 'A repeated request was recognized. The original operation remains authoritative.',
      why: learningTopics.Idempotency,
    };
  if (/OUTCOME_UNKNOWN|PENDING_RECONCILIATION/.test(type + status))
    return {
      simple:
        'The bank result is uncertain. The system will check the original operation before another withdrawal.',
      why: learningTopics['API Timeouts'],
    };
  if (/SimulationLog/.test(type))
    return {
      simple:
        'The bank recorded the selected simulation scenario and observed HTTP result. Open technical details to see whether the bank committed.',
      why: 'A lost HTTP response does not undo a committed bank transaction. Small samples do not guarantee configured probability percentages.',
    };
  if (/Job|RETRIED/.test(type))
    return {
      simple: 'The durable worker recorded its progress for the original operation.',
      why: learningTopics['Retries and Exponential Backoff'],
    };
  if (/LEDGER|Journal/.test(type))
    return {
      simple: 'A balanced financial journal was stored with the financial state change.',
      why: learningTopics['Double-Entry Ledger'],
    };
  if (/WEBHOOK|BankEvent|Delivery/.test(type))
    return {
      simple: 'A webhook delivery or inbox processing step was recorded.',
      why: learningTopics.Webhooks,
    };
  if (/RECONCIL|Reconciliation/.test(type))
    return {
      simple: 'A reconciliation check recorded its findings.',
      why: learningTopics.Reconciliation,
    };
  if (/APPROVED|CREDIT_RESERVED/.test(type))
    return {
      simple: 'The purchase approval or credit reservation step was recorded.',
      why: learningTopics['Credit Reservations'],
    };
  if (/Payment/.test(type))
    return {
      simple: `The payment record was ${status === 'SUCCEEDED' ? 'confirmed successful' : status === 'DECLINED' ? 'declined by the bank' : 'updated'}.`,
      why: learningTopics.Idempotency,
    };
  if (/PURCHASE_SUBMITTED|Purchase_CREATED/.test(type))
    return {
      simple: 'The customer purchase request was stored.',
      why: learningTopics['Database Transactions'],
    };
  return {
    simple:
      type
        .replaceAll('_', ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase() + '.',
    why: learningTopics['Audit Logging'],
  };
}
