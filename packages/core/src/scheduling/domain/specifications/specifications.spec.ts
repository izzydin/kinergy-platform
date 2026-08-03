import { BaseSpecification } from './base.specification';
import { WorkingHoursSpecification } from './working-hours.specification';
import { TherapistAvailabilitySpecification } from './therapist-availability.specification';
import { RoomAvailabilitySpecification } from './room-availability.specification';
import { AppointmentOverlapSpecification } from './appointment-overlap.specification';
import { ClientAvailabilitySpecification } from './client-availability.specification';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { BreakPeriod } from '../therapist-schedule/value-objects/break-period.vo';
import { Room } from '../room/room.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

class NumberGreaterThanSpecification extends BaseSpecification<number> {
  constructor(private readonly limit: number) {
    super();
  }
  public isSatisfiedBy(candidate: number): boolean {
    return candidate > this.limit;
  }
}

class NumberEvenSpecification extends BaseSpecification<number> {
  public isSatisfiedBy(candidate: number): boolean {
    return candidate % 2 === 0;
  }
}

describe('Domain Specifications', () => {
  describe('BaseSpecification Composition (and, or, not)', () => {
    const isGreaterThan10 = new NumberGreaterThanSpecification(10);
    const isEven = new NumberEvenSpecification();

    it('should compose with AND operator', () => {
      const isEvenAndGreaterThan10 = isGreaterThan10.and(isEven);

      expect(isEvenAndGreaterThan10.isSatisfiedBy(12)).toBe(true);
      expect(isEvenAndGreaterThan10.isSatisfiedBy(11)).toBe(false);
      expect(isEvenAndGreaterThan10.isSatisfiedBy(8)).toBe(false);
    });

    it('should compose with OR operator', () => {
      const isEvenOrGreaterThan10 = isGreaterThan10.or(isEven);

      expect(isEvenOrGreaterThan10.isSatisfiedBy(12)).toBe(true);
      expect(isEvenOrGreaterThan10.isSatisfiedBy(11)).toBe(true);
      expect(isEvenOrGreaterThan10.isSatisfiedBy(8)).toBe(true);
      expect(isEvenOrGreaterThan10.isSatisfiedBy(7)).toBe(false);
    });

    it('should compose with NOT operator', () => {
      const isOdd = isEven.not();

      expect(isOdd.isSatisfiedBy(7)).toBe(true);
      expect(isOdd.isSatisfiedBy(8)).toBe(false);
    });
  });

  describe('WorkingHoursSpecification & TherapistAvailabilitySpecification', () => {
    // Monday = 1
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const mondayLunch = BreakPeriod.createRecurring(1, 12 * 60, 13 * 60);

    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_100',
      workingHours: [monday9to17],
      breaks: [mondayLunch],
    });

    const workRange = TimeRange.create(
      new Date('2026-08-03T10:00:00.000Z'),
      new Date('2026-08-03T11:00:00.000Z'),
    );

    const lunchRange = TimeRange.create(
      new Date('2026-08-03T12:15:00.000Z'),
      new Date('2026-08-03T12:45:00.000Z'),
    );

    it('should satisfy WorkingHoursSpecification when within work shifts', () => {
      const spec = new WorkingHoursSpecification();
      expect(spec.isSatisfiedBy({ schedule, range: workRange })).toBe(true);
      expect(spec.isSatisfiedBy({ schedule, range: lunchRange })).toBe(true);
    });

    it('should satisfy TherapistAvailabilitySpecification considering breaks', () => {
      const spec = new TherapistAvailabilitySpecification();
      expect(spec.isSatisfiedBy({ schedule, range: workRange })).toBe(true);
      expect(spec.isSatisfiedBy({ schedule, range: lunchRange })).toBe(false);
    });
  });

  describe('RoomAvailabilitySpecification', () => {
    const room = Room.create({
      name: 'Deluxe Suite',
      capacity: 4,
      features: ['sauna', 'soundproof'],
    });

    const spec = new RoomAvailabilitySpecification();

    it('should satisfy room availability when status, capacity, and features match', () => {
      expect(
        spec.isSatisfiedBy({
          room,
          requiredCapacity: 2,
          requiredFeatures: ['sauna'],
        }),
      ).toBe(true);
    });

    it('should reject room availability when status is MAINTENANCE or UNAVAILABLE', () => {
      room.markMaintenance('Cleaning');
      expect(spec.isSatisfiedBy({ room })).toBe(false);

      room.markAvailable();
      expect(spec.isSatisfiedBy({ room })).toBe(true);
    });

    it('should reject room availability when capacity is insufficient', () => {
      expect(spec.isSatisfiedBy({ room, requiredCapacity: 10 })).toBe(false);
    });

    it('should reject room availability when required feature is missing', () => {
      expect(spec.isSatisfiedBy({ room, requiredFeatures: ['cryo_chamber'] })).toBe(false);
    });
  });

  describe('AppointmentOverlapSpecification', () => {
    const candidateRange = TimeRange.create(
      new Date('2026-08-03T10:00:00.000Z'),
      new Date('2026-08-03T11:00:00.000Z'),
    );

    const spec = new AppointmentOverlapSpecification();

    it('should satisfy specification when no existing appointments overlap', () => {
      const existingAppointments = [
        {
          timeRange: TimeRange.create(
            new Date('2026-08-03T11:00:00.000Z'),
            new Date('2026-08-03T12:00:00.000Z'),
          ),
          status: AppointmentStatus.CONFIRMED,
        },
      ];

      expect(spec.isSatisfiedBy({ candidateRange, existingAppointments })).toBe(true);
    });

    it('should fail specification when active appointment overlaps', () => {
      const existingAppointments = [
        {
          timeRange: TimeRange.create(
            new Date('2026-08-03T10:30:00.000Z'),
            new Date('2026-08-03T11:30:00.000Z'),
          ),
          status: AppointmentStatus.SCHEDULED,
        },
      ];

      expect(spec.isSatisfiedBy({ candidateRange, existingAppointments })).toBe(false);
    });

    it('should ignore CANCELLED appointments when evaluating overlap', () => {
      const existingAppointments = [
        {
          timeRange: TimeRange.create(
            new Date('2026-08-03T10:30:00.000Z'),
            new Date('2026-08-03T11:30:00.000Z'),
          ),
          status: AppointmentStatus.CANCELLED,
        },
      ];

      expect(spec.isSatisfiedBy({ candidateRange, existingAppointments })).toBe(true);
    });
  });

  describe('ClientAvailabilitySpecification', () => {
    const candidateRange = TimeRange.create(
      new Date('2026-08-03T14:00:00.000Z'),
      new Date('2026-08-03T15:00:00.000Z'),
    );

    const spec = new ClientAvailabilitySpecification();

    it('should satisfy specification when client has no conflicting active appointments', () => {
      const clientAppointments = [
        {
          timeRange: TimeRange.create(
            new Date('2026-08-03T09:00:00.000Z'),
            new Date('2026-08-03T10:00:00.000Z'),
          ),
          status: AppointmentStatus.COMPLETED,
        },
      ];

      expect(spec.isSatisfiedBy({ candidateRange, clientAppointments })).toBe(true);
    });

    it('should fail specification when client has conflicting appointment', () => {
      const clientAppointments = [
        {
          timeRange: TimeRange.create(
            new Date('2026-08-03T14:30:00.000Z'),
            new Date('2026-08-03T15:30:00.000Z'),
          ),
          status: AppointmentStatus.CONFIRMED,
        },
      ];

      expect(spec.isSatisfiedBy({ candidateRange, clientAppointments })).toBe(false);
    });
  });
});
