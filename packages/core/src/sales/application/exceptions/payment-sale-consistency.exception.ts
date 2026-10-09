/**
 * Application exception thrown when a cross-aggregate consistency violation occurs
 * between a Payment and its associated Sale aggregate.
 */
export class PaymentSaleConsistencyException extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'PAYMENT_SALE_CONSISTENCY_FAILURE') {
    super(message);
    this.name = 'PaymentSaleConsistencyException';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { PaymentSaleConsistencyException as PaymentSaleConsistencyFailure };
