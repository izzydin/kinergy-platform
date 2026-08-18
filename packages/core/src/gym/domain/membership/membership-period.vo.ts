import { ValueObject } from '../shared/value-object';
import { InvalidMembershipPeriodException } from '../exceptions/invalid-membership-period.exception';

export interface MembershipPeriodValue {
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * Immutable Value Object representing the validity time interval of a Membership.
 * Enforces start date and end date ordering.
 */
export class MembershipPeriod implements ValueObject<MembershipPeriodValue> {
  private readonly _startDate: Date;
  private readonly _endDate: Date;

  private constructor(startDate: Date, endDate: Date) {
    if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new InvalidMembershipPeriodException('Start date must be a valid Date.');
    }
    if (!endDate || !(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new InvalidMembershipPeriodException('End date must be a valid Date.');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new InvalidMembershipPeriodException(
        `End date (${endDate.toISOString()}) cannot precede or equal start date (${startDate.toISOString()}).`,
      );
    }

    this._startDate = new Date(startDate.getTime());
    this._endDate = new Date(endDate.getTime());
    Object.freeze(this);
  }

  public static create(startDate: Date, endDate: Date): MembershipPeriod {
    return new MembershipPeriod(startDate, endDate);
  }

  public get startDate(): Date {
    return new Date(this._startDate.getTime());
  }

  public get endDate(): Date {
    return new Date(this._endDate.getTime());
  }

  public get durationDays(): number {
    const diffMs = this._endDate.getTime() - this._startDate.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  public contains(date: Date): boolean {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }
    const t = date.getTime();
    return t >= this._startDate.getTime() && t <= this._endDate.getTime();
  }

  public isCurrent(date: Date): boolean {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }
    const t = date.getTime();
    return t >= this._startDate.getTime() && t < this._endDate.getTime();
  }

  public isExpiredAt(date: Date): boolean {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }
    return date.getTime() > this._endDate.getTime();
  }

  public isExpired(date: Date): boolean {
    return this.isExpiredAt(date);
  }

  public overlaps(other: MembershipPeriod): boolean {
    if (!other || !(other instanceof MembershipPeriod)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._startDate.getTime() < otherVal.endDate.getTime() &&
      this._endDate.getTime() > otherVal.startDate.getTime()
    );
  }

  public extend(additionalDays: number): MembershipPeriod {
    if (additionalDays <= 0) {
      throw new InvalidMembershipPeriodException(
        'Extension duration must be greater than zero days.',
      );
    }
    const newEnd = new Date(this._endDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    return new MembershipPeriod(this._startDate, newEnd);
  }

  public getValue(): MembershipPeriodValue {
    return {
      startDate: this.startDate,
      endDate: this.endDate,
    };
  }

  public equals(other: ValueObject<MembershipPeriodValue>): boolean {
    if (!other || !(other instanceof MembershipPeriod)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._startDate.getTime() === otherVal.startDate.getTime() &&
      this._endDate.getTime() === otherVal.endDate.getTime()
    );
  }
}
