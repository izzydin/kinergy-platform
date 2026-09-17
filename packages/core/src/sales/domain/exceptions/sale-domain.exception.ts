/**
 * Base domain exception for all domain invariant violations within the Sales context.
 */
export class SaleDomainException extends Error {
  public readonly code: string;

  constructor(message: string, code = 'SALE_DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
