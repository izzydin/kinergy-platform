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
