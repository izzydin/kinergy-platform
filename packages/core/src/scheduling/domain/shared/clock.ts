/**
 * Clock abstraction for deterministic time management across domain services and aggregates.
 */
export interface Clock {
  /**
   * Returns the current date and time.
   */
  now(): Date;

  /**
   * Returns the current date normalized to 00:00:00.000 UTC.
   */
  today(): Date;

  /**
   * Returns the configured timezone identifier (e.g. 'UTC').
   */
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

  public today(): Date {
    const current = this.now();
    return new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 0, 0, 0, 0),
    );
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
  private readonly initialTime: Date;
  private readonly tz: string;

  constructor(initialDate?: Date, timezone = 'UTC') {
    this.initialTime = initialDate ? new Date(initialDate.getTime()) : new Date();
    this.currentTime = new Date(this.initialTime.getTime());
    this.tz = timezone;
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public today(): Date {
    const current = this.now();
    return new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 0, 0, 0, 0),
    );
  }

  public timezone(): string {
    return this.tz;
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  public advanceBy(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public reset(initialDate?: Date): void {
    if (initialDate) {
      this.currentTime = new Date(initialDate.getTime());
    } else {
      this.currentTime = new Date(this.initialTime.getTime());
    }
  }
}
