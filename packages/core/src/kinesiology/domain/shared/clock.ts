/**
 * Clock abstraction for deterministic time management across domain services and aggregates.
 */
export interface Clock {
  /** Returns the current date and time */
  now(): Date;
  /** Returns the configured timezone identifier */
  timezone(): string;
}

/**
 * SystemClock implementation that delegates to standard system clock.
 */
export class SystemClock implements Clock {
  private readonly tz: string;

  constructor(timezone = 'UTC') {
    this.tz = timezone;
  }

  public now(): Date {
    return new Date();
  }

  public timezone(): string {
    return this.tz;
  }
}

/**
 * TestClock implementation for deterministic time control during testing.
 */
export class TestClock implements Clock {
  private currentTime: Date;
  private readonly tz: string;

  constructor(initialDate?: Date, timezone = 'UTC') {
    this.currentTime = initialDate ? new Date(initialDate.getTime()) : new Date();
    this.tz = timezone;
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public timezone(): string {
    return this.tz;
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  public advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }
}
