import {
  PaymentLifecycleStateMachine,
  PaymentTransitionAction,
  PaymentTransitionCommand,
} from '../services/payment-lifecycle.state-machine';
import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PAYMENT_TRANSITION_MATRIX,
  ALLOWED_PAYMENT_TRANSITIONS,
} from '../enums/payment-status.enum';
import { Payment } from '../payment.aggregate';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Money } from '../value-objects/money.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { PaymentId } from '../value-objects/payment-id.vo';
import { InvalidPaymentTransitionException } from '../exceptions/invalid-payment-transition.exception';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';
import { Clock } from '../shared/clock';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

describe('PaymentLifecycleStateMachine & Transition Model (Phase 7.6 ADR-0116)', () => {
  const baseTime = new Date('2026-09-23T12:00:00.000Z');
  const tenantId = 'tenant_kinergy_prime';
  const saleId = SaleId.create('sale_trans_test_001');

  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
  });

  const createPendingPayment = (id = 'pay_pending_01'): Payment => {
    return Payment.createPending(
      {
        id: PaymentId.create(id),
        tenantId,
        saleId,
        method: PaymentMethod.QR,
        amount: Money.create(100.0, 'USD'),
      },
      clock,
    );
  };

  const createCompletedPayment = (id = 'pay_completed_01'): Payment => {
    return Payment.createCompleted(
      {
        id: PaymentId.create(id),
        tenantId,
        saleId,
        method: PaymentMethod.CASH,
        amount: Money.create(50.0, 'USD'),
      },
      clock,
    );
  };

  // ===========================================================================
  // 1. Authoritative Matrix & Single Source of Truth
  // ===========================================================================
  describe('1. Authoritative Transition Matrix & Single Source of Truth', () => {
    it('guarantees state machine references the authoritative ADR-0116 matrix with 16 cells', () => {
      expect(PaymentLifecycleStateMachine.TRANSITION_MATRIX).toBe(PAYMENT_TRANSITION_MATRIX);
      expect(PaymentLifecycleStateMachine.TRANSITION_MATRIX).toHaveLength(16);
      expect(Object.isFrozen(PaymentLifecycleStateMachine.TRANSITION_MATRIX)).toBe(true);
    });

    it('guarantees ALLOWED_TRANSITIONS matches the canonical graph', () => {
      expect(PaymentLifecycleStateMachine.ALLOWED_TRANSITIONS).toBe(ALLOWED_PAYMENT_TRANSITIONS);
      expect(PaymentLifecycleStateMachine.ALLOWED_TRANSITIONS[PaymentStatus.PENDING]).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(PaymentLifecycleStateMachine.ALLOWED_TRANSITIONS[PaymentStatus.COMPLETED]).toEqual([]);
      expect(PaymentLifecycleStateMachine.ALLOWED_TRANSITIONS[PaymentStatus.FAILED]).toEqual([]);
      expect(PaymentLifecycleStateMachine.ALLOWED_TRANSITIONS[PaymentStatus.CANCELLED]).toEqual([]);
    });
  });

  // ===========================================================================
  // 2. Every Valid Transition
  // ===========================================================================
  describe('2. Every Valid Transition (Originated from PENDING)', () => {
    it('validates PENDING -> COMPLETED is legally permitted and transitions deterministically', () => {
      expect(
        PaymentLifecycleStateMachine.canTransition(PaymentStatus.PENDING, PaymentStatus.COMPLETED),
      ).toBe(true);
      expect(() =>
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.PENDING,
          PaymentStatus.COMPLETED,
        ),
      ).not.toThrow();

      // Static transition
      const nextStatus = PaymentLifecycleStateMachine.transition(
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
      );
      expect(nextStatus).toBe(PaymentStatus.COMPLETED);

      // Transition via command object
      const commandResult = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, {
        action: PaymentTransitionAction.COMPLETE,
      });
      expect(commandResult).toBe(PaymentStatus.COMPLETED);

      // Aggregate root integration
      const payment = createPendingPayment();
      expect(payment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(true);

      clock.advance(10000);
      payment.applyTransition({ action: PaymentTransitionAction.COMPLETE }, { clock });

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.isCompleted()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.paidAt).toEqual(clock.now());
      expect(payment.version).toBe(2);
    });

    it('validates PENDING -> FAILED is legally permitted and transitions deterministically', () => {
      expect(
        PaymentLifecycleStateMachine.canTransition(PaymentStatus.PENDING, PaymentStatus.FAILED),
      ).toBe(true);
      expect(() =>
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.PENDING,
          PaymentStatus.FAILED,
        ),
      ).not.toThrow();

      // Static transition
      const nextStatus = PaymentLifecycleStateMachine.transition(
        PaymentStatus.PENDING,
        PaymentStatus.FAILED,
      );
      expect(nextStatus).toBe(PaymentStatus.FAILED);

      // Transition via command object
      const commandResult = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, {
        action: PaymentTransitionAction.FAIL,
        reason: 'Issuer declined charge',
      });
      expect(commandResult).toBe(PaymentStatus.FAILED);

      // Aggregate root integration
      const payment = createPendingPayment();
      expect(payment.canTransitionTo(PaymentStatus.FAILED)).toBe(true);

      clock.advance(5000);
      payment.applyTransition(
        { action: PaymentTransitionAction.FAIL, reason: 'Issuer declined charge' },
        { clock },
      );

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.isFailed()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
    });

    it('validates PENDING -> CANCELLED is legally permitted and transitions deterministically', () => {
      expect(
        PaymentLifecycleStateMachine.canTransition(PaymentStatus.PENDING, PaymentStatus.CANCELLED),
      ).toBe(true);
      expect(() =>
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.PENDING,
          PaymentStatus.CANCELLED,
        ),
      ).not.toThrow();

      // Static transition
      const nextStatus = PaymentLifecycleStateMachine.transition(
        PaymentStatus.PENDING,
        PaymentStatus.CANCELLED,
      );
      expect(nextStatus).toBe(PaymentStatus.CANCELLED);

      // Transition via command object
      const commandResult = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, {
        action: PaymentTransitionAction.CANCEL,
        reason: 'Customer aborted checkout',
      });
      expect(commandResult).toBe(PaymentStatus.CANCELLED);

      // Aggregate root integration
      const payment = createPendingPayment();
      expect(payment.canTransitionTo(PaymentStatus.CANCELLED)).toBe(true);

      clock.advance(8000);
      payment.applyTransition(
        { action: PaymentTransitionAction.CANCEL, reason: 'Customer aborted checkout' },
        { clock },
      );

      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payment.isCancelled()).toBe(true);
      expect(payment.isPending()).toBe(false);
      expect(payment.paidAt).toBeNull();
      expect(payment.version).toBe(2);
    });
  });

  // ===========================================================================
  // 3. Every Invalid Transition (Complete 16-Cell Matrix)
  // ===========================================================================
  describe('3. Every Invalid Transition (Exhaustive Matrix Enforcement)', () => {
    const validPairs = new Set(['PENDING->COMPLETED', 'PENDING->FAILED', 'PENDING->CANCELLED']);

    it('rigorously rejects every invalid (from, to) pair out of the 16 combinations', () => {
      let testedCells = 0;
      let rejectedCells = 0;

      for (const from of SUPPORTED_PAYMENT_STATUSES) {
        for (const to of SUPPORTED_PAYMENT_STATUSES) {
          testedCells++;
          const pairKey = `${from}->${to}`;

          if (validPairs.has(pairKey)) {
            expect(PaymentLifecycleStateMachine.canTransition(from, to)).toBe(true);
          } else {
            rejectedCells++;
            expect(PaymentLifecycleStateMachine.canTransition(from, to)).toBe(false);

            expect(() => PaymentLifecycleStateMachine.assertTransitionValid(from, to)).toThrow(
              InvalidPaymentTransitionException,
            );

            expect(() => PaymentLifecycleStateMachine.transition(from, to)).toThrow(
              InvalidPaymentTransitionException,
            );
          }
        }
      }

      expect(testedCells).toBe(16);
      expect(rejectedCells).toBe(13); // Exactly 13 invalid transition paths
    });

    it('rejects all transitions originating from COMPLETED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(PaymentLifecycleStateMachine.canTransition(PaymentStatus.COMPLETED, target)).toBe(
          false,
        );

        expect(() =>
          PaymentLifecycleStateMachine.assertTransitionValid(PaymentStatus.COMPLETED, target),
        ).toThrow(InvalidPaymentTransitionException);

        expect(() =>
          PaymentLifecycleStateMachine.assertTransitionValid(PaymentStatus.COMPLETED, target),
        ).toThrow(/Completed payments are permanently immutable/i);
      }
    });

    it('rejects all transitions originating from FAILED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(PaymentLifecycleStateMachine.canTransition(PaymentStatus.FAILED, target)).toBe(
          false,
        );

        expect(() =>
          PaymentLifecycleStateMachine.assertTransitionValid(PaymentStatus.FAILED, target),
        ).toThrow(InvalidPaymentTransitionException);
      }
    });

    it('rejects all transitions originating from CANCELLED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(PaymentLifecycleStateMachine.canTransition(PaymentStatus.CANCELLED, target)).toBe(
          false,
        );

        expect(() =>
          PaymentLifecycleStateMachine.assertTransitionValid(PaymentStatus.CANCELLED, target),
        ).toThrow(InvalidPaymentTransitionException);
      }
    });
  });

  // ===========================================================================
  // 4. Every Terminal State
  // ===========================================================================
  describe('4. Every Terminal State Behavior', () => {
    it('identifies COMPLETED as terminal with zero allowed outgoing transitions', () => {
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.COMPLETED)).toBe(true);
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.COMPLETED)).toEqual(
        [],
      );
      expect(
        PaymentLifecycleStateMachine.getProhibitedTransitions(PaymentStatus.COMPLETED),
      ).toEqual(SUPPORTED_PAYMENT_STATUSES);
    });

    it('identifies FAILED as terminal with zero allowed outgoing transitions', () => {
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.FAILED)).toBe(true);
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.FAILED)).toEqual([]);
      expect(PaymentLifecycleStateMachine.getProhibitedTransitions(PaymentStatus.FAILED)).toEqual(
        SUPPORTED_PAYMENT_STATUSES,
      );
    });

    it('identifies CANCELLED as terminal with zero allowed outgoing transitions', () => {
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.CANCELLED)).toBe(true);
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.CANCELLED)).toEqual(
        [],
      );
      expect(
        PaymentLifecycleStateMachine.getProhibitedTransitions(PaymentStatus.CANCELLED),
      ).toEqual(SUPPORTED_PAYMENT_STATUSES);
    });

    it('identifies PENDING as non-terminal with 3 allowed outgoing transitions', () => {
      expect(PaymentLifecycleStateMachine.isTerminal(PaymentStatus.PENDING)).toBe(false);
      expect(PaymentLifecycleStateMachine.getAllowedTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(PaymentLifecycleStateMachine.getProhibitedTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.PENDING,
      ]);
    });
  });

  // ===========================================================================
  // 5. Invalid Commands & Actions
  // ===========================================================================
  describe('5. Invalid Transition Commands & Actions', () => {
    it('rejects speculative or unsupported actions with PaymentDomainException', () => {
      const invalidActions = [
        'REFUND',
        'REVERSE',
        'PARTIALLY_COMPLETE',
        'EXPIRE',
        'AUTHORIZE',
        'UNKNOWN',
        '',
        '   ',
      ];

      for (const action of invalidActions) {
        expect(() => PaymentLifecycleStateMachine.resolveTargetStatus(action)).toThrow(
          PaymentDomainException,
        );
        expect(() => PaymentLifecycleStateMachine.resolveTargetStatus(action)).toThrow(
          /Invalid transition command action/i,
        );

        expect(() =>
          PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, {
            action: action as unknown as PaymentTransitionAction,
          }),
        ).toThrow(PaymentDomainException);
      }
    });

    it('rejects non-string actions with PaymentDomainException', () => {
      const badInputs = [null, undefined, 123, true, {}];

      for (const bad of badInputs) {
        expect(() => PaymentLifecycleStateMachine.resolveTargetStatus(bad)).toThrow(
          PaymentDomainException,
        );
      }
    });
  });

  // ===========================================================================
  // 6. Repeated Transitions (Self-Transitions)
  // ===========================================================================
  describe('6. Repeated Transitions (Self-Transitions)', () => {
    it('rejects PENDING -> PENDING repeated transition attempt', () => {
      expect(
        PaymentLifecycleStateMachine.canTransition(PaymentStatus.PENDING, PaymentStatus.PENDING),
      ).toBe(false);

      expect(() =>
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.PENDING,
          PaymentStatus.PENDING,
        ),
      ).toThrow(InvalidPaymentTransitionException);

      expect(() =>
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.PENDING,
          PaymentStatus.PENDING,
        ),
      ).toThrow(/repeated transition prohibited/i);
    });

    it('rejects re-completing an already completed payment', () => {
      const completedPayment = createCompletedPayment();

      expect(completedPayment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);

      expect(() => completedPayment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => completedPayment.complete(clock)).toThrow(
        /Completed payments are permanently immutable/i,
      );

      expect(() =>
        completedPayment.applyTransition({ action: PaymentTransitionAction.COMPLETE }, { clock }),
      ).toThrow(InvalidPaymentTransitionException);
    });

    it('rejects re-failing an already failed payment', () => {
      const payment = createPendingPayment();
      payment.fail('Card declined', clock);

      expect(payment.canTransitionTo(PaymentStatus.FAILED)).toBe(false);

      expect(() => payment.fail('Second decline', clock)).toThrow(
        InvalidPaymentTransitionException,
      );

      expect(() =>
        payment.applyTransition(
          { action: PaymentTransitionAction.FAIL, reason: 'Duplicate' },
          { clock },
        ),
      ).toThrow(InvalidPaymentTransitionException);
    });

    it('rejects re-cancelling an already cancelled payment', () => {
      const payment = createPendingPayment();
      payment.cancel('Customer left', clock);

      expect(payment.canTransitionTo(PaymentStatus.CANCELLED)).toBe(false);

      expect(() => payment.cancel('Second cancel', clock)).toThrow(
        InvalidPaymentTransitionException,
      );

      expect(() =>
        payment.applyTransition(
          { action: PaymentTransitionAction.CANCEL, reason: 'Duplicate' },
          { clock },
        ),
      ).toThrow(InvalidPaymentTransitionException);
    });
  });

  // ===========================================================================
  // 7. Immutability: Failed Transition Leaves State 100% Unchanged
  // ===========================================================================
  describe('7. Immutability: Failed Transition Leaves State 100% Unchanged', () => {
    it('leaves COMPLETED payment untouched when any transition is attempted', () => {
      const payment = createCompletedPayment('pay_immut_01');
      payment.clearEvents();

      const initialStatus = payment.status;
      const initialPaidAt = payment.paidAt;
      const initialUpdatedAt = payment.updatedAt;
      const initialCreatedAt = payment.createdAt;
      const initialVersion = payment.version;
      const initialAmount = payment.amount;
      const initialReference = payment.reference;

      // Attempt invalid transition to PENDING
      expect(() => payment.assertCanTransitionTo(PaymentStatus.PENDING)).toThrow(
        InvalidPaymentTransitionException,
      );

      // Attempt invalid transition to FAILED
      expect(() => payment.fail('declined', clock)).toThrow(InvalidPaymentTransitionException);

      // Attempt invalid transition to CANCELLED
      expect(() => payment.cancel('void', clock)).toThrow(InvalidPaymentTransitionException);

      // Attempt invalid re-completion
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);

      // Assert complete identity preservation (zero partial mutation)
      expect(payment.status).toBe(initialStatus);
      expect(payment.paidAt).toEqual(initialPaidAt);
      expect(payment.updatedAt).toEqual(initialUpdatedAt);
      expect(payment.createdAt).toEqual(initialCreatedAt);
      expect(payment.version).toBe(initialVersion);
      expect(payment.amount).toBe(initialAmount);
      expect(payment.reference).toBe(initialReference);
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('leaves FAILED payment untouched when transition is attempted', () => {
      const payment = createPendingPayment('pay_immut_02');
      payment.fail('Gateway timeout', clock);
      payment.clearEvents();

      const failedStatus = payment.status;
      const failedVersion = payment.version;
      const failedUpdatedAt = payment.updatedAt;

      // Attempt to settle a failed payment
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => payment.complete(clock)).toThrow(/Cannot settle a payment that is FAILED/i);

      // Attempt to cancel a failed payment
      expect(() => payment.cancel('void', clock)).toThrow(InvalidPaymentTransitionException);

      // Verify aggregate remains untouched
      expect(payment.status).toBe(failedStatus);
      expect(payment.version).toBe(failedVersion);
      expect(payment.updatedAt).toEqual(failedUpdatedAt);
      expect(payment.paidAt).toBeNull();
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });

    it('leaves CANCELLED payment untouched when transition is attempted', () => {
      const payment = createPendingPayment('pay_immut_03');
      payment.cancel('User aborted', clock);
      payment.clearEvents();

      const cancelledStatus = payment.status;
      const cancelledVersion = payment.version;
      const cancelledUpdatedAt = payment.updatedAt;

      // Attempt to settle a cancelled payment
      expect(() => payment.complete(clock)).toThrow(InvalidPaymentTransitionException);
      expect(() => payment.complete(clock)).toThrow(/Cannot settle a payment that is CANCELLED/i);

      // Attempt to fail a cancelled payment
      expect(() => payment.fail('late error', clock)).toThrow(InvalidPaymentTransitionException);

      // Verify aggregate remains untouched
      expect(payment.status).toBe(cancelledStatus);
      expect(payment.version).toBe(cancelledVersion);
      expect(payment.updatedAt).toEqual(cancelledUpdatedAt);
      expect(payment.paidAt).toBeNull();
      expect(payment.getUncommittedEvents()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 8. Determinism: Same Inputs Always Yield Identical Results
  // ===========================================================================
  describe('8. Determinism: Same Inputs Always Yield Identical Results', () => {
    it('yields identical transitions across multiple calls with same inputs', () => {
      const command: PaymentTransitionCommand = { action: PaymentTransitionAction.COMPLETE };

      const res1 = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, command);
      const res2 = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, command);
      const res3 = PaymentLifecycleStateMachine.transition(PaymentStatus.PENDING, command);

      expect(res1).toBe(PaymentStatus.COMPLETED);
      expect(res2).toBe(PaymentStatus.COMPLETED);
      expect(res3).toBe(PaymentStatus.COMPLETED);
    });

    it('yields identical exceptions and reasons across repeated prohibited transitions', () => {
      try {
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.COMPLETED,
          PaymentStatus.PENDING,
        );
      } catch (err1) {
        try {
          PaymentLifecycleStateMachine.assertTransitionValid(
            PaymentStatus.COMPLETED,
            PaymentStatus.PENDING,
          );
        } catch (err2) {
          const ex1 = err1 as InvalidPaymentTransitionException;
          const ex2 = err2 as InvalidPaymentTransitionException;

          expect(ex1.code).toBe(ex2.code);
          expect(ex1.currentState).toBe(ex2.currentState);
          expect(ex1.targetState).toBe(ex2.targetState);
          expect(ex1.reason).toBe(ex2.reason);
          expect(ex1.message).toBe(ex2.message);
        }
      }
    });
  });

  // ===========================================================================
  // 9. Domain Exception Structure (No Infrastructure Leakage)
  // ===========================================================================
  describe('9. Domain Exception Structure (No Infrastructure Leakage)', () => {
    it('exposes currentState, targetState, and reason cleanly for application mapping', () => {
      try {
        PaymentLifecycleStateMachine.assertTransitionValid(
          PaymentStatus.FAILED,
          PaymentStatus.COMPLETED,
        );
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const ex = err as InvalidPaymentTransitionException;

        expect(ex.code).toBe('INVALID_PAYMENT_TRANSITION');
        expect(ex.currentState).toBe(PaymentStatus.FAILED);
        expect(ex.targetState).toBe(PaymentStatus.COMPLETED);
        expect(ex.reason).toBe('Cannot settle a payment that is FAILED');
        expect(ex.message).toBe(
          "Cannot transition Payment from status 'FAILED' to status 'COMPLETED' (Cannot settle a payment that is FAILED).",
        );
      }
    });
  });
});
