import { PaymentDomainException } from './payment-domain.exception';

/**
 * Thrown when an invalid or unrecognized payment status is encountered.
 */
export class InvalidPaymentStatusException extends PaymentDomainException {
  public override readonly code = 'INVALID_PAYMENT_STATUS';

  constructor(status: unknown) {
    super(`Invalid payment status: '${String(status)}'.`, 'INVALID_PAYMENT_STATUS');
    this.name = 'InvalidPaymentStatusException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
