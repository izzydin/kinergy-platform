/**
 * Infrastructure exception thrown when a persistence error occurs in the Receipt repository
 * that cannot be mapped to a known domain or application constraint violation.
 * Encapsulates lower-level database details while preserving full error cause and stack context.
 */
export class ReceiptPersistenceException extends Error {
  public readonly code: string = 'RECEIPT_PERSISTENCE_FAILURE';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ReceiptPersistenceException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
