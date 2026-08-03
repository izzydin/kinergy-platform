import { CreateAppointmentHandler } from './handlers/create-appointment.handler';
import { ConfirmAppointmentHandler } from './handlers/confirm-appointment.handler';
import { CheckInAppointmentHandler } from './handlers/check-in-appointment.handler';
import { CompleteAppointmentHandler } from './handlers/complete-appointment.handler';
import { CancelAppointmentHandler } from './handlers/cancel-appointment.handler';
import { MarkNoShowHandler } from './handlers/mark-no-show.handler';
import { RescheduleAppointmentHandler } from './handlers/reschedule-appointment.handler';
import { AssignTherapistHandler } from './handlers/assign-therapist.handler';
import { AssignRoomHandler } from './handlers/assign-room.handler';

import { CreateAppointmentCommand } from './commands/create-appointment.command';
import { ConfirmAppointmentCommand } from './commands/confirm-appointment.command';
import { CheckInAppointmentCommand } from './commands/check-in-appointment.command';
import { CompleteAppointmentCommand } from './commands/complete-appointment.command';
import { CancelAppointmentCommand } from './commands/cancel-appointment.command';
import { MarkNoShowCommand } from './commands/mark-no-show.command';
import { RescheduleAppointmentCommand } from './commands/reschedule-appointment.command';
import { AssignTherapistCommand } from './commands/assign-therapist.command';
import { AssignRoomCommand } from './commands/assign-room.command';

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

import { TherapistAvailabilitySpecification } from '../../domain/specifications/therapist-availability.specification';
import { RoomAvailabilitySpecification } from '../../domain/specifications/room-availability.specification';

import { TestClock } from '../../domain/shared/clock';
import { Appointment } from '../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../domain/appointment/appointment-id.vo';
import { TherapistSchedule } from '../../domain/therapist-schedule/therapist-schedule.aggregate';
import { Room } from '../../domain/room/room.aggregate';
import { RoomId } from '../../domain/room/room-id.vo';
import { WorkingHours } from '../../domain/therapist-schedule/value-objects/working-hours.vo';
import { TimeRange } from '../../domain/value-objects/time-range.vo';
import { RoomStatus } from '../../domain/value-objects/room-status.enum';
import { AppointmentStatus } from '../../domain/value-objects/appointment-status.enum';

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
    return Array.from(this.appointments.values()).filter((appt) => {
      if (!appt.timeRange.overlaps(range)) return false;
      if (options?.therapistId && appt.therapistId !== options.therapistId) return false;
      if (options?.roomId && appt.roomId !== options.roomId) return false;
      if (options?.clientId && appt.clientId !== options.clientId) return false;
      if (options?.status && appt.status !== options.status) return false;
      return true;
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

  public async findAvailableRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter((r) => r.status === RoomStatus.AVAILABLE);
  }

  public async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  public async save(room: Room): Promise<void> {
    this.rooms.set(room.id.toString(), room);
  }
}

