/**
 * Infrastructure exception thrown when a persistence error occurs in the Payment repository
 * that cannot be mapped to a known domain or application constraint violation.
 * Encapsulates lower-level database details while preserving full error cause and stack context.
 */
export class PaymentPersistenceException extends Error {
  public readonly code: string = 'PAYMENT_PERSISTENCE_FAILURE';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaymentPersistenceException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
