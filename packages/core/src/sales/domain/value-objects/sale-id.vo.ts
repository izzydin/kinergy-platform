import { ValueObject } from '../shared/value-object';
import { SaleDomainException } from '../exceptions/sale-domain.exception';

/**
 * Value Object representing a unique identifier for a Sale aggregate root.
 */
export class SaleId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(id: string) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new SaleDomainException('Sale ID cannot be empty.', 'INVALID_SALE_ID');
    }
    this._value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): SaleId {
    if (id !== undefined) {
      return new SaleId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new SaleId(`sale_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string> | undefined | null): boolean {
    if (!other || !(other instanceof SaleId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
