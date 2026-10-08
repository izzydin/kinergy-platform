import { CancelPaymentHandler } from '../handlers/cancel-payment.handler';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
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
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { InvalidPaymentTransitionException } from '../../domain/exceptions/invalid-payment-transition.exception';
import { PaymentOptimisticLockException } from '../../domain/exceptions/optimistic-lock.exception';
import { PaymentCancelledEvent } from '../../domain/events/payment-cancelled.event';

// In-Memory Test Doubles with Isolated Snapshots & OCC
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public shouldFailSave = false;
  public failOccOnNextSave = false;
  public saveCallCount = 0;

  private clone(payment: Payment): Payment {
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

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    return this.clone(payment);
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values())
      .filter((p) => p.saleId.value === key)
      .map((p) => this.clone(p));
  }

  async save(payment: Payment): Promise<void> {
    this.saveCallCount += 1;
    if (this.shouldFailSave) {
      throw new Error('Database disk I/O error: simulated payment persistence failure.');
    }
    if (this.failOccOnNextSave) {
      throw new PaymentOptimisticLockException(payment.id.value, payment.version - 1);
    }
    const existing = this.store.get(payment.id.value);
    if (existing && existing.version >= payment.version) {
      throw new PaymentOptimisticLockException(payment.id.value, existing.version);
    }
    this.store.set(payment.id.value, this.clone(payment));
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount += 1;
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

function getErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

describe('CancelPaymentHandler Specification & Milestone 7.6 State Machine Suite', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const t0 = new Date('2026-10-01T10:00:00.000Z');
  const t1 = new Date('2026-10-01T10:05:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: CancelPaymentHandler;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_789',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_789',
      }),
      description: 'Gold Tier Gym Membership',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  const createPendingPayment = (sale: Sale, amount: number = 100.0): Payment => {
    const payment = Payment.createPending(
      {
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.QR,
        amount: Money.create(amount, sale.currency),
      },
      clock,
    );
    paymentRepo.store.set(
      payment.id.value,
      Payment.reconstitute({
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
      }),
    );
    return payment;
  };

  const createCompletedPayment = (sale: Sale, amount: number = 100.0): Payment => {
    const payment = Payment.createCompleted(
      {
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(amount, sale.currency),
      },
      clock,
    );
    paymentRepo.store.set(
      payment.id.value,
      Payment.reconstitute({
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
      }),
    );
    return payment;
  };

  beforeEach(() => {
    clock = new DeterministicClock(t0);
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();

    handler = new CancelPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
  });

  describe('1. Valid State Transitions to CANCELLED (Milestone 7.6 State Machine)', () => {
    it('should successfully transition PENDING -> CANCELLED with explicit cancellation reason', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.version).toBe(1);

      // Advance clock to cancellation time
      clock.setTime(t1);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Customer requested tender change from QR to Cash',
        tenantId,
        currentUser: {
          id: 'manager_01',
          roles: ['Manager'],
          permissions: ['payments.manage'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // State verification
      expect(dto.id).toBe(payment.id.value);
      expect(dto.status).toBe(PaymentStatus.CANCELLED);
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);
      expect(dto.createdAt).toBe(t0.toISOString());

      // Repository persistence verification
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored).not.toBeNull();
      expect(stored!.status).toBe(PaymentStatus.CANCELLED);
      expect(stored!.paidAt).toBeNull();
      expect(stored!.version).toBe(2);
      expect(stored!.updatedAt).toEqual(t1);

      // Domain Event verification
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      const event = eventPublisher.publishedEvents[0];
      expect(event).toBeInstanceOf(PaymentCancelledEvent);
      expect(event?.aggregateId).toBe(payment.id.value);
      expect((event as PaymentCancelledEvent).payload.reason).toBe(
        'Customer requested tender change from QR to Cash',
      );
      expect((event as PaymentCancelledEvent).payload.cents).toBe(10000);
      expect((event as PaymentCancelledEvent).payload.method).toBe(PaymentMethod.QR);
    });

    it('should successfully transition PENDING -> CANCELLED without optional reason (null/undefined)', async () => {
      const sale = createPayableSale(50.0);
      const payment = createPendingPayment(sale, 50.0);

      clock.setTime(t1);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        tenantId,
        currentUser: {
          id: 'mgr_02',
          roles: ['Manager'],
          permissions: ['payments.manage'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.CANCELLED);
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);

      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.CANCELLED);
    });
  });

  describe('2. Invalid State Transitions to CANCELLED (Milestone 7.6 State Machine)', () => {
    it('should reject COMPLETED -> CANCELLED transition (terminal immutability / refund required)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createCompletedPayment(sale, 100.0);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Attempting to void completed transaction',
        tenantId,
        currentUser: {
          id: 'mgr_01',
          roles: ['Manager'],
          permissions: ['payments.manage'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(getErrorMessage(error)).toContain('Completed payments are permanently immutable');

      // Aggregate in repository remains 100% untouched
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.COMPLETED);
      expect(stored!.paidAt).toEqual(t0);
      expect(stored!.version).toBe(1);

      // No events published
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should reject FAILED -> CANCELLED transition (terminal immutability)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      // Fail the payment
      payment.fail('Card expired', clock);
      await paymentRepo.save(payment);
      expect(payment.status).toBe(PaymentStatus.FAILED);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Attempting to cancel an already failed payment',
        tenantId,
        currentUser: {
          id: 'mgr_01',
          roles: ['Manager'],
          permissions: ['payments.manage'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(getErrorMessage(error)).toContain('Cannot cancel a payment that is FAILED');

      // Aggregate in repository remains FAILED
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.FAILED);
      expect(stored!.version).toBe(2);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should reject CANCELLED -> CANCELLED transition (self-transition prohibited)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      // First cancellation: PENDING -> CANCELLED
      await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          reason: 'Initial void',
          tenantId,
          currentUser: {
            id: 'mgr_01',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );
      eventPublisher.clear();

      const storedAfterFirstCancel = await paymentRepo.findById(payment.id.value);
      expect(storedAfterFirstCancel!.status).toBe(PaymentStatus.CANCELLED);
      expect(storedAfterFirstCancel!.version).toBe(2);

      // Second cancellation attempt: CANCELLED -> CANCELLED
      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Repeated cancellation request',
        tenantId,
        currentUser: {
          id: 'mgr_01',
          roles: ['Manager'],
          permissions: ['payments.manage'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(getErrorMessage(error)).toContain('repeated transition prohibited');

      // Aggregate remains at version 2, no extra events
      const storedAfterSecondCancel = await paymentRepo.findById(payment.id.value);
      expect(storedAfterSecondCancel!.status).toBe(PaymentStatus.CANCELLED);
      expect(storedAfterSecondCancel!.version).toBe(2);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });

  describe('3. Sale Non-Cancellation Invariants & Accounting Boundaries', () => {
    it('should NOT cancel or mutate a parent Sale in PENDING_PAYMENT status when Payment is cancelled', async () => {
      const sale = createPayableSale(100.0);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          reason: 'Customer wants to pay later',
          tenantId,
          currentUser: {
            id: 'mgr_01',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);

      // Parent sale status must remain strictly PENDING_PAYMENT
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale).not.toBeNull();
      expect(storedSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(storedSale!.cancelledAt).toBeUndefined();
      expect(storedSale!.cancellationReason).toBeUndefined();

      // Sale repository save was NOT called
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('should NOT cancel or mutate a parent Sale in PARTIALLY_PAID status when a secondary Payment is cancelled', async () => {
      const sale = createPayableSale(100.0);

      // 1. First payment of $40 settles
      const payment1 = Payment.createCompleted(
        {
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment1);
      sale.markPartiallyPaid(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      const initialSaleSaveCount = saleRepo.saveCallCount;

      // 2. Second payment of $60 is pending and subsequently cancelled
      const payment2 = createPendingPayment(sale, 60.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment2.id.value,
          reason: 'Customer voided secondary tender attempt',
          tenantId,
          currentUser: {
            id: 'mgr_01',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PaymentStatus.CANCELLED);

      // Parent sale status must remain strictly PARTIALLY_PAID
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(storedSale!.cancelledAt).toBeUndefined();

      // Sale repository was not touched by CancelPaymentHandler
      expect(saleRepo.saveCallCount).toBe(initialSaleSaveCount);
    });
  });

  describe('4. Direct Status Mutation Bypass Protection', () => {
    it('proves Payment.status cannot be directly assigned and requires payment.cancel(...)', () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(payment), 'status');
      expect(descriptor?.set).toBeUndefined();
      expect(descriptor?.get).toBeDefined();

      expect(() => {
        (payment as unknown as Record<string, unknown>).status = PaymentStatus.CANCELLED;
      }).toThrow();
    });
  });

  describe('5. Application Layer Authorization & Scoping', () => {
    it('should succeed when caller has payments.manage permission and allowed role', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should reject when caller has payments.create but lacks payments.manage permission', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'cashier_1',
            roles: ['Receptionist'],
            permissions: ['payments.create'], // payments.create is not enough for cancel
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should reject cross-tenant payment cancellation attempts', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant_other_facility',
          currentUser: {
            id: 'admin_1',
            roles: ['Platform Admin'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(getErrorMessage(result.getError())).toContain('Cross-tenant access forbidden');
    });

    it('should reject when caller specifies mismatched saleId', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          saleId: 'sale_different_999',
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(getErrorMessage(result.getError())).toContain(
        'Payment does not belong to the specified Sale',
      );
    });

    it('should return PaymentNotFoundException when paymentId does not exist', async () => {
      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: 'pay_nonexistent_000',
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('should return error when paymentId is blank or empty', async () => {
      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: '   ',
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain('Payment ID cannot be empty');
    });
  });

  describe('6. Persistence Resilience & Concurrency (OCC)', () => {
    it('should propagate repository persistence failure and suppress domain events', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      paymentRepo.shouldFailSave = true;

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result.getError())).toContain('simulated payment persistence failure');

      // Events should not have been published
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should detect OCC conflict and return failure when concurrent mutation occurs', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      paymentRepo.failOccOnNextSave = true;

      const result = await handler.execute(
        new CancelPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'mgr_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOptimisticLockException);
    });
  });
});
