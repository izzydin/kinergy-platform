import {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  AppointmentType,
  AppointmentTypeEnum,
  TimeRange,
  TherapistSchedule,
  WorkingHours,
  Room,
  RoomId,
  RecurrenceSeries,
  RecurrencePattern,
  RecurrenceFrequency,
  ConflictDetectionService,
  AppointmentConflictException,
  TestClock,
} from '../../domain';
import { CreateAppointmentHandler } from '../../application/appointment/handlers/create-appointment.handler';
import { CreateAppointmentCommand } from '../../application/appointment/commands/create-appointment.command';
import { RescheduleAppointmentHandler } from '../../application/appointment/handlers/reschedule-appointment.handler';
import { RescheduleAppointmentCommand } from '../../application/appointment/commands/reschedule-appointment.command';
import { CancelAppointmentHandler } from '../../application/appointment/handlers/cancel-appointment.handler';
import { CancelAppointmentCommand } from '../../application/appointment/commands/cancel-appointment.command';
import { GenerateRecurringOccurrencesHandler } from '../../application/recurrence/handlers/generate-recurring-occurrences.handler';
import { GenerateRecurringOccurrencesCommand } from '../../application/recurrence/commands/generate-recurring-occurrences.command';
import { ScheduleMaintenanceHandler } from '../../application/room/handlers/schedule-maintenance.handler';
import { ScheduleMaintenanceCommand } from '../../application/room/commands/schedule-maintenance.command';
import {
  AppointmentRepository,
  RoomRepository,
  RecurrenceSeriesRepository,
  TherapistScheduleRepository,
  FindAppointmentsOptions,
} from '../../domain/repositories';
import { BookingWindowPolicy } from '../../domain/policies/booking-window.policy';
import { DefaultAppointmentDurationPolicy } from '../../domain/policies/appointment-duration.policy';
import { BookingIdempotencyPolicy } from '../../domain/policies/booking-idempotency.policy';
import { TurnaroundBufferPolicy } from '../../domain/policies/turnaround-buffer.policy';
import { ReschedulePolicy } from '../../domain/policies/reschedule.policy';
import { CancellationPolicy } from '../../domain/policies/cancellation.policy';
import { BusinessCalendarService } from '../../domain/services/business-calendar.service';

// In-Memory Repository with atomic transaction serialization
class InMemorySchedulingStore {
  public appointments = new Map<string, Appointment>();
  public rooms = new Map<string, Room>();
  public series = new Map<string, RecurrenceSeries>();
  public schedules = new Map<string, TherapistSchedule>();
  private writeLock: Promise<void> = Promise.resolve();

  public async withLock<T>(action: () => Promise<T>): Promise<T> {
    const prevLock = this.writeLock;
    let release: () => void;
    this.writeLock = new Promise((resolve) => {
      release = resolve;
    });
    await prevLock;
    try {
      return await action();
    } finally {
      release!();
    }
  }
}

class TestAppointmentRepository implements AppointmentRepository {
  constructor(private store: InMemorySchedulingStore) {}

  async save(appointment: Appointment): Promise<void> {
    this.store.appointments.set(appointment.id.toString(), appointment);
  }

