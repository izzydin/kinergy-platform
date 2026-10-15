import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  Payment,
  PaymentId,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  CompletePaymentHandler,
  SalesEventPublisherPort,
  IUnitOfWork,
  SystemClock,
  PaymentNotFoundException,
  SaleNotFoundException,
  PaymentUnauthorizedException,
  PaymentCurrencyMismatchException,
  PaymentOverpaymentException,
  PaymentAlreadyCompletedException,
  InvalidPaymentTransitionException,
  SaleCannotBeMarkedPaidException,
  PaymentOptimisticLockException,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';
import { CompletePaymentRequestDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// ============================================================================
// Test Doubles & Mock Infrastructure
// ============================================================================

class MockUnitOfWork implements IUnitOfWork {
  public transactionStarted = false;
  public transactionCommitted = false;
  public transactionRolledBack = false;
  private rollbackActions: (() => void)[] = [];

  registerRollback(action: () => void): void {
    this.rollbackActions.push(action);
  }

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.transactionStarted = true;
    const rollbackCheckpoint = [...this.rollbackActions];
    try {
      const result = await work();
      this.transactionCommitted = true;
      this.rollbackActions = [];
      return result;
    } catch (error) {
      this.transactionRolledBack = true;
      for (const action of this.rollbackActions) {
        action();
      }
      this.rollbackActions = rollbackCheckpoint;
      throw error;
    }
  }

  reset(): void {
    this.transactionStarted = false;
    this.transactionCommitted = false;
    this.transactionRolledBack = false;
    this.rollbackActions = [];
  }
}

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;
  public saveThrows: Error | null = null;
  public findByIdDelayMs = 0;

  constructor(private readonly unitOfWork?: MockUnitOfWork) {}

  async findById(id: PaymentId | string): Promise<Payment | null> {
    if (this.findByIdDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.findByIdDelayMs));
    }
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
    return Array.from(this.store.values())
      .filter((p) => p.saleId.value === key)
      .map((p) =>
        Payment.reconstitute({
          id: p.id,
          tenantId: p.tenantId,
          saleId: p.saleId,
          method: p.method,
          amount: p.amount,
          status: p.status,
          reference: p.reference,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          version: p.version,
        }),
      );
  }

  async save(payment: Payment): Promise<void> {
    if (this.saveThrows) {
      throw this.saveThrows;
    }
    const existing = this.store.get(payment.id.value);
    if (existing && existing.version !== payment.version - 1) {
      throw new PaymentOptimisticLockException(payment.id.value, payment.version - 1);
    }
    const previousSnapshot = existing
      ? Payment.reconstitute({
          id: existing.id,
          tenantId: existing.tenantId,
          saleId: existing.saleId,
          method: existing.method,
          amount: existing.amount,
          status: existing.status,
          reference: existing.reference,
          paidAt: existing.paidAt,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          version: existing.version,
        })
      : null;

    this.unitOfWork?.registerRollback(() => {
      if (previousSnapshot) {
        this.store.set(previousSnapshot.id.value, previousSnapshot);
      } else {
        this.store.delete(payment.id.value);
      }
    });

    this.saveCount++;
    this.store.set(payment.id.value, payment);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public saveThrows: Error | null = null;

  constructor(private readonly unitOfWork?: MockUnitOfWork) {}

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      status: sale.status,
      currency: sale.currency,
      source: sale.source,
      items: [...sale.items],
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      cancellationReason: sale.cancellationReason,
      cancelledAt: sale.cancelledAt,
      version: sale.version,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    });
  }

  async save(sale: Sale): Promise<void> {
    if (this.saveThrows) {
      throw this.saveThrows;
    }
    const existing = this.store.get(sale.id.value);
    const previousSnapshot = existing
      ? Sale.reconstitute({
          id: existing.id,
          tenantId: existing.tenantId,
          clientId: existing.clientId,
          status: existing.status,
          currency: existing.currency,
          source: existing.source,
          items: [...existing.items],
          orderDiscount: existing.orderDiscount,
          subtotal: existing.subtotal,
          discountTotal: existing.discountTotal,
          total: existing.total,
          cancellationReason: existing.cancellationReason,
          cancelledAt: existing.cancelledAt,
          version: existing.version,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        })
      : null;

    if (previousSnapshot) {
      this.unitOfWork?.registerRollback(() => {
        this.store.set(previousSnapshot.id.value, previousSnapshot);
      });
    }

    this.saveCount++;
    this.store.set(sale.id.value, sale);
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: unknown[] = [];

  async publish(events: ReadonlyArray<unknown>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

class FixedClock extends SystemClock {
  constructor(private readonly fixedTime: Date = new Date('2026-10-15T12:00:00.000Z')) {
    super();
  }
  override now(): Date {
    return new Date(this.fixedTime.getTime());
  }
}

// ============================================================================
// Complete Payment Endpoint Integration & Financial Invariants Specification
// ============================================================================

describe('POST /payments/:id/complete Endpoint Specification (Milestone 7.15)', () => {
  const tenantId = 'tenant_kinergy_prime';
  const fixedDate = new Date('2026-10-15T12:00:00.000Z');
  const clock = new FixedClock(fixedDate);

  let controller: PaymentsController;
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;
  let unitOfWork: MockUnitOfWork;
  let eventPublisher: MockEventPublisher;

  // Authorization Personas
  const authorizedManager: AuthenticatedUserPayload = {
    id: 'usr_manager_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.manage', 'payments.create', 'payments.read'],
    tenantId,
  };

  const authorizedOwner: AuthenticatedUserPayload = {
    id: 'usr_owner_01',
    email: 'owner@kinergy.com',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['payments:manage', 'payments.read'],
    tenantId,
  };

  const unauthorizedTrainer: AuthenticatedUserPayload = {
    id: 'usr_trainer_01',
    email: 'trainer@kinergy.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'],
    tenantId,
  };

  const foreignTenantManager: AuthenticatedUserPayload = {
    id: 'usr_foreign_01',
    email: 'foreign@other.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.manage', 'payments.create'],
    tenantId: 'tenant_other_gym',
  };

  const createTestSale = (
    total: number = 100.0,
    currency: string = 'USD',
    status: 'FINALIZED' | 'DRAFT' | 'CANCELLED' = 'FINALIZED',
  ): Sale => {
    const sale = Sale.create(
      {
        tenantId,
        currency,
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold',
        }),
      },
      clock,
    );
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold',
      }),
      description: 'Gold Membership',
      quantity: 1,
      unitPrice: Money.create(total, currency),
    });

    if (status === 'FINALIZED') {
      sale.finalize(clock);
    } else if (status === 'CANCELLED') {
      sale.finalize(clock);
      sale.cancel('Customer request', clock);
    }
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  const createPendingPayment = (
    sale: Sale,
    amount: number = 100.0,
    currency: string = 'USD',
    customTenant: string = tenantId,
  ): Payment => {
    const payment = Payment.createPending(
      {
        saleId: sale.id,
        tenantId: customTenant,
        method: PaymentMethod.QR,
        amount: Money.create(amount, currency),
      },
      clock,
    );
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  };

  beforeEach(async () => {
    unitOfWork = new MockUnitOfWork();
    paymentRepo = new MockPaymentRepository(unitOfWork);
    saleRepo = new MockSaleRepository(unitOfWork);
    eventPublisher = new MockEventPublisher();

    const completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      unitOfWork,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: CompletePaymentHandler, useValue: completePaymentHandler },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  // ==========================================================================
  // 1. Successful Valid Completion
  // ==========================================================================
  describe('1. Successful Valid Completion', () => {
    it('transitions PENDING payment to COMPLETED, coordinates Sale to PAID, and populates paidAt', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const dto: CompletePaymentRequestDto = {
        reference: 'QR-CONFIRMED-999',
      };

      const result = await controller.completePayment(payment.id.value, dto, authorizedManager);

      // Verify Payment aggregate response
      expect(result.id).toBe(payment.id.value);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.reference).toBe('QR-CONFIRMED-999');
      expect(result.paidAt).toBe(fixedDate.toISOString());
      expect(result.version).toBe(payment.version + 1);
      expect(result.amount).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });

      // Verify Sale aggregate coordinated transition to PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);

      // Verify Unit of Work committed atomically
      expect(unitOfWork.transactionStarted).toBe(true);
      expect(unitOfWork.transactionCommitted).toBe(true);
      expect(unitOfWork.transactionRolledBack).toBe(false);

      // Verify Domain Events published post-commit
      expect(eventPublisher.publishedEvents.length).toBeGreaterThan(0);
    });

    it('coordinates Sale to PARTIALLY_PAID when payment only covers partial sale total', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 40.0, 'USD');

      const result = await controller.completePayment(payment.id.value, {}, authorizedManager);

      expect(result.status).toBe(PaymentStatus.COMPLETED);

      // Sale advances to PARTIALLY_PAID because remaining balance is 60.00
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('completes payment via scoped route with matching saleId', async () => {
      const sale = createTestSale(50.0, 'USD');
      const payment = createPendingPayment(sale, 50.0, 'USD');

      const result = await controller.completePayment(
        payment.id.value,
        {},
        authorizedManager,
        sale.id.value, // paramSaleId
      );

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('does NOT generate a receipt automatically upon completion', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      await controller.completePayment(payment.id.value, {}, authorizedManager);

      // Verify no receipt aggregate was generated or persisted
      expect(
        eventPublisher.publishedEvents.some((e: unknown) => {
          const evt = e as { eventType?: string; name?: string };
          return evt?.eventType === 'ReceiptIssued' || evt?.name === 'ReceiptIssued';
        }),
      ).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Unknown Payment or Associated Sale
  // ==========================================================================
  describe('2. Unknown Payment or Associated Sale', () => {
    it('throws PaymentNotFoundException (404) when payment identifier does not exist', async () => {
      await expect(
        controller.completePayment('pmt_nonexistent_uuid', {}, authorizedManager),
      ).rejects.toThrow(PaymentNotFoundException);
    });

    it('throws SaleNotFoundException (404) when associated sale aggregate is missing', async () => {
      // Seed a payment whose saleId does not exist in the sale repository
      const orphanPayment = Payment.createPending(
        {
          saleId: SaleId.create(),
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(orphanPayment.id.value, orphanPayment);

      await expect(
        controller.completePayment(orphanPayment.id.value, {}, authorizedManager),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('throws PaymentUnauthorizedException (403) when payment does not belong to specified saleId', async () => {
      const saleA = createTestSale(100.0, 'USD');
      const saleB = createTestSale(100.0, 'USD');
      const paymentA = createPendingPayment(saleA, 100.0, 'USD');

      // Attempt to complete paymentA scoping to saleB
      await expect(
        controller.completePayment(paymentA.id.value, {}, authorizedManager, saleB.id.value),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });

  // ==========================================================================
  // 3. Unauthorized Requests & RBAC Invariants
  // ==========================================================================
  describe('3. Unauthorized Request & Multi-Tenant Boundaries', () => {
    it('rejects caller lacking payments.manage / payments.create permissions', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      await expect(
        controller.completePayment(payment.id.value, {}, unauthorizedTrainer),
      ).rejects.toThrow(PaymentUnauthorizedException);

      // Payment remains strictly PENDING
      const pmt = await paymentRepo.findById(payment.id);
      expect(pmt?.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects cross-tenant caller attempting to complete payment in another tenant', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      await expect(
        controller.completePayment(payment.id.value, {}, foreignTenantManager),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('accepts colon-notation payments:manage permission from Owner', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const result = await controller.completePayment(payment.id.value, {}, authorizedOwner);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // ==========================================================================
  // 4. Invalid Source States
  // ==========================================================================
  describe('4. Invalid Source State', () => {
    it('rejects completion when payment is in CANCELLED status (422)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.cancel({ reason: 'Voided by clerk', clock });
      paymentRepo.store.set(payment.id.value, payment);

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(InvalidPaymentTransitionException);
    });

    it('rejects completion when payment is in FAILED status (422)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.fail({ reason: 'Decline by bank', clock });
      paymentRepo.store.set(payment.id.value, payment);

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(InvalidPaymentTransitionException);
    });

    it('rejects completion when associated Sale is CANCELLED (422)', async () => {
      const cancelledSale = createTestSale(100.0, 'USD', 'CANCELLED');
      const payment = createPendingPayment(cancelledSale, 100.0, 'USD');

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(SaleCannotBeMarkedPaidException);

      // Payment remains in PENDING state
      const pmt = await paymentRepo.findById(payment.id);
      expect(pmt?.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects completion when associated Sale is DRAFT / unfinalized (422)', async () => {
      const draftSale = createTestSale(100.0, 'USD', 'DRAFT');
      const payment = createPendingPayment(draftSale, 100.0, 'USD');

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(SaleCannotBeMarkedPaidException);
    });
  });

  // ==========================================================================
  // 5. Repeated Completion (Idempotency Violation)
  // ==========================================================================
  describe('5. Repeated Completion', () => {
    it('throws PaymentAlreadyCompletedException on second completion attempt', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // First completion succeeds
      const firstResult = await controller.completePayment(payment.id.value, {}, authorizedManager);
      expect(firstResult.status).toBe(PaymentStatus.COMPLETED);

      // Second completion attempt is rejected as terminal transition violation
      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(PaymentAlreadyCompletedException);

      // Version and status are preserved
      const pmt = await paymentRepo.findById(payment.id);
      expect(pmt?.status).toBe(PaymentStatus.COMPLETED);
      expect(pmt?.version).toBe(firstResult.version);
    });
  });

  // ==========================================================================
  // 6. Concurrent Completion Attempts (OCC Conflict)
  // ==========================================================================
  describe('6. Concurrent Completion Attempts', () => {
    it('guarantees that race on same payment allows exactly one success and rejects other with OCC conflict', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Enable concurrent interleaving delay on findById
      paymentRepo.findByIdDelayMs = 15;

      // Simulate two racing completion commands
      const promiseA = controller.completePayment(payment.id.value, {}, authorizedManager);
      const promiseB = controller.completePayment(payment.id.value, {}, authorizedManager);

      const results = await Promise.allSettled([promiseA, promiseB]);
      paymentRepo.findByIdDelayMs = 0;

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  // ==========================================================================
  // 7. Failure to Persist Either Aggregate & Atomic Rollback
  // ==========================================================================
  describe('7. Failure to Persist & Rollback Guarantees', () => {
    it('demonstrates that a rejected completion cannot leave partially persisted changes (payment repo fails)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Induce payment repository save failure
      paymentRepo.saveThrows = new Error('Database disk full');

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow('Database disk full');

      // Unit of work recorded rollback
      expect(unitOfWork.transactionRolledBack).toBe(true);

      // Verify Sale aggregate was NOT persisted as PAID in storage
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Verify Payment was NOT updated to COMPLETED in storage
      const storedPayment = await paymentRepo.findById(payment.id);
      expect(storedPayment?.status).toBe(PaymentStatus.PENDING);
      expect(storedPayment?.paidAt).toBeNull();

      // No domain events published
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('demonstrates that a rejected completion cannot leave partially persisted changes (sale repo fails)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Induce sale repository save failure
      saleRepo.saveThrows = new Error('Sale table locked');

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow('Sale table locked');

      // Unit of work recorded rollback
      expect(unitOfWork.transactionRolledBack).toBe(true);

      // Verify stored Payment is still PENDING (not partially committed as COMPLETED)
      const storedPayment = await paymentRepo.findById(payment.id);
      expect(storedPayment?.status).toBe(PaymentStatus.PENDING);

      // Verify stored Sale is still PENDING_PAYMENT
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);

      // No domain events published
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  // ==========================================================================
  // 8. No Contradictory Payment/Sale States After Failure
  // ==========================================================================
  describe('8. No Contradictory Payment/Sale States After Failure', () => {
    it('rejects completion with currency mismatch and leaves aggregates untouched', async () => {
      const sale = createTestSale(100.0, 'USD');
      // Create payment in EUR against USD sale
      const eurPayment = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'EUR'),
        },
        clock,
      );
      paymentRepo.store.set(eurPayment.id.value, eurPayment);

      await expect(
        controller.completePayment(eurPayment.id.value, {}, authorizedManager),
      ).rejects.toThrow(PaymentCurrencyMismatchException);

      // Invariant: No contradictory state where EUR payment is COMPLETED against USD sale
      const pmt = await paymentRepo.findById(eurPayment.id);
      expect(pmt?.status).toBe(PaymentStatus.PENDING);
      const sl = await saleRepo.findById(sale.id);
      expect(sl?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects completion that would exceed remaining Sale balance (overpayment protection)', async () => {
      const sale = createTestSale(50.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD'); // $100 against $50 sale

      await expect(
        controller.completePayment(payment.id.value, {}, authorizedManager),
      ).rejects.toThrow(PaymentOverpaymentException);

      // Invariant: No overpaid sale or completed excessive payment
      const pmt = await paymentRepo.findById(payment.id);
      expect(pmt?.status).toBe(PaymentStatus.PENDING);
      const sl = await saleRepo.findById(sale.id);
      expect(sl?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ==========================================================================
  // 9. Client Status Bypass Defense & Parameter Validation
  // ==========================================================================
  describe('9. Client Status Bypass Defense & Parameter Validation', () => {
    it('ignores client attempts to inject status or paidAt in request body', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const spoofedBody: CompletePaymentRequestDto & { status?: string; paidAt?: string } = {
        reference: 'SPOOF-PAY-01',
        status: 'FAILED',
        paidAt: '1970-01-01T00:00:00.000Z',
      };

      const response = await controller.completePayment(
        payment.id.value,
        spoofedBody as CompletePaymentRequestDto,
        authorizedManager,
      );

      // Status MUST be COMPLETED from authoritative domain transition, ignoring spoofed FAILED
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      // paidAt MUST be authoritative clock time, ignoring spoofed 1970
      expect(response.paidAt).toBe(fixedDate.toISOString());
    });

    it('rejects empty or whitespace payment ID with BadRequestException (400)', async () => {
      await expect(controller.completePayment('', {}, authorizedManager)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.completePayment('   ', {}, authorizedManager)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
