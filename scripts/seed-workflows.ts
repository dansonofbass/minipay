import 'dotenv/config';
import { db } from '../src/lib/db';
import { checkout, checkCredit, decide, initiatePayment } from '../src/modules/commerce/service';
import { runJob } from '../src/modules/jobs/worker';
import { defaults, simulatorSchema } from '../src/modules/banking/simulator';
const existing = await db('bank').simulator.findUniqueOrThrow({ where: { id: 'default' } });
await db('bank').simulator.update({
  where: { id: 'default' },
  data: {
    config: { ...defaults, simulationEnabled: false, webhookDelayMs: 0 },
    nextScenario: null,
  },
});
try {
  for (const [index, name, productId, count] of [
    [1, 'edward', 'product-05', 6],
    [2, 'bob', 'product-01', 4],
    [3, 'charlie', 'product-17', 4],
    [4, 'diana', 'product-06', 4],
  ] as const) {
    const key = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const p = await checkout(`seed-${name}`, { key, count, items: [{ productId, quantity: 1 }] });
    if (p.status === 'PENDING_REVIEW') {
      await checkCredit(p.id, 'seed-admin');
      await decide(p.id, 'seed-admin', true, 'Deterministic fictional demonstration fixture');
    }
    await runJob(`approve:${p.id}`);
    const current = await db().purchase.findUniqueOrThrow({
      where: { id: p.id },
      include: { installments: { orderBy: { number: 'asc' } } },
    });
    if (current.status === 'APPROVED_AWAITING_PAYMENT') {
      const payment = await initiatePayment(`seed-${name}`, current.installments[0].id, key);
      await runJob(`pay:${payment.id}`);
    }
    console.log(
      `Demo fixture ${name}: ${(await db().purchase.findUniqueOrThrow({ where: { id: p.id } })).status}`,
    );
  }
} finally {
  await db('bank').simulator.update({
    where: { id: 'default' },
    data: { config: simulatorSchema.parse(existing.config), nextScenario: existing.nextScenario },
  });
  await db().$disconnect();
  await db('bank').$disconnect();
}
