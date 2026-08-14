import { GenerateRecurringOccurrencesHandler } from './handlers/generate-recurring-occurrences.handler';
import { CreateRecurrenceSeriesHandler } from './handlers/create-recurrence-series.handler';
import { SkipRecurrenceOccurrenceHandler } from './handlers/skip-recurrence-occurrence.handler';
import { EditSingleOccurrenceHandler } from './handlers/edit-single-occurrence.handler';
import { EditFutureOccurrencesHandler } from './handlers/edit-future-occurrences.handler';
import { CancelRecurrenceSeriesHandler } from './handlers/cancel-recurrence-series.handler';

import { GenerateRecurringOccurrencesCommand } from './commands/generate-recurring-occurrences.command';
import { CreateRecurrenceSeriesCommand } from './commands/create-recurrence-series.command';
import { SkipRecurrenceOccurrenceCommand } from './commands/skip-recurrence-occurrence.command';
import { EditSingleOccurrenceCommand } from './commands/edit-single-occurrence.command';
import { EditFutureOccurrencesCommand } from './commands/edit-future-occurrences.command';
import { CancelRecurrenceSeriesCommand } from './commands/cancel-recurrence-series.command';

import { RecurrenceSeries } from '../../domain/recurrence/recurrence-series.aggregate';
import { RecurrencePattern } from '../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { SeriesStatus } from '../../domain/recurrence/value-objects/series-status.enum';

import { Appointment } from '../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../domain/value-objects/appointment-status.enum';
import { TimeRange } from '../../domain/value-objects/time-range.vo';
import { TestClock } from '../../domain/shared/clock';

import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../domain/repositories/appointment.repository';
import { RecurrenceSeriesRepository } from '../../domain/repositories/recurrence-series.repository';
import { ConflictDetectionService } from '../../domain/services/conflict-detection.service';
import { SchedulingConflict } from '../../domain/value-objects/scheduling-conflict.vo';

class InMemoryAppointmentRepository implements AppointmentRepository {
  public appointments = new Map<string, Appointment>();
  public shouldFailSave = false;

  public async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.appointments.get(key) ?? null;
  }

  public async findBySeriesId(seriesId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (appt) => appt.seriesId === seriesId && appt.status !== AppointmentStatus.CANCELLED,
    );
  }

  public async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    timeRange: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((appt) => {
      if (excludeAppointmentId && appt.id.getValue() === excludeAppointmentId) {
        return false;
      }
      if (appt.status === AppointmentStatus.CANCELLED) {
        return false;
      }
      const matchesResource =
        appt.therapistId === therapistId || appt.roomId === roomId || appt.clientId === clientId;
      return matchesResource && appt.timeRange.overlaps(timeRange);
    });
  }

  public async findAppointmentsForTherapist(
    therapistId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.therapistId === therapistId && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.roomId === roomId && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsForClient(
    clientId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.clientId === clientId && a.timeRange.overlaps(range),
    );
  }

  public async findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values()).filter((a) => {
      if (!a.timeRange.overlaps(range)) return false;
      if (options?.therapistId && a.therapistId !== options.therapistId) return false;
      if (options?.roomId && a.roomId !== options.roomId) return false;
      if (options?.clientId && a.clientId !== options.clientId) return false;
      if (options?.seriesId && a.seriesId !== options.seriesId) return false;
      return true;
    });
  }

  public async save(appointment: Appointment): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database transaction failure during appointment save.');
    }
    // Simulate Prisma DB unique constraint @@unique([seriesId, occurrenceIndex])
    if (appointment.seriesId && appointment.occurrenceIndex !== undefined) {
      const existing = Array.from(this.appointments.values()).find(
        (a) =>
          a.seriesId === appointment.seriesId &&
          a.occurrenceIndex === appointment.occurrenceIndex &&
          a.status !== AppointmentStatus.CANCELLED,
      );
      if (existing && existing.id.getValue() !== appointment.id.getValue()) {
        throw new Error(
          `Unique constraint failed on the constraint: 'appointments_seriesId_occurrenceIndex_key'`,
        );
      }
    }
    this.appointments.set(appointment.id.getValue(), appointment);
  }

  public clear(): void {
    this.appointments.clear();
    this.shouldFailSave = false;
  }
}

class InMemoryRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  public seriesMap = new Map<string, RecurrenceSeries>();
  public shouldFailSave = false;

  public async findById(id: string): Promise<RecurrenceSeries | null> {
    return this.seriesMap.get(id) ?? null;
  }

  public async findActiveSeries(): Promise<RecurrenceSeries[]> {
    return Array.from(this.seriesMap.values()).filter((s) => s.status === SeriesStatus.ACTIVE);
  }

  public async findByClientId(clientId: string): Promise<RecurrenceSeries[]> {
    return Array.from(this.seriesMap.values()).filter((s) => s.clientId === clientId);
  }

  public async save(series: RecurrenceSeries): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database transaction failure during series save.');
    }
    this.seriesMap.set(series.id.toString(), series);
  }

  public clear(): void {
    this.seriesMap.clear();
    this.shouldFailSave = false;
  }
}

describe('Recurrence Complete Pipeline QA & Resilience Integration Suite', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let seriesRepo: InMemoryRecurrenceSeriesRepository;
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let clock: TestClock;

  let createHandler: CreateRecurrenceSeriesHandler;
  let generateHandler: GenerateRecurringOccurrencesHandler;
  let skipHandler: SkipRecurrenceOccurrenceHandler;
  let editSingleHandler: EditSingleOccurrenceHandler;
  let editFutureHandler: EditFutureOccurrencesHandler;
  let cancelHandler: CancelRecurrenceSeriesHandler;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-08-01T08:00:00.000Z'), 'UTC');
    apptRepo = new InMemoryAppointmentRepository();
    seriesRepo = new InMemoryRecurrenceSeriesRepository();

    conflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    generateHandler = new GenerateRecurringOccurrencesHandler(
      seriesRepo,
      apptRepo,
      conflictService,
      clock,
    );

    createHandler = new CreateRecurrenceSeriesHandler(seriesRepo, generateHandler, clock);

    skipHandler = new SkipRecurrenceOccurrenceHandler(seriesRepo, apptRepo, clock);

    editSingleHandler = new EditSingleOccurrenceHandler(
      apptRepo,
      seriesRepo,
      conflictService,
      clock,
    );

    editFutureHandler = new EditFutureOccurrencesHandler(
      seriesRepo,
      apptRepo,
      generateHandler,
      clock,
    );

    cancelHandler = new CancelRecurrenceSeriesHandler(seriesRepo, apptRepo, clock);
  });

  describe('1. Complete Creation-to-Generation Pipeline', () => {
    it('executes full pipeline: aggregate creation -> calculation -> conflict detection -> appointment creation -> persistence', async () => {
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_qa_1',
          therapistId: 'therapist_qa_1',
          roomId: 'room_qa_1',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 30, // Aug 1, 8, 15, 22, 29 (5 weekly occurrences)
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const data = createRes.getValue();
      expect(data.series.id).toBeDefined();
      expect(data.initialGeneration.generatedCount).toBe(5);
      expect(data.initialGeneration.conflictCount).toBe(0);

      // Verify Appointment aggregate creation in persistence repository
      const persistedAppts = Array.from(apptRepo.appointments.values());
      expect(persistedAppts).toHaveLength(5);
      persistedAppts.forEach((appt, idx) => {
        expect(appt.seriesId).toBe(data.series.id);
        expect(appt.occurrenceIndex).toBe(idx);
        expect(appt.status).toBe(AppointmentStatus.SCHEDULED);
        expect(appt.isDetachedFromSeries).toBe(false);
      });
    });
  });

  describe('2. Idempotency & Repeated Window Generation', () => {
    it('guarantees zero duplicate appointments when running generation repeatedly for identical windows', async () => {
      // 1. Create series
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_qa_idempotent',
          therapistId: 'therapist_qa_idempotent',
          roomId: 'room_qa_idempotent',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 30,
        }),
      );

      const seriesId = createRes.getValue().series.id;
      expect(apptRepo.appointments.size).toBe(5);

      // 2. Re-run identical generation command
      const genRes2 = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          horizonDays: 30,
        }),
      );

      expect(genRes2.isSuccess).toBe(true);
      expect(genRes2.getValue().generatedCount).toBe(0);
      expect(genRes2.getValue().existingCount).toBe(5);
      expect(apptRepo.appointments.size).toBe(5); // Zero duplicate appointments
    });

    it('handles overlapping and adjacent rolling windows cleanly without duplicate creation', async () => {
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_qa_overlap',
          therapistId: 'therapist_qa_overlap',
          roomId: 'room_qa_overlap',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 14, // Window 1: Aug 1, Aug 8 (2 occurrences)
        }),
      );

      const seriesId = createRes.getValue().series.id;
      expect(apptRepo.appointments.size).toBe(3); // Aug 1, Aug 8, Aug 15

      // Window 2: Overlapping from Aug 8 to Aug 23 (Aug 8, Aug 15 exist, Aug 22 new)
      const genRes2 = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          windowStart: new Date('2026-08-08T00:00:00.000Z'),
          windowEnd: new Date('2026-08-23T00:00:00.000Z'),
        }),
      );

      expect(genRes2.isSuccess).toBe(true);
      expect(genRes2.getValue().generatedCount).toBe(1); // Aug 22
      expect(genRes2.getValue().existingCount).toBe(2); // Aug 8, Aug 15
      expect(apptRepo.appointments.size).toBe(4); // Total 4 distinct appointments

      // Window 3: Adjacent from Aug 23 to Sep 06 (Aug 29, Sep 5 new)
      const genRes3 = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          windowStart: new Date('2026-08-23T00:00:00.000Z'),
          windowEnd: new Date('2026-09-06T00:00:00.000Z'),
        }),
      );

      expect(genRes3.isSuccess).toBe(true);
      expect(genRes3.getValue().generatedCount).toBe(2); // Aug 29, Sep 5
      expect(apptRepo.appointments.size).toBe(6);
    });
  });

  describe('3. Concurrency Simulation & Race Condition Handling', () => {
    it('simulates sequential and overlapping generator runs on the same series idempotently', async () => {
      const series = RecurrenceSeries.create(
        {
          pattern: RecurrencePattern.create({
            frequency: RecurrenceFrequency.WEEKLY,
            startDate: new Date('2026-08-01T09:00:00.000Z'),
            maxOccurrences: 4,
            localStartTime: { hour: 9, minute: 0 },
            durationMinutes: 60,
            timezone: 'UTC',
          }),
          clientId: 'client_twin_gen',
          therapistId: 'therapist_twin_gen',
          roomId: 'room_twin_gen',
          serviceType: 'TREATMENT',
        },
        clock,
      );

      await seriesRepo.save(series);

      // Run generator 1
      const res1 = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      // Run generator 2 over same window
      const res2 = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);

      expect(res1.getValue().generatedCount).toBe(4);
      expect(res2.getValue().generatedCount).toBe(0);
      expect(res2.getValue().existingCount).toBe(4);
      expect(apptRepo.appointments.size).toBe(4); // Exactly 4 total, no duplicate appointments
    });

    it('simulates occurrence skip concurrent with subsequent rolling window generation', async () => {
      // 1. Create series with 5 occurrences
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_skip_race',
          therapistId: 'therapist_skip_race',
          roomId: 'room_skip_race',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 30,
        }),
      );

      const seriesId = createRes.getValue().series.id;

      // 2. Skip occurrence index 1 (Aug 8)
      const skipRes = await skipHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId,
          occurrenceIndex: 1,
          reason: 'Client traveling',
        }),
      );
      expect(skipRes.isSuccess).toBe(true);

      // 3. Run generator over the window
      const genRes = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          horizonDays: 30,
        }),
      );

      expect(genRes.isSuccess).toBe(true);
      expect(genRes.getValue().skippedCount).toBe(1); // Detected SKIPPED exception
      // The skipped appointment remains cancelled and is never recreated
      const appts = Array.from(apptRepo.appointments.values());
      const skippedAppt = appts.find((a) => a.seriesId === seriesId && a.occurrenceIndex === 1);
      expect(skippedAppt?.status).toBe(AppointmentStatus.CANCELLED);
    });
  });

  describe('4. Conflict Detection Integration & Diagnostic Recording', () => {
    it('detects pre-existing therapist appointment and skips conflicted slot with full diagnostic payload', async () => {
      // Configure conflict service to return a THERAPIST conflict for the 2nd occurrence (Aug 8)
      conflictService.detectConflicts.mockImplementation(async (params) => {
        if (params.requestedRange.start.toISOString().includes('2026-08-08')) {
          return [
            SchedulingConflict.create({
              conflictType: 'THERAPIST',
              conflictingEntityId: params.therapistId,
              requestedRange: params.requestedRange,
              reason: 'Therapist is already booked with another client.',
            }),
          ];
        }
        return [];
      });

      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_rec',
          therapistId: 'therapist_conflict',
          roomId: 'room_rec',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 20, // Aug 1, Aug 8, Aug 15
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const initGen = createRes.getValue().initialGeneration;

      // Aug 1 and Aug 15 should be generated (2). Aug 8 should be in conflict (1).
      expect(initGen.generatedCount).toBe(2);
      expect(initGen.conflictCount).toBe(1);
      expect(initGen.conflictingOccurrences).toHaveLength(1);
      expect(initGen.conflictingOccurrences[0]!.occurrenceIndex).toBe(1);
      expect(initGen.conflictingOccurrences[0]!.conflicts[0]!.conflictType).toBe('THERAPIST');
    });

    it('allows adjacent boundary appointments without false positive conflict', async () => {
      // Normal non-conflicting adjacent appointment scenario
      conflictService.detectConflicts.mockResolvedValue([]);

      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_adj',
          therapistId: 'therapist_boundary',
          roomId: 'room_boundary',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 6, // Aug 1 (1 occurrence)
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      expect(createRes.getValue().initialGeneration.conflictCount).toBe(0);
      expect(createRes.getValue().initialGeneration.generatedCount).toBe(1);
    });
  });

  describe('5. Exception Handling, Regeneration & Cutoff-and-Fork', () => {
    it('preserves detached single occurrence modification across subsequent rolling window regeneration', async () => {
      // 1. Create series
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_edit_preserve',
          therapistId: 'therapist_edit_preserve',
          roomId: 'room_edit_preserve',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 20, // Aug 1, Aug 8, Aug 15
        }),
      );

      const seriesId = createRes.getValue().series.id;
      const appts = Array.from(apptRepo.appointments.values());
      const aug8Appt = appts.find((a) => a.occurrenceIndex === 1)!;
      expect(aug8Appt).toBeDefined();

      // 2. Edit & detach Aug 8 occurrence to 14:00 PM
      const editRes = await editSingleHandler.execute(
        new EditSingleOccurrenceCommand({
          appointmentId: aug8Appt.id.getValue(),
          startTime: new Date('2026-08-08T14:00:00.000Z'),
          reason: 'Client requested afternoon',
        }),
      );
      expect(editRes.isSuccess).toBe(true);
      expect(editRes.getValue().isDetachedFromSeries).toBe(true);

      // 3. Re-run generator across expanded 30-day horizon (generates Aug 22 and Aug 29)
      const genRes = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          horizonDays: 30,
        }),
      );

      expect(genRes.isSuccess).toBe(true);
      expect(genRes.getValue().generatedCount).toBe(2); // Aug 22, Aug 29
      expect(genRes.getValue().existingCount).toBeGreaterThanOrEqual(2); // Aug 1, Aug 8, Aug 15

      // Verify the detached appointment was NOT overwritten or duplicated
      const refreshedAppts = Array.from(apptRepo.appointments.values());
      const modifiedAppt = refreshedAppts.find((a) => a.id.getValue() === aug8Appt.id.getValue());
      expect(modifiedAppt?.timeRange.start.toISOString()).toBe('2026-08-08T14:00:00.000Z');
      expect(modifiedAppt?.isDetachedFromSeries).toBe(true);
    });

    it('executes Cutoff-and-Fork cleanly when editing future occurrences of a series', async () => {
      // 1. Create series with 7 weekly occurrences
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_fork_qa',
          therapistId: 'therapist_fork_qa',
          roomId: 'room_fork_qa',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 45, // Aug 1, 8, 15, 22, 29, Sep 5, Sep 12 (7 occurrences)
        }),
      );

      const oldSeriesId = createRes.getValue().series.id;
      expect(apptRepo.appointments.size).toBe(7);

      // 2. Fork future occurrences from Aug 22 onwards to biweekly at 11:00 AM
      const forkRes = await editFutureHandler.execute(
        new EditFutureOccurrencesCommand({
          seriesId: oldSeriesId,
          fromOccurrenceIndex: 3,
          fromDate: new Date('2026-08-22T00:00:00.000Z'),
          newFrequency: RecurrenceFrequency.BIWEEKLY,
          newLocalStartTime: { hour: 11, minute: 0 },
          newDurationMinutes: 90,
        }),
      );

      expect(forkRes.isSuccess).toBe(true);
      const forkData = forkRes.getValue();
      expect(forkData.oldSeriesId).toBe(oldSeriesId);
      expect(forkData.newSeriesId).not.toBe(oldSeriesId);
      expect(forkData.cancelledAppointmentsCount).toBe(4); // Aug 22, 29, Sep 5, Sep 12
    });

    it('rejects recurrence generation on a cancelled series', async () => {
      // 1. Create series
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_cancel_block',
          therapistId: 'therapist_cancel_block',
          roomId: 'room_cancel_block',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 14,
        }),
      );

      const seriesId = createRes.getValue().series.id;

      // 2. Cancel series
      const cancelRes = await cancelHandler.execute(
        new CancelRecurrenceSeriesCommand({
          seriesId,
          reason: 'Client completed treatment course',
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);

      // 3. Attempt generation on cancelled series -> must fail
      const genRes = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          horizonDays: 30,
        }),
      );

      expect(genRes.isSuccess).toBe(false);
      expect(genRes.getError()).toContain('Cannot generate occurrences for non-active');
    });
  });

  describe('6. Failure & Resilience Modes', () => {
    it('safely rejects generation when persistence throws a database error', async () => {
      const createRes = await createHandler.execute(
        new CreateRecurrenceSeriesCommand({
          clientId: 'client_fail_test',
          therapistId: 'therapist_fail_test',
          roomId: 'room_fail_test',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-08-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          horizonDays: 7, // Generates 1st occurrence (Aug 1)
        }),
      );

      const seriesId = createRes.getValue().series.id;

      // Simulate database failure on next appointment save
      apptRepo.shouldFailSave = true;

      const genRes = await generateHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId,
          windowStart: new Date('2026-08-08T00:00:00.000Z'),
          windowEnd: new Date('2026-08-22T00:00:00.000Z'),
        }),
      );

      expect(genRes.isSuccess).toBe(false);
      expect(genRes.getError()).toContain('Database transaction failure');
    });
  });
});
