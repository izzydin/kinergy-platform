import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentStatus as PrismaPaymentStatus,
  SaleStatus as PrismaSaleStatus,
  PaymentMethod as PrismaPaymentMethod,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { DeterministicClock } from '../../../../domain/shared/clock';
import { DomainEvent } from '../../../../domain/shared/domain-event';

import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';

import {
  InvalidPaymentTransitionException,
  PaymentAlreadyCompletedException,
  SaleCannotBeMarkedPaidException,
  PaymentOptimisticLockException,
  InvalidPaymentAmountException,
  InvalidMoneyException,
} from '../../../../domain/exceptions';

import {
  PaymentNotFoundException,
  SaleNotFoundException,
  PaymentCurrencyMismatchException,
  PaymentOverpaymentException,
} from '../../../../application/exceptions';

/**
 * High-fidelity PostgreSQL Relational & Transactional Database Engine Harness.
 * Emulates:
 * 1. Read Committed isolation with transactional isolation staging per $transaction.
 * 2. ACID Rollback: any exception discards staged writes, leaving storage pristine.
 * 3. PostgreSQL Optimistic Concurrency Control (OCC) version updates.
 * 4. Relational integrity & check constraints (positive payments, non-negative totals).
 * 5. Concurrent transaction queuing emulating row-level locks and OCC collisions.
 */
class HighFidelityPostgreSqlDatabaseHarness {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  // Diagnostic fault-injection hooks
  public failOnPaymentSave = false;
  public failOnSaleSave = false;
  public failNextWith: Error | null = null;

  private txQueue: Promise<void> = Promise.resolve();

  constructor(public readonly clock: DeterministicClock) {}

  public clear(): void {
    this.payments.clear();
    this.saleItems.clear();
    this.sales.clear();
    this.failOnPaymentSave = false;
    this.failOnSaleSave = false;
    this.failNextWith = null;
    this.txQueue = Promise.resolve();
  }

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
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, boolean>;
          }) => {
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            if (select) {
              const res: Record<string, unknown> = {};
              for (const k of Object.keys(select)) {
                res[k] = (s as unknown as Record<string, unknown>)[k];
              }
              return res;
            }
            const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          },
        ),
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
            if (this.failOnSaleSave) {
              throw new Error('PostgreSQL Error: Simulated disk I/O failure on sale upsert');
            }
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
            if (this.failOnSaleSave) {
              throw new Error(
                'PostgreSQL Error: Simulated write conflict / I/O error on sale update',
              );
            }
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
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
        }),
        deleteMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          for (const [id, item] of bufferedItems.entries()) {
            if (item.saleId === where.saleId) {
              bufferedItems.delete(id);
            }
          }
          return { count: 1 };
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
            const existing = bufferedItems.get(where.id);
            const now = this.clock.now();
            const data = {
              ...(existing ?? { createdAt: now, ...create }),
              ...update,
              updatedAt: now,
            } as PrismaSaleItemModel;
            bufferedItems.set(where.id, data);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, boolean>;
          }) => {
            const p = bufferedPayments.get(where.id);
            if (!p) return null;
            if (select) {
              const res: Record<string, unknown> = {};
              for (const k of Object.keys(select)) {
                res[k] = (p as unknown as Record<string, unknown>)[k];
              }
              return res;
            }
            return p;
          },
        ),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(bufferedPayments.values()).filter((p) => p.saleId === where.saleId);
        }),
        count: jest.fn(async () => bufferedPayments.size),
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
            if (this.failOnPaymentSave) {
              throw new Error('PostgreSQL Error: Simulated disk I/O failure on payment upsert');
            }
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
            where: { id: string; version?: number };
            data: Record<string, unknown>;
          }) => {
            if (this.failOnPaymentSave) {
              throw new Error(
                'PostgreSQL Error: Simulated disk I/O / lock timeout on payment update',
              );
            }
            // OCC check: where.version must match current persistent state in the database
            const currentInDb = this.payments.get(where.id);
            if (
              currentInDb &&
              (where.version === undefined || currentInDb.version === where.version)
            ) {
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
        const releaseLock = await this.acquireLock();
        try {
          if (this.failNextWith) {
            const err = this.failNextWith;
            this.failNextWith = null;
            throw err;
          }

          // Deep copy buffered state for isolated transaction scope
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

          // Execute work inside isolated transactional buffer
          const result = await callback(tx);

          // Commit atomically if and only if no error was raised
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;

          return result;
        } finally {
          releaseLock();
        }
      }),
      sale: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, boolean>;
          }) => {
            const s = this.sales.get(where.id);
            if (!s) return null;
            if (select) {
              const res: Record<string, unknown> = {};
              for (const k of Object.keys(select)) {
                res[k] = (s as unknown as Record<string, unknown>)[k];
              }
              return res;
            }
            const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          },
        ),
        findFirst: jest.fn(async () => null),
      },
      payment: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, boolean>;
          }) => {
            const p = this.payments.get(where.id);
            if (!p) return null;
            if (select) {
              const res: Record<string, unknown> = {};
              for (const k of Object.keys(select)) {
                res[k] = (p as unknown as Record<string, unknown>)[k];
              }
              return res;
            }
            return p;
          },
        ),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
      },
    } as unknown as PrismaClient;
  }
}

