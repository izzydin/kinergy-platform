import {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  TimeRange,
  Room,
  RoomId,
  RecurrenceSeries,
  RecurrenceSeriesId,
  RecurrencePattern,
  RecurrenceFrequency,
  AppointmentRepository,
  FindAppointmentsOptions,
  RoomRepository,
  RecurrenceSeriesRepository,
  ConflictDetectionService,
  BusinessCalendarService,
  TherapistScheduleRepository,
  TherapistSchedule,
  WorkingHours,
  CreateAppointmentCommand,
  CreateAppointmentHandler,
  RescheduleAppointmentCommand,
  RescheduleAppointmentHandler,
  CancelAppointmentCommand,
  CancelAppointmentHandler,
  CreateRoomCommand,
  CreateRoomHandler,
  EditRoomCommand,
  EditRoomHandler,
  ActivateRoomCommand,
  ActivateRoomHandler,
  DeactivateRoomCommand,
  DeactivateRoomHandler,
  ScheduleMaintenanceCommand,
  ScheduleMaintenanceHandler,
  CancelMaintenanceCommand,
  CancelMaintenanceHandler,
  CheckRoomAvailabilityQuery,
  CheckRoomAvailabilityHandler,
  GenerateRecurringOccurrencesCommand,
  GenerateRecurringOccurrencesHandler,
  BookingWindowPolicy,
  DefaultAppointmentDurationPolicy,
  BookingIdempotencyPolicy,
  ReschedulePolicy,
  CancellationPolicy,
  Duration,
  TestClock,
  OptimisticLockException,
  AppointmentConflictException,
} from '../../../index';

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

  public async findBySeriesId(seriesId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.seriesId === seriesId && a.status !== AppointmentStatus.CANCELLED,
    );
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

class InMemoryRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  private series = new Map<string, RecurrenceSeries>();

  public async findById(id: RecurrenceSeriesId | string): Promise<RecurrenceSeries | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.series.get(key) ?? null;
  }

  public async findByClientId(clientId: string): Promise<RecurrenceSeries[]> {
    return Array.from(this.series.values()).filter((s) => s.clientId === clientId);
  }

  public async save(series: RecurrenceSeries): Promise<void> {
    this.series.set(series.id.toString(), series);
  }
}

class InMemoryTherapistScheduleRepository implements TherapistScheduleRepository {
  private schedules = new Map<string, TherapistSchedule>();

  public async findByTherapistId(therapistId: string): Promise<TherapistSchedule | null> {
    let schedule = this.schedules.get(therapistId);
    if (!schedule) {
      schedule = TherapistSchedule.create({ therapistId });
      for (let day = 0; day <= 6; day++) {
        schedule.addWorkingHours(WorkingHours.fromTimeStrings(day, '00:00', '23:59'));
      }
      this.schedules.set(therapistId, schedule);
    }
    return schedule;
  }

  public async save(schedule: TherapistSchedule): Promise<void> {
    this.schedules.set(schedule.therapistId, schedule);
  }
}

