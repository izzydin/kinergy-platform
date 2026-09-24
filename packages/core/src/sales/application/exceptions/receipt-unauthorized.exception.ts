export class ReceiptUnauthorizedException extends Error {
  constructor(message = 'Unauthorized receipt operation.') {
    super(message);
    this.name = 'ReceiptUnauthorizedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
