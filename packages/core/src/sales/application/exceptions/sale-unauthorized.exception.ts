export class SaleUnauthorizedException extends Error {
  constructor(message: string = 'Caller is not authorized to perform this sale operation.') {
    super(message);
    this.name = 'SaleUnauthorizedException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
