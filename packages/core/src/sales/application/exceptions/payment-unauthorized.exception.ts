export class PaymentUnauthorizedException extends Error {
  constructor(message: string = 'Caller is not authorized to perform this payment operation.') {
    super(message);
    this.name = 'PaymentUnauthorizedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
