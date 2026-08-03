import { ValueObject } from '../../shared/value-object';
import { TimeRange } from '../../value-objects/time-range.vo';

export interface BreakPeriodProps {
  readonly dayOfWeek?: number; // 0=Sunday..6=Saturday (for recurring daily break)
  readonly startMinute?: number;
  readonly endMinute?: number;
  readonly timeRange?: TimeRange; // For specific date break
  readonly title?: string;
}

export class BreakPeriod implements ValueObject<BreakPeriodProps> {
  private readonly props: BreakPeriodProps;

  private constructor(props: BreakPeriodProps) {
    if (props.dayOfWeek !== undefined) {
      if (props.dayOfWeek < 0 || props.dayOfWeek > 6) {
        throw new Error('Day of week must be between 0 and 6.');
      }
      if (
        props.startMinute === undefined ||
        props.endMinute === undefined ||
        props.startMinute >= props.endMinute
      ) {
        throw new Error('Invalid recurring break minutes.');
      }
    } else if (!props.timeRange) {
      throw new Error(
        'BreakPeriod must specify either recurring day/minutes or a specific TimeRange.',
      );
    }

    this.props = { ...props };
    Object.freeze(this);
  }

  public static createRecurring(
    dayOfWeek: number,
    startMinute: number,
    endMinute: number,
    title = 'Break',
  ): BreakPeriod {
    return new BreakPeriod({ dayOfWeek, startMinute, endMinute, title });
  }

  public static createSpecific(timeRange: TimeRange, title = 'Break'): BreakPeriod {
    return new BreakPeriod({ timeRange, title });
  }

  public get title(): string | undefined {
    return this.props.title;
  }

  public overlaps(range: TimeRange, _timezone = 'UTC'): boolean {
    if (this.props.timeRange) {
      return this.props.timeRange.overlaps(range);
    }

    if (
      this.props.dayOfWeek !== undefined &&
      this.props.startMinute !== undefined &&
      this.props.endMinute !== undefined
    ) {
      const start = range.start;
      const end = range.end;

      if (start.getUTCDay() !== this.props.dayOfWeek && end.getUTCDay() !== this.props.dayOfWeek) {
        return false;
      }

      const candidateStartMinute = start.getUTCHours() * 60 + start.getUTCMinutes();
      let candidateEndMinute = end.getUTCHours() * 60 + end.getUTCMinutes();
      if (end.getUTCSeconds() > 0 || end.getUTCMilliseconds() > 0) {
        candidateEndMinute += 1;
      }

      return (
        candidateStartMinute < this.props.endMinute && candidateEndMinute > this.props.startMinute
      );
    }

    return false;
  }

  public getValue(): BreakPeriodProps {
    return { ...this.props };
  }

  public equals(other: ValueObject<BreakPeriodProps>): boolean {
    if (!other || !(other instanceof BreakPeriod)) {
      return false;
    }
    const val = other.getValue();
    if (this.props.timeRange && val.timeRange) {
      return this.props.timeRange.equals(val.timeRange);
    }
    return (
      this.props.dayOfWeek === val.dayOfWeek &&
      this.props.startMinute === val.startMinute &&
      this.props.endMinute === val.endMinute
    );
  }
}
