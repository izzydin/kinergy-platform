import { TimeRange } from '../../value-objects/time-range.vo';

/** Props for AvailableSlotResult */
export interface AvailableSlotResultProps {
  readonly timeRange: TimeRange;
  readonly therapistId: string;
  readonly roomId: string;
  readonly score?: number;
}

/** Value Object representing single resource search available slot result */
export class AvailableSlotResult {
  public readonly timeRange: TimeRange;
  public readonly therapistId: string;
  public readonly roomId: string;
  public readonly score: number;

  constructor(props: AvailableSlotResultProps) {
    this.timeRange = props.timeRange;
    this.therapistId = props.therapistId;
    this.roomId = props.roomId;
    this.score = props.score ?? 1.0;
    Object.freeze(this);
  }
}

/** Props for ResourceCombinationSlot */
export interface ResourceCombinationSlotProps {
  readonly timeRange: TimeRange;
  readonly therapistId: string;
  readonly roomId: string;
}

/** Value Object representing multi-resource combination slot result */
export class ResourceCombinationSlot {
  public readonly timeRange: TimeRange;
  public readonly therapistId: string;
  public readonly roomId: string;

  constructor(props: ResourceCombinationSlotProps) {
    this.timeRange = props.timeRange;
    this.therapistId = props.therapistId;
    this.roomId = props.roomId;
    Object.freeze(this);
  }
}