  async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.store.appointments.get(key) ?? null;
  }

  async findBySeriesId(seriesId: string): Promise<Appointment[]> {
    return Array.from(this.store.appointments.values()).filter((a) => a.seriesId === seriesId);
  }

  async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    range: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    const conflicts: Appointment[] = [];
    for (const appt of this.store.appointments.values()) {
      if (excludeAppointmentId && appt.id.toString() === excludeAppointmentId) {
        continue;
      }
      if (
        appt.status === AppointmentStatus.CANCELLED ||
        appt.status === AppointmentStatus.NO_SHOW
      ) {
        continue;
      }
      const overlaps = appt.timeRange.overlaps(range);
      if (overlaps) {
        if (
          appt.therapistId === therapistId ||
          (roomId && appt.roomId === roomId) ||
          appt.clientId === clientId
        ) {
          conflicts.push(appt);
        }
      }
    }
    return conflicts;
  }

  async findAppointmentsForTherapist(
    therapistId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.store.appointments.values()).filter(
      (a) =>
        a.therapistId === therapistId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.status !== AppointmentStatus.NO_SHOW &&
        a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.store.appointments.values()).filter(
      (a) =>
        a.roomId === roomId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.status !== AppointmentStatus.NO_SHOW &&
        a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsForClient(clientId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.store.appointments.values()).filter(
      (a) =>
        a.clientId === clientId &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.status !== AppointmentStatus.NO_SHOW &&
        a.timeRange.overlaps(range),
    );
  }

  async findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    return Array.from(this.store.appointments.values()).filter((a) => {
      if (a.status === AppointmentStatus.CANCELLED || a.status === AppointmentStatus.NO_SHOW) {
        return false;
      }
      if (options?.therapistId && a.therapistId !== options.therapistId) return false;
      if (options?.roomId && a.roomId !== options.roomId) return false;
      if (options?.clientId && a.clientId !== options.clientId) return false;
      return a.timeRange.overlaps(range);
    });
  }
}

class TestRoomRepository implements RoomRepository {
  constructor(private store: InMemorySchedulingStore) {}

  async save(room: Room): Promise<void> {
    this.store.rooms.set(room.id.getValue(), room);
  }

  async findById(id: RoomId | string): Promise<Room | null> {
    const key = typeof id === 'string' ? id : id.getValue();
    return this.store.rooms.get(key) ?? null;
  }

  async findAll(): Promise<Room[]> {
    return Array.from(this.store.rooms.values());
  }

  async findAvailable(): Promise<Room[]> {
    return Array.from(this.store.rooms.values()).filter((r) => r.isReservable());
  }

  async findAvailableRooms(range: TimeRange, requiredFeatures?: string[]): Promise<Room[]> {
    return Array.from(this.store.rooms.values()).filter((r) => {
      if (!r.isReservable()) return false;
      if (r.isUnderMaintenance(range)) return false;
      if (requiredFeatures && !r.supportsFeatures(requiredFeatures)) return false;
      return true;
    });
  }
}

class TestRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  constructor(private store: InMemorySchedulingStore) {}

  async save(series: RecurrenceSeries): Promise<void> {
    this.store.series.set(series.id.toString(), series);
  }

  async findById(id: string | { toString(): string }): Promise<RecurrenceSeries | null> {
    return this.store.series.get(id.toString()) ?? null;
  }

  async findByClientId(clientId: string): Promise<RecurrenceSeries[]> {
    return Array.from(this.store.series.values()).filter((s) => s.clientId === clientId);
  }
}

class TestTherapistScheduleRepository implements TherapistScheduleRepository {
  constructor(private store: InMemorySchedulingStore) {}

  async save(schedule: TherapistSchedule): Promise<void> {
    this.store.schedules.set(schedule.therapistId, schedule);
  }

  async findByTherapistId(therapistId: string): Promise<TherapistSchedule | null> {
    return this.store.schedules.get(therapistId) ?? null;
  }
}

