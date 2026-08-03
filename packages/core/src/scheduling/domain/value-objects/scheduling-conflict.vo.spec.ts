import { SchedulingConflict } from './scheduling-conflict.vo';
import { TimeRange } from './time-range.vo';

describe('SchedulingConflict Value Object', () => {
  const range = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  it('should create valid SchedulingConflict instance', () => {
    const conflict = SchedulingConflict.create({
      conflictType: 'THERAPIST',
      conflictingEntityId: 'therapist_123',
      requestedRange: range,
      reason: 'Therapist is already booked during requested time.',
    });

    expect(conflict.conflictType).toBe('THERAPIST');
    expect(conflict.conflictingEntityId).toBe('therapist_123');
    expect(conflict.reason).toBe('Therapist is already booked during requested time.');
    expect(conflict.requestedRange.equals(range)).toBe(true);
  });

  it('should throw error when required fields are missing', () => {
    expect(() =>
      SchedulingConflict.create({
        conflictType: 'ROOM',
        conflictingEntityId: '',
        requestedRange: range,
        reason: 'Room maintenance',
      }),
    ).toThrow();
  });

  it('should evaluate equality correctly', () => {
    const c1 = SchedulingConflict.create({
      conflictType: 'ROOM',
      conflictingEntityId: 'room_1',
      requestedRange: range,
      reason: 'Room unavailable',
    });

    const c2 = SchedulingConflict.create({
      conflictType: 'ROOM',
      conflictingEntityId: 'room_1',
      requestedRange: range,
      reason: 'Room unavailable',
    });

    const c3 = SchedulingConflict.create({
      conflictType: 'ROOM',
      conflictingEntityId: 'room_2',
      requestedRange: range,
      reason: 'Room unavailable',
    });

    expect(c1.equals(c2)).toBe(true);
    expect(c1.equals(c3)).toBe(false);
  });

  it('should be frozen / immutable', () => {
    const conflict = SchedulingConflict.create({
      conflictType: 'VACATION',
      conflictingEntityId: 'therapist_456',
      requestedRange: range,
      reason: 'Therapist on vacation',
    });

    expect(Object.isFrozen(conflict)).toBe(true);
  });
});
