import { MaintenanceWindow } from './maintenance-window.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';

describe('MaintenanceWindow Value Object', () => {
  const baseRange = TimeRange.create(
    new Date('2026-09-01T10:00:00Z'),
    new Date('2026-09-01T12:00:00Z'),
  );

  describe('Creation and Validation', () => {
    it('should create a valid MaintenanceWindow with auto-generated ID', () => {
      const window = MaintenanceWindow.create({
        timeRange: baseRange,
        reason: 'Deep sanitation',
      });

      expect(window.id).toMatch(/^maint_\d+_[a-z0-9]+$/);
      expect(window.timeRange).toBe(baseRange);
      expect(window.reason).toBe('Deep sanitation');
      expect(window.createdAt).toBeInstanceOf(Date);
      expect(Object.isFrozen(window)).toBe(true);
    });

    it('should create a MaintenanceWindow with explicit ID and trim reason', () => {
      const window = MaintenanceWindow.create({
        id: 'maint_custom_001',
        timeRange: baseRange,
        reason: '   Filter replacement   ',
      });

      expect(window.id).toBe('maint_custom_001');
      expect(window.reason).toBe('Filter replacement');
    });

    it('should reject empty or whitespace reasons', () => {
      expect(() =>
        MaintenanceWindow.create({
          timeRange: baseRange,
          reason: '',
        }),
      ).toThrow('Maintenance window reason cannot be empty.');

      expect(() =>
        MaintenanceWindow.create({
          timeRange: baseRange,
          reason: '   ',
        }),
      ).toThrow('Maintenance window reason cannot be empty.');
    });

    it('should reject missing timeRange', () => {
      expect(() =>
        MaintenanceWindow.create({
          // @ts-expect-error Testing invalid input
          timeRange: null,
          reason: 'Valid reason',
        }),
      ).toThrow('Maintenance window requires a valid TimeRange.');
    });
  });

  describe('Temporal Overlap & Boundary Semantics', () => {
    const window = MaintenanceWindow.create({
      id: 'maint_1',
      timeRange: TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T12:00:00Z'),
      ),
      reason: 'Scheduled maintenance',
    });

    it('should detect overlap when target range falls inside or intersects maintenance', () => {
      // Partially overlapping start
      const target1 = TimeRange.create(
        new Date('2026-09-01T09:30:00Z'),
        new Date('2026-09-01T10:30:00Z'),
      );
      expect(window.overlaps(target1)).toBe(true);

      // Fully enclosed inside maintenance
      const target2 = TimeRange.create(
        new Date('2026-09-01T10:30:00Z'),
        new Date('2026-09-01T11:30:00Z'),
      );
      expect(window.overlaps(target2)).toBe(true);

      // Partially overlapping end
      const target3 = TimeRange.create(
        new Date('2026-09-01T11:30:00Z'),
        new Date('2026-09-01T12:30:00Z'),
      );
      expect(window.overlaps(target3)).toBe(true);
    });

    it('should NOT overlap when candidate range is strictly adjacent (touching boundaries)', () => {
      // Target ends exactly when maintenance starts: [09:00, 10:00) vs [10:00, 12:00)
      const targetBefore = TimeRange.create(
        new Date('2026-09-01T09:00:00Z'),
        new Date('2026-09-01T10:00:00Z'),
      );
      expect(window.overlaps(targetBefore)).toBe(false);

      // Target starts exactly when maintenance ends: [12:00, 13:00) vs [10:00, 12:00)
      const targetAfter = TimeRange.create(
        new Date('2026-09-01T12:00:00Z'),
        new Date('2026-09-01T13:00:00Z'),
      );
      expect(window.overlaps(targetAfter)).toBe(false);
    });

    it('should detect overlap across touching boundaries when turnaround buffer is applied', () => {
      const buffer = TurnaroundBuffer.of(15, 15);

      // Target [09:00, 10:00) with 15min cleanup buffer extends to 10:15, overlapping [10:00, 12:00)
      const targetBefore = TimeRange.create(
        new Date('2026-09-01T09:00:00Z'),
        new Date('2026-09-01T10:00:00Z'),
      );
      expect(window.overlaps(targetBefore, buffer)).toBe(true);

      // Target [12:00, 13:00) with 15min prep buffer extends start to 11:45, overlapping [10:00, 12:00)
      const targetAfter = TimeRange.create(
        new Date('2026-09-01T12:00:00Z'),
        new Date('2026-09-01T13:00:00Z'),
      );
      expect(window.overlaps(targetAfter, buffer)).toBe(true);
    });
  });

  describe('Equality & Immutability', () => {
    it('should check value equality correctly', () => {
      const w1 = MaintenanceWindow.create({
        id: 'm1',
        timeRange: baseRange,
        reason: 'Cleaning',
      });
      const w2 = MaintenanceWindow.create({
        id: 'm1',
        timeRange: baseRange,
        reason: 'Cleaning',
      });
      const w3 = MaintenanceWindow.create({
        id: 'm2',
        timeRange: baseRange,
        reason: 'Cleaning',
      });

      expect(w1.equals(w2)).toBe(true);
      expect(w1.equals(w3)).toBe(false);
    });
  });
});
