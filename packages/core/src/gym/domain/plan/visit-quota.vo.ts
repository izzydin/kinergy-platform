import { ValueObject } from '../shared/value-object';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

/**
 * Value Object representing an optional maximum visit quota for a MembershipPlan.
 */
export class VisitQuota implements ValueObject<number> {
  private readonly _maxVisits: number;

  private constructor(maxVisits: number) {
    if (typeof maxVisits !== 'number' || !Number.isInteger(maxVisits) || maxVisits < 1) {
      throw new MembershipPlanInvariantViolationException(
        `Visit quota must be a positive integer >= 1, got: ${maxVisits}.`,
      );
    }
    this._maxVisits = maxVisits;
    Object.freeze(this);
  }

  public static of(maxVisits: number): VisitQuota {
    return new VisitQuota(maxVisits);
  }

  public get maxVisits(): number {
    return this._maxVisits;
  }

  public getValue(): number {
    return this._maxVisits;
  }

  public get value(): number {
    return this._maxVisits;
  }

  public equals(other: ValueObject<number>): boolean {
    if (!other || !(other instanceof VisitQuota)) {
      return false;
    }
    return this._maxVisits === other.getValue();
  }

  public toString(): string {
    return `${this._maxVisits} visits`;
  }
}
