import { ValueObject } from '../shared/value-object';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

/**
 * Value Object representing a unique domain identifier for a Receipt document entity.
 */
export class ReceiptId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(id: string) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new ReceiptDomainException(
        'Receipt ID cannot be empty or whitespace.',
        'INVALID_RECEIPT_ID',
      );
    }
    this._value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): ReceiptId {
    if (id !== undefined) {
      return new ReceiptId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new ReceiptId(`rec_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string> | undefined | null): boolean {
    if (!other || !(other instanceof ReceiptId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
