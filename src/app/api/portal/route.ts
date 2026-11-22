import { requireUser } from '@/lib/access';
import { db } from '@/lib/db';
import { endpoint } from '@/lib/http';
import { bankCall } from '@/modules/banking/client';
import { defaults } from '@/modules/banking/simulator';
export async function GET(request: Request) {
  return endpoint(async () => {
    const user = await requireUser(undefined, request.headers);
    if (user.role === 'BANK_ADMIN') {
      const bank = db('bank');
      const [accounts, operations, reservations, events, deliveries, logs, settings, journals] =
        await Promise.all([
          bank.bankAccount.findMany({ orderBy: { createdAt: 'asc' } }),
          bank.bankOperation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
          bank.reservation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
          bank.bankEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
          bank.delivery.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
          bank.simulationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
          bank.simulator.findUnique({ where: { id: 'default' } }),
          bank.bankJournal.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { entries: true },
          }),
        ]);
      return {
        user,
        accounts,
        operations,
        reservations,
        events,
        deliveries,
        logs,
        settings: settings ?? { config: defaults, nextScenario: null },
        journals,
      };
    }
    const admin = user.role === 'BNPL_ADMIN';
    const [
      products,
      purchases,
      payments,
      jobs,
      audit,
      inbox,
      reconciliations,
      customers,
      journals,
    ] = await Promise.all([
      db().product.findMany({ orderBy: { id: 'asc' } }),
      db().purchase.findMany({
        where: admin ? {} : { customerId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          customer: { select: { name: true, email: true } },
          installments: { orderBy: { number: 'asc' } },
        },
        take: 200,
      }),
      db().payment.findMany({
        where: admin ? {} : { installment: { purchase: { customerId: user.id } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      admin ? db().job.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 }) : [],
      admin ? db().audit.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) : [],
      admin ? db().inbox.findMany({ orderBy: { receivedAt: 'desc' }, take: 100 }) : [],
      admin ? db().reconciliation.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) : [],
      admin
        ? db().user.findMany({
            where: { role: 'CUSTOMER' },
            select: { id: true, name: true, email: true, bankLink: true },
          })
        : [],
      admin
        ? db().journal.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { entries: true },
          })
        : [],
    ]);
    const link = admin ? null : await db().bankLink.findUnique({ where: { userId: user.id } });
    let account = null,
      bankError = null;
    if (link) {
      try {
        account = await bankCall(`accounts/${encodeURIComponent(link.accountId)}`);
      } catch {
        bankError =
          'The bank is temporarily unavailable. Payment status remains authoritative on the server.';
      }
    }
    return {
      user,
      products,
      cart: admin ? [] : await db().cartItem.findMany({ where: { userId: user.id } }),
      purchases,
      payments,
      jobs,
      audit,
      inbox,
      reconciliations,
      customers,
      journals,
      link,
      account,
      bankError,
    };
  }, request);
}
