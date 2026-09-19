import { PaymentDomainException } from './payment-domain.exception';

/**
 * Thrown when a payment reference violates format, length, empty, or security rules.
 */
export class InvalidPaymentReferenceException extends PaymentDomainException {
  public override readonly code = 'INVALID_PAYMENT_REFERENCE';

  constructor(message: string) {
    super(message, 'INVALID_PAYMENT_REFERENCE');
    this.name = 'InvalidPaymentReferenceException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
