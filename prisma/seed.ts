import 'dotenv/config';
import { hashPassword } from 'better-auth/crypto';
import { db, transaction, lock } from '../src/lib/db';
import { post } from '../src/modules/ledger/post';
import { defaults } from '../src/modules/banking/simulator';

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 16)
  throw new Error('Set a private DEMO_PASSWORD of at least 16 characters before seeding');
const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Admin', 'Bank'];
const balances = [100000n, 1000n, 100000n, 200000n, 300000n];
const limits = [500000n, 500000n, 10000n, 500000n, 400000n];
for (const [index, name] of names.entries()) {
  const id = `seed-${name.toLowerCase()}`,
    role = index === 5 ? 'BNPL_ADMIN' : index === 6 ? 'BANK_ADMIN' : 'CUSTOMER';
  const exists = await db().user.findUnique({ where: { id } });
  if (!exists)
    await db().user.create({
      data: {
        id,
        name,
        email: `${name.toLowerCase()}@crediflow.demo`,
        emailVerified: true,
        role,
        accounts: {
          create: {
            id: `credential-${id}`,
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
    });
  if (index < 5) {
    const accountId = `account-${name.toLowerCase()}`;
    await transaction('bank', async (tx) => {
      await lock(tx, `account:${accountId}`);
      if (await tx.bankAccount.findUnique({ where: { id: accountId } })) return;
      await tx.bankAccount.create({
        data: {
          id: accountId,
          customerId: id,
          name,
          number: `CF-DEMO-${String(index + 1).padStart(6, '0')}`,
          cash: balances[index],
          creditLimit: limits[index],
          status: name === 'Diana' ? 'FROZEN' : 'ACTIVE',
        },
      });
      await post(
        tx,
        'bank',
        `opening:${accountId}`,
        'OPENING_BALANCE',
        accountId,
        'SIMULATED_TREASURY',
        `CUSTOMER_DEPOSITS:${accountId}`,
        balances[index],
      );
    });
    await db().bankLink.upsert({
      where: { userId: id },
      create: { userId: id, accountId },
      update: {},
    });
  }
}
const products: [string, string, number, string][] = [
  ['Studio Wireless Headphones', 'Audio', 240000, 'headphones'],
  ['Everyday Laptop 14', 'Computing', 360000, 'laptop'],
  ['Pocket Smartphone', 'Mobile', 280000, 'smartphone'],
  ['Minimal Desk Lamp', 'Home', 32000, 'lamp'],
  ['Smart Fitness Watch', 'Wearables', 96000, 'watch'],
  ['Portable Speaker', 'Audio', 48000, 'speaker'],
  ['Mirrorless Camera', 'Photography', 420000, 'camera'],
  ['Mechanical Keyboard', 'Computing', 56000, 'keyboard'],
  ['Ergonomic Desk Chair', 'Home', 168000, 'armchair'],
  ['Cinema Monitor 27', 'Computing', 192000, 'monitor'],
  ['Trail Running Shoes', 'Lifestyle', 64000, 'footprints'],
  ['Weekend Backpack', 'Lifestyle', 40000, 'backpack'],
  ['Espresso Machine', 'Home', 220000, 'coffee'],
  ['Tablet Air 11', 'Mobile', 216000, 'tablet'],
  ['Gaming Controller', 'Gaming', 36000, 'gamepad'],
  ['Premium Office Desk', 'Home', 144000, 'desk'],
  ['Noise-free Earbuds', 'Audio', 72000, 'earbuds'],
  ['Action Camera Mini', 'Photography', 128000, 'camera'],
  ['E-reader Paper', 'Mobile', 88000, 'book'],
  ['Travel Power Bank', 'Accessories', 24001, 'battery'],
];
for (const [index, [name, category, price, icon]] of products.entries())
  await db().product.upsert({
    where: { id: `product-${String(index + 1).padStart(2, '0')}` },
    create: {
      id: `product-${String(index + 1).padStart(2, '0')}`,
      name,
      category,
      price: BigInt(price),
      icon,
      description: `A fictional ${name.toLowerCase()} for your everyday. Thoughtfully designed and available with 4 or 6 interest-free installments. Demo product only.`,
      stock: 25,
    },
    update: {},
  });
await db('bank').simulator.upsert({
  where: { id: 'default' },
  create: { config: defaults },
  update: {},
});
await db().purchase.upsert({
  where: { id: 'seed-alice-request' },
  create: {
    id: 'seed-alice-request',
    customerId: 'seed-alice',
    accountId: 'account-alice',
    total: 240000n,
    count: 4,
    items: {
      create: {
        productId: 'product-01',
        name: 'Studio Wireless Headphones',
        unitPrice: 240000n,
        quantity: 1,
      },
    },
  },
  update: {},
});
console.log(
  'Idempotent seed complete: 7 identities, 5 bank accounts, 20 products, one pending request. No existing balances or user-created data reset.',
);
await db().$disconnect();
await db('bank').$disconnect();
