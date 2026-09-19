import { ValueObject } from '../shared/value-object';
import { InvalidPaymentReferenceException } from '../exceptions/invalid-payment-reference.exception';

/**
 * Value Object representing an external transaction or operator reference for a Payment.
 *
 * In accordance with ADR-0115:
 * - For QR Payments: Digital transaction trace ID, provider correlation key, or QR invoice token.
 * - For CASH Payments: Optional cash drawer audit tag, register receipt sequence, or cashier identifier.
 *
 * Domain Rules:
 * - Absent reference: represented as null / undefined at application boundaries.
 * - Empty reference: rejected (cannot be empty string or whitespace-only).
 * - Maximum length: 100 characters.
 * - Allowed characters: Alphanumeric characters, spaces, hyphens, underscores, slashes, dots, colons, and hash (#).
 * - Security: Rejects sensitive credit card Primary Account Number (PAN) sequences (13-19 digits).
 */
export class PaymentReference implements ValueObject<string> {
  public static readonly MAX_LENGTH = 100;
  private static readonly VALID_CHARS_REGEX = /^[A-Za-z0-9#\-_/.: ]+$/;
  private static readonly SENSITIVE_PAN_REGEX = /\b(?:\d[ -]*?){13,19}\b/;

  private readonly _value: string;

  private constructor(value: string) {
    if (typeof value !== 'string') {
      throw new InvalidPaymentReferenceException('Payment reference must be a string.');
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new InvalidPaymentReferenceException(
        'Payment reference cannot be empty or contain only whitespace.',
      );
    }

    if (trimmed.length > PaymentReference.MAX_LENGTH) {
      throw new InvalidPaymentReferenceException(
        `Payment reference cannot exceed ${PaymentReference.MAX_LENGTH} characters. Received ${trimmed.length} characters.`,
      );
    }

    if (!PaymentReference.VALID_CHARS_REGEX.test(trimmed)) {
      throw new InvalidPaymentReferenceException(
        `Payment reference contains prohibited characters: '${trimmed}'. Only alphanumeric characters and safe punctuation (#, -, _, /, ., :, space) are permitted.`,
      );
    }

    if (PaymentReference.SENSITIVE_PAN_REGEX.test(trimmed)) {
      throw new InvalidPaymentReferenceException(
        'Payment reference must not contain sensitive cardholder data or credit card numbers.',
      );
    }

    this._value = trimmed;
    Object.freeze(this);
  }

  /**
   * Factory method to create a PaymentReference from a required non-empty string.
   */
  public static create(value: string): PaymentReference {
    return new PaymentReference(value);
  }

  /**
   * Factory method to create an optional PaymentReference.
   * Returns null if value is absent (null, undefined).
   * Throws InvalidPaymentReferenceException if value is empty string, whitespace, or invalid.
   */
  public static from(value?: string | null): PaymentReference | null {
    if (value === null || value === undefined) {
      return null;
    }
    return new PaymentReference(value);
  }

  /**
   * Validates whether a value is a valid payment reference string without throwing.
   */
  public static isValid(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > PaymentReference.MAX_LENGTH) {
      return false;
    }
    if (!PaymentReference.VALID_CHARS_REGEX.test(trimmed)) {
      return false;
    }
    if (PaymentReference.SENSITIVE_PAN_REGEX.test(trimmed)) {
      return false;
    }
    return true;
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string> | undefined | null): boolean {
    if (!other || !(other instanceof PaymentReference)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
