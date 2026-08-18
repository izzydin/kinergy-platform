import { ValueObject } from '../shared/value-object';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

/**
 * Value Object representing the fixed duration in days of a MembershipPlan.
 */
export class PlanDuration implements ValueObject<number> {
  private readonly _durationInDays: number;

  private constructor(durationInDays: number) {
    if (
      typeof durationInDays !== 'number' ||
      !Number.isInteger(durationInDays) ||
      durationInDays < 1
    ) {
      throw new MembershipPlanInvariantViolationException(
        `Plan duration must be a positive integer >= 1 day, got: ${durationInDays}.`,
      );
    }
    this._durationInDays = durationInDays;
    Object.freeze(this);
  }

  public static ofDays(days: number): PlanDuration {
    return new PlanDuration(days);
  }

  public static ofMonths(months: number): PlanDuration {
    if (typeof months !== 'number' || !Number.isInteger(months) || months < 1) {
      throw new MembershipPlanInvariantViolationException(
        `Plan duration months must be a positive integer >= 1, got: ${months}.`,
      );
    }
    return new PlanDuration(months * 30);
  }

  public get durationInDays(): number {
    return this._durationInDays;
  }

  public getValue(): number {
    return this._durationInDays;
  }

  public get value(): number {
    return this._durationInDays;
  }

  /**
   * Calculates deterministic contract end date given a start date.
   */
  public calculateEndDate(startDate: Date): Date {
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new MembershipPlanInvariantViolationException(
        'Invalid start date provided for period calculation.',
      );
    }
    return new Date(startDate.getTime() + this._durationInDays * 24 * 60 * 60 * 1000);
  }

  public equals(other: ValueObject<number>): boolean {
    if (!other || !(other instanceof PlanDuration)) {
      return false;
    }
    return this._durationInDays === other.getValue();
  }

  public toString(): string {
    return `${this._durationInDays} days`;
  }
}
