import { FailPaymentHandler } from '../handlers/fail-payment.handler';
import { FailPaymentCommand } from '../commands/fail-payment.command';
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
import { PaymentFailedEvent } from '../../domain/events/payment-failed.event';

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

describe('FailPaymentHandler Specification & Milestone 7.6 State Machine Suite', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const t0 = new Date('2026-10-01T10:00:00.000Z');
  const t1 = new Date('2026-10-01T10:05:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: FailPaymentHandler;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_silver_456',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_silver_456',
      }),
      description: 'Silver Tier Gym Membership',
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
    // Store isolated clone so in-place mutations don't prematurely advance stored version
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

    handler = new FailPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
  });

  describe('1. Valid State Transitions to FAILED (Milestone 7.6 State Machine)', () => {
    it('should successfully transition PENDING -> FAILED with explicit failure reason', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.version).toBe(1);

      // Advance clock to failure time
      clock.setTime(t1);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reason: 'Payment rail decline: Insufficient balance on customer e-wallet',
        tenantId,
        currentUser: {
          id: 'receptionist_01',
          roles: ['Receptionist'],
          permissions: ['payments.create'],
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // State verification
      expect(dto.id).toBe(payment.id.value);
      expect(dto.status).toBe(PaymentStatus.FAILED);
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);
      expect(dto.createdAt).toBe(t0.toISOString());

      // Repository persistence verification
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored).not.toBeNull();
      expect(stored!.status).toBe(PaymentStatus.FAILED);
      expect(stored!.paidAt).toBeNull();
      expect(stored!.version).toBe(2);
      expect(stored!.updatedAt).toEqual(t1);

      // Domain Event verification
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      const event = eventPublisher.publishedEvents[0];
      expect(event).toBeInstanceOf(PaymentFailedEvent);
      expect(event?.aggregateId).toBe(payment.id.value);
      expect((event as PaymentFailedEvent).payload.reason).toBe(
        'Payment rail decline: Insufficient balance on customer e-wallet',
      );
      expect((event as PaymentFailedEvent).payload.cents).toBe(10000);
      expect((event as PaymentFailedEvent).payload.method).toBe(PaymentMethod.QR);
    });

    it('should successfully transition PENDING -> FAILED without optional reason (null/undefined)', async () => {
      const sale = createPayableSale(50.0);
      const payment = createPendingPayment(sale, 50.0);

      clock.setTime(t1);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.FAILED);
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);

      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.FAILED);
    });
  });

  describe('2. Invalid State Transitions to FAILED (Milestone 7.6 State Machine)', () => {
    it('should reject COMPLETED -> FAILED transition (terminal immutability)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createCompletedPayment(sale, 100.0);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Late dispute notification',
        tenantId,
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

      // No failure events published
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should reject FAILED -> FAILED transition (self-transition prohibited)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      // First failure transition: PENDING -> FAILED
      await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          reason: 'Initial network timeout',
          tenantId,
        }),
      );
      eventPublisher.clear();

      const storedAfterFirstFail = await paymentRepo.findById(payment.id.value);
      expect(storedAfterFirstFail!.status).toBe(PaymentStatus.FAILED);
      expect(storedAfterFirstFail!.version).toBe(2);

      // Second failure attempt: FAILED -> FAILED
      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Repeated failure callback from rail',
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(getErrorMessage(error)).toContain('repeated transition prohibited');

      // Aggregate remains at version 2, no extra events
      const storedAfterSecondFail = await paymentRepo.findById(payment.id.value);
      expect(storedAfterSecondFail!.status).toBe(PaymentStatus.FAILED);
      expect(storedAfterSecondFail!.version).toBe(2);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should reject CANCELLED -> FAILED transition (terminal immutability)', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      // Cancel the payment
      payment.cancel('Customer abandoned tender', clock);
      await paymentRepo.save(payment);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Attempting to fail a cancelled payment',
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidPaymentTransitionException);
      expect(getErrorMessage(error)).toContain('Cannot fail a payment that is CANCELLED');

      // Aggregate in repository remains CANCELLED
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.CANCELLED);
      expect(stored!.version).toBe(2);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });
  });

  describe('3. Sale Non-Cancellation Invariants', () => {
    it('should NOT cancel or mutate a parent Sale in PENDING_PAYMENT status when Payment fails', async () => {
      const sale = createPayableSale(100.0);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          reason: 'QR expired',
          tenantId,
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

    it('should NOT cancel or mutate a parent Sale in PARTIALLY_PAID status when a secondary Payment fails', async () => {
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

      // 2. Second payment of $60 is pending and subsequently fails
      const payment2 = createPendingPayment(sale, 60.0);

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment2.id.value,
          reason: 'Card decline: insufficient funds',
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(PaymentStatus.FAILED);

      // Parent sale status must remain strictly PARTIALLY_PAID
      const storedSale = await saleRepo.findById(sale.id);
      expect(storedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(storedSale!.cancelledAt).toBeUndefined();

      // Sale repository was not touched by FailPaymentHandler
      expect(saleRepo.saveCallCount).toBe(initialSaleSaveCount);
    });
  });

  describe('4. Direct Status Assignment Bypass Protection', () => {
    it('proves Payment.status cannot be directly assigned and requires payment.fail(...)', () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      // TypeScript / runtime protection check: status is a getter without setter
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(payment), 'status');
      expect(descriptor?.set).toBeUndefined();
      expect(descriptor?.get).toBeDefined();

      // Attempting direct assignment throws or fails in strict mode
      expect(() => {
        (payment as unknown as Record<string, unknown>).status = PaymentStatus.FAILED;
      }).toThrow();
    });
  });

  describe('5. Application Layer Authorization & Scoping', () => {
    it('should succeed when caller has payments.create permission and allowed role', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'cashier_1',
            roles: ['Receptionist'],
            permissions: ['payments.create'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should succeed when caller has payments.manage permission and allowed role', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new FailPaymentCommand({
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

    it('should reject when caller lacks payments.create or payments.manage', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
          currentUser: {
            id: 'viewer_1',
            roles: ['Auditor'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should reject cross-tenant payment failure attempts', async () => {
      const sale = createPayableSale(100.0);
      const payment = createPendingPayment(sale, 100.0);

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId: 'tenant_other_facility',
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
        new FailPaymentCommand({
          paymentId: payment.id.value,
          saleId: 'sale_different_999',
          tenantId,
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
        new FailPaymentCommand({
          paymentId: 'pay_nonexistent_000',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('should return error when paymentId is blank or empty', async () => {
      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: '   ',
          tenantId,
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
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
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

      // Trigger OCC conflict on the save attempt
      paymentRepo.failOccOnNextSave = true;

      const result = await handler.execute(
        new FailPaymentCommand({
          paymentId: payment.id.value,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOptimisticLockException);
    });
  });
});
