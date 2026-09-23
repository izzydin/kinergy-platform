import { InvalidPaymentStatusException } from '../exceptions/invalid-payment-status.exception';

/**
 * Authoritative lifecycle states of an individual monetary Payment transaction.
 * Conforms strictly to ADR-0116 minimal 4-state lifecycle.
 *
 * Guaranteed Properties:
 * - Domain pure: Zero imports from Prisma, NestJS, HTTP, or DTO layers.
 * - Type-safe, explicit, and deterministic.
 * - Free of semantically meaningless aliases.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Immutable array of all valid PaymentStatus enum values.
 */
export const SUPPORTED_PAYMENT_STATUSES: readonly PaymentStatus[] = Object.freeze([
  PaymentStatus.PENDING,
  PaymentStatus.COMPLETED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
]);

/**
 * Detailed metadata describing the business distinction and semantics of each payment status.
 */
export interface PaymentStatusMetadata {
  readonly status: PaymentStatus;
  readonly label: string;
  readonly isTerminal: boolean;
  readonly allowsPaidAt: boolean;
  readonly description: string;
}

/**
 * Explicit semantics registry for every supported PaymentStatus.
 */
export const PAYMENT_STATUS_METADATA: Readonly<Record<PaymentStatus, PaymentStatusMetadata>> =
  Object.freeze({
    [PaymentStatus.PENDING]: Object.freeze({
      status: PaymentStatus.PENDING,
      label: 'Pending',
      isTerminal: false,
      allowsPaidAt: false,
      description:
        'Payment tender initiated awaiting customer action or external provider rail confirmation. Funds not yet verified.',
    }),
    [PaymentStatus.COMPLETED]: Object.freeze({
      status: PaymentStatus.COMPLETED,
      label: 'Completed',
      isTerminal: true,
      allowsPaidAt: true,
      description:
        'Monetary value definitively collected and verified. Write-once permanently immutable audit record.',
    }),
    [PaymentStatus.FAILED]: Object.freeze({
      status: PaymentStatus.FAILED,
      label: 'Failed',
      isTerminal: true,
      allowsPaidAt: false,
      description:
        'Payment attempt rejected, declined, or timed out by provider rail. Terminal audit record.',
    }),
    [PaymentStatus.CANCELLED]: Object.freeze({
      status: PaymentStatus.CANCELLED,
      label: 'Cancelled',
      isTerminal: true,
      allowsPaidAt: false,
      description:
        'Pending payment attempt aborted before funds transfer or charge execution. Terminal audit record.',
    }),
  });

/**
 * Validates whether a value is a recognized PaymentStatus enum value.
 */
export function isValidPaymentStatus(status: unknown): status is PaymentStatus {
  return typeof status === 'string' && SUPPORTED_PAYMENT_STATUSES.includes(status as PaymentStatus);
}

/**
 * Asserts that a value is a valid PaymentStatus.
 * Throws InvalidPaymentStatusException if validation fails.
 */
export function assertValidPaymentStatus(status: unknown): asserts status is PaymentStatus {
  if (!isValidPaymentStatus(status)) {
    throw new InvalidPaymentStatusException(status);
  }
}

/**
 * Parses and returns a validated PaymentStatus.
 * Prevents construction with arbitrary or invalid strings.
 */
export function parsePaymentStatus(value: unknown): PaymentStatus {
  assertValidPaymentStatus(value);
  return value;
}

/**
 * Evaluates deterministic equality between two payment statuses.
 */
export function arePaymentStatusesEqual(a: unknown, b: unknown): boolean {
  if (!isValidPaymentStatus(a) || !isValidPaymentStatus(b)) {
    return false;
  }
  return a === b;
}

/**
 * Retrieves explicit semantic metadata for a given PaymentStatus.
 */
export function getPaymentStatusMetadata(status: PaymentStatus): PaymentStatusMetadata {
  assertValidPaymentStatus(status);
  return PAYMENT_STATUS_METADATA[status];
}

/**
 * Returns whether a PaymentStatus represents a terminal lifecycle state.
 * Completed, Failed, and Cancelled payments are terminal.
 */
export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  assertValidPaymentStatus(status);
  return PAYMENT_STATUS_METADATA[status].isTerminal;
}

/**
 * Predicate checking if status is PENDING.
 */
export function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.PENDING;
}

/**
 * Predicate checking if status is COMPLETED.
 */
export function isCompletedPaymentStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.COMPLETED;
}

/**
 * Predicate checking if status is FAILED.
 */
export function isFailedPaymentStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.FAILED;
}

/**
 * Predicate checking if status is CANCELLED.
 */
export function isCancelledPaymentStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.CANCELLED;
}

/**
 * Allowed state transitions for Payment transactions.
 * COMPLETED, FAILED, and CANCELLED are terminal states.
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = Object.freeze({
  [PaymentStatus.PENDING]: Object.freeze([
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ]),
  [PaymentStatus.COMPLETED]: Object.freeze([]),
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
  readonly action?: 'complete' | 'fail' | 'cancel';
  readonly description: string;
}

/**
 * Complete, explicit 4x4 State Transition Matrix for the Payment lifecycle.
 * Conforms strictly to ADR-0116.
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
    to: PaymentStatus.COMPLETED,
    allowed: true,
    action: 'complete',
    description: 'Pending payment completed upon confirmed receipt and clearing of customer funds.',
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

  // COMPLETED transitions (terminal & permanently immutable)
  Object.freeze({
    from: PaymentStatus.COMPLETED,
    to: PaymentStatus.PENDING,
    allowed: false,
    description: 'Completed payment cannot revert to pending. Settled records are write-once.',
  }),
  Object.freeze({
    from: PaymentStatus.COMPLETED,
    to: PaymentStatus.COMPLETED,
    allowed: false,
    description:
      'Completed payment cannot be re-completed. Settled records are permanently immutable.',
  }),
  Object.freeze({
    from: PaymentStatus.COMPLETED,
    to: PaymentStatus.FAILED,
    allowed: false,
    description:
      'Completed payment cannot be failed. Compensating transactions (refunds) are required.',
  }),
  Object.freeze({
    from: PaymentStatus.COMPLETED,
    to: PaymentStatus.CANCELLED,
    allowed: false,
    description:
      'Completed payment cannot be cancelled. Compensating transactions (refunds) are required.',
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
    to: PaymentStatus.COMPLETED,
    allowed: false,
    description: 'Failed payment cannot transition to completed. Terminal audit record.',
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
    to: PaymentStatus.COMPLETED,
    allowed: false,
    description: 'Cancelled payment cannot transition to completed. Terminal audit record.',
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
