import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when a SaleItem violates structural or business invariants (e.g. non-positive quantity, empty description).
 */
export class InvalidSaleItemException extends SaleDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaleItemException';
  }
}
