import { InvalidPaymentStatusException } from '../exceptions/invalid-payment-status.exception';

/**
 * Lifecycle states of an individual monetary Payment transaction.
 * Conforms strictly to ADR-0115 minimal 4-state lifecycle.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Immutable array of all valid PaymentStatus enum values.
 */
export const SUPPORTED_PAYMENT_STATUSES: readonly PaymentStatus[] = Object.freeze([
  PaymentStatus.PENDING,
  PaymentStatus.SETTLED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
]);

/**
 * Validates whether a value is a recognized PaymentStatus enum value.
 */
export function isValidPaymentStatus(status: unknown): status is PaymentStatus {
  return typeof status === 'string' && SUPPORTED_PAYMENT_STATUSES.includes(status as PaymentStatus);
}

/**
 * Allowed state transitions for Payment transactions.
 * SETTLED, FAILED, and CANCELLED are terminal states.
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = Object.freeze({
  [PaymentStatus.PENDING]: Object.freeze([
    PaymentStatus.SETTLED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ]),
  [PaymentStatus.SETTLED]: Object.freeze([]),
  [PaymentStatus.FAILED]: Object.freeze([]),
  [PaymentStatus.CANCELLED]: Object.freeze([]),
});

/**
 * Determines whether a transition from currentStatus to targetStatus is legally permitted.
 */
export function canTransitionPaymentStatus(
  currentStatus: PaymentStatus,
  targetStatus: PaymentStatus,
): boolean {
  const allowed = ALLOWED_PAYMENT_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Returns whether a PaymentStatus represents a terminal lifecycle state.
 * Settled, Failed, and Cancelled payments are terminal.
 */
export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.SETTLED ||
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.CANCELLED
  );
}

/**
 * Returns the immutable list of allowed target statuses for a given source status.
 */
export function getAllowedPaymentTransitions(status: PaymentStatus): readonly PaymentStatus[] {
  return ALLOWED_PAYMENT_TRANSITIONS[status] ?? Object.freeze([]);
}

/**
 * Returns the immutable list of prohibited target statuses for a given source status.
 */
export function getProhibitedPaymentTransitions(status: PaymentStatus): readonly PaymentStatus[] {
  const allowed = getAllowedPaymentTransitions(status);
  return Object.freeze(SUPPORTED_PAYMENT_STATUSES.filter((target) => !allowed.includes(target)));
}

/**
 * Explicit rule descriptor for every cell in the Payment state transition matrix.
 */
export interface PaymentTransitionRule {
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;
  readonly allowed: boolean;
  readonly action?: 'settle' | 'fail' | 'cancel';
  readonly description: string;
}

/**
 * Complete, explicit 4x4 State Transition Matrix for the Payment lifecycle.
 * Conforms strictly to ADR-0115 and ADR-0109.
 */
export const PAYMENT_TRANSITION_MATRIX: readonly PaymentTransitionRule[] = Object.freeze([
  // PENDING transitions
  Object.freeze({
    from: PaymentStatus.PENDING,
    to: PaymentStatus.PENDING,
    allowed: false,
    description: 'A pending payment cannot re-enter pending state.',
  }),
  Object.freeze({
    from: PaymentStatus.PENDING,
    to: PaymentStatus.SETTLED,
    allowed: true,
    action: 'settle',
    description: 'Pending payment settled upon confirmed receipt of customer funds.',
  }),
  Object.freeze({
    from: PaymentStatus.PENDING,
    to: PaymentStatus.FAILED,
    allowed: true,
    action: 'fail',
    description: 'Pending payment failed due to rail rejection, timeout, or insufficient funds.',
  }),
  Object.freeze({
    from: PaymentStatus.PENDING,
    to: PaymentStatus.CANCELLED,
    allowed: true,
    action: 'cancel',
    description: 'Pending payment cancelled by cashier or customer prior to charge execution.',
  }),

  // SETTLED transitions (terminal & permanently immutable)
  Object.freeze({
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.PENDING,
    allowed: false,
    description: 'Settled payment cannot revert to pending. Settled records are write-once.',
  }),
  Object.freeze({
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.SETTLED,
    allowed: false,
    description: 'Settled payment cannot be re-settled. Settled records are permanently immutable.',
  }),
  Object.freeze({
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.FAILED,
    allowed: false,
    description:
      'Settled payment cannot be failed. Compensating transactions (refunds) are required.',
  }),
  Object.freeze({
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.CANCELLED,
    allowed: false,
    description:
      'Settled payment cannot be cancelled. Compensating transactions (refunds) are required.',
  }),

  // FAILED transitions (terminal)
  Object.freeze({
    from: PaymentStatus.FAILED,
    to: PaymentStatus.PENDING,
    allowed: false,
    description:
      'Failed payment cannot revert to pending. A new Payment aggregate must be instantiated.',
  }),
  Object.freeze({
    from: PaymentStatus.FAILED,
    to: PaymentStatus.SETTLED,
    allowed: false,
    description: 'Failed payment cannot transition to settled. Terminal audit record.',
  }),
  Object.freeze({
    from: PaymentStatus.FAILED,
    to: PaymentStatus.FAILED,
    allowed: false,
    description: 'Failed payment cannot be failed again. Terminal audit record.',
  }),
  Object.freeze({
    from: PaymentStatus.FAILED,
    to: PaymentStatus.CANCELLED,
    allowed: false,
    description: 'Failed payment cannot transition to cancelled. Terminal audit record.',
  }),

  // CANCELLED transitions (terminal)
  Object.freeze({
    from: PaymentStatus.CANCELLED,
    to: PaymentStatus.PENDING,
    allowed: false,
    description:
      'Cancelled payment cannot revert to pending. A new Payment aggregate must be instantiated.',
  }),
  Object.freeze({
    from: PaymentStatus.CANCELLED,
    to: PaymentStatus.SETTLED,
    allowed: false,
    description: 'Cancelled payment cannot transition to settled. Terminal audit record.',
  }),
  Object.freeze({
    from: PaymentStatus.CANCELLED,
    to: PaymentStatus.FAILED,
    allowed: false,
    description: 'Cancelled payment cannot transition to failed. Terminal audit record.',
  }),
  Object.freeze({
    from: PaymentStatus.CANCELLED,
    to: PaymentStatus.CANCELLED,
    allowed: false,
    description: 'Cancelled payment cannot be cancelled again. Terminal audit record.',
  }),
]);

/**
 * Asserts that a status value is a valid PaymentStatus.
 */
export function assertValidPaymentStatus(status: unknown): asserts status is PaymentStatus {
  if (!isValidPaymentStatus(status)) {
    throw new InvalidPaymentStatusException(status);
  }
}
