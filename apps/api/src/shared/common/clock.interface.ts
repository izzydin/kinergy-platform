/**
 * Abstract Port Interface for system clock / time retrieval.
 * Enables deterministic time manipulation and freezing in unit tests.
 */
export interface IClock {
  now(): Date;
}

export const CLOCK = Symbol('IClock');

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
