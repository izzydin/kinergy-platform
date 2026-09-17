import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when an operation requiring at least one line item is attempted on an empty Sale.
 */
export class EmptySaleException extends SaleDomainException {
  public override readonly code = 'EMPTY_SALE';

  constructor(message = 'Cannot finalize or confirm a Sale with zero line items.') {
    super(message, 'EMPTY_SALE');
    this.name = 'EmptySaleException';
  }
}
