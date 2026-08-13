import { CreateRecurrenceSeriesHandler } from './create-recurrence-series.handler';
import { CreateRecurrenceSeriesCommand } from '../commands/create-recurrence-series.command';
import { GenerateRecurringOccurrencesHandler } from './generate-recurring-occurrences.handler';
import { RecurrenceSeries } from '../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../../../domain/recurrence/value-objects/recurrence-series-id.vo';
import { RecurrenceFrequency } from '../../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { AppointmentStatus } from '../../../domain/value-objects/appointment-status.enum';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { TestClock } from '../../../domain/shared/clock';
import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../../domain/repositories/appointment.repository';
import { RecurrenceSeriesRepository } from '../../../domain/repositories/recurrence-series.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { SchedulingConflict } from '../../../domain/value-objects/scheduling-conflict.vo';
import {
  OnRecurringAppointmentCreatedEventHandler,
  OnRecurringSeriesCancelledEventHandler,
  OnOccurrenceSkippedEventHandler,
} from '../event-handlers';
import { RecurringAppointmentCreatedEvent } from '../../../domain/events/recurring-appointment-created.event';
import { RecurringSeriesCancelledEvent } from '../../../domain/events/recurring-series-cancelled.event';
import { OccurrenceSkippedEvent } from '../../../domain/events/occurrence-skipped.event';

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

  public count(): number {
    return this.seriesMap.size;
  }
}

describe('CreateRecurrenceSeriesHandler & Application Event Handlers', () => {
  let apptRepo: InMemoryAppointmentRepository;
  let seriesRepo: InMemoryRecurrenceSeriesRepository;
  let conflictService: jest.Mocked<ConflictDetectionService>;
  let testClock: TestClock;
  let genHandler: GenerateRecurringOccurrencesHandler;
  let createHandler: CreateRecurrenceSeriesHandler;

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

    createHandler = new CreateRecurrenceSeriesHandler(seriesRepo, genHandler, testClock);
  });

  describe('Create Recurring Series Workflow', () => {
    it('creates series aggregate and generates initial rolling-window appointments', async () => {
      const command = new CreateRecurrenceSeriesCommand({
        clientId: 'client_100',
        therapistId: 'therapist_100',
        roomId: 'room_100',
        serviceType: 'TREATMENT',
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: '2026-08-01T10:00:00.000Z',
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        maxOccurrences: 4,
        horizonDays: 30,
      });

      const result = await createHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.series.clientId).toBe('client_100');
      expect(data.series.status).toBe('ACTIVE');
      expect(data.series.pattern.frequency).toBe('WEEKLY');
      expect(data.initialGeneration.generatedCount).toBe(4);
      expect(data.initialGeneration.conflictCount).toBe(0);

      expect(seriesRepo.count()).toBe(1);
      expect(apptRepo.count()).toBe(4);
    });

    it('reports initial generation conflicts without rolling back the valid unconflicted appointments', async () => {
      conflictService.detectConflicts.mockImplementation(async (params) => {
        // Occurrence 1 (Aug 8) conflicts
        if (params.requestedRange.start.toISOString() === '2026-08-08T10:00:00.000Z') {
          return [
            SchedulingConflict.create({
              conflictType: 'THERAPIST',
              conflictingEntityId: 'therapist_conflict',
              requestedRange: params.requestedRange,
              reason: 'Therapist unavailable on this date.',
            }),
          ];
        }
        return [];
      });

      const command = new CreateRecurrenceSeriesCommand({
        clientId: 'client_conf',
        therapistId: 'therapist_conf',
        roomId: 'room_conf',
        serviceType: 'TREATMENT',
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: '2026-08-01T10:00:00.000Z',
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        maxOccurrences: 4,
        horizonDays: 30,
      });

      const result = await createHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.initialGeneration.generatedCount).toBe(3); // Occurrences 0, 2, 3
      expect(data.initialGeneration.conflictCount).toBe(1); // Occurrence 1
      expect(data.initialGeneration.conflictingOccurrences).toHaveLength(1);
      expect(data.initialGeneration.conflictingOccurrences[0]!.occurrenceIndex).toBe(1);

      expect(apptRepo.count()).toBe(3);
    });

    it('fails gracefully when invalid pattern arguments are supplied', async () => {
      const command = new CreateRecurrenceSeriesCommand({
        clientId: 'client_bad',
        therapistId: 'therapist_bad',
        roomId: 'room_bad',
        serviceType: 'TREATMENT',
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: '2026-08-10T10:00:00.000Z',
        endDate: '2026-08-01T10:00:00.000Z', // Invalid: endDate before startDate
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const result = await createHandler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain('endDate must be strictly after startDate');
    });
  });

  describe('Recurrence Domain Event Handlers', () => {
    it('handles RecurringAppointmentCreatedEvent', async () => {
      const handler = new OnRecurringAppointmentCreatedEventHandler();
      const event = new RecurringAppointmentCreatedEvent(
        'series_evt_1',
        'c1',
        't1',
        'r1',
        'TREATMENT',
        RecurrenceFrequency.WEEKLY,
        new Date('2026-08-01T10:00:00.000Z'),
        undefined,
        4,
        1,
        testClock.now(),
      );

      await handler.handle(event);

      expect(handler.getHandledEvents()).toHaveLength(1);
      expect(handler.getHandledEvents()[0]!.aggregateId).toBe('series_evt_1');
      expect(handler.getHandledEvents()[0]!.payload.clientId).toBe('c1');

      handler.clear();
      expect(handler.getHandledEvents()).toHaveLength(0);
    });

    it('handles RecurringSeriesCancelledEvent', async () => {
      const handler = new OnRecurringSeriesCancelledEventHandler();
      const event = new RecurringSeriesCancelledEvent(
        'series_evt_2',
        'Client relocated',
        2,
        testClock.now(),
      );

      await handler.handle(event);

      expect(handler.getHandledEvents()).toHaveLength(1);
      expect(handler.getHandledEvents()[0]!.payload.reason).toBe('Client relocated');
    });

    it('handles OccurrenceSkippedEvent', async () => {
      const handler = new OnOccurrenceSkippedEventHandler();
      const event = new OccurrenceSkippedEvent(
        'series_evt_3',
        2,
        new Date('2026-08-15T10:00:00.000Z'),
        'Public Holiday',
        2,
        testClock.now(),
      );

      await handler.handle(event);

      expect(handler.getHandledEvents()).toHaveLength(1);
      expect(handler.getHandledEvents()[0]!.payload.occurrenceIndex).toBe(2);
      expect(handler.getHandledEvents()[0]!.payload.reason).toBe('Public Holiday');
    });
  });
});
