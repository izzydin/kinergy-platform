import { TimeRange } from './time-range.vo';
import { InvalidTimeRangeException } from '../exceptions/invalid-time-range.exception';

describe('TimeRange Value Object', () => {
  const t10 = new Date('2026-08-03T10:00:00.000Z');
  const t11 = new Date('2026-08-03T11:00:00.000Z');
  const t12 = new Date('2026-08-03T12:00:00.000Z');
  const t13 = new Date('2026-08-03T13:00:00.000Z');

  it('should create valid TimeRange and protect dates via defensive copy', () => {
    const mutableStart = new Date(t10.getTime());
    const mutableEnd = new Date(t11.getTime());
    const tr = TimeRange.create(mutableStart, mutableEnd);

    expect(tr.start.toISOString()).toBe(t10.toISOString());
    expect(tr.end.toISOString()).toBe(t11.toISOString());

    // Mutating external date should not affect TimeRange
    mutableStart.setUTCHours(8);
    expect(tr.start.toISOString()).toBe(t10.toISOString());
  });

  it('should throw InvalidTimeRangeException when start >= end', () => {
    expect(() => TimeRange.create(t11, t10)).toThrow(InvalidTimeRangeException);
    expect(() => TimeRange.create(t10, t10)).toThrow(InvalidTimeRangeException);
  });

  it('should evaluate overlaps and intersects correctly', () => {
    const tr1 = TimeRange.create(t10, t12);
    const tr2 = TimeRange.create(t11, t13);
    const tr3 = TimeRange.create(t12, t13);

    expect(tr1.overlaps(tr2)).toBe(true);
    expect(tr1.intersects(tr2)).toBe(true);

    // Adjacent ranges touch, but do NOT overlap
    expect(tr1.overlaps(tr3)).toBe(false);
    expect(tr1.intersects(tr3)).toBe(false);
  });

  it('should evaluate touches correctly', () => {
    const tr1 = TimeRange.create(t10, t11);
    const tr2 = TimeRange.create(t11, t12);
    const tr3 = TimeRange.create(t12, t13);

    expect(tr1.touches(tr2)).toBe(true);
    expect(tr2.touches(tr1)).toBe(true);
    expect(tr1.touches(tr3)).toBe(false);
  });

  it('should evaluate contains for Date and TimeRange', () => {
    const tr = TimeRange.create(t10, t12);

    expect(tr.contains(t11)).toBe(true);
    expect(tr.contains(t10)).toBe(true);
    expect(tr.contains(t12)).toBe(true);
    expect(tr.contains(t13)).toBe(false);

    const innerTr = TimeRange.create(
      new Date('2026-08-03T10:30:00.000Z'),
      new Date('2026-08-03T11:30:00.000Z'),
    );
    expect(tr.contains(innerTr)).toBe(true);

    const outerTr = TimeRange.create(t10, t13);
    expect(tr.contains(outerTr)).toBe(false);
  });

  it('should compute intersection correctly', () => {
    const tr1 = TimeRange.create(t10, t12);
    const tr2 = TimeRange.create(t11, t13);

    const inter = tr1.intersection(tr2);
    expect(inter).not.toBeNull();
    expect(inter?.start.toISOString()).toBe(t11.toISOString());
    expect(inter?.end.toISOString()).toBe(t12.toISOString());

    const trNoOverlap = TimeRange.create(t12, t13);
    expect(tr1.intersection(trNoOverlap)).toBeNull();
  });

  it('should compute gap between disjoint non-adjacent ranges', () => {
    const tr1 = TimeRange.create(t10, t11);
    const tr2 = TimeRange.create(t12, t13);

    const gap = tr1.gap(tr2);
    expect(gap).not.toBeNull();
    expect(gap?.start.toISOString()).toBe(t11.toISOString());
    expect(gap?.end.toISOString()).toBe(t12.toISOString());

    // Inverse gap
    const inverseGap = tr2.gap(tr1);
    expect(inverseGap?.start.toISOString()).toBe(t11.toISOString());
    expect(inverseGap?.end.toISOString()).toBe(t12.toISOString());

    // Touching ranges have no gap
    expect(tr1.gap(TimeRange.create(t11, t12))).toBeNull();
  });

  it('should compute duration correctly', () => {
    const tr = TimeRange.create(t10, t12);
    expect(tr.duration().toHours()).toBe(2);
  });

  it('should split range at a valid intermediate date', () => {
    const tr = TimeRange.create(t10, t12);
    const [part1, part2] = tr.split(t11);

    expect(part1.start.toISOString()).toBe(t10.toISOString());
    expect(part1.end.toISOString()).toBe(t11.toISOString());
    expect(part2.start.toISOString()).toBe(t11.toISOString());
    expect(part2.end.toISOString()).toBe(t12.toISOString());
  });

  it('should throw InvalidTimeRangeException when splitting outside range', () => {
    const tr = TimeRange.create(t10, t12);

    expect(() => tr.split(t10)).toThrow(InvalidTimeRangeException);
    expect(() => tr.split(t13)).toThrow(InvalidTimeRangeException);
  });

  it('should merge adjacent or overlapping ranges', () => {
    const tr1 = TimeRange.create(t10, t11);
    const tr2 = TimeRange.create(t11, t13);

    const merged = tr1.mergeIfAdjacent(tr2);
    expect(merged).not.toBeNull();
    expect(merged?.start.toISOString()).toBe(t10.toISOString());
    expect(merged?.end.toISOString()).toBe(t13.toISOString());

    const trDisjoint = TimeRange.create(
      new Date('2026-08-03T14:00:00.000Z'),
      new Date('2026-08-03T15:00:00.000Z'),
    );
    expect(tr1.mergeIfAdjacent(trDisjoint)).toBeNull();
  });

  it('should be frozen / immutable', () => {
    const tr = TimeRange.create(t10, t11);
    expect(Object.isFrozen(tr)).toBe(true);
  });
});
