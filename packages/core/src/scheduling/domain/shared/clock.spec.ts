import { SystemClock, TestClock } from './clock';

describe('Clock Abstractions', () => {
  describe('SystemClock', () => {
    it('should return current UTC date for now()', () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now();
      const after = Date.now();

      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(after);
    });

    it('should return today normalized to 00:00:00.000 UTC', () => {
      const clock = new SystemClock();
      const today = clock.today();

      expect(today.getUTCHours()).toBe(0);
      expect(today.getUTCMinutes()).toBe(0);
      expect(today.getUTCSeconds()).toBe(0);
      expect(today.getUTCMilliseconds()).toBe(0);
    });

    it('should return the configured timezone', () => {
      const defaultClock = new SystemClock();
      expect(defaultClock.timezone()).toBe('UTC');

      const customClock = new SystemClock('America/New_York');
      expect(customClock.timezone()).toBe('America/New_York');
    });
  });

  describe('TestClock', () => {
    it('should initialize with current time if no initialDate provided', () => {
      const before = Date.now();
      const clock = new TestClock();
      const after = Date.now();

      const now = clock.now();
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(after);
    });

    it('should initialize with provided fixed initialDate', () => {
      const fixedDate = new Date('2026-08-03T10:30:00.000Z');
      const clock = new TestClock(fixedDate);

      expect(clock.now().toISOString()).toBe('2026-08-03T10:30:00.000Z');
    });

    it('should return today normalized to 00:00:00.000 UTC for fixed time', () => {
      const fixedDate = new Date('2026-08-03T15:45:30.123Z');
      const clock = new TestClock(fixedDate);

      const today = clock.today();
      expect(today.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    });

    it('should set time explicitly with setTime()', () => {
      const clock = new TestClock(new Date('2026-08-01T00:00:00.000Z'));
      const newDate = new Date('2026-12-25T12:00:00.000Z');

      clock.setTime(newDate);

      expect(clock.now().toISOString()).toBe('2026-12-25T12:00:00.000Z');
    });

    it('should advance time deterministically with advanceBy()', () => {
      const fixedDate = new Date('2026-08-03T10:00:00.000Z');
      const clock = new TestClock(fixedDate);

      // Advance by 1 hour (3,600,000 ms)
      clock.advanceBy(3_600_000);

      expect(clock.now().toISOString()).toBe('2026-08-03T11:00:00.000Z');
    });

    it('should reset time back to initial date when reset() is called without args', () => {
      const initial = new Date('2026-08-03T10:00:00.000Z');
      const clock = new TestClock(initial);

      clock.advanceBy(7_200_000);
      expect(clock.now().toISOString()).toBe('2026-08-03T12:00:00.000Z');

      clock.reset();
      expect(clock.now().toISOString()).toBe('2026-08-03T10:00:00.000Z');
    });

    it('should reset time to new date when reset() is called with date arg', () => {
      const initial = new Date('2026-08-03T10:00:00.000Z');
      const clock = new TestClock(initial);

      const newInitial = new Date('2026-09-01T08:00:00.000Z');
      clock.reset(newInitial);

      expect(clock.now().toISOString()).toBe('2026-09-01T08:00:00.000Z');
    });

    it('should return configured timezone', () => {
      const clock = new TestClock(undefined, 'Europe/London');
      expect(clock.timezone()).toBe('Europe/London');
    });
  });
});
