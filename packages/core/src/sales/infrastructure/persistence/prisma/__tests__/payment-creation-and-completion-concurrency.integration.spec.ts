import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentStatus as PrismaPaymentStatus,
  PaymentMethod as PrismaPaymentMethod,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { CreatePaymentHandler } from '../../../../application/handlers/create-payment.handler';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CreatePaymentCommand } from '../../../../application/commands/create-payment.command';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { DuplicatePaymentReferenceException } from '../../../../application/exceptions/duplicate-payment-reference.exception';
import { PaymentOverpaymentException } from '../../../../application/exceptions/payment-overpayment.exception';
import { PaymentCurrencyMismatchException } from '../../../../application/exceptions/payment-currency-mismatch.exception';
import { PaymentUnauthorizedException } from '../../../../application/exceptions/payment-unauthorized.exception';
import { PaymentOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { InvalidPaymentTransitionException } from '../../../../domain/exceptions/invalid-payment-transition.exception';
import { SaleCannotBeMarkedPaidException } from '../../../../domain/exceptions/sale-cannot-be-marked-paid.exception';
import { DomainEvent } from '../../../../domain/shared/domain-event';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';

/**
 * Enterprise transactional PostgreSQL simulation harness emulating:
 * - Read Committed isolation with atomic transaction staging.
 * - Mutex queue simulating serialized database transaction commit locks.
 * - Unique constraint on uq_payments_sale_reference: (sale_id, reference) WHERE reference IS NOT NULL.
 * - Primary key constraint on payments_pkey: (id).
 * - Optimistic Concurrency Control (OCC) version checking on payments and sales.
 * - Rollback on transaction abort with zero committed side-effects.
 */
class ConcurrentPaymentDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  public failOnSaleUpdate = false;
  public failOnPaymentUpdate = false;

  private txQueue: Promise<void> = Promise.resolve();

  constructor(public readonly clock: DeterministicClock) {}

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

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.failOnSaleUpdate = false;
    this.failOnPaymentUpdate = false;
  }

  public createClient(): PrismaClient {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => {
      const checkUniqueConstraints = (data: Record<string, unknown>, currentId: string) => {
        // 1. Primary key constraint on id
        for (const [id] of bufferedPayments.entries()) {
          if (id === currentId) {
            // Already handled if update, but on create it violates PK
          }
        }

        // 2. Partial unique index uq_payments_sale_reference on (sale_id, reference) WHERE reference IS NOT NULL
        const ref = data.reference as string | null | undefined;
        const saleId = data.saleId as string;
        if (ref) {
          for (const [existingId, p] of bufferedPayments.entries()) {
            if (
              existingId !== currentId &&
              p.saleId === saleId &&
              p.reference !== null &&
              p.reference.toLowerCase() === ref.toLowerCase()
            ) {
              const error = new Error(
                `Unique constraint failed on the fields: (sale_id, reference) [uq_payments_sale_reference]`,
              ) as unknown as { code: string; message: string; meta: Record<string, unknown> };
              error.code = 'P2002';
              error.meta = { target: ['sale_id', 'reference'] };
              throw error;
            }
          }
        }
      };

      return {
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
              if (this.failOnSaleUpdate) {
                throw new Error('PostgreSQL Error: Simulated disk I/O failure on sales table');
              }
              const currentInDb = bufferedSales.get(where.id);
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
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
          }),
          deleteMany: jest.fn(
            async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
              let count = 0;
              for (const [id, item] of Array.from(bufferedItems.entries())) {
                if (item.saleId === where.saleId) {
                  if (where.id?.notIn && !where.id.notIn.includes(id)) {
                    bufferedItems.delete(id);
                    count++;
                  }
                }
              }
              return { count };
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
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = data.id as string;
            if (bufferedPayments.has(id)) {
              const err = new Error(`Unique constraint failed on the fields: (id)`) as unknown as {
                code: string;
                message: string;
                meta: Record<string, unknown>;
              };
              err.code = 'P2002';
              err.meta = { target: ['id'] };
              throw err;
            }
            checkUniqueConstraints(data, id);
            const now = this.clock.now();
            const record = {
              createdAt: now,
              updatedAt: now,
              ...data,
            } as PrismaPaymentModel;
            bufferedPayments.set(id, record);
            return record;
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
              const targetData = existing ? update : create;
              checkUniqueConstraints(targetData, where.id);
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
              if (this.failOnPaymentUpdate) {
                throw new Error('PostgreSQL Error: Simulated payment deadlock');
              }
              const currentInDb = bufferedPayments.get(where.id);
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
      };
    };

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

          // Atomic commit
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

