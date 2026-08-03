import { AvailabilityService } from './availability.service';
import { BusinessCalendarService } from './business-calendar.service';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { Room } from '../room/room.aggregate';
import { Duration } from '../value-objects/duration.vo';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';

describe('AvailabilityService', () => {
  let calendarService: BusinessCalendarService;
  let appointmentRepo: jest.Mocked<AppointmentRepository>;
  let scheduleRepo: jest.Mocked<TherapistScheduleRepository>;
  let roomRepo: jest.Mocked<RoomRepository>;
  let service: AvailabilityService;

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

    service = new AvailabilityService(calendarService, appointmentRepo, scheduleRepo, roomRepo);
  });

  it('should compute available booking slots within working hours', async () => {
    // Monday = 1
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      workingHours: [monday9to17],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);

    // Monday 2026-08-03 09:00 to 12:00
    const startDate = new Date('2026-08-03T09:00:00.000Z');
    const endDate = new Date('2026-08-03T12:00:00.000Z');
    const duration = Duration.fromHours(1);

    const slots = await service.findAvailableSlots({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      duration,
      startDate,
      endDate,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]?.start.toISOString()).toBe('2026-08-03T09:00:00.000Z');
  });

  it('should return empty slots array when facility is closed for holiday', async () => {
    const monday9to17 = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    const schedule = TherapistSchedule.create({
      therapistId: 'therapist_1',
      workingHours: [monday9to17],
    });
    const room = Room.create({ name: 'Suite 1', capacity: 2 });

    scheduleRepo.findByTherapistId.mockResolvedValue(schedule);
    roomRepo.findById.mockResolvedValue(room);
    calendarService.addHoliday(new Date('2026-08-03T00:00:00.000Z'), 'Holiday');

    const startDate = new Date('2026-08-03T09:00:00.000Z');
    const endDate = new Date('2026-08-03T12:00:00.000Z');

    const slots = await service.findAvailableSlots({
      therapistId: 'therapist_1',
      roomId: 'room_1',
      duration: Duration.fromHours(1),
      startDate,
      endDate,
    });

    expect(slots).toHaveLength(0);
  });
});
