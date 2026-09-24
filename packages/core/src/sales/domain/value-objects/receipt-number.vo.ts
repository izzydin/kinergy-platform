import { ValueObject } from '../shared/value-object';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

/**
 * Value Object representing a human-readable, sequential, tenant-partitioned Receipt voucher number.
 * Conforms to ADR-0117 (e.g. "REC-2026-000001", "REC-2026-000421").
 */
export class ReceiptNumber implements ValueObject<string> {
  public static readonly MAX_LENGTH = 50;
  private static readonly FORMAT_REGEX = /^[A-Za-z0-9_-]{3,50}$/;

  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string') {
      throw new ReceiptDomainException(
        'Receipt number must be a non-empty string.',
        'INVALID_RECEIPT_NUMBER',
      );
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new ReceiptDomainException(
        'Receipt number cannot be empty or whitespace.',
        'INVALID_RECEIPT_NUMBER',
      );
    }

    if (trimmed.length > ReceiptNumber.MAX_LENGTH) {
      throw new ReceiptDomainException(
        `Receipt number cannot exceed ${ReceiptNumber.MAX_LENGTH} characters, got: ${trimmed.length}.`,
        'INVALID_RECEIPT_NUMBER',
      );
    }

    if (!ReceiptNumber.FORMAT_REGEX.test(trimmed)) {
      throw new ReceiptDomainException(
        `Receipt number '${trimmed}' contains invalid characters. Must be 3-50 alphanumeric characters, dashes, or underscores.`,
        'INVALID_RECEIPT_NUMBER',
      );
    }

    this._value = trimmed;
    Object.freeze(this);
  }

  public static create(value: string): ReceiptNumber {
    return new ReceiptNumber(value);
  }

  /**
   * Deterministically constructs a canonical ReceiptNumber from an integer calendar year and sequence index.
   * Enforces zero-padding to 6 digits (e.g. REC-2026-000001).
   */
  public static fromParts(year: number, sequence: number): ReceiptNumber {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ReceiptDomainException(
        `Invalid calendar year for receipt number: '${year}'. Must be an integer between 2000 and 2100.`,
        'INVALID_RECEIPT_NUMBER',
      );
    }
    if (!Number.isInteger(sequence) || sequence <= 0) {
      throw new ReceiptDomainException(
        `Receipt sequence counter must be a strictly positive integer, got: '${sequence}'.`,
        'INVALID_RECEIPT_NUMBER',
      );
    }
    const formattedSeq = String(sequence).padStart(6, '0');
    return new ReceiptNumber(`REC-${year}-${formattedSeq}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string> | undefined | null): boolean {
    if (!other || !(other instanceof ReceiptNumber)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
