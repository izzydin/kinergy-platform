import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaAppointmentRepository } from './prisma-appointment.repository';
import { PrismaRecurrenceSeriesRepository } from './prisma-recurrence-series.repository';
import { Appointment } from '../../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../../domain/appointment/appointment-id.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../../domain/value-objects/appointment-type.vo';
import { AppointmentStatus } from '../../../../domain/value-objects/appointment-status.enum';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';
import { RecurrenceSeries } from '../../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrencePattern } from '../../../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../../../domain/recurrence/value-objects/recurrence-frequency.enum';
import { TestClock } from '../../../../domain/shared/clock';
import { OptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';

describe('Prisma Scheduling Persistence & Concurrency Guarantees', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let apptRepo: PrismaAppointmentRepository;
  let seriesRepo: PrismaRecurrenceSeriesRepository;
  let testClock: TestClock;

  beforeEach(() => {
    testClock = new TestClock(new Date('2026-08-01T08:00:00.000Z'), 'UTC');

    mockPrisma = {
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'appt_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      appointmentNote: {
        upsert: jest.fn().mockResolvedValue({ id: 'note_1' }),
      },
      recurrenceSeries: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'series_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      recurrenceException: {
        upsert: jest.fn().mockResolvedValue({ id: 'exc_1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    } as unknown as jest.Mocked<PrismaClient>;

    apptRepo = new PrismaAppointmentRepository(mockPrisma);
    seriesRepo = new PrismaRecurrenceSeriesRepository(mockPrisma);
  });

  describe('Unique Occurrence Identity & Duplicate Prevention', () => {
    it('persists a new recurring appointment with seriesId and occurrenceIndex', async () => {
      const appt = Appointment.create(
        {
          clientId: 'c1',
          therapistId: 't1',
          roomId: 'r1',
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date('2026-08-01T10:00:00.000Z'),
            new Date('2026-08-01T11:00:00.000Z'),
          ),
          seriesId: 'series_db_1',
          occurrenceIndex: 0,
        },
        testClock,
      );

      (mockPrisma.appointment.upsert as jest.Mock).mockResolvedValueOnce({
        id: appt.id.getValue(),
      });

      await apptRepo.save(appt);

      expect(mockPrisma.appointment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: appt.id.getValue() },
          create: expect.objectContaining({
            seriesId: 'series_db_1',
            occurrenceIndex: 0,
            version: 1,
          }),
        }),
      );
    });

    it('rejects concurrent duplicate generation when database raises unique constraint error P2002', async () => {
      const appt = Appointment.create(
        {
          clientId: 'c1',
          therapistId: 't1',
          roomId: 'r1',
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date('2026-08-01T10:00:00.000Z'),
            new Date('2026-08-01T11:00:00.000Z'),
          ),
          seriesId: 'series_race_1',
          occurrenceIndex: 2,
        },
        testClock,
      );

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (series_id, occurrence_index)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );

      (mockPrisma.appointment.upsert as jest.Mock).mockRejectedValueOnce(p2002Error);

      await expect(apptRepo.save(appt)).rejects.toThrow(
        /Database constraint violation: duplicate occurrence '2' for series 'series_race_1'/,
      );
    });
  });

  describe('Optimistic Concurrency Control', () => {
    it('enforces optimistic locking on Appointment updates and throws OptimisticLockException when count === 0', async () => {
      const appt = Appointment.reconstitute({
        id: AppointmentId.create('appt_concurrency'),
        clientId: 'c1',
        therapistId: 't1',
        roomId: 'r1',
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        status: AppointmentStatus.SCHEDULED,
        timeRange: TimeRange.create(
          new Date('2026-08-01T10:00:00.000Z'),
          new Date('2026-08-01T11:00:00.000Z'),
        ),
        notes: [],
        version: 3, // Mutated from version 2
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock updateMany returning 0 rows updated (stale version conflict)
      (mockPrisma.appointment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await expect(apptRepo.save(appt)).rejects.toThrow(OptimisticLockException);
      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt_concurrency', version: 2 },
        data: expect.any(Object),
      });
    });

    it('enforces optimistic locking on RecurrenceSeries updates and throws OptimisticLockException when count === 0', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'c_opt',
          therapistId: 't_opt',
          roomId: 'r_opt',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      // Mutate series version to 2
      series.cancel('Testing concurrency', testClock);

      (mockPrisma.recurrenceSeries.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await expect(seriesRepo.save(series)).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('Recurrence Series & Exceptions Persistence', () => {
    it('persists RecurrenceSeries aggregate with skipped exceptions in an atomic transaction', async () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        maxOccurrences: 4,
      });

      const series = RecurrenceSeries.create(
        {
          pattern,
          clientId: 'client_atomic',
          therapistId: 'therapist_atomic',
          roomId: 'room_atomic',
          serviceType: 'TREATMENT',
        },
        testClock,
      );

      series.skipOccurrence(
        1,
        new Date('2026-08-08T10:00:00.000Z'),
        'Patient travelling',
        testClock,
      );

      (mockPrisma.recurrenceSeries.upsert as jest.Mock).mockResolvedValueOnce({
        id: series.id.toString(),
      });
      (mockPrisma.recurrenceException.upsert as jest.Mock).mockResolvedValueOnce({
        id: 'exc_1',
      });

      await seriesRepo.save(series);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.recurrenceException.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            unique_series_occurrence_exception: {
              seriesId: series.id.toString(),
              occurrenceIndex: 1,
            },
          },
          create: expect.objectContaining({
            seriesId: series.id.toString(),
            occurrenceIndex: 1,
            type: 'SKIPPED',
            reason: 'Patient travelling',
          }),
        }),
      );
    });

    it('loads and reconstitutes RecurrenceSeries aggregate with all normalized fields and exceptions', async () => {
      (mockPrisma.recurrenceSeries.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'series_loaded_1',
        clientId: 'client_reconst',
        therapistId: 'therapist_reconst',
        roomId: 'room_reconst',
        serviceType: 'TREATMENT',
        frequency: 'WEEKLY',
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: null,
        maxOccurrences: 8,
        localStartHour: 10,
        localStartMinute: 0,
        durationMinutes: 60,
        timezone: 'UTC',
        status: 'ACTIVE',
        cancellationReason: null,
        version: 2,
        createdAt: new Date('2026-08-01T08:00:00.000Z'),
        updatedAt: new Date('2026-08-01T08:00:00.000Z'),
        exceptions: [
          {
            id: 'exc_db_1',
            seriesId: 'series_loaded_1',
            occurrenceIndex: 2,
            date: new Date('2026-08-15T10:00:00.000Z'),
            type: 'SKIPPED',
            reason: 'Holiday',
            createdAt: new Date(),
          },
        ],
      });

      const loaded = await seriesRepo.findById('series_loaded_1');

      expect(loaded).toBeDefined();
      expect(loaded!.clientId).toBe('client_reconst');
      expect(loaded!.pattern.frequency).toBe('WEEKLY');
      expect(loaded!.exceptions).toHaveLength(1);
      expect(loaded!.exceptions[0]!.occurrenceIndex).toBe(2);
      expect(loaded!.exceptions[0]!.type).toBe('SKIPPED');
    });
  });
});