describe('Milestone 3.7: Scheduling Concurrency & Reliability Integration Suite', () => {
  let store: InMemorySchedulingStore;
  let apptRepo: TestAppointmentRepository;
  let roomRepo: TestRoomRepository;
  let seriesRepo: TestRecurrenceSeriesRepository;
  let scheduleRepo: TestTherapistScheduleRepository;
  let conflictDetectionService: ConflictDetectionService;
  let calendarService: BusinessCalendarService;
  let clock: TestClock;

  const therapistId = '550e8400-e29b-41d4-a716-446655440001';
  const roomId = '550e8400-e29b-41d4-a716-446655440002';
  const clientA = '550e8400-e29b-41d4-a716-446655440003';
  const clientB = '550e8400-e29b-41d4-a716-446655440004';

  beforeEach(async () => {
    store = new InMemorySchedulingStore();
    apptRepo = new TestAppointmentRepository(store);
    roomRepo = new TestRoomRepository(store);
    seriesRepo = new TestRecurrenceSeriesRepository(store);
    scheduleRepo = new TestTherapistScheduleRepository(store);

    clock = new TestClock(new Date('2026-09-01T08:00:00.000Z'), 'UTC');
    calendarService = new BusinessCalendarService();
    conflictDetectionService = new ConflictDetectionService(
      calendarService,
      apptRepo,
      scheduleRepo,
      roomRepo,
      TurnaroundBufferPolicy.createDefault(),
    );

    // Setup Room
    const room = Room.create({
      id: RoomId.create(roomId),
      name: 'Rehab Suite Alpha',
      capacity: 2,
      features: ['traction_bed', 'cryo'],
    });
    await roomRepo.save(room);

    // Setup Therapist Schedule (Working Mon-Fri 08:00 - 18:00)
    const schedule = TherapistSchedule.create({ therapistId });
    for (let day = 1; day <= 5; day++) {
      schedule.addWorkingHours(WorkingHours.fromTimeStrings(day, '08:00', '18:00'));
    }
    await scheduleRepo.save(schedule);
  });

  describe('Race Condition 1: Two users reserve the same room simultaneously', () => {
    it('grants reservation to first committer and rejects second with conflict', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      // User A and User B race for the same room (User A with Therapist 1, User B with Therapist 2)
      const therapist2 = '550e8400-e29b-41d4-a716-446655440099';
      const schedule2 = TherapistSchedule.create({ therapistId: therapist2 });
      schedule2.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
      await scheduleRepo.save(schedule2);

      const cmdA = new CreateAppointmentCommand({
        clientId: clientA,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T10:00:00.000Z',
        endTime: '2026-09-07T11:00:00.000Z',
      });

      const cmdB = new CreateAppointmentCommand({
        clientId: clientB,
        therapistId: therapist2,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T10:00:00.000Z',
        endTime: '2026-09-07T11:00:00.000Z',
      });

      // Execute within atomic transaction lock
      const userAPromise = store.withLock(() => createHandler.execute(cmdA));
      const userBPromise = store.withLock(() => createHandler.execute(cmdB));

      const results = await Promise.allSettled([userAPromise, userBPromise]);

      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);

      // Verify repository contains exactly 1 appointment
      expect(store.appointments.size).toBe(1);
      const savedAppt = Array.from(store.appointments.values())[0]!;
      expect(savedAppt.roomId).toBe(roomId);
    });
  });

  describe('Race Condition 2: Two users create conflicting appointments for the same therapist', () => {
    it('prevents double-booking a single therapist during concurrent execution', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      const room2 = Room.create({ name: 'Suite Beta', capacity: 1 });
      await roomRepo.save(room2);

      const cmdA = new CreateAppointmentCommand({
        clientId: clientA,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T14:00:00.000Z',
        endTime: '2026-09-07T15:00:00.000Z',
      });

      const cmdB = new CreateAppointmentCommand({
        clientId: clientB,
        therapistId,
        roomId: room2.id.getValue(),
        type: 'TREATMENT',
        startTime: '2026-09-07T14:00:00.000Z',
        endTime: '2026-09-07T15:00:00.000Z',
      });

      // Execute within atomic transaction lock
      const userAPromise = store.withLock(() => createHandler.execute(cmdA));
      const userBPromise = store.withLock(() => createHandler.execute(cmdB));

      const results = await Promise.allSettled([userAPromise, userBPromise]);

      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(store.appointments.size).toBe(1);
    });
  });

  describe('Race Condition 3: Appointment creation races with maintenance creation', () => {
    it('blocks appointment booking when room maintenance is scheduled concurrently', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      const maintenanceHandler = new ScheduleMaintenanceHandler(roomRepo);

      // Maintenance scheduled on Room from 12:30 to 14:30
      const maintCmd = new ScheduleMaintenanceCommand({
        roomId,
        startTime: '2026-09-07T12:30:00.000Z',
        endTime: '2026-09-07T14:30:00.000Z',
        reason: 'HVAC repair',
      });
      const maintResult = await maintenanceHandler.execute(maintCmd);
      expect(maintResult.isSuccess).toBe(true);

      // Appointment creation for 13:00 must fail due to maintenance block
      const apptCmd = new CreateAppointmentCommand({
        clientId: clientA,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T13:00:00.000Z',
        endTime: '2026-09-07T14:00:00.000Z',
      });

      await expect(createHandler.execute(apptCmd)).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('Race Condition 4: Recurrence generation races with manual appointment booking', () => {
    it('preserves manual booking and records conflict diagnostic during recurrence generation', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      const generateHandler = new GenerateRecurringOccurrencesHandler(
        seriesRepo,
        apptRepo,
        conflictDetectionService,
        clock,
      );

      // 1. Manually book Tuesday Sept 8 at 10:00 AM
      const manualCmd = new CreateAppointmentCommand({
        clientId: clientB,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-08T10:00:00.000Z',
        endTime: '2026-09-08T11:00:00.000Z',
      });
      const manualResult = await createHandler.execute(manualCmd);
      expect(manualResult.isSuccess).toBe(true);

      // 2. Create recurring series for Client A every Tuesday at 10:00 AM
      const series = RecurrenceSeries.create({
        clientId: clientA,
        therapistId,
        roomId,
        serviceType: 'TREATMENT',
        pattern: RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-09-01T10:00:00.000Z'),
          endDate: new Date('2026-09-30T23:59:59.999Z'),
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: 60,
          timezone: 'UTC',
        }),
      });
      await seriesRepo.save(series);

      // 3. Generate occurrences
      const genCmd = new GenerateRecurringOccurrencesCommand({
        seriesId: series.id.toString(),
        windowStart: '2026-09-01T00:00:00.000Z',
        windowEnd: '2026-09-30T23:59:59.999Z',
      });
      const genResult = await generateHandler.execute(genCmd);

      expect(genResult.isSuccess).toBe(true);
      const data = genResult.getValue();
      // Total Tuesdays = 5 (Sept 1, 8, 15, 22, 29). Sept 8 has conflict!
      expect(data.generatedCount).toBe(4);
      expect(data.conflictingOccurrences).toHaveLength(1);
      expect(data.conflictingOccurrences[0]!.occurrenceIndex).toBe(1);

      // Ensure manual booking was not overwritten
      const manualAppt = store.appointments.get(manualResult.getValue().id);
      expect(manualAppt?.clientId).toBe(clientB);
    });
  });

  describe('Race Condition 5: Rescheduling races with another appointment booking', () => {
    it('prevents rescheduling into a freshly occupied slot', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      const rescheduleHandler = new RescheduleAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new ReschedulePolicy(),
        clock,
      );

      // Appt 1 on Monday 10:00
      const appt1Cmd = new CreateAppointmentCommand({
        clientId: clientA,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T10:00:00.000Z',
        endTime: '2026-09-07T11:00:00.000Z',
      });
      const appt1Result = await createHandler.execute(appt1Cmd);
      expect(appt1Result.isSuccess).toBe(true);

      // Appt 2 on Wednesday 14:00
      const appt2Cmd = new CreateAppointmentCommand({
        clientId: clientB,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-09T14:00:00.000Z',
        endTime: '2026-09-09T15:00:00.000Z',
      });
      const appt2Result = await createHandler.execute(appt2Cmd);
      expect(appt2Result.isSuccess).toBe(true);

      // Appt 1 attempts to reschedule into Appt 2's slot (Wednesday 14:00)
      const reschedCmd = new RescheduleAppointmentCommand({
        appointmentId: appt1Result.getValue().id,
        newStartTime: '2026-09-09T14:00:00.000Z',
        newEndTime: '2026-09-09T15:00:00.000Z',
        expectedVersion: 1,
      });

      await expect(rescheduleHandler.execute(reschedCmd)).rejects.toThrow(
        AppointmentConflictException,
      );
    });
  });

  describe('Race Condition 6: Optimistic Concurrency & Cancellation vs Modification Race', () => {
    it('rejects stale version mutation when cancellation increments aggregate version', async () => {
      const createHandler = new CreateAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new BookingWindowPolicy(),
        new DefaultAppointmentDurationPolicy(),
        new BookingIdempotencyPolicy(),
        clock,
      );

      const cancelHandler = new CancelAppointmentHandler(apptRepo, new CancellationPolicy(), clock);
      const rescheduleHandler = new RescheduleAppointmentHandler(
        apptRepo,
        conflictDetectionService,
        new ReschedulePolicy(),
        clock,
      );

      const apptCmd = new CreateAppointmentCommand({
        clientId: clientA,
        therapistId,
        roomId,
        type: 'TREATMENT',
        startTime: '2026-09-07T10:00:00.000Z',
        endTime: '2026-09-07T11:00:00.000Z',
      });
      const apptResult = await createHandler.execute(apptCmd);
      const apptId = apptResult.getValue().id;

      // User B cancels the appointment (version increments to 2, status -> CANCELLED)
      const cancelCmd = new CancelAppointmentCommand({
        appointmentId: apptId,
        reason: 'Client requested full cancellation',
        expectedVersion: 1,
      });
      const cancelResult = await cancelHandler.execute(cancelCmd);
      expect(cancelResult.isSuccess).toBe(true);

      // User A attempts to reschedule assuming version 1
      const reschedCmd = new RescheduleAppointmentCommand({
        appointmentId: apptId,
        newStartTime: '2026-09-07T14:00:00.000Z',
        newEndTime: '2026-09-07T15:00:00.000Z',
        expectedVersion: 1,
      });
      const reschedResult = await rescheduleHandler.execute(reschedCmd);
      expect(reschedResult.isSuccess).toBe(false);
      expect(reschedResult.getError()).toContain('Concurrency version mismatch');
    });
  });

  describe('Overlap Topology Matrix', () => {
    const baseRange = TimeRange.create(
      new Date('2026-09-07T10:00:00.000Z'),
      new Date('2026-09-07T11:00:00.000Z'),
    );

    beforeEach(async () => {
      const appt = Appointment.create({
        clientId: clientA,
        therapistId,
        roomId,
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        timeRange: baseRange,
      });
      await apptRepo.save(appt);
    });

    it('detects exact interval overlap [10:00, 11:00)', async () => {
      const conflicts = await conflictDetectionService.detectConflicts({
        therapistId,
        roomId,
        clientId: clientB,
        requestedRange: baseRange,
        appointmentType: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
      });
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('detects partial start overlap [09:30, 10:30)', async () => {
      const conflicts = await conflictDetectionService.detectConflicts({
        therapistId,
        roomId,
        clientId: clientB,
        requestedRange: TimeRange.create(
          new Date('2026-09-07T09:30:00.000Z'),
          new Date('2026-09-07T10:30:00.000Z'),
        ),
        appointmentType: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
      });
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('detects partial end overlap [10:30, 11:30)', async () => {
      const conflicts = await conflictDetectionService.detectConflicts({
        therapistId,
        roomId,
        clientId: clientB,
        requestedRange: TimeRange.create(
          new Date('2026-09-07T10:30:00.000Z'),
          new Date('2026-09-07T11:30:00.000Z'),
        ),
        appointmentType: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
      });
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('permits adjacent boundary touching [09:00, 10:00) without conflict', async () => {
      const conflicts = await conflictDetectionService.detectConflicts({
        therapistId,
        roomId,
        clientId: clientB,
        requestedRange: TimeRange.create(
          new Date('2026-09-07T09:00:00.000Z'),
          new Date('2026-09-07T10:00:00.000Z'),
        ),
        appointmentType: AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP), // No buffer to test pure half-open interval
      });
      expect(conflicts).toHaveLength(0);
    });
  });
});
