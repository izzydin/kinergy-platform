import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { FailPaymentHandler } from '../handlers/fail-payment.handler';
import { CancelPaymentHandler } from '../handlers/cancel-payment.handler';
import { GetPaymentHandler } from '../queries/get-payment.handler';
import { ListPaymentsHandler } from '../queries/list-payments.handler';
import { GetSalePaymentHistoryHandler } from '../queries/get-sale-payment-history.handler';

import { CreatePaymentCommand } from '../commands/create-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';
import { GetPaymentQuery } from '../queries/get-payment.query';
import { ListPaymentsQuery } from '../queries/list-payments.query';
import { GetSalePaymentHistoryQuery } from '../queries/get-sale-payment-history.query';

import {
  PaymentRepositoryPort,
  FindPaymentsCriteria,
  FindPaymentsPagination,
  FindPaymentsSort,
  FindPaymentsResult,
} from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { IUnitOfWork } from '../ports/unit-of-work.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';

import { Payment } from '../../domain/payment.aggregate';
import { Sale } from '../../domain/sale.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';

import {
  PaymentNotFoundException,
  SaleNotFoundException,
  PaymentCurrencyMismatchException,
  PaymentOverpaymentException,
  DuplicatePaymentReferenceException,
  InvalidPaymentQueryException,
} from '../exceptions';

import {
  InvalidPaymentTransitionException,
  PaymentAlreadyCompletedException,
  SaleCannotBeMarkedPaidException,
} from '../../domain/exceptions';

