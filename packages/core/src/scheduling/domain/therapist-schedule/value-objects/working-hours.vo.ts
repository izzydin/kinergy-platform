import { ValueObject } from '../../shared/value-object';
import { TimeRange } from '../../value-objects/time-range.vo';

export interface WorkingHoursProps {
  readonly dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  readonly startMinute: number; // Minutes from 00:00 (e.g. 540 = 09:00)
  readonly endMinute: number; // Minutes from 00:00 (e.g. 1020 = 17:00)
}

export class WorkingHours implements ValueObject<WorkingHoursProps> {
  private readonly props: WorkingHoursProps;

  private constructor(props: WorkingHoursProps) {
    if (props.dayOfWeek < 0 || props.dayOfWeek > 6) {
      throw new Error('Day of week must be between 0 (Sunday) and 6 (Saturday).');
    }
    if (props.startMinute < 0 || props.endMinute > 1440 || props.startMinute >= props.endMinute) {
      throw new Error(
        'Invalid working hours minutes: start minute must be less than end minute within 0..1440 range.',
      );
    }

    this.props = { ...props };
    Object.freeze(this);
  }

  public static create(dayOfWeek: number, startMinute: number, endMinute: number): WorkingHours {
    return new WorkingHours({ dayOfWeek, startMinute, endMinute });
  }

  public static fromTimeStrings(
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): WorkingHours {
    const parseMinutes = (timeStr: string): number => {
      const [hStr, mStr] = timeStr.split(':');
      if (!hStr || !mStr) {
        throw new Error(`Invalid time string format '${timeStr}'. Expected 'HH:MM'.`);
      }
      const hours = parseInt(hStr, 10);
      const minutes = parseInt(mStr, 10);
      if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        throw new Error(`Invalid time values in '${timeStr}'.`);
      }
      return hours * 60 + minutes;
    };

    return new WorkingHours({
      dayOfWeek,
      startMinute: parseMinutes(startTime),
      endMinute: parseMinutes(endTime),
    });
  }

  public get dayOfWeek(): number {
    return this.props.dayOfWeek;
  }

  public get startMinute(): number {
    return this.props.startMinute;
  }

  public get endMinute(): number {
    return this.props.endMinute;
  }

  /**
   * Evaluates if the provided time range falls entirely within working hours.
   */
  public isWorking(range: TimeRange, _timezone = 'UTC'): boolean {
    const start = range.start;
    const end = range.end;

    // Must be on the specified day of week
    if (start.getUTCDay() !== this.props.dayOfWeek || end.getUTCDay() !== this.props.dayOfWeek) {
      return false;
    }

    const startMinute = start.getUTCHours() * 60 + start.getUTCMinutes();
    let endMinute = end.getUTCHours() * 60 + end.getUTCMinutes();
    if (end.getUTCSeconds() > 0 || end.getUTCMilliseconds() > 0) {
      endMinute += 1;
    }

    return startMinute >= this.props.startMinute && endMinute <= this.props.endMinute;
  }

  public getValue(): WorkingHoursProps {
    return { ...this.props };
  }

  public equals(other: ValueObject<WorkingHoursProps>): boolean {
    if (!other || !(other instanceof WorkingHours)) {
      return false;
    }
    const val = other.getValue();
    return (
      this.props.dayOfWeek === val.dayOfWeek &&
      this.props.startMinute === val.startMinute &&
      this.props.endMinute === val.endMinute
    );
  }
}
