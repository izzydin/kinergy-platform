import { PaymentSaleConsistencyException } from './payment-sale-consistency.exception';

export class PaymentSaleMismatchException extends PaymentSaleConsistencyException {
  constructor(paymentId: string, paymentSaleId: string, targetSaleId: string) {
    super(
      `Payment with ID '${paymentId}' belongs to Sale '${paymentSaleId}', not to target Sale '${targetSaleId}'.`,
      'PAYMENT_SALE_MISMATCH',
    );
    this.name = 'PaymentSaleMismatchException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
