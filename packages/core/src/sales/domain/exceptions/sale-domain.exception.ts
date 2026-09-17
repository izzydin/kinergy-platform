/**
 * Base domain exception for all domain invariant violations within the Sales context.
 */
export class SaleDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
