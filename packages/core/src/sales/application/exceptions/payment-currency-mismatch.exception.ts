import { PaymentSaleConsistencyException } from './payment-sale-consistency.exception';

export class PaymentCurrencyMismatchException extends PaymentSaleConsistencyException {
  constructor(paymentCurrency: string, saleCurrency: string) {
    super(
      `Payment currency '${paymentCurrency}' does not match the associated sale currency '${saleCurrency}'.`,
      'PAYMENT_CURRENCY_MISMATCH',
    );
    this.name = 'PaymentCurrencyMismatchException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
