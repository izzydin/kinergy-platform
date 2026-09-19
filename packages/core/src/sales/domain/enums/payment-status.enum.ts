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
 * Asserts that a status value is a valid PaymentStatus.
 */
export function assertValidPaymentStatus(status: unknown): asserts status is PaymentStatus {
  if (!isValidPaymentStatus(status)) {
    throw new InvalidPaymentStatusException(status);
  }
}
