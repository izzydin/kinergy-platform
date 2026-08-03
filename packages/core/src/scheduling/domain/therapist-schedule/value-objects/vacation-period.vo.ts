import { ValueObject } from '../../shared/value-object';
import { TimeRange } from '../../value-objects/time-range.vo';

export interface VacationPeriodProps {
  readonly timeRange: TimeRange;
  readonly title?: string;
}

export class VacationPeriod implements ValueObject<VacationPeriodProps> {
  private readonly props: VacationPeriodProps;

  private constructor(props: VacationPeriodProps) {
    if (!props.timeRange) {
      throw new Error('Vacation time range is required.');
    }
    this.props = { ...props };
    Object.freeze(this);
  }

  public static create(timeRange: TimeRange, title = 'Vacation'): VacationPeriod {
    return new VacationPeriod({ timeRange, title });
  }

  public get timeRange(): TimeRange {
    return this.props.timeRange;
  }

  public get title(): string | undefined {
    return this.props.title;
  }

  public overlaps(range: TimeRange): boolean {
    return this.props.timeRange.overlaps(range);
  }

  public getValue(): VacationPeriodProps {
    return { ...this.props };
  }

  public equals(other: ValueObject<VacationPeriodProps>): boolean {
    if (!other || !(other instanceof VacationPeriod)) {
      return false;
    }
    return this.props.timeRange.equals(other.getValue().timeRange);
  }
}
