import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when an invalid lifecycle state transition or currency mismatch is attempted on a Sale.
 */
export class InvalidSaleStateException extends SaleDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaleStateException';
  }
}
