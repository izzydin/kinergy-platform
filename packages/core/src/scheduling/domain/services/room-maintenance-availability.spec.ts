import { RoomAvailabilityEvaluator } from './room-availability-evaluator.service';
import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { TurnaroundBuffer } from '../value-objects/turnaround-buffer.vo';
import { ConflictDetectionService } from './conflict-detection.service';
import { BusinessCalendarService } from './business-calendar.service';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';

describe('Room Availability & Maintenance Windows Behavior', () => {
  const evaluator = new RoomAvailabilityEvaluator();

  describe('Scheduled Maintenance Window Overlaps & Boundaries', () => {
    it('should block candidate appointment when it overlaps with a scheduled maintenance window', () => {
      const room = Room.create({ name: 'Therapy Suite 1', capacity: 2 });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T10:00:00Z'),
          new Date('2026-09-01T12:00:00Z'),
        ),
        reason: 'Hydrotherapy tub sanitation',
      });

      // Target overlapping maintenance: 10:30 to 11:30
      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:30:00Z'),
        new Date('2026-09-01T11:30:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain(
        "blocked by scheduled maintenance 'Hydrotherapy tub sanitation'",
      );
      expect(result.reason).toContain('2026-09-01T10:00:00.000Z to 2026-09-01T12:00:00.000Z');
    });

    it('should ALLOW appointment that starts EXACTLY when maintenance ends (strictly adjacent)', () => {
      const room = Room.create({ name: 'Therapy Suite 1', capacity: 2 });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T08:00:00Z'),
          new Date('2026-09-01T10:00:00Z'),
        ),
        reason: 'Morning cleaning',
      });

      // Appointment starts exactly at 10:00:00Z
      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });

      expect(result.isAvailable).toBe(true);
    });

    it('should ALLOW appointment that ends EXACTLY when maintenance starts (strictly adjacent)', () => {
      const room = Room.create({ name: 'Therapy Suite 1', capacity: 2 });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T12:00:00Z'),
          new Date('2026-09-01T14:00:00Z'),
        ),
        reason: 'Afternoon calibration',
      });

      // Appointment ends exactly at 12:00:00Z
      const targetRange = TimeRange.create(
        new Date('2026-09-01T11:00:00Z'),
        new Date('2026-09-01T12:00:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });

      expect(result.isAvailable).toBe(true);
    });

    it('should BLOCK strictly adjacent appointment when turnaround buffer extends across the boundary', () => {
      const room = Room.create({ name: 'Therapy Suite 1', capacity: 2 });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T08:00:00Z'),
          new Date('2026-09-01T10:00:00Z'),
        ),
        reason: 'Morning cleaning',
      });

      // Appointment [10:00, 11:00) with 15min prep buffer needs room from 09:45
      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );
      const buffer = TurnaroundBuffer.of(15, 0);

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
        buffer,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('blocked by scheduled maintenance');
    });

    it('should restore room availability when scheduled maintenance is cancelled', () => {
      const room = Room.create({ name: 'Therapy Suite 1', capacity: 2 });
      const window = room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T10:00:00Z'),
          new Date('2026-09-01T12:00:00Z'),
        ),
        reason: 'Sanitation',
      });

      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:30:00Z'),
        new Date('2026-09-01T11:30:00Z'),
      );

      // Blocked before cancel
      expect(evaluator.evaluate({ room, existingAppointments: [], targetRange }).isAvailable).toBe(
        false,
      );

      // Cancel maintenance
      room.cancelMaintenance(window.id);

      // Available after cancel
      expect(evaluator.evaluate({ room, existingAppointments: [], targetRange }).isAvailable).toBe(
        true,
      );
    });
  });

  describe('DST Transitions across Maintenance Windows', () => {
    it('should correctly evaluate maintenance window spanning US Eastern Spring Forward DST boundary', () => {
      const room = Room.create({ name: 'DST Room', capacity: 1 });

      // US Eastern Spring Forward occurs on 2026-03-08 at 02:00 EST -> 03:00 EDT (07:00 UTC)
      // Maintenance scheduled from 06:00 UTC to 08:00 UTC (crosses the DST boundary)
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-03-08T06:00:00Z'),
          new Date('2026-03-08T08:00:00Z'),
        ),
        reason: 'DST Clock Synchronizer System Maintenance',
      });

      // Target overlapping candidate during the DST transition hour
      const targetOverlapping = TimeRange.create(
        new Date('2026-03-08T06:30:00Z'),
        new Date('2026-03-08T07:30:00Z'),
      );
      expect(
        evaluator.evaluate({ room, existingAppointments: [], targetRange: targetOverlapping })
          .isAvailable,
      ).toBe(false);

      // Target immediately following maintenance
      const targetAfter = TimeRange.create(
        new Date('2026-03-08T08:00:00Z'),
        new Date('2026-03-08T09:00:00Z'),
      );
      expect(
        evaluator.evaluate({ room, existingAppointments: [], targetRange: targetAfter })
          .isAvailable,
      ).toBe(true);
    });
  });

  describe('Non-Reservable & Inactive Room Operational Statuses', () => {
    it('should reject when room is in indefinite MAINTENANCE status', () => {
      const room = Room.create({ name: 'Flooded Suite', capacity: 1 });
      room.markMaintenance('Emergency water pipe burst');

      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('is currently MAINTENANCE: Emergency water pipe burst');
    });

    it('should reject when room is UNAVAILABLE / Deactivated', () => {
      const room = Room.create({ name: 'Closed Suite', capacity: 1 });
      room.deactivate('Room decommissioned');

      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('is currently UNAVAILABLE: Room decommissioned');
    });
  });

  describe('ConflictDetectionService Integration (4D Pipeline)', () => {
    it('should generate rich ROOM conflict diagnostic when scheduled maintenance blocks appointment', async () => {
      const room = Room.create({
        id: RoomId.create('room_4d_1'),
        name: 'Hydro Suite Alpha',
        capacity: 2,
      });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-08-03T10:00:00Z'),
          new Date('2026-08-03T12:00:00Z'),
        ),
        reason: 'Ozone filtration overhaul',
      });

      const appointmentRepo = {
        findById: jest.fn(),
        findConflictingAppointments: jest.fn().mockResolvedValue([]),
        findAppointmentsForTherapist: jest.fn().mockResolvedValue([]),
        findAppointmentsForRoom: jest.fn().mockResolvedValue([]),
        findAppointmentsForClient: jest.fn().mockResolvedValue([]),
        findAppointmentsByRange: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
      };
      const therapistSchedule = TherapistSchedule.create({
        therapistId: 'therapist_1',
      });
      therapistSchedule.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));

      const scheduleRepo = {
        findByTherapistId: jest.fn().mockResolvedValue(therapistSchedule),
        save: jest.fn(),
      };
      const roomRepo = {
        findById: jest.fn().mockResolvedValue(room),
        findAvailableRooms: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([room]),
        save: jest.fn(),
      };

      const calendarService = new BusinessCalendarService();

      const conflictService = new ConflictDetectionService(
        calendarService,
        appointmentRepo as unknown as AppointmentRepository,
        scheduleRepo as unknown as TherapistScheduleRepository,
        roomRepo as unknown as RoomRepository,
      );

      const requestedRange = TimeRange.create(
        new Date('2026-08-03T10:30:00Z'),
        new Date('2026-08-03T11:30:00Z'),
      );

      const result = await conflictService.evaluateConflicts({
        therapistId: 'therapist_1',
        roomId: 'room_4d_1',
        clientId: 'client_999',
        requestedRange,
      });

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.category).toBe('ROOM');
      expect(result.conflicts[0]!.conflictingEntityId).toBe('room_4d_1');
      expect(result.conflicts[0]!.reason).toContain('blocked by scheduled maintenance');
      expect(result.conflicts[0]!.reason).toContain('Ozone filtration overhaul');
    });
  });
});
