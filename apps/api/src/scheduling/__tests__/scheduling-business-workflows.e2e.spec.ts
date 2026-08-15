import {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  TimeRange,
  TherapistSchedule,
  WorkingHours,
  Room,
  RoomId,
  RecurrenceSeries,
  ConflictDetectionService,
  AppointmentConflictException,
  TestClock,
  BookingWindowPolicy,
  DefaultAppointmentDurationPolicy,
  BookingIdempotencyPolicy,
  TurnaroundBufferPolicy,
  ReschedulePolicy,
  CancellationPolicy,
  BusinessCalendarService,
  CreateAppointmentHandler,
  CreateAppointmentCommand,
  RescheduleAppointmentHandler,
  RescheduleAppointmentCommand,
  CancelAppointmentHandler,
  CancelAppointmentCommand,
  CreateRecurrenceSeriesHandler,
  CreateRecurrenceSeriesCommand,
  GenerateRecurringOccurrencesHandler,
  SkipRecurrenceOccurrenceHandler,
  SkipRecurrenceOccurrenceCommand,
  EditSingleOccurrenceHandler,
  EditSingleOccurrenceCommand,
  CancelRecurrenceSeriesHandler,
  CancelRecurrenceSeriesCommand,
  CreateRoomHandler,
  CreateRoomCommand,
  ScheduleMaintenanceHandler,
  ScheduleMaintenanceCommand,
  CancelMaintenanceHandler,
  CancelMaintenanceCommand,
  GetDailyAgendaHandler,
  GetDailyAgendaQuery,
  GetRoomCalendarHandler,
  GetRoomCalendarQuery,
  AppointmentRepository,
  RoomRepository,
  RecurrenceSeriesRepository,
  TherapistScheduleRepository,
  FindAppointmentsOptions,
} from '@kinergy-platform/core';

