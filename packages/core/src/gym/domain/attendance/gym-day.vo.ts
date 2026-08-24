import { ValueObject } from '../shared/value-object';
import { InvalidAttendanceException } from '../exceptions/invalid-attendance.exception';

export interface GymDayValue {
  readonly localDate: string; // YYYY-MM-DD
  readonly timezone: string;
  readonly facilityId: string;
}

/**
 * Value Object representing a facility-local operational business date.
 * Anchors check-in quotas and daily reporting against the facility timezone rather than UTC or browser time.
 */
export class GymDay implements ValueObject<GymDayValue> {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  private static readonly DEFAULT_TIMEZONE = 'UTC';
  private static readonly DEFAULT_FACILITY_ID = 'main';

  private readonly _localDate: string;
  private readonly _timezone: string;
  private readonly _facilityId: string;

  private constructor(localDate: string, timezone: string, facilityId: string) {
    if (!localDate || !GymDay.DATE_REGEX.test(localDate.trim())) {
      throw new InvalidAttendanceException(
        `GymDay localDate must be formatted as YYYY-MM-DD. Received: '${localDate}'.`,
      );
    }
    const [year, month, day] = localDate.trim().split('-').map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month! - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new InvalidAttendanceException(
        `GymDay localDate '${localDate}' is not a valid calendar date.`,
      );
    }

    if (!timezone || timezone.trim().length === 0) {
      throw new InvalidAttendanceException('GymDay timezone cannot be empty.');
    }

    if (!facilityId || facilityId.trim().length === 0) {
      throw new InvalidAttendanceException('GymDay facilityId cannot be empty.');
    }

    this._localDate = localDate.trim();
    this._timezone = timezone.trim();
    this._facilityId = facilityId.trim();
    Object.freeze(this);
  }

  /**
   * Factory method constructing a GymDay from a local date string.
   */
  public static create(localDate: string, timezone?: string, facilityId?: string): GymDay {
    return new GymDay(
      localDate,
      timezone ?? GymDay.DEFAULT_TIMEZONE,
      facilityId ?? GymDay.DEFAULT_FACILITY_ID,
    );
  }

  /**
   * Factory method computing the local GymDay from a UTC Date instant and facility timezone.
   */
  public static fromUtc(utcDate: Date, timezone?: string, facilityId?: string): GymDay {
    if (!utcDate || !(utcDate instanceof Date) || isNaN(utcDate.getTime())) {
      throw new InvalidAttendanceException('Cannot compute GymDay from an invalid Date.');
    }
    const tz = timezone ?? GymDay.DEFAULT_TIMEZONE;
    const facId = facilityId ?? GymDay.DEFAULT_FACILITY_ID;

    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const localDate = formatter.format(utcDate); // Returns YYYY-MM-DD
      return new GymDay(localDate, tz, facId);
    } catch {
      // Fallback for invalid timezone string
      throw new InvalidAttendanceException(`Invalid or unsupported timezone '${tz}'.`);
    }
  }

  /**
   * Factory method parsing a serialized GymDay string into a Value Object instance.
   * Supports both 'YYYY-MM-DD@facilityId(timezone)' and simple 'YYYY-MM-DD'.
   */
  public static fromString(str: string): GymDay {
    if (!str || typeof str !== 'string') {
      throw new InvalidAttendanceException('Cannot parse GymDay from empty string.');
    }
    const match = str.trim().match(/^(\d{4}-\d{2}-\d{2})(?:@([^()]+)\(([^()]+)\))?$/);
    if (!match) {
      return GymDay.create(str.trim());
    }
    const [, localDate, facilityId, timezone] = match;
    return new GymDay(
      localDate!,
      timezone ?? GymDay.DEFAULT_TIMEZONE,
      facilityId ?? GymDay.DEFAULT_FACILITY_ID,
    );
  }

  public get localDate(): string {
    return this._localDate;
  }

  public get timezone(): string {
    return this._timezone;
  }

  public get facilityId(): string {
    return this._facilityId;
  }

  public getValue(): GymDayValue {
    return {
      localDate: this._localDate,
      timezone: this._timezone,
      facilityId: this._facilityId,
    };
  }

  public equals(other: ValueObject<GymDayValue>): boolean {
    if (!other || !(other instanceof GymDay)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._localDate === otherVal.localDate &&
      this._timezone === otherVal.timezone &&
      this._facilityId === otherVal.facilityId
    );
  }

  public toString(): string {
    return `${this._localDate}@${this._facilityId}(${this._timezone})`;
  }
}
