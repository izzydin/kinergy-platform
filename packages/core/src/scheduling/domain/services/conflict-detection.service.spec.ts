import { ConflictDetectionService } from './conflict-detection.service';
import { BusinessCalendarService } from './business-calendar.service';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { VacationPeriod } from '../therapist-schedule/value-objects/vacation-period.vo';
import { Room } from '../room/room.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';
import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';

describe('ConflictDetectionService', () => {
  let calendarService: BusinessCalendarService;
  let appointmentRepo: jest.Mocked<AppointmentRepository>;
  let scheduleRepo: jest.Mocked<TherapistScheduleRepository>;
  let roomRepo: jest.Mocked<RoomRepository>;
  let service: ConflictDetectionService;

  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  // 2026-08-03 is Monday (Day 1)
  const mondayWorkRange = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  beforeEach(() => {
    calendarService = new BusinessCalendarService();
    appointmentRepo = {
      findById: jest.fn(),
      findByTherapistId: jest.fn().mockResolvedValue([]),
      findByRoomId: jest.fn().mockResolvedValue([]),
      findByClientId: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    scheduleRepo = {
      findByTherapistId: jest.fn(),
      save: jest.fn(),
    };
    roomRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
    };

    service = new ConflictDetectionService(
      calendarService,
      appointmentRepo,
      scheduleRepo,
      roomRepo,
    );
  });

  it('should detect zero conflicts when all conditions are satisfied', async () => {
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      workingHours: [monday9to17],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);

    const conflicts = await service.detectConflicts({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      clientId: 'client_1',
      requestedRange: mondayWorkRange,
    });

    expect(conflicts).toHaveLength(0);
  });

  it('should detect HOLIDAY conflict when facility is closed', async () => {
    calendarService.addHoliday(new Date('2026-08-03T00:00:00.000Z'), 'Civic Holiday');

    const conflicts = await service.detectConflicts({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      clientId: 'client_1',
      requestedRange: mondayWorkRange,
    });

    expect(conflicts.some((c) => c.conflictType === 'HOLIDAY')).toBe(true);
  });

  it('should detect VACATION conflict when therapist is on vacation', async () => {
    const vacation = VacationPeriod.create(
      TimeRange.create(new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-05T23:59:59.000Z')),
    );
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      vacations: [vacation],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);

    const conflicts = await service.detectConflicts({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      clientId: 'client_1',
      requestedRange: mondayWorkRange,
    });

    expect(conflicts.some((c) => c.conflictType === 'VACATION')).toBe(true);
  });

  it('should detect ROOM conflict when room is in MAINTENANCE or has booking overlap', async () => {
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      workingHours: [monday9to17],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });
    room.markMaintenance('HVAC Repair');

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);

    const conflicts = await service.detectConflicts({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      clientId: 'client_1',
      requestedRange: mondayWorkRange,
    });

    expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
  });

  it('should detect CLIENT conflict when client has overlapping active appointment', async () => {
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      workingHours: [monday9to17],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });

    const existingClientAppt = Appointment.create({
      clientId: 'client_1',
      therapistId: 'therapist_99',
      roomId: 'room_99',
      type: apptType,
      timeRange: mondayWorkRange,
    });

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);
    appointmentRepo.findByClientId.mockResolvedValue([existingClientAppt]);

    const conflicts = await service.detectConflicts({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      clientId: 'client_1',
      requestedRange: mondayWorkRange,
    });

    expect(conflicts.some((c) => c.conflictType === 'CLIENT')).toBe(true);
  });
});
