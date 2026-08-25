import { ValueObject } from '../../shared/value-object';
import { InvalidSkuException } from '../exceptions/invalid-sku.exception';

/**
 * Value Object representing a normalized Stock Keeping Unit (SKU).
 * Invariant [INV-4]: Unique, uppercase alphanumeric business identifier (3-32 chars).
 */
export class SKU implements ValueObject<string> {
  private readonly _value: string;
  private static readonly SKU_REGEX = /^[A-Z0-9_-]{3,32}$/;

  private constructor(value: string) {
    if (!value || typeof value !== 'string') {
      throw new InvalidSkuException(String(value), 'SKU must be a non-empty string.');
    }
    const normalized = value.trim().toUpperCase();
    if (!SKU.SKU_REGEX.test(normalized)) {
      throw new InvalidSkuException(
        value,
        'SKU must be between 3 and 32 characters, uppercase letters, digits, hyphens, and underscores only.',
      );
    }
    this._value = normalized;
    Object.freeze(this);
  }

  public static create(value: string): SKU {
    return new SKU(value);
  }

  public get value(): string {
    return this._value;
  }

  public getValue(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof SKU)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