// In-Memory Repository with state tracking
class InMemorySchedulingStore {
  public appointments = new Map<string, Appointment>();
  public rooms = new Map<string, Room>();
  public series = new Map<string, RecurrenceSeries>();
  public schedules = new Map<string, TherapistSchedule>();
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

describe('End-to-End Scheduling Business Workflow Architecture Suite', () => {
  let store: InMemorySchedulingStore;
  let apptRepo: TestAppointmentRepository;
  let roomRepo: TestRoomRepository;
  let seriesRepo: TestRecurrenceSeriesRepository;
  let scheduleRepo: TestTherapistScheduleRepository;
  let conflictDetectionService: ConflictDetectionService;
  let calendarService: BusinessCalendarService;
  let clock: TestClock;

  // Handlers
  let createAppointmentHandler: CreateAppointmentHandler;
  let rescheduleAppointmentHandler: RescheduleAppointmentHandler;
  let cancelAppointmentHandler: CancelAppointmentHandler;
  let createSeriesHandler: CreateRecurrenceSeriesHandler;
  let generateOccurrencesHandler: GenerateRecurringOccurrencesHandler;
  let skipOccurrenceHandler: SkipRecurrenceOccurrenceHandler;
  let editSingleHandler: EditSingleOccurrenceHandler;
  let cancelSeriesHandler: CancelRecurrenceSeriesHandler;
  let createRoomHandler: CreateRoomHandler;
  let scheduleMaintenanceHandler: ScheduleMaintenanceHandler;
  let cancelMaintenanceHandler: CancelMaintenanceHandler;
  let dailyAgendaHandler: GetDailyAgendaHandler;
  let roomCalendarHandler: GetRoomCalendarHandler;

  const therapist1 = '550e8400-e29b-41d4-a716-446655440001';
  const therapist2 = '550e8400-e29b-41d4-a716-446655440002';
  const room1 = '550e8400-e29b-41d4-a716-446655440010';
  const room2 = '550e8400-e29b-41d4-a716-446655440020';
  const client1 = '550e8400-e29b-41d4-a716-446655440030';
  const client2 = '550e8400-e29b-41d4-a716-446655440040';

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

    // Initialize Handlers
    createAppointmentHandler = new CreateAppointmentHandler(
      apptRepo,
      conflictDetectionService,
      new BookingWindowPolicy(),
      new DefaultAppointmentDurationPolicy(),
      new BookingIdempotencyPolicy(),
      clock,
    );
    rescheduleAppointmentHandler = new RescheduleAppointmentHandler(
      apptRepo,
      conflictDetectionService,
      new ReschedulePolicy(),
      clock,
    );
    cancelAppointmentHandler = new CancelAppointmentHandler(
      apptRepo,
      new CancellationPolicy(),
      clock,
    );
    generateOccurrencesHandler = new GenerateRecurringOccurrencesHandler(
      seriesRepo,
      apptRepo,
      conflictDetectionService,
      clock,
    );
    createSeriesHandler = new CreateRecurrenceSeriesHandler(seriesRepo, generateOccurrencesHandler);
    skipOccurrenceHandler = new SkipRecurrenceOccurrenceHandler(seriesRepo, apptRepo);
    editSingleHandler = new EditSingleOccurrenceHandler(
      apptRepo,
      seriesRepo,
      conflictDetectionService,
    );
    cancelSeriesHandler = new CancelRecurrenceSeriesHandler(seriesRepo, apptRepo);
    createRoomHandler = new CreateRoomHandler(roomRepo);
    scheduleMaintenanceHandler = new ScheduleMaintenanceHandler(roomRepo);
    cancelMaintenanceHandler = new CancelMaintenanceHandler(roomRepo);
    dailyAgendaHandler = new GetDailyAgendaHandler(undefined, apptRepo, clock);
    roomCalendarHandler = new GetRoomCalendarHandler(undefined, apptRepo, roomRepo, clock);

    // Setup Baseline Rooms
    await createRoomHandler.execute(
      new CreateRoomCommand({
        name: 'Kinetic Suite 1',
        capacity: 2,
        features: ['ultrasound', 'traction'],
      }),
    );
    // Persist known Room 1 and Room 2
    const r1 = Room.create({
      id: RoomId.create(room1),
      name: 'Kinetic Suite 1',
      capacity: 2,
      features: ['ultrasound', 'traction'],
    });
    const r2 = Room.create({
      id: RoomId.create(room2),
      name: 'Hydrotherapy Suite 2',
      capacity: 1,
      features: ['hydro_tank'],
    });
    await roomRepo.save(r1);
    await roomRepo.save(r2);

    // Setup Therapist Schedules (Mon-Fri 08:00 - 18:00)
    for (const tId of [therapist1, therapist2]) {
      const schedule = TherapistSchedule.create({ therapistId: tId });
      for (let day = 1; day <= 5; day++) {
        schedule.addWorkingHours(WorkingHours.fromTimeStrings(day, '08:00', '18:00'));
      }
      await scheduleRepo.save(schedule);
    }
  });

  describe('Workflow 1: Appointment Lifecycle End-to-End', () => {
    it('executes: Create -> Confirm -> CheckIn -> InProgress -> Complete', async () => {
      // 1. Create Appointment
      const createRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          type: 'TREATMENT',
          startTime: '2026-09-07T10:00:00.000Z',
          endTime: '2026-09-07T11:00:00.000Z',
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const apptId = createRes.getValue().id;
      expect(createRes.getValue().status).toBe('SCHEDULED');

      // 2. Confirm Lifecycle Transition
      const appt = (await apptRepo.findById(apptId))!;
      appt.confirm(clock);
      await apptRepo.save(appt);
      expect(appt.status).toBe(AppointmentStatus.CONFIRMED);

      // 3. Check-In Transition
      appt.checkIn(clock);
      await apptRepo.save(appt);
      expect(appt.status).toBe(AppointmentStatus.CHECKED_IN);

      // 4. Start / InProgress Transition
      appt.start(clock);
      await apptRepo.save(appt);
      expect(appt.status).toBe(AppointmentStatus.IN_PROGRESS);

      // 5. Complete Transition
      appt.complete(clock);
      await apptRepo.save(appt);
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);

      // 6. Verify Invalid Transitions Rejected from COMPLETED
      expect(() => appt.cancel('Cannot cancel completed', clock)).toThrow();
      expect(() => appt.checkIn(clock)).toThrow();
    });

    it('executes: Create -> Cancel workflow', async () => {
      const createRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          type: 'TREATMENT',
          startTime: '2026-09-07T14:00:00.000Z',
          endTime: '2026-09-07T15:00:00.000Z',
        }),
      );
      const apptId = createRes.getValue().id;

