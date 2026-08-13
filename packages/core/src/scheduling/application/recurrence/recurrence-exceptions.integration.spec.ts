import { GenerateRecurringOccurrencesHandler } from './handlers/generate-recurring-occurrences.handler';
import { SkipRecurrenceOccurrenceHandler } from './handlers/skip-recurrence-occurrence.handler';
import { EditSingleOccurrenceHandler } from './handlers/edit-single-occurrence.handler';
import { EditFutureOccurrencesHandler } from './handlers/edit-future-occurrences.handler';
import { CancelRecurrenceSeriesHandler } from './handlers/cancel-recurrence-series.handler';

import { GenerateRecurringOccurrencesCommand } from './commands/generate-recurring-occurrences.command';
import { SkipRecurrenceOccurrenceCommand } from './commands/skip-recurrence-occurrence.command';
import { EditSingleOccurrenceCommand } from './commands/edit-single-occurrence.command';
import { EditFutureOccurrencesCommand } from './commands/edit-future-occurrences.command';
import { CancelRecurrenceSeriesCommand } from './commands/cancel-recurrence-series.command';

import { RecurrenceSeries } from '../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../../domain/recurrence/value-objects/recurrence-series-id.vo';
import { RecurrencePattern } from '../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { SeriesStatus } from '../../domain/recurrence/value-objects/series-status.enum';

import { Appointment } from '../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../domain/value-objects/appointment-status.enum';
import { AppointmentTypeEnum } from '../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../domain/value-objects/time-range.vo';
import { TestClock } from '../../domain/shared/clock';

import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../domain/repositories/appointment.repository';
import { RecurrenceSeriesRepository } from '../../domain/repositories/recurrence-series.repository';
import { ConflictDetectionService } from '../../domain/services/conflict-detection.service';

class InMemoryAppointmentRepository implements AppointmentRepository {
  public appointments = new Map<string, Appointment>();

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
    this.appointments.set(appointment.id.getValue(), appointment);
  }
}

class InMemoryRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  public seriesMap = new Map<string, RecurrenceSeries>();

  public async findById(id: RecurrenceSeriesId | string): Promise<RecurrenceSeries | null> {
    const key = typeof id === 'string' ? id : id.toString();
    return this.seriesMap.get(key) ?? null;
  }

  public async findByClientId(clientId: string): Promise<RecurrenceSeries[]> {
    return Array.from(this.seriesMap.values()).filter((s) => s.clientId === clientId);
  }

  public async save(series: RecurrenceSeries): Promise<void> {
    this.seriesMap.set(series.id.toString(), series);
  }
}

