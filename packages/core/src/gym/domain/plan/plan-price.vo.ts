import { ValueObject } from '../shared/value-object';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

export interface PlanPriceProps {
  amount: number;
  currency: string;
}

/**
 * Value Object representing commercial monetary pricing for a MembershipPlan.
 * Stores non-negative amounts with explicit ISO-4217 currency.
 */
export class PlanPrice implements ValueObject<PlanPriceProps> {
  private readonly _amount: number;
  private readonly _currency: string;

  private constructor(amount: number, currency: string) {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount < 0) {
      throw new MembershipPlanInvariantViolationException(
        `Plan price amount must be a finite non-negative number, got: ${amount}.`,
      );
    }
    if (!currency || typeof currency !== 'string') {
      throw new MembershipPlanInvariantViolationException('Plan price currency cannot be empty.');
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new MembershipPlanInvariantViolationException(
        `Plan currency '${currency}' is invalid. Must be a 3-letter ISO-4217 code (e.g. USD, EUR).`,
      );
    }

    // Round to 2 decimal places to prevent floating-point inaccuracies
    this._amount = Math.round(amount * 100) / 100;
    this._currency = normalizedCurrency;
    Object.freeze(this);
  }

  public static create(amount: number, currency = 'USD'): PlanPrice {
    return new PlanPrice(amount, currency);
  }

  public static free(currency = 'USD'): PlanPrice {
    return new PlanPrice(0, currency);
  }

  public get amount(): number {
    return this._amount;
  }

  public get currency(): string {
    return this._currency;
  }

  public isFree(): boolean {
    return this._amount === 0;
  }

  public getValue(): PlanPriceProps {
    return {
      amount: this._amount,
      currency: this._currency,
    };
  }

  public equals(other: ValueObject<PlanPriceProps>): boolean {
    if (!other || !(other instanceof PlanPrice)) {
      return false;
    }
    return this._amount === other.amount && this._currency === other.currency;
  }

  public toString(): string {
    return `${this._amount.toFixed(2)} ${this._currency}`;
  }
}
