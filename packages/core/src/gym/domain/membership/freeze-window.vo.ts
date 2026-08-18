import { ValueObject } from '../shared/value-object';
import { InvalidMembershipPeriodException } from '../exceptions/invalid-membership-period.exception';

export interface FreezeWindowValue {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason?: string;
}

/**
 * Value Object representing an approved temporary suspension period of a Membership.
 */
export class FreezeWindow implements ValueObject<FreezeWindowValue> {
  private readonly _startDate: Date;
  private readonly _endDate: Date;
  private readonly _reason?: string;

  private constructor(startDate: Date, endDate: Date, reason?: string) {
    if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new InvalidMembershipPeriodException('Freeze start date must be a valid Date.');
    }
    if (!endDate || !(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new InvalidMembershipPeriodException('Freeze end date must be a valid Date.');
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new InvalidMembershipPeriodException('Freeze end date cannot precede start date.');
    }

    this._startDate = new Date(startDate.getTime());
    this._endDate = new Date(endDate.getTime());
    this._reason = reason?.trim() || undefined;
    Object.freeze(this);
  }

  public static create(startDate: Date, endDate: Date, reason?: string): FreezeWindow {
    return new FreezeWindow(startDate, endDate, reason);
  }

  public get startDate(): Date {
    return new Date(this._startDate.getTime());
  }

  public get endDate(): Date {
    return new Date(this._endDate.getTime());
  }

  public get reason(): string | undefined {
    return this._reason;
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

  public getValue(): FreezeWindowValue {
    return {
      startDate: this.startDate,
      endDate: this.endDate,
      reason: this.reason,
    };
  }

  public equals(other: ValueObject<FreezeWindowValue>): boolean {
    if (!other || !(other instanceof FreezeWindow)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._startDate.getTime() === otherVal.startDate.getTime() &&
      this._endDate.getTime() === otherVal.endDate.getTime() &&
      this._reason === otherVal.reason
    );
  }
}
