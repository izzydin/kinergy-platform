import { SaleDomainException } from './sale-domain.exception';

/**
 * Base domain exception for all invariant violations within the Payment domain.
 */
export class PaymentDomainException extends SaleDomainException {
  constructor(message: string, code = 'PAYMENT_DOMAIN_ERROR') {
    super(message, code);
    this.name = 'PaymentDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
