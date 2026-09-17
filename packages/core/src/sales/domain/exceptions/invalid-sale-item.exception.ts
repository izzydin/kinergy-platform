import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when a SaleItem violates structural or business invariants (e.g. non-positive quantity, empty description).
 */
export class InvalidSaleItemException extends SaleDomainException {
  public override readonly code = 'INVALID_SALE_ITEM';

  constructor(message: string) {
    super(message, 'INVALID_SALE_ITEM');
    this.name = 'InvalidSaleItemException';
  }
}
