import { CreateAppointmentHandler } from './handlers/create-appointment.handler';
import { RescheduleAppointmentHandler } from './handlers/reschedule-appointment.handler';
import { AssignRoomHandler } from './handlers/assign-room.handler';
import { CancelAppointmentHandler } from './handlers/cancel-appointment.handler';

import { CreateAppointmentCommand } from './commands/create-appointment.command';
import { RescheduleAppointmentCommand } from './commands/reschedule-appointment.command';
import { AssignRoomCommand } from './commands/assign-room.command';
import { CancelAppointmentCommand } from './commands/cancel-appointment.command';

import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../domain/repositories/appointment.repository';
import { TherapistScheduleRepository } from '../../domain/repositories/therapist-schedule.repository';
import { RoomRepository } from '../../domain/repositories/room.repository';

import { ConflictDetectionService } from '../../domain/services/conflict-detection.service';
import { BusinessCalendarService } from '../../domain/services/business-calendar.service';
import { BookingWindowPolicy } from '../../domain/policies/booking-window.policy';
import { DefaultAppointmentDurationPolicy } from '../../domain/policies/appointment-duration.policy';
import { BookingIdempotencyPolicy } from '../../domain/policies/booking-idempotency.policy';
import { ReschedulePolicy } from '../../domain/policies/reschedule.policy';
import { CancellationPolicy } from '../../domain/policies/cancellation.policy';
import { RoomAvailabilitySpecification } from '../../domain/specifications/room-availability.specification';

import { TestClock } from '../../domain/shared/clock';
import { Appointment } from '../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../domain/appointment/appointment-id.vo';
import { TherapistSchedule } from '../../domain/therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../../domain/therapist-schedule/value-objects/working-hours.vo';
import { Room } from '../../domain/room/room.aggregate';
import { RoomId } from '../../domain/room/room-id.vo';
import { TimeRange } from '../../domain/value-objects/time-range.vo';
import { Duration } from '../../domain/value-objects/duration.vo';
import { AppointmentStatus } from '../../domain/value-objects/appointment-status.enum';
import { AppointmentConflictException } from '../../domain/exceptions/appointment-conflict.exception';

class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments = new Map<string, Appointment>();

  public async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.appointments.get(key) ?? null;
  }

  public async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    range: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((appt) => {
      if (excludeAppointmentId && appt.id.toString() === excludeAppointmentId) return false;
      if (this.isTerminal(appt.status)) return false;
      const sharesResource =
        appt.therapistId === therapistId || appt.roomId === roomId || appt.clientId === clientId;
      return sharesResource && appt.timeRange.overlaps(range);
    });
  }

  public async findAppointmentsForTherapist(
    therapistId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) =>
        a.therapistId === therapistId && !this.isTerminal(a.status) && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.roomId === roomId && !this.isTerminal(a.status) && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsForClient(
    clientId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.clientId === clientId && !this.isTerminal(a.status) && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((a) => {
      if (options?.therapistId && a.therapistId !== options.therapistId) return false;
      if (options?.roomId && a.roomId !== options.roomId) return false;
      if (options?.status && a.status !== options.status) return false;
      if (options?.seriesId && a.seriesId !== options.seriesId) return false;
      return a.timeRange.overlaps(range);
    });
  }

  public async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.toString(), appointment);
  }

  private isTerminal(status: AppointmentStatus): boolean {
    return (
      status === AppointmentStatus.COMPLETED ||
      status === AppointmentStatus.CANCELLED ||
      status === AppointmentStatus.NO_SHOW
    );
  }
}

class InMemoryTherapistScheduleRepository implements TherapistScheduleRepository {
  private schedules = new Map<string, TherapistSchedule>();

  public async findByTherapistId(therapistId: string): Promise<TherapistSchedule | null> {
    return this.schedules.get(therapistId) ?? null;
  }

  public async save(schedule: TherapistSchedule): Promise<void> {
    this.schedules.set(schedule.therapistId, schedule);
  }
}

class InMemoryRoomRepository implements RoomRepository {
  private rooms = new Map<string, Room>();

  public async findById(id: RoomId | string): Promise<Room | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.rooms.get(key) ?? null;
  }

  public async findAvailableRooms(range: TimeRange): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter(
      (r) => r.isReservable() && !r.isUnderMaintenance(range),
    );
  }

  public async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  public async save(room: Room): Promise<void> {
    this.rooms.set(room.id.toString(), room);
  }
}

