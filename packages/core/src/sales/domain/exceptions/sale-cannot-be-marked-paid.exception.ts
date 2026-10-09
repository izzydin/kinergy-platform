import { InvalidSaleTransitionException } from './invalid-sale-transition.exception';
import { SaleStatus } from '../enums/sale-status.enum';

/**
 * Domain exception thrown when a Sale aggregate cannot transition to PAID status.
 * Permitted only from PENDING_PAYMENT or PARTIALLY_PAID.
 */
export class SaleCannotBeMarkedPaidException extends InvalidSaleTransitionException {
  public override readonly code: string = 'INVALID_SALE_TRANSITION';
  public readonly subcode: string = 'SALE_CANNOT_BE_MARKED_PAID';

  constructor(currentStatus: SaleStatus, reason?: string) {
    const detail =
      reason ??
      `Sale in status '${currentStatus}' cannot be marked as paid. Expected PENDING_PAYMENT or PARTIALLY_PAID.`;
    super(currentStatus, SaleStatus.PAID, detail);
    this.name = 'SaleCannotBeMarkedPaidException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { SaleCannotBeMarkedPaidException as SaleCannotBeMarkedPaid };
