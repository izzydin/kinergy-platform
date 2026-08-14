import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RecurringAppointmentsController } from '../controllers/recurring-appointments.controller';
import {
  CreateRecurrenceSeriesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
  ApplicationResult,
  RecurrenceFrequency,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { GlobalSanitizationValidationPipe } from '../../common/pipes';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

describe('RecurringAppointments API Integration Tests (HTTP Flow)', () => {
  let app: INestApplication;
  let mockCreateHandler: jest.Mocked<CreateRecurrenceSeriesHandler>;
  let mockSkipHandler: jest.Mocked<SkipRecurrenceOccurrenceHandler>;
  let mockEditSingleHandler: jest.Mocked<EditSingleOccurrenceHandler>;
  let mockEditFutureHandler: jest.Mocked<EditFutureOccurrencesHandler>;
  let mockCancelHandler: jest.Mocked<CancelRecurrenceSeriesHandler>;

  beforeAll(async () => {
    mockCreateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRecurrenceSeriesHandler>;
    mockSkipHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SkipRecurrenceOccurrenceHandler>;
    mockEditSingleHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EditSingleOccurrenceHandler>;
    mockEditFutureHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EditFutureOccurrencesHandler>;
    mockCancelHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelRecurrenceSeriesHandler>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RecurringAppointmentsController],
      providers: [
        { provide: CreateRecurrenceSeriesHandler, useValue: mockCreateHandler },
        { provide: SkipRecurrenceOccurrenceHandler, useValue: mockSkipHandler },
        { provide: EditSingleOccurrenceHandler, useValue: mockEditSingleHandler },
        { provide: EditFutureOccurrencesHandler, useValue: mockEditFutureHandler },
        { provide: CancelRecurrenceSeriesHandler, useValue: mockCancelHandler },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new SchedulingExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/scheduling/recurring-appointments', () => {
    it('returns 201 Created on valid series instantiation payload', async () => {
      mockCreateHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          series: {
            id: 'series_integ_1',
            clientId: 'client_integ_1',
            therapistId: 'therapist_integ_1',
            roomId: 'room_integ_1',
            serviceType: 'TREATMENT',
            pattern: {
              frequency: 'WEEKLY',
              startDate: '2026-09-01T09:00:00.000Z',
              localStartTime: { hour: 9, minute: 0 },
              durationMinutes: 60,
              timezone: 'UTC',
            },
            exceptions: [],
            status: 'ACTIVE',
            version: 1,
            createdAt: '2026-08-14T12:00:00.000Z',
            updatedAt: '2026-08-14T12:00:00.000Z',
          },
          initialGeneration: {
            seriesId: 'series_integ_1',
            requestedWindow: {
              start: '2026-09-01T00:00:00.000Z',
              end: '2026-11-01T00:00:00.000Z',
            },
            generatedCount: 4,
            skippedCount: 0,
            conflictCount: 0,
            existingCount: 0,
            isSeriesCompleted: false,
            generatedAppointments: [],
            conflictingOccurrences: [],
          },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/recurring-appointments')
        .send({
          clientId: 'client_integ_1',
          therapistId: 'therapist_integ_1',
          roomId: 'room_integ_1',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-09-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
        });

      expect(res.status).toBe(201);
      expect(res.body.series.id).toBe('series_integ_1');
      expect(res.body.initialGeneration.generatedCount).toBe(4);
    });

    it('returns 400 Bad Request on validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/recurring-appointments')
        .send({
          clientId: '', // Empty client ID
          durationMinutes: 5, // Invalid duration
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/scheduling/recurring-appointments/:seriesId/skip', () => {
    it('returns 200 OK when skipping valid occurrence slot', async () => {
      mockSkipHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          seriesId: 'series_integ_1',
          occurrenceIndex: 2,
          date: '2026-09-15T09:00:00.000Z',
          isNewlySkipped: true,
          cancelledAppointmentId: 'appt_cancelled_integ',
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/recurring-appointments/series_integ_1/skip')
        .send({
          occurrenceIndex: 2,
          reason: 'Client out of town',
        });

      expect(res.status).toBe(200);
      expect(res.body.seriesId).toBe('series_integ_1');
      expect(res.body.occurrenceIndex).toBe(2);
    });
  });

  describe('POST /api/v1/scheduling/recurring-appointments/:seriesId/cancel', () => {
    it('returns 200 OK on cancellation', async () => {
      mockCancelHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          seriesId: 'series_integ_1',
          reason: 'Course finished early',
          cancelledAppointmentsCount: 5,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/scheduling/recurring-appointments/series_integ_1/cancel')
        .send({
          reason: 'Course finished early',
        });

      expect(res.status).toBe(200);
      expect(res.body.seriesId).toBe('series_integ_1');
      expect(res.body.cancelledAppointmentsCount).toBe(5);
    });
  });
});
