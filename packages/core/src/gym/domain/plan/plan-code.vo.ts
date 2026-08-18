import { ValueObject } from '../shared/value-object';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

/**
 * Value Object representing a unique commercial business code for a MembershipPlan.
 * Example formats: 'STD_MONTHLY', 'VIP_ANNUAL_2026', 'PROMO_14D'.
 */
export class PlanCode implements ValueObject<string> {
  private readonly _value: string;

  private constructor(code: string) {
    if (!code || typeof code !== 'string') {
      throw new MembershipPlanInvariantViolationException('Plan code cannot be empty.');
    }
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,50}$/.test(normalized)) {
      throw new MembershipPlanInvariantViolationException(
        `Plan code '${code}' is invalid. Must be 3-50 uppercase alphanumeric characters or underscores.`,
      );
    }
    this._value = normalized;
    Object.freeze(this);
  }

  public static create(code: string): PlanCode {
    return new PlanCode(code);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof PlanCode)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
