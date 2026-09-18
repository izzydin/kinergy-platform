import { ValueObject } from '../shared/value-object';
import { DiscountType, isValidDiscountType } from '../enums/discount-type.enum';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { Money } from './money.vo';

export interface DiscountProps {
  type: DiscountType;
  value: number;
  reason?: string | null;
}

/**
 * Value Object encapsulating a commercial price reduction.
 * Supports percentage reductions (0-100%) or fixed amounts, with an optional business justification reason.
 * All financial reductions execute in integer minor units (cents) via canonical Money arithmetic.
 */
export class Discount implements ValueObject<DiscountProps> {
  public static readonly MAX_PERCENTAGE = 100;
  public static readonly MAX_REASON_LENGTH = 255;

  private readonly _type: DiscountType;
  private readonly _value: number;
  private readonly _reason: string | null;

  private constructor(props: DiscountProps) {
    if (!props) {
      throw new InvalidDiscountException('DiscountProps cannot be null or undefined.');
    }
    if (!props.type || !isValidDiscountType(props.type)) {
      throw new InvalidDiscountException(`Invalid discount type: '${props.type}'.`);
    }
    if (typeof props.value !== 'number' || isNaN(props.value) || !isFinite(props.value)) {
      throw new InvalidDiscountException(
        `Discount value must be a finite number, got: ${props.value}.`,
      );
    }
    if (props.value < 0) {
      throw new InvalidDiscountException(`Discount value cannot be negative, got: ${props.value}.`);
    }

    const isPct = props.type === DiscountType.PERCENTAGE;
    if (isPct && props.value > Discount.MAX_PERCENTAGE) {
      throw new InvalidDiscountException(
        `Percentage discount cannot exceed ${Discount.MAX_PERCENTAGE}%, got: ${props.value}%.`,
      );
    }

    let normalizedReason: string | null = null;
    if (props.reason !== undefined && props.reason !== null) {
      if (typeof props.reason !== 'string') {
        throw new InvalidDiscountException('Discount reason must be a string if provided.');
      }
      const trimmed = props.reason.trim();
      if (trimmed.length === 0) {
        throw new InvalidDiscountException(
          'Discount reason, if provided, cannot be empty or whitespace.',
        );
      }
      if (trimmed.length > Discount.MAX_REASON_LENGTH) {
        throw new InvalidDiscountException(
          `Discount reason cannot exceed ${Discount.MAX_REASON_LENGTH} characters.`,
        );
      }
      normalizedReason = trimmed;
    }

    this._type = props.type;
    this._value = Math.round((props.value + Number.EPSILON) * 100) / 100;
    this._reason = normalizedReason;
    Object.freeze(this);
  }

  public static create(props: DiscountProps): Discount {
    return new Discount(props);
  }

  public static percentage(percentage: number, reason?: string | null): Discount {
    return new Discount({
      type: DiscountType.PERCENTAGE,
      value: percentage,
      reason,
    });
  }

  public static fixed(amount: number, reason?: string | null): Discount {
    return new Discount({
      type: DiscountType.FIXED,
      value: amount,
      reason,
    });
  }

  public static fixedAmount(amount: number, reason?: string | null): Discount {
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

  public get reason(): string | null {
    return this._reason;
  }

  public isPercentage(): boolean {
    return this._type === DiscountType.PERCENTAGE;
  }

  public isFixed(): boolean {
    return this._type === DiscountType.FIXED || this._type === DiscountType.FIXED_AMOUNT;
  }

  /**
   * Calculates the deterministic discount amount for an eligible monetary amount.
   *
   * Invariants:
   * - discountAmount >= 0
   * - discountAmount <= eligibleAmount
   * - For FIXED discounts: if discount > eligibleAmount, throws InvalidDiscountException.
   * - For PERCENTAGE discounts: calculates reduction using Commercial Half-Up rounding in integer cents.
   * - Rejects negative, NaN, or non-finite eligible amounts.
   */
  public calculate(eligibleAmount: Money): Money;
  public calculate(eligibleAmount: number, currency?: string): Money;
  public calculate(eligibleAmount: Money | number, currency = 'USD'): Money {
    let amount: number;
    let curr: string;
    let eligibleInCents: number;

    if (eligibleAmount instanceof Money) {
      eligibleInCents = eligibleAmount.cents;
      amount = eligibleAmount.amount;
      curr = eligibleAmount.currency;
    } else if (typeof eligibleAmount === 'number') {
      if (isNaN(eligibleAmount) || !isFinite(eligibleAmount)) {
        throw new InvalidDiscountException(
          `Eligible amount must be a finite number, got: ${eligibleAmount}.`,
        );
      }
      if (eligibleAmount < 0) {
        throw new InvalidDiscountException(
          `Eligible amount cannot be negative, got: ${eligibleAmount}.`,
        );
      }
      amount = Math.round((eligibleAmount + Number.EPSILON) * 100) / 100;
      eligibleInCents = Math.round(amount * 100);
      curr = currency;
    } else {
      throw new InvalidDiscountException(
        'Eligible amount must be a valid Money instance or non-negative number.',
      );
    }

    if (amount < 0 || eligibleInCents < 0) {
      throw new InvalidDiscountException(`Eligible amount cannot be negative, got: ${amount}.`);
    }

    if (this.isFixed()) {
      const discountInCents = Math.round(this._value * 100);
      if (discountInCents > eligibleInCents) {
        throw new InvalidDiscountException(
          `Fixed discount (${this._value}) cannot exceed eligible amount (${amount}).`,
        );
      }
      return Money.fromCents(discountInCents, curr);
    }

    // Percentage discount
    if (eligibleInCents === 0) {
      return Money.zero(curr);
    }

    const discountInCents = Math.round((eligibleInCents * this._value) / 100 + 1e-8);
    const guardedDiscountInCents = Math.min(eligibleInCents, Math.max(0, discountInCents));
    return Money.fromCents(guardedDiscountInCents, curr);
  }

  /**
   * Calculates the exact monetary reduction against a given subtotal in integer cents,
   * guaranteeing that reduction does not exceed the subtotal and operates without floating-point drift.
   */
  public calculateReduction(subtotal: Money): Money {
    if (!subtotal || !(subtotal instanceof Money)) {
      throw new InvalidDiscountException('Subtotal must be a valid Money instance.');
    }
    if (subtotal.isZero()) {
      return Money.zero(subtotal.currency);
    }

    const subtotalInCents = subtotal.cents;
    let calculatedReductionInCents: number;

    if (this.isPercentage()) {
      // Scale percentage to integer cents using Commercial Half-Up rounding
      calculatedReductionInCents = Math.round((subtotalInCents * this._value) / 100 + 1e-8);
    } else {
      calculatedReductionInCents = Math.round(this._value * 100);
    }

    // Ceiling: reduction cannot exceed subtotal in cents; cannot be negative
    const cappedReductionInCents = Math.min(
      subtotalInCents,
      Math.max(0, calculatedReductionInCents),
    );

    return Money.fromCents(cappedReductionInCents, subtotal.currency);
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
    const typeEquals = this._type === other.type || (this.isFixed() && other.isFixed());
    const valueEquals = this._value === other.value;
    const reasonEquals = (this._reason ?? null) === (other.reason ?? null);
    return typeEquals && valueEquals && reasonEquals;
  }

  public toString(): string {
    const reasonSuffix = this._reason ? ` (${this._reason})` : '';
    return this.isPercentage()
      ? `${this._value}%${reasonSuffix}`
      : `$${this._value.toFixed(2)}${reasonSuffix}`;
  }
}
