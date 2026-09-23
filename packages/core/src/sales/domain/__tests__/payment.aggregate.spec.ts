import { Payment } from '../payment.aggregate';
import { PaymentId } from '../value-objects/payment-id.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { PaymentReference } from '../value-objects/payment-reference.vo';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';
import { InvalidPaymentMethodException } from '../exceptions/invalid-payment-method.exception';
import { InvalidPaymentTransitionException } from '../exceptions/invalid-payment-transition.exception';
import { InvalidPaymentReferenceException } from '../exceptions/invalid-payment-reference.exception';
import { Clock } from '../shared/clock';

class TestClock implements Clock {
  constructor(private _now: Date) {}

  public now(): Date {
    return new Date(this._now.getTime());
  }

  public advance(ms: number): void {
    this._now = new Date(this._now.getTime() + ms);
  }
}

describe('Payment Aggregate Root (Milestone 7.5)', () => {
  const t0 = new Date('2026-09-19T10:00:00.000Z');
  let clock: TestClock;
  const tenantId = 'tenant_kinergy_prime';
  const saleId = SaleId.create('sale_01j9876543210abcdef');

  beforeEach(() => {
    clock = new TestClock(t0);
  });

  // ===========================================================================
  // 1. Creation & Factory Methods
  // ===========================================================================
  describe('1. Factory Methods & Initial State', () => {
    describe('Payment.createSettled()', () => {
      it('creates a SETTLED Cash payment with populated paidAt and exact Money VO reuse', () => {
        const amount = Money.create(50.0, { currency: 'USD' });
        const payment = Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount,
            reference: 'DRAWER-1-RCPT-500',
          },
          clock,
        );

        expect(payment.id).toBeInstanceOf(PaymentId);
        expect(payment.tenantId).toBe(tenantId);
        expect(payment.saleId.equals(saleId)).toBe(true);
        expect(payment.method).toBe(PaymentMethod.CASH);
        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.isCompleted()).toBe(true);
        expect(payment.isSettled()).toBe(true);
        expect(payment.isPending()).toBe(false);

        // Exact Phase 7.4 Money reuse
        expect(payment.amount).toBe(amount);
        expect(payment.amount).toBeInstanceOf(Money);
        expect(payment.amount.cents).toBe(5000);
        expect(payment.amount.currency).toBe('USD');
        expect(payment.amount.amount).toBe(50.0);
        expect(payment.amount.toString()).toBe('50.00 USD');

        // Reference
        expect(payment.reference).toBeInstanceOf(PaymentReference);
        expect(payment.reference?.getValue()).toBe('DRAWER-1-RCPT-500');

        // Timestamps
        expect(payment.paidAt).toEqual(t0);
        expect(payment.createdAt).toEqual(t0);
        expect(payment.updatedAt).toEqual(t0);
        expect(payment.version).toBe(1);
      });

      it('creates a SETTLED QR payment with omitted reference', () => {
        const amount = Money.create(25.5, { currency: 'USD' });
        const payment = Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
          },
          clock,
        );

        expect(payment.method).toBe(PaymentMethod.QR);
        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.reference).toBeNull();
        expect(payment.paidAt).toEqual(t0);
      });
    });

    describe('Payment.createPending()', () => {
      it('creates a PENDING QR payment with null paidAt timestamp', () => {
        const amount = Money.create(99.99, { currency: 'USD' });
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount,
            reference: 'QR_PROMPT_99182',
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
      });
    });
  });

  // ===========================================================================
  // 2. Monetary Invariant Enforcement (Phase 7.4 Money Reuse)
  // ===========================================================================
  describe('2. Monetary Invariants & Money VO Protection', () => {
    it('rejects zero monetary amounts', () => {
      const zero = Money.zero('USD');
      expect(() =>
        Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: zero,
          },
          clock,
        ),
      ).toThrow(PaymentDomainException);

      expect(() =>
        Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: zero,
          },
          clock,
        ),
      ).toThrow(/must be strictly greater than zero/i);
    });

    it('rejects negative monetary amounts', () => {
      const negative = Money.fromCents(-500, 'USD', { allowNegative: true });
      expect(() =>
        Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: negative,
          },
          clock,
        ),
      ).toThrow(PaymentDomainException);
    });

    it('rejects raw primitive numbers passed in place of Money VO', () => {
      expect(() =>
        Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            // @ts-expect-error - Testing runtime protection against primitive numbers
            amount: 50.0,
          },
          clock,
        ),
      ).toThrow(PaymentDomainException);
    });

    it('preserves exact integer minor-unit cents without floating-point error', () => {
      // 19.99 * 3 in float is 59.970000000000006, but Money preserves exact 5997 cents
      const amount = Money.create(19.99).multiply(3);
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount,
        },
        clock,
      );

      expect(payment.amount.cents).toBe(5997);
      expect(payment.amount.amount).toBe(59.97);
    });
  });

  // ===========================================================================
  // 3. Method & Reference Invariants
  // ===========================================================================
  describe('3. Method & Reference Invariants', () => {
    it('rejects future payment methods at runtime when creating Payment', () => {
      const amount = Money.create(100.0);
      for (const futureMethod of ['CARD', 'TRANSFER', 'ONLINE']) {
        expect(() =>
          Payment.createSettled(
            {
              tenantId,
              saleId,
              // @ts-expect-error - Testing runtime rejection of future methods
              method: futureMethod,
              amount,
            },
            clock,
          ),
        ).toThrow(InvalidPaymentMethodException);
      }
    });

    it('rejects empty or whitespace-only reference strings', () => {
      const amount = Money.create(10.0);
      expect(() =>
        Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount,
            reference: '   ',
          },
          clock,
        ),
      ).toThrow(InvalidPaymentReferenceException);
    });

    it('accepts pre-instantiated PaymentReference VO instance', () => {
      const amount = Money.create(10.0);
      const ref = PaymentReference.create('PRE_BUILT_REF');
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount,
          reference: ref,
        },
        clock,
      );

      expect(payment.reference).toBe(ref);
    });
  });

  // ===========================================================================
  // 4. Lifecycle State Machine Transitions
  // ===========================================================================
  describe('4. Lifecycle State Machine Transitions', () => {
    it('transitions PENDING to SETTLED, populating paidAt and incrementing version', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(75.0),
        },
        clock,
      );

      expect(payment.isPending()).toBe(true);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(1);

      // Advance clock by 30 seconds
      clock.advance(30000);
      payment.settle(clock);

      expect(payment.isSettled()).toBe(true);
      expect(payment.isCompleted()).toBe(true);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toEqual(new Date('2026-09-19T10:00:30.000Z'));
      expect(payment.updatedAt).toEqual(new Date('2026-09-19T10:00:30.000Z'));
      expect(payment.version).toBe(2);
    });

    it('transitions PENDING to FAILED, preserving paidAt as null and incrementing version', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(75.0),
        },
        clock,
      );

      clock.advance(5000);
      payment.fail('Rail timeout', clock);

      expect(payment.isFailed()).toBe(true);
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.paidAt).toBeNull();
      expect(payment.updatedAt).toEqual(new Date('2026-09-19T10:00:05.000Z'));
      expect(payment.version).toBe(2);
    });

    it('transitions PENDING to CANCELLED, preserving paidAt as null and incrementing version', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(75.0),
        },
        clock,
      );

      clock.advance(10000);
      payment.cancel('Cashier aborted', clock);

      expect(payment.isCancelled()).toBe(true);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
    });

    describe('Terminal Immutability Protection', () => {
      it('strictly prohibits any transitions from SETTLED state', () => {
        const payment = Payment.createSettled(
          {
            tenantId,
            saleId,
            method: PaymentMethod.CASH,
            amount: Money.create(100.0),
          },
          clock,
        );

        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.settle(clock)).toThrow(/permanently immutable/i);

        expect(() => payment.fail('declined', clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('declined', clock)).toThrow(/permanently immutable/i);

        expect(() => payment.cancel('void', clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.cancel('void', clock)).toThrow(/permanently immutable/i);

        // Aggregate remains untouched
        expect(payment.status).toBe(PaymentStatus.COMPLETED);
        expect(payment.version).toBe(1);
      });

      it('strictly prohibits any transitions from FAILED state', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount: Money.create(50.0),
          },
          clock,
        );
        payment.fail('Network error', clock);

        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('Second fail', clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.cancel('Cancel failed', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });

      it('strictly prohibits any transitions from CANCELLED state', () => {
        const payment = Payment.createPending(
          {
            tenantId,
            saleId,
            method: PaymentMethod.QR,
            amount: Money.create(50.0),
          },
          clock,
        );
        payment.cancel('Cancelled by user', clock);

        expect(() => payment.settle(clock)).toThrow(InvalidPaymentTransitionException);
        expect(() => payment.fail('Fail cancelled', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
        expect(() => payment.cancel('Double cancel', clock)).toThrow(
          InvalidPaymentTransitionException,
        );
      });
    });
  });

  // ===========================================================================
  // 5. Date & Immutability Defensiveness
  // ===========================================================================
  describe('5. Date & Immutability Defensiveness', () => {
    it('defends internal createdAt and paidAt dates against external mutation', () => {
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(20.0),
        },
        clock,
      );

      const returnedCreatedAt = payment.createdAt;
      returnedCreatedAt.setFullYear(1990);
      expect(payment.createdAt.getFullYear()).toBe(2026);

      const returnedPaidAt = payment.paidAt!;
      returnedPaidAt.setFullYear(1995);
      expect(payment.paidAt?.getFullYear()).toBe(2026);

      const returnedUpdatedAt = payment.updatedAt;
      returnedUpdatedAt.setFullYear(1980);
      expect(payment.updatedAt.getFullYear()).toBe(2026);
    });
  });

  // ===========================================================================
  // 6. Reconstitution from Persistence
  // ===========================================================================
  describe('6. Reconstitution from Persistence', () => {
    it('reconstitutes a valid settled Payment aggregate snapshot', () => {
      const paymentId = PaymentId.create('pay_recon_123');
      const amount = Money.fromCents(4500, 'USD');
      const ref = PaymentReference.create('RECON_REF_001');

      const payment = Payment.reconstitute({
        id: paymentId,
        tenantId,
        saleId,
        method: PaymentMethod.QR,
        amount,
        status: PaymentStatus.COMPLETED,
        reference: ref,
        paidAt: t0,
        createdAt: t0,
        updatedAt: t0,
        version: 3,
      });

      expect(payment.id.equals(paymentId)).toBe(true);
      expect(payment.version).toBe(3);
      expect(payment.isSettled()).toBe(true);
      expect(payment.isCompleted()).toBe(true);
      expect(payment.paidAt).toEqual(t0);
    });

    it('rejects reconstitution if settled payment has null paidAt', () => {
      const paymentId = PaymentId.create();
      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0),
          status: PaymentStatus.COMPLETED,
          reference: null,
          paidAt: null, // Illegal for settled
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);

      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0),
          status: PaymentStatus.COMPLETED,
          reference: null,
          paidAt: null,
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(/settled payment must have a valid paidAt/i);
    });

    it('rejects reconstitution if non-settled payment has non-null paidAt', () => {
      const paymentId = PaymentId.create();
      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: t0, // Illegal for pending
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(PaymentDomainException);

      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: t0,
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(/non-settled payment in status 'PENDING' must have paidAt set to null/i);
    });

    it('rejects reconstitution if updatedAt is earlier than createdAt (time travel)', () => {
      const paymentId = PaymentId.create();
      const past = new Date(t0.getTime() - 5000);

      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: null,
          createdAt: t0,
          updatedAt: past, // Earlier than createdAt
          version: 1,
        }),
      ).toThrow(PaymentDomainException);

      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.PENDING,
          reference: null,
          paidAt: null,
          createdAt: t0,
          updatedAt: past,
          version: 1,
        }),
      ).toThrow(/updatedAt cannot be earlier than createdAt/i);
    });
    it('rejects reconstitution if FAILED payment has non-null paidAt', () => {
      const paymentId = PaymentId.create();
      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.FAILED,
          reference: null,
          paidAt: t0, // Contradictory: FAILED with paidAt
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(/non-settled payment in status 'FAILED' must have paidAt set to null/i);
    });

    it('rejects reconstitution if CANCELLED payment has non-null paidAt', () => {
      const paymentId = PaymentId.create();
      expect(() =>
        Payment.reconstitute({
          id: paymentId,
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(10.0),
          status: PaymentStatus.CANCELLED,
          reference: null,
          paidAt: t0, // Contradictory: CANCELLED with paidAt
          createdAt: t0,
          updatedAt: t0,
          version: 1,
        }),
      ).toThrow(/non-settled payment in status 'CANCELLED' must have paidAt set to null/i);
    });
  });

  // ===========================================================================
  // 7. Domain Method Aliases (markAsPaid, markAsFailed)
  // ===========================================================================
  describe('7. Domain Method Aliases (markAsPaid, markAsFailed)', () => {
    it('markAsPaid() transitions PENDING to SETTLED and records PaymentSettledEvent', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(85.0),
        },
        clock,
      );

      clock.advance(15000);
      payment.markAsPaid(clock);

      expect(payment.isSettled()).toBe(true);
      expect(payment.paidAt).toEqual(new Date('2026-09-19T10:00:15.000Z'));
      expect(payment.version).toBe(2);

      const events = payment.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('PaymentSettled');
    });

    it('markAsFailed() transitions PENDING to FAILED and records PaymentFailedEvent', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(85.0),
        },
        clock,
      );

      clock.advance(15000);
      payment.markAsFailed('Insufficient funds', clock);

      expect(payment.isFailed()).toBe(true);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);

      const events = payment.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('PaymentFailed');
    });
  });

  // ===========================================================================
  // 8. Entity Identity & Equality
  // ===========================================================================
  describe('8. Entity Identity & Equality', () => {
    it('implements Entity<PaymentId> equals() correctly', () => {
      const pId1 = PaymentId.create('pay_same_id');
      const pId2 = PaymentId.create('pay_same_id');
      const pId3 = PaymentId.create('pay_different_id');

      const payment1 = Payment.createSettled({
        id: pId1,
        tenantId,
        saleId,
        method: PaymentMethod.CASH,
        amount: Money.create(10.0),
      });

      const payment2 = Payment.reconstitute({
        id: pId2,
        tenantId,
        saleId,
        method: PaymentMethod.CASH,
        amount: Money.create(10.0),
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: t0,
        createdAt: t0,
        updatedAt: t0,
        version: 1,
      });

      const payment3 = Payment.createSettled({
        id: pId3,
        tenantId,
        saleId,
        method: PaymentMethod.CASH,
        amount: Money.create(10.0),
      });

      expect(payment1.equals(payment2)).toBe(true);
      expect(payment1.equals(payment3)).toBe(false);
      expect(payment1.equals(null)).toBe(false);
      expect(payment1.equals(undefined)).toBe(false);
    });

    it('accepts string saleId and validates format', () => {
      const payment = Payment.createSettled({
        tenantId,
        saleId: 'sale_custom_123',
        method: PaymentMethod.CASH,
        amount: Money.create(10.0),
      });

      expect(payment.saleId).toBeInstanceOf(SaleId);
      expect(payment.saleId.value).toBe('sale_custom_123');
    });

    it('rejects empty or whitespace saleId', () => {
      expect(() =>
        Payment.createSettled({
          tenantId,
          saleId: '',
          method: PaymentMethod.CASH,
          amount: Money.create(10.0),
        }),
      ).toThrow();
    });
  });

  // ===========================================================================
  // 9. AggregateRoot Protocol & Domain Events
  // ===========================================================================
  describe('9. AggregateRoot Protocol & Domain Events', () => {
    it('records and clears domain events upon creation and lifecycle actions', () => {
      const payment = Payment.createSettled(
        {
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0),
          reference: 'DRAWER-1',
        },
        clock,
      );

      // createSettled records PaymentSettledEvent
      const events = payment.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('PaymentSettled');
      expect(events[0]?.aggregateId).toBe(payment.id.value);

      payment.clearEvents();
      expect(payment.getUncommittedEvents().length).toBe(0);
    });

    it('records PaymentCancelledEvent on cancel()', () => {
      const payment = Payment.createPending(
        {
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(50.0),
        },
        clock,
      );

      payment.cancel('Customer walked away', clock);
      const events = payment.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('PaymentCancelled');
    });
  });
});
