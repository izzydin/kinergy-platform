import { SaleDomainException } from './sale-domain.exception';

/**
 * Domain exception thrown when an attempt is made to create a duplicate Sale
 * for an already existing commercial transaction, external order reference,
 * or operational source entity.
 * Codified by ADR-0120 and Rule SALE-010.
 */
export class DuplicateSaleException extends SaleDomainException {
  public override readonly code = 'DUPLICATE_SALE_DETECTED';

  constructor(
    message: string,
    public readonly existingSaleId?: string,
    public readonly tenantId?: string,
  ) {
    super(message, 'DUPLICATE_SALE_DETECTED');
    this.name = 'DuplicateSaleException';
  }
}
