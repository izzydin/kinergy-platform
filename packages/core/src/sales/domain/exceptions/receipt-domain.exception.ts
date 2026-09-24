import { SaleDomainException } from './sale-domain.exception';

/**
 * Base domain exception for all domain invariant violations within the Receipt domain.
 * Codified by ADR-0117.
 */
export class ReceiptDomainException extends SaleDomainException {
  constructor(message: string, code = 'RECEIPT_DOMAIN_ERROR') {
    super(message, code);
    this.name = 'ReceiptDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
