/**
 * Clock interface providing deterministic time resolution for the Gym domain.
 */
export interface Clock {
  /** Returns the current date/time */
  now(): Date;
  /** Returns the facility IANA timezone identifier (e.g. 'America/Guayaquil') */
  timezone(): string;
}

/**
 * System Clock using real host machine time and UTC/system timezone.
 */
export class SystemClock implements Clock {
  constructor(private readonly _timezone: string = 'UTC') {}

  public now(): Date {
    return new Date();
  }

  public timezone(): string {
    return this._timezone;
  }
}

/**
 * Deterministic Test Clock with mutable time for hermetic invariant testing.
 */
export class TestClock implements Clock {
  private _currentTime: Date;
  private readonly _timezone: string;

  constructor(initialTime?: Date | string | number, timezone: string = 'UTC') {
    this._currentTime = initialTime ? new Date(initialTime) : new Date('2026-08-18T10:00:00.000Z');
    this._timezone = timezone;
  }

  public now(): Date {
    return new Date(this._currentTime.getTime());
  }

  public timezone(): string {
    return this._timezone;
  }

  public advanceMinutes(minutes: number): void {
    this._currentTime = new Date(this._currentTime.getTime() + minutes * 60 * 1000);
  }

  public advanceDays(days: number): void {
    this._currentTime = new Date(this._currentTime.getTime() + days * 24 * 60 * 60 * 1000);
  }

  public setTime(newTime: Date | string | number): void {
    this._currentTime = new Date(newTime);
  }
}
