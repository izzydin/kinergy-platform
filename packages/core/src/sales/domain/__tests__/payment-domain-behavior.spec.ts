import { Payment } from '../payment.aggregate';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { InvalidPaymentTransitionException } from '../exceptions/invalid-payment-transition.exception';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';
import {
  PaymentCompletedEvent,
  PaymentSettledEvent,
  PaymentFailedEvent,
  PaymentCancelledEvent,
} from '../events';
import { DeterministicClock } from '../shared/clock';

describe('Payment Domain Lifecycle Behavior & State Boundary Enforcement (ADR-0116)', () => {
  const tenantId = 'tenant_kinergy_enterprise';
  const saleId = SaleId.create('sale_pos_5500');
  const amount = Money.create(250.75, 'USD');
  const t0 = new Date('2026-09-23T10:00:00.000Z');

  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  const createPendingPayment = (ref?: string): Payment => {
    return Payment.createPending(
      {
        id: 'pay_test_001',
        tenantId,
        saleId,
        method: PaymentMethod.QR,
        amount,
        reference: ref ?? 'QR_INIT_REF_123',
      },
      clock,
    );
  };

  // ===========================================================================
  // 1. Critical Rule: Status Boundary & Immutability Protection
  // ===========================================================================
  describe('1. Critical Rule: Status Boundary & Direct Mutation Prohibition', () => {
    it('protects status with a read-only getter and no public setter', () => {
      const payment = createPendingPayment();

      expect(payment.status).toBe(PaymentStatus.PENDING);

      // Attempting runtime property assignment on the getter throws TypeError in strict mode
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payment as any).status = PaymentStatus.COMPLETED;
      }).toThrow(TypeError);

      // Verify status is completely unchanged
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it('prevents direct mutation of private fields via external tampering', () => {
      const payment = createPendingPayment();
      expect(payment.status).toBe(PaymentStatus.PENDING);

      const statusDescriptor = Object.getOwnPropertyDescriptor(Payment.prototype, 'status');
      expect(statusDescriptor?.get).toBeDefined();
      expect(statusDescriptor?.set).toBeUndefined(); // Strict encapsulation: No setter defined on prototype
    });
  });

  // ===========================================================================
  // 2. Completion: PENDING → COMPLETED
  // ===========================================================================
  describe('2. Completion Lifecycle Transition: PENDING → COMPLETED', () => {
    it('transitions PENDING to COMPLETED with valid paidAt, incremented version, and domain event', () => {
      const payment = createPendingPayment('INIT_REF_999');

      clock.advanceSeconds(45);
      const paidTime = clock.now();

      payment.complete(clock);

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.isCompleted()).toBe(true);
      expect(payment.isSettled()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.isFailed()).toBe(false);
      expect(payment.isCancelled()).toBe(false);

      expect(payment.paidAt).toEqual(paidTime);
      expect(payment.updatedAt).toEqual(paidTime);
      expect(payment.createdAt).toEqual(t0);
      expect(payment.version).toBe(2);

      // Unrelated fields preserved
      expect(payment.id.value).toBe('pay_test_001');
      expect(payment.tenantId).toBe(tenantId);
      expect(payment.saleId.equals(saleId)).toBe(true);
      expect(payment.method).toBe(PaymentMethod.QR);
      expect(payment.amount.amount).toBe(250.75);
      expect(payment.reference?.value).toBe('INIT_REF_999');

      // Domain event emission
      const events = payment.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event).toBeInstanceOf(PaymentSettledEvent);
      expect(event).toBeInstanceOf(PaymentCompletedEvent);
      expect(event.aggregateId).toBe('pay_test_001');
      expect(event.aggregateVersion).toBe(2);
      expect(event.occurredAt).toEqual(paidTime);

      const payload = (event as PaymentSettledEvent).payload;
      expect(payload.paymentId).toBe('pay_test_001');
      expect(payload.saleId).toBe(saleId.value);
      expect(payload.tenantId).toBe(tenantId);
      expect(payload.method).toBe(PaymentMethod.QR);
      expect(payload.amount).toBe(250.75);
      expect(payload.cents).toBe(25075);
      expect(payload.currency).toBe('USD');
      expect(payload.reference).toBe('INIT_REF_999');
      expect(payload.paidAt).toEqual(paidTime);
    });

    it('updates payment reference upon completion when explicitly provided in options', () => {
      const payment = createPendingPayment('INITIAL_CODE');

      clock.advanceSeconds(60);
      payment.complete({
        reference: 'BANK_TRACE_TXN_77492',
        clock,
      });

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.reference?.value).toBe('BANK_TRACE_TXN_77492');

      const event = payment.getUncommittedEvents()[0] as PaymentSettledEvent;
      expect(event.payload.reference).toBe('BANK_TRACE_TXN_77492');
    });

    it('accepts explicit valid paidAt timestamp >= createdAt in options', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(120);
      const explicitPaidAt = new Date('2026-09-23T10:01:30.000Z');

      payment.complete({
        paidAt: explicitPaidAt,
        clock,
      });

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toEqual(explicitPaidAt);
      expect(payment.updatedAt).toEqual(clock.now()); // updatedAt matches execution clock
    });

    it('rejects explicit paidAt that is earlier than createdAt', () => {
      const payment = createPendingPayment();

      const earlierDate = new Date(t0.getTime() - 1000); // 1 second before createdAt

      expect(() => {
        payment.complete({
          paidAt: earlierDate,
          clock,
        });
      }).toThrow(PaymentDomainException);

      expect(() => {
        payment.complete({
          paidAt: earlierDate,
          clock,
        });
      }).toThrow(/earlier than createdAt/i);

      // Verify aggregate remains atomic and completely untouched
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(1);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('rejects invalid NaN Date passed as explicit paidAt', () => {
      const payment = createPendingPayment();

      expect(() => {
        payment.complete({
          paidAt: new Date('invalid-date-string'),
          clock,
        });
      }).toThrow(PaymentDomainException);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(1);
    });
  });

  // ===========================================================================
  // 3. Failure: PENDING → FAILED
  // ===========================================================================
  describe('3. Failure Lifecycle Transition: PENDING → FAILED', () => {
    it('transitions PENDING to FAILED, preserving amount, saleId, keeping paidAt null, and emitting event', () => {
      const payment = createPendingPayment('FAIL_REF_111');

      clock.advanceSeconds(30);
      const failTime = clock.now();

      payment.fail('Card declined by issuing bank (insufficient funds)', clock);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.isFailed()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.isCompleted()).toBe(false);
      expect(payment.isSettled()).toBe(false);
      expect(payment.isCancelled()).toBe(false);

      // paidAt policy: must strictly remain null
      expect(payment.paidAt).toBeNull();
      expect(payment.updatedAt).toEqual(failTime);
      expect(payment.createdAt).toEqual(t0);
      expect(payment.version).toBe(2);

      // Preserves amount and sale association
      expect(payment.amount.amount).toBe(250.75);
      expect(payment.amount.cents).toBe(25075);
      expect(payment.amount.currency).toBe('USD');
      expect(payment.saleId.equals(saleId)).toBe(true);

      // Preserves all unrelated properties
      expect(payment.id.value).toBe('pay_test_001');
      expect(payment.tenantId).toBe(tenantId);
      expect(payment.method).toBe(PaymentMethod.QR);
      expect(payment.reference?.value).toBe('FAIL_REF_111');

      // Emits PaymentFailedEvent
      const events = payment.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as PaymentFailedEvent;
      expect(event).toBeInstanceOf(PaymentFailedEvent);
      expect(event.aggregateId).toBe('pay_test_001');
      expect(event.aggregateVersion).toBe(2);
      expect(event.occurredAt).toEqual(failTime);
      expect(event.payload.reason).toBe('Card declined by issuing bank (insufficient funds)');
      expect(event.payload.amount).toBe(250.75);
      expect(event.payload.cents).toBe(25075);
      expect(event.payload.currency).toBe('USD');
      expect(event.payload.saleId).toBe(saleId.value);
      expect(event.payload.tenantId).toBe(tenantId);
    });

    it('supports fail() with FailPaymentOptions object', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(10);
      payment.fail({
        reason: 'Payment session timeout',
        clock,
      });

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
      const event = payment.getUncommittedEvents()[0] as PaymentFailedEvent;
      expect(event.payload.reason).toBe('Payment session timeout');
    });

    it('supports fail() with Clock directly without reason', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(15);
      payment.fail(clock);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
      const event = payment.getUncommittedEvents()[0] as PaymentFailedEvent;
      expect(event.payload.reason).toBeUndefined();
    });

    it('supports fail() alias markAsFailed()', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(20);
      payment.markAsFailed('Gateway error', clock);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.version).toBe(2);
    });
  });

  // ===========================================================================
  // 4. Cancellation: PENDING → CANCELLED
  // ===========================================================================
  describe('4. Cancellation Lifecycle Transition: PENDING → CANCELLED', () => {
    it('transitions PENDING to CANCELLED, preserving financial data and sale association', () => {
      const payment = createPendingPayment('CANCEL_REF_222');

      clock.advanceSeconds(15);
      const cancelTime = clock.now();

      payment.cancel('Customer opted to tender cash instead', clock);

      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.isCancelled()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.isCompleted()).toBe(false);
      expect(payment.isSettled()).toBe(false);
      expect(payment.isFailed()).toBe(false);

      // paidAt policy: must strictly remain null
      expect(payment.paidAt).toBeNull();
      expect(payment.updatedAt).toEqual(cancelTime);
      expect(payment.createdAt).toEqual(t0);
      expect(payment.version).toBe(2);

      // Preserves financial data and sale association
      expect(payment.amount.amount).toBe(250.75);
      expect(payment.amount.cents).toBe(25075);
      expect(payment.amount.currency).toBe('USD');
      expect(payment.method).toBe(PaymentMethod.QR);
      expect(payment.reference?.value).toBe('CANCEL_REF_222');
      expect(payment.saleId.equals(saleId)).toBe(true);
      expect(payment.tenantId).toBe(tenantId);

      // Emits PaymentCancelledEvent
      const events = payment.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as PaymentCancelledEvent;
      expect(event).toBeInstanceOf(PaymentCancelledEvent);
      expect(event.aggregateId).toBe('pay_test_001');
      expect(event.aggregateVersion).toBe(2);
      expect(event.occurredAt).toEqual(cancelTime);
      expect(event.payload.reason).toBe('Customer opted to tender cash instead');
      expect(event.payload.amount).toBe(250.75);
      expect(event.payload.saleId).toBe(saleId.value);
    });

    it('supports cancel() with CancelPaymentOptions object', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(5);
      payment.cancel({
        reason: 'Cashier aborted prompt',
        clock,
      });

      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
      const event = payment.getUncommittedEvents()[0] as PaymentCancelledEvent;
      expect(event.payload.reason).toBe('Cashier aborted prompt');
    });

    it('supports cancel() with Clock directly without reason', () => {
      const payment = createPendingPayment();

      clock.advanceSeconds(8);
      payment.cancel(clock);

      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
      const event = payment.getUncommittedEvents()[0] as PaymentCancelledEvent;
      expect(event.payload.reason).toBeUndefined();
    });
  });

  // ===========================================================================
  // 5. Terminal States Policy: COMPLETED, FAILED, CANCELLED
  // ===========================================================================
  describe('5. Terminal States Enforcement', () => {
    describe('5.1 Terminal COMPLETED (SETTLED) State', () => {
      let completedPayment: Payment;

      beforeEach(() => {
        completedPayment = createPendingPayment();
        completedPayment.complete(clock);
        completedPayment.clearEvents();
      });

      it('prevents COMPLETED → COMPLETED (repeated complete/settle)', () => {
        expect(() => completedPayment.complete(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => completedPayment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => completedPayment.markAsPaid(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => completedPayment.pay(clock)).toThrow(InvalidPaymentTransitionException);
      });

      it('prevents COMPLETED → FAILED', () => {
        expect(() => completedPayment.fail('declined', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => completedPayment.markAsFailed('declined', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('prevents COMPLETED → CANCELLED', () => {
        expect(() => completedPayment.cancel('void requested', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('returns empty array for getAllowedTransitions() when COMPLETED', () => {
        expect(completedPayment.getAllowedTransitions()).toEqual([]);
        expect(completedPayment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
        expect(completedPayment.canTransitionTo(PaymentStatus.FAILED)).toBe(false);
        expect(completedPayment.canTransitionTo(PaymentStatus.CANCELLED)).toBe(false);
        expect(completedPayment.canTransitionTo(PaymentStatus.PENDING)).toBe(false);
      });
    });

    describe('5.2 Terminal FAILED State', () => {
      let failedPayment: Payment;

      beforeEach(() => {
        failedPayment = createPendingPayment();
        failedPayment.fail('insufficient funds', clock);
        failedPayment.clearEvents();
      });

      it('prevents FAILED → COMPLETED', () => {
        expect(() => failedPayment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      });

      it('prevents FAILED → FAILED (repeated fail)', () => {
        expect(() => failedPayment.fail('second error', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('prevents FAILED → CANCELLED', () => {
        expect(() => failedPayment.cancel('cancel failed payment', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('returns empty array for getAllowedTransitions() when FAILED', () => {
        expect(failedPayment.getAllowedTransitions()).toEqual([]);
        expect(failedPayment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
        expect(failedPayment.canTransitionTo(PaymentStatus.FAILED)).toBe(false);
        expect(failedPayment.canTransitionTo(PaymentStatus.CANCELLED)).toBe(false);
        expect(failedPayment.canTransitionTo(PaymentStatus.PENDING)).toBe(false);
      });
    });

    describe('5.3 Terminal CANCELLED State', () => {
      let cancelledPayment: Payment;

      beforeEach(() => {
        cancelledPayment = createPendingPayment();
        cancelledPayment.cancel('cashier abort', clock);
        cancelledPayment.clearEvents();
      });

      it('prevents CANCELLED → COMPLETED', () => {
        expect(() => cancelledPayment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      });

      it('prevents CANCELLED → FAILED', () => {
        expect(() => cancelledPayment.fail('fail cancelled payment', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('prevents CANCELLED → CANCELLED (repeated cancel)', () => {
        expect(() => cancelledPayment.cancel('second cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('returns empty array for getAllowedTransitions() when CANCELLED', () => {
        expect(cancelledPayment.getAllowedTransitions()).toEqual([]);
        expect(cancelledPayment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
        expect(cancelledPayment.canTransitionTo(PaymentStatus.FAILED)).toBe(false);
        expect(cancelledPayment.canTransitionTo(PaymentStatus.CANCELLED)).toBe(false);
        expect(cancelledPayment.canTransitionTo(PaymentStatus.PENDING)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 6. Repeated Commands & Idempotency Policy
  // ===========================================================================
  describe('6. Repeated Commands & Idempotency Policy', () => {
    it('repeated complete() throws InvalidPaymentTransitionException and does not record duplicate events', () => {
      const payment = createPendingPayment();
      payment.complete(clock);
      expect(payment.version).toBe(2);
      expect(payment.getUncommittedEvents()).toHaveLength(1);

      // Second complete command
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);

      // State remains unchanged and no new event added
      expect(payment.version).toBe(2);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.getUncommittedEvents()).toHaveLength(1);
    });

    it('repeated fail() throws InvalidPaymentTransitionException and does not record duplicate events', () => {
      const payment = createPendingPayment();
      payment.fail('initial decline', clock);
      expect(payment.version).toBe(2);
      expect(payment.getUncommittedEvents()).toHaveLength(1);

      // Second fail command
      expect(() => payment.fail('second decline', clock)).toThrow(
        InvalidPaymentTransitionException,
      );

      expect(payment.version).toBe(2);
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.getUncommittedEvents()).toHaveLength(1);
    });

    it('repeated cancel() throws InvalidPaymentTransitionException and does not record duplicate events', () => {
      const payment = createPendingPayment();
      payment.cancel('initial abort', clock);
      expect(payment.version).toBe(2);
      expect(payment.getUncommittedEvents()).toHaveLength(1);

      // Second cancel command
      expect(() => payment.cancel('second abort', clock)).toThrow(
        InvalidPaymentTransitionException,
      );

      expect(payment.version).toBe(2);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.getUncommittedEvents()).toHaveLength(1);
    });
  });

  // ===========================================================================
  // 7. Atomic Domain Mutation: Zero Partial Mutation on Failure
  // ===========================================================================
  describe('7. Atomic Domain Mutation Guarantee', () => {
    it('failed transition from terminal state does not mutate any fields or append events', () => {
      const payment = createPendingPayment('ORIG_REF');
      payment.complete(clock);
      const originalPaidAt = payment.paidAt!;
      const originalUpdatedAt = payment.updatedAt;
      payment.clearEvents();

      // Prohibited transition attempt
      clock.advanceSeconds(100);
      try {
        payment.fail('Late fail attempt', clock);
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidPaymentTransitionException);
      }

      // Assert zero partial mutation
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toEqual(originalPaidAt);
      expect(payment.updatedAt).toEqual(originalUpdatedAt);
      expect(payment.reference?.value).toBe('ORIG_REF');
      expect(payment.amount.amount).toBe(250.75);
      expect(payment.createdAt).toEqual(t0);
      expect(payment.version).toBe(2);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('failed validation in complete() due to invalid paidAt sequence leaves all fields untouched', () => {
      const payment = createPendingPayment('ORIG_REF');
      const originalUpdatedAt = payment.updatedAt;

      const badDate = new Date(t0.getTime() - 5000);
      expect(() => {
        payment.complete({
          reference: 'SHOULD_NOT_BE_SET',
          paidAt: badDate,
          clock,
        });
      }).toThrow(PaymentDomainException);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();
      expect(payment.reference?.value).toBe('ORIG_REF'); // Not mutated to SHOULD_NOT_BE_SET
      expect(payment.updatedAt).toEqual(originalUpdatedAt);
      expect(payment.version).toBe(1);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('failed validation in complete() due to invalid reference format leaves all fields untouched', () => {
      const payment = createPendingPayment('ORIG_REF');
      const originalUpdatedAt = payment.updatedAt;

      expect(() => {
        payment.complete({
          reference: '   ', // empty whitespace reference is invalid
          clock,
        });
      }).toThrow(PaymentDomainException);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();
      expect(payment.reference?.value).toBe('ORIG_REF');
      expect(payment.updatedAt).toEqual(originalUpdatedAt);
      expect(payment.version).toBe(1);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 8. Timestamps, Time Injection & Defensive Copies
  // ===========================================================================
  describe('8. Timestamps, Time Injection & Defensive Copies', () => {
    it('uses injected Clock deterministically for all lifecycle milestones', () => {
      const payment = createPendingPayment();
      expect(payment.createdAt).toEqual(t0);
      expect(payment.updatedAt).toEqual(t0);

      clock.advanceSeconds(300);
      const step1Time = clock.now();
      payment.complete(clock);

      expect(payment.paidAt).toEqual(step1Time);
      expect(payment.updatedAt).toEqual(step1Time);
      expect(payment.createdAt).toEqual(t0);
    });

    it('returns defensive copies of Date objects from getters to prevent in-place mutation', () => {
      const payment = createPendingPayment();
      payment.complete(clock);

      const paidAtCopy = payment.paidAt!;
      const createdAtCopy = payment.createdAt;
      const updatedAtCopy = payment.updatedAt;

      // Tamper with the returned Date copies
      paidAtCopy.setFullYear(1990);
      createdAtCopy.setFullYear(1990);
      updatedAtCopy.setFullYear(1990);

      // Verify internal state in payment is not corrupted
      expect(payment.paidAt?.getFullYear()).toBe(2026);
      expect(payment.createdAt.getFullYear()).toBe(2026);
      expect(payment.updatedAt.getFullYear()).toBe(2026);
    });
  });
});
