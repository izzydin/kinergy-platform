import { ConflictDetectionService } from './conflict-detection.service';
import { BusinessCalendarService } from './business-calendar.service';
import { TurnaroundBufferPolicy } from '../policies/turnaround-buffer.policy';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';

import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { WorkingHours } from '../therapist-schedule/value-objects/working-hours.vo';
import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentId } from '../appointment/appointment-id.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { TestClock } from '../shared/clock';
import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../repositories/appointment.repository';
import { TherapistScheduleRepository } from '../repositories/therapist-schedule.repository';
import { RoomRepository } from '../repositories/room.repository';
import { PrismaAppointmentRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-appointment.repository';
import { PrismaClient, Prisma } from '@prisma/client';
import { OptimisticLockException } from '../exceptions/optimistic-lock.exception';

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
      if (options?.clientId && a.clientId !== options.clientId) return false;
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

describe('Resource Conflict Detection Hardening & Concurrency Protection', () => {
  let calendarService: BusinessCalendarService;
  let apptRepo: InMemoryAppointmentRepository;
  let scheduleRepo: InMemoryTherapistScheduleRepository;
  let roomRepo: InMemoryRoomRepository;
  let conflictService: ConflictDetectionService;
  let clock: TestClock;

  const mondayDate = '2026-08-03';
  const therapistId = 'therapist_1';
  const roomId = 'room_1';
  const clientId = 'client_1';

  beforeEach(async () => {
    clock = new TestClock(new Date(`${mondayDate}T08:00:00.000Z`), 'UTC');
    calendarService = new BusinessCalendarService();
    apptRepo = new InMemoryAppointmentRepository();
    scheduleRepo = new InMemoryTherapistScheduleRepository();
    roomRepo = new InMemoryRoomRepository();

    conflictService = new ConflictDetectionService(
      calendarService,
      apptRepo,
      scheduleRepo,
      roomRepo,
      new TurnaroundBufferPolicy([]), // Explicitly zero buffer for pure temporal boundary tests
    );

    // Setup therapist schedule
    const schedule = TherapistSchedule.create({ therapistId });
    schedule.addWorkingHours(WorkingHours.fromTimeStrings(1, '08:00', '18:00'));
    await scheduleRepo.save(schedule);

    // Setup room
    const room = Room.create({
      id: RoomId.create(roomId),
      name: 'Therapy Suite 1',
      capacity: 1,
    });
    await roomRepo.save(room);
  });

  describe('1. Temporal Boundary & Overlap Semantics (Half-Open [start, end) Intervals)', () => {
    // Existing baseline appointment: 10:00 -> 11:00
    beforeEach(async () => {
      const existing = Appointment.create(
        {
          id: AppointmentId.create('existing_appt_1'),
          clientId: 'client_baseline',
          therapistId,
          roomId,
          type: AppointmentType.create(AppointmentTypeEnum.ASSESSMENT),
          timeRange: TimeRange.create(
            new Date(`${mondayDate}T10:00:00.000Z`),
            new Date(`${mondayDate}T11:00:00.000Z`),
          ),
        },
        clock,
      );
      await apptRepo.save(existing);
    });

    it('detects conflict for IDENTICAL interval [10:00, 11:00)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T10:00:00.000Z`),
          new Date(`${mondayDate}T11:00:00.000Z`),
        ),
      });

      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('detects conflict for PARTIAL overlap starting before: [09:30, 10:30)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T09:30:00.000Z`),
          new Date(`${mondayDate}T10:30:00.000Z`),
        ),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('detects conflict for PARTIAL overlap ending after: [10:30, 11:30)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T10:30:00.000Z`),
          new Date(`${mondayDate}T11:30:00.000Z`),
        ),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('detects conflict when candidate is CONTAINED inside existing: [10:15, 10:45)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T10:15:00.000Z`),
          new Date(`${mondayDate}T10:45:00.000Z`),
        ),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('detects conflict when candidate COMPLETELY ENCLOSES existing: [09:00, 12:00)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T09:00:00.000Z`),
          new Date(`${mondayDate}T12:00:00.000Z`),
        ),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('allows PRECEDING ADJACENT interval [09:00, 10:00) touching at 10:00 boundary', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T09:00:00.000Z`),
          new Date(`${mondayDate}T10:00:00.000Z`),
        ),
      });

      expect(conflicts).toHaveLength(0);
    });

    it('allows SUCCEEDING ADJACENT interval [11:00, 12:00) touching at 11:00 boundary', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T11:00:00.000Z`),
          new Date(`${mondayDate}T12:00:00.000Z`),
        ),
      });

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('2. Turnaround Buffer Temporal Expansion', () => {
    it('detects collision on adjacent interval [11:00, 12:00) when 15-minute turnaround buffer is enforced', async () => {
      const bufferConflictService = new ConflictDetectionService(
        calendarService,
        apptRepo,
        scheduleRepo,
        roomRepo,
        TurnaroundBufferPolicy.createDefault(), // 15 min cleanup
      );

      // Existing 10:00 - 11:00 TREATMENT (requires 15 min cleanup buffer until 11:15)
      const existing = Appointment.create(
        {
          id: AppointmentId.create('existing_treatment'),
          clientId: 'client_99',
          therapistId,
          roomId,
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date(`${mondayDate}T10:00:00.000Z`),
            new Date(`${mondayDate}T11:00:00.000Z`),
          ),
        },
        clock,
      );
      await apptRepo.save(existing);

      // Candidate 11:00 - 12:00 touches at 11:00, but buffer makes existing active until 11:15
      const conflicts = await bufferConflictService.detectConflicts({
        therapistId,
        roomId,
        clientId: 'client_test',
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T11:00:00.000Z`),
          new Date(`${mondayDate}T12:00:00.000Z`),
        ),
        appointmentType: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
      expect(conflicts.some((c) => c.conflictType === 'THERAPIST')).toBe(true);
    });
  });

  describe('3. Scheduled Maintenance Window Overlap Protection', () => {
    beforeEach(async () => {
      const room = (await roomRepo.findById(roomId))!;
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${mondayDate}T13:00:00.000Z`),
          new Date(`${mondayDate}T15:00:00.000Z`),
        ),
        reason: 'HVAC sterilization',
      });
      await roomRepo.save(room);
    });

    it('blocks appointment overlapping scheduled maintenance window [13:30, 14:30)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId,
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T13:30:00.000Z`),
          new Date(`${mondayDate}T14:30:00.000Z`),
        ),
      });

      expect(conflicts.some((c) => c.conflictType === 'ROOM')).toBe(true);
    });

    it('allows appointment immediately adjacent to maintenance window end [15:00, 16:00)', async () => {
      const conflicts = await conflictService.detectConflicts({
        therapistId,
        roomId,
        clientId,
        requestedRange: TimeRange.create(
          new Date(`${mondayDate}T15:00:00.000Z`),
          new Date(`${mondayDate}T16:00:00.000Z`),
        ),
      });

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('4. Persistence Layer Concurrency & Race Condition Guarantees', () => {
    let mockPrisma: jest.Mocked<PrismaClient>;
    let prismaRepo: PrismaAppointmentRepository;

    beforeEach(() => {
      mockPrisma = {
        appointment: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          upsert: jest.fn(),
          updateMany: jest.fn(),
        },
        appointmentNote: {
          upsert: jest.fn().mockResolvedValue({ id: 'n1' }),
        },
      } as unknown as jest.Mocked<PrismaClient>;

      prismaRepo = new PrismaAppointmentRepository(mockPrisma);
    });

    it('protects against concurrent rescheduling races via Optimistic Locking (OCC)', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_race_1'),
          clientId,
          therapistId,
          roomId,
          type: AppointmentType.create(AppointmentTypeEnum.ASSESSMENT),
          timeRange: TimeRange.create(
            new Date(`${mondayDate}T10:00:00.000Z`),
            new Date(`${mondayDate}T11:00:00.000Z`),
          ),
        },
        clock,
      );

      // Reschedule mutates version from 1 -> 2
      appt.reschedule(
        TimeRange.create(
          new Date(`${mondayDate}T14:00:00.000Z`),
          new Date(`${mondayDate}T15:00:00.000Z`),
        ),
        clock,
      );
      expect(appt.version).toBe(2);

      // When another concurrent request already committed version 2, database updateMany returns count: 0
      (mockPrisma.appointment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await expect(prismaRepo.save(appt)).rejects.toThrow(OptimisticLockException);
    });

    it('protects against recurring occurrence generation race via Unique Constraint P2002', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_rec_race'),
          clientId,
          therapistId,
          roomId,
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date(`${mondayDate}T10:00:00.000Z`),
            new Date(`${mondayDate}T11:00:00.000Z`),
          ),
          seriesId: 'series_race_100',
          occurrenceIndex: 2,
        },
        clock,
      );

      // Simulate PostgreSQL unique constraint collision P2002
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (series_id, occurrence_index)',
        {
          code: 'P2002',
          clientVersion: '5.x',
        },
      );
      (mockPrisma.appointment.upsert as jest.Mock).mockRejectedValueOnce(prismaError);

      await expect(prismaRepo.save(appt)).rejects.toThrow(
        /Database constraint violation: duplicate occurrence '2' for series 'series_race_100'/,
      );
    });
  });
});
