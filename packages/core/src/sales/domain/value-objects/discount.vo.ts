import { ValueObject } from '../shared/value-object';
import { DiscountType, isValidDiscountType } from '../enums/discount-type.enum';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { Money } from './money.vo';

export interface DiscountProps {
  type: DiscountType;
  value: number;
  reason: string;
}

/**
 * Value Object encapsulating a commercial price reduction.
 * Supports percentage reductions (0-100%) or fixed amounts, strictly justified by a reason.
 */
export class Discount implements ValueObject<DiscountProps> {
  private readonly _type: DiscountType;
  private readonly _value: number;
  private readonly _reason: string;

  private constructor(props: DiscountProps) {
    if (!props.type || !isValidDiscountType(props.type)) {
      throw new InvalidDiscountException(`Invalid discount type: '${props.type}'.`);
    }
    if (
      typeof props.value !== 'number' ||
      isNaN(props.value) ||
      !isFinite(props.value) ||
      props.value < 0
    ) {
      throw new InvalidDiscountException(
        `Discount value must be a finite non-negative number, got: ${props.value}.`,
      );
    }
    if (props.type === DiscountType.PERCENTAGE && props.value > 100) {
      throw new InvalidDiscountException(
        `Percentage discount cannot exceed 100%, got: ${props.value}%.`,
      );
    }
    if (!props.reason || typeof props.reason !== 'string' || props.reason.trim().length === 0) {
      throw new InvalidDiscountException(
        'Discount must have a non-empty business justification reason.',
      );
    }

    this._type = props.type;
    this._value =
      props.type === DiscountType.PERCENTAGE
        ? Math.round(props.value * 100) / 100
        : Math.round(props.value * 100) / 100;
    this._reason = props.reason.trim();
    Object.freeze(this);
  }

  public static create(props: DiscountProps): Discount {
    return new Discount(props);
  }

  public static percentage(percentage: number, reason: string): Discount {
    return new Discount({
      type: DiscountType.PERCENTAGE,
      value: percentage,
      reason,
    });
  }

  public static fixedAmount(amount: number, reason: string): Discount {
    return new Discount({
      type: DiscountType.FIXED_AMOUNT,
      value: amount,
      reason,
    });
  }

  public get type(): DiscountType {
    return this._type;
  }

  public get value(): number {
    return this._value;
  }

  public get reason(): string {
    return this._reason;
  }

  /**
   * Calculates the exact monetary reduction against a given subtotal,
   * guaranteeing that reduction does not exceed the subtotal and operates in integer cents.
   */
  public calculateReduction(subtotal: Money): Money {
    if (subtotal.isZero()) {
      return Money.zero(subtotal.currency);
    }

    let calculatedReduction: number;
    if (this._type === DiscountType.PERCENTAGE) {
      calculatedReduction = Math.round(subtotal.amount * (this._value / 100) * 100) / 100;
    } else {
      calculatedReduction = this._value;
    }

    const cappedReduction = Math.min(subtotal.amount, Math.max(0, calculatedReduction));
    return Money.create(Math.round(cappedReduction * 100) / 100, subtotal.currency);
  }

  public getValue(): DiscountProps {
    return {
      type: this._type,
      value: this._value,
      reason: this._reason,
    };
  }

  public equals(other: ValueObject<DiscountProps> | undefined | null): boolean {
    if (!other || !(other instanceof Discount)) {
      return false;
    }
    return (
      this._type === other.type && this._value === other.value && this._reason === other.reason
    );
  }

  public toString(): string {
    return this._type === DiscountType.PERCENTAGE
      ? `${this._value}% (${this._reason})`
      : `$${this._value.toFixed(2)} (${this._reason})`;
  }
}