describe('Recurring Appointment Exception Handling Integration', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let seriesRepo: InMemoryRecurrenceSeriesRepository;
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let testClock: TestClock;

  let genHandler: GenerateRecurringOccurrencesHandler;
  let skipHandler: SkipRecurrenceOccurrenceHandler;
  let editSingleHandler: EditSingleOccurrenceHandler;
  let editFutureHandler: EditFutureOccurrencesHandler;
  let cancelSeriesHandler: CancelRecurrenceSeriesHandler;

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-01T08:00:00.000Z'), 'UTC');
    apptRepo = new InMemoryAppointmentRepository();
    seriesRepo = new InMemoryRecurrenceSeriesRepository();

    conflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    genHandler = new GenerateRecurringOccurrencesHandler(
      seriesRepo,
      apptRepo,
      conflictService,
      testClock,
    );

    skipHandler = new SkipRecurrenceOccurrenceHandler(seriesRepo, apptRepo, testClock);

    editSingleHandler = new EditSingleOccurrenceHandler(
      apptRepo,
      seriesRepo,
      conflictService,
      testClock,
    );

    editFutureHandler = new EditFutureOccurrencesHandler(
      seriesRepo,
      apptRepo,
      genHandler,
      testClock,
    );

    cancelSeriesHandler = new CancelRecurrenceSeriesHandler(seriesRepo, apptRepo, testClock);
  });

  describe('Skip Occurrence & Re-Generation Workflows', () => {
    it('skips an unmaterialized occurrence and prevents it from ever being generated', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_skip_integ',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series);

      // Skip week 2 (index 1)
      const skipRes = await skipHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId: series.id.toString(),
          occurrenceIndex: 1,
          date: new Date('2026-08-08T10:00:00.000Z'),
          reason: 'Patient travelling',
        }),
      );

      expect(skipRes.isSuccess).toBe(true);

      // Now run occurrence generation
      const genRes = await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(genRes.isSuccess).toBe(true);
      const data = genRes.getValue();
      expect(data.generatedCount).toBe(3); // 0, 2, 3
      expect(data.skippedCount).toBe(1); // index 1 skipped
      expect(data.generatedAppointments.map((a) => a.occurrenceIndex)).toEqual([0, 2, 3]);
    });

    it('skips a previously materialized occurrence by cancelling the appointment in repository', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_mat_skip',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series);

      // 1. First materialize all 3 occurrences
      await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(apptRepo.appointments.size).toBe(3);

      // 2. Skip occurrence 1 (Aug 8)
      const skipRes = await skipHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId: series.id.toString(),
          occurrenceIndex: 1,
          date: new Date('2026-08-08T10:00:00.000Z'),
        }),
      );

      expect(skipRes.isSuccess).toBe(true);
      expect(skipRes.getValue().cancelledAppointmentId).toBeDefined();

      const appt1 = await apptRepo.findById(skipRes.getValue().cancelledAppointmentId!);
      expect(appt1!.status).toBe(AppointmentStatus.CANCELLED);

      // 3. Repeated skip is safe and idempotent
      const skipTwiceRes = await skipHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId: series.id.toString(),
          occurrenceIndex: 1,
        }),
      );

      expect(skipTwiceRes.isSuccess).toBe(true);
      expect(skipTwiceRes.getValue().isNewlySkipped).toBe(false);

      // 4. Subsequent regeneration does not resurrect cancelled/skipped occurrence 1
      const regenRes = await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(regenRes.getValue().generatedCount).toBe(0);
      expect(regenRes.getValue().skippedCount).toBe(1);
    });
  });

  describe('Edit Single Occurrence (Detachment & Independent Lifecycle)', () => {
    it('edits a single occurrence by detaching it from the series without altering other occurrences', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_edit_single',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series);

      // Materialize occurrences 0, 1, 2
      const genRes = await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      const apptToEdit = genRes.getValue().generatedAppointments[1]!;

      // Edit single occurrence: move from Aug 8 10:00 to Aug 8 14:00 and assign therapist_2
      const editRes = await editSingleHandler.execute(
        new EditSingleOccurrenceCommand({
          appointmentId: apptToEdit.id,
          startTime: '2026-08-08T14:00:00.000Z',
          endTime: '2026-08-08T15:00:00.000Z',
          therapistId: 'therapist_2',
        }),
      );

      expect(editRes.isSuccess).toBe(true);
      const updatedAppt = editRes.getValue();
      expect(updatedAppt.startTime).toBe('2026-08-08T14:00:00.000Z');
      expect(updatedAppt.therapistId).toBe('therapist_2');

      const reloadedAppt = await apptRepo.findById(apptToEdit.id);
      expect(reloadedAppt!.isDetachedFromSeries).toBe(true);

      // Parent series recorded a MODIFIED exception
      const updatedSeries = await seriesRepo.findById(series.id.toString());
      expect(updatedSeries!.exceptions).toHaveLength(1);
      expect(updatedSeries!.exceptions[0]!.type).toBe('MODIFIED');

      // Subsequent generation does not duplicate or overwrite the detached appointment
      const regenRes = await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      expect(regenRes.getValue().generatedCount).toBe(0);
      expect(apptRepo.appointments.size).toBe(3);
    });
  });

  describe('Edit Future Occurrences (Cutoff-and-Fork Architecture)', () => {
    it('splits series at cutoff date: terminates old series S1 and instantiates new series S2 with new parameters', async () => {
      // S1: 6 weeks, Saturdays at 10:00 AM
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 6,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series1 = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_fork',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series1);

      // Materialize all 6 occurrences
      await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series1.id.toString(),
          horizonDays: 60,
        }),
      );

      expect(apptRepo.appointments.size).toBe(6);

      // Edit future from week 4 (index 3, Aug 22): change time to 14:00 and room to room_2
      const cutoffDate = '2026-08-22T00:00:00.000Z';
      const forkRes = await editFutureHandler.execute(
        new EditFutureOccurrencesCommand({
          seriesId: series1.id.toString(),
          fromOccurrenceIndex: 3,
          fromDate: cutoffDate,
          newLocalStartTime: { hour: 14, minute: 0 },
          newRoomId: 'room_2',
        }),
      );

      expect(forkRes.isSuccess).toBe(true);
      const forkData = forkRes.getValue();
      expect(forkData.oldSeriesId).toBe(series1.id.toString());
      expect(forkData.cancelledAppointmentsCount).toBe(3); // Occurrences 3, 4, 5 of S1 cancelled
      expect(forkData.newSeriesGeneratedCount).toBe(3); // Occurrences 0, 1, 2 of S2 created

      // S1 is terminated at cutoff date
      const reloadedS1 = await seriesRepo.findById(series1.id.toString());
      expect(reloadedS1!.pattern.endDate).toBeDefined();

      // S2 exists and is active
      const newSeries = await seriesRepo.findById(forkData.newSeriesId);
      expect(newSeries).toBeDefined();
      expect(newSeries!.status).toBe(SeriesStatus.ACTIVE);
      expect(newSeries!.roomId).toBe('room_2');

      // Verify appointments in repository
      const allAppts = Array.from(apptRepo.appointments.values());
      const s1ActiveAppts = allAppts.filter(
        (a) => a.seriesId === series1.id.toString() && a.status === AppointmentStatus.SCHEDULED,
      );
      const s2ActiveAppts = allAppts.filter(
        (a) => a.seriesId === newSeries!.id.toString() && a.status === AppointmentStatus.SCHEDULED,
      );

      expect(s1ActiveAppts).toHaveLength(3); // Weeks 1, 2, 3 remain under S1
      expect(s2ActiveAppts).toHaveLength(3); // Weeks 4, 5, 6 follow S2 at 14:00
      expect(s2ActiveAppts[0]!.timeRange.start.toISOString()).toBe('2026-08-22T14:00:00.000Z');
      expect(s2ActiveAppts[0]!.roomId).toBe('room_2');
    });
  });

  describe('Series Cancellation Workflows', () => {
    it('cancels series, bulk-cancels future materialized appointments, and preserves past/detached appointments', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_cancel_integ',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series);

      // Materialize occurrences (Aug 1, Aug 8, Aug 15, Aug 22)
      await genHandler.execute(
        new GenerateRecurringOccurrencesCommand({
          seriesId: series.id.toString(),
          horizonDays: 30,
        }),
      );

      // Mark occurrence 0 (Aug 1) as COMPLETED
      const appts = Array.from(apptRepo.appointments.values());
      const appt0 = appts.find((a) => a.occurrenceIndex === 0)!;
      appt0.confirm(testClock);
      appt0.checkIn(testClock);
      appt0.start(testClock);
      appt0.complete(testClock);
      await apptRepo.save(appt0);

      // Mark occurrence 1 (Aug 8) as DETACHED (single edit)
      const appt1 = appts.find((a) => a.occurrenceIndex === 1)!;
      appt1.detachFromSeries(testClock);
      await apptRepo.save(appt1);

      // Advance clock to Aug 5
      testClock.setTime(new Date('2026-08-05T12:00:00.000Z'));

      // Cancel the recurrence series
      const cancelRes = await cancelSeriesHandler.execute(
        new CancelRecurrenceSeriesCommand({
          seriesId: series.id.toString(),
          reason: 'Client requested complete therapy termination',
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      expect(cancelRes.getValue().cancelledAppointmentsCount).toBe(2); // Occurrences 2 and 3 cancelled

      // 1. Series is CANCELLED
      const reloadedSeries = await seriesRepo.findById(series.id.toString());
      expect(reloadedSeries!.status).toBe(SeriesStatus.CANCELLED);

      // 2. Past completed appointment (occurrence 0) is PRESERVED as COMPLETED
      const reloadedAppt0 = await apptRepo.findById(appt0.id);
      expect(reloadedAppt0!.status).toBe(AppointmentStatus.COMPLETED);

      // 3. Detached appointment (occurrence 1) is PRESERVED as SCHEDULED
      const reloadedAppt1 = await apptRepo.findById(appt1.id);
      expect(reloadedAppt1!.status).toBe(AppointmentStatus.SCHEDULED);

      // 4. Future series appointments (occurrences 2 & 3) are CANCELLED
      const appt2 = appts.find((a) => a.occurrenceIndex === 2)!;
      const appt3 = appts.find((a) => a.occurrenceIndex === 3)!;
      const reloadedAppt2 = await apptRepo.findById(appt2.id);
      const reloadedAppt3 = await apptRepo.findById(appt3.id);
      expect(reloadedAppt2!.status).toBe(AppointmentStatus.CANCELLED);
      expect(reloadedAppt3!.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('cancels cleanly after skipping an occurrence', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_skip_cancel',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          serviceType: AppointmentTypeEnum.TREATMENT,
        },
        testClock,
      );

      await seriesRepo.save(series);

      // Skip occurrence 1
      await skipHandler.execute(
        new SkipRecurrenceOccurrenceCommand({
          seriesId: series.id.toString(),
          occurrenceIndex: 1,
        }),
      );

      // Cancel series
      const cancelRes = await cancelSeriesHandler.execute(
        new CancelRecurrenceSeriesCommand({
          seriesId: series.id.toString(),
          reason: 'Cancel after skip',
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      const reloadedSeries = await seriesRepo.findById(series.id.toString());
      expect(reloadedSeries!.status).toBe(SeriesStatus.CANCELLED);
    });
  });
});
