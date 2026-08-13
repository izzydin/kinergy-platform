import { ValueObject } from '../../shared/value-object';
import { RecurrenceFrequency } from './recurrence-frequency.enum';

export interface LocalTimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

export interface RecurrencePatternProps {
  readonly frequency: RecurrenceFrequency;
  readonly startDate: Date;
  readonly endDate?: Date;
  readonly maxOccurrences?: number;
  readonly localStartTime: LocalTimeOfDay;
  readonly durationMinutes: number;
  readonly timezone?: string;
}

export class RecurrencePattern implements ValueObject<RecurrencePatternProps> {
  private readonly props: RecurrencePatternProps;

  private constructor(props: RecurrencePatternProps) {
    if (!props.frequency || !Object.values(RecurrenceFrequency).includes(props.frequency)) {
      throw new Error(`Invalid recurrence frequency: '${props.frequency}'.`);
    }

    if (!props.startDate || isNaN(props.startDate.getTime())) {
      throw new Error('Valid startDate is required for RecurrencePattern.');
    }

    if (props.endDate !== undefined) {
      if (isNaN(props.endDate.getTime())) {
        throw new Error('endDate must be a valid date.');
      }
      if (props.endDate.getTime() <= props.startDate.getTime()) {
        throw new Error('endDate must be strictly after startDate.');
      }
    }

    if (props.maxOccurrences !== undefined) {
      if (props.maxOccurrences < 1 || !Number.isInteger(props.maxOccurrences)) {
        throw new Error('maxOccurrences must be an integer greater than or equal to 1.');
      }
    }

    if (
      !props.localStartTime ||
      props.localStartTime.hour < 0 ||
      props.localStartTime.hour > 23 ||
      props.localStartTime.minute < 0 ||
      props.localStartTime.minute > 59
    ) {
      throw new Error('Valid localStartTime (hour 0..23, minute 0..59) is required.');
    }

    if (!props.durationMinutes || props.durationMinutes <= 0) {
      throw new Error('durationMinutes must be a positive integer.');
    }

    this.props = {
      frequency: props.frequency,
      startDate: new Date(props.startDate.getTime()),
      endDate: props.endDate ? new Date(props.endDate.getTime()) : undefined,
      maxOccurrences: props.maxOccurrences,
      localStartTime: { ...props.localStartTime },
      durationMinutes: props.durationMinutes,
      timezone: props.timezone ?? 'UTC',
    };

    Object.freeze(this);
  }

  public static create(props: RecurrencePatternProps): RecurrencePattern {
    return new RecurrencePattern(props);
  }

  public get frequency(): RecurrenceFrequency {
    return this.props.frequency;
  }

  public get startDate(): Date {
    return new Date(this.props.startDate.getTime());
  }

  public get endDate(): Date | undefined {
    return this.props.endDate ? new Date(this.props.endDate.getTime()) : undefined;
  }

  public get maxOccurrences(): number | undefined {
    return this.props.maxOccurrences;
  }

  public get localStartTime(): LocalTimeOfDay {
    return { ...this.props.localStartTime };
  }

  public get durationMinutes(): number {
    return this.props.durationMinutes;
  }

  public get timezone(): string {
    return this.props.timezone ?? 'UTC';
  }

  /**
   * Helper returning maximum days in a zero-indexed month for a given year.
   */
  public static getLastDayOfMonth(year: number, monthZeroBased: number): number {
    return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
  }

  /**
   * Deterministically calculates occurrence start dates based on pattern rules and boundaries.
   */
  public generateOccurrenceDates(limitDate?: Date, maxCount?: number): Date[] {
    const dates: Date[] = [];

    const effectiveMaxCount =
      this.props.maxOccurrences !== undefined
        ? maxCount !== undefined
          ? Math.min(this.props.maxOccurrences, maxCount)
          : this.props.maxOccurrences
        : (maxCount ?? Number.MAX_SAFE_INTEGER);

    const effectiveLimitDate =
      this.props.endDate !== undefined
        ? limitDate !== undefined && limitDate.getTime() < this.props.endDate.getTime()
          ? limitDate
          : this.props.endDate
        : limitDate;

    const baseStart = this.props.startDate;
    const origYear = baseStart.getUTCFullYear();
    const origMonth = baseStart.getUTCMonth();
    const origDay = baseStart.getUTCDate();

    let step = 0;

    while (dates.length < effectiveMaxCount) {
      let candidateDate: Date;

      if (this.props.frequency === RecurrenceFrequency.WEEKLY) {
        candidateDate = new Date(baseStart.getTime() + step * 7 * 24 * 60 * 60 * 1000);
      } else if (this.props.frequency === RecurrenceFrequency.BIWEEKLY) {
        candidateDate = new Date(baseStart.getTime() + step * 14 * 24 * 60 * 60 * 1000);
      } else {
        // MONTHLY with Clamping Policy
        const totalMonths = origMonth + step;
        const targetYear = origYear + Math.floor(totalMonths / 12);
        const targetMonth = ((totalMonths % 12) + 12) % 12;

        const maxDaysInTargetMonth = RecurrencePattern.getLastDayOfMonth(targetYear, targetMonth);
        const clampedDay = Math.min(origDay, maxDaysInTargetMonth);

        candidateDate = new Date(
          Date.UTC(
            targetYear,
            targetMonth,
            clampedDay,
            this.props.localStartTime.hour,
            this.props.localStartTime.minute,
            0,
            0,
          ),
        );
      }

      if (effectiveLimitDate && candidateDate.getTime() > effectiveLimitDate.getTime()) {
        break;
      }

      dates.push(candidateDate);
      step++;
    }

    return dates;
  }

  public getValue(): RecurrencePatternProps {
    return {
      ...this.props,
      startDate: new Date(this.props.startDate.getTime()),
      endDate: this.props.endDate ? new Date(this.props.endDate.getTime()) : undefined,
      localStartTime: { ...this.props.localStartTime },
    };
  }

  public equals(other: ValueObject<RecurrencePatternProps>): boolean {
    if (!other || !(other instanceof RecurrencePattern)) {
      return false;
    }
    const val = other.getValue();
    return (
      this.props.frequency === val.frequency &&
      this.props.startDate.getTime() === val.startDate.getTime() &&
      this.props.endDate?.getTime() === val.endDate?.getTime() &&
      this.props.maxOccurrences === val.maxOccurrences &&
      this.props.durationMinutes === val.durationMinutes &&
      this.props.localStartTime.hour === val.localStartTime.hour &&
      this.props.localStartTime.minute === val.localStartTime.minute &&
      this.props.timezone === val.timezone
    );
  }
}
