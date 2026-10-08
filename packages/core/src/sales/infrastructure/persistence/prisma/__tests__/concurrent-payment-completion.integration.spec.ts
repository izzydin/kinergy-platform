import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentStatus as PrismaPaymentStatus,
  PaymentMethod as PrismaPaymentMethod,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CancelPaymentHandler } from '../../../../application/handlers/cancel-payment.handler';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { CancelPaymentCommand } from '../../../../application/commands/cancel-payment.command';
import { PaymentOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * High-fidelity transactional database harness emulating PostgreSQL Read Committed isolation,
 * atomic transactions ($transaction), and Optimistic Concurrency Control (OCC) version updates.
 */
class ConcurrentPhase7TransactionalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  constructor(public readonly clock: DeterministicClock) {}

  private txQueue: Promise<void> = Promise.resolve();

  private async acquireLock(): Promise<() => void> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentLock = this.txQueue;
    this.txQueue = this.txQueue.then(() => nextLock);
    await currentLock;
    return releaseLock;
  }

  public createClient(): PrismaClient {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = bufferedSales.get(where.id);
          if (!s) return null;
          const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async () => null),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = bufferedSales.get(where.id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleModel;
            bufferedSales.set(where.id, data);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version?: number };
            data: Record<string, unknown>;
          }) => {
            // OCC check: where.version must match current persistent state in the database
            const currentInDb = this.sales.get(where.id);
            if (
              currentInDb &&
              (where.version === undefined || currentInDb.version === where.version)
            ) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaSaleModel;
              bufferedSales.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      saleItem: {
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            let deleted = 0;
            for (const [id, item] of Array.from(bufferedItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  bufferedItems.delete(id);
                  deleted++;
                }
              }
            }
            return { count: deleted };
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = bufferedItems.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            bufferedItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },

      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return bufferedPayments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(bufferedPayments.values()).filter((p) => p.saleId === where.saleId);
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = bufferedPayments.get(where.id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaPaymentModel;
            bufferedPayments.set(where.id, data);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            // OCC check: where.version must match current committed state in the database
            const currentInDb = this.payments.get(where.id);
            if (currentInDb && currentInDb.version === where.version) {
              const updated = {
                ...currentInDb,
                ...data,
                updatedAt: this.clock.now(),
              } as PrismaPaymentModel;
              bufferedPayments.set(where.id, updated);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const release = await this.acquireLock();
        try {
          const bufferedSales = new Map<string, PrismaSaleModel>(
            Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedItems = new Map<string, PrismaSaleItemModel>(
            Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedPayments = new Map<string, PrismaPaymentModel>(
            Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
          );

          const tx = createTx(bufferedSales, bufferedItems, bufferedPayments);

          const result = await callback(tx);

          // Commit atomically
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;

          return result;
        } finally {
          release();
        }
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async () => null),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
      },
    } as unknown as PrismaClient;
  }
}

