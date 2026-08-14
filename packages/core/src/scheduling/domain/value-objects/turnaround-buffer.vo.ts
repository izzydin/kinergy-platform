import { ValueObject } from '../shared/value-object';
import { Duration } from './duration.vo';

export interface TurnaroundBufferProps {
  readonly prepDuration: Duration;
  readonly cleanupDuration: Duration;
}

/**
 * Value Object representing operational setup prep and cleanup buffer durations
 * surrounding an appointment scheduling interval.
 */
export class TurnaroundBuffer implements ValueObject<TurnaroundBufferProps> {
  private readonly _prepDuration: Duration;
  private readonly _cleanupDuration: Duration;

  private constructor(prepDuration: Duration, cleanupDuration: Duration) {
    this._prepDuration = prepDuration;
    this._cleanupDuration = cleanupDuration;
    Object.freeze(this);
  }

  /**
   * Factory method to create a TurnaroundBuffer from explicit Duration instances.
   */
  public static create(prepDuration: Duration, cleanupDuration: Duration): TurnaroundBuffer {
    return new TurnaroundBuffer(prepDuration, cleanupDuration);
  }

  /**
   * Factory method to create a TurnaroundBuffer from minute numbers.
   */
  public static of(prepMinutes: number, cleanupMinutes: number): TurnaroundBuffer {
    return new TurnaroundBuffer(
      Duration.fromMinutes(prepMinutes),
      Duration.fromMinutes(cleanupMinutes),
    );
  }

  /**
   * Returns an empty buffer (0 minutes prep, 0 minutes cleanup).
   */
  public static empty(): TurnaroundBuffer {
    return new TurnaroundBuffer(Duration.fromMinutes(0), Duration.fromMinutes(0));
  }

  /** Gets the pre-appointment setup duration */
  public get prepDuration(): Duration {
    return this._prepDuration;
  }

  /** Gets the post-appointment cleanup duration */
  public get cleanupDuration(): Duration {
    return this._cleanupDuration;
  }

  /** Calculates total turnaround buffer duration (prep + cleanup) */
  public get totalDuration(): Duration {
    return this._prepDuration.add(this._cleanupDuration);
  }

  /**
   * Evaluates if this buffer is empty (0ms total duration).
   */
  public isEmpty(): boolean {
    return this.totalDuration.toMilliseconds() === 0;
  }

  public getValue(): TurnaroundBufferProps {
    return {
      prepDuration: this._prepDuration,
      cleanupDuration: this._cleanupDuration,
    };
  }

  public equals(other: ValueObject<TurnaroundBufferProps>): boolean {
    if (!other || !(other instanceof TurnaroundBuffer)) {
      return false;
    }
    return (
      this._prepDuration.equals(other.prepDuration) &&
      this._cleanupDuration.equals(other.cleanupDuration)
    );
  }
}