describe('Appointment Lifecycle Integration Tests', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let scheduleRepo: InMemoryTherapistScheduleRepository;
  let roomRepo: InMemoryRoomRepository;
  let calendarService: BusinessCalendarService;
  let conflictService: ConflictDetectionService;
  let clock: TestClock;

  let createHandler: CreateAppointmentHandler;
  let confirmHandler: ConfirmAppointmentHandler;
  let checkInHandler: CheckInAppointmentHandler;
  let completeHandler: CompleteAppointmentHandler;
  let cancelHandler: CancelAppointmentHandler;
  let noShowHandler: MarkNoShowHandler;
  let rescheduleHandler: RescheduleAppointmentHandler;
  let assignTherapistHandler: AssignTherapistHandler;
  let assignRoomHandler: AssignRoomHandler;

  // Monday 2026-08-03
  const now = new Date('2026-08-03T08:00:00.000Z');

  beforeEach(async () => {
    clock = new TestClock(now);
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

    // Setup working schedule for therapist_1 and therapist_2 (Monday 09:00 - 17:00)
    const mondayWork = WorkingHours.fromTimeStrings(1, '09:00', '17:00');
    await scheduleRepo.save(
      TherapistSchedule.create({
        therapistId: 'therapist_1',
        workingHours: [mondayWork],
      }),
    );
    await scheduleRepo.save(
      TherapistSchedule.create({
        therapistId: 'therapist_2',
        workingHours: [mondayWork],
      }),
    );

    // Setup available room_1 and room_2
    await roomRepo.save(
      Room.create({
        id: RoomId.create('room_1'),
        name: 'Hydrotherapy Room 1',
        capacity: 3,
        features: ['hydromassage'],
        status: RoomStatus.AVAILABLE,
      }),
    );

    await roomRepo.save(
      Room.create({
        id: RoomId.create('room_2'),
        name: 'Suite 2',
        capacity: 5,
        features: ['hydromassage'],
        status: RoomStatus.AVAILABLE,
      }),
    );

    createHandler = new CreateAppointmentHandler(
      apptRepo,
      conflictService,
      new BookingWindowPolicy(),
      new DefaultAppointmentDurationPolicy(),
      new BookingIdempotencyPolicy(),
      clock,
    );

    confirmHandler = new ConfirmAppointmentHandler(apptRepo, clock);
    checkInHandler = new CheckInAppointmentHandler(apptRepo, clock);
    completeHandler = new CompleteAppointmentHandler(apptRepo, clock);
    cancelHandler = new CancelAppointmentHandler(apptRepo, new CancellationPolicy(), clock);
    noShowHandler = new MarkNoShowHandler(apptRepo, clock);
    rescheduleHandler = new RescheduleAppointmentHandler(
      apptRepo,
      conflictService,
      new ReschedulePolicy(),
      clock,
    );

    assignTherapistHandler = new AssignTherapistHandler(
      apptRepo,
      scheduleRepo,
      conflictService,
      new TherapistAvailabilitySpecification(),
      clock,
    );

    assignRoomHandler = new AssignRoomHandler(
      apptRepo,
      roomRepo,
      conflictService,
      new RoomAvailabilitySpecification(),
      clock,
    );
  });

  it('should complete full successful lifecycle: Create -> Confirm -> CheckIn -> Start -> Complete', async () => {
    // 1. Create Appointment
    const createCmd = new CreateAppointmentCommand({
      clientId: 'client_1',
      therapistId: 'therapist_1',
      roomId: 'room_1',
      type: 'TREATMENT',
      startTime: '2026-08-03T10:00:00.000Z',
      endTime: '2026-08-03T11:00:00.000Z',
    });

    const createRes = await createHandler.execute(createCmd);
    expect(createRes.isSuccess).toBe(true);
    const apptId = createRes.getValue().id;
    expect(createRes.getValue().status).toBe('SCHEDULED');
    expect(createRes.getValue().version).toBe(1);

    // 2. Confirm Appointment
    const confirmCmd = new ConfirmAppointmentCommand({
      appointmentId: apptId,
      expectedVersion: 1,
    });
    const confirmRes = await confirmHandler.execute(confirmCmd);
    expect(confirmRes.isSuccess).toBe(true);
    expect(confirmRes.getValue().status).toBe('CONFIRMED');
    expect(confirmRes.getValue().version).toBe(2);

    // 3. Check-In Appointment
    const checkInCmd = new CheckInAppointmentCommand({
      appointmentId: apptId,
      expectedVersion: 2,
    });
    const checkInRes = await checkInHandler.execute(checkInCmd);
    expect(checkInRes.isSuccess).toBe(true);
    expect(checkInRes.getValue().status).toBe('CHECKED_IN');
    expect(checkInRes.getValue().version).toBe(3);

    // 4. Start Session
    const appt = (await apptRepo.findById(apptId))!;
    appt.start(clock);
    await apptRepo.save(appt);
    expect(appt.status).toBe('IN_PROGRESS');
    expect(appt.version).toBe(4);

    // 5. Complete Session
    const completeCmd = new CompleteAppointmentCommand({
      appointmentId: apptId,
      expectedVersion: 4,
    });
    const completeRes = await completeHandler.execute(completeCmd);
    expect(completeRes.isSuccess).toBe(true);
    expect(completeRes.getValue().status).toBe('COMPLETED');
    expect(completeRes.getValue().version).toBe(5);
  });

  it('should complete resource reassignment workflow: AssignTherapist & AssignRoom', async () => {
    const createRes = await createHandler.execute(
      new CreateAppointmentCommand({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: 'TREATMENT',
        startTime: '2026-08-03T10:00:00.000Z',
        endTime: '2026-08-03T11:00:00.000Z',
      }),
    );
    const apptId = createRes.getValue().id;

    // Reassign Therapist
    const therapistRes = await assignTherapistHandler.execute(
      new AssignTherapistCommand({
        appointmentId: apptId,
        newTherapistId: 'therapist_2',
        expectedVersion: 1,
      }),
    );
    expect(therapistRes.isSuccess).toBe(true);
    expect(therapistRes.getValue().therapistId).toBe('therapist_2');

    // Reassign Room
    const roomRes = await assignRoomHandler.execute(
      new AssignRoomCommand({
        appointmentId: apptId,
        newRoomId: 'room_2',
        expectedVersion: 2,
      }),
    );
    expect(roomRes.isSuccess).toBe(true);
    expect(roomRes.getValue().roomId).toBe('room_2');
  });

  it('should complete cancellation workflow: Create -> Confirm -> Cancel', async () => {
    const createRes = await createHandler.execute(
      new CreateAppointmentCommand({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: 'TREATMENT',
        startTime: '2026-08-03T11:00:00.000Z',
      }),
    );
    const apptId = createRes.getValue().id;

    await confirmHandler.execute(
      new ConfirmAppointmentCommand({
        appointmentId: apptId,
        expectedVersion: 1,
      }),
    );

    const cancelRes = await cancelHandler.execute(
      new CancelAppointmentCommand({
        appointmentId: apptId,
        reason: 'Client fever',
        expectedVersion: 2,
      }),
    );

    expect(cancelRes.isSuccess).toBe(true);
    expect(cancelRes.getValue().status).toBe('CANCELLED');
    expect(cancelRes.getValue().cancellationReason).toBe('Client fever');
  });

  it('should complete no-show workflow: Create -> MarkNoShow', async () => {
    const createRes = await createHandler.execute(
      new CreateAppointmentCommand({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: 'TREATMENT',
        startTime: '2026-08-03T12:00:00.000Z',
      }),
    );
    const apptId = createRes.getValue().id;

    // Advance clock past appointment start time
    clock.setTime(new Date('2026-08-03T12:30:00.000Z'));

    const noShowRes = await noShowHandler.execute(
      new MarkNoShowCommand({
        appointmentId: apptId,
        expectedVersion: 1,
        reason: 'Client did not show up',
      }),
    );

    expect(noShowRes.isSuccess).toBe(true);
    expect(noShowRes.getValue().status).toBe('NO_SHOW');
  });

  it('should reject state mutation when expectedVersion mismatches under optimistic locking race conditions', async () => {
    const createRes = await createHandler.execute(
      new CreateAppointmentCommand({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: 'TREATMENT',
        startTime: '2026-08-03T14:00:00.000Z',
      }),
    );
    const apptId = createRes.getValue().id;

    // Concurrent command 1 succeeds
    await confirmHandler.execute(
      new ConfirmAppointmentCommand({
        appointmentId: apptId,
        expectedVersion: 1,
      }),
    );

    // Concurrent command 2 with stale expectedVersion === 1 fails
    const staleRes = await cancelHandler.execute(
      new CancelAppointmentCommand({
        appointmentId: apptId,
        reason: 'Stale update',
        expectedVersion: 1, // Mismatches version 2!
      }),
    );

    expect(staleRes.isFailure).toBe(true);
    expect(staleRes.getError()).toContain('Concurrency version mismatch');
  });

  it('should reject state mutation on terminal COMPLETED/CANCELLED appointments', async () => {
    const createRes = await createHandler.execute(
      new CreateAppointmentCommand({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: 'room_1',
        type: 'TREATMENT',
        startTime: '2026-08-03T15:00:00.000Z',
      }),
    );
    const apptId = createRes.getValue().id;

    // Cancel appointment
    await cancelHandler.execute(
      new CancelAppointmentCommand({
        appointmentId: apptId,
        reason: 'Client cancelled',
        expectedVersion: 1,
      }),
    );

    // Attempting to reschedule cancelled appointment fails
    const rescheduleRes = await rescheduleHandler.execute(
      new RescheduleAppointmentCommand({
        appointmentId: apptId,
        expectedVersion: 2,
        newStartTime: '2026-08-03T16:00:00.000Z',
        newEndTime: '2026-08-03T17:00:00.000Z',
      }),
    );

    expect(rescheduleRes.isFailure).toBe(true);
    expect(rescheduleRes.getError()).toContain('terminal');
  });
});
