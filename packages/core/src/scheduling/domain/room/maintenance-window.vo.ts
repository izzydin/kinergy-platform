import { ValueObject } from '../shared/value-object';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';

export interface CreateMaintenanceWindowProps {
  id?: string;
  timeRange: TimeRange;
  reason: string;
  createdAt?: Date;
}

export interface MaintenanceWindowValue {
  id: string;
  timeRange: TimeRange;
  reason: string;
  createdAt: Date;
}

/**
 * Value Object representing a scheduled temporal maintenance window on a physical Room or SchedulableResource.
 * Immutable and frozen on construction.
 */
export class MaintenanceWindow implements ValueObject<MaintenanceWindowValue> {
  private readonly _id: string;
  private readonly _timeRange: TimeRange;
  private readonly _reason: string;
  private readonly _createdAt: Date;

  private constructor(props: CreateMaintenanceWindowProps) {
    if (!props.reason || props.reason.trim().length === 0) {
      throw new Error('Maintenance window reason cannot be empty.');
    }
    if (!props.timeRange) {
      throw new Error('Maintenance window requires a valid TimeRange.');
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);

    this._id =
      props.id && props.id.trim().length > 0 ? props.id.trim() : `maint_${timestamp}_${random}`;
    this._timeRange = props.timeRange;
    this._reason = props.reason.trim();
    this._createdAt = props.createdAt ?? new Date();
    Object.freeze(this);
  }

  /**
   * Factory method to create a new MaintenanceWindow value object.
   */
  public static create(props: CreateMaintenanceWindowProps): MaintenanceWindow {
    return new MaintenanceWindow(props);
  }

  /** Gets the unique identifier of this maintenance window */
  public get id(): string {
    return this._id;
  }

  /** Gets the temporal range of the maintenance block */
  public get timeRange(): TimeRange {
    return this._timeRange;
  }

  /** Gets the maintenance explanation reason */
  public get reason(): string {
    return this._reason;
  }

  /** Gets the creation timestamp */
  public get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Evaluates if this maintenance window overlaps with a candidate target time range,
   * optionally respecting an operational turnaround buffer.
   *
   * @param targetRange Candidate booking time range
   * @param buffer Optional turnaround buffer applied to the candidate range
   * @returns True if maintenance blocks the requested range
   */
  public overlaps(targetRange: TimeRange, buffer?: TurnaroundBuffer): boolean {
    if (!buffer || buffer.isEmpty()) {
      return this._timeRange.overlaps(targetRange);
    }
    const bufferedRange = targetRange.toBufferedRange(buffer);
    return this._timeRange.overlaps(bufferedRange);
  }

  /** Gets the structured value of this Value Object */
  public getValue(): MaintenanceWindowValue {
    return {
      id: this._id,
      timeRange: this._timeRange,
      reason: this._reason,
      createdAt: this._createdAt,
    };
  }

  /** Equality check */
  public equals(other: ValueObject<MaintenanceWindowValue>): boolean {
    if (!other || !(other instanceof MaintenanceWindow)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._id === otherVal.id &&
      this._reason === otherVal.reason &&
      this._timeRange.equals(otherVal.timeRange)
    );
  }
}