describe('Appointment & Schedulable Resource Scheduling Integration Pipeline', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let scheduleRepo: InMemoryTherapistScheduleRepository;
  let roomRepo: InMemoryRoomRepository;
  let conflictService: ConflictDetectionService;
  let calendarService: BusinessCalendarService;
  let clock: TestClock;

  let createHandler: CreateAppointmentHandler;
  let rescheduleHandler: RescheduleAppointmentHandler;
  let assignRoomHandler: AssignRoomHandler;
  let cancelHandler: CancelAppointmentHandler;

  // Base fixtures: 2026-08-03 is Monday (Day 1)
  const mondayDate = '2026-08-03';
  const therapistId = 'therapist_1';
  const room1Id = 'room_1';
  const room2Id = 'room_2';
  const clientId = 'client_100';

  beforeEach(async () => {
    clock = new TestClock(new Date(`${mondayDate}T08:00:00.000Z`));
    apptRepo = new InMemoryAppointmentRepository();
    scheduleRepo = new InMemoryTherapistScheduleRepository();
    roomRepo = new InMemoryRoomRepository();
    calendarService = new BusinessCalendarService();

    conflictService = new ConflictDetectionService(
      calendarService,
      apptRepo,
      scheduleRepo,
      roomRepo,
    );

    const bookingWindowPolicy = new BookingWindowPolicy();
    const durationPolicy = new DefaultAppointmentDurationPolicy();
    const idempotencyPolicy = new BookingIdempotencyPolicy();
    const reschedulePolicy = new ReschedulePolicy({ minNotice: Duration.fromMinutes(0) });
    const cancellationPolicy = new CancellationPolicy();
    const roomSpec = new RoomAvailabilitySpecification();

    createHandler = new CreateAppointmentHandler(
      apptRepo,
      conflictService,
      bookingWindowPolicy,
      durationPolicy,
      idempotencyPolicy,
      clock,
    );

    rescheduleHandler = new RescheduleAppointmentHandler(
      apptRepo,
      conflictService,
      reschedulePolicy,
      clock,
    );

    assignRoomHandler = new AssignRoomHandler(apptRepo, roomRepo, conflictService, roomSpec, clock);

    cancelHandler = new CancelAppointmentHandler(apptRepo, cancellationPolicy, clock);

    // Setup therapist schedule: Monday 08:00 - 18:00
    const schedule = TherapistSchedule.create({ therapistId });
    schedule.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
    await scheduleRepo.save(schedule);

    // Setup active rooms
    const room1 = Room.create({
      id: RoomId.create(room1Id),
      name: 'Hydrotherapy Suite 1',
      capacity: 2,
      features: ['hydrotherapy_tub', 'soundproof'],
    });
    const room2 = Room.create({
      id: RoomId.create(room2Id),
      name: 'Laser & Physio Suite 2',
      capacity: 1,
      features: ['laser_device'],
    });

    await roomRepo.save(room1);
    await roomRepo.save(room2);
  });

  describe('Appointment Creation with Resource Assignment', () => {
    it('should successfully create and persist an appointment assigned to an available room', async () => {
      const command = new CreateAppointmentCommand({
        clientId,
        therapistId,
        roomId: room1Id,
        type: 'TREATMENT',
        startTime: `${mondayDate}T10:00:00.000Z`,
        endTime: `${mondayDate}T11:00:00.000Z`,
      });

      const result = await createHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.roomId).toBe(room1Id);
      expect(dto.status).toBe('SCHEDULED');

      const saved = await apptRepo.findById(dto.id);
      expect(saved).not.toBeNull();
      expect(saved!.roomId).toBe(room1Id);
    });

    it('should reject appointment creation when room ID does not exist in repository', async () => {
      const command = new CreateAppointmentCommand({
        clientId,
        therapistId,
        roomId: 'non_existent_room',
        type: 'TREATMENT',
        startTime: `${mondayDate}T10:00:00.000Z`,
        endTime: `${mondayDate}T11:00:00.000Z`,
      });

      await expect(createHandler.execute(command)).rejects.toThrow(AppointmentConflictException);
    });

    it('should prevent room double-booking during overlapping intervals', async () => {
      // 1. First appointment booked 10:00 - 11:00 in room_1
      await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );

      // Setup a second therapist
      const therapist2 = TherapistSchedule.create({ therapistId: 'therapist_2' });
      therapist2.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
      await scheduleRepo.save(therapist2);

      // 2. Second appointment overlapping 10:30 - 11:30 attempting to use room_1
      const conflictingCommand = new CreateAppointmentCommand({
        clientId: 'client_2',
        therapistId: 'therapist_2',
        roomId: room1Id,
        type: 'TREATMENT',
        startTime: `${mondayDate}T10:30:00.000Z`,
        endTime: `${mondayDate}T11:30:00.000Z`,
      });

      await expect(createHandler.execute(conflictingCommand)).rejects.toThrow(
        AppointmentConflictException,
      );
    });

    it('should prevent appointment reservation in a room blocked by scheduled maintenance', async () => {
      const room = (await roomRepo.findById(room1Id))!;
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${mondayDate}T14:00:00.000Z`),
          new Date(`${mondayDate}T16:00:00.000Z`),
        ),
        reason: 'Ozone filtration replacement',
      });
      await roomRepo.save(room);

      const command = new CreateAppointmentCommand({
        clientId,
        therapistId,
        roomId: room1Id,
        type: 'TREATMENT',
        startTime: `${mondayDate}T14:30:00.000Z`,
        endTime: `${mondayDate}T15:30:00.000Z`,
      });

      await expect(createHandler.execute(command)).rejects.toThrow(AppointmentConflictException);
    });

    it('should prevent appointment reservation when room is inactive (UNAVAILABLE)', async () => {
      const room = (await roomRepo.findById(room1Id))!;
      room.deactivate('Building electrical upgrade');
      await roomRepo.save(room);

      const command = new CreateAppointmentCommand({
        clientId,
        therapistId,
        roomId: room1Id,
        type: 'TREATMENT',
        startTime: `${mondayDate}T10:00:00.000Z`,
        endTime: `${mondayDate}T11:00:00.000Z`,
      });

      await expect(createHandler.execute(command)).rejects.toThrow(AppointmentConflictException);
    });

    it('should prevent appointment reservation when room is in indefinite MAINTENANCE', async () => {
      const room = (await roomRepo.findById(room1Id))!;
      room.markMaintenance('Plumbing water leak');
      await roomRepo.save(room);

      const command = new CreateAppointmentCommand({
        clientId,
        therapistId,
        roomId: room1Id,
        type: 'TREATMENT',
        startTime: `${mondayDate}T10:00:00.000Z`,
        endTime: `${mondayDate}T11:00:00.000Z`,
      });

      await expect(createHandler.execute(command)).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('Appointment Rescheduling & Resource Re-Validation', () => {
    it('should reschedule appointment to a new time range and validate room availability', async () => {
      const createRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptId = createRes.getValue().id;

      const rescheduleRes = await rescheduleHandler.execute(
        new RescheduleAppointmentCommand({
          appointmentId: apptId,
          expectedVersion: 1,
          newStartTime: `${mondayDate}T13:00:00.000Z`,
          newEndTime: `${mondayDate}T14:00:00.000Z`,
        }),
      );

      expect(rescheduleRes.isSuccess).toBe(true);
      expect(rescheduleRes.getValue().startTime).toBe(`${mondayDate}T13:00:00.000Z`);
      expect(rescheduleRes.getValue().endTime).toBe(`${mondayDate}T14:00:00.000Z`);
    });

    it('should allow rescheduling appointment to BOTH a new time and a different room', async () => {
      const createRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptId = createRes.getValue().id;

      const rescheduleRes = await rescheduleHandler.execute(
        new RescheduleAppointmentCommand({
          appointmentId: apptId,
          expectedVersion: 1,
          newStartTime: `${mondayDate}T15:00:00.000Z`,
          newEndTime: `${mondayDate}T16:00:00.000Z`,
          newRoomId: room2Id,
        }),
      );

      expect(rescheduleRes.isSuccess).toBe(true);
      expect(rescheduleRes.getValue().roomId).toBe(room2Id);
      expect(rescheduleRes.getValue().startTime).toBe(`${mondayDate}T15:00:00.000Z`);
    });

    it('should reject rescheduling when new time range conflicts with another room reservation', async () => {
      // 1. Appointment A in room_1 at 10:00 - 11:00
      const createResA = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptIdA = createResA.getValue().id;

      // Setup therapist 2
      const therapist2 = TherapistSchedule.create({ therapistId: 'therapist_2' });
      therapist2.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
      await scheduleRepo.save(therapist2);

      // 2. Appointment B in room_1 at 14:00 - 15:00
      await createHandler.execute(
        new CreateAppointmentCommand({
          clientId: 'client_2',
          therapistId: 'therapist_2',
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T14:00:00.000Z`,
          endTime: `${mondayDate}T15:00:00.000Z`,
        }),
      );

      // 3. Rescheduling Appointment A into 14:30 - 15:30 in room_1 fails due to conflict
      await expect(
        rescheduleHandler.execute(
          new RescheduleAppointmentCommand({
            appointmentId: apptIdA,
            expectedVersion: 1,
            newStartTime: `${mondayDate}T14:30:00.000Z`,
            newEndTime: `${mondayDate}T15:30:00.000Z`,
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('Resource Assignment Changes & Room Reallocation', () => {
    it('should reassign room via AssignRoomHandler and re-verify room availability', async () => {
      const createRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptId = createRes.getValue().id;

      const assignRes = await assignRoomHandler.execute(
        new AssignRoomCommand({
          appointmentId: apptId,
          newRoomId: room2Id,
          expectedVersion: 1,
        }),
      );

      expect(assignRes.isSuccess).toBe(true);
      expect(assignRes.getValue().roomId).toBe(room2Id);

      const updated = (await apptRepo.findById(apptId))!;
      expect(updated.roomId).toBe(room2Id);
    });

    it('should reject room reassignment when target room is already booked at that time', async () => {
      // 1. Appointment A in room_1 at 10:00 - 11:00
      const createResA = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptIdA = createResA.getValue().id;

      // Setup therapist 2
      const therapist2 = TherapistSchedule.create({ therapistId: 'therapist_2' });
      therapist2.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
      await scheduleRepo.save(therapist2);

      // 2. Appointment B in room_2 at 10:00 - 11:00
      await createHandler.execute(
        new CreateAppointmentCommand({
          clientId: 'client_2',
          therapistId: 'therapist_2',
          roomId: room2Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );

      // 3. Reassigning Appointment A to room_2 fails with conflict
      await expect(
        assignRoomHandler.execute(
          new AssignRoomCommand({
            appointmentId: apptIdA,
            newRoomId: room2Id,
            expectedVersion: 1,
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('Cancellation & Natural Resource Release', () => {
    it('should naturally release room upon appointment cancellation without separate reservation counters', async () => {
      // 1. Book appointment in room_1 from 10:00 to 11:00
      const createRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptId = createRes.getValue().id;

      // 2. Cancel appointment
      const cancelRes = await cancelHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: apptId,
          reason: 'Client rescheduled work meeting',
          expectedVersion: 1,
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);
      expect(cancelRes.getValue().status).toBe('CANCELLED');

      // 3. Immediately book another appointment in room_1 for the EXACT same time interval
      const newBookingRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId: 'client_200',
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );

      expect(newBookingRes.isSuccess).toBe(true);
      expect(newBookingRes.getValue().roomId).toBe(room1Id);
      expect(newBookingRes.getValue().status).toBe('SCHEDULED');
    });

    it('should reject repeated cancellation attempts on already CANCELLED appointments', async () => {
      const createRes = await createHandler.execute(
        new CreateAppointmentCommand({
          clientId,
          therapistId,
          roomId: room1Id,
          type: 'TREATMENT',
          startTime: `${mondayDate}T10:00:00.000Z`,
          endTime: `${mondayDate}T11:00:00.000Z`,
        }),
      );
      const apptId = createRes.getValue().id;

      // First cancel succeeds
      await cancelHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: apptId,
          reason: 'First cancellation',
          expectedVersion: 1,
        }),
      );

      // Repeated cancel fails
      const repeatedCancel = await cancelHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: apptId,
          reason: 'Repeated cancellation attempt',
          expectedVersion: 2,
        }),
      );

      expect(repeatedCancel.isFailure).toBe(true);
      expect(repeatedCancel.getError()).toContain(
        "Cannot cancel appointment in terminal 'CANCELLED' status",
      );
    });
  });
});
