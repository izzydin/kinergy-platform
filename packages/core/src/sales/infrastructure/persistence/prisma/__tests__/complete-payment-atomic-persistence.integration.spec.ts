import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
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
import { InvalidPaymentTransitionException } from '../../../../domain/exceptions/invalid-payment-transition.exception';

/**
 * High-fidelity transactional database harness emulating PostgreSQL ACID semantics:
 * - Read Committed isolation with snapshot staging per $transaction.
 * - Atomic rollback: any unhandled exception inside $transaction discards all staged writes.
 * - Multi-aggregate rollback coordination between payments and sales.
 */
class MockPhase7TransactionalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  // Diagnostic fault-injection flags
  public failOnSaleUpdate = false;
  public failOnPaymentUpdate = false;

  constructor(public readonly clock: DeterministicClock) {}

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
            if (this.failOnSaleUpdate) {
              throw new Error(
                'PostgreSQL Error: Simulated disk I/O / foreign constraint failure on sales update',
              );
            }
            const existing = bufferedSales.get(where.id);
            if (existing && (where.version === undefined || existing.version === where.version)) {
              const updated = {
                ...existing,
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
            if (this.failOnPaymentUpdate) {
              throw new Error(
                'PostgreSQL Error: Simulated deadlock / write failure on payments update',
              );
            }
            const existing = bufferedPayments.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = {
                ...existing,
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

        // Execute inside transaction buffer
        const result = await callback(tx);

        // Commit atomically if and only if no error was thrown
        this.sales = bufferedSales;
        this.saleItems = bufferedItems;
        this.payments = bufferedPayments;

        return result;
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

describe('CompletePayment Atomic Cross-Aggregate Persistence Integration Specification', () => {
  const tenantId = 'org_health_wellness_01';
  let clock: DeterministicClock;
  let db: MockPhase7TransactionalDatabase;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let unitOfWork: PrismaSalesUnitOfWork;
  let eventPublisher: SalesEventPublisherPort;
  let publishedEvents: DomainEvent[];
  let handler: CompletePaymentHandler;

  const validSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-physio-999',
    sourceCode: 'PHYSIO-ASSESS',
  });

  const currentUser = {
    id: 'user_cashier_01',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.manage'],
  };

  beforeEach(() => {
    clock = new DeterministicClock(new Date('2026-10-07T12:00:00.000Z'));
    db = new MockPhase7TransactionalDatabase(clock);
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
   * Helper to seed a payable Sale in PENDING_PAYMENT status and a pending Payment in PostgreSQL persistence.
   */
  async function seedPayableSaleAndPendingPayment(amountNumber: number = 100.0) {
    const sale = Sale.create(
      {
        id: SaleId.create('sale-atomic-001'),
        source: validSource,
        tenantId,
        currency: 'USD',
      },
      clock,
    );
    sale.addItem(
      {
        id: SaleItemId.create('item-1'),
        source: validSource,
        description: 'Comprehensive Kinesiology Assessment',
        quantity: 1,
        unitPrice: Money.create(amountNumber, 'USD'),
      },
      clock,
    );
    await saleRepo.save(sale);
    sale.finalize(clock);
    await saleRepo.save(sale);

    const payment = Payment.createPending(
      {
        id: PaymentId.create('pay-atomic-001'),
        saleId: sale.id,
        amount: Money.create(amountNumber, 'USD'),
        method: PaymentMethod.QR,
        tenantId,
      },
      clock,
    );
    await paymentRepo.save(payment);

    return { sale, payment };
  }

  // =========================================================================
  // Requirement 1: Payment completion succeeds → both states persist
  // =========================================================================
  it('1. Payment completion succeeds → both states persist atomically (Payment = COMPLETED, Sale = PAID)', async () => {
    const { payment } = await seedPayableSaleAndPendingPayment(150.0);

    const command = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: 'sale-atomic-001',
      reference: 'QR-BCP-987654',
      tenantId,
      currentUser,
    });

    const result = await handler.execute(command);

    // Verify application execution succeeded
    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe(PaymentStatus.COMPLETED);
    expect(dto.reference).toBe('QR-BCP-987654');

    // Verify relational database engine persistence:
    // Both Payment = COMPLETED and Sale = PAID must be persisted together in PostgreSQL
    const persistedPayment = await paymentRepo.findById(payment.id);
    expect(persistedPayment).not.toBeNull();
    expect(persistedPayment?.status).toBe(PaymentStatus.COMPLETED);
    expect(persistedPayment?.reference?.value).toBe('QR-BCP-987654');
    expect(persistedPayment?.paidAt).toEqual(clock.now());

    const persistedSale = await saleRepo.findById('sale-atomic-001');
    expect(persistedSale).not.toBeNull();
    expect(persistedSale?.status).toBe(SaleStatus.PAID);

    // Verify domain events were dispatched post-commit
    expect(publishedEvents.length).toBeGreaterThan(0);
    const eventTypes = publishedEvents.map((e) => e.eventType);
    expect(eventTypes).toContain('PaymentSettled');
    expect(eventTypes).toContain('SalePaid');
  });

  // =========================================================================
  // Requirement 2: Payment completion fails → neither state changes
  // =========================================================================
  it('2. Payment completion fails (domain level) → neither state changes in persistence', async () => {
    const { sale, payment } = await seedPayableSaleAndPendingPayment(100.0);

    // Cancel the payment in domain and persist it in CANCELLED status
    payment.cancel('Customer declined QR prompt', clock);
    await paymentRepo.save(payment);

    expect(db.payments.get(payment.id.value)?.status).toBe('CANCELLED');
    expect(db.sales.get(sale.id.value)?.status).toBe('PENDING_PAYMENT');

    // Attempt CompletePayment on the CANCELLED payment
    const command = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: sale.id.value,
      tenantId,
      currentUser,
    });

    const result = await handler.execute(command);

    // Orchestration halts because domain rejects transition from CANCELLED
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

    // Verify database state: neither state changed
    const persistedPayment = await paymentRepo.findById(payment.id);
    expect(persistedPayment?.status).toBe(PaymentStatus.CANCELLED);
    expect(persistedPayment?.paidAt).toBeNull();

    const persistedSale = await saleRepo.findById(sale.id);
    expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);

    // Zero domain events published
    expect(publishedEvents).toHaveLength(0);
  });

  // =========================================================================
  // Requirement 3: Sale transition fails → Payment remains unchanged
  // =========================================================================
  it('3. Sale transition fails (Sale in CANCELLED state) → Payment remains unchanged in persistence', async () => {
    const { sale, payment } = await seedPayableSaleAndPendingPayment(100.0);

    // Cancel the Sale aggregate in persistence while the Payment was PENDING
    sale.cancel('Order cancelled by customer before tender', clock);
    await saleRepo.save(sale);

    expect(db.sales.get(sale.id.value)?.status).toBe('CANCELLED');
    expect(db.payments.get(payment.id.value)?.status).toBe('PENDING');

    const command = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: sale.id.value,
      tenantId,
      currentUser,
    });

    const result = await handler.execute(command);

    // The handler halts because the associated Sale is cancelled / non-payable
    expect(result.isFailure).toBe(true);

    // CRITICAL INVARIANT: Payment must NOT have transitioned to COMPLETED in persistence
    const persistedPayment = await paymentRepo.findById(payment.id);
    expect(persistedPayment?.status).toBe(PaymentStatus.PENDING);
    expect(persistedPayment?.paidAt).toBeNull();

    const persistedSale = await saleRepo.findById(sale.id);
    expect(persistedSale?.status).toBe(SaleStatus.CANCELLED);

    // System cannot persist Payment = COMPLETED while Sale != PAID
    expect(
      persistedPayment?.status === PaymentStatus.COMPLETED &&
        persistedSale?.status !== SaleStatus.PAID,
    ).toBe(false);

    expect(publishedEvents).toHaveLength(0);
  });

  // =========================================================================
  // Requirement 4: Persistence failure → rollback
  // =========================================================================
  it('4. Persistence failure on Sale → atomic transaction rolls back, leaving Payment in prior PENDING state', async () => {
    const { sale, payment } = await seedPayableSaleAndPendingPayment(100.0);

    // Inject database write fault on Sale update inside the unit-of-work transaction
    db.failOnSaleUpdate = true;

    const command = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: sale.id.value,
      tenantId,
      currentUser,
    });

    const result = await handler.execute(command);

    // Execution must fail and bubble the persistence error
    expect(result.isFailure).toBe(true);
    const errorMsg =
      result.getError() instanceof Error
        ? (result.getError() as Error).message
        : String(result.getError());
    expect(errorMsg).toContain('Simulated disk I/O / foreign constraint failure on sales update');

    // TRANSACTION INTEGRITY VERIFICATION:
    // Even though Payment was updated to COMPLETED in memory and staged in the transaction buffer,
    // the failure on Sale update caused PostgreSQL transaction ROLLBACK.
    // Therefore, in committed storage:
    // 1. Payment MUST NOT be COMPLETED! It must still be PENDING!
    const reloadedPayment = db.payments.get(payment.id.value);
    expect(reloadedPayment).toBeDefined();
    expect(reloadedPayment?.status).toBe('PENDING');
    expect(reloadedPayment?.paidAt).toBeNull();

    // 2. Sale MUST NOT be PAID! It must still be PENDING_PAYMENT!
    const reloadedSale = db.sales.get(sale.id.value);
    expect(reloadedSale).toBeDefined();
    expect(reloadedSale?.status).toBe('PENDING_PAYMENT');

    // 3. Absolute structural invariant: System cannot persist Payment = COMPLETED while Sale != PAID
    expect(
      (reloadedPayment?.status as string) === 'COMPLETED' &&
        (reloadedSale?.status as string) !== 'PAID',
    ).toBe(false);

    // 4. Absolute structural invariant: System cannot persist Sale = PAID while Payment != COMPLETED
    expect(
      (reloadedSale?.status as string) === 'PAID' &&
        (reloadedPayment?.status as string) !== 'COMPLETED',
    ).toBe(false);

    // 5. Post-commit event publisher is never called
    expect(publishedEvents).toHaveLength(0);
  });

  // =========================================================================
  // Requirement 5: Duplicate completion cannot create an inconsistent state
  // =========================================================================
  it('5. Duplicate completion cannot create an inconsistent state or corrupt OCC version', async () => {
    const { sale, payment } = await seedPayableSaleAndPendingPayment(100.0);

    const command = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: sale.id.value,
      reference: 'FIRST-ATTEMPT-SUCCESS',
      tenantId,
      currentUser,
    });

    // First completion succeeds
    const firstResult = await handler.execute(command);
    expect(firstResult.isSuccess).toBe(true);

    const paymentAfterFirst = await paymentRepo.findById(payment.id);
    const saleAfterFirst = await saleRepo.findById(sale.id);
    expect(paymentAfterFirst?.status).toBe(PaymentStatus.COMPLETED);
    expect(saleAfterFirst?.status).toBe(SaleStatus.PAID);
    const settledVersion = paymentAfterFirst?.version;

    // Second completion attempt on the already completed payment
    const duplicateCommand = new CompletePaymentCommand({
      paymentId: payment.id.value,
      saleId: sale.id.value,
      reference: 'DUPLICATE-RETRY-ATTEMPT',
      tenantId,
      currentUser,
    });

    const duplicateResult = await handler.execute(duplicateCommand);

    // Must be rejected by domain invariants (Payment already COMPLETED is immutable)
    expect(duplicateResult.isFailure).toBe(true);
    expect(duplicateResult.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

    // State in relational database must remain strictly consistent and uncorrupted:
    const paymentAfterSecond = await paymentRepo.findById(payment.id);
    const saleAfterSecond = await saleRepo.findById(sale.id);

    expect(paymentAfterSecond?.status).toBe(PaymentStatus.COMPLETED);
    expect(paymentAfterSecond?.reference?.value).toBe('FIRST-ATTEMPT-SUCCESS');
    expect(paymentAfterSecond?.version).toBe(settledVersion);

    expect(saleAfterSecond?.status).toBe(SaleStatus.PAID);

    // Invariant holds: both states remain COMPLETED and PAID consistently
    expect(
      paymentAfterSecond?.status === PaymentStatus.COMPLETED &&
        saleAfterSecond?.status === SaleStatus.PAID,
    ).toBe(true);
  });
});
