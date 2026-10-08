import { PaymentDomainException } from '../../domain/exceptions/payment-domain.exception';

/**
 * Thrown when a payment query (such as ListPayments) fails validation
 * due to invalid pagination parameters, unsupported filter options, or invalid sorting parameters.
 */
export class InvalidPaymentQueryException extends PaymentDomainException {
  constructor(message: string, code = 'INVALID_PAYMENT_QUERY') {
    super(message, code);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