describe('Payment Creation and Completion Integrity Suite (Prompt 5 / ADR-0140)', () => {
  const tenantId = 'tenant_kinergy_integrity';
  const baseTime = new Date('2026-10-16T18:00:00.000Z');

  let clock: DeterministicClock;
  let harness: ConcurrentPaymentDatabaseHarness;
  let prismaClient: PrismaClient;

  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let unitOfWork: PrismaSalesUnitOfWork;

  let publishedEvents: DomainEvent[];
  let eventPublisher: SalesEventPublisherPort;

  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;

  const cashierUser = {
    userId: 'cashier_user_01',
    roles: ['Receptionist', 'Manager'],
    permissions: ['payments.create', 'payments.manage'],
    tenantId,
  };

  const seedSale = async (
    saleId: string,
    totalAmount: number = 100.0,
    status: PrismaSaleStatus = PrismaSaleStatus.PENDING_PAYMENT,
    currency: string = 'USD',
  ): Promise<void> => {
    harness.sales.set(saleId, {
      id: saleId,
      tenantId,
      clientId: 'client-test-01',
      status,
      currency,
      sourceType: 'TREATMENT_SESSION',
      sourceId: `session-${saleId}`,
      sourceCode: null,
      subtotalAmount: new Decimal(totalAmount.toFixed(2)),
      discountTotalAmount: new Decimal('0.00'),
      totalAmount: new Decimal(totalAmount.toFixed(2)),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: status === PrismaSaleStatus.CANCELLED ? 'Cancelled by cashier' : null,
      cancelledAt: status === PrismaSaleStatus.CANCELLED ? baseTime : null,
      completedAt: null,
      refundedAt: null,
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    harness.saleItems.set(`item-${saleId}-1`, {
      id: `item-${saleId}-1`,
      saleId,
      sourceType: 'TREATMENT_SESSION',
      sourceId: `session-${saleId}`,
      sourceCode: null,
      description: 'Consultation & Kinesiology',
      skuOrCode: 'CONSULT-1',
      quantity: new Decimal('1.000'),
      unitPriceAmount: new Decimal(totalAmount.toFixed(2)),
      unitPriceCurrency: currency,
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

  const seedPayment = async (
    paymentId: string,
    saleId: string,
    amount: number = 100.0,
    status: PrismaPaymentStatus = PrismaPaymentStatus.PENDING,
    method: PrismaPaymentMethod = PrismaPaymentMethod.QR,
    reference: string | null = 'REF-INITIAL',
  ): Promise<void> => {
    harness.payments.set(paymentId, {
      id: paymentId,
      tenantId,
      saleId,
      method,
      amount: new Decimal(amount.toFixed(2)),
      currency: 'USD',
      status,
      reference,
      paidAt: status === PrismaPaymentStatus.SETTLED ? baseTime : null,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    harness = new ConcurrentPaymentDatabaseHarness(clock);
    prismaClient = harness.createClient();

    saleRepo = new PrismaSaleRepository(prismaClient);
    paymentRepo = new PrismaPaymentRepository(prismaClient);
    unitOfWork = new PrismaSalesUnitOfWork(prismaClient);

    publishedEvents = [];
    eventPublisher = {
      publish: jest.fn(async (events: ReadonlyArray<DomainEvent>) => {
        publishedEvents.push(...events);
      }),
    };

    createPaymentHandler = new CreatePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );

    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );
  });

  // =========================================================================
  // 1. Concurrent Creation of the Same Logical Payment
  // =========================================================================
  describe('1. Concurrent Creation of the Same Logical Payment', () => {
    it('guarantees that concurrent attempts with the same reference cannot insert duplicate payment records', async () => {
      const saleId = 'sale-race-create-01';
      await seedSale(saleId, 100.0);

      const commandA = new CreatePaymentCommand({
        saleId,
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'AUTH-QR-SAME-REF',
        tenantId,
        currentUser: cashierUser,
      });

      const commandB = new CreatePaymentCommand({
        saleId,
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'AUTH-QR-SAME-REF',
        tenantId,
        currentUser: cashierUser,
      });

      const [resA, resB] = await Promise.all([
        createPaymentHandler.execute(commandA),
        createPaymentHandler.execute(commandB),
      ]);

      const successes = [resA, resB].filter((r) => r.isSuccess);
      const failures = [resA, resB].filter((r) => r.isFailure);

      // Exactly one succeeds, the other fails with DuplicatePaymentReferenceException
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);

      // Database state verification: Exactly 1 payment record exists in PostgreSQL
      expect(harness.payments.size).toBe(1);
      const storedPayment = Array.from(harness.payments.values())[0]!;
      expect(storedPayment.reference).toBe('AUTH-QR-SAME-REF');
      expect(Number(storedPayment.amount)).toBe(50.0);
    });

    it('guarantees that concurrent requests with identical client idempotencyKey cleanly replay without duplicating financial records', async () => {
      const saleId = 'sale-race-idempotent-01';
      await seedSale(saleId, 100.0);

      const commandA = new CreatePaymentCommand({
        id: 'pay-idem-uuid-001',
        saleId,
        amount: 40.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'QR-AUTH-100',
        tenantId,
        currentUser: cashierUser,
      });

      const commandB = new CreatePaymentCommand({
        id: 'pay-idem-uuid-001',
        saleId,
        amount: 40.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'QR-AUTH-100',
        tenantId,
        currentUser: cashierUser,
      });

      const [resA, resB] = await Promise.all([
        createPaymentHandler.execute(commandA),
        createPaymentHandler.execute(commandB),
      ]);

      // Both callers receive success representation of the same payment
      expect(resA.isSuccess).toBe(true);
      expect(resB.isSuccess).toBe(true);
      expect(resA.getValue().id).toBe('pay-idem-uuid-001');
      expect(resB.getValue().id).toBe('pay-idem-uuid-001');

      // Database state verification: Exactly 1 payment record in persistence
      expect(harness.payments.size).toBe(1);
      expect(harness.payments.get('pay-idem-uuid-001')).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Concurrent Completion of One Payment
  // =========================================================================
  describe('2. Concurrent Completion of One Payment', () => {
    it('guarantees atomic completion where exactly one request completes and the other fails via OCC collision', async () => {
      const saleId = 'sale-race-complete-01';
      const paymentId = 'pay-race-complete-01';
      await seedSale(saleId, 100.0);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.PENDING);

      const commandA = new CompletePaymentCommand({
        paymentId,
        saleId,
        reference: 'CONFIRM-A',
        tenantId,
        currentUser: cashierUser,
      });

      const commandB = new CompletePaymentCommand({
        paymentId,
        saleId,
        reference: 'CONFIRM-B',
        tenantId,
        currentUser: cashierUser,
      });

      const [resA, resB] = await Promise.all([
        completePaymentHandler.execute(commandA),
        completePaymentHandler.execute(commandB),
      ]);

      const successes = [resA, resB].filter((r) => r.isSuccess);
      const failures = [resA, resB].filter((r) => r.isFailure);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.getError()).toBeInstanceOf(PaymentOptimisticLockException);

      // Final persisted state check: Payment settled exactly once, Sale marked PAID
      const persistedPayment = harness.payments.get(paymentId)!;
      expect(persistedPayment.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(persistedPayment.version).toBe(2);

      const persistedSale = harness.sales.get(saleId)!;
      expect(persistedSale.status).toBe(PrismaSaleStatus.PAID);
      expect(persistedSale.version).toBe(2);
    });
  });

  // =========================================================================
  // 3. Invalid Lifecycle Transitions
  // =========================================================================
  describe('3. Invalid Lifecycle Transitions', () => {
    it('rejects completion when payment is in CANCELLED status without mutating persistence', async () => {
      const saleId = 'sale-invalid-trans-01';
      const paymentId = 'pay-cancelled-01';
      await seedSale(saleId, 100.0);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.CANCELLED);

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      // Persistence remains untouched
      expect(harness.payments.get(paymentId)!.status).toBe(PrismaPaymentStatus.CANCELLED);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
    });

    it('rejects completion when payment is in FAILED status without mutating persistence', async () => {
      const saleId = 'sale-invalid-trans-02';
      const paymentId = 'pay-failed-01';
      await seedSale(saleId, 100.0);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.FAILED);

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      // Persistence remains untouched
      expect(harness.payments.get(paymentId)!.status).toBe(PrismaPaymentStatus.FAILED);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
    });

    it('rejects completion when referenced Sale has been CANCELLED', async () => {
      const saleId = 'sale-cancelled-parent';
      const paymentId = 'pay-pending-02';
      await seedSale(saleId, 100.0, PrismaSaleStatus.CANCELLED);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.PENDING);

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);

      // Payment cannot be settled against a cancelled sale
      expect(harness.payments.get(paymentId)!.status).toBe(PrismaPaymentStatus.PENDING);
    });
  });

  // =========================================================================
  // 4. Concurrent Payments Competing for the Same Outstanding Balance
  // =========================================================================
  describe('4. Concurrent Payments Competing for the Same Outstanding Balance', () => {
    it('protects outstanding balance so concurrent split tenders cannot over-settle the Sale total', async () => {
      const saleId = 'sale-compete-balance-01';
      const payment1Id = 'pay-compete-01';
      const payment2Id = 'pay-compete-02';

      // Sale total is $100.00
      await seedSale(saleId, 100.0);

      // Two $70.00 tenders initiated (each < 100 individually, but combined = $140 > 100)
      await seedPayment(
        payment1Id,
        saleId,
        70.0,
        PrismaPaymentStatus.PENDING,
        PrismaPaymentMethod.QR,
        'REF-A',
      );
      await seedPayment(
        payment2Id,
        saleId,
        70.0,
        PrismaPaymentStatus.PENDING,
        PrismaPaymentMethod.QR,
        'REF-B',
      );

      const cmd1 = new CompletePaymentCommand({
        paymentId: payment1Id,
        saleId,
        tenantId,
        currentUser: cashierUser,
      });

      const cmd2 = new CompletePaymentCommand({
        paymentId: payment2Id,
        saleId,
        tenantId,
        currentUser: cashierUser,
      });

      // Both try to complete their $70 tender concurrently
      const [res1, res2] = await Promise.all([
        completePaymentHandler.execute(cmd1),
        completePaymentHandler.execute(cmd2),
      ]);

      const successes = [res1, res2].filter((r) => r.isSuccess);
      const failures = [res1, res2].filter((r) => r.isFailure);

      // Exactly one succeeds, one fails OCC
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // Retry the failed command against the newly committed balance
      const retryCmd = failures[0] === res1 ? cmd1 : cmd2;
      const retryRes = await completePaymentHandler.execute(retryCmd);

      // Retry MUST fail with PaymentOverpaymentException because remaining balance is now $30.00 (< $70.00)
      expect(retryRes.isFailure).toBe(true);
      expect(retryRes.getError()).toBeInstanceOf(PaymentOverpaymentException);

      // Assert final persisted state: Exactly 1 payment is SETTLED ($70), other remains PENDING ($70)
      const p1 = harness.payments.get(payment1Id)!;
      const p2 = harness.payments.get(payment2Id)!;
      const settledCount = [p1, p2].filter((p) => p.status === PrismaPaymentStatus.SETTLED).length;
      expect(settledCount).toBe(1);

      // Sale total debt is NOT overpaid: status is PARTIALLY_PAID, settled = 70, balance = 30
      const sale = harness.sales.get(saleId)!;
      expect(sale.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);
    });
  });

  // =========================================================================
  // 5. Amount Exceeding Permitted Balance
  // =========================================================================
  describe('5. Amount Exceeding Permitted Balance', () => {
    it('rejects payment creation when amount exceeds total remaining balance', async () => {
      const saleId = 'sale-overpayment-01';
      await seedSale(saleId, 100.0);

      const result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 150.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect(harness.payments.size).toBe(0);
    });
  });

  // =========================================================================
  // 6. Duplicate Retries
  // =========================================================================
  describe('6. Duplicate Retries', () => {
    it('returns existing payment on retry with identical parameters, rejects on parameter mismatch', async () => {
      const saleId = 'sale-retry-01';
      await seedSale(saleId, 100.0);

      const firstResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay-retry-uuid-99',
          saleId,
          amount: 50.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(firstResult.isSuccess).toBe(true);

      // Duplicate retry with identical parameters
      const retryResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay-retry-uuid-99',
          saleId,
          amount: 50.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(retryResult.isSuccess).toBe(true);
      expect(retryResult.getValue().id).toBe('pay-retry-uuid-99');

      // Duplicate retry with conflicting amount
      const conflictResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay-retry-uuid-99',
          saleId,
          amount: 80.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(conflictResult.isFailure).toBe(true);
      expect(conflictResult.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);

      // Persistence has exactly 1 payment record with amount $50.00
      expect(harness.payments.size).toBe(1);
      expect(Number(harness.payments.get('pay-retry-uuid-99')!.amount)).toBe(50.0);
    });
  });

  // =========================================================================
  // 7. Currency Mismatch
  // =========================================================================
  describe('7. Currency Mismatch', () => {
    it('rejects payment creation when currency differs from Sale currency', async () => {
      const saleId = 'sale-currency-01';
      await seedSale(saleId, 100.0, PrismaSaleStatus.PENDING_PAYMENT, 'USD');

      const result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 50.0,
          currency: 'EUR',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect(harness.payments.size).toBe(0);
    });
  });

  // =========================================================================
  // 8. Transaction Failure and Rollback
  // =========================================================================
  describe('8. Transaction Failure and Rollback', () => {
    it('aborts cleanly and leaves payment in prior PENDING state when transaction fails', async () => {
      const saleId = 'sale-rollback-01';
      const paymentId = 'pay-rollback-01';
      await seedSale(saleId, 100.0);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.PENDING);

      harness.failOnSaleUpdate = true;

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(result.isFailure).toBe(true);

      // Transaction rollback: Payment remains PENDING, Sale remains PENDING_PAYMENT
      const payment = harness.payments.get(paymentId)!;
      expect(payment.status).toBe(PrismaPaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();

      const sale = harness.sales.get(saleId)!;
      expect(sale.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      // Zero post-commit domain events dispatched
      expect(publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 9. Tenant Isolation
  // =========================================================================
  describe('9. Tenant Isolation', () => {
    it('rejects payment completion across tenant boundaries', async () => {
      const saleId = 'sale-tenant-01';
      const paymentId = 'pay-tenant-01';
      await seedSale(saleId, 100.0);
      await seedPayment(paymentId, saleId, 100.0, PrismaPaymentStatus.PENDING);

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId,
          saleId,
          tenantId: 'foreign_tenant_xyz',
          currentUser: {
            ...cashierUser,
            tenantId: 'foreign_tenant_xyz',
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);

      // Database state remains untouched
      expect(harness.payments.get(paymentId)!.status).toBe(PrismaPaymentStatus.PENDING);
    });
  });

  // =========================================================================
  // 10. Regression of Existing Payment Workflows
  // =========================================================================
  describe('10. Regression of Existing Payment Workflows', () => {
    it('supports legitimate split payments across distinct tenders until Sale is fully settled', async () => {
      const saleId = 'sale-split-legit-01';
      await seedSale(saleId, 100.0);

      // Tender 1: $40.00 CASH
      const firstTender = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 40.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(firstTender.isSuccess).toBe(true);

      // Sale status advanced to PARTIALLY_PAID
      const saleAfterFirst = harness.sales.get(saleId)!;
      expect(saleAfterFirst.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);

      // Tender 2: $60.00 QR
      const secondTender = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 60.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-SPLIT-SUCCESS',
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(secondTender.isSuccess).toBe(true);

      // Sale is now fully PAID
      const saleAfterSecond = harness.sales.get(saleId)!;
      expect(saleAfterSecond.status).toBe(PrismaSaleStatus.PAID);

      // Both payments persisted as SETTLED
      expect(harness.payments.size).toBe(2);
      const allPayments = Array.from(harness.payments.values());
      expect(allPayments.every((p) => p.status === PrismaPaymentStatus.SETTLED)).toBe(true);
    });

    it('allows multiple legitimate cash payments on the same Sale without reference collisions', async () => {
      const saleId = 'sale-cash-splits-01';
      await seedSale(saleId, 100.0);

      const cash1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 30.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: null,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(cash1.isSuccess).toBe(true);

      const cash2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 70.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: null,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(cash2.isSuccess).toBe(true);

      expect(harness.payments.size).toBe(2);
      const sale = harness.sales.get(saleId)!;
      expect(sale.status).toBe(PrismaSaleStatus.PAID);
    });

    it('F-01 Regression: enforces tenant isolation and rejects cross-tenant replay in CreatePaymentHandler recovery', async () => {
      const saleId = 'sale-tenant-replay-01';
      await seedSale(saleId, 100.0);

      // Create initial payment under the sale's tenant ('tenant_concurrency_spec')
      const paymentId = 'pay-tenant-isolation-01';
      const initial = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: paymentId,
          saleId,
          amount: 50.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(initial.isSuccess).toBe(true);

      // Attempt replay with the same payment ID under a different tenant ('tenant-beta')
      const crossTenantReplay = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: paymentId,
          saleId,
          amount: 50.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId: 'tenant-beta',
          currentUser: { ...cashierUser, tenantId: 'tenant-beta' },
        }),
      );

      expect(crossTenantReplay.isFailure).toBe(true);
      expect(crossTenantReplay.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect((crossTenantReplay.getError() as Error).message).toContain(
        'Cross-tenant access forbidden',
      );
    });

    it('F-01 Regression: rejects parameter mismatch replay in CreatePaymentHandler with DuplicatePaymentReferenceException', async () => {
      const saleId = 'sale-mismatch-replay-01';
      await seedSale(saleId, 100.0);

      const paymentId = 'pay-mismatch-replay-01';
      const initial = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: paymentId,
          saleId,
          amount: 40.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(initial.isSuccess).toBe(true);

      // Attempt replay with mismatched amount
      const mismatchReplay = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: paymentId,
          saleId,
          amount: 80.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );

      expect(mismatchReplay.isFailure).toBe(true);
      expect(mismatchReplay.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
    });

    it('F-02 Regression: supports 3+ multi-installment partial payments without invalid state transition or OCC failure (CreatePaymentHandler)', async () => {
      const saleId = 'sale-multi-part-03';
      await seedSale(saleId, 100.0);

      // Installment 1: 30.00 USD -> transitions PENDING_PAYMENT -> PARTIALLY_PAID
      const part1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 30.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(part1.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);

      // Installment 2: 30.00 USD -> Sale is ALREADY PARTIALLY_PAID (cumulative 60.00 USD < 100.00 USD)
      // Must not throw SaleOptimisticLockException or InvalidSaleTransitionException
      const part2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 30.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(part2.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);

      // Installment 3: 40.00 USD -> cumulative 100.00 USD >= total 100.00 USD -> transitions PARTIALLY_PAID -> PAID
      const part3 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 40.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(part3.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PAID);

      // All 3 payments successfully SETTLED
      expect(harness.payments.size).toBe(3);
      const allPayments = Array.from(harness.payments.values());
      expect(allPayments.every((p) => p.status === PrismaPaymentStatus.SETTLED)).toBe(true);
    });

    it('F-02 Regression: supports 3+ multi-installment partial payments via CompletePaymentHandler', async () => {
      const saleId = 'sale-multi-part-complete-03';
      await seedSale(saleId, 100.0);

      // Create 3 pending payments: 30, 30, 40
      const p1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 30.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-P1',
          status: 'PENDING',
          tenantId,
          currentUser: cashierUser,
        }),
      );
      const p2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 30.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-P2',
          status: 'PENDING',
          tenantId,
          currentUser: cashierUser,
        }),
      );
      const p3 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId,
          amount: 40.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-P3',
          status: 'PENDING',
          tenantId,
          currentUser: cashierUser,
        }),
      );

      // Complete 1: Transitions PENDING_PAYMENT -> PARTIALLY_PAID
      const c1 = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: p1.getValue().id,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(c1.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);

      // Complete 2: Sale is ALREADY PARTIALLY_PAID -> Must complete payment and keep sale in PARTIALLY_PAID
      const c2 = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: p2.getValue().id,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(c2.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);

      // Complete 3: Cumulative 100.00 USD -> Transitions PARTIALLY_PAID -> PAID
      const c3 = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: p3.getValue().id,
          saleId,
          tenantId,
          currentUser: cashierUser,
        }),
      );
      expect(c3.isSuccess).toBe(true);
      expect(harness.sales.get(saleId)!.status).toBe(PrismaSaleStatus.PAID);
    });
  });
});
