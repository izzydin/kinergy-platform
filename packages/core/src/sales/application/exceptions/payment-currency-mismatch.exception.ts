export class PaymentCurrencyMismatchException extends Error {
  constructor(paymentCurrency: string, saleCurrency: string) {
    super(
      `Payment currency '${paymentCurrency}' does not match the associated sale currency '${saleCurrency}'.`,
    );
    this.name = 'PaymentCurrencyMismatchException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
