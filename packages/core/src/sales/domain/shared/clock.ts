/**
 * Contract representing a clock provider for deterministic domain timestamping.
 */
export interface Clock {
  now(): Date;
}

/**
 * Default system clock implementation utilizing the host environment's system time.
 */
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

/**
 * Deterministic clock implementation with time-travel capabilities for domain services, aggregates, and tests.
 */
export class DeterministicClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-09-19T10:00:00.000Z')) {
    this.currentTime = new Date(initialTime.getTime());
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }

  public advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000);
  }
}
