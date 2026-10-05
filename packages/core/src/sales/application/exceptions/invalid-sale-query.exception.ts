import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

/**
 * Thrown when a sales query (such as ListSales) fails validation
 * due to invalid pagination parameters, unsupported filter options, or invalid sorting parameters.
 */
export class InvalidSaleQueryException extends InvalidSaleStateException {
  constructor(message: string, code = 'INVALID_SALE_QUERY') {
    super(message, code);
    this.name = this.constructor.name;
  }
}
