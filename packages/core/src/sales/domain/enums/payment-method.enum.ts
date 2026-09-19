import { InvalidPaymentMethodException } from '../exceptions/invalid-payment-method.exception';

/**
 * Supported payment tender methods in Milestone 7.5.
 *
 * Designed for clean extensibility to support future methods (CARD, TRANSFER, ONLINE)
 * without altering core domain invariants.
 */
export enum PaymentMethod {
  CASH = 'CASH',
  QR = 'QR',
}

/**
 * Immutable array of all currently active and supported payment methods in Phase 7.5.
 */
export const SUPPORTED_PAYMENT_METHODS: readonly PaymentMethod[] = Object.freeze([
  PaymentMethod.CASH,
  PaymentMethod.QR,
]);

/**
 * Recognized future payment methods for architectural extensibility.
 * These are NOT active business options in Phase 7.5 and will be rejected at runtime.
 */
export const FUTURE_PAYMENT_METHODS = Object.freeze(['CARD', 'TRANSFER', 'ONLINE'] as const);

export type FuturePaymentMethod = (typeof FUTURE_PAYMENT_METHODS)[number];

/**
 * Validates whether a value is a currently active and supported PaymentMethod enum value.
 */
export function isValidPaymentMethod(method: unknown): method is PaymentMethod {
  return typeof method === 'string' && SUPPORTED_PAYMENT_METHODS.includes(method as PaymentMethod);
}

/**
 * Validates whether a value is a recognized future payment method.
 */
export function isFuturePaymentMethod(method: unknown): method is FuturePaymentMethod {
  return (
    typeof method === 'string' && (FUTURE_PAYMENT_METHODS as readonly string[]).includes(method)
  );
}

/**
 * Asserts that a method is valid, or throws InvalidPaymentMethodException with a descriptive message.
 */
export function assertValidPaymentMethod(method: unknown): asserts method is PaymentMethod {
  if (isValidPaymentMethod(method)) {
    return;
  }
  if (isFuturePaymentMethod(method)) {
    throw new InvalidPaymentMethodException(
      method,
      `Payment method '${method}' is planned for a future milestone but is not yet active in Phase 7.5. Supported methods are: ${SUPPORTED_PAYMENT_METHODS.join(', ')}`,
    );
  }
  throw new InvalidPaymentMethodException(
    method,
    `Supported methods are: ${SUPPORTED_PAYMENT_METHODS.join(', ')}`,
  );
}
