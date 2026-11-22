import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { db, lock, transaction } from '@/lib/db';
import { endpoint, invariant, sameOrigin, readJson } from '@/lib/http';
import {
  checkout,
  checkCredit,
  decide,
  initiatePayment,
  linkBank,
} from '@/modules/commerce/service';
import { adjustAccount } from '@/modules/banking/service';
import { bankCall } from '@/modules/banking/client';
import { defaults, scenarios, simulatorSchema } from '@/modules/banking/simulator';
import { reconcile } from '@/modules/reconciliation/service';
import { wake } from '@/modules/jobs/worker';
export const maxDuration = 60;
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const user = await requireUser(undefined, request.headers);
    const raw = await readJson(request);
    const { action } = z.object({ action: z.string() }).parse(raw);
    const customer = () =>
      invariant(user.role === 'CUSTOMER', 'FORBIDDEN', 'Customer role required', 403);
    const admin = () =>
      invariant(user.role === 'BNPL_ADMIN', 'FORBIDDEN', 'BNPL administrator role required', 403);
    const bank = () =>
      invariant(user.role === 'BANK_ADMIN', 'FORBIDDEN', 'Bank administrator role required', 403);
    let result: unknown;
    switch (action) {
      case 'SET_CART_ITEM': {
        customer();
        const input = z
          .object({ productId: z.string().max(100), quantity: z.number().int().min(0).max(10) })
          .parse(raw);
        result = await transaction('bnpl', async (tx) => {
          await lock(tx, `cart:${user.id}`);
          invariant(
            await tx.product.findUnique({ where: { id: input.productId } }),
            'NOT_FOUND',
            'Product not found',
            404,
          );
          if (input.quantity === 0)
            return tx.cartItem.deleteMany({
              where: { userId: user.id, productId: input.productId },
            });
          return tx.cartItem.upsert({
            where: { userId_productId: { userId: user.id, productId: input.productId } },
            create: { userId: user.id, ...input },
            update: { quantity: input.quantity },
          });
        });
        break;
      }
      case 'LINK_BANK':
        customer();
        result = await linkBank(user);
        break;
      case 'CHECKOUT':
        customer();
        result = await checkout(user.id, raw);
        break;
      case 'PAY': {
        customer();
        const input = z.object({ installmentId: z.string(), key: z.string().uuid() }).parse(raw);
        result = await initiatePayment(user.id, input.installmentId, input.key);
        break;
      }
      case 'CHECK_CREDIT': {
        admin();
        const { id } = z.object({ id: z.string() }).parse(raw);
        result = await checkCredit(id, user.id);
        break;
      }
      case 'DECIDE': {
        admin();
        const input = z
          .object({ id: z.string(), approve: z.boolean(), reason: z.string().min(4).max(500) })
          .parse(raw);
        result = await decide(input.id, user.id, input.approve, input.reason);
        break;
      }
      case 'RECONCILE':
        admin();
        z.object({ confirmed: z.literal(true) }).parse(raw);
        result = await reconcile(user.id);
        break;
      case 'RETRY_JOB': {
        admin();
        z.object({ confirmed: z.literal(true) }).parse(raw);
        const { id } = z.object({ id: z.string() }).parse(raw);
        result = await transaction('bnpl', async (tx) => {
          const result = await tx.job.updateMany({
            where: {
              id,
              status: { in: ['DEAD', 'RETRY'] },
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
            },
            data: {
              status: 'READY',
              availableAt: new Date(),
              leaseToken: null,
              leaseUntil: null,
            },
          });
          invariant(
            result.count === 1,
            'INELIGIBLE_JOB',
            'Only an eligible failed job can be retried',
          );
          await tx.audit.create({ data: { actor: user.id, action: 'JOB_RETRIED', reference: id } });
          return result;
        });
        break;
      }
      case 'ADJUST_ACCOUNT':
        bank();
        result = await adjustAccount(raw, user.id);
        break;
      case 'SAVE_SIMULATOR': {
        bank();
        const { config, nextScenario } = z
          .object({ config: simulatorSchema, nextScenario: z.enum(scenarios).nullable() })
          .parse(raw);
        result = await transaction('bank', (tx) =>
          tx.simulator.upsert({
            where: { id: 'default' },
            create: { config, nextScenario },
            update: { config, nextScenario, version: { increment: 1 } },
          }),
        );
        await db('bank').simulationLog.create({
          data: {
            operationId: 'configuration',
            correlationId: user.id,
            scenario: 'CONFIG_UPDATED',
            configVersion:
              result && typeof result === 'object' && 'version' in result
                ? Number(result.version)
                : 0,
            latencyMs: 0,
            durationMs: 0,
            httpStatus: 200,
          },
        });
        break;
      }
      case 'RESET_SIMULATOR':
        bank();
        result = await transaction('bank', (tx) =>
          tx.simulator.upsert({
            where: { id: 'default' },
            create: { config: defaults },
            update: { config: defaults, nextScenario: null, version: { increment: 1 } },
          }),
        );
        break;
      case 'REPLAY_WEBHOOK': {
        bank();
        z.object({ confirmed: z.literal(true) }).parse(raw);
        const { id } = z.object({ id: z.string().uuid() }).parse(raw);
        result = await transaction('bank', async (tx) => {
          const result = await tx.bankEvent.update({
            where: { id },
            data: { status: 'READY', availableAt: new Date() },
          });
          await tx.$executeRaw`INSERT INTO bank."Audit" (actor,action,reference) VALUES (${user.id},'MANUAL_WEBHOOK_REPLAY',${id})`;
          return result;
        });
        break;
      }
      case 'TEST_BANK': {
        bank();
        const { id } = z.object({ id: z.string() }).parse(raw);
        result = await bankCall(`accounts/${encodeURIComponent(id)}`);
        break;
      }
      default:
        invariant(false, 'UNKNOWN_ACTION', 'Unknown action', 400);
    }
    await wake();
    return result;
  }, request);
}
