import { SaleDomainException } from './sale-domain.exception';

/**
 * Thrown when attempting to construct an invalid or malformed SaleSource value object.
 * (e.g. unsupported source type, empty/whitespace reference ID, or invalid serialization).
 */
export class InvalidSaleSourceException extends SaleDomainException {
  constructor(message: string, code = 'INVALID_SALE_SOURCE') {
    super(message, code);
  }
}
