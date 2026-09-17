import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when attempting to add, modify, or remove items or discounts from a Sale
 * that has departed DRAFT status and is commercially frozen.
 */
export class SaleAlreadyFinalizedException extends SaleDomainException {
  public override readonly code = 'SALE_ALREADY_FINALIZED';

  constructor(
    message = 'Cannot modify items or discounts on a Sale that is already finalized or departing DRAFT status.',
  ) {
    super(message, 'SALE_ALREADY_FINALIZED');
    this.name = 'SaleAlreadyFinalizedException';
  }
}
