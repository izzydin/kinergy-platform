import { ValueObject } from '../shared/value-object';
import { Duration } from './duration.vo';
import { TurnaroundBuffer } from './turnaround-buffer.vo';
import { InvalidTimeRangeException } from '../exceptions/invalid-time-range.exception';

export class TimeRange implements ValueObject<{ start: Date; end: Date }> {
  private readonly _start: Date;
  private readonly _end: Date;

  private constructor(start: Date, end: Date) {
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new InvalidTimeRangeException('Start date and end date must be valid Date objects.');
    }

    if (start.getTime() >= end.getTime()) {
      throw new InvalidTimeRangeException(
        `Invalid time range: start date (${start.toISOString()}) must be strictly before end date (${end.toISOString()}).`,
      );
    }

    this._start = new Date(start.getTime());
    this._end = new Date(end.getTime());
    Object.freeze(this);
  }

  public static create(start: Date, end: Date): TimeRange {
    return new TimeRange(start, end);
  }

  public get start(): Date {
    return new Date(this._start.getTime());
  }

  public get end(): Date {
    return new Date(this._end.getTime());
  }

  public overlaps(other: TimeRange): boolean {
    return (
      this._start.getTime() < other._end.getTime() && this._end.getTime() > other._start.getTime()
    );
  }

  /**
   * Expands the TimeRange by subtracting prepDuration from start and adding cleanupDuration to end.
   *
   * @param buffer TurnaroundBuffer containing prep & cleanup durations
   * @returns Expanded TimeRange primitive
   */
  public toBufferedRange(buffer: TurnaroundBuffer): TimeRange {
    const bufferedStart = new Date(this._start.getTime() - buffer.prepDuration.toMilliseconds());
    const bufferedEnd = new Date(this._end.getTime() + buffer.cleanupDuration.toMilliseconds());
    return TimeRange.create(bufferedStart, bufferedEnd);
  }

  /**
   * Evaluates if this range, expanded by the given buffer, overlaps with another range.
   *
   * @param other Target TimeRange to check against
   * @param buffer TurnaroundBuffer to apply
   * @returns True if buffered range overlaps with target range
   */
  public overlapsWithBuffer(other: TimeRange, buffer: TurnaroundBuffer): boolean {
    return this.toBufferedRange(buffer).overlaps(other);
  }

  public intersects(other: TimeRange): boolean {
    return this.overlaps(other);
  }

  public contains(dateOrRange: Date | TimeRange): boolean {
    if (dateOrRange instanceof Date) {
      const time = dateOrRange.getTime();
      return this._start.getTime() <= time && time <= this._end.getTime();
    }
    return (
      this._start.getTime() <= dateOrRange._start.getTime() &&
      dateOrRange._end.getTime() <= this._end.getTime()
    );
  }

  public touches(other: TimeRange): boolean {
    return (
      this._end.getTime() === other._start.getTime() ||
      this._start.getTime() === other._end.getTime()
    );
  }

  public gap(other: TimeRange): TimeRange | null {
    if (this.overlaps(other) || this.touches(other)) {
      return null;
    }

    if (this._end.getTime() < other._start.getTime()) {
      return TimeRange.create(this._end, other._start);
    }

    return TimeRange.create(other._end, this._start);
  }

  public intersection(other: TimeRange): TimeRange | null {
    if (!this.overlaps(other)) {
      return null;
    }

    const maxStart = new Date(Math.max(this._start.getTime(), other._start.getTime()));
    const minEnd = new Date(Math.min(this._end.getTime(), other._end.getTime()));

    return TimeRange.create(maxStart, minEnd);
  }

  public duration(): Duration {
    return Duration.fromMilliseconds(this._end.getTime() - this._start.getTime());
  }

  public split(at: Date): [TimeRange, TimeRange] {
    if (!at || Number.isNaN(at.getTime())) {
      throw new InvalidTimeRangeException('Split date must be a valid Date.');
    }

    const atTime = at.getTime();
    if (atTime <= this._start.getTime() || atTime >= this._end.getTime()) {
      throw new InvalidTimeRangeException(
        `Split date (${at.toISOString()}) must be strictly between start date (${this._start.toISOString()}) and end date (${this._end.toISOString()}).`,
      );
    }

    return [TimeRange.create(this._start, at), TimeRange.create(at, this._end)];
  }

  public mergeIfAdjacent(other: TimeRange): TimeRange | null {
    if (!this.touches(other) && !this.overlaps(other)) {
      return null;
    }

    const minStart = new Date(Math.min(this._start.getTime(), other._start.getTime()));
    const maxEnd = new Date(Math.max(this._end.getTime(), other._end.getTime()));

    return TimeRange.create(minStart, maxEnd);
  }

  public equals(other: ValueObject<{ start: Date; end: Date }>): boolean {
    if (!other || !(other instanceof TimeRange)) {
      return false;
    }
    return (
      this._start.getTime() === other._start.getTime() &&
      this._end.getTime() === other._end.getTime()
    );
  }

  public getValue(): { start: Date; end: Date } {
    return {
      start: this.start,
      end: this.end,
    };
  }
}
