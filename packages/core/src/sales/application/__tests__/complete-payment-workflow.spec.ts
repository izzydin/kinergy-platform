import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { SalesTransactionCoordinatorPort } from '../ports/sales-transaction-coordinator.port';
import { Payment } from '../../domain/payment.aggregate';
import { Sale } from '../../domain/sale.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { InvalidPaymentTransitionException } from '../../domain/exceptions/invalid-payment-transition.exception';
import { InvalidSaleTransitionException } from '../../domain/exceptions/invalid-sale-transition.exception';
import { PaymentOptimisticLockException } from '../../domain/exceptions/optimistic-lock.exception';

// In-Memory Test Repositories with OCC Emulation
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public shouldFailSave = false;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    return Payment.reconstitute({
      id: payment.id,
      tenantId: payment.tenantId,
      saleId: payment.saleId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      version: payment.version,
    });
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database disk I/O error during Payment persistence.');
    }
    const existing = this.store.get(payment.id.value);
    if (existing && existing.version >= payment.version) {
      throw new PaymentOptimisticLockException(payment.id.value, existing.version);
    }
    this.store.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public shouldFailSave = false;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      source: sale.source,
      status: sale.status,
      orderDiscount: sale.orderDiscount,
      items: [...sale.items],
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      version: sale.version,
    });
  }

  async save(sale: Sale): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database timeout during Sale aggregate persistence.');
    }
    this.store.set(sale.id.value, sale);
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

/**
 * Emulates an ACID Transaction Coordinator.
 * On failure, discards any mutations performed during the execution block.
 */
class MockTransactionalCoordinator implements SalesTransactionCoordinatorPort {
  constructor(
    private readonly paymentRepo: InMemoryPaymentRepository,
    private readonly saleRepo: InMemorySaleRepository,
  ) {}

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.runInTransaction(work);
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Snapshot repository stores before work
    const paymentSnapshot = new Map(this.paymentRepo.store);
    const saleSnapshot = new Map(this.saleRepo.store);

    try {
      return await work();
    } catch (error) {
      // Roll back state to snapshot on any exception
      this.paymentRepo.store = paymentSnapshot;
      this.saleRepo.store = saleSnapshot;
      throw error;
    }
  }
}

