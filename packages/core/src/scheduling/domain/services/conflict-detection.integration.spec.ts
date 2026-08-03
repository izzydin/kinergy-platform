import { ConflictDetectionService } from './conflict-detection.service';
import { BusinessCalendarService } from './business-calendar.service';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { VacationPeriod } from '../therapist-schedule/value-objects/vacation-period.vo';
import { AvailabilityOverride } from '../therapist-schedule/value-objects/availability-override.vo';
import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentId } from '../appointment/appointment-id.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TurnaroundBufferPolicy } from '../policies/turnaround-buffer.policy';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';
import { TestClock } from '../shared/clock';

describe('Conflict Detection Engine Integration Tests', () => {
  let calendarService: BusinessCalendarService;
  let appointmentRepo: jest.Mocked<AppointmentRepository>;
  let scheduleRepo: jest.Mocked<TherapistScheduleRepository>;
  let roomRepo: jest.Mocked<RoomRepository>;
  let bufferPolicy: TurnaroundBufferPolicy;
  let conflictService: ConflictDetectionService;

  const clock = new TestClock(new Date('2026-08-03T08:00:00.000Z'));
  const treatmentType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  beforeEach(() => {
    calendarService = new BusinessCalendarService();
    appointmentRepo = {
      findById: jest.fn(),
      findConflictingAppointments: jest.fn().mockResolvedValue([]),
      findAppointmentsForTherapist: jest.fn().mockResolvedValue([]),
      findAppointmentsForRoom: jest.fn().mockResolvedValue([]),
      findAppointmentsForClient: jest.fn().mockResolvedValue([]),
      findAppointmentsByRange: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    scheduleRepo = {
      findByTherapistId: jest.fn(),
      save: jest.fn(),
    };
    roomRepo = {
      findById: jest.fn(),
      findAvailableRooms: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    bufferPolicy = TurnaroundBufferPolicy.createDefault(); // TREATMENT requires 15 min cleanup
    conflictService = new ConflictDetectionService(
      calendarService,
      appointmentRepo,
      scheduleRepo,
      roomRepo,
      bufferPolicy,
    );
  });

  describe('Back-to-Back Turnaround Buffer Collisions', () => {
    it('should block a 10:00-11:00 appointment when an existing appointment ends at 10:00 with 15-min cleanup buffer', async () => {
      const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_1',
        workingHours: [monday9to17],
      });
      const room = Room.create({ id: RoomId.create('room_1'), name: 'Suite 1', capacity: 2 });

      // Existing appointment 09:00 - 10:00
      const existingAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_99',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: treatmentType, // Requires 15 min cleanup -> occupies up to 10:15
          timeRange: TimeRange.create(
            new Date('2026-08-03T09:00:00.000Z'),
            new Date('2026-08-03T10:00:00.000Z'),
          ),
        },
        clock,
      );

      scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
      roomRepo.findById.mockResolvedValue(room);
      appointmentRepo.findAppointmentsForTherapist.mockResolvedValue([existingAppt]);

      // Candidate request starting at 10:00
      const candidateRange = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      const conflicts = await conflictService.detectConflicts({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        clientId: 'client_1',
        requestedRange: candidateRange,
        appointmentType: treatmentType,
      });

      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c) => c.conflictType === 'THERAPIST')).toBe(true);
    });

    it('should allow a 10:15-11:15 appointment when existing appointment ends at 10:00 with 15-min cleanup buffer', async () => {
      const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_1',
        workingHours: [monday9to17],
      });
      const room = Room.create({ id: RoomId.create('room_1'), name: 'Suite 1', capacity: 2 });

      // Existing appointment 09:00 - 10:00
      const existingAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_99',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: treatmentType,
          timeRange: TimeRange.create(
            new Date('2026-08-03T09:00:00.000Z'),
            new Date('2026-08-03T10:00:00.000Z'),
          ),
        },
        clock,
      );

      scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
      roomRepo.findById.mockResolvedValue(room);
      appointmentRepo.findAppointmentsForTherapist.mockResolvedValue([existingAppt]);

      // Candidate request starting at 10:15
      const candidateRange = TimeRange.create(
        new Date('2026-08-03T10:15:00.000Z'),
        new Date('2026-08-03T11:15:00.000Z'),
      );

      const conflicts = await conflictService.detectConflicts({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        clientId: 'client_1',
        requestedRange: candidateRange,
        appointmentType: treatmentType,
      });

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Vacation vs Override Priority Edge Case', () => {
    it('should prioritize vacation over temporary AVAILABLE override', async () => {
      const vacation = VacationPeriod.create(
        TimeRange.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-05T23:59:59.000Z'),
        ),
      );
      const override = AvailabilityOverride.create(
        TimeRange.create(
          new Date('2026-08-03T10:00:00.000Z'),
          new Date('2026-08-03T12:00:00.000Z'),
        ),
        'AVAILABLE',
        'Special shift',
      );

      const schedule = TherapistSchedule.create({
        therapistId: 'therapist_1',
        vacations: [vacation],
        overrides: [override],
      });
      const room = Room.create({ name: 'Suite 1', capacity: 2 });

      scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
      roomRepo.findById.mockResolvedValue(room);

      const candidateRange = TimeRange.create(
        new Date('2026-08-03T10:00:00.000Z'),
        new Date('2026-08-03T11:00:00.000Z'),
      );

      const conflicts = await conflictService.detectConflicts({
        therapistId: 'therapist_1',
        roomId: 'room_1',
        clientId: 'client_1',
        requestedRange: candidateRange,
      });

      expect(conflicts.some((c) => c.conflictType === 'VACATION')).toBe(true);
    });
  });
});
