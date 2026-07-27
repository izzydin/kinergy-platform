/**
 * Mock Clock implementation with frozen time and time-travel capabilities.
 */
export class MockClock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.currentTime = initialTime;
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advanceSeconds(seconds: number): void {
    this.advanceMs(seconds * 1000);
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }
}
