import { ValueObject } from '../shared/value-object';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

/**
 * Value Object representing a unique MembershipPlan aggregate identifier.
 */
export class PlanId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(id: string) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new MembershipPlanInvariantViolationException('Plan ID cannot be empty.');
    }
    this._value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): PlanId {
    if (id !== undefined) {
      return new PlanId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new PlanId(`plan_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof PlanId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
