import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
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
  FailPaymentHandler,
  CompletePaymentHandler,
  SalesEventPublisherPort,
  IUnitOfWork,
  SystemClock,
  PaymentNotFoundException,
  PaymentUnauthorizedException,
  InvalidPaymentTransitionException,
  PaymentAlreadyCompletedException,
  PaymentAlreadyFailedException,
  PaymentOptimisticLockException,
  PaymentFailedEvent,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';
import { FailPaymentRequestDto } from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
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
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    const cloned = Payment.reconstitute({
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
    if (this.findByIdDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.findByIdDelayMs));
    }
    return cloned;
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
    if (existing && existing.version >= payment.version) {
      throw new PaymentOptimisticLockException(payment.id.value, existing.version);
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
// Test Suite: POST /payments/:id/fail
// ============================================================================

describe('POST /payments/:id/fail (FailPayment Endpoint)', () => {
  const tenantId = 'tenant_kinergy_fail_qa';
  const fixedDate = new Date('2026-10-15T12:00:00.000Z');
  const clock = new FixedClock(fixedDate);

  let controller: PaymentsController;
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;
  let unitOfWork: MockUnitOfWork;
  let eventPublisher: MockEventPublisher;
  let failPaymentHandler: FailPaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let exceptionFilter: SalesExceptionFilter;

  const authorizedOwner: AuthenticatedUserPayload = {
    id: 'usr_owner_01',
    email: 'owner@kinergy.com',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['payments:manage', 'sales:manage'],
    tenantId,
  };

  const authorizedManager: AuthenticatedUserPayload = {
    id: 'usr_manager_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.manage', 'payments.create', 'sales.read'],
    tenantId,
  };

  const authorizedReceptionist: AuthenticatedUserPayload = {
    id: 'usr_receptionist_01',
    email: 'receptionist@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'sales.read'],
    tenantId,
  };

  const unauthorizedTrainer: AuthenticatedUserPayload = {
    id: 'usr_trainer_01',
    email: 'trainer@kinergy.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['training.sessions.manage'],
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
          sourceId: 'plan_standard',
        }),
      },
      clock,
    );
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_standard',
      }),
      description: 'Standard Membership',
      quantity: 1,
      unitPrice: Money.create(total, currency),
    });

    if (status === 'FINALIZED') {
      sale.finalize(clock);
    } else if (status === 'CANCELLED') {
      sale.finalize(clock);
      sale.cancel('Customer cancelled order', clock);
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

  const simulateFilter = (
    exception: unknown,
  ): { status: number; body: Record<string, unknown> } => {
    let capturedStatus = 500;
    let capturedBody: Record<string, unknown> = {};

    const mockResponse: Partial<Response> = {
      status(s: number) {
        capturedStatus = s;
        return this as Response;
      },
      json(b: Record<string, unknown>) {
        capturedBody = b;
        return this as Response;
      },
      setHeader() {
        return this as Response;
      },
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => ({
          method: 'POST',
          url: '/payments/fail',
          headers: {},
        }),
      }),
    } as unknown as ArgumentsHost;

    exceptionFilter.catch(exception, mockHost);
    return { status: capturedStatus, body: capturedBody };
  };

  beforeEach(async () => {
    unitOfWork = new MockUnitOfWork();
    paymentRepo = new MockPaymentRepository(unitOfWork);
    saleRepo = new MockSaleRepository(unitOfWork);
    eventPublisher = new MockEventPublisher();
    exceptionFilter = new SalesExceptionFilter();

    failPaymentHandler = new FailPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    completePaymentHandler = new CompletePaymentHandler(
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
        { provide: FailPaymentHandler, useValue: failPaymentHandler },
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
  // 1. Successful Valid Failure Transition
  // ==========================================================================
  describe('1. Valid Failure Transition', () => {
    it('transitions PENDING payment to FAILED, preserves failure reason, updates timestamp, and keeps paidAt null', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const dto: FailPaymentRequestDto = {
        reason: 'Rail declined: card expired',
      };

      const result = await controller.failPayment(payment.id.value, dto, authorizedManager);

      // Verify returned PaymentResponseDto
      expect(result.id).toBe(payment.id.value);
      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.paidAt).toBeNull();
      expect(result.version).toBe(payment.version + 1);
      expect(result.amount).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });

      // Verify Payment aggregate stored state
      const updatedPayment = await paymentRepo.findById(payment.id);
      expect(updatedPayment?.status).toBe(PaymentStatus.FAILED);
      expect(updatedPayment?.paidAt).toBeNull();
      expect(updatedPayment?.updatedAt.toISOString()).toBe(fixedDate.toISOString());
      expect(updatedPayment?.version).toBe(2);

      // Verify Sale aggregate was NOT cancelled and remains in PENDING_PAYMENT
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(saleRepo.saveCount).toBe(0);

      // Verify Domain Event PaymentFailedEvent was published with correct reason
      expect(eventPublisher.publishedEvents.length).toBe(1);
      const event = eventPublisher.publishedEvents[0] as PaymentFailedEvent;
      expect(event).toBeInstanceOf(PaymentFailedEvent);
      expect(event.payload.paymentId).toBe(payment.id.value);
      expect(event.payload.saleId).toBe(sale.id.value);
      expect(event.payload.reason).toBe('Rail declined: card expired');
      expect(event.payload.amount).toBe(100.0);
    });

    it('transitions cleanly when reason is omitted in request body', async () => {
      const sale = createTestSale(50.0, 'USD');
      const payment = createPendingPayment(sale, 50.0, 'USD');

      const result = await controller.failPayment(payment.id.value, {}, authorizedReceptionist);

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.paidAt).toBeNull();

      const event = eventPublisher.publishedEvents[0] as PaymentFailedEvent;
      expect(event).toBeInstanceOf(PaymentFailedEvent);
      expect(event.payload.reason).toBeUndefined();
    });

    it('transitions cleanly via scoped route :saleId/payments/:id/fail when saleId matches', async () => {
      const sale = createTestSale(75.0, 'USD');
      const payment = createPendingPayment(sale, 75.0, 'USD');

      const result = await controller.failPayment(
        payment.id.value,
        { reason: 'Timeout on terminal' },
        authorizedManager,
        sale.id.value,
      );

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.paidAt).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Unknown Payment & Route Scope Mismatch
  // ==========================================================================
  describe('2. Unknown Payment & Route Scope Mismatch', () => {
    it('throws PaymentNotFoundException (404) when payment ID does not exist', async () => {
      await expect(
        controller.failPayment('pmt_nonexistent_id', {}, authorizedManager),
      ).rejects.toThrow(PaymentNotFoundException);
    });

    it('throws PaymentUnauthorizedException (403) when payment belongs to a different saleId', async () => {
      const saleA = createTestSale(100.0, 'USD');
      const saleB = createTestSale(100.0, 'USD');
      const paymentA = createPendingPayment(saleA, 100.0, 'USD');

      await expect(
        controller.failPayment(paymentA.id.value, {}, authorizedManager, saleB.id.value),
      ).rejects.toThrow(PaymentUnauthorizedException);

      // Payment remains in PENDING state
      const stored = await paymentRepo.findById(paymentA.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
    });
  });

  // ==========================================================================
  // 3. Unauthorized Requests & RBAC Invariants
  // ==========================================================================
  describe('3. Unauthorized Request & Multi-Tenant Boundaries', () => {
    it('rejects caller lacking payments.manage or payments.create permissions (403)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      await expect(
        controller.failPayment(payment.id.value, {}, unauthorizedTrainer),
      ).rejects.toThrow(PaymentUnauthorizedException);

      // Payment remains strictly PENDING
      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects cross-tenant caller attempting to fail payment in another tenant (403)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      await expect(
        controller.failPayment(payment.id.value, {}, foreignTenantManager),
      ).rejects.toThrow(PaymentUnauthorizedException);

      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
    });

    it('accepts colon-notation payments:manage permission from Owner', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const result = await controller.failPayment(payment.id.value, {}, authorizedOwner);
      expect(result.status).toBe(PaymentStatus.FAILED);
    });
  });

  // ==========================================================================
  // 4. Invalid Source States & State Machine Violations (422)
  // ==========================================================================
  describe('4. Invalid Source State & State Machine Invariants', () => {
    it('rejects failure when payment is already COMPLETED (422) and does not treat failure as refund/reversal', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      await expect(
        controller.failPayment(payment.id.value, { reason: 'Attempt reverse' }, authorizedManager),
      ).rejects.toThrow(PaymentAlreadyCompletedException);

      // Payment remains strictly COMPLETED with original paidAt intact
      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.COMPLETED);
      expect(stored?.paidAt).not.toBeNull();
      expect(stored?.version).toBe(2);
    });

    it('rejects failure when payment is in CANCELLED status (422)', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.cancel({ reason: 'Cashier cancelled', clock });
      paymentRepo.store.set(payment.id.value, payment);

      await expect(
        controller.failPayment(payment.id.value, { reason: 'Decline reason' }, authorizedManager),
      ).rejects.toThrow(InvalidPaymentTransitionException);

      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.CANCELLED);
    });
  });

  // ==========================================================================
  // 5. Repeated Failure (Idempotency & Terminal State Violation)
  // ==========================================================================
  describe('5. Repeated Failure', () => {
    it('throws PaymentAlreadyFailedException (422) on repeated failure attempts', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // First failure succeeds
      const firstResult = await controller.failPayment(
        payment.id.value,
        { reason: 'First decline' },
        authorizedManager,
      );
      expect(firstResult.status).toBe(PaymentStatus.FAILED);

      // Second failure attempt is rejected
      await expect(
        controller.failPayment(payment.id.value, { reason: 'Duplicate fail' }, authorizedManager),
      ).rejects.toThrow(PaymentAlreadyFailedException);

      // Version, status, and paidAt remain untouched by second attempt
      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.FAILED);
      expect(stored?.version).toBe(firstResult.version);
      expect(stored?.paidAt).toBeNull();
    });
  });

  // ==========================================================================
  // 6. Concurrent Failure and Completion Attempts (OCC Conflict)
  // ==========================================================================
  describe('6. Concurrent Failure and Completion Attempts', () => {
    it('guarantees that race between failure and completion allows exactly one success and rejects other with OCC conflict', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      // Enable concurrent interleaving delay
      paymentRepo.findByIdDelayMs = 15;

      const promiseFail = controller.failPayment(
        payment.id.value,
        { reason: 'Rail timeout' },
        authorizedManager,
      );
      const promiseComplete = controller.completePayment(
        payment.id.value,
        { reference: 'TRACE-001' },
        authorizedManager,
      );

      const results = await Promise.allSettled([promiseFail, promiseComplete]);
      paymentRepo.findByIdDelayMs = 0;

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // The rejected promise must be an OCC conflict
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(PaymentOptimisticLockException);
    });

    it('guarantees that race between two concurrent fail calls allows exactly one success', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      paymentRepo.findByIdDelayMs = 15;

      const promiseA = controller.failPayment(
        payment.id.value,
        { reason: 'Processor decline A' },
        authorizedManager,
      );
      const promiseB = controller.failPayment(
        payment.id.value,
        { reason: 'Processor decline B' },
        authorizedManager,
      );

      const results = await Promise.allSettled([promiseA, promiseB]);
      paymentRepo.findByIdDelayMs = 0;

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        PaymentOptimisticLockException,
      );
    });
  });

  // ==========================================================================
  // 7. Persistence Failure & Atomic Guarantees
  // ==========================================================================
  describe('7. Persistence Failure & Atomic Guarantees', () => {
    it('propagates error, preserves in-memory store, and publishes zero events when paymentRepo.save fails', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      paymentRepo.saveThrows = new Error('Database disk full');

      await expect(
        controller.failPayment(payment.id.value, { reason: 'Timeout' }, authorizedManager),
      ).rejects.toThrow('Database disk full');

      // In-memory store reflects original PENDING payment
      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
      expect(stored?.version).toBe(1);

      // No events were published
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  // ==========================================================================
  // 8. Sale Remains Consistent & Sibling Payments Untouched
  // ==========================================================================
  describe('8. Sale Consistency & Unrelated Payments', () => {
    it('does NOT automatically cancel the Sale or modify unrelated sibling payments', async () => {
      const sale = createTestSale(150.0, 'USD');
      // Create two payments against the same sale
      const payment1 = createPendingPayment(sale, 50.0, 'USD');
      const payment2 = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment2.id.value, payment2);

      // Fail payment 1
      const result = await controller.failPayment(
        payment1.id.value,
        { reason: 'Customer card declined' },
        authorizedManager,
      );

      expect(result.status).toBe(PaymentStatus.FAILED);

      // Invariant: Target sale remains in PENDING_PAYMENT status, NOT cancelled
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(storedSale?.cancellationReason).toBeFalsy();
      expect(storedSale?.cancelledAt).toBeFalsy();

      // Invariant: Sibling payment 2 remains strictly PENDING with its original state
      const storedPayment2 = await paymentRepo.findById(payment2.id);
      expect(storedPayment2?.status).toBe(PaymentStatus.PENDING);
      expect(storedPayment2?.version).toBe(1);
      expect(storedPayment2?.amount.amount).toBe(100.0);

      // Invariant: saleRepo was NOT written to
      expect(saleRepo.saveCount).toBe(0);
    });

    it('does not alter PARTIALLY_PAID sale status when a subsequent payment fails', async () => {
      const sale = createTestSale(200.0, 'USD');
      // Settle first payment of $100 -> moves Sale to PARTIALLY_PAID
      const payment1 = createPendingPayment(sale, 100.0, 'USD');
      await controller.completePayment(payment1.id.value, {}, authorizedManager);

      const partiallyPaidSale = await saleRepo.findById(sale.id);
      expect(partiallyPaidSale?.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Second payment of $100 is created and fails
      const payment2 = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      paymentRepo.store.set(payment2.id.value, payment2);

      const failResult = await controller.failPayment(
        payment2.id.value,
        { reason: 'Insufficient funds' },
        authorizedManager,
      );
      expect(failResult.status).toBe(PaymentStatus.FAILED);

      // Invariant: Sale remains strictly PARTIALLY_PAID
      const saleAfterFail = await saleRepo.findById(sale.id);
      expect(saleAfterFail?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });
  });

  // ==========================================================================
  // 9. Client Status / paidAt Bypass Defense & Parameter Validation
  // ==========================================================================
  describe('9. Client Bypass Defense & Parameter Validation', () => {
    it('ignores client attempts to inject status or paidAt in request body', async () => {
      const sale = createTestSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');

      const spoofedBody: FailPaymentRequestDto & { status?: string; paidAt?: string } = {
        reason: 'Legitimate failure reason',
        status: 'COMPLETED',
        paidAt: '2026-10-15T00:00:00.000Z',
      };

      const result = await controller.failPayment(
        payment.id.value,
        spoofedBody as FailPaymentRequestDto,
        authorizedManager,
      );

      // Domain authority wins: status is strictly FAILED, paidAt is strictly null
      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.paidAt).toBeNull();
      expect(result.version).toBe(2);
    });

    it('rejects empty or whitespace payment ID with BadRequestException (400)', async () => {
      await expect(controller.failPayment('', {}, authorizedManager)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.failPayment('    ', {}, authorizedManager)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==========================================================================
  // 10. HTTP Error Standardization via SalesExceptionFilter
  // ==========================================================================
  describe('10. HTTP Error Standardization via SalesExceptionFilter', () => {
    it('maps PaymentNotFoundException to HTTP 404 Not Found', () => {
      const { status, body } = simulateFilter(new PaymentNotFoundException('pmt_unknown'));
      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(body.error).toBe('Not Found');
    });

    it('maps PaymentUnauthorizedException to HTTP 403 Forbidden', () => {
      const { status, body } = simulateFilter(
        new PaymentUnauthorizedException('Insufficient permissions.'),
      );
      expect(status).toBe(HttpStatus.FORBIDDEN);
      expect(body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(body.error).toBe('Forbidden');
    });

    it('maps PaymentOptimisticLockException to HTTP 409 Conflict', () => {
      const { status, body } = simulateFilter(new PaymentOptimisticLockException('pmt_123', 1));
      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(body.error).toBe('Conflict');
    });

    it('maps InvalidPaymentTransitionException to HTTP 422 Unprocessable Entity', () => {
      const { status, body } = simulateFilter(
        new InvalidPaymentTransitionException(
          PaymentStatus.COMPLETED,
          PaymentStatus.FAILED,
          'Completed payments are permanently immutable',
        ),
      );
      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.error).toBe('Unprocessable Entity');
    });

    it('maps PaymentAlreadyFailedException to HTTP 422 Unprocessable Entity', () => {
      const { status, body } = simulateFilter(
        new PaymentAlreadyFailedException('Repeated transition prohibited.'),
      );
      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.error).toBe('Unprocessable Entity');
    });
  });
});
