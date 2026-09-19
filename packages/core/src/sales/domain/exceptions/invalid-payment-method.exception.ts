import { PaymentDomainException } from './payment-domain.exception';

/**
 * Thrown when an unrecognized, unsupported, or future payment method is provided.
 */
export class InvalidPaymentMethodException extends PaymentDomainException {
  public override readonly code = 'INVALID_PAYMENT_METHOD';

  constructor(method: unknown, reason?: string) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Invalid or unsupported payment method: '${String(method)}'${detail}.`,
      'INVALID_PAYMENT_METHOD',
    );
    this.name = 'InvalidPaymentMethodException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
