import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { sign } from '@/modules/webhooks/signature';
import { defaults } from '@/modules/banking/simulator';
import { runJob } from '@/modules/jobs/worker';
import { Client } from 'pg';
const base = process.env.APP_URL ?? 'http://localhost:3000';
const testId = randomUUID(),
  email = `test-${testId}@crediflow.demo`;
let customerCookie = '',
  adminCookie = '',
  bankCookie = '',
  otherCustomerCookie = '',
  customerId = '',
  accountId = '',
  purchaseId = '',
  firstId = '',
  secondId = '',
  secondPaymentId = '';
const password = process.env.DEMO_PASSWORD!;
async function call(
  path: string,
  body?: unknown,
  cookie = '',
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: base,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { html: text };
  }
  return { response, result };
}
async function action(cookie: string, body: unknown) {
  const result = await call('/api/actions', body, cookie);
  expect(result.response.status, JSON.stringify(result.result)).toBe(200);
  return result.result.data;
}
async function login(email: string) {
  const { response, result } = await call('/api/auth/sign-in/email', { email, password });
  expect(response.status, JSON.stringify(result)).toBe(200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
async function worker() {
  const { response, result } = await call('/api/internal/tick', undefined, '', {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
  });
  expect(response.status, JSON.stringify(result)).toBe(200);
}
async function healthy(nextScenario: string | null = null) {
  return action(bankCookie, {
    action: 'SAVE_SIMULATOR',
    config: { ...defaults, simulationEnabled: false, webhookDelayMs: 0 },
    nextScenario,
  });
}
async function adjust(cash: string) {
  return action(bankCookie, {
    action: 'ADJUST_ACCOUNT',
    id: randomUUID(),
    accountId,
    cash,
    creditLimit: '500000',
    status: 'ACTIVE',
    reason: 'Automated fictional integration fixture',
  });
}
describe.sequential('real PostgreSQL and HTTP financial workflows', () => {
  beforeAll(async () => {
    adminCookie = await login('admin@crediflow.demo');
    bankCookie = await login('bank@crediflow.demo');
    otherCustomerCookie = await login('alice@crediflow.demo');
    const { response, result } = await call('/api/auth/sign-up/email', {
      email,
      password,
      name: `Test ${testId}`,
      role: 'BANK_ADMIN',
    });
    expect(response.status, JSON.stringify(result)).toBe(200);
    customerCookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    customerId = result.user.id;
    const user = await db().user.findUniqueOrThrow({ where: { id: customerId } });
    expect(user.role).toBe('CUSTOMER');
    await healthy();
    const link = await action(customerCookie, { action: 'LINK_BANK' });
    accountId = link.accountId;
    await adjust('100000');
  });
  afterAll(async () => {
    await healthy();
    await db().$disconnect();
    await db('bank').$disconnect();
  });
  it('requires authentication and enforces all three roles', async () => {
    expect((await call('/api/portal')).response.status).toBe(401);
    expect((await call('/api/bank/v1/accounts/account-alice')).response.status).toBe(401);
    expect(
      (await call('/api/actions', { action: 'RECONCILE' }, customerCookie)).response.status,
    ).toBe(403);
    expect(
      (await call('/api/actions', { action: 'ADJUST_ACCOUNT', accountId }, adminCookie)).response
        .status,
    ).toBe(403);
    const route = await call('/bank', undefined, customerCookie);
    expect(route.response.status).toBe(307);
    expect(route.response.headers.get('location')).toBe('/app');
  });
  it('blocks cross-origin mutations', async () => {
    const response = await fetch(`${base}/api/actions`, {
      method: 'POST',
      headers: {
        cookie: customerCookie,
        'content-type': 'application/json',
        origin: 'https://untrusted.invalid',
      },
      body: JSON.stringify({ action: 'LINK_BANK' }),
    });
    expect(response.status).toBe(403);
  });
  it('uses server prices and persists checkout idempotency conflicts', async () => {
    const key = randomUUID(),
      body = {
        action: 'CHECKOUT',
        key,
        count: 4,
        items: [{ productId: 'product-01', quantity: 1, price: 1 }],
        total: '1',
      };
    const p = await action(customerCookie, body);
    purchaseId = p.id;
    expect(p.total).toBe('240000');
    expect(p.status).toBe('PENDING_REVIEW');
    expect((await action(customerCookie, body)).id).toBe(purchaseId);
    expect(
      (await call('/api/actions', { ...body, count: 6 }, customerCookie)).response.status,
    ).toBe(409);
  });
  it('requires a bank check and manual administrator approval', async () => {
    expect(
      (
        await call(
          '/api/actions',
          { action: 'DECIDE', id: purchaseId, approve: true, reason: 'Approve test' },
          adminCookie,
        )
      ).response.status,
    ).toBe(409);
    const credit = await action(adminCookie, { action: 'CHECK_CREDIT', id: purchaseId });
    expect(credit.availableCredit).toBe('500000');
    await action(adminCookie, {
      action: 'DECIDE',
      id: purchaseId,
      approve: true,
      reason: 'Approved fictional test eligibility',
    });
    await worker();
    const p = await db().purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { installments: { orderBy: { number: 'asc' } } },
    });
    expect(p.status).toBe('APPROVED_AWAITING_PAYMENT');
    expect(p.installments.map((i) => i.amount)).toEqual([60000n, 60000n, 60000n, 60000n]);
    firstId = p.installments[0].id;
    secondId = p.installments[1].id;
    expect(
      (await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } })).reserved,
    ).toBe(240000n);
  });
  it('persists an owned cart in PostgreSQL', async () => {
    await action(customerCookie, { action: 'SET_CART_ITEM', productId: 'product-20', quantity: 2 });
    expect(
      (
        await db().cartItem.findUniqueOrThrow({
          where: { userId_productId: { userId: customerId, productId: 'product-20' } },
        })
      ).quantity,
    ).toBe(2);
    const portal = await call('/api/portal', undefined, customerCookie);
    expect(portal.result.data.cart).toContainEqual(
      expect.objectContaining({ productId: 'product-20', quantity: 2 }),
    );
    await action(customerCookie, { action: 'SET_CART_ITEM', productId: 'product-20', quantity: 0 });
  });
  it('turns 100 concurrent pay requests into exactly one economic debit', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        call(
          '/api/actions',
          { action: 'PAY', installmentId: firstId, key: randomUUID() },
          customerCookie,
        ),
      ),
    );
    for (const r of results) expect(r.response.status, JSON.stringify(r.result)).toBe(200);
    expect(new Set(results.map((r) => r.result.data.id)).size).toBe(1);
    await worker();
    const account = await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.cash).toBe(40000n);
    expect(account.used).toBe(180000n);
    expect(account.reserved).toBe(0n);
    expect(account.creditLimit - account.used - account.reserved).toBe(320000n);
    expect(await db().payment.count({ where: { installmentId: firstId } })).toBe(1);
    const payment = await db().payment.findFirstOrThrow({ where: { installmentId: firstId } });
    expect(await db('bank').bankJournal.count({ where: { id: `cash:${payment.id}` } })).toBe(1);
    expect(await db().journal.count({ where: { id: `payment:${payment.id}` } })).toBe(1);
    expect((await db().purchase.findUniqueOrThrow({ where: { id: purchaseId } })).status).toBe(
      'ACTIVE',
    );
  });
  it('enforces ownership and idempotency conflicts on payment endpoints', async () => {
    expect(
      (
        await call(
          '/api/actions',
          { action: 'PAY', installmentId: firstId, key: randomUUID() },
          otherCustomerCookie,
        )
      ).response.status,
    ).toBe(403);
    const other = await db().installment.findFirst({
      where: { purchase: { customerId: { not: customerId } } },
    });
    if (other)
      expect(
        (
          await call(
            '/api/actions',
            { action: 'PAY', installmentId: other.id, key: randomUUID() },
            customerCookie,
          )
        ).response.status,
      ).toBe(403);
    const key = randomUUID();
    await action(customerCookie, { action: 'PAY', installmentId: firstId, key });
    expect(
      (await call('/api/actions', { action: 'PAY', installmentId: secondId, key }, customerCookie))
        .response.status,
    ).toBe(409);
  });
  it('does not reduce debt for a declined insufficient-cash payment', async () => {
    const p = await action(customerCookie, {
      action: 'PAY',
      installmentId: secondId,
      key: randomUUID(),
    });
    await worker();
    expect((await db().payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('DECLINED');
    expect(
      (await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } })).used,
    ).toBe(180000n);
    expect(await db().journal.count({ where: { id: `payment:${p.id}` } })).toBe(0);
  });
  it('recovers a post-commit lost response without a second debit', async () => {
    await adjust('160000');
    await healthy('RESPONSE_LOST');
    const payment = await action(customerCookie, {
      action: 'PAY',
      installmentId: secondId,
      key: randomUUID(),
    });
    secondPaymentId = payment.id;
    await worker();
    expect((await db().payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'PENDING_RECONCILIATION',
    );
    const account = await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.cash).toBe(100000n);
    expect(account.used).toBe(120000n);
    await action(adminCookie, { action: 'RECONCILE' });
    await action(adminCookie, { action: 'RECONCILE' });
    expect((await db().payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'SUCCEEDED',
    );
    expect(
      (await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } })).cash,
    ).toBe(100000n);
    expect(await db().journal.count({ where: { id: `payment:${payment.id}` } })).toBe(1);
  });
  it('accepts five authentic duplicate webhooks and ignores stale pending payloads', async () => {
    const event = await db('bank').bankEvent.findFirstOrThrow({
      where: { operationId: secondPaymentId },
    });
    const body = JSON.stringify(event.payload),
      timestamp = String(Date.now());
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/api/webhooks/bank`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bank-timestamp': timestamp,
          'x-bank-signature': sign(body, timestamp, process.env.WEBHOOK_SECRET!),
        },
        body,
      });
      expect(r.status).toBe(200);
    }
    const stale = {
      ...(event.payload as object),
      eventId: randomUUID(),
      status: 'PENDING',
      type: 'payment.pending',
      version: 1,
    };
    const raw = JSON.stringify(stale);
    expect(
      (
        await fetch(`${base}/api/webhooks/bank`, {
          method: 'POST',
          headers: {
            'x-bank-timestamp': timestamp,
            'x-bank-signature': sign(raw, timestamp, process.env.WEBHOOK_SECRET!),
          },
          body: raw,
        })
      ).status,
    ).toBe(200);
    await worker();
    expect(
      (await db().inbox.findUniqueOrThrow({ where: { id: event.id } })).deliveries,
    ).toBeGreaterThanOrEqual(5);
    expect((await db().payment.findUniqueOrThrow({ where: { id: secondPaymentId } })).status).toBe(
      'SUCCEEDED',
    );
    expect(await db().journal.count({ where: { id: `payment:${secondPaymentId}` } })).toBe(1);
  });
  it('recovers expired worker leases before a request and after ledger commit', async () => {
    const payment = await db().payment.findFirstOrThrow({
      where: { installmentId: firstId, status: 'SUCCEEDED' },
    });
    for (const phase of ['BEFORE', 'AFTER']) {
      await healthy(`WORKER_CRASH_${phase}`);
      const id = `recovery-test:${randomUUID()}`;
      await db().job.create({ data: { id, kind: 'PAYMENT', reference: payment.id } });
      await runJob(id);
      const abandoned = await db().job.findUniqueOrThrow({ where: { id } });
      expect(abandoned.status).toBe('RUNNING');
      expect(abandoned.error).toContain('interruption');
      await db().job.update({ where: { id }, data: { leaseUntil: new Date(0) } });
      await Promise.all(Array.from({ length: 10 }, () => runJob(id)));
      const completed = await db().job.findUniqueOrThrow({ where: { id } });
      expect(completed.status).toBe('DONE');
      expect(completed.attempts).toBe(2);
      expect(await db().journal.count({ where: { id: `payment:${payment.id}` } })).toBe(1);
    }
    await healthy();
  });
  it('rejects unsigned and expired webhooks', async () => {
    expect((await call('/api/webhooks/bank', { status: 'SUCCEEDED' })).response.status).toBe(401);
    const body = '{}',
      timestamp = String(Date.now() - 600000);
    expect(
      (
        await fetch(`${base}/api/webhooks/bank`, {
          method: 'POST',
          headers: {
            'x-bank-timestamp': timestamp,
            'x-bank-signature': sign(body, timestamp, process.env.WEBHOOK_SECRET!),
          },
          body,
        })
      ).status,
    ).toBe(401);
  });
  it('prevents concurrent reservations from exceeding available credit', async () => {
    const op = (id: string) =>
      call(
        '/api/bank/v1/credit/reservations',
        { id, accountId, kind: 'RESERVE', amount: '250000', purchaseId: id },
        '',
        { authorization: `Bearer ${process.env.BANK_SERVICE_SECRET}` },
      );
    const results = await Promise.all([op(`race-a-${testId}`), op(`race-b-${testId}`)]);
    expect(results.map((r) => r.result.data.status).sort()).toEqual(['DECLINED', 'SUCCEEDED']);
    const a = await db('bank').bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(a.creditLimit - a.used - a.reserved).toBeGreaterThanOrEqual(0n);
  });
  it('serializes competing withdrawals and rejects conflicting bank operation reuse', async () => {
    const service = { authorization: `Bearer ${process.env.BANK_SERVICE_SECRET}` };
    const created = await call(
      '/api/bank/v1/accounts',
      { customerId: `race-${testId}`, name: 'Fictional debit race' },
      '',
      service,
    );
    expect(created.response.status).toBe(200);
    const id = created.result.data.id;
    await action(bankCookie, {
      action: 'ADJUST_ACCOUNT',
      id: randomUUID(),
      accountId: id,
      cash: '100000',
      creditLimit: '500000',
      status: 'ACTIVE',
      reason: 'Concurrent debit fixture',
    });
    const reserveIds = [`debit-race-a-${testId}`, `debit-race-b-${testId}`];
    for (const operationId of reserveIds) {
      const r = await call(
        '/api/bank/v1/credit/reservations',
        {
          id: operationId,
          accountId: id,
          kind: 'RESERVE',
          amount: '80000',
          purchaseId: operationId,
        },
        '',
        service,
      );
      expect(r.result.data.status).toBe('SUCCEEDED');
    }
    const payments = await Promise.all(
      reserveIds.map((reservationId) =>
        call(
          '/api/bank/v1/payments',
          {
            id: `pay-${reservationId}`,
            accountId: id,
            kind: 'PAYMENT',
            amount: '80000',
            reservationId,
          },
          '',
          service,
        ),
      ),
    );
    expect(payments.map((p) => p.result.data.status).sort()).toEqual(['DECLINED', 'SUCCEEDED']);
    expect((await db('bank').bankAccount.findUniqueOrThrow({ where: { id } })).cash).toBe(20000n);
    const conflict = await call(
      '/api/bank/v1/payments',
      {
        id: `pay-${reserveIds[0]}`,
        accountId: id,
        kind: 'PAYMENT',
        amount: '1',
        reservationId: reserveIds[0],
      },
      '',
      service,
    );
    expect(conflict.response.status).toBe(409);
  });
  it('prevents overselling when two administrators approve the last unit concurrently', async () => {
    const productId = `stock-${testId}`;
    await db().product.create({
      data: {
        id: productId,
        name: 'Fictional last-unit fixture',
        category: 'Tests',
        description: 'Concurrent inventory test',
        price: 100n,
        stock: 1,
        icon: 'package',
      },
    });
    const purchases = [];
    for (let i = 0; i < 2; i++) {
      const p = await action(customerCookie, {
        action: 'CHECKOUT',
        key: randomUUID(),
        count: 4,
        items: [{ productId, quantity: 1 }],
      });
      purchases.push(p);
      await action(adminCookie, { action: 'CHECK_CREDIT', id: p.id });
    }
    const results = await Promise.all(
      purchases.map((p) =>
        call(
          '/api/actions',
          { action: 'DECIDE', id: p.id, approve: true, reason: 'Concurrent stock approval test' },
          adminCookie,
        ),
      ),
    );
    expect(results.map((r) => r.response.status).sort()).toEqual([200, 409]);
    expect((await db().product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);
    await worker();
  });
  it('keeps every bank and BNPL journal balanced and blocks history mutations', async () => {
    for (const journal of await db().journal.findMany({ include: { entries: true } }))
      expect(journal.entries.reduce((n, e) => n + e.debit - e.credit, 0n)).toBe(0n);
    for (const journal of await db('bank').bankJournal.findMany({ include: { entries: true } }))
      expect(journal.entries.reduce((n, e) => n + e.debit - e.credit, 0n)).toBe(0n);
    const j = await db().journal.findFirstOrThrow();
    await expect(
      db().journal.update({ where: { id: j.id }, data: { kind: 'TAMPER' } }),
    ).rejects.toThrow();
    const lines = await db().entry.findMany({ where: { journalId: j.id } });
    await expect(
      db().$transaction(async (tx) => {
        await tx.entry.createMany({
          data: [
            { journalId: j.id, account: lines[0].account, debit: 1n, credit: 0n },
            { journalId: j.id, account: lines[1].account, debit: 0n, credit: 1n },
          ],
        });
      }),
    ).rejects.toThrow();
    await expect(
      db().journal.create({
        data: {
          id: `bad-${testId}`,
          reference: testId,
          kind: 'INVALID',
          entries: { create: { account: 'BANK_CASH', debit: 10n, credit: 0n } },
        },
      }),
    ).rejects.toThrow();
  });
  it('enforces PostgreSQL domain credential isolation', async () => {
    const bnpl = new Client({ connectionString: process.env.DATABASE_URL }),
      bank = new Client({ connectionString: process.env.BANK_DATABASE_URL });
    await bnpl.connect();
    await bank.connect();
    await expect(bnpl.query('SELECT * FROM bank."BankAccount"')).rejects.toThrow(
      /permission denied/,
    );
    await expect(bank.query('SELECT * FROM identity."User"')).rejects.toThrow(/permission denied/);
    await bnpl.end();
    await bank.end();
  });
  it('renders the three authenticated portals and the health endpoint', async () => {
    for (const [path, cookie] of [
      ['/app', customerCookie],
      ['/admin', adminCookie],
      ['/bank', bankCookie],
    ]) {
      const r = await call(path, undefined, cookie);
      expect(r.response.status).toBe(200);
    }
    expect((await call('/api/health')).result.status).toBe('ok');
  });
});
