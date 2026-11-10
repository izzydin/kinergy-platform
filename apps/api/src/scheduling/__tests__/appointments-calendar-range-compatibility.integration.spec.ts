import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppointmentsController } from '../controllers/appointments.controller';
import {
  FindAppointmentsByRangeHandler,
  GetAppointmentByIdHandler,
  CreateAppointmentHandler,
  RescheduleAppointmentHandler,
  CancelAppointmentHandler,
  ConfirmAppointmentHandler,
  CheckInAppointmentHandler,
  CompleteAppointmentHandler,
  MarkNoShowHandler,
  AddAppointmentNoteHandler,
  GetDailyAgendaHandler,
  GetWeeklyAgendaHandler,
  ConflictDetectionService,
  SlotFinderEngine,
  ApplicationResult,
  AppointmentTypeEnum,
} from '@kinergy-platform/core';
import { PrismaAppointmentRepository } from '@kinergy-platform/core/server';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

describe('Appointments Calendar Range API Integration (Multi-Type & Month Compatibility)', () => {
  let app: INestApplication;
  let mockFindAppointmentsByRangeHandler: jest.Mocked<FindAppointmentsByRangeHandler>;

  const validTypes = Object.values(AppointmentTypeEnum);

  beforeAll(async () => {
    mockFindAppointmentsByRangeHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<FindAppointmentsByRangeHandler>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: FindAppointmentsByRangeHandler,
          useValue: mockFindAppointmentsByRangeHandler,
        },
        { provide: GetAppointmentByIdHandler, useValue: { execute: jest.fn() } },
        { provide: CreateAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: RescheduleAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: CancelAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: ConfirmAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: CheckInAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: CompleteAppointmentHandler, useValue: { execute: jest.fn() } },
        { provide: MarkNoShowHandler, useValue: { execute: jest.fn() } },
        { provide: AddAppointmentNoteHandler, useValue: { execute: jest.fn() } },
        { provide: GetDailyAgendaHandler, useValue: { execute: jest.fn() } },
        { provide: GetWeeklyAgendaHandler, useValue: { execute: jest.fn() } },
        { provide: ConflictDetectionService, useValue: {} },
        { provide: SlotFinderEngine, useValue: {} },
        { provide: PrismaAppointmentRepository, useValue: {} },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new SchedulingExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/scheduling/appointments (Range Queries across Views)', () => {
    it('returns 200 and mapped DTOs when querying a monthly range containing all valid appointment types', async () => {
      const mockDtos = validTypes.map((type, idx) => ({
        id: `appt-test-${idx}`,
        clientId: `cli-${idx}`,
        therapistId: 'therapist-sarah',
        roomId: 'room-kinesio-1',
        type,
        status: 'SCHEDULED',
        startTime: `2026-11-0${idx + 1}T10:00:00.000Z`,
        endTime: `2026-11-0${idx + 1}T11:00:00.000Z`,
        durationMinutes: 60,
        version: 1,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
        notes: [],
      }));

      mockFindAppointmentsByRangeHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok(mockDtos),
      );

      const res = await request(app.getHttpServer()).get('/api/v1/scheduling/appointments').query({
        startDate: '2026-10-26T04:00:00.000Z',
        endDate: '2026-12-07T04:59:59.999Z',
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveLength(validTypes.length);
      for (const expectedType of validTypes) {
        expect(res.body.some((item: { type: string }) => item.type === expectedType)).toBe(true);
      }
    });

    it('returns 400 Bad Request when query handler reports an invalid appointment type error', async () => {
      mockFindAppointmentsByRangeHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('Invalid appointment type: KINESIOLOGY_TREATMENT'),
      );

      const res = await request(app.getHttpServer()).get('/api/v1/scheduling/appointments').query({
        startDate: '2026-10-26T04:00:00.000Z',
        endDate: '2026-12-07T04:59:59.999Z',
      });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.message).toContain('Invalid appointment type: KINESIOLOGY_TREATMENT');
    });

    it('returns empty array 200 OK when a date range (such as daily or weekly) has no appointments', async () => {
      mockFindAppointmentsByRangeHandler.execute.mockResolvedValueOnce(ApplicationResult.ok([]));

      const res = await request(app.getHttpServer()).get('/api/v1/scheduling/appointments').query({
        startDate: '2026-11-10T05:00:00.000Z',
        endDate: '2026-11-11T04:59:59.999Z',
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toEqual([]);
    });

    it('rejects requests missing startDate or endDate query parameters', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/scheduling/appointments');
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.message).toContain(
        'Both startDate and endDate query parameters are required.',
      );
    });
  });
});
