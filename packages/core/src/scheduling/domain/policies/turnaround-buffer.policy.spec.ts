import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TurnaroundBufferPolicy } from './turnaround-buffer.policy';

describe('Turnaround Buffer Policy & Value Objects', () => {
  describe('TurnaroundBuffer VO', () => {
    it('should create TurnaroundBuffer via of() and compute totalDuration', () => {
      const buffer = TurnaroundBuffer.of(15, 30);

      expect(buffer.prepDuration.toMinutes()).toBe(15);
      expect(buffer.cleanupDuration.toMinutes()).toBe(30);
      expect(buffer.totalDuration.toMinutes()).toBe(45);
    });

    it('should return 0 prep and 0 cleanup for TurnaroundBuffer.empty()', () => {
      const empty = TurnaroundBuffer.empty();

      expect(empty.prepDuration.toMinutes()).toBe(0);
      expect(empty.cleanupDuration.toMinutes()).toBe(0);
      expect(empty.totalDuration.toMinutes()).toBe(0);
    });

    it('should evaluate equality correctly', () => {
      const b1 = TurnaroundBuffer.of(10, 15);
      const b2 = TurnaroundBuffer.of(10, 15);
      const b3 = TurnaroundBuffer.of(5, 15);

      expect(b1.equals(b2)).toBe(true);
      expect(b1.equals(b3)).toBe(false);
    });
  });

  describe('TimeRange Extensions with TurnaroundBuffer', () => {
    const range = TimeRange.create(
      new Date('2026-08-03T10:00:00.000Z'),
      new Date('2026-08-03T11:00:00.000Z'),
    );

    it('should expand start and end times via toBufferedRange()', () => {
      const buffer = TurnaroundBuffer.of(15, 30);
      const buffered = range.toBufferedRange(buffer);

      expect(buffered.start.toISOString()).toBe('2026-08-03T09:45:00.000Z');
      expect(buffered.end.toISOString()).toBe('2026-08-03T11:30:00.000Z');
    });

    it('should evaluate overlapsWithBuffer() correctly', () => {
      const buffer = TurnaroundBuffer.of(15, 15);

      // Adjacent range starting at 11:00 (which touches unbuffered range end)
      const adjacentRange = TimeRange.create(
        new Date('2026-08-03T11:00:00.000Z'),
        new Date('2026-08-03T12:00:00.000Z'),
      );

      // Without buffer, 10:00-11:00 and 11:00-12:00 do not overlap
      expect(range.overlaps(adjacentRange)).toBe(false);

      // With 15 min cleanup buffer, 10:00-11:00 expands to 09:45-11:15 which overlaps 11:00-12:00
      expect(range.overlapsWithBuffer(adjacentRange, buffer)).toBe(true);
    });
  });

  describe('TurnaroundBufferPolicy Engine', () => {
    it('should return default buffer rules for TREATMENT and EVALUATION', () => {
      const policy = TurnaroundBufferPolicy.createDefault();
      const treatmentType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
      const evaluationType = AppointmentType.create(AppointmentTypeEnum.EVALUATION);

      const treatmentBuffer = policy.getBufferFor({ appointmentType: treatmentType });
      expect(treatmentBuffer.prepDuration.toMinutes()).toBe(0);
      expect(treatmentBuffer.cleanupDuration.toMinutes()).toBe(15);

      const evalBuffer = policy.getBufferFor({ appointmentType: evaluationType });
      expect(evalBuffer.prepDuration.toMinutes()).toBe(10);
      expect(evalBuffer.cleanupDuration.toMinutes()).toBe(10);
    });

    it('should return empty buffer for unmapped appointment type in default policy', () => {
      const policy = TurnaroundBufferPolicy.createDefault();
      const followUpType = AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP);

      const buffer = policy.getBufferFor({ appointmentType: followUpType });
      expect(buffer.prepDuration.toMinutes()).toBe(0);
      expect(buffer.cleanupDuration.toMinutes()).toBe(0);
    });

    it('should evaluate custom room and therapist buffer rules', () => {
      const treatmentType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
      const policy = new TurnaroundBufferPolicy([
        {
          roomId: 'hydro_room_1',
          buffer: TurnaroundBuffer.of(20, 20),
        },
      ]);

      const hydroBuffer = policy.getBufferFor({
        appointmentType: treatmentType,
        roomId: 'hydro_room_1',
      });
      expect(hydroBuffer.prepDuration.toMinutes()).toBe(20);
      expect(hydroBuffer.cleanupDuration.toMinutes()).toBe(20);

      const normalRoomBuffer = policy.getBufferFor({
        appointmentType: treatmentType,
        roomId: 'standard_room_2',
      });
      expect(normalRoomBuffer.prepDuration.toMinutes()).toBe(0);
      expect(normalRoomBuffer.cleanupDuration.toMinutes()).toBe(0);
    });
  });
});