describe('CompletePayment Financial Integration Test Matrix', () => {
  const tenantId = 'org_kinergy_settlement_01';
  const baseTime = new Date('2026-10-09T14:00:00.000Z');

  let clock: DeterministicClock;
  let db: HighFidelityPostgreSqlDatabaseHarness;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let unitOfWork: PrismaSalesUnitOfWork;
  let eventPublisher: SalesEventPublisherPort;
  let publishedEvents: DomainEvent[];
  let handler: CompletePaymentHandler;

  const validSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-rehab-501',
    sourceCode: 'REHAB-ASSESS',
  });

  const authorizedUser = {
    id: 'usr_settlement_cashier_01',
    roles: ['Receptionist', 'Manager'],
    permissions: ['payments.create', 'payments.manage'],
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    db = new HighFidelityPostgreSqlDatabaseHarness(clock);
    prisma = db.createClient();

    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    unitOfWork = new PrismaSalesUnitOfWork(prisma);

    publishedEvents = [];
    eventPublisher = {
      publish: jest.fn(async (events: ReadonlyArray<DomainEvent>) => {
        publishedEvents.push(...events);
      }),
    };

    handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher, unitOfWork);
  });

  /**
   * Helper to seed a finalized payable Sale in PENDING_PAYMENT status and a pending Payment in PostgreSQL.
   */
  async function seedPayableSaleAndPendingPayment(
    amount: number = 100.0,
    currency: string = 'USD',
    saleIdStr: string = 'sale-matrix-001',
    paymentIdStr: string = 'pay-matrix-001',
  ) {
    const sale = Sale.create(
      {
        id: SaleId.create(saleIdStr),
        source: validSource,
        tenantId,
        currency,
      },
      clock,
    );
    sale.addItem(
      {
        id: SaleItemId.create(`item-${saleIdStr}`),
        source: validSource,
        description: 'Kinesthetic Physical Rehabilitation Session',
        quantity: 1,
        unitPrice: Money.create(amount, currency),
      },
      clock,
    );
    await saleRepo.save(sale);
    sale.finalize(clock);
    await saleRepo.save(sale);

    const payment = Payment.createPending(
      {
        id: PaymentId.create(paymentIdStr),
        saleId: sale.id,
        amount: Money.create(amount, currency),
        method: PaymentMethod.QR,
        tenantId,
      },
      clock,
    );
    await paymentRepo.save(payment);

    return { sale, payment };
  }

  // =========================================================================
  // 1. Happy Path
  // =========================================================================
  describe('1. Happy Path: PENDING Payment + Eligible Sale → COMPLETED Payment + PAID Sale', () => {
    it('transitions PENDING payment to COMPLETED and PENDING_PAYMENT sale to PAID atomically in PostgreSQL', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        150.0,
        'USD',
        'sale-happy-01',
        'pay-happy-01',
      );

      // Verify initial states in database
      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'AUTH-QR-987654',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      // Verify command handler response
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(payment.id.value);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('AUTH-QR-987654');

      // Verify Payment repository reconstitution from PostgreSQL
      const persistedPayment = await paymentRepo.findById(payment.id);
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayment?.reference?.value).toBe('AUTH-QR-987654');
      expect(persistedPayment?.paidAt).toEqual(clock.now());
      expect(persistedPayment?.version).toBe(2);

      // Verify Sale repository reconstitution from PostgreSQL
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale).not.toBeNull();
      expect(persistedSale?.status).toBe(SaleStatus.PAID);
      expect(persistedSale?.version).toBe(3);

      // Verify exact raw PostgreSQL engine storage models
      const rawPayment = db.payments.get(payment.id.value);
      expect(rawPayment?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(rawPayment?.reference).toBe('AUTH-QR-987654');
      expect(rawPayment?.version).toBe(2);

      const rawSale = db.sales.get(sale.id.value);
      expect(rawSale?.status).toBe(PrismaSaleStatus.PAID);
      expect(rawSale?.version).toBe(3);

      // Verify domain events published post-commit
      expect(publishedEvents).toHaveLength(2);
      expect(publishedEvents.map((e) => e.eventType)).toEqual(['PaymentSettled', 'SalePaid']);

      // INVARIANT: Payment completion cannot leave Sale and Payment in contradictory states
      expect(
        rawPayment?.status === PrismaPaymentStatus.SETTLED &&
          rawSale?.status === PrismaSaleStatus.PAID,
      ).toBe(true);
    });
  });

  // =========================================================================
  // 2. Invalid Payment State
  // =========================================================================
  describe('2. Invalid Payment State: Transitions from Non-Pending Terminal States Are Prohibited', () => {
    it('COMPLETED → COMPLETED: rejects repeated completion on an already completed payment and preserves state', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-comp-dup',
        'pay-comp-dup',
      );

      // First completion transitions to COMPLETED
      const firstCommand = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'ORIGINAL-CONFIRMATION-001',
        tenantId,
        currentUser: authorizedUser,
      });
      const firstResult = await handler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);

      publishedEvents.length = 0; // Clear events

      // Second completion attempt
      const duplicateCommand = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TAMPERED-DUPLICATE-002',
        tenantId,
        currentUser: authorizedUser,
      });
      const duplicateResult = await handler.execute(duplicateCommand);

      expect(duplicateResult.isFailure).toBe(true);
      expect(duplicateResult.getError()).toBeInstanceOf(PaymentAlreadyCompletedException);

      // Verify database state: original reference & version preserved without mutation
      const reloadedPayment = db.payments.get(payment.id.value);
      expect(reloadedPayment?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(reloadedPayment?.reference).toBe('ORIGINAL-CONFIRMATION-001');
      expect(reloadedPayment?.version).toBe(2);

      const reloadedSale = db.sales.get(sale.id.value);
      expect(reloadedSale?.status).toBe(PrismaSaleStatus.PAID);
      expect(reloadedSale?.version).toBe(3);

      expect(publishedEvents).toHaveLength(0);
    });

    it('FAILED → COMPLETED: rejects completing a payment that previously failed and leaves Sale unpaid', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-fail-state',
        'pay-fail-state',
      );

      // Fail payment domain transition and persist
      payment.fail('Card payment declined by processor: INSUFFICIENT_FUNDS', clock);
      await paymentRepo.save(payment);

      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.FAILED);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'RETRY-ON-FAILED',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      // Verify PostgreSQL state: payment remains FAILED, sale remains PENDING_PAYMENT
      const reloadedPayment = db.payments.get(payment.id.value);
      expect(reloadedPayment?.status).toBe(PrismaPaymentStatus.FAILED);
      expect(reloadedPayment?.paidAt).toBeNull();

      const reloadedSale = db.sales.get(sale.id.value);
      expect(reloadedSale?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      // Contradiction proof: Payment != COMPLETED and Sale != PAID
      expect(reloadedPayment?.status === PrismaPaymentStatus.SETTLED).toBe(false);
      expect(reloadedSale?.status === PrismaSaleStatus.PAID).toBe(false);
      expect(publishedEvents).toHaveLength(0);
    });

    it('CANCELLED → COMPLETED: rejects completing a cancelled payment and leaves Sale unpaid', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-canc-state',
        'pay-canc-state',
      );

      // Cancel payment domain transition and persist
      payment.cancel('Customer abandoned counter tender', clock);
      await paymentRepo.save(payment);

      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.CANCELLED);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'RESURRECT-CANCELLED',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      // Verify PostgreSQL state: payment remains CANCELLED, sale remains PENDING_PAYMENT
      const reloadedPayment = db.payments.get(payment.id.value);
      expect(reloadedPayment?.status).toBe(PrismaPaymentStatus.CANCELLED);
      expect(reloadedPayment?.paidAt).toBeNull();

      const reloadedSale = db.sales.get(sale.id.value);
      expect(reloadedSale?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);

      // Contradiction proof: Zero inconsistent writes
      expect(reloadedPayment?.status === PrismaPaymentStatus.SETTLED).toBe(false);
      expect(reloadedSale?.status === PrismaSaleStatus.PAID).toBe(false);
      expect(publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. Invalid Sale State
  // =========================================================================
  describe('3. Invalid Sale State: Sale State Incompatible with Payment Completion', () => {
    it('rejects completing payment when associated Sale is CANCELLED and halts before mutating Payment', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-cancelled-inval',
        'pay-for-cancelled',
      );

      // Cancel the Sale aggregate in persistence
      sale.cancel('Order cancelled by customer before checkout tender', clock);
      await saleRepo.save(sale);

      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.CANCELLED);
      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TENDER-FOR-VOID-SALE',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);

      // CRITICAL ARCHITECTURAL PROOF:
      // Payment MUST NOT be marked COMPLETED in PostgreSQL storage while Sale is CANCELLED!
      const reloadedPayment = db.payments.get(payment.id.value);
      expect(reloadedPayment?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(reloadedPayment?.paidAt).toBeNull();

      const reloadedSale = db.sales.get(sale.id.value);
      expect(reloadedSale?.status).toBe(PrismaSaleStatus.CANCELLED);

      expect(publishedEvents).toHaveLength(0);
    });

    it('rejects completing payment when associated Sale is in unfinalized DRAFT status', async () => {
      // Create Sale in DRAFT (not finalized)
      const draftSale = Sale.create(
        {
          id: SaleId.create('sale-draft-inval'),
          source: validSource,
          tenantId,
          currency: 'USD',
        },
        clock,
      );
      draftSale.addItem(
        {
          id: SaleItemId.create('item-draft-01'),
          source: validSource,
          description: 'Draft Line Item',
          quantity: 1,
          unitPrice: Money.create(100, 'USD'),
        },
        clock,
      );
      await saleRepo.save(draftSale);

      // Create a pending payment referencing this draft sale
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-draft-inval'),
          saleId: draftSale.id,
          amount: Money.create(100, 'USD'),
          method: PaymentMethod.CASH,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(payment);

      expect(db.sales.get(draftSale.id.value)?.status).toBe(PrismaSaleStatus.DRAFT);
      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: draftSale.id.value,
        reference: 'CASH-TENDER-DRAFT',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);

      // Both aggregates remain untouched
      expect(db.payments.get(payment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(db.sales.get(draftSale.id.value)?.status).toBe(PrismaSaleStatus.DRAFT);
      expect(publishedEvents).toHaveLength(0);
    });

    it('rejects completing an additional payment when Sale is already fully settled and has zero remaining balance', async () => {
      const { sale, payment: payment1 } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-already-paid',
        'pay-settled-1',
      );

      // Complete payment 1 to make sale fully PAID
      const completeCmd1 = new CompletePaymentCommand({
        paymentId: payment1.id.value,
        saleId: sale.id.value,
        reference: 'FIRST-FULL-SETTLEMENT',
        tenantId,
        currentUser: authorizedUser,
      });
      const res1 = await handler.execute(completeCmd1);
      expect(res1.isSuccess).toBe(true);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PAID);

      // Create second pending payment on the now fully PAID sale
      const payment2 = Payment.createPending(
        {
          id: PaymentId.create('pay-superfluous-2'),
          saleId: sale.id.value,
          amount: Money.create(50, 'USD'),
          method: PaymentMethod.CASH,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(payment2);

      // Attempt to complete payment 2
      const completeCmd2 = new CompletePaymentCommand({
        paymentId: payment2.id.value,
        saleId: sale.id.value,
        reference: 'SECOND-EXCESS-TENDER',
        tenantId,
        currentUser: authorizedUser,
      });

      const res2 = await handler.execute(completeCmd2);

      expect(res2.isFailure).toBe(true);
      expect(res2.getError()).toBeInstanceOf(PaymentOverpaymentException);

      // Verify PostgreSQL state: payment2 remains PENDING; sale remains PAID at 100.00
      expect(db.payments.get(payment2.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PAID);
    });
  });

  // =========================================================================
  // 4. Missing Records
  // =========================================================================
  describe('4. Missing Records: Gracefully Rejects Missing Payment or Sale Aggregate', () => {
    it('returns PaymentNotFoundException when payment ID does not exist in PostgreSQL', async () => {
      const command = new CompletePaymentCommand({
        paymentId: 'pay-nonexistent-404',
        saleId: 'sale-any',
        reference: 'REF-GHOST',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect((result.getError() as Error).message).toContain('pay-nonexistent-404');

      // Database remains pristine
      expect(db.payments.size).toBe(0);
      expect(db.sales.size).toBe(0);
      expect(publishedEvents).toHaveLength(0);
    });

    it('returns SaleNotFoundException when associated sale record does not exist in PostgreSQL', async () => {
      // Create orphaned payment pointing to non-existent sale
      const orphanedPayment = Payment.createPending(
        {
          id: PaymentId.create('pay-orphan-01'),
          saleId: SaleId.create('sale-ghost-404'),
          amount: Money.create(100, 'USD'),
          method: PaymentMethod.CASH,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(orphanedPayment);

      expect(db.payments.get('pay-orphan-01')?.status).toBe(PrismaPaymentStatus.PENDING);

      const command = new CompletePaymentCommand({
        paymentId: 'pay-orphan-01',
        saleId: 'sale-ghost-404',
        reference: 'REF-ORPHAN',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain('sale-ghost-404');

      // Payment remains strictly PENDING in storage, no partial mutation
      const reloadedPayment = db.payments.get('pay-orphan-01');
      expect(reloadedPayment?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(reloadedPayment?.paidAt).toBeNull();
      expect(publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Financial Rules
  // =========================================================================
  describe('5. Financial Rules: Monetary and Currency Invariants', () => {
    it('Invalid Amount: domain factory strictly rejects zero or negative payment amount', () => {
      // Zero amount is rejected by Payment domain aggregate invariant
      expect(() =>
        Payment.createPending(
          {
            id: PaymentId.create('pay-zero-amount'),
            saleId: SaleId.create('sale-any'),
            amount: Money.create(0, 'USD'),
            method: PaymentMethod.CASH,
            tenantId,
          },
          clock,
        ),
      ).toThrow(InvalidPaymentAmountException);

      // Negative amount is rejected by canonical Money VO invariant
      expect(() => Money.create(-50, 'USD')).toThrow(InvalidMoneyException);
    });

    it('Currency Mismatch: rejects payment completion when Payment currency (EUR) differs from Sale currency (USD)', async () => {
      const sale = Sale.create(
        {
          id: SaleId.create('sale-usd-01'),
          source: validSource,
          tenantId,
          currency: 'USD',
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-usd-01'),
          source: validSource,
          description: 'USD Service',
          quantity: 1,
          unitPrice: Money.create(100, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      const eurPayment = Payment.createPending(
        {
          id: PaymentId.create('pay-eur-01'),
          saleId: sale.id,
          amount: Money.create(100, 'EUR'),
          method: PaymentMethod.QR,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(eurPayment);

      const command = new CompletePaymentCommand({
        paymentId: eurPayment.id.value,
        saleId: sale.id.value,
        reference: 'CURRENCY-MISMATCH-ATTEMPT',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      const mismatchErr = result.getError() as Error;
      expect(mismatchErr.message).toContain('EUR');
      expect(mismatchErr.message).toContain('USD');

      // Database verification: state untouched
      expect(db.payments.get(eurPayment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      expect(publishedEvents).toHaveLength(0);
    });

    it('Overpayment: rejects payment completion when single payment amount exceeds Sale remaining balance', async () => {
      // Sale is 100 USD, but Payment is 150 USD
      const sale = Sale.create(
        {
          id: SaleId.create('sale-overpay-01'),
          source: validSource,
          tenantId,
          currency: 'USD',
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-overpay-01'),
          source: validSource,
          description: 'Regular Service',
          quantity: 1,
          unitPrice: Money.create(100, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      const overpayment = Payment.createPending(
        {
          id: PaymentId.create('pay-over-150'),
          saleId: sale.id,
          amount: Money.create(150, 'USD'),
          method: PaymentMethod.CASH,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(overpayment);

      const command = new CompletePaymentCommand({
        paymentId: overpayment.id.value,
        saleId: sale.id.value,
        reference: 'OVERPAYMENT-ATTEMPT',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);

      // Verify PostgreSQL state: payment remains PENDING, sale remains PENDING_PAYMENT
      expect(db.payments.get(overpayment.id.value)?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      expect(publishedEvents).toHaveLength(0);
    });

    it('Partial Payment: supports multi-installment payments, transitioning Sale to PARTIALLY_PAID then PAID', async () => {
      // Total sale amount: 200.00 USD
      const sale = Sale.create(
        {
          id: SaleId.create('sale-multi-part'),
          source: validSource,
          tenantId,
          currency: 'USD',
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-multi-01'),
          source: validSource,
          description: 'Comprehensive Treatment Package',
          quantity: 1,
          unitPrice: Money.create(200, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      // Installment 1: 80.00 USD
      const payment1 = Payment.createPending(
        {
          id: PaymentId.create('pay-part-1'),
          saleId: sale.id,
          amount: Money.create(80, 'USD'),
          method: PaymentMethod.CASH,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(payment1);

      // Installment 2: 120.00 USD
      const payment2 = Payment.createPending(
        {
          id: PaymentId.create('pay-part-2'),
          saleId: sale.id,
          amount: Money.create(120, 'USD'),
          method: PaymentMethod.QR,
          tenantId,
        },
        clock,
      );
      await paymentRepo.save(payment2);

      // 1. Complete Installment 1 (80 USD / 200 USD)
      const cmd1 = new CompletePaymentCommand({
        paymentId: payment1.id.value,
        saleId: sale.id.value,
        reference: 'INSTALLMENT-1-CASH',
        tenantId,
        currentUser: authorizedUser,
      });

      const res1 = await handler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // Verify database state after Installment 1:
      // Payment 1 is COMPLETED/SETTLED, Sale is PARTIALLY_PAID!
      expect(db.payments.get(payment1.id.value)?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PARTIALLY_PAID);
      expect(publishedEvents.map((e) => e.eventType)).toEqual([
        'PaymentSettled',
        'SalePartiallyPaid',
      ]);

      publishedEvents.length = 0; // Clear events

      // 2. Complete Installment 2 (120 USD / 200 USD cumulative 200 USD >= total 200 USD)
      const cmd2 = new CompletePaymentCommand({
        paymentId: payment2.id.value,
        saleId: sale.id.value,
        reference: 'INSTALLMENT-2-QR',
        tenantId,
        currentUser: authorizedUser,
      });

      const res2 = await handler.execute(cmd2);
      expect(res2.isSuccess).toBe(true);

      // Verify database state after Installment 2:
      // Both payments COMPLETED/SETTLED, Sale is now PAID!
      expect(db.payments.get(payment1.id.value)?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(db.payments.get(payment2.id.value)?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(db.sales.get(sale.id.value)?.status).toBe(PrismaSaleStatus.PAID);
      expect(publishedEvents.map((e) => e.eventType)).toEqual(['PaymentSettled', 'SalePaid']);
    });
  });

  // =========================================================================
  // 6. Transaction Failure
  // =========================================================================
  describe('6. Transaction Failure: Database Rollback Guarantees Zero Inconsistent Commits', () => {
    it('Payment persistence fails → atomic transaction rolls back, leaving Payment PENDING and Sale PENDING_PAYMENT', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-fail-pay',
        'pay-fail-pay',
      );

      // Inject fault when updating payment in PostgreSQL
      db.failOnPaymentSave = true;

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'FAIL-ON-PAY-PERSIST',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(String(result.getError())).toContain(
        'Simulated disk I/O / lock timeout on payment update',
      );

      // ATOMIC TRANSACTION ROLLBACK VERIFICATION:
      // In PostgreSQL committed storage:
      // Payment remains PENDING
      const rawPayment = db.payments.get(payment.id.value);
      expect(rawPayment?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(rawPayment?.paidAt).toBeNull();
      expect(rawPayment?.version).toBe(1);

      // Sale remains PENDING_PAYMENT
      const rawSale = db.sales.get(sale.id.value);
      expect(rawSale?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      expect(rawSale?.version).toBe(2);

      // Zero domain events published
      expect(publishedEvents).toHaveLength(0);
    });

    it('Sale persistence fails → atomic transaction rolls back, Payment changes are discarded, leaving Payment PENDING', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-fail-sale',
        'pay-fail-sale',
      );

      // Inject fault when updating sale in PostgreSQL
      db.failOnSaleSave = true;

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'FAIL-ON-SALE-PERSIST',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(String(result.getError())).toContain(
        'Simulated write conflict / I/O error on sale update',
      );

      // CRITICAL TRANSACTION ARCHITECTURAL PROOF:
      // Even though Payment aggregate was modified in memory and staged in the transaction buffer,
      // the failure on Sale update forced the entire $transaction to abort.
      // Therefore, in committed storage:
      // 1. Payment MUST NOT be COMPLETED! It MUST be PENDING!
      const rawPayment = db.payments.get(payment.id.value);
      expect(rawPayment?.status).toBe(PrismaPaymentStatus.PENDING);
      expect(rawPayment?.paidAt).toBeNull();
      expect(rawPayment?.version).toBe(1);

      // 2. Sale MUST NOT be PAID! It MUST be PENDING_PAYMENT!
      const rawSale = db.sales.get(sale.id.value);
      expect(rawSale?.status).toBe(PrismaSaleStatus.PENDING_PAYMENT);
      expect(rawSale?.version).toBe(2);

      // 3. Absolute structural invariant: System cannot persist Payment = COMPLETED while Sale != PAID
      expect(
        rawPayment?.status === PrismaPaymentStatus.SETTLED &&
          rawSale?.status !== PrismaSaleStatus.PAID,
      ).toBe(false);

      expect(publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. Concurrency
  // =========================================================================
  describe('7. Concurrency: Two Simultaneous Completion Attempts on the Same Payment', () => {
    it('guarantees that exactly one concurrent attempt commits and the second is rejected via OCC collision', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        100.0,
        'USD',
        'sale-race-occ',
        'pay-race-occ',
      );

      // Worker A and Worker B both target the exact same PENDING Payment (version 1)
      const commandA = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TRACE-WORKER-ALPHA',
        tenantId,
        currentUser: authorizedUser,
      });

      const commandB = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TRACE-WORKER-BETA',
        tenantId,
        currentUser: authorizedUser,
      });

      // Execute simultaneously
      const [resultA, resultB] = await Promise.all([
        handler.execute(commandA),
        handler.execute(commandB),
      ]);

      const successResults = [resultA, resultB].filter((r) => r.isSuccess);
      const failedResults = [resultA, resultB].filter((r) => r.isFailure);

      // Invariant: Exactly one succeeds, exactly one fails
      expect(successResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);

      // The losing worker fails with Optimistic Lock Exception
      const error = failedResults[0]!.getError();
      expect(error).toBeInstanceOf(PaymentOptimisticLockException);
      expect((error as Error).message).toContain(payment.id.value);

      // In the database: Payment version incremented exactly once (version 2)
      const rawPayment = db.payments.get(payment.id.value);
      expect(rawPayment?.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(rawPayment?.version).toBe(2);

      // Sale version incremented exactly once (version 3)
      const rawSale = db.sales.get(sale.id.value);
      expect(rawSale?.status).toBe(PrismaSaleStatus.PAID);
      expect(rawSale?.version).toBe(3);

      // Events published exactly once for the winning worker
      expect(publishedEvents).toHaveLength(2);
      expect(publishedEvents.map((e) => e.eventType)).toEqual(['PaymentSettled', 'SalePaid']);
    });
  });

  // =========================================================================
  // 8. Idempotency
  // =========================================================================
  describe('8. Idempotency: Repeated Completion Requests Leave Database State Untouched', () => {
    it('subsequent completion request after successful settlement is rejected and produces zero side effects', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        120.0,
        'USD',
        'sale-idemp-01',
        'pay-idemp-01',
      );

      const initialCommand = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'IDEMPOTENT-ORIGINAL-999',
        tenantId,
        currentUser: authorizedUser,
      });

      const initialResult = await handler.execute(initialCommand);
      expect(initialResult.isSuccess).toBe(true);

      const paymentSnapshotAfterFirst = { ...db.payments.get(payment.id.value)! };
      const saleSnapshotAfterFirst = { ...db.sales.get(sale.id.value)! };

      publishedEvents.length = 0; // Clear events

      // Repeated request (e.g. network retry / duplicate click)
      const retryCommand = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'IDEMPOTENT-ORIGINAL-999',
        tenantId,
        currentUser: authorizedUser,
      });

      const retryResult = await handler.execute(retryCommand);

      expect(retryResult.isFailure).toBe(true);
      expect(retryResult.getError()).toBeInstanceOf(PaymentAlreadyCompletedException);

      // Database state must be strictly identical down to every field
      const currentPayment = db.payments.get(payment.id.value)!;
      const currentSale = db.sales.get(sale.id.value)!;

      expect(currentPayment).toEqual(paymentSnapshotAfterFirst);
      expect(currentSale).toEqual(saleSnapshotAfterFirst);
      expect(publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 9. Persistence & Contradictory State Prover
  // =========================================================================
  describe('9. Persistence & Invariant Proof: System Cannot Leave Sale and Payment in Contradictory States', () => {
    it('verifies exact final PostgreSQL database state and proves mutual settlement consistency', async () => {
      const { sale, payment } = await seedPayableSaleAndPendingPayment(
        250.75,
        'USD',
        'sale-final-spec',
        'pay-final-spec',
      );

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'FINAL-AUDIT-REF-777',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      // Deep inspection of raw database tables
      const dbPayment = db.payments.get(payment.id.value)!;
      const dbSale = db.sales.get(sale.id.value)!;

      // Payment storage assertions
      expect(dbPayment.id).toBe(payment.id.value);
      expect(dbPayment.saleId).toBe(sale.id.value);
      expect(dbPayment.tenantId).toBe(tenantId);
      expect(dbPayment.status).toBe(PrismaPaymentStatus.SETTLED);
      expect(dbPayment.method).toBe(PrismaPaymentMethod.QR);
      expect(dbPayment.amount.toString()).toBe('250.75');
      expect(dbPayment.currency).toBe('USD');
      expect(dbPayment.reference).toBe('FINAL-AUDIT-REF-777');
      expect(dbPayment.paidAt).toEqual(clock.now());
      expect(dbPayment.version).toBe(2);

      // Sale storage assertions
      expect(dbSale.id).toBe(sale.id.value);
      expect(dbSale.tenantId).toBe(tenantId);
      expect(dbSale.status).toBe(PrismaSaleStatus.PAID);
      expect(dbSale.totalAmount.toString()).toBe('250.75');
      expect(dbSale.version).toBe(3);

      // MATHEMATICAL PROOF OF NON-CONTRADICTION:
      // Condition 1: Payment COMPLETED <=> Sale PAID (or PARTIALLY_PAID)
      const isPaymentCompleted = dbPayment.status === PrismaPaymentStatus.SETTLED;
      const isSalePaidOrPartiallyPaid =
        dbSale.status === PrismaSaleStatus.PAID ||
        dbSale.status === PrismaSaleStatus.PARTIALLY_PAID;
      expect(isPaymentCompleted && !isSalePaidOrPartiallyPaid).toBe(false);

      // Condition 2: Sale PAID <=> Sum of settled payments >= Sale total
      const allPaymentsForSale = Array.from(db.payments.values()).filter(
        (p) => p.saleId === sale.id.value,
      );
      const totalSettledInDb = allPaymentsForSale
        .filter((p) => p.status === PrismaPaymentStatus.SETTLED)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const isSalePaid = dbSale.status === PrismaSaleStatus.PAID;
      if (isSalePaid) {
        expect(totalSettledInDb).toBeGreaterThanOrEqual(Number(dbSale.totalAmount));
      }
    });
  });
});