      const cancelRes = await cancelAppointmentHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: apptId,
          reason: 'Client schedule change',
          expectedVersion: 1,
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);
      expect(cancelRes.getValue().status).toBe('CANCELLED');
    });

    it('executes: Create -> Reschedule -> Complete workflow', async () => {
      const createRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          type: 'TREATMENT',
          startTime: '2026-09-07T09:00:00.000Z',
          endTime: '2026-09-07T10:00:00.000Z',
        }),
      );
      const apptId = createRes.getValue().id;

      const reschedRes = await rescheduleAppointmentHandler.execute(
        new RescheduleAppointmentCommand({
          appointmentId: apptId,
          newStartTime: '2026-09-07T15:00:00.000Z',
          newEndTime: '2026-09-07T16:00:00.000Z',
          expectedVersion: 1,
        }),
      );
      expect(reschedRes.isSuccess).toBe(true);
      expect(reschedRes.getValue().version).toBe(2);

      const appt = (await apptRepo.findById(apptId))!;
      appt.confirm(clock);
      appt.checkIn(clock);
      appt.start(clock);
      appt.complete(clock);
      await apptRepo.save(appt);
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
    });
  });

  describe('Workflow 2: Calendar Queries & Chronological Consistency', () => {
    beforeEach(async () => {
      // Seed 3 sequential appointments on Monday Sept 7, 2026
      await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          type: 'FOLLOW_UP',
          startTime: '2026-09-07T09:00:00.000Z',
          endTime: '2026-09-07T10:00:00.000Z',
        }),
      );
      await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client2,
          therapistId: therapist1,
          roomId: room1,
          type: 'FOLLOW_UP',
          startTime: '2026-09-07T11:00:00.000Z',
          endTime: '2026-09-07T12:00:00.000Z',
        }),
      );
      await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist2,
          roomId: room2,
          type: 'FOLLOW_UP',
          startTime: '2026-09-07T14:00:00.000Z',
          endTime: '2026-09-07T15:00:00.000Z',
        }),
      );
    });

    it('queries daily agenda for therapist and returns chronological sequence', async () => {
      const agendaRes = await dailyAgendaHandler.execute(
        new GetDailyAgendaQuery({
          therapistId: therapist1,
          date: '2026-09-07',
          timezone: 'UTC',
        }),
      );
      expect(agendaRes.isSuccess).toBe(true);
      const agenda = agendaRes.getValue();
      expect(agenda.slots.length).toBe(2);
      expect(new Date(agenda.slots[0]!.startTime).getTime()).toBeLessThan(
        new Date(agenda.slots[1]!.startTime).getTime(),
      );
    });

    it('queries room calendar for room and retrieves allocated slots', async () => {
      const calRes = await roomCalendarHandler.execute(
        new GetRoomCalendarQuery({
          roomId: room1,
          startTime: '2026-09-07T00:00:00.000Z',
          endTime: '2026-09-07T23:59:59.999Z',
        }),
      );
      expect(calRes.isSuccess).toBe(true);
      expect(calRes.getValue().appointments.length).toBe(2);
    });
  });

  describe('Workflow 3: Room Reservations, Conflicts, and Release on Cancel', () => {
    it('reserves room -> detects collision -> cancels original -> room becomes available', async () => {
      // 1. Client 1 reserves Room 1 for 10:00 - 11:00
      const appt1Res = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          type: 'TREATMENT',
          startTime: '2026-09-07T10:00:00.000Z',
          endTime: '2026-09-07T11:00:00.000Z',
        }),
      );
      expect(appt1Res.isSuccess).toBe(true);

      // 2. Client 2 attempts to book Room 1 at the same time with Therapist 2
      const appt2Cmd = new CreateAppointmentCommand({
        clientId: client2,
        therapistId: therapist2,
        roomId: room1,
        type: 'TREATMENT',
        startTime: '2026-09-07T10:00:00.000Z',
        endTime: '2026-09-07T11:00:00.000Z',
      });
      await expect(createAppointmentHandler.execute(appt2Cmd)).rejects.toThrow(
        AppointmentConflictException,
      );

      // 3. Cancel Appointment 1
      const cancelRes = await cancelAppointmentHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: appt1Res.getValue().id,
          reason: 'Client reschedule requested',
          expectedVersion: 1,
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);

      // 4. Client 2 now books the previously blocked slot successfully
      const appt2SuccessRes = await createAppointmentHandler.execute(appt2Cmd);
      expect(appt2SuccessRes.isSuccess).toBe(true);
      expect(appt2SuccessRes.getValue().roomId).toBe(room1);
    });
  });

  describe('Workflow 4: Room Maintenance Lifecycle & Booking Interception', () => {
    it('schedules maintenance -> rejects appointment -> cancels maintenance -> permits appointment', async () => {
      // 1. Schedule Room 2 Maintenance from 13:00 to 17:00
      const maintRes = await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId: room2,
          startTime: '2026-09-07T13:00:00.000Z',
          endTime: '2026-09-07T17:00:00.000Z',
          reason: 'Tub calibration and sanitation',
        }),
      );
      expect(maintRes.isSuccess).toBe(true);
      const maintId = maintRes.getValue().maintenanceWindows[0]!.id;

      // 2. Attempt appointment inside maintenance window
      const apptCmd = new CreateAppointmentCommand({
        clientId: client1,
        therapistId: therapist2,
        roomId: room2,
        type: 'TREATMENT',
        startTime: '2026-09-07T14:00:00.000Z',
        endTime: '2026-09-07T15:00:00.000Z',
      });
      await expect(createAppointmentHandler.execute(apptCmd)).rejects.toThrow(
        AppointmentConflictException,
      );

      // 3. Cancel Maintenance Window
      const cancelMaintRes = await cancelMaintenanceHandler.execute(
        new CancelMaintenanceCommand({
          roomId: room2,
          maintenanceWindowId: maintId,
        }),
      );
      expect(cancelMaintRes.isSuccess).toBe(true);

      // 4. Now booking succeeds
      const apptSuccessRes = await createAppointmentHandler.execute(apptCmd);
      expect(apptSuccessRes.isSuccess).toBe(true);
    });
  });

  describe('Workflow 5: Recurring Appointments Complete End-to-End Pipeline', () => {
    it('creates series -> generates occurrences -> skips index -> edits single -> cancels series', async () => {
      // 1. Create Weekly Series (4 weeks in September)
      const seriesRes = await createSeriesHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: client1,
          therapistId: therapist1,
          roomId: room1,
          serviceType: 'TREATMENT',
          frequency: 'WEEKLY',
          startDate: '2026-09-01T10:00:00.000Z',
          endDate: '2026-09-28T23:59:59.999Z',
          localStartTime: { hour: 10, minute: 0 },
          durationMinutes: 60,
          timezone: 'UTC',
        }),
      );
      expect(seriesRes.isSuccess).toBe(true);
      const seriesId = seriesRes.getValue().series.id;
      // Tuesdays: Sept 1 (idx 0), Sept 8 (idx 1), Sept 15 (idx 2), Sept 22 (idx 3)
      expect(seriesRes.getValue().initialGeneration.generatedCount).toBe(4);

      // 2. Skip Occurrence index 1 (Sept 8)
      const skipRes = await skipOccurrenceHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId,
          occurrenceIndex: 1,
          reason: 'Therapist attending conference',
        }),
      );
      expect(skipRes.isSuccess).toBe(true);

      // 3. Edit Single Occurrence index 2 (Sept 15) -> Change time to 14:00
      const occurrences = await apptRepo.findBySeriesId(seriesId);
      const sept15Appt = occurrences.find((a) => a.occurrenceIndex === 2)!;
      const editSingleRes = await editSingleHandler.execute(
        new EditSingleOccurrenceCommand({
          appointmentId: sept15Appt.id.toString(),
          startTime: '2026-09-15T14:00:00.000Z',
          endTime: '2026-09-15T15:00:00.000Z',
          reason: 'Client requested afternoon slot',
        }),
      );
      expect(editSingleRes.isSuccess).toBe(true);
      expect(editSingleRes.getValue().isDetachedFromSeries).toBe(true);

      // 4. Cancel entire series
      const cancelSeriesRes = await cancelSeriesHandler.execute(
        new CancelRecurrenceSeriesCommand({
          seriesId,
          reason: 'Client treatment plan completed early',
        }),
      );
      expect(cancelSeriesRes.isSuccess).toBe(true);

      // 5. Verify detached customized appointment (Sept 15) was preserved
      const preservedAppt = await apptRepo.findById(sept15Appt.id);
      expect(preservedAppt?.status).not.toBe(AppointmentStatus.CANCELLED);
    });
  });
});
