import { GenerateRecurringOccurrencesHandler } from './generate-recurring-occurrences.handler';
import { GenerateRecurringOccurrencesCommand } from '../commands/generate-recurring-occurrences.command';
import { RecurrenceSeries } from '../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../../../domain/recurrence/value-objects/recurrence-series-id.vo';
import { RecurrencePattern } from '../../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { AppointmentTypeEnum } from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { TestClock } from '../../../domain/shared/clock';
import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../../domain/repositories/appointment.repository';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { SchedulingConflict } from '../../../domain/value-objects/scheduling-conflict.vo';

class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments = new Map<string, Appointment>();

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

  public count(): number {
    return this.appointments.size;
  }
}

class InMemoryRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  private seriesMap = new Map<string, RecurrenceSeries>();

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

describe('GenerateRecurringOccurrencesHandler', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let seriesRepo: InMemoryRecurrenceSeriesRepository;
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let testClock: TestClock;
  let handler: GenerateRecurringOccurrencesHandler;

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-01T08:00:00.000Z'), 'UTC');
    apptRepo = new InMemoryAppointmentRepository();
    seriesRepo = new InMemoryRecurrenceSeriesRepository();

    conflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    handler = new GenerateRecurringOccurrencesHandler(
      seriesRepo,
      apptRepo,
      conflictService,
      testClock,
    );
  });

  it('generates weekly appointment occurrences across rolling window and persists them', async () => {
    const pattern = RecurrencePattern.create({
      frequency: RecurrenceFrequency.WEEKLY,
      startDate: new Date('2026-08-01T10:00:00.000Z'), // Saturday 10:00 AM
      maxOccurrences: 4,
      localStartTime: { hour: 10, minute: 0 },
      durationMinutes: 60,
      timezone: 'UTC',
    });

    const series = RecurrenceSeries.create(
      {
        pattern,
        clientId: 'client_gen_1',
        therapistId: 'therapist_gen_1',
        roomId: 'room_gen_1',
        serviceType: AppointmentTypeEnum.TREATMENT,
      },
      testClock,
    );

    await seriesRepo.save(series);

    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: series.id.toString(),
      horizonDays: 30,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.generatedCount).toBe(4);
    expect(data.existingCount).toBe(0);
    expect(data.conflictCount).toBe(0);
    expect(data.skippedCount).toBe(0);
    expect(data.generatedAppointments).toHaveLength(4);

    expect(apptRepo.count()).toBe(4);
    const savedAppts = await apptRepo.findBySeriesId(series.id.toString());
    expect(savedAppts).toHaveLength(4);
    expect(savedAppts[0]!.occurrenceIndex).toBe(0);
    expect(savedAppts[0]!.seriesId).toBe(series.id.toString());
    expect(savedAppts[3]!.occurrenceIndex).toBe(3);
  });

  it('is completely idempotent: running generation twice creates zero duplicate appointments', async () => {
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
        clientId: 'client_idem',
        therapistId: 'therapist_idem',
        roomId: 'room_idem',
        serviceType: AppointmentTypeEnum.TREATMENT,
      },
      testClock,
    );

    await seriesRepo.save(series);

    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: series.id.toString(),
      horizonDays: 30,
    });

    // Run 1: Materializes 3 appointments
    const res1 = await handler.execute(command);
    expect(res1.isSuccess).toBe(true);
    expect(res1.getValue().generatedCount).toBe(3);
    expect(apptRepo.count()).toBe(3);

    // Run 2: Detects all 3 already materialized -> 0 generated, 3 existing
    const res2 = await handler.execute(command);
    expect(res2.isSuccess).toBe(true);
    expect(res2.getValue().generatedCount).toBe(0);
    expect(res2.getValue().existingCount).toBe(3);
    expect(apptRepo.count()).toBe(3); // Zero duplicate records created
  });

  it('handles partial generation by materializing unconflicted slots and returning detailed conflict diagnostics', async () => {
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
        clientId: 'client_partial',
        therapistId: 'therapist_partial',
        roomId: 'room_partial',
        serviceType: AppointmentTypeEnum.TREATMENT,
      },
      testClock,
    );

    await seriesRepo.save(series);

    // Mock conflict only on occurrence index 2 (Aug 15)
    conflictService.detectConflicts.mockImplementation(async (params) => {
      if (params.requestedRange.start.toISOString() === '2026-08-15T10:00:00.000Z') {
        return [
          SchedulingConflict.create({
            conflictType: 'THERAPIST',
            conflictingEntityId: 'therapist_partial',
            requestedRange: params.requestedRange,
            reason: 'Therapist has scheduled vacation.',
          }),
        ];
      }
      return [];
    });

    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: series.id.toString(),
      horizonDays: 30,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.generatedCount).toBe(3); // Occurrences 0, 1, 3
    expect(data.conflictCount).toBe(1); // Occurrence 2
    expect(data.conflictingOccurrences).toHaveLength(1);
    expect(data.conflictingOccurrences[0]!.occurrenceIndex).toBe(2);
    expect(data.conflictingOccurrences[0]!.conflicts[0]!.message).toContain('vacation');

    // 3 appointments persisted in DB
    expect(apptRepo.count()).toBe(3);
  });

  it('respects skipped exceptions on the series', async () => {
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
        clientId: 'client_skip',
        therapistId: 'therapist_skip',
        roomId: 'room_skip',
        serviceType: AppointmentTypeEnum.TREATMENT,
      },
      testClock,
    );

    // Skip occurrence index 1 (Aug 8)
    series.skipOccurrence(1, new Date('2026-08-08T10:00:00.000Z'), 'Patient holiday', testClock);
    await seriesRepo.save(series);

    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: series.id.toString(),
      horizonDays: 30,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();
    expect(data.generatedCount).toBe(2); // Occurrences 0, 2
    expect(data.skippedCount).toBe(1); // Occurrence 1
    expect(apptRepo.count()).toBe(2);
  });

  it('fails gracefully when series is cancelled', async () => {
    const pattern = RecurrencePattern.create({
      frequency: RecurrenceFrequency.WEEKLY,
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      localStartTime: { hour: 10, minute: 0 },
      durationMinutes: 60,
      timezone: 'UTC',
    });

    const series = RecurrenceSeries.create(
      {
        pattern,
        clientId: 'client_cancel',
        therapistId: 'therapist_cancel',
        roomId: 'room_cancel',
        serviceType: AppointmentTypeEnum.TREATMENT,
      },
      testClock,
    );

    series.cancel('Patient relocated', testClock);
    await seriesRepo.save(series);

    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: series.id.toString(),
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toContain('non-active recurrence series');
  });

  it('fails gracefully when series does not exist', async () => {
    const command = new GenerateRecurringOccurrencesCommand({
      seriesId: 'non_existent_series',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toContain('was not found');
  });
});
