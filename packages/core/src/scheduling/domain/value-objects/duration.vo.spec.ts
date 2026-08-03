import { Duration } from './duration.vo';
import { InvalidDurationException } from '../exceptions/invalid-duration.exception';

describe('Duration Value Object', () => {
  it('should create duration from milliseconds, minutes, and hours', () => {
    const dMs = Duration.fromMilliseconds(3000);
    const dMins = Duration.fromMinutes(5);
    const dHours = Duration.fromHours(2);

    expect(dMs.toMilliseconds()).toBe(3000);
    expect(dMins.toMilliseconds()).toBe(300000);
    expect(dMins.toMinutes()).toBe(5);
    expect(dHours.toHours()).toBe(2);
    expect(dHours.toMinutes()).toBe(120);
  });

  it('should throw InvalidDurationException for negative duration', () => {
    expect(() => Duration.fromMilliseconds(-100)).toThrow(InvalidDurationException);
    expect(() => Duration.fromMinutes(-5)).toThrow(InvalidDurationException);
  });

  it('should add durations correctly', () => {
    const d1 = Duration.fromMinutes(30);
    const d2 = Duration.fromMinutes(15);
    const sum = d1.add(d2);

    expect(sum.toMinutes()).toBe(45);
  });

  it('should subtract durations correctly', () => {
    const d1 = Duration.fromMinutes(60);
    const d2 = Duration.fromMinutes(20);
    const diff = d1.subtract(d2);

    expect(diff.toMinutes()).toBe(40);
  });

  it('should throw InvalidDurationException when subtraction produces negative duration', () => {
    const d1 = Duration.fromMinutes(15);
    const d2 = Duration.fromMinutes(30);

    expect(() => d1.subtract(d2)).toThrow(InvalidDurationException);
  });

  it('should evaluate equality and order comparisons', () => {
    const d1 = Duration.fromMinutes(30);
    const d2 = Duration.fromMinutes(30);
    const d3 = Duration.fromMinutes(60);

    expect(d1.equals(d2)).toBe(true);
    expect(d1.equals(d3)).toBe(false);
    expect(d3.isGreaterThan(d1)).toBe(true);
    expect(d1.isLessThan(d3)).toBe(true);
    expect(d1.isGreaterThan(d2)).toBe(false);
  });

  it('should be immutable', () => {
    const d = Duration.fromMinutes(10);
    expect(Object.isFrozen(d)).toBe(true);
  });
});