describe('Milestone 3.6: Room & Resource Scheduling QA Adversarial Hardening Suite', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let roomRepo: InMemoryRoomRepository;
  let seriesRepo: InMemoryRecurrenceSeriesRepository;
  let scheduleRepo: InMemoryTherapistScheduleRepository;
  let conflictService: ConflictDetectionService;
  let clock: TestClock;
  let createRoomHandler: CreateRoomHandler;
  let editRoomHandler: EditRoomHandler;
  let activateRoomHandler: ActivateRoomHandler;
  let deactivateRoomHandler: DeactivateRoomHandler;
  let scheduleMaintenanceHandler: ScheduleMaintenanceHandler;
  let cancelMaintenanceHandler: CancelMaintenanceHandler;
  let checkRoomAvailabilityHandler: CheckRoomAvailabilityHandler;
  let createAppointmentHandler: CreateAppointmentHandler;
  let rescheduleAppointmentHandler: RescheduleAppointmentHandler;
  let cancelAppointmentHandler: CancelAppointmentHandler;
  let generateRecurringHandler: GenerateRecurringOccurrencesHandler;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-08-15T08:00:00.000Z'));
    apptRepo = new InMemoryAppointmentRepository();
    roomRepo = new InMemoryRoomRepository();
    seriesRepo = new InMemoryRecurrenceSeriesRepository();
    scheduleRepo = new InMemoryTherapistScheduleRepository();

    const calendarService = new BusinessCalendarService();

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

    createRoomHandler = new CreateRoomHandler(roomRepo);
    editRoomHandler = new EditRoomHandler(roomRepo);
    activateRoomHandler = new ActivateRoomHandler(roomRepo);
    deactivateRoomHandler = new DeactivateRoomHandler(roomRepo);
    scheduleMaintenanceHandler = new ScheduleMaintenanceHandler(roomRepo);
    cancelMaintenanceHandler = new CancelMaintenanceHandler(roomRepo);
    checkRoomAvailabilityHandler = new CheckRoomAvailabilityHandler(roomRepo, apptRepo);

    createAppointmentHandler = new CreateAppointmentHandler(
      apptRepo,
      conflictService,
      bookingWindowPolicy,
      durationPolicy,
      idempotencyPolicy,
      clock,
    );
    rescheduleAppointmentHandler = new RescheduleAppointmentHandler(
      apptRepo,
      conflictService,
      reschedulePolicy,
      clock,
    );
    cancelAppointmentHandler = new CancelAppointmentHandler(apptRepo, cancellationPolicy, clock);
    generateRecurringHandler = new GenerateRecurringOccurrencesHandler(
      seriesRepo,
      apptRepo,
      conflictService,
      clock,
    );
  });

  describe('1. Functional Lifecycle & Capacity Verification', () => {
    it('creates, edits, deactivates, activates, and schedules maintenance on a room aggregate seamlessly', async () => {
      // 1. Create Room
      const createRes = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'Hydro Suite 1',
          capacity: 2,
          features: ['hydrotherapy_tub', 'soundproof'],
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const roomId = createRes.getValue().id;

      // 2. Edit Room
      const editRes = await editRoomHandler.execute(
        new EditRoomCommand({
          roomId,
          name: 'Hydro Suite 1 - Deluxe',
          capacity: 3,
          features: ['hydrotherapy_tub', 'soundproof', 'chromotherapy'],
          expectedVersion: 1,
        }),
      );
      expect(editRes.isSuccess).toBe(true);
      expect(editRes.getValue().name).toBe('Hydro Suite 1 - Deluxe');
      expect(editRes.getValue().capacity).toBe(3);
      expect(editRes.getValue().version).toBe(2);

      // 3. Deactivate Room
      const deactRes = await deactivateRoomHandler.execute(
        new DeactivateRoomCommand({
          roomId,
          reason: 'Facility deep clean',
          expectedVersion: 2,
        }),
      );
      expect(deactRes.isSuccess).toBe(true);
      expect(deactRes.getValue().status).toBe('UNAVAILABLE');
      expect(deactRes.getValue().maintenanceReason).toBe('Facility deep clean');
      expect(deactRes.getValue().version).toBe(3);

      // 4. Activate Room
      const actRes = await activateRoomHandler.execute(
        new ActivateRoomCommand({
          roomId,
          expectedVersion: 3,
        }),
      );
      expect(actRes.isSuccess).toBe(true);
      expect(actRes.getValue().status).toBe('AVAILABLE');
      expect(actRes.getValue().maintenanceReason).toBeUndefined();
      expect(actRes.getValue().version).toBe(4);

      // 5. Schedule & Cancel Maintenance
      const maintRes = await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId,
          startTime: '2026-09-01T12:00:00.000Z',
          endTime: '2026-09-01T14:00:00.000Z',
          reason: 'Filter replacement',
          expectedVersion: 4,
        }),
      );
      expect(maintRes.isSuccess).toBe(true);
      const maintList = maintRes.getValue().maintenanceWindows;
      expect(maintList).toBeDefined();
      expect(maintList.length).toBeGreaterThan(0);
      const maintId = maintList[0]!.id;

      const cancelMaintRes = await cancelMaintenanceHandler.execute(
        new CancelMaintenanceCommand({
          roomId,
          maintenanceWindowId: maintId,
        }),
      );
      expect(cancelMaintRes.isSuccess).toBe(true);
      expect(cancelMaintRes.getValue().maintenanceWindows).toHaveLength(0);
    });

    it('rejects invalid room creation arguments with domain validation failures', async () => {
      const invalidNameRes = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: '   ',
          capacity: 1,
        }),
      );
      expect(invalidNameRes.isSuccess).toBe(false);
      expect(invalidNameRes.getError()).toContain('empty');

      const invalidCapacityRes = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'Suite',
          capacity: 0,
        }),
      );
      expect(invalidCapacityRes.isSuccess).toBe(false);
      expect(invalidCapacityRes.getError()).toContain('positive integer');
    });
  });

  describe('2. Exhaustive Conflict Topology Coverage', () => {
    let roomId: string;
    const therapistId = '550e8400-e29b-41d4-a716-446655440001';
    const clientId1 = '550e8400-e29b-41d4-a716-446655440002';
    const clientId2 = '550e8400-e29b-41d4-a716-446655440003';

    beforeEach(async () => {
      const res = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'Treatment Room A',
          capacity: 1,
          features: ['massage_table'],
        }),
      );
      roomId = res.getValue().id;

      // Base appointment: 10:00 -> 11:00 UTC
      await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: clientId1,
          therapistId,
          roomId,
          type: 'TREATMENT',
          startTime: '2026-09-01T10:00:00.000Z',
          endTime: '2026-09-01T11:00:00.000Z',
        }),
      );
    });

    it('Exact Overlap: Rejects duplicate booking in same room at identical [10:00, 11:00)', async () => {
      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099', // different therapist
            roomId, // same room!
            type: 'TREATMENT',
            startTime: '2026-09-01T10:00:00.000Z',
            endTime: '2026-09-01T11:00:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Partial Start Overlap: Rejects booking starting before and overlapping [09:30, 10:30)', async () => {
      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-01T09:30:00.000Z',
            endTime: '2026-09-01T10:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Partial End Overlap: Rejects booking starting inside and overlapping [10:30, 11:30)', async () => {
      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-01T10:30:00.000Z',
            endTime: '2026-09-01T11:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Contained Overlap: Rejects enclosing booking [09:00, 12:00)', async () => {
      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-01T09:00:00.000Z',
            endTime: '2026-09-01T12:00:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Adjacent Boundary Appointments: Allows seamless back-to-back bookings [09:00, 10:00) and [11:00, 12:00)', async () => {
      // Preceding adjacent (FOLLOW_UP has 0 turnaround buffer)
      const preRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: clientId2,
          therapistId: '550e8400-e29b-41d4-a716-446655440099',
          roomId,
          type: 'FOLLOW_UP',
          startTime: '2026-09-01T09:00:00.000Z',
          endTime: '2026-09-01T10:00:00.000Z', // Ends exactly at 10:00:00
        }),
      );
      expect(preRes.isSuccess).toBe(true);

      // Succeeding adjacent (11:00 - 12:00 when base appointment with 15min cleanup buffer ended at 11:00, so booking at 11:15 is valid, or FOLLOW_UP base at 11:00)
      const postRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440088',
          therapistId: '550e8400-e29b-41d4-a716-446655440077',
          roomId,
          type: 'FOLLOW_UP',
          startTime: '2026-09-01T11:15:00.000Z', // After 15min treatment cleanup
          endTime: '2026-09-01T12:00:00.000Z',
        }),
      );
      expect(postRes.isSuccess).toBe(true);
    });

    it('Maintenance Overlap: Rejects booking during scheduled maintenance block', async () => {
      // Schedule maintenance 14:00 -> 16:00
      await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId,
          startTime: '2026-09-01T14:00:00.000Z',
          endTime: '2026-09-01T16:00:00.000Z',
          reason: 'HVAC repair',
        }),
      );

      // Attempt booking inside window: 14:30 -> 15:30
      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-01T14:30:00.000Z',
            endTime: '2026-09-01T15:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Inactive / Deactivated Room: Rejects booking attempts on inactive room', async () => {
      await deactivateRoomHandler.execute(
        new DeactivateRoomCommand({
          roomId,
          reason: 'Emergency closure',
        }),
      );

      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: clientId2,
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-02T10:00:00.000Z',
            endTime: '2026-09-02T11:00:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('3. Temporal & DST Transition Robustness', () => {
    let roomId: string;

    beforeEach(async () => {
      const res = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'DST Test Suite',
          capacity: 1,
        }),
      );
      roomId = res.getValue().id;
    });

    it('Maintenance crossing Spring Forward DST transition (March 8, 2026 America/New_York)', async () => {
      clock.setTime(new Date('2026-03-01T08:00:00.000Z'));

      const maintRes = await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId,
          startTime: '2026-03-08T06:00:00.000Z',
          endTime: '2026-03-08T08:00:00.000Z',
          reason: 'DST Clock sync maintenance',
        }),
      );
      expect(maintRes.isSuccess).toBe(true);

      const availRes = await checkRoomAvailabilityHandler.execute(
        new CheckRoomAvailabilityQuery({
          roomId,
          startTime: '2026-03-08T06:30:00.000Z',
          endTime: '2026-03-08T07:30:00.000Z',
        }),
      );

      expect(availRes.isSuccess).toBe(true);
      expect(availRes.getValue().isAvailable).toBe(false);
      expect(availRes.getValue().conflicts.some((c: string) => c.includes('maintenance'))).toBe(
        true,
      );
    });

    it('Appointment crossing Fall Back DST transition (November 1, 2026 America/New_York)', async () => {
      clock.setTime(new Date('2026-10-25T08:00:00.000Z'));

      const apptRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440002',
          therapistId: '550e8400-e29b-41d4-a716-446655440001',
          roomId,
          type: 'TREATMENT',
          startTime: '2026-11-01T05:00:00.000Z',
          endTime: '2026-11-01T07:00:00.000Z',
        }),
      );
      expect(apptRes.isSuccess).toBe(true);

      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: '550e8400-e29b-41d4-a716-446655440003',
            therapistId: '550e8400-e29b-41d4-a716-446655440099',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-11-01T06:00:00.000Z',
            endTime: '2026-11-01T06:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });
  });

  describe('4. Concurrency & Race Condition Simulation', () => {
    let roomId: string;

    beforeEach(async () => {
      clock.setTime(new Date('2026-08-25T08:00:00.000Z'));
      const res = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'Concurrent Room 1',
          capacity: 1,
        }),
      );
      roomId = res.getValue().id;
    });

    it('Simultaneous Reservations: First reservation claims room, second concurrent attempt fails', async () => {
      const res1 = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440001',
          therapistId: '550e8400-e29b-41d4-a716-446655440010',
          roomId,
          type: 'TREATMENT',
          startTime: '2026-09-01T15:00:00.000Z',
          endTime: '2026-09-01T16:00:00.000Z',
        }),
      );
      expect(res1.isSuccess).toBe(true);

      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: '550e8400-e29b-41d4-a716-446655440002',
            therapistId: '550e8400-e29b-41d4-a716-446655440020',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-01T15:30:00.000Z',
            endTime: '2026-09-01T16:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Reservation vs Maintenance Race: When maintenance is created concurrently, booking fails', async () => {
      await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId,
          startTime: '2026-09-05T10:00:00.000Z',
          endTime: '2026-09-05T12:00:00.000Z',
          reason: 'Emergency pipeline fix',
        }),
      );

      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: '550e8400-e29b-41d4-a716-446655440001',
            therapistId: '550e8400-e29b-41d4-a716-446655440010',
            roomId,
            type: 'TREATMENT',
            startTime: '2026-09-05T10:30:00.000Z',
            endTime: '2026-09-05T11:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Optimistic Concurrency Control: Rejects stale version room edits', async () => {
      await expect(
        editRoomHandler.execute(
          new EditRoomCommand({
            roomId,
            name: 'Stale Edit',
            expectedVersion: 99,
          }),
        ),
      ).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('5. Recurring Generation Coordination with Resources', () => {
    let roomId: string;

    beforeEach(async () => {
      clock.setTime(new Date('2026-08-25T08:00:00.000Z'));
      const res = await createRoomHandler.execute(
        new CreateRoomCommand({
          name: 'Series Room 1',
          capacity: 1,
        }),
      );
      roomId = res.getValue().id;
    });

    it('Recurring Occurrence Generation gracefully skips or marks conflicted occurrences when Room has maintenance', async () => {
      await scheduleMaintenanceHandler.execute(
        new ScheduleMaintenanceCommand({
          roomId,
          startTime: '2026-09-08T09:00:00.000Z',
          endTime: '2026-09-08T11:00:00.000Z',
          reason: 'Weekly sanitation',
        }),
      );

      const series = RecurrenceSeries.create({
        clientId: '550e8400-e29b-41d4-a716-446655440001',
        therapistId: '550e8400-e29b-41d4-a716-446655440002',
        roomId,
        serviceType: 'TREATMENT',
        pattern: RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-09-01T09:30:00.000Z'),
          localStartTime: { hour: 9, minute: 30 },
          durationMinutes: 60,
          timezone: 'UTC',
        }),
      });

      await seriesRepo.save(series);

      const genResult = await generateRecurringHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(genResult.isSuccess).toBe(true);
      const metrics = genResult.getValue();

      expect(metrics.generatedCount).toBe(4);
      expect(metrics.conflictingOccurrences).toHaveLength(1);
      expect(metrics.conflictingOccurrences[0]!.occurrenceIndex).toBe(1);
      expect(metrics.conflictingOccurrences[0]!.conflicts[0]!.message).toContain('maintenance');
    });
  });

  describe('6. Regression Verification: Core Appointment Invariants', () => {
    beforeEach(() => {
      clock.setTime(new Date('2026-09-01T08:00:00.000Z'));
    });

    it('Therapist conflict detection operates independently and rejects therapist overlap even with different rooms', async () => {
      const therapistId = '550e8400-e29b-41d4-a716-446655440001';

      // Create two rooms for therapist test
      const rA = await createRoomHandler.execute(
        new CreateRoomCommand({ name: 'Room Alpha Test', capacity: 1 }),
      );
      const rB = await createRoomHandler.execute(
        new CreateRoomCommand({ name: 'Room Beta Test', capacity: 1 }),
      );

      const appt1 = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440002',
          therapistId,
          roomId: rA.getValue().id,
          type: 'TREATMENT',
          startTime: '2026-09-10T10:00:00.000Z',
          endTime: '2026-09-10T11:00:00.000Z',
        }),
      );
      expect(appt1.isSuccess).toBe(true);

      await expect(
        createAppointmentHandler.execute(
          new CreateAppointmentCommand({
            clientId: '550e8400-e29b-41d4-a716-446655440003',
            therapistId,
            roomId: rB.getValue().id, // different room
            type: 'TREATMENT',
            startTime: '2026-09-10T10:30:00.000Z',
            endTime: '2026-09-10T11:30:00.000Z',
          }),
        ),
      ).rejects.toThrow(AppointmentConflictException);
    });

    it('Rescheduling an appointment releases former room slot and claims new room slot', async () => {
      const r1 = await createRoomHandler.execute(
        new CreateRoomCommand({ name: 'Room Alpha', capacity: 1 }),
      );
      const r2 = await createRoomHandler.execute(
        new CreateRoomCommand({ name: 'Room Beta', capacity: 1 }),
      );

      const roomIdA = r1.getValue().id;
      const roomIdB = r2.getValue().id;

      const booking = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440002',
          therapistId: '550e8400-e29b-41d4-a716-446655440001',
          roomId: roomIdA,
          type: 'TREATMENT',
          startTime: '2026-09-12T10:00:00.000Z',
          endTime: '2026-09-12T11:00:00.000Z',
        }),
      );
      const apptId = booking.getValue().id;

      const rescheduleRes = await rescheduleAppointmentHandler.execute(
        new RescheduleAppointmentCommand({
          appointmentId: apptId,
          newStartTime: '2026-09-12T14:00:00.000Z',
          newEndTime: '2026-09-12T15:00:00.000Z',
          newRoomId: roomIdB,
          expectedVersion: 1,
        }),
      );
      expect(rescheduleRes.isSuccess).toBe(true);

      const newBookingInAlpha = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440099',
          therapistId: '550e8400-e29b-41d4-a716-446655440088',
          roomId: roomIdA,
          type: 'TREATMENT',
          startTime: '2026-09-12T10:00:00.000Z',
          endTime: '2026-09-12T11:00:00.000Z',
        }),
      );
      expect(newBookingInAlpha.isSuccess).toBe(true);
    });

    it('Cancelling an appointment releases room reservation immediately', async () => {
      const r = await createRoomHandler.execute(
        new CreateRoomCommand({ name: 'Cancellation Room', capacity: 1 }),
      );
      const roomId = r.getValue().id;

      const booking = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440002',
          therapistId: '550e8400-e29b-41d4-a716-446655440001',
          roomId,
          type: 'TREATMENT',
          startTime: '2026-09-15T10:00:00.000Z',
          endTime: '2026-09-15T11:00:00.000Z',
        }),
      );
      const apptId = booking.getValue().id;

      const cancelRes = await cancelAppointmentHandler.execute(
        new CancelAppointmentCommand({
          appointmentId: apptId,
          expectedVersion: 1,
          reason: 'Client requested cancellation',
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);

      const rebookRes = await createAppointmentHandler.execute(
        new CreateAppointmentCommand({
          clientId: '550e8400-e29b-41d4-a716-446655440099',
          therapistId: '550e8400-e29b-41d4-a716-446655440088',
          roomId,
          type: 'TREATMENT',
          startTime: '2026-09-15T10:00:00.000Z',
          endTime: '2026-09-15T11:00:00.000Z',
        }),
      );
      expect(rebookRes.isSuccess).toBe(true);
    });
  });
});
