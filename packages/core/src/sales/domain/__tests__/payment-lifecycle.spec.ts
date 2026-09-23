import { Payment } from '../payment.aggregate';
import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PAYMENT_TRANSITION_MATRIX,
  canTransitionPaymentStatus,
  isTerminalPaymentStatus,
  getAllowedPaymentTransitions,
  getProhibitedPaymentTransitions,
} from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentId } from '../value-objects/payment-id.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { InvalidPaymentTransitionException } from '../exceptions/invalid-payment-transition.exception';
import { InvalidPaymentReferenceException } from '../exceptions/invalid-payment-reference.exception';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';
import { PaymentSettledEvent, PaymentFailedEvent, PaymentCancelledEvent } from '../events';
import { DeterministicClock } from '../shared/clock';

describe('Payment Lifecycle State Machine & Transition Matrix (ADR-0115 / ADR-0109)', () => {
  const tenantId = 'tenant_kinergy_001';
  const saleId = SaleId.create('sale_pos_789');
  const amount = Money.create(150.0, 'USD');
  const t0 = new Date('2026-09-21T10:00:00.000Z');

  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
  });

  // ===========================================================================
  // 1. Transition Matrix Definition & Declarative Rules
  // ===========================================================================
  describe('1. State Transition Matrix Specification', () => {
    it('defines exactly 16 discrete transition cells covering the 4x4 matrix', () => {
      expect(PAYMENT_TRANSITION_MATRIX).toHaveLength(16);

      for (const from of SUPPORTED_PAYMENT_STATUSES) {
        for (const to of SUPPORTED_PAYMENT_STATUSES) {
          const rule = PAYMENT_TRANSITION_MATRIX.find((r) => r.from === from && r.to === to);
          expect(rule).toBeDefined();
          expect(rule?.allowed).toBe(canTransitionPaymentStatus(from, to));
        }
      }
    });

    it('identifies terminal states correctly', () => {
      expect(isTerminalPaymentStatus(PaymentStatus.PENDING)).toBe(false);
      expect(isTerminalPaymentStatus(PaymentStatus.COMPLETED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.FAILED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.CANCELLED)).toBe(true);
    });

    it('returns allowed transitions matching the ADR specification', () => {
      expect(getAllowedPaymentTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(getAllowedPaymentTransitions(PaymentStatus.COMPLETED)).toEqual([]);
      expect(getAllowedPaymentTransitions(PaymentStatus.FAILED)).toEqual([]);
      expect(getAllowedPaymentTransitions(PaymentStatus.CANCELLED)).toEqual([]);
    });

    it('returns prohibited transitions matching the ADR specification', () => {
      expect(getProhibitedPaymentTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.PENDING,
      ]);
      expect(getProhibitedPaymentTransitions(PaymentStatus.COMPLETED)).toEqual([
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(getProhibitedPaymentTransitions(PaymentStatus.FAILED)).toEqual([
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(getProhibitedPaymentTransitions(PaymentStatus.CANCELLED)).toEqual([
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
    });
  });

  // ===========================================================================
  // 2. Initial State Instantiation
  // ===========================================================================
  describe('2. Initial State Instantiation', () => {
    it('creates an immediately settled payment with populated paidAt and event', () => {
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount,
          reference: 'DRAWER-1',
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.isSettled()).toBe(true);
      expect(payment.isCompleted()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.isFailed()).toBe(false);
      expect(payment.isCancelled()).toBe(false);
      expect(payment.paidAt).toEqual(t0);
      expect(payment.createdAt).toEqual(t0);
      expect(payment.updatedAt).toEqual(t0);
      expect(payment.version).toBe(1);

      const events = payment.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentSettledEvent);
      const settledEvent = events[0] as PaymentSettledEvent;
      expect(settledEvent.payload.paidAt).toEqual(t0);
      expect(settledEvent.payload.amount).toBe(150.0);
      expect(settledEvent.payload.reference).toBe('DRAWER-1');
    });

    it('creates a pending payment with null paidAt and no settlement event', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
          reference: 'QR-PROMPT-001',
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.isPending()).toBe(true);
      expect(payment.isSettled()).toBe(false);
      expect(payment.paidAt).toBeNull();
      expect(payment.createdAt).toEqual(t0);
      expect(payment.updatedAt).toEqual(t0);
      expect(payment.version).toBe(1);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 3. Allowed Transitions from PENDING
  // ===========================================================================
  describe('3. Allowed Lifecycle Transitions from PENDING', () => {
    describe('PENDING -> SETTLED', () => {
      it('settles via settle(clock), updating timestamps, version, and emitting event', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(15);
        const settlementTime = clock.now();

        payment.settle(clock);

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.isSettled()).toBe(true);
        expect(payment.isCompleted()).toBe(true);
        expect(payment.paidAt).toEqual(settlementTime);
        expect(payment.updatedAt).toEqual(settlementTime);
        expect(payment.createdAt).toEqual(t0);
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentSettledEvent);
        const settledEvent = events[0] as PaymentSettledEvent;
        expect(settledEvent.payload.paymentId).toBe(payment.id.value);
        expect(settledEvent.payload.paidAt).toEqual(settlementTime);
        expect(settledEvent.aggregateVersion).toBe(2);
      });

      it('settles via markAsPaid(clock) alias identically to settle()', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(20);
        payment.markAsPaid(clock);

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.paidAt).toEqual(new Date('2026-09-21T10:00:20.000Z'));
        expect(payment.version).toBe(2);
      });

      it('settles via pay(clock) domain command alias identically to settle()', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(25);
        payment.pay(clock);

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.paidAt).toEqual(new Date('2026-09-21T10:00:25.000Z'));
        expect(payment.version).toBe(2);
      });

      it('attaches a gateway reference upon settlement via SettlePaymentOptions', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(payment.reference).toBeNull();

        clock.advanceSeconds(30);
        payment.settle({
          reference: 'GW-CONFIRM-TRACE-7788',
          clock,
        });

        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.reference?.value).toBe('GW-CONFIRM-TRACE-7788');

        const event = payment.getUncommittedEvents()[0] as PaymentSettledEvent;
        expect(event.payload.reference).toBe('GW-CONFIRM-TRACE-7788');
      });

      it('accepts explicit valid paidAt timestamp >= createdAt', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceMinutes(5);
        const explicitPaidAt = new Date('2026-09-21T10:02:00.000Z');

        payment.settle({
          paidAt: explicitPaidAt,
          clock,
        });

        expect(payment.paidAt).toEqual(explicitPaidAt);
        expect(payment.updatedAt).toEqual(clock.now());
      });

      it('rejects explicit paidAt earlier than createdAt', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        const invalidEarlierPaidAt = new Date('2026-09-21T09:59:59.000Z');

        expect(() =>
          payment.settle({
            paidAt: invalidEarlierPaidAt,
            clock,
          }),
        ).toThrow(PaymentDomainException);

        // Aggregate remains untouched
        expect(payment.status).toBe(PaymentStatus.PENDING);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(1);
      });

      it('rejects invalid Date instance for explicit paidAt', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(() =>
          payment.settle({
            paidAt: new Date('invalid-date'),
            clock,
          }),
        ).toThrow(PaymentDomainException);

        expect(payment.status).toBe(PaymentStatus.PENDING);
      });

      it('validates sanitized reference string on settlement and rejects card PAN numbers', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(() =>
          payment.settle({
            reference: '4111 1111 1111 1111',
            clock,
          }),
        ).toThrow(InvalidPaymentReferenceException);

        expect(payment.status).toBe(PaymentStatus.PENDING);
        expect(payment.reference).toBeNull();
      });
    });

    describe('PENDING -> FAILED', () => {
      it('fails via fail(reason, clock), leaving paidAt null and emitting PaymentFailedEvent', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(45);
        const failTime = clock.now();

        payment.fail('QR session expired', clock);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        expect(payment.isFailed()).toBe(true);
        expect(payment.paidAt).toBeNull();
        expect(payment.updatedAt).toEqual(failTime);
        expect(payment.createdAt).toEqual(t0);
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentFailedEvent);
        const failedEvent = events[0] as PaymentFailedEvent;
        expect(failedEvent.payload.reason).toBe('QR session expired');
        expect(failedEvent.aggregateVersion).toBe(2);
      });

      it('fails via markAsFailed alias identically', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(10);
        payment.markAsFailed('Declined by issuer', clock);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        expect(payment.paidAt).toBeNull();
        expect(payment.version).toBe(2);
      });

      it('accepts clock as sole argument when reason is omitted', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(5);
        payment.fail(clock);

        expect(payment.status).toBe(PaymentStatus.FAILED);
        const failedEvent = payment.getUncommittedEvents()[0] as PaymentFailedEvent;
        expect(failedEvent.payload.reason).toBeUndefined();
      });
    });

    describe('PENDING -> CANCELLED', () => {
      it('cancels via cancel(reason, clock), leaving paidAt null and emitting PaymentCancelledEvent', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(60);
        const cancelTime = clock.now();

        payment.cancel('Customer chose to pay cash instead', clock);

        expect(payment.status).toBe(PaymentStatus.CANCELLED);
        expect(payment.isCancelled()).toBe(true);
        expect(payment.paidAt).toBeNull();
        expect(payment.updatedAt).toEqual(cancelTime);
        expect(payment.createdAt).toEqual(t0);
        expect(payment.version).toBe(2);

        const events = payment.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(PaymentCancelledEvent);
        const cancelledEvent = events[0] as PaymentCancelledEvent;
        expect(cancelledEvent.payload.reason).toBe('Customer chose to pay cash instead');
        expect(cancelledEvent.aggregateVersion).toBe(2);
      });

      it('accepts clock as sole argument when reason is omitted', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        clock.advanceSeconds(8);
        payment.cancel(clock);

        expect(payment.status).toBe(PaymentStatus.CANCELLED);
        const cancelledEvent = payment.getUncommittedEvents()[0] as PaymentCancelledEvent;
        expect(cancelledEvent.payload.reason).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // 4. Prohibited Transitions (Complete Matrix Exhaustive Enforcement)
  // ===========================================================================
  describe('4. Complete Prohibited Transition Matrix Enforcement', () => {
    describe('Prohibitions from PENDING', () => {
      it('prohibits PENDING -> PENDING (cannot re-enter pending)', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PENDING)).toBe(
          false,
        );
        expect(payment.isPending()).toBe(true);
      });
    });

    describe('Prohibitions from SETTLED (Terminal & Write-Once Immutability)', () => {
      let settledPayment: Payment;

      beforeEach(() => {
        settledPayment = Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount,
            reference: 'ORIGINAL-REF',
          },
          clock,
        );
        settledPayment.clearEvents();
      });

      it('prohibits COMPLETED -> PENDING', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.COMPLETED, PaymentStatus.PENDING)).toBe(
          false,
        );
      });

      it('prohibits COMPLETED -> COMPLETED (cannot re-settle settled payment)', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.COMPLETED, PaymentStatus.COMPLETED)).toBe(
          false,
        );

        expect(() => settledPayment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => settledPayment.settle(clock)).toThrow(/permanently immutable/i);

        // Verify aggregate remains untouched
        expect(settledPayment.status).toBe(PaymentStatus.COMPLETED);
        expect(settledPayment.version).toBe(1);
        expect(settledPayment.paidAt).toEqual(t0);
        expect(settledPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits COMPLETED -> FAILED (settled payments cannot fail)', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.COMPLETED, PaymentStatus.FAILED)).toBe(
          false,
        );

        expect(() => settledPayment.fail('declined retroactively', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => settledPayment.fail('declined retroactively', clock)).toThrow(
          /permanently immutable/i,
        );

        // Verify aggregate remains untouched
        expect(settledPayment.status).toBe(PaymentStatus.COMPLETED);
        expect(settledPayment.version).toBe(1);
        expect(settledPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits COMPLETED -> CANCELLED (settled payments cannot be cancelled; requires refund)', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.COMPLETED, PaymentStatus.CANCELLED)).toBe(
          false,
        );

        expect(() => settledPayment.cancel('void after settlement', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => settledPayment.cancel('void after settlement', clock)).toThrow(
          /permanently immutable/i,
        );

        // Verify aggregate remains untouched
        expect(settledPayment.status).toBe(PaymentStatus.COMPLETED);
        expect(settledPayment.version).toBe(1);
        expect(settledPayment.getUncommittedEvents()).toHaveLength(0);
      });
    });

    describe('Prohibitions from FAILED (Terminal State)', () => {
      let failedPayment: Payment;

      beforeEach(() => {
        failedPayment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );
        failedPayment.fail('Initial decline', clock);
        failedPayment.clearEvents();
      });

      it('prohibits FAILED -> PENDING', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.PENDING)).toBe(false);
      });

      it('prohibits FAILED -> COMPLETED', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.COMPLETED)).toBe(
          false,
        );

        expect(() => failedPayment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => failedPayment.settle(clock)).toThrow(
          /Cannot settle a payment that is FAILED/i,
        );

        expect(failedPayment.status).toBe(PaymentStatus.FAILED);
        expect(failedPayment.paidAt).toBeNull();
        expect(failedPayment.version).toBe(2);
        expect(failedPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits FAILED -> FAILED (cannot re-fail)', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.FAILED)).toBe(false);

        expect(() => failedPayment.fail('Second fail', clock)).toThrow(
          InvalidPaymentTransitionException,
        );

        expect(failedPayment.status).toBe(PaymentStatus.FAILED);
        expect(failedPayment.version).toBe(2);
        expect(failedPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits FAILED -> CANCELLED', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.FAILED, PaymentStatus.CANCELLED)).toBe(
          false,
        );

        expect(() => failedPayment.cancel('Cancel a failed payment', clock)).toThrow(
          InvalidPaymentTransitionException,
        );

        expect(failedPayment.status).toBe(PaymentStatus.FAILED);
        expect(failedPayment.version).toBe(2);
        expect(failedPayment.getUncommittedEvents()).toHaveLength(0);
      });
    });

    describe('Prohibitions from CANCELLED (Terminal State)', () => {
      let cancelledPayment: Payment;

      beforeEach(() => {
        cancelledPayment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );
        cancelledPayment.cancel('Initial cancel', clock);
        cancelledPayment.clearEvents();
      });

      it('prohibits CANCELLED -> PENDING', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, PaymentStatus.PENDING)).toBe(
          false,
        );
      });

      it('prohibits CANCELLED -> COMPLETED', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, PaymentStatus.COMPLETED)).toBe(
          false,
        );

        expect(() => cancelledPayment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => cancelledPayment.settle(clock)).toThrow(
          /Cannot settle a payment that is CANCELLED/i,
        );

        expect(cancelledPayment.status).toBe(PaymentStatus.CANCELLED);
        expect(cancelledPayment.paidAt).toBeNull();
        expect(cancelledPayment.version).toBe(2);
        expect(cancelledPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits CANCELLED -> FAILED', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, PaymentStatus.FAILED)).toBe(
          false,
        );

        expect(() => cancelledPayment.fail('Fail cancelled', clock)).toThrow(
          InvalidPaymentTransitionException,
        );

        expect(cancelledPayment.status).toBe(PaymentStatus.CANCELLED);
        expect(cancelledPayment.version).toBe(2);
        expect(cancelledPayment.getUncommittedEvents()).toHaveLength(0);
      });

      it('prohibits CANCELLED -> CANCELLED (cannot re-cancel)', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, PaymentStatus.CANCELLED)).toBe(
          false,
        );

        expect(() => cancelledPayment.cancel('Second cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );

        expect(cancelledPayment.status).toBe(PaymentStatus.CANCELLED);
        expect(cancelledPayment.version).toBe(2);
        expect(cancelledPayment.getUncommittedEvents()).toHaveLength(0);
      });
    });
  });

  // ===========================================================================
  // 5. Invariant Protections: Timestamps, Reference & Purity
  // ===========================================================================
  describe('5. Invariant Protections Across Lifecycle', () => {
    it('guarantees createdAt permanently retains its initial value across all transitions', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
        },
        clock,
      );

      const initialCreatedAt = payment.createdAt;
      expect(initialCreatedAt).toEqual(t0);

      clock.advanceMinutes(10);
      payment.settle(clock);

      expect(payment.createdAt).toEqual(t0);
      expect(payment.updatedAt).toEqual(clock.now());
      expect(payment.paidAt).toEqual(clock.now());
    });

    it('defends internal timestamps against external in-place mutation', () => {
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount,
        },
        clock,
      );

      // Attempt to mutate through getter returns
      const createdAtCopy = payment.createdAt;
      createdAtCopy.setFullYear(2000);
      expect(payment.createdAt.getFullYear()).toBe(2026);

      const paidAtCopy = payment.paidAt!;
      paidAtCopy.setFullYear(2000);
      expect(payment.paidAt?.getFullYear()).toBe(2026);

      const updatedAtCopy = payment.updatedAt;
      updatedAtCopy.setFullYear(2000);
      expect(payment.updatedAt.getFullYear()).toBe(2026);
    });

    it('rejects reconstituting contradictory states (SETTLED with null paidAt)', () => {
      expect(() =>
        Payment.reconstitute({
          id: PaymentId.create('pay_invalid_1'),
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount,
          status: PaymentStatus.COMPLETED,
          reference: null,
          paidAt: null, // Contradictory: SETTLED must have paidAt
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);
    });

    it('rejects reconstituting contradictory states (PENDING with non-null paidAt)', () => {
      expect(() =>
        Payment.reconstitute({
          id: PaymentId.create('pay_invalid_2'),
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: t0, // Contradictory: PENDING must have paidAt = null
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);
    });

    it('rejects reconstituting contradictory states (FAILED with non-null paidAt)', () => {
      expect(() =>
        Payment.reconstitute({
          id: PaymentId.create('pay_invalid_3'),
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
          status: PaymentStatus.FAILED,
          reference: null,
          paidAt: t0, // Contradictory: FAILED must have paidAt = null
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);
    });

    it('rejects reconstituting contradictory states (CANCELLED with non-null paidAt)', () => {
      expect(() =>
        Payment.reconstitute({
          id: PaymentId.create('pay_invalid_4'),
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
          status: PaymentStatus.CANCELLED,
          reference: null,
          paidAt: t0, // Contradictory: CANCELLED must have paidAt = null
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);
    });

    it('rejects reconstituting inverted timestamps (updatedAt earlier than createdAt)', () => {
      const earlier = new Date('2026-09-21T09:00:00.000Z');
      expect(() =>
        Payment.reconstitute({
          id: PaymentId.create('pay_invalid_5'),
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount,
          status: PaymentStatus.COMPLETED,
          reference: null,
          paidAt: t0,
          createdAt: t0,
          updatedAt: earlier, // Earlier than createdAt
          version: 1,
        }),
      ).toThrow(PaymentDomainException);
    });
  });
});
