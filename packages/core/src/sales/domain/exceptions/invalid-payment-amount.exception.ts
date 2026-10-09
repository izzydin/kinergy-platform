import { PaymentDomainException } from './payment-domain.exception';

/**
 * Thrown when an invalid monetary amount is provided for a Payment aggregate.
 * Enforces domain invariants: amount must be strictly greater than zero and have valid currency precision.
 */
export class InvalidPaymentAmountException extends PaymentDomainException {
  public override readonly code: string;

  constructor(
    message: string = 'Payment amount must be strictly greater than zero.',
    code: string = 'INVALID_PAYMENT_AMOUNT',
  ) {
    super(message, code);
    this.name = 'InvalidPaymentAmountException';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { InvalidPaymentAmountException as InvalidPaymentAmount };
