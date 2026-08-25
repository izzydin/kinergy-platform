import { ValueObject } from '../../shared/value-object';
import { InvalidInventoryItemStateException } from '../exceptions/invalid-inventory-item-state.exception';

/**
 * Strongly typed Identifier for InventoryItem Aggregate Root.
 */
export class InventoryItemId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidInventoryItemStateException('InventoryItemId cannot be empty.');
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  public static create(value?: string): InventoryItemId {
    return new InventoryItemId(value ?? crypto.randomUUID());
  }

  public getValue(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof InventoryItemId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