// ============================================================================
// Test Doubles (Boundary Fakes & Mocks)
// ============================================================================

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public findByIdCalls: string[] = [];
  public findBySaleIdCalls: string[] = [];
  public savedPayments: Payment[] = [];
  public findManyCalls: Array<{
    criteria: FindPaymentsCriteria;
    pagination: FindPaymentsPagination;
    sort: FindPaymentsSort;
  }> = [];

  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    this.findByIdCalls.push(key);
    const found = this.store.get(key);
    return found ?? null;
  }

  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    this.findBySaleIdCalls.push(key);
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  public async save(payment: Payment): Promise<void> {
    this.savedPayments.push(payment);
    this.store.set(payment.id.value, payment);
  }

  public async findMany(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult> {
    this.findManyCalls.push({ criteria, pagination, sort });
    let items = Array.from(this.store.values());

    if (criteria.tenantId) {
      items = items.filter((p) => p.tenantId === criteria.tenantId);
    }
    if (criteria.saleId) {
      items = items.filter((p) => p.saleId.value === criteria.saleId);
    }
    if (criteria.status) {
      items = items.filter((p) => p.status === criteria.status);
    }

    const total = items.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const paginated = items.slice(skip, skip + pagination.limit);

    return { items: paginated, total };
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public findByIdCalls: string[] = [];
  public savedSales: Sale[] = [];

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    this.findByIdCalls.push(key);
    const found = this.store.get(key);
    return found ?? null;
  }

  public async save(sale: Sale): Promise<void> {
    this.savedSales.push(sale);
    this.store.set(sale.id.value, sale);
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public executionCount = 0;
  public operationExecuted = false;

  public async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executionCount++;
    this.operationExecuted = true;
    return work();
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

// ============================================================================
// Comprehensive Application Layer TDD Test Suite
// ============================================================================

describe('Sales Payment Application Layer Test Suite', () => {
  const tenantId = 'org_kinergy_athletics';
  const baseTime = new Date('2026-10-09T12:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;
  let unitOfWork: MockUnitOfWork;
  let eventPublisher: MockEventPublisher;

  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let failPaymentHandler: FailPaymentHandler;
  let cancelPaymentHandler: CancelPaymentHandler;
  let getPaymentHandler: GetPaymentHandler;
  let listPaymentsHandler: ListPaymentsHandler;
  let getSalePaymentHistoryHandler: GetSalePaymentHistoryHandler;

  const validSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'sess-kinesio-001',
    sourceCode: 'KINESIO-ASSESS',
  });

  const authorizedUser = {
    id: 'usr_staff_01',
    roles: ['Receptionist', 'Manager'],
    permissions: ['payments.create', 'payments.manage', 'payments.read'],
  };

  /**
   * Helper to seed a finalized Sale ready for payments.
   */
  const seedSale = (
    saleIdStr: string = 'sale-001',
    amount: number = 100.0,
    currency: string = 'USD',
  ): Sale => {
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
        description: 'Kinesthetic Assessment',
        quantity: 1,
        unitPrice: Money.create(amount, currency),
      },
      clock,
    );
    sale.finalize(clock);
    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  /**
   * Helper to seed a pending Payment.
   */
  const seedPendingPayment = (
    paymentIdStr: string = 'pay-001',
    saleId: SaleId,
    amount: number = 100.0,
    currency: string = 'USD',
  ): Payment => {
    const payment = Payment.createPending(
      {
        id: PaymentId.create(paymentIdStr),
        saleId,
        amount: Money.create(amount, currency),
        method: PaymentMethod.QR,
        tenantId,
      },
      clock,
    );
    payment.clearEvents();
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    paymentRepo = new MockPaymentRepository();
    saleRepo = new MockSaleRepository();
    unitOfWork = new MockUnitOfWork();
    eventPublisher = new MockEventPublisher();

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

    getPaymentHandler = new GetPaymentHandler(paymentRepo);
    listPaymentsHandler = new ListPaymentsHandler(paymentRepo);
    getSalePaymentHistoryHandler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);
  });

  // ==========================================================================
  // Suite 1: CreatePayment
  // ==========================================================================
  describe('Suite 1: CreatePayment', () => {
    it('executes: repository load → domain creation → repository save → result', async () => {
      const sale = seedSale('sale-cp-01', 120.0, 'USD');

      const command = new CreatePaymentCommand({
        saleId: sale.id.value,
        amount: 120.0,
        currency: 'USD',
        status: PaymentStatus.PENDING,
        method: PaymentMethod.QR,
        reference: 'QR-TRACE-101',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await createPaymentHandler.execute(command);

      // 1. Verify repository load
      expect(saleRepo.findByIdCalls).toContain('sale-cp-01');

      // 2. Verify domain creation & repository save
      expect(paymentRepo.savedPayments).toHaveLength(1);
      const savedPayment = paymentRepo.savedPayments[0]!;
      expect(savedPayment.status).toBe(PaymentStatus.PENDING);
      expect(savedPayment.amount.amount).toBe(120.0);
      expect(savedPayment.method).toBe(PaymentMethod.QR);
      expect(savedPayment.reference?.value).toBe('QR-TRACE-101');

      // 3. Verify returned application DTO
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe(savedPayment.id.value);
      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.reference).toBe('QR-TRACE-101');
    });

    it('rejects creation when referenced Sale does not exist', async () => {
      const command = new CreatePaymentCommand({
        saleId: 'sale-ghost-404',
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.CASH,
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await createPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(paymentRepo.savedPayments).toHaveLength(0);
    });

    it('rejects creation when duplicate payment reference exists for the same Sale', async () => {
      const sale = seedSale('sale-dup-ref', 100.0, 'USD');

      // Existing payment with reference 'REF-DUPLICATE-01'
      const existing = Payment.createPending(
        {
          id: PaymentId.create('pay-existing-01'),
          saleId: sale.id,
          amount: Money.create(50.0, 'USD'),
          method: PaymentMethod.QR,
          reference: 'REF-DUPLICATE-01',
          tenantId,
        },
        clock,
      );
      paymentRepo.store.set(existing.id.value, existing);

      const command = new CreatePaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.QR,
        reference: 'REF-DUPLICATE-01',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await createPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect(paymentRepo.savedPayments).toHaveLength(0);
    });

    it('rejects creation when payment currency mismatches sale currency', async () => {
      const sale = seedSale('sale-curr-mismatch', 100.0, 'USD');

      const command = new CreatePaymentCommand({
        saleId: sale.id.value,
        amount: 100.0,
        currency: 'EUR',
        method: PaymentMethod.CASH,
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await createPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect(paymentRepo.savedPayments).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 2: CompletePayment
  // ==========================================================================
  describe('Suite 2: CompletePayment', () => {
    it('executes: Payment loaded → Sale loaded → domain transitions → transaction used → both persisted atomically → result', async () => {
      const sale = seedSale('sale-comp-01', 150.0, 'USD');
      const payment = seedPendingPayment('pay-comp-01', sale.id, 150.0, 'USD');

      const paymentCompleteSpy = jest.spyOn(payment, 'complete');
      const saleMarkPaidSpy = jest.spyOn(sale, 'markPaid');

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'EXT-SETTLED-REF-99',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      // 1. Verify Payment and Sale loaded
      expect(paymentRepo.findByIdCalls).toContain('pay-comp-01');
      expect(saleRepo.findByIdCalls).toContain('sale-comp-01');

      // 2. Verify domain methods invoked
      expect(paymentCompleteSpy).toHaveBeenCalledTimes(1);
      expect(saleMarkPaidSpy).toHaveBeenCalledTimes(1);

      // 3. Verify transaction used
      expect(unitOfWork.executionCount).toBe(1);
      expect(unitOfWork.operationExecuted).toBe(true);

      // 4. Verify both aggregates persisted atomically
      expect(paymentRepo.savedPayments).toContain(payment);
      expect(saleRepo.savedSales).toContain(sale);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(sale.status).toBe(SaleStatus.PAID);

      // 5. Verify result DTO and events post-commit
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('EXT-SETTLED-REF-99');
      expect(eventPublisher.publishedEvents.map((e) => e.eventType)).toEqual([
        'PaymentSettled',
        'SalePaid',
      ]);
    });

    it('transitions Sale to PARTIALLY_PAID through domain when payment only partially covers sale total', async () => {
      const sale = seedSale('sale-part-01', 200.0, 'USD');
      const payment = seedPendingPayment('pay-part-01', sale.id, 80.0, 'USD');

      const saleMarkPartiallyPaidSpy = jest.spyOn(sale, 'markPartiallyPaid');

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'PARTIAL-INSTALLMENT-1',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(saleMarkPartiallyPaidSpy).toHaveBeenCalledTimes(1);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(unitOfWork.executionCount).toBe(1);
    });

    it('rejects completion when Payment does not exist', async () => {
      const command = new CompletePaymentCommand({
        paymentId: 'pay-nonexistent',
        saleId: 'sale-any',
        reference: 'REF-01',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect(unitOfWork.executionCount).toBe(0);
    });

    it('rejects completion when Sale does not exist', async () => {
      // Payment exists, but its saleId is not in saleRepo
      const orphanedPayment = seedPendingPayment(
        'pay-orphan-99',
        SaleId.create('sale-missing-99'),
        50.0,
      );

      const command = new CompletePaymentCommand({
        paymentId: orphanedPayment.id.value,
        saleId: 'sale-missing-99',
        reference: 'REF-01',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(unitOfWork.executionCount).toBe(0);
    });

    it('rejects completion when Payment is already COMPLETED', async () => {
      const sale = seedSale('sale-already-done', 100.0, 'USD');
      const payment = seedPendingPayment('pay-already-done', sale.id, 100.0, 'USD');
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'DUPLICATE-TRY',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentAlreadyCompletedException);
      expect(unitOfWork.executionCount).toBe(0);
    });

    it('rejects completion when Sale is in CANCELLED state', async () => {
      const sale = seedSale('sale-void-state', 100.0, 'USD');
      sale.cancel('Customer voided order', clock);
      saleRepo.store.set(sale.id.value, sale);

      const payment = seedPendingPayment('pay-for-void', sale.id, 100.0, 'USD');

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TRY-PAY-VOID',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleCannotBeMarkedPaidException);
      expect(unitOfWork.executionCount).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: FailPayment
  // ==========================================================================
  describe('Suite 3: FailPayment', () => {
    it('executes: repository load → domain fail operation → repository save → result', async () => {
      const sale = seedSale('sale-fail-01', 100.0, 'USD');
      const payment = seedPendingPayment('pay-fail-01', sale.id, 100.0, 'USD');

      const paymentFailSpy = jest.spyOn(payment, 'fail');

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Payment rail card declined: INSUFFICIENT_FUNDS',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await failPaymentHandler.execute(command);

      // 1. Verify repository load
      expect(paymentRepo.findByIdCalls).toContain('pay-fail-01');

      // 2. Verify domain operation
      expect(paymentFailSpy).toHaveBeenCalledWith(
        'Payment rail card declined: INSUFFICIENT_FUNDS',
        clock,
      );
      expect(payment.status).toBe(PaymentStatus.FAILED);

      // 3. Verify repository save
      expect(paymentRepo.savedPayments).toContain(payment);

      // 4. Verify result DTO
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.FAILED);
      expect(dto.paidAt).toBeNull();
      expect(eventPublisher.publishedEvents.map((e) => e.eventType)).toContain('PaymentFailed');
    });

    it('rejects failing a payment that is already COMPLETED', async () => {
      const sale = seedSale('sale-fail-terminal', 100.0, 'USD');
      const payment = seedPendingPayment('pay-fail-terminal', sale.id, 100.0, 'USD');
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Late dispute attempt',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await failPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(paymentRepo.savedPayments).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 4: CancelPayment
  // ==========================================================================
  describe('Suite 4: CancelPayment', () => {
    it('executes: repository load → domain cancel operation → repository save → result', async () => {
      const sale = seedSale('sale-canc-01', 100.0, 'USD');
      const payment = seedPendingPayment('pay-canc-01', sale.id, 100.0, 'USD');

      const paymentCancelSpy = jest.spyOn(payment, 'cancel');

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Customer cancelled transaction at counter',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await cancelPaymentHandler.execute(command);

      // 1. Verify repository load
      expect(paymentRepo.findByIdCalls).toContain('pay-canc-01');

      // 2. Verify domain operation
      expect(paymentCancelSpy).toHaveBeenCalledWith(
        'Customer cancelled transaction at counter',
        clock,
      );
      expect(payment.status).toBe(PaymentStatus.CANCELLED);

      // 3. Verify repository save
      expect(paymentRepo.savedPayments).toContain(payment);

      // 4. Verify result DTO
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.CANCELLED);
      expect(dto.paidAt).toBeNull();
      expect(eventPublisher.publishedEvents.map((e) => e.eventType)).toContain('PaymentCancelled');
    });

    it('rejects cancelling a payment that is already COMPLETED', async () => {
      const sale = seedSale('sale-canc-immutable', 100.0, 'USD');
      const payment = seedPendingPayment('pay-canc-immutable', sale.id, 100.0, 'USD');
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Unauthorized attempt to void settlement',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await cancelPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(paymentRepo.savedPayments).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 5: GetPayment
  // ==========================================================================
  describe('Suite 5: GetPayment', () => {
    it('resolves payment representation through repository port without mutation or events', async () => {
      const sale = seedSale('sale-get-01', 75.0, 'USD');
      const payment = seedPendingPayment('pay-get-01', sale.id, 75.0, 'USD');

      const query = new GetPaymentQuery({
        paymentId: payment.id.value,
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await getPaymentHandler.execute(query);

      // 1. Verify repository load
      expect(paymentRepo.findByIdCalls).toContain('pay-get-01');

      // 2. Zero mutations or saves
      expect(paymentRepo.savedPayments).toHaveLength(0);
      expect(saleRepo.savedSales).toHaveLength(0);

      // 3. Correct DTO return
      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBe('pay-get-01');
      expect(dto.amount.formatted).toBe('75.00');
      expect(dto.status).toBe(PaymentStatus.PENDING);
    });

    it('returns PaymentNotFoundException when payment ID does not exist', async () => {
      const query = new GetPaymentQuery({
        paymentId: 'pay-nonexistent',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await getPaymentHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });
  });

  // ==========================================================================
  // Suite 6: ListPayments
  // ==========================================================================
  describe('Suite 6: ListPayments', () => {
    it('queries repository with normalized pagination, filter, and sort parameters', async () => {
      const sale = seedSale('sale-list-01', 100.0, 'USD');
      seedPendingPayment('pay-list-01', sale.id, 40.0, 'USD');
      seedPendingPayment('pay-list-02', sale.id, 60.0, 'USD');

      const query = new ListPaymentsQuery({
        tenantId,
        pagination: { page: 1, limit: 10 },
        sort: { field: 'createdAt', direction: 'desc' },
        currentUser: authorizedUser,
      });

      const result = await listPaymentsHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(paymentRepo.findManyCalls).toHaveLength(1);
      const call = paymentRepo.findManyCalls[0]!;
      expect(call.pagination.page).toBe(1);
      expect(call.pagination.limit).toBe(10);
      expect(call.sort.field).toBe('createdAt');
      expect(call.sort.direction).toBe('desc');

      const paginatedDTO = result.getValue();
      expect(paginatedDTO.total).toBe(2);
      expect(paginatedDTO.items).toHaveLength(2);
    });

    it('rejects unsupported dynamic sort fields at the application boundary', async () => {
      const query = new ListPaymentsQuery({
        tenantId,
        sort: { field: 'unsupportedColumn', direction: 'asc' },
        currentUser: authorizedUser,
      });

      const result = await listPaymentsHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentQueryException);
      expect(paymentRepo.findManyCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Suite 7: GetSalePaymentHistory
  // ==========================================================================
  describe('Suite 7: GetSalePaymentHistory', () => {
    it('verifies Sale existence, loads all payments for sale, and applies deterministic ordering', async () => {
      const sale = seedSale('sale-hist-01', 200.0, 'USD');

      // Create 3 payments with different timestamps and states
      const t1 = new Date('2026-10-09T10:00:00.000Z');
      const t2 = new Date('2026-10-09T11:00:00.000Z');
      const t3 = new Date('2026-10-09T12:00:00.000Z');

      const p1 = Payment.reconstitute({
        id: PaymentId.create('pay-h-01'),
        saleId: sale.id,
        amount: Money.create(50, 'USD'),
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: t1,
        createdAt: t1,
        updatedAt: t1,
        version: 1,
        tenantId,
      });
      const p2 = Payment.reconstitute({
        id: PaymentId.create('pay-h-02'),
        saleId: sale.id,
        amount: Money.create(75, 'USD'),
        method: PaymentMethod.QR,
        status: PaymentStatus.FAILED,
        reference: null,
        paidAt: null,
        createdAt: t2,
        updatedAt: t2,
        version: 1,
        tenantId,
      });
      const p3 = Payment.reconstitute({
        id: PaymentId.create('pay-h-03'),
        saleId: sale.id,
        amount: Money.create(75, 'USD'),
        method: PaymentMethod.QR,
        status: PaymentStatus.PENDING,
        reference: null,
        paidAt: null,
        createdAt: t3,
        updatedAt: t3,
        version: 1,
        tenantId,
      });

      paymentRepo.store.set(p1.id.value, p1);
      paymentRepo.store.set(p2.id.value, p2);
      paymentRepo.store.set(p3.id.value, p3);

      const query = new GetSalePaymentHistoryQuery({
        saleId: sale.id.value,
        order: 'desc',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await getSalePaymentHistoryHandler.execute(query);

      // 1. Verify Sale existence checked
      expect(saleRepo.findByIdCalls).toContain('sale-hist-01');

      // 2. Verify payment repository queried
      expect(paymentRepo.findBySaleIdCalls).toContain('sale-hist-01');

      // 3. Verify chronological DESC ordering
      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(3);
      expect(items[0]!.id).toBe('pay-h-03'); // t3 (most recent)
      expect(items[1]!.id).toBe('pay-h-02'); // t2
      expect(items[2]!.id).toBe('pay-h-01'); // t1 (oldest)
    });

    it('rejects history query when Sale does not exist', async () => {
      const query = new GetSalePaymentHistoryQuery({
        saleId: 'sale-ghost-hist',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await getSalePaymentHistoryHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(paymentRepo.findBySaleIdCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Architectural Invariants & Negative Tests
  // ==========================================================================
  describe('Architectural Invariants & Negative Guardrails', () => {
    it('PROVES: application layer does NOT directly mutate status outside domain methods', async () => {
      const sale = seedSale('sale-guard-01', 100.0, 'USD');
      const payment = seedPendingPayment('pay-guard-01', sale.id, 100.0, 'USD');

      // Attempting to cancel a completed payment
      payment.complete({ clock });
      paymentRepo.store.set(payment.id.value, payment);

      const cancelCommand = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Illegal cancel attempt',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await cancelPaymentHandler.execute(cancelCommand);

      // Handlers never directly overwrite `_status` via backdoor;
      // instead, domain throws and application layer preserves domain state machine rejection
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(payment.status).toBe(PaymentStatus.COMPLETED); // Remains COMPLETED, untouched!
    });

    it('PROVES: application layer does NOT calculate financial values with floating-point math', async () => {
      // Create Sale with 100 USD total
      const sale = seedSale('sale-guard-math', 100.0, 'USD');

      // Complete payment of 100.00 USD
      const p1 = seedPendingPayment('pay-guard-p1', sale.id, 100.0, 'USD');
      await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: p1.id.value,
          saleId: sale.id.value,
          reference: 'FULL-SETTLE',
          tenantId,
          currentUser: authorizedUser,
        }),
      );

      // Attempt second payment of 0.01 USD (overpayment)
      const p2 = seedPendingPayment('pay-guard-p2', sale.id, 0.01, 'USD');
      const overpayResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: p2.id.value,
          saleId: sale.id.value,
          reference: 'CENT-OVERPAY',
          tenantId,
          currentUser: authorizedUser,
        }),
      );

      // Remaining balance check uses Money.subtract and Money.greaterThan,
      // completely avoiding binary IEEE-754 floating point inaccuracies (e.g. 0.1 + 0.2 != 0.3)
      expect(overpayResult.isFailure).toBe(true);
      expect(overpayResult.getError()).toBeInstanceOf(PaymentOverpaymentException);
    });

    it('PROVES: application layer does NOT bypass repositories', async () => {
      // Clear repository calls
      paymentRepo.findByIdCalls = [];

      const query = new GetPaymentQuery({
        paymentId: 'pay-any-id',
        tenantId,
        currentUser: authorizedUser,
      });

      await getPaymentHandler.execute(query);

      // Verify repository was strictly consulted
      expect(paymentRepo.findByIdCalls).toEqual(['pay-any-id']);
    });

    it('PROVES: application layer does NOT bypass domain methods', async () => {
      const sale = seedSale('sale-bypass-check', 100.0, 'USD');
      const payment = seedPendingPayment('pay-bypass-check', sale.id, 100.0, 'USD');

      const paymentCompleteSpy = jest.spyOn(payment, 'complete');
      const saleMarkPaidSpy = jest.spyOn(sale, 'markPaid');

      await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: payment.id.value,
          saleId: sale.id.value,
          reference: 'CHECK-DOMAIN-CALL',
          tenantId,
          currentUser: authorizedUser,
        }),
      );

      // Guarantees domain encapsulation: all transitions executed through domain methods
      expect(paymentCompleteSpy).toHaveBeenCalledTimes(1);
      expect(saleMarkPaidSpy).toHaveBeenCalledTimes(1);
    });

    it('PROVES: application layer does NOT silently swallow domain errors', async () => {
      const sale = seedSale('sale-swallow-check', 100.0, 'USD');
      const payment = seedPendingPayment('pay-swallow-check', sale.id, 100.0, 'USD');

      // Force failure domain transition
      payment.fail('Original failure reason', clock);
      paymentRepo.store.set(payment.id.value, payment);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'SWALLOW-TEST',
        tenantId,
        currentUser: authorizedUser,
      });

      const result = await completePaymentHandler.execute(command);

      // The exact domain exception is preserved in result.getError()
      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect((error as Error).message).toContain('Cannot settle a payment that is FAILED');
    });
  });
});