describe('Concurrent Payment Completion & Persistence Specification', () => {
  const tenantId = 'tenant_concurrency_spec';
  const baseTime = new Date('2026-10-01T15:00:00.000Z');

  let clock: DeterministicClock;
  let mockDb: ConcurrentPhase7TransactionalDatabase;
  let prismaClient: PrismaClient;

  let saleRepository: PrismaSaleRepository;
  let paymentRepository: PrismaPaymentRepository;
  let unitOfWork: PrismaSalesUnitOfWork;

  let completePaymentHandler: CompletePaymentHandler;
  let cancelPaymentHandler: CancelPaymentHandler;

  const defaultUser = {
    userId: 'usr_cashier_concurrent',
    roles: ['Receptionist', 'Manager'],
    permissions: ['payments.create', 'payments.manage'],
    tenantId,
  };

  const seedPayableSale = async (
    saleId: string = 'sale-conc-001',
    totalAmount: number = 100.0,
  ): Promise<void> => {
    mockDb.sales.set(saleId, {
      id: saleId,
      tenantId,
      clientId: 'client-999',
      status: PrismaSaleStatus.PENDING_PAYMENT,
      currency: 'USD',
      sourceType: 'MEMBERSHIP_PLAN',
      sourceId: 'plan-conc-gold',
      sourceCode: null,
      subtotalAmount: new Decimal(totalAmount.toFixed(2)),
      discountTotalAmount: new Decimal('0.00'),
      totalAmount: new Decimal(totalAmount.toFixed(2)),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: null,
      cancelledAt: null,
      completedAt: null,
      refundedAt: null,
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    mockDb.saleItems.set('item-conc-001', {
      id: 'item-conc-001',
      saleId,
      sourceType: 'MEMBERSHIP_PLAN',
      sourceId: 'plan-conc-gold',
      sourceCode: null,
      description: 'Monthly Pass',
      skuOrCode: 'PASS-M',
      quantity: new Decimal('1.000'),
      unitPriceAmount: new Decimal(totalAmount.toFixed(2)),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Decimal(totalAmount.toFixed(2)),
      discountTotalAmount: new Decimal('0.00'),
      totalAmount: new Decimal(totalAmount.toFixed(2)),
      discountType: null,
      discountValue: null,
      discountReason: null,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  };

  const seedPendingPayment = async (
    paymentId: string = 'pay-conc-001',
    saleId: string = 'sale-conc-001',
    amount: number = 100.0,
  ): Promise<void> => {
    mockDb.payments.set(paymentId, {
      id: paymentId,
      tenantId,
      saleId,
      method: PrismaPaymentMethod.QR,
      amount: new Decimal(amount.toFixed(2)),
      currency: 'USD',
      status: PrismaPaymentStatus.PENDING,
      reference: 'QR_INIT_001',
      paidAt: null,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
  };

  beforeEach(async () => {
    clock = new DeterministicClock(baseTime);
    mockDb = new ConcurrentPhase7TransactionalDatabase(clock);
    prismaClient = mockDb.createClient();

    saleRepository = new PrismaSaleRepository(prismaClient);
    paymentRepository = new PrismaPaymentRepository(prismaClient);
    unitOfWork = new PrismaSalesUnitOfWork(prismaClient);

    completePaymentHandler = new CompletePaymentHandler(
      paymentRepository,
      saleRepository,
      clock,
      undefined,
      unitOfWork,
    );

    cancelPaymentHandler = new CancelPaymentHandler(
      paymentRepository,
      saleRepository,
      clock,
      undefined,
    );
  });

  // ===========================================================================
  // 1. Concurrent CompletePayment vs CompletePayment (Same Payment X)
  // ===========================================================================
  describe('1. Concurrent CompletePayment vs CompletePayment (Same Payment X)', () => {
    it('guarantees that exactly one request succeeds and the other fails via OCC version collision', async () => {
      const saleId = 'sale-race-01';
      const paymentId = 'pay-race-01';

      await seedPayableSale(saleId, 100.0);
      await seedPendingPayment(paymentId, saleId, 100.0);

      // Both Request A and Request B target the exact same PENDING Payment
      const commandA = new CompletePaymentCommand({
        paymentId,
        saleId,
        tenantId,
        reference: 'TRACE_WORKER_A',
        currentUser: defaultUser,
      });

      const commandB = new CompletePaymentCommand({
        paymentId,
        saleId,
        tenantId,
        reference: 'TRACE_WORKER_B',
        currentUser: defaultUser,
      });

      // Execute concurrently
      const [resultA, resultB] = await Promise.all([
        completePaymentHandler.execute(commandA),
        completePaymentHandler.execute(commandB),
      ]);

      // Exactly one succeeds, the other fails due to OCC on version
      const successResults = [resultA, resultB].filter((r) => r.isSuccess);
      const failedResults = [resultA, resultB].filter((r) => r.isFailure);

      expect(successResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);

      // The failed request fails with PaymentOptimisticLockException
      const error = failedResults[0]!.getError();
      expect(error).toBeInstanceOf(PaymentOptimisticLockException);
      expect((error as Error).message).toContain(paymentId);
      expect((error as Error).message).toContain('expected version: 1');

      // In the database: Payment is COMPLETED with version 2
      const persistedPayment = mockDb.payments.get(paymentId);
      expect(persistedPayment?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(persistedPayment?.version).toBe(2);

      // Sale is PAID with version 2 (incremented exactly once)
      const persistedSale = mockDb.sales.get(saleId);
      expect(persistedSale?.status).toBe(PrismaSaleStatus.PAID);
      expect(persistedSale?.version).toBe(2);
    });
  });

  // ===========================================================================
  // 2. Concurrent CompletePayment vs CancelPayment (Same Payment X)
  // ===========================================================================
  describe('2. Concurrent CompletePayment vs CancelPayment (Same Payment X)', () => {
    it('prevents inconsistent states when Complete and Cancel race for the same Payment', async () => {
      const saleId = 'sale-race-02';
      const paymentId = 'pay-race-02';

      await seedPayableSale(saleId, 100.0);
      await seedPendingPayment(paymentId, saleId, 100.0);

      const completeCmd = new CompletePaymentCommand({
        paymentId,
        saleId,
        tenantId,
        currentUser: defaultUser,
      });

      const cancelCmd = new CancelPaymentCommand({
        paymentId,
        saleId,
        tenantId,
        reason: 'Customer cancelled at counter',
        currentUser: defaultUser,
      });

      // Execute race condition
      const [completeRes, cancelRes] = await Promise.all([
        completePaymentHandler.execute(completeCmd),
        cancelPaymentHandler.execute(cancelCmd),
      ]);

      const successCount = (completeRes.isSuccess ? 1 : 0) + (cancelRes.isSuccess ? 1 : 0);
      const failureCount = (completeRes.isFailure ? 1 : 0) + (cancelRes.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const persistedPayment = mockDb.payments.get(paymentId)!;
      const persistedSale = mockDb.sales.get(saleId)!;

      // Invariant Check: Payment and Sale must be mutually consistent
      if (persistedPayment.status === PrismaPaymentStatus.SETTLED) {
        // Complete won the race: Sale MUST be PAID
        expect(completeRes.isSuccess).toBe(true);
        expect(cancelRes.isFailure).toBe(true);
        expect(persistedSale.status).toBe(PrismaSaleStatus.PAID);
      } else {
        // Cancel won the race: Sale MUST remain PENDING_PAYMENT
        expect(persistedPayment.status).toBe(PrismaPaymentStatus.CANCELLED);
        expect(cancelRes.isSuccess).toBe(true);
        expect(completeRes.isFailure).toBe(true);
        expect(persistedSale.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      }

      // Proves impossible state (Payment CANCELLED while Sale PAID) can never occur
      expect(
        persistedPayment.status === PrismaPaymentStatus.CANCELLED &&
          persistedSale.status === PrismaSaleStatus.PAID,
      ).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Concurrent Split-Tender Payment Completion on the Same Sale
  // ===========================================================================
  describe('3. Concurrent Split-Tender Payment Completion on the Same Sale', () => {
    it('enforces OCC on Sale aggregate when two distinct payments are completed concurrently', async () => {
      const saleId = 'sale-split-01';
      const payment1Id = 'pay-split-01';
      const payment2Id = 'pay-split-02';

      // Sale total: $100.00
      await seedPayableSale(saleId, 100.0);

      // Two $50 tenders initiated
      await seedPendingPayment(payment1Id, saleId, 50.0);
      await seedPendingPayment(payment2Id, saleId, 50.0);

      const cmd1 = new CompletePaymentCommand({
        paymentId: payment1Id,
        saleId,
        tenantId,
        currentUser: defaultUser,
      });

      const cmd2 = new CompletePaymentCommand({
        paymentId: payment2Id,
        saleId,
        tenantId,
        currentUser: defaultUser,
      });

      // Both try to complete their $50 tender against Sale at version 1 simultaneously
      const [res1, res2] = await Promise.all([
        completePaymentHandler.execute(cmd1),
        completePaymentHandler.execute(cmd2),
      ]);

      const successes = [res1, res2].filter((r) => r.isSuccess);
      const failures = [res1, res2].filter((r) => r.isFailure);

      // Exactly one succeeds immediately
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // The losing request fails because the Sale version advanced from 1 to 2
      const failureError = failures[0]!.getError();
      expect(
        failureError instanceof PaymentOptimisticLockException ||
          failureError instanceof SaleOptimisticLockException,
      ).toBe(true);

      // One payment was settled and Sale is PARTIALLY_PAID
      const updatedSale = mockDb.sales.get(saleId)!;
      expect(updatedSale.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);
      expect(updatedSale.version).toBe(2);

      // Now re-executing the failed second payment succeeds because it sees updated state
      const retryCmd = failures[0] === res1 ? cmd1 : cmd2;
      const retryRes = await completePaymentHandler.execute(retryCmd);

      expect(retryRes.isSuccess).toBe(true);

      // Final state: Sale is fully PAID (version 3) and both payments are SETTLED
      const finalSale = mockDb.sales.get(saleId)!;
      expect(finalSale.status).toBe(PrismaSaleStatus.PAID);
      expect(finalSale.version).toBe(3);

      expect(mockDb.payments.get(payment1Id)?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(mockDb.payments.get(payment2Id)?.status).toBe(PrismaPaymentStatus.SETTLED);
    });
  });
});
