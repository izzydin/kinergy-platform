import { ValueObject } from '../../shared/value-object';
import { TimeRange } from '../../value-objects/time-range.vo';

export type OverrideType = 'AVAILABLE' | 'UNAVAILABLE';

export interface AvailabilityOverrideProps {
  readonly timeRange: TimeRange;
  readonly type: OverrideType;
  readonly reason?: string;
}

export class AvailabilityOverride implements ValueObject<AvailabilityOverrideProps> {
  private readonly props: AvailabilityOverrideProps;

  private constructor(props: AvailabilityOverrideProps) {
    if (!props.timeRange) {
      throw new Error('Override time range is required.');
    }
    if (!props.type || (props.type !== 'AVAILABLE' && props.type !== 'UNAVAILABLE')) {
      throw new Error("Override type must be 'AVAILABLE' or 'UNAVAILABLE'.");
    }
    this.props = { ...props };
    Object.freeze(this);
  }

  public static create(
    timeRange: TimeRange,
    type: OverrideType,
    reason?: string,
  ): AvailabilityOverride {
    return new AvailabilityOverride({ timeRange, type, reason });
  }

  public get timeRange(): TimeRange {
    return this.props.timeRange;
  }

  public get type(): OverrideType {
    return this.props.type;
  }

  public get reason(): string | undefined {
    return this.props.reason;
  }

  public overlaps(range: TimeRange): boolean {
    return this.props.timeRange.overlaps(range);
  }

  public covers(range: TimeRange): boolean {
    return this.props.timeRange.contains(range);
  }

  public getValue(): AvailabilityOverrideProps {
    return { ...this.props };
  }

  public equals(other: ValueObject<AvailabilityOverrideProps>): boolean {
    if (!other || !(other instanceof AvailabilityOverride)) {
      return false;
    }
    const val = other.getValue();
    return this.props.type === val.type && this.props.timeRange.equals(val.timeRange);
  }
}
