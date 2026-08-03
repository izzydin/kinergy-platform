import { TherapistAvailabilityEvaluator } from './therapist-availability-evaluator.service';
import { RoomAvailabilityEvaluator } from './room-availability-evaluator.service';
import { ClientAvailabilityEvaluator } from './client-availability-evaluator.service';

import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { VacationPeriod } from '../therapist-schedule/value-objects/vacation-period.vo';
import { BreakPeriod } from '../therapist-schedule/value-objects/break-period.vo';

import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';

import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentId } from '../appointment/appointment-id.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TestClock } from '../shared/clock';

describe('Multi-Resource Availability Evaluators', () => {
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  // Monday 2026-08-03
  const workRange = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  describe('TherapistAvailabilityEvaluator', () => {
    let evaluator: TherapistAvailabilityEvaluator;
    let schedule: TherapistSchedule;

    beforeEach(() => {
      evaluator = new TherapistAvailabilityEvaluator();
      const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
      schedule = TherapistSchedule.create({
        therapistId: 'therapist_1',
        workingHours: [monday9to17],
      });
    });

    it('should return available when target range is within working hours and has zero overlaps', () => {
      const result = evaluator.evaluate({
        schedule,
        existingAppointments: [],
        targetRange: workRange,
      });

      expect(result.isAvailable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return unavailable when therapist is on vacation', () => {
      const vacation = VacationPeriod.create(
        TimeRange.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-05T23:59:59.000Z'),
        ),
      );
      schedule.addVacation(vacation);

      const result = evaluator.evaluate({
        schedule,
        existingAppointments: [],
        targetRange: workRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('vacation');
    });

    it('should return unavailable when therapist is on break', () => {
      const breakPeriod = BreakPeriod.createRecurring(1, 720, 780, 'Lunch'); // Monday 12:00 - 13:00
      schedule.addBreak(breakPeriod);

      const lunchRange = TimeRange.create(
        new Date('2026-08-03T12:00:00.000Z'),
        new Date('2026-08-03T12:45:00.000Z'),
      );

      const result = evaluator.evaluate({
        schedule,
        existingAppointments: [],
        targetRange: lunchRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('break');
    });

    it('should return unavailable when turnaround buffer causes conflict with existing appointment', () => {
      const existingAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_99',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: TimeRange.create(
            new Date('2026-08-03T11:00:00.000Z'),
            new Date('2026-08-03T12:00:00.000Z'),
          ),
        },
        clock,
      );

      // Target candidate is 10:00-11:00 with 15-min cleanup buffer (expands to 09:45-11:15)
      const buffer = TurnaroundBuffer.of(0, 15);

      const result = evaluator.evaluate({
        schedule,
        existingAppointments: [existingAppt],
        targetRange: workRange,
        buffer,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('conflicting appointment');
    });
  });

  describe('RoomAvailabilityEvaluator', () => {
    let evaluator: RoomAvailabilityEvaluator;

    beforeEach(() => {
      evaluator = new RoomAvailabilityEvaluator();
    });

    it('should return available when room is AVAILABLE, capacity is sufficient, and features match', () => {
      const room = Room.create({
        id: RoomId.create('room_1'),
        name: 'Hydro Suite',
        capacity: 4,
        features: ['hydromassage'],
      });

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange: workRange,
        requiredCapacity: 2,
        requiredFeatures: ['hydromassage'],
      });

      expect(result.isAvailable).toBe(true);
    });

    it('should return unavailable when room is under MAINTENANCE', () => {
      const room = Room.create({ name: 'Suite 1', capacity: 2 });
      room.markMaintenance('HVAC filter replacement');

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange: workRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('MAINTENANCE');
    });

    it('should return unavailable when capacity is insufficient', () => {
      const room = Room.create({ name: 'Small Room', capacity: 1 });

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange: workRange,
        requiredCapacity: 3,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('capacity');
    });
  });

  describe('ClientAvailabilityEvaluator', () => {
    let evaluator: ClientAvailabilityEvaluator;

    beforeEach(() => {
      evaluator = new ClientAvailabilityEvaluator();
    });

    it('should return available when client has zero overlapping appointments', () => {
      const result = evaluator.evaluate({
        clientId: 'client_1',
        existingAppointments: [],
        targetRange: workRange,
      });

      expect(result.isAvailable).toBe(true);
    });

    it('should return unavailable when client has an active overlapping appointment', () => {
      const existingAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_99',
          roomId: 'room_99',
          type: apptType,
          timeRange: workRange,
        },
        clock,
      );

      const result = evaluator.evaluate({
        clientId: 'client_1',
        existingAppointments: [existingAppt],
        targetRange: workRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('overlapping active appointment');
    });
  });
});
