/**
 * Base domain exception for all Resources bounded context domain rule violations.
 */
export class ResourcesDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourcesDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
