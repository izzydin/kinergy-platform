import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when an invalid lifecycle state transition or domain invariant is attempted on a Sale.
 */
export class InvalidSaleStateException extends SaleDomainException {
  public override readonly code: string;

  constructor(message: string, code = 'INVALID_SALE_STATE') {
    super(message, code);
    this.name = this.constructor.name;
    this.code = code;
  }
}
