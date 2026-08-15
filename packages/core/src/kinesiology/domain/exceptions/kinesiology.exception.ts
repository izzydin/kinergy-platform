/**
 * Base domain exception for the Kinesiology bounded context.
 */
export abstract class KinesiologyDomainException extends Error {
  public abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
