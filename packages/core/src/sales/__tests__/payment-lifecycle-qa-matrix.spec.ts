import { Prisma } from '@prisma/client';
import { Payment } from '../domain/payment.aggregate';
import { Sale } from '../domain/sale.aggregate';
import { PaymentId } from '../domain/value-objects/payment-id.vo';
import { SaleId } from '../domain/value-objects/sale-id.vo';
import { Money } from '../domain/value-objects/money.vo';
import { PaymentMethod } from '../domain/enums/payment-method.enum';
import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PAYMENT_TRANSITION_MATRIX,
  canTransitionPaymentStatus,
  isTerminalPaymentStatus,
} from '../domain/enums/payment-status.enum';
import { PaymentLifecycleStateMachine } from '../domain/services/payment-lifecycle.state-machine';
import { SaleStatus } from '../domain/enums/sale-status.enum';
import { SourceReference } from '../domain/value-objects/source-reference.vo';
import { SourceType } from '../domain/enums/source-type.enum';
import { Discount } from '../domain/value-objects/discount.vo';
import {
  PaymentDomainException,
  InvalidPaymentTransitionException,
  PaymentOptimisticLockException,
} from '../domain/exceptions';
import {
  PaymentCompletedEvent,
  PaymentSettledEvent,
  PaymentFailedEvent,
  PaymentCancelledEvent,
} from '../domain/events';
import { DeterministicClock } from '../domain/shared/clock';
import { DomainEvent } from '../domain/shared/domain-event';
import {
  CompletePaymentCommand,
  CompletePaymentHandler,
  FailPaymentCommand,
  FailPaymentHandler,
  CancelPaymentCommand,
  CancelPaymentHandler,
} from '../application';
import {
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SalesEventPublisherPort,
} from '../application/ports';
import { PrismaPaymentMapper } from '../infrastructure/persistence/prisma/mappers/prisma-payment.mapper';

// ============================================================================
// Test Doubles
// ============================================================================

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public items = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.items.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.items.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
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

// ============================================================================
// Master Payment Lifecycle QA Regression Suite
// ============================================================================

