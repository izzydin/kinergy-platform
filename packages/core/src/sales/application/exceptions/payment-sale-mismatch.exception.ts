export class PaymentSaleMismatchException extends Error {
  constructor(paymentId: string, paymentSaleId: string, targetSaleId: string) {
    super(
      `Payment with ID '${paymentId}' belongs to Sale '${paymentSaleId}', not to target Sale '${targetSaleId}'.`,
    );
    this.name = 'PaymentSaleMismatchException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
