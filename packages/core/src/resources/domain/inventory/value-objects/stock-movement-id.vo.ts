import { ValueObject } from '../../shared/value-object';
import { InvalidInventoryItemStateException } from '../exceptions/invalid-inventory-item-state.exception';

/**
 * Strongly typed Identifier for StockMovement Child Entity.
 */
export class StockMovementId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidInventoryItemStateException('StockMovementId cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(value?: string): StockMovementId {
    return new StockMovementId(value ?? crypto.randomUUID());
  }

  public getValue(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof StockMovementId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