describe('CompletePayment Cross-Aggregate Use Case Specification', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-10-07T12:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let txCoordinator: MockTransactionalCoordinator;
  let handler: CompletePaymentHandler;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create(
      {
        tenantId,
        currency,
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'treatment_session_100',
        }),
      },
      clock,
    );
    sale.addItem(
      {
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'treatment_session_100',
        }),
        description: 'Physiotherapy Assessment & Consultation',
        quantity: 1,
        unitPrice: Money.create(totalAmount, currency),
      },
      clock,
    );
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  const createPendingPayment = (
    sale: Sale,
    amount: number = 100.0,
    currency: string = 'USD',
  ): Payment => {
    const payment = Payment.createPending(
      {
        saleId: sale.id,
        tenantId: sale.tenantId,
        amount: Money.create(amount, currency),
        method: PaymentMethod.QR,
      },
      clock,
    );
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    txCoordinator = new MockTransactionalCoordinator(paymentRepo, saleRepo);

    handler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      txCoordinator,
    );
  });

  // =========================================================================
  // 1. Valid Completion
  // =========================================================================
  describe('1. Valid Completion', () => {
    it('successfully completes full payment ($100.00 / $100.00), transitioning Payment to COMPLETED and Sale to PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'QR-GATEWAY-TX-001',
        paidAt: clock.now(),
        tenantId,
        currentUser: { id: 'cashier_1', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('QR-GATEWAY-TX-001');
      expect(dto.paidAt).toBe(clock.now().toISOString());

      // Verify Sale aggregate transition
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);

      // Verify domain events published post-commit
      expect(eventPublisher.publishedEvents.length).toBeGreaterThanOrEqual(2);
      const eventNames = eventPublisher.publishedEvents.map((e) => e.constructor.name);
      expect(eventNames).toContain('PaymentSettledEvent');
      expect(eventNames).toContain('SalePaidEvent');
    });

    it('successfully completes partial payment ($40.00 / $100.00), transitioning Payment to COMPLETED and Sale to PARTIALLY_PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 40.0, 'USD');

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        tenantId,
        currentUser: { id: 'cashier_1', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.COMPLETED);

      // Verify Sale status is PARTIALLY_PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PARTIALLY_PAID);

      const eventNames = eventPublisher.publishedEvents.map((e) => e.constructor.name);
      expect(eventNames).toContain('PaymentSettledEvent');
      expect(eventNames).toContain('SalePartiallyPaidEvent');
    });
  });

  // =========================================================================
  // 2. Payment Not Found
  // =========================================================================
  describe('2. Payment Not Found', () => {
    it('returns PaymentNotFoundException when payment ID does not exist', async () => {
      const nonExistentPaymentId = 'pay_unknown_999';

      const cmd = new CompletePaymentCommand({
        paymentId: nonExistentPaymentId,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect((result.getError() as Error).message).toContain(nonExistentPaymentId);
    });
  });

  // =========================================================================
  // 3. Sale Not Found
  // =========================================================================
  describe('3. Sale Not Found', () => {
    it('returns SaleNotFoundException when associated sale cannot be resolved', async () => {
      const orphanedPayment = Payment.createPending(
        {
          saleId: SaleId.create('sale_missing_ghost_404'),
          tenantId,
          amount: Money.create(50.0, 'USD'),
          method: PaymentMethod.QR,
        },
        clock,
      );
      paymentRepo.store.set(orphanedPayment.id.value, orphanedPayment);

      const cmd = new CompletePaymentCommand({
        paymentId: orphanedPayment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain('sale_missing_ghost_404');
    });
  });

  // =========================================================================
  // 4. Payment Already Completed
  // =========================================================================
  describe('4. Payment Already Completed', () => {
    it('delegates to Payment aggregate and rejects completion of already COMPLETED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Complete payment first time
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as Error).message).toMatch(/'COMPLETED' to status 'COMPLETED'/i);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Payment Failed
  // =========================================================================
  describe('5. Payment Failed', () => {
    it('delegates to Payment aggregate and rejects completion of a FAILED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Fail payment
      payment.fail({ reason: 'Payment terminal timed out', clock });
      paymentRepo.store.set(payment.id.value, payment);

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as Error).message).toMatch(/'FAILED' to status 'COMPLETED'/i);
    });
  });

  // =========================================================================
  // 6. Payment Cancelled
  // =========================================================================
  describe('6. Payment Cancelled', () => {
    it('delegates to Payment aggregate and rejects completion of a CANCELLED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Cancel payment
      payment.cancel({ reason: 'Operator aborted payment', clock });
      paymentRepo.store.set(payment.id.value, payment);

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((result.getError() as Error).message).toMatch(/'CANCELLED' to status 'COMPLETED'/i);
    });
  });

  // =========================================================================
  // 7. Sale Invalid State (CANCELLED / DRAFT)
  // =========================================================================
  describe('7. Sale Invalid State', () => {
    it('rejects completion when the associated Sale has been CANCELLED', async () => {
      const sale = createPayableSale(100.0, 'USD');
      sale.cancel('Customer walked out', clock);
      saleRepo.store.set(sale.id.value, sale);

      const payment = createPendingPayment(sale, 100.0, 'USD');

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((result.getError() as Error).message).toMatch(/CANCELLED/i);

      // Verify payment was NOT persisted as completed in repository
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment?.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects completion when the associated Sale is still in DRAFT status', async () => {
      const draftSale = Sale.create(
        {
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'draft_sess_1',
          }),
        },
        clock,
      );
      draftSale.addItem(
        {
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'draft_sess_1',
          }),
          description: 'Physiotherapy Assessment Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      saleRepo.store.set(draftSale.id.value, draftSale);

      const payment = Payment.createPending(
        {
          saleId: draftSale.id,
          tenantId,
          amount: Money.create(50.0, 'USD'),
          method: PaymentMethod.QR,
        },
        clock,
      );
      paymentRepo.store.set(payment.id.value, payment);

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((result.getError() as Error).message).toMatch(/DRAFT/i);
    });
  });

  // =========================================================================
  // 8. Sale Already Paid
  // =========================================================================
  describe('8. Sale Already Paid', () => {
    it('delegates to Sale aggregate and rejects completing a payment against an already PAID Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');
      sale.markPaid(clock);
      saleRepo.store.set(sale.id.value, sale);

      const payment = createPendingPayment(sale, 100.0, 'USD');

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((result.getError() as Error).message).toMatch(/PAID/i);

      // Verify payment in repo remains PENDING
      const persistedPayment = await paymentRepo.findById(payment.id);
      expect(persistedPayment?.status).toBe(PaymentStatus.PENDING);
    });
  });

  // =========================================================================
  // 9. Amount Mismatch (Currency & Overpayment)
  // =========================================================================
  describe('9. Amount Mismatch', () => {
    it('rejects completion when payment currency mismatches Sale currency', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const paymentInEur = createPendingPayment(sale, 100.0, 'EUR');

      const cmd = new CompletePaymentCommand({
        paymentId: paymentInEur.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect((result.getError() as Error).message).toContain('EUR');
      expect((result.getError() as Error).message).toContain('USD');
    });

    it('rejects completion when payment amount exceeds remaining unpaid balance', async () => {
      const sale = createPayableSale(100.0, 'USD');
      // Create and settle a prior $70 payment
      const priorPayment = Payment.createCompleted(
        {
          saleId: sale.id,
          tenantId,
          amount: Money.create(70.0, 'USD'),
          method: PaymentMethod.CASH,
        },
        clock,
      );
      paymentRepo.store.set(priorPayment.id.value, priorPayment);

      // Now attempt to complete a pending $50 payment (remaining is only $30)
      const pendingPayment = createPendingPayment(sale, 50.0, 'USD');

      const cmd = new CompletePaymentCommand({
        paymentId: pendingPayment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect((result.getError() as Error).message).toContain('50.00');
      expect((result.getError() as Error).message).toContain('30.00');
    });
  });

  // =========================================================================
  // 10. Persistence Failure
  // =========================================================================
  describe('10. Persistence Failure', () => {
    it('returns failure and suppresses domain events when payment persistence fails', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      paymentRepo.shouldFailSave = true;

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain('Database disk I/O error');
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('returns failure and suppresses domain events when sale persistence fails', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      saleRepo.shouldFailSave = true;

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain('Database timeout');
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // 11. Concurrent Completion
  // =========================================================================
  describe('11. Concurrent Completion', () => {
    it('handles concurrent race condition where a stale worker encounters OCC conflict', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Worker 1 completes the payment successfully
      const worker1Cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        reference: 'RACE-WINNER-REF',
        currentUser: { id: 'worker_1', permissions: ['payments.manage'] },
      });
      const worker1Result = await handler.execute(worker1Cmd);
      expect(worker1Result.isSuccess).toBe(true);

      // Worker 2 attempts to complete the same payment using the now-completed state
      const worker2Cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        reference: 'RACE-LOSER-REF',
        currentUser: { id: 'worker_2', permissions: ['payments.manage'] },
      });
      const worker2Result = await handler.execute(worker2Cmd);

      // Worker 2 is rejected by the domain state transition
      expect(worker2Result.isFailure).toBe(true);
      expect(worker2Result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('rejects stale persistence update with PaymentOptimisticLockException when version conflict occurs', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Manually increment repo version to simulate external concurrent write
      const updatedPayment = Payment.reconstitute({
        id: payment.id,
        tenantId: payment.tenantId,
        saleId: payment.saleId,
        method: payment.method,
        amount: payment.amount,
        status: PaymentStatus.PENDING,
        reference: null,
        paidAt: null,
        createdAt: payment.createdAt,
        updatedAt: new Date(),
        version: 5, // Stale relative to handler's loaded version
      });
      paymentRepo.store.set(payment.id.value, updatedPayment);

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'worker', permissions: ['payments.manage'] },
      });

      // Override findById to return the old version (1) to emulate concurrent read before write
      jest.spyOn(paymentRepo, 'findById').mockResolvedValueOnce(
        Payment.reconstitute({
          id: payment.id,
          tenantId: payment.tenantId,
          saleId: payment.saleId,
          method: payment.method,
          amount: payment.amount,
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: null,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          version: 1,
        }),
      );

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOptimisticLockException);
    });
  });

  // =========================================================================
  // 12. Transaction Rollback
  // =========================================================================
  describe('12. Transaction Rollback', () => {
    it('rolls back all staged writes and maintains previous aggregate state if sale persistence fails', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Induce failure on the second write (Sale persistence) inside the transactional coordinator
      saleRepo.shouldFailSave = true;

      const cmd = new CompletePaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: { id: 'admin', permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);

      expect(result.isFailure).toBe(true);

      // Verify transaction rollback: Payment in repository remains in PENDING state
      const reloadedPayment = await paymentRepo.findById(payment.id);
      expect(reloadedPayment?.status).toBe(PaymentStatus.PENDING);
      expect(reloadedPayment?.paidAt).toBeNull();

      // Verify transaction rollback: Sale remains in PENDING_PAYMENT state
      const reloadedSale = await saleRepo.findById(sale.id);
      expect(reloadedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Verify no phantom domain events were published
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });
});
