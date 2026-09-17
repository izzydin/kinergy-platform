import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when a discount configuration is mathematically invalid or lacks required business justification.
 */
export class InvalidDiscountException extends SaleDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDiscountException';
  }
}
