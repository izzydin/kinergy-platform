export interface IClock {
  now(): Date;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}

export class Clock {
  private static instance: IClock = new SystemClock();

  public static setClock(clock: IClock): void {
    Clock.instance = clock;
  }

  public static reset(): void {
    Clock.instance = new SystemClock();
  }

  public static now(): Date {
    return Clock.instance.now();
  }
}
