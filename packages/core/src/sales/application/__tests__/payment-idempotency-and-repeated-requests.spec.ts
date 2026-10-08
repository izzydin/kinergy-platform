import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { FailPaymentHandler } from '../handlers/fail-payment.handler';
import { CancelPaymentHandler } from '../handlers/cancel-payment.handler';
import { CreatePaymentCommand } from '../commands/create-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';
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
import { DuplicatePaymentReferenceException } from '../exceptions/duplicate-payment-reference.exception';
import { InvalidPaymentTransitionException } from '../../domain/exceptions/invalid-payment-transition.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { SaleNotPayableException } from '../exceptions/sale-not-payable.exception';

// In-Memory Test Repositories with OCC Emulation
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

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
    this.store.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

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

class MockUnitOfWork implements SalesTransactionCoordinatorPort {
  public executedTransactions = 0;

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executedTransactions++;
    return work();
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executedTransactions++;
    return work();
  }
}

describe('Payment Operations Idempotency & Repeated Request Verification', () => {
  const tenantId = 'tenant_idempotency_audit';
  const baseTime = new Date('2026-10-01T12:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let unitOfWork: MockUnitOfWork;

  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let failPaymentHandler: FailPaymentHandler;
  let cancelPaymentHandler: CancelPaymentHandler;

  const defaultUser = {
    userId: 'usr_cashier_01',
    roles: ['Receptionist', 'Manager'],
    permissions: ['payments.create', 'payments.manage', 'payments.read'],
    tenantId,
  };

  const createPayableSale = (total: number = 100.0, saleIdStr: string = 'sale_idem_101'): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(saleIdStr),
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold_001',
        }),
      },
      clock,
    );
    sale.addItem({
      sourceReference: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_001',
      }),
      description: 'Gold Membership Annual Plan',
      quantity: 1,
      unitPrice: Money.create(total, 'USD'),
    });
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    unitOfWork = new MockUnitOfWork();

    createPaymentHandler = new CreatePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);

    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );

    failPaymentHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    cancelPaymentHandler = new CancelPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
  });

  // ===========================================================================
  // 1. CompletePayment Idempotency & Two-Aggregate Invariants
  // ===========================================================================
  describe('1. CompletePayment Idempotency & Two-Aggregate Invariants', () => {
    it('executes CompletePayment once successfully, updating both Payment and Sale aggregates', async () => {
      const sale = createPayableSale(100.0);

      // Create a PENDING payment
      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_pending_01'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
          reference: 'QR_TRACE_INIT_001',
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new CompletePaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reference: 'QR_TRACE_CONFIRMED_001',
        currentUser: defaultUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('QR_TRACE_CONFIRMED_001');

      // Verify Payment persisted state
      const savedPayment = await paymentRepo.findById(pendingPayment.id);
      expect(savedPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(savedPayment?.version).toBe(2);
      expect(savedPayment?.paidAt).toEqual(baseTime);

      // Verify Sale persisted state updated to PAID
      const savedSale = await saleRepo.findById(sale.id);
      expect(savedSale?.status).toBe(SaleStatus.PAID);
      expect(savedSale?.version).toBe(3);

      // Verify unitOfWork transaction executed
      expect(unitOfWork.executedTransactions).toBe(1);
    });

    it('rejects repeated CompletePayment as an explicit domain error (InvalidPaymentTransitionException), NOT a silent no-op', async () => {
      const sale = createPayableSale(100.0);

      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_pending_02'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
          reference: 'QR_TRACE_002',
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new CompletePaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reference: 'QR_TRACE_002_FINAL',
        currentUser: defaultUser,
      });

      // First execution succeeds
      const firstResult = await completePaymentHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);

      const paymentAfterFirst = await paymentRepo.findById(pendingPayment.id);
      const saleAfterFirst = await saleRepo.findById(sale.id);
      const eventsAfterFirstCount = eventPublisher.publishedEvents.length;
      const txAfterFirstCount = unitOfWork.executedTransactions;

      // Advance clock to detect if repeated call mutates timestamps
      clock.advanceMinutes(5);

      // REPEATED CompletePayment invocation
      const repeatedResult = await completePaymentHandler.execute(command);

      // Must be an explicit failure, NOT a silent success
      expect(repeatedResult.isFailure).toBe(true);
      const error = repeatedResult.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((error as InvalidPaymentTransitionException).currentStatus).toBe(
        PaymentStatus.COMPLETED,
      );
      expect((error as InvalidPaymentTransitionException).targetStatus).toBe(
        PaymentStatus.COMPLETED,
      );
      expect((error as Error).message).toContain('Completed payments are permanently immutable');

      // Proves neither aggregate was altered by the repeated call
      const paymentAfterSecond = await paymentRepo.findById(pendingPayment.id);
      expect(paymentAfterSecond?.version).toBe(paymentAfterFirst?.version);
      expect(paymentAfterSecond?.paidAt).toEqual(paymentAfterFirst?.paidAt);
      expect(paymentAfterSecond?.updatedAt).toEqual(paymentAfterFirst?.updatedAt);

      const saleAfterSecond = await saleRepo.findById(sale.id);
      expect(saleAfterSecond?.status).toBe(SaleStatus.PAID);
      expect(saleAfterSecond?.version).toBe(saleAfterFirst?.version);
      expect(saleAfterSecond?.updatedAt).toEqual(saleAfterFirst?.updatedAt);

      // Zero new transactions or events on rejected repetition
      expect(unitOfWork.executedTransactions).toBe(txAfterFirstCount);
      expect(eventPublisher.publishedEvents.length).toBe(eventsAfterFirstCount);
    });

    it('rejects repeated CompletePayment when Sale has advanced to terminal COMPLETED status', async () => {
      const sale = createPayableSale(100.0);

      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_pending_03'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new CompletePaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        currentUser: defaultUser,
      });

      // Complete payment and advance Sale
      await completePaymentHandler.execute(command);

      // Store clerk fulfills merchandise, moving Sale to COMPLETED
      const savedSale = (await saleRepo.findById(sale.id))!;
      savedSale.markCompleted(clock);
      await saleRepo.save(savedSale);

      // Replaying complete payment must be rejected without reverting Sale
      const repeatResult = await completePaymentHandler.execute(command);
      expect(repeatResult.isFailure).toBe(true);

      const currentSale = await saleRepo.findById(sale.id);
      expect(currentSale?.status).toBe(SaleStatus.COMPLETED);
    });
  });

  // ===========================================================================
  // 2. FailPayment Idempotency
  // ===========================================================================
  describe('2. FailPayment Idempotency', () => {
    it('executes FailPayment once successfully', async () => {
      const sale = createPayableSale(100.0);
      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_fail_01'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new FailPaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reason: 'Rail timeout code 504',
        currentUser: defaultUser,
      });

      const result = await failPaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PaymentStatus.FAILED);

      const saved = await paymentRepo.findById(pendingPayment.id);
      expect(saved?.status).toBe(PaymentStatus.FAILED);
      expect(saved?.version).toBe(2);
    });

    it('rejects repeated FailPayment explicitly with InvalidPaymentTransitionException', async () => {
      const sale = createPayableSale(100.0);
      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_fail_02'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new FailPaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reason: 'Bank decline',
        currentUser: defaultUser,
      });

      // First call succeeds
      await failPaymentHandler.execute(command);

      // Repeated call
      const repeatResult = await failPaymentHandler.execute(command);

      expect(repeatResult.isFailure).toBe(true);
      const error = repeatResult.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((error as InvalidPaymentTransitionException).currentStatus).toBe(PaymentStatus.FAILED);
      expect((error as InvalidPaymentTransitionException).targetStatus).toBe(PaymentStatus.FAILED);
      expect((error as Error).message).toContain(
        "Cannot transition from 'FAILED' to identical status 'FAILED'",
      );
    });
  });

  // ===========================================================================
  // 3. CancelPayment Idempotency
  // ===========================================================================
  describe('3. CancelPayment Idempotency', () => {
    it('executes CancelPayment once successfully', async () => {
      const sale = createPayableSale(100.0);
      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_cancel_01'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new CancelPaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reason: 'Customer opted for cash instead',
        currentUser: defaultUser,
      });

      const result = await cancelPaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PaymentStatus.CANCELLED);

      const saved = await paymentRepo.findById(pendingPayment.id);
      expect(saved?.status).toBe(PaymentStatus.CANCELLED);
      expect(saved?.version).toBe(2);
    });

    it('rejects repeated CancelPayment explicitly with InvalidPaymentTransitionException', async () => {
      const sale = createPayableSale(100.0);
      const pendingPayment = Payment.createPending(
        {
          id: PaymentId.create('pay_cancel_02'),
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(pendingPayment);

      const command = new CancelPaymentCommand({
        paymentId: pendingPayment.id.value,
        saleId: sale.id.value,
        tenantId,
        reason: 'Customer left queue',
        currentUser: defaultUser,
      });

      // First call succeeds
      await cancelPaymentHandler.execute(command);

      // Repeated call
      const repeatResult = await cancelPaymentHandler.execute(command);

      expect(repeatResult.isFailure).toBe(true);
      const error = repeatResult.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((error as InvalidPaymentTransitionException).currentStatus).toBe(
        PaymentStatus.CANCELLED,
      );
      expect((error as InvalidPaymentTransitionException).targetStatus).toBe(
        PaymentStatus.CANCELLED,
      );
      expect((error as Error).message).toContain(
        "Cannot transition from 'CANCELLED' to identical status 'CANCELLED'",
      );
    });
  });

  // ===========================================================================
  // 4. CreatePayment Idempotency & Reference Uniqueness Scope
  // ===========================================================================
  describe('4. CreatePayment Idempotency & Reference Uniqueness Scope', () => {
    it('rejects duplicate payment creation with the identical reference on the same Sale', async () => {
      const sale = createPayableSale(100.0);

      const command = new CreatePaymentCommand({
        saleId: sale.id.value,
        tenantId,
        amount: 50.0,
        method: PaymentMethod.CASH,
        reference: 'DRAWER-1-RCPT-500',
        currentUser: defaultUser,
      });

      // First payment creation succeeds
      const firstResult = await createPaymentHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);

      // Repeated creation with same reference
      const repeatResult = await createPaymentHandler.execute(command);

      expect(repeatResult.isFailure).toBe(true);
      const error = repeatResult.getError();
      expect(error).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect((error as Error).message).toContain('DRAWER-1-RCPT-500');
      expect((error as Error).message).toContain(sale.id.value);

      // Proves only one payment was created in the repository
      const payments = await paymentRepo.findBySaleId(sale.id);
      expect(payments).toHaveLength(1);
    });

    it('allows identical reference across different Sales (proves reference is scoped per-Sale, not globally unique)', async () => {
      const sale1 = createPayableSale(100.0, 'sale_scope_A');
      const sale2 = createPayableSale(100.0, 'sale_scope_B');

      const sharedRef = 'REGISTER-01-TX-999';

      const res1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale1.id.value,
          tenantId,
          amount: 40.0,
          method: PaymentMethod.CASH,
          reference: sharedRef,
          currentUser: defaultUser,
        }),
      );

      const res2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale2.id.value,
          tenantId,
          amount: 40.0,
          method: PaymentMethod.CASH,
          reference: sharedRef,
          currentUser: defaultUser,
        }),
      );

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
    });

    it('rejects repeated payment creation once Sale total debt is fully settled (preventing overpayment)', async () => {
      const sale = createPayableSale(100.0);

      // Settle full 100.00
      const res1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          tenantId,
          amount: 100.0,
          method: PaymentMethod.CASH,
          reference: 'SETTLE-ALL-1',
          currentUser: defaultUser,
        }),
      );
      expect(res1.isSuccess).toBe(true);

      // Re-submitting payment creation on a fully settled Sale is rejected with SaleNotPayableException
      const res2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          tenantId,
          amount: 10.0,
          method: PaymentMethod.CASH,
          reference: 'OVERPAY-ATTEMPT',
          currentUser: defaultUser,
        }),
      );

      expect(res2.isFailure).toBe(true);
      expect(res2.getError()).toBeInstanceOf(SaleNotPayableException);

      // Also verify overpayment rejection during active PENDING_PAYMENT
      const openSale = createPayableSale(100.0, 'sale_open_overpay');
      const overpayRes = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: openSale.id.value,
          tenantId,
          amount: 150.0,
          method: PaymentMethod.CASH,
          reference: 'OVERPAY-150',
          currentUser: defaultUser,
        }),
      );
      expect(overpayRes.isFailure).toBe(true);
      expect(overpayRes.getError()).toBeInstanceOf(PaymentOverpaymentException);
    });
  });
});
