import { ValueObject } from '../shared/value-object';
import { TimeRange } from './time-range.vo';

export type ConflictType =
  'THERAPIST' | 'ROOM' | 'CLIENT' | 'WORKING_HOURS' | 'VACATION' | 'HOLIDAY' | 'BUFFER';

export interface SchedulingConflictProps {
  readonly conflictType: ConflictType;
  readonly conflictingEntityId: string;
  readonly requestedRange: TimeRange;
  readonly reason: string;
  readonly suggestedAlternativeRange?: TimeRange;
}

export class SchedulingConflict implements ValueObject<SchedulingConflictProps> {
  private readonly props: SchedulingConflictProps;

  private constructor(props: SchedulingConflictProps) {
    if (!props.conflictType) {
      throw new Error('Conflict type is required.');
    }
    if (!props.conflictingEntityId) {
      throw new Error('Conflicting entity ID is required.');
    }
    if (!props.requestedRange) {
      throw new Error('Requested time range is required.');
    }
    if (!props.reason) {
      throw new Error('Conflict reason is required.');
    }

    this.props = {
      conflictType: props.conflictType,
      conflictingEntityId: props.conflictingEntityId,
      requestedRange: props.requestedRange,
      reason: props.reason,
      suggestedAlternativeRange: props.suggestedAlternativeRange,
    };
    Object.freeze(this);
  }

  public static create(props: SchedulingConflictProps): SchedulingConflict {
    return new SchedulingConflict(props);
  }

  public get conflictType(): ConflictType {
    return this.props.conflictType;
  }

  public get category(): ConflictType {
    return this.props.conflictType;
  }

  public get conflictingEntityId(): string {
    return this.props.conflictingEntityId;
  }

  public get requestedRange(): TimeRange {
    return this.props.requestedRange;
  }

  public get reason(): string {
    return this.props.reason;
  }

  public get suggestedAlternativeRange(): TimeRange | undefined {
    return this.props.suggestedAlternativeRange;
  }

  public getValue(): SchedulingConflictProps {
    return {
      conflictType: this.conflictType,
      conflictingEntityId: this.conflictingEntityId,
      requestedRange: this.requestedRange,
      reason: this.reason,
      suggestedAlternativeRange: this.suggestedAlternativeRange,
    };
  }

  public equals(other: ValueObject<SchedulingConflictProps>): boolean {
    if (!other || !(other instanceof SchedulingConflict)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this.conflictType === otherVal.conflictType &&
      this.conflictingEntityId === otherVal.conflictingEntityId &&
      this.reason === otherVal.reason &&
      this.requestedRange.equals(otherVal.requestedRange)
    );
  }
}
