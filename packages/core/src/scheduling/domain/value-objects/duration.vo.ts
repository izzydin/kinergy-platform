import { ValueObject } from '../shared/value-object';
import { InvalidDurationException } from '../exceptions/invalid-duration.exception';

export class Duration implements ValueObject<number> {
  private readonly ms: number;

  private constructor(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new InvalidDurationException(
        `Invalid duration: ${milliseconds}. Duration must be a non-negative finite number.`,
      );
    }
    this.ms = milliseconds;
    Object.freeze(this);
  }

  public static fromMilliseconds(ms: number): Duration {
    return new Duration(ms);
  }

  public static fromMinutes(minutes: number): Duration {
    return new Duration(minutes * 60 * 1000);
  }

  public static fromHours(hours: number): Duration {
    return new Duration(hours * 60 * 60 * 1000);
  }

  public toMilliseconds(): number {
    return this.ms;
  }

  public toMinutes(): number {
    return this.ms / (60 * 1000);
  }

  public toHours(): number {
    return this.ms / (60 * 60 * 1000);
  }

  public getValue(): number {
    return this.ms;
  }

  public add(other: Duration): Duration {
    return Duration.fromMilliseconds(this.ms + other.toMilliseconds());
  }

  public subtract(other: Duration): Duration {
    const result = this.ms - other.toMilliseconds();
    if (result < 0) {
      throw new InvalidDurationException(
        'Resulting duration cannot be negative after subtraction.',
      );
    }
    return Duration.fromMilliseconds(result);
  }

  public equals(other: ValueObject<number>): boolean {
    if (!other || !(other instanceof Duration)) {
      return false;
    }
    return this.ms === other.getValue();
  }

  public isGreaterThan(other: Duration): boolean {
    return this.ms > other.toMilliseconds();
  }

  public isLessThan(other: Duration): boolean {
    return this.ms < other.toMilliseconds();
  }
}
