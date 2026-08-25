import { ValueObject } from '../../shared/value-object';
import { InvalidQuantityException } from '../exceptions/invalid-quantity.exception';

/**
 * Value Object representing physical or transactional stock quantity.
 * Governed with Scale 2 decimal precision (e.g. 10.00 units, 2.50 liters).
 */
export class Quantity implements ValueObject<number> {
  private readonly _value: number;

  private constructor(value: number, allowNegative = false) {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      throw new InvalidQuantityException(`Quantity must be a valid finite number, got: ${value}.`);
    }
    if (!allowNegative && value < 0) {
      throw new InvalidQuantityException(
        `Quantity cannot be negative, got: ${value}. Invariant [INV-1] violated.`,
      );
    }

    // Normalized to 2 decimal places fixed precision
    this._value = Math.round(value * 100) / 100;
    Object.freeze(this);
  }

  public static of(value: number): Quantity {
    return new Quantity(value, false);
  }

  public static ofDelta(value: number): Quantity {
    return new Quantity(value, true);
  }

  public static zero(): Quantity {
    return new Quantity(0, false);
  }

  public get value(): number {
    return this._value;
  }

  public getValue(): number {
    return this._value;
  }

  public isZero(): boolean {
    return this._value === 0;
  }

  public isPositive(): boolean {
    return this._value > 0;
  }

  public isNegative(): boolean {
    return this._value < 0;
  }

  public add(other: Quantity): Quantity {
    return new Quantity(Math.round((this._value + other.value) * 100) / 100, false);
  }

  public subtract(other: Quantity): Quantity {
    const result = Math.round((this._value - other.value) * 100) / 100;
    if (result < 0) {
      throw new InvalidQuantityException(
        `Resulting quantity cannot be negative (${this._value} - ${other.value} = ${result}).`,
      );
    }
    return new Quantity(result, false);
  }

  public isGreaterThan(other: Quantity): boolean {
    return this._value > other.value;
  }

  public isGreaterThanOrEqual(other: Quantity): boolean {
    return this._value >= other.value;
  }

  public isLessThan(other: Quantity): boolean {
    return this._value < other.value;
  }

  public isLessThanOrEqual(other: Quantity): boolean {
    return this._value <= other.value;
  }

  public equals(other: ValueObject<number>): boolean {
    if (!other || !(other instanceof Quantity)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value.toFixed(2);
  }
}