describe('Payment Lifecycle QA Regression Suite: Transition Matrix, Invariants & Anti-Regression Proof', () => {
  const tenantId = 'tenant_kinergy_qa_master';
  const saleId = SaleId.create('sale_01j_qa_matrix_999');
  const t0 = new Date('2026-09-24T12:00:00.000Z');
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  const createPendingPayment = (id = 'pay_pending_qa_01', amount = 100.0): Payment => {
    return Payment.createPending(
      {
        id: PaymentId.create(id),
        tenantId,
        saleId,
        method: PaymentMethod.QR,
        amount: Money.create(amount, 'USD'),
      },
      clock,
    );
  };

  const createCompletedPayment = (id = 'pay_completed_qa_01', amount = 100.0): Payment => {
    return Payment.createCompleted(
      {
        id: PaymentId.create(id),
        tenantId,
        saleId,
        method: PaymentMethod.CASH,
        amount: Money.create(amount, 'USD'),
        reference: 'REC-DRAWER-01',
      },
      clock,
    );
  };

  const createPayableSale = (totalAmount: number = 100.0): Sale => {
    const sale = Sale.create(
      {
        id: saleId,
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_qa_100',
        }),
      },
      clock,
    );
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_qa_100',
      }),
      description: 'Annual Platinum Membership',
      quantity: 1,
      unitPrice: Money.create(totalAmount, 'USD'),
    });
    sale.finalize(clock);
    sale.clearEvents();
    return sale;
  };

  // ==========================================================================
  // 1. COMPLETE 16-CELL TRANSITION MATRIX
  // ==========================================================================
  describe('1. Transition Matrix: Exhaustive 16-Cell (4x4) Verification', () => {
    const validPairs = new Set<string>([
      `${PaymentStatus.PENDING}->${PaymentStatus.COMPLETED}`,
      `${PaymentStatus.PENDING}->${PaymentStatus.FAILED}`,
      `${PaymentStatus.PENDING}->${PaymentStatus.CANCELLED}`,
    ]);

    it('verifies exact matrix size of 16 combinations with exactly 3 valid and 13 invalid cells', () => {
      expect(SUPPORTED_PAYMENT_STATUSES).toHaveLength(4);
      expect(PAYMENT_TRANSITION_MATRIX).toHaveLength(16);

      const matrixValidCount = PAYMENT_TRANSITION_MATRIX.filter((c) => c.allowed).length;
      const matrixInvalidCount = PAYMENT_TRANSITION_MATRIX.filter((c) => !c.allowed).length;

      expect(matrixValidCount).toBe(3);
      expect(matrixInvalidCount).toBe(13);
    });

    it('asserts every possible (from, to) pair across all 4 supported states', () => {
      let evaluatedPairs = 0;

      for (const from of SUPPORTED_PAYMENT_STATUSES) {
        for (const to of SUPPORTED_PAYMENT_STATUSES) {
          evaluatedPairs++;
          const pairKey = `${from}->${to}`;
          const isPermitted = validPairs.has(pairKey);

          // Test state machine static helpers
          expect(PaymentLifecycleStateMachine.canTransition(from, to)).toBe(isPermitted);
          expect(canTransitionPaymentStatus(from, to)).toBe(isPermitted);

          if (isPermitted) {
            expect(() =>
              PaymentLifecycleStateMachine.assertTransitionValid(from, to),
            ).not.toThrow();
            expect(PaymentLifecycleStateMachine.transition(from, to)).toBe(to);
          } else {
            expect(() => PaymentLifecycleStateMachine.assertTransitionValid(from, to)).toThrow(
              InvalidPaymentTransitionException,
            );
            expect(() => PaymentLifecycleStateMachine.transition(from, to)).toThrow(
              InvalidPaymentTransitionException,
            );
          }
        }
      }

      expect(evaluatedPairs).toBe(16); // Zero combinations omitted
    });
  });

  // ==========================================================================
  // 2. DOMAIN TRANSITION TESTS
  // ==========================================================================
  describe('2. Domain Transition Tests (Valid, Invalid & Speculative Transitions)', () => {
    describe('Valid Transitions', () => {
      it('executes PENDING -> COMPLETED and transitions deterministically', () => {
        const payment = createPendingPayment();
        clock.advance(5000);

        payment.complete({ reference: 'REF-CONFIRMED-01', clock });

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.isCompleted()).toBe(true);
        expect(payment.paidAt).toEqual(clock.now());
        expect(payment.reference?.value).toBe('REF-CONFIRMED-01');
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events.length).toBeGreaterThanOrEqual(1);
        const completedEvent = events.find(
          (e) => e instanceof PaymentCompletedEvent || e instanceof PaymentSettledEvent,
        );
        expect(completedEvent).toBeDefined();
      });

      it('executes PENDING -> FAILED and transitions deterministically', () => {
        const payment = createPendingPayment();
        clock.advance(3000);

        payment.fail('Card rail processor timeout', clock);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        expect(payment.isFailed()).toBe(true);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        const failedEvent = events.find((e) => e instanceof PaymentFailedEvent);
        expect(failedEvent).toBeDefined();
      });

      it('executes PENDING -> CANCELLED and transitions deterministically', () => {
        const payment = createPendingPayment();
        clock.advance(2000);

        payment.cancel('Customer cancelled transaction at counter', clock);

        expect(payment.status).toBe(PaymentStatus.CANCELLED);
        expect(payment.isCancelled()).toBe(true);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        const cancelledEvent = events.find((e) => e instanceof PaymentCancelledEvent);
        expect(cancelledEvent).toBeDefined();
      });
    });

    describe('Invalid Transitions', () => {
      it('rejects all transitions originating from COMPLETED', () => {
        const payment = createCompletedPayment();

        expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('Late decline', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.cancel('Late cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.assertCanTransitionTo(PaymentStatus.PENDING)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('rejects all transitions originating from FAILED', () => {
        const payment = createPendingPayment();
        payment.fail('Decline', clock);

        expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.cancel('Cancel after fail', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.fail('Second fail', clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.assertCanTransitionTo(PaymentStatus.PENDING)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('rejects all transitions originating from CANCELLED', () => {
        const payment = createPendingPayment();
        payment.cancel('Aborted', clock);

        expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('Fail after cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.cancel('Second cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.assertCanTransitionTo(PaymentStatus.PENDING)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('rejects speculative or non-approved transition actions', () => {
        const speculativeActions = ['REFUND', 'REVERSE', 'EXPIRE', 'PARTIALLY_COMPLETE', 'VOID'];
        for (const action of speculativeActions) {
          expect(() => PaymentLifecycleStateMachine.resolveTargetStatus(action)).toThrow(
            PaymentDomainException,
          );
        }
      });
    });
  });

  // ==========================================================================
  // 3. MUTATION SAFETY (NO PARTIAL MUTATION)
  // ==========================================================================
  describe('3. Mutation Safety: Rejected Transitions Guarantee Zero Partial Mutation', () => {
    it('verifies COMPLETED aggregate remains 100% unchanged across all state properties on rejected transition', () => {
      const payment = createCompletedPayment();
      payment.clearEvents();

      const initialStatus = payment.status;
      const initialPaidAt = payment.paidAt;
      const initialAmount = payment.amount;
      const initialSaleId = payment.saleId;
      const initialReference = payment.reference;
      const initialCreatedAt = payment.createdAt;
      const initialUpdatedAt = payment.updatedAt;
      const initialVersion = payment.version;

      // Attempt invalid transition
      expect(() => payment.cancel('Illegal cancel attempt', clock)).toThrow(
        InvalidPaymentTransitionException,
      );

      // Verify ZERO partial mutation
      expect(payment.status).toBe(initialStatus);
      expect(payment.paidAt).toEqual(initialPaidAt);
      expect(payment.amount.cents).toBe(initialAmount.cents);
      expect(payment.amount.currency).toBe(initialAmount.currency);
      expect(payment.saleId.value).toBe(initialSaleId.value);
      expect(payment.reference?.value).toBe(initialReference?.value);
      expect(payment.createdAt).toEqual(initialCreatedAt);
      expect(payment.updatedAt).toEqual(initialUpdatedAt);
      expect(payment.version).toBe(initialVersion);
      expect(payment.getUncommittedEvents()).toHaveLength(0); // Zero phantom events recorded
    });

    it('verifies FAILED aggregate remains 100% unchanged on rejected transition', () => {
      const payment = createPendingPayment();
      payment.fail('First decline', clock);
      payment.clearEvents();

      const initialVersion = payment.version;
      const initialUpdatedAt = payment.updatedAt;

      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(initialVersion);
      expect(payment.updatedAt).toEqual(initialUpdatedAt);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('verifies CANCELLED aggregate remains 100% unchanged on rejected transition', () => {
      const payment = createPendingPayment();
      payment.cancel('Customer left', clock);
      payment.clearEvents();

      const initialVersion = payment.version;
      const initialUpdatedAt = payment.updatedAt;

      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);

      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(initialVersion);
      expect(payment.updatedAt).toEqual(initialUpdatedAt);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. TERMINAL STATES
  // ==========================================================================
  describe('4. Terminal States: Permanent Immutability', () => {
    it('proves COMPLETED, FAILED, and CANCELLED are terminal with zero outgoing transitions', () => {
      expect(isTerminalPaymentStatus(PaymentStatus.COMPLETED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.FAILED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.CANCELLED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.PENDING)).toBe(false);

      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.COMPLETED)).toBe(true);
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.FAILED)).toBe(true);
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.CANCELLED)).toBe(true);
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.PENDING)).toBe(false);

      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.COMPLETED)).toEqual(
        [],
      );
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.FAILED)).toEqual([]);
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.CANCELLED)).toEqual(
        [],
      );
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
    });
  });

  // ==========================================================================
  // 5. TIMESTAMP BEHAVIORAL VERIFICATION
  // ==========================================================================
  describe('5. Timestamp Tests: createdAt & paidAt Lifecycle Rules', () => {
    it('verifies PENDING creation sets createdAt and leaves paidAt strictly null', () => {
      const payment = createPendingPayment();
      expect(payment.createdAt).toEqual(t0);
      expect(payment.paidAt).toBeNull();
    });

    it('verifies COMPLETED creation populates both createdAt and paidAt to current clock time', () => {
      const payment = createCompletedPayment();
      expect(payment.createdAt).toEqual(t0);
      expect(payment.paidAt).toEqual(t0);
    });

    it('verifies transition to COMPLETED populates paidAt matching the execution clock time', () => {
      const payment = createPendingPayment();
      clock.advance(15000);
      const completionTime = clock.now();

      payment.complete(clock);

      expect(payment.createdAt).toEqual(t0);
      expect(payment.paidAt).toEqual(completionTime);
      expect(payment.updatedAt).toEqual(completionTime);
    });

    it('verifies transition to FAILED keeps paidAt strictly null', () => {
      const payment = createPendingPayment();
      clock.advance(8000);

      payment.fail('Rail error', clock);

      expect(payment.paidAt).toBeNull();
      expect(payment.updatedAt).toEqual(clock.now());
    });

    it('verifies transition to CANCELLED keeps paidAt strictly null', () => {
      const payment = createPendingPayment();
      clock.advance(12000);

      payment.cancel('Customer aborted', clock);

      expect(payment.paidAt).toBeNull();
      expect(payment.updatedAt).toEqual(clock.now());
    });
  });

  // ==========================================================================
  // 6. IDEMPOTENCY & REPEATED COMMANDS POLICY
  // ==========================================================================
  describe('6. Idempotency & Repeated Commands Policy', () => {
    it('deterministically rejects repeated complete() commands with InvalidPaymentTransitionException', () => {
      const payment = createPendingPayment();
      payment.complete(clock);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      // Second complete invocation MUST throw, never silently mutate or ignore
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => payment.complete(clock)).toThrow(/permanently immutable/i);
    });

    it('deterministically rejects repeated fail() commands with InvalidPaymentTransitionException', () => {
      const payment = createPendingPayment();
      payment.fail('First decline', clock);
      expect(payment.status).toBe(PaymentStatus.FAILED);

      expect(() => payment.fail('Duplicate decline', clock)).toThrow(
        InvalidPaymentTransitionException,
      );
    });

    it('deterministically rejects repeated cancel() commands with InvalidPaymentTransitionException', () => {
      const payment = createPendingPayment();
      payment.cancel('First cancellation', clock);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);

      expect(() => payment.cancel('Duplicate cancellation', clock)).toThrow(
        InvalidPaymentTransitionException,
      );
    });
  });

  // ==========================================================================
  // 7. APPLICATION TESTS: USE CASES CANNOT BYPASS DOMAIN
  // ==========================================================================
  describe('7. Application Use Cases: Domain Lifecycle Rules Cannot Be Bypassed', () => {
    let paymentRepo: InMemoryPaymentRepository;
    let saleRepo: InMemorySaleRepository;
    let eventPublisher: MockSalesEventPublisher;

    beforeEach(() => {
      paymentRepo = new InMemoryPaymentRepository();
      saleRepo = new InMemorySaleRepository();
      eventPublisher = new MockSalesEventPublisher();
    });

    it('CompletePaymentHandler validates transition through domain and synchronizes sale balance', async () => {
      const sale = createPayableSale(100.0);
      saleRepo.items.set(sale.id.value, sale);

      const payment = createPendingPayment('pay_app_01', 100.0);
      paymentRepo.items.set(payment.id.value, payment);

      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        reference: 'APP-REF-100',
        tenantId,
        currentUser: { id: 'usr_cashier_01', permissions: ['payments.create'] },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const updated = await paymentRepo.findById(payment.id);
      expect(updated?.status).toBe(PaymentStatus.COMPLETED);
      expect(updated?.reference?.value).toBe('APP-REF-100');

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);

      // Attempting second complete through application handler MUST fail
      const repeatResult = await handler.execute(command);
      expect(repeatResult.isFailure).toBe(true);
      expect(repeatResult.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('FailPaymentHandler rejects transition when payment is already COMPLETED', async () => {
      const sale = createPayableSale(100.0);
      saleRepo.items.set(sale.id.value, sale);

      const payment = createCompletedPayment('pay_app_comp_01', 100.0);
      paymentRepo.items.set(payment.id.value, payment);

      const handler = new FailPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);

      const command = new FailPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Late network drop',
        tenantId,
        currentUser: { id: 'usr_cashier_01', permissions: ['payments.create'] },
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.COMPLETED); // Untouched
    });

    it('CancelPaymentHandler rejects transition when payment is already COMPLETED', async () => {
      const sale = createPayableSale(100.0);
      saleRepo.items.set(sale.id.value, sale);

      const payment = createCompletedPayment('pay_app_comp_02', 100.0);
      paymentRepo.items.set(payment.id.value, payment);

      const handler = new CancelPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        reason: 'Void request',
        tenantId,
        currentUser: { id: 'usr_mgr_01', roles: ['Manager'], permissions: ['payments.manage'] },
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentTransitionException);

      const stored = await paymentRepo.findById(payment.id);
      expect(stored?.status).toBe(PaymentStatus.COMPLETED); // Untouched
    });
  });

  // ==========================================================================
  // 8. PERSISTENCE ROUND-TRIP FIDELITY
  // ==========================================================================
  describe('8. Persistence Tests: Lifecycle State Survives Domain -> Persistence -> Domain', () => {
    it('preserves PENDING state and exact fields across PrismaPaymentMapper', () => {
      const pending = createPendingPayment('pay_roundtrip_pending', 45.5);
      const persistence = PrismaPaymentMapper.toPersistence(pending);

      expect(persistence.status).toBe('PENDING');
      expect(persistence.paidAt).toBeNull();
      expect(persistence.amount).toBeInstanceOf(Prisma.Decimal);
      expect(persistence.amount.toFixed(2)).toBe('45.50');

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: pending.createdAt,
        updatedAt: pending.updatedAt,
      });

      expect(reconstituted.id.value).toBe('pay_roundtrip_pending');
      expect(reconstituted.status).toBe(PaymentStatus.PENDING);
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.amount.cents).toBe(4550);
      expect(reconstituted.amount.currency).toBe('USD');
      expect(reconstituted.version).toBe(1);
    });

    it('preserves COMPLETED state and exact fields across PrismaPaymentMapper', () => {
      const completed = createCompletedPayment('pay_roundtrip_completed', 150.0);
      const persistence = PrismaPaymentMapper.toPersistence(completed);

      expect(persistence.status).toBe('SETTLED');
      expect(persistence.paidAt).toEqual(t0);

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: completed.createdAt,
        updatedAt: completed.updatedAt,
      });

      expect(reconstituted.status).toBe(PaymentStatus.COMPLETED);
      expect(reconstituted.paidAt).toEqual(t0);
      expect(reconstituted.reference?.value).toBe('REC-DRAWER-01');
    });

    it('preserves FAILED state and exact fields across PrismaPaymentMapper', () => {
      const payment = createPendingPayment('pay_roundtrip_failed', 60.0);
      payment.fail('Rail decline', clock);
      const persistence = PrismaPaymentMapper.toPersistence(payment);

      expect(persistence.status).toBe('FAILED');
      expect(persistence.paidAt).toBeNull();

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.status).toBe(PaymentStatus.FAILED);
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.version).toBe(2);
    });

    it('preserves CANCELLED state and exact fields across PrismaPaymentMapper', () => {
      const payment = createPendingPayment('pay_roundtrip_cancelled', 75.0);
      payment.cancel('Customer aborted', clock);
      const persistence = PrismaPaymentMapper.toPersistence(payment);

      expect(persistence.status).toBe('CANCELLED');
      expect(persistence.paidAt).toBeNull();

      const reconstituted = PrismaPaymentMapper.toDomain({
        ...persistence,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });

      expect(reconstituted.status).toBe(PaymentStatus.CANCELLED);
      expect(reconstituted.paidAt).toBeNull();
      expect(reconstituted.version).toBe(2);
    });
  });

  // ==========================================================================
  // 9. CONCURRENCY TESTS (OPTIMISTIC CONCURRENCY CONTROL)
  // ==========================================================================
  describe('9. Concurrency Tests: Request A (Complete) vs Request B (Cancel)', () => {
    it('guarantees optimistic locking prevents conflicting concurrent transitions on same Payment', async () => {
      // Simulating database storage with version tracking
      let storedRecord: {
        id: string;
        tenantId: string;
        saleId: string;
        status: PaymentStatus;
        version: number;
        paidAt: Date | null;
      } = {
        id: 'pmt_concurrency_race_01',
        tenantId,
        saleId: saleId.value,
        status: PaymentStatus.PENDING,
        version: 1,
        paidAt: null,
      };

      // Mock DB save with OCC version check: UPDATE ... WHERE id = :id AND version = :currentVersion
      const dbSaveWithOcc = async (payment: Payment, expectedVersion: number): Promise<void> => {
        if (storedRecord.version !== expectedVersion) {
          throw new PaymentOptimisticLockException(payment.id.value, expectedVersion);
        }
        storedRecord = {
          id: payment.id.value,
          tenantId: payment.tenantId,
          saleId: payment.saleId.value,
          status: payment.status,
          version: payment.version,
          paidAt: payment.paidAt,
        };
      };

      // 1. Initial State: Payment is PENDING at version 1
      // Request A loads Payment
      const paymentInstanceA = Payment.reconstitute({
        id: PaymentId.create(storedRecord.id),
        tenantId: storedRecord.tenantId,
        saleId: SaleId.create(storedRecord.saleId),
        method: PaymentMethod.QR,
        amount: Money.create(100.0, 'USD'),
        status: storedRecord.status,
        reference: null,
        paidAt: storedRecord.paidAt,
        createdAt: t0,
        updatedAt: t0,
        version: storedRecord.version, // version 1
      });

      // Request B concurrently loads Payment before Request A saves
      const paymentInstanceB = Payment.reconstitute({
        id: PaymentId.create(storedRecord.id),
        tenantId: storedRecord.tenantId,
        saleId: SaleId.create(storedRecord.saleId),
        method: PaymentMethod.QR,
        amount: Money.create(100.0, 'USD'),
        status: storedRecord.status,
        reference: null,
        paidAt: storedRecord.paidAt,
        createdAt: t0,
        updatedAt: t0,
        version: storedRecord.version, // version 1
      });

      // Request A executes complete() -> version advances to 2
      const versionExpectedByA = paymentInstanceA.version; // 1
      paymentInstanceA.complete(clock);
      expect(paymentInstanceA.version).toBe(2);

      // Request A saves successfully
      await dbSaveWithOcc(paymentInstanceA, versionExpectedByA);
      expect(storedRecord.status).toBe(PaymentStatus.COMPLETED);
      expect(storedRecord.version).toBe(2);

      // Request B executes cancel() on its stale instance -> version advances from 1 to 2
      const versionExpectedByB = paymentInstanceB.version; // 1
      paymentInstanceB.cancel('Customer aborted tender', clock);

      // Request B attempts to save expecting version 1 -> MUST be rejected by OCC
      await expect(dbSaveWithOcc(paymentInstanceB, versionExpectedByB)).rejects.toThrow(
        PaymentOptimisticLockException,
      );

      // Final database state remains authoritatively COMPLETED at version 2
      expect(storedRecord.status).toBe(PaymentStatus.COMPLETED);
      expect(storedRecord.version).toBe(2);
    });
  });

  // ==========================================================================
  // 10. BYPASS REGRESSION TESTS
  // ==========================================================================
  describe('10. Bypass Regression: Status Property Immutability', () => {
    it('proves Payment.status is a getter without a setter on aggregate prototype', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Payment.prototype, 'status');
      expect(descriptor).toBeDefined();
      expect(descriptor?.get).toBeDefined();
      expect(descriptor?.set).toBeUndefined(); // Read-only!
    });

    it('proves callers cannot mutate aggregate status via direct property assignment', () => {
      const payment = createPendingPayment();
      expect(payment.status).toBe(PaymentStatus.PENDING);

      try {
        // TypeScript prevents this at compile time; runtime check confirms immutability
        (payment as unknown as { status: PaymentStatus }).status = PaymentStatus.COMPLETED;
      } catch {
        // TypeError in strict mode is expected when assigning to getter-only property
      }

      // Aggregate status remains strictly PENDING unless modified via domain method
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });
  });

  // ==========================================================================
  // 11. REGRESSION ON PHASE 7.4 COMMERCIAL BEHAVIOR
  // ==========================================================================
  describe('11. Regression Verification: Payment Transitions Do Not Alter Commercial Rules', () => {
    it('verifies payment state changes do not alter Sale subtotal, items, discountTotal, or total', () => {
      const sale = Sale.create(
        {
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.MEMBERSHIP_PLAN,
            sourceId: 'plan_74_01',
          }),
        },
        clock,
      );

      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_74_01',
        }),
        description: 'Elite Annual Plan',
        quantity: 2,
        unitPrice: Money.create(150.0, 'USD'), // 300.00
      });

      sale.applyItemDiscount(sale.items[0]!.id, Discount.percentage(10)); // 30.00 discount -> total 270.00
      sale.finalize(clock);

      const originalSubtotal = sale.subtotal.cents;
      const originalDiscount = sale.discountTotal.cents;
      const originalTotal = sale.total.cents;
      const originalItemsCount = sale.items.length;

      // Create payment against sale and perform lifecycle transitions
      const payment = Payment.createPending(
        {
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(270.0, 'USD'),
        },
        clock,
      );

      clock.advance(1000);
      payment.complete(clock);

      // Verify Sale financial invariants remain perfectly preserved
      expect(sale.subtotal.cents).toBe(originalSubtotal);
      expect(sale.discountTotal.cents).toBe(originalDiscount);
      expect(sale.total.cents).toBe(originalTotal);
      expect(sale.items.length).toBe(originalItemsCount);
      expect(sale.subtotal.amount).toBe(300.0);
      expect(sale.discountTotal.amount).toBe(30.0);
      expect(sale.total.amount).toBe(270.0);
    });

    it('verifies Money arithmetic operations maintain exact cent boundaries without precision loss', () => {
      const m1 = Money.create(19.99, 'USD');
      const m2 = Money.create(10.01, 'USD');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(3000);
      expect(sum.amount).toBe(30.0);

      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: sum,
        },
        clock,
      );

      expect(payment.amount.cents).toBe(3000);
      expect(payment.amount.amount).toBe(30.0);
    });
  });
});
