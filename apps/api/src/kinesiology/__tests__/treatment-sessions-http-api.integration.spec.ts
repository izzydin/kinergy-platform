import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  GetTreatmentSessionByIdHandler,
  StartTreatmentSessionHandler,
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  CancelTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  ISchedulingAppointmentLookupPort,
  AppointmentReferenceDTO,
  SystemClock,
} from '@kinergy-platform/core';
import { TreatmentSessionsController } from '../controllers/treatment-sessions.controller';
import {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
} from '../kinesiology.tokens';
import { InMemoryTreatmentSessionRepository } from '../infrastructure';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import {
  DefaultPermissionResolver,
  PERMISSION_RESOLVER,
} from '../../platform/identity/authorization';
import { GlobalExceptionFilter } from '../../common/filters';
import { GlobalSanitizationValidationPipe } from '../../common/pipes';

import { Request, Response, NextFunction } from 'express';

class MockSchedulingAppointmentLookup implements ISchedulingAppointmentLookupPort {
  private readonly appointments = new Map<string, AppointmentReferenceDTO>();

  public setAppointment(dto: AppointmentReferenceDTO): void {
    this.appointments.set(dto.appointmentId, dto);
  }

  public async getAppointmentReference(
    appointmentId: string,
  ): Promise<AppointmentReferenceDTO | null> {
    return this.appointments.get(appointmentId) ?? null;
  }

  public clear(): void {
    this.appointments.clear();
  }
}

describe('TreatmentSessionsController HTTP Integration & Security Contract', () => {
  let app: INestApplication;
  let sessionRepository: InMemoryTreatmentSessionRepository;
  let appointmentLookup: MockSchedulingAppointmentLookup;
  let currentUserContext: Record<string, unknown> | null = null;

  beforeAll(async () => {
    sessionRepository = new InMemoryTreatmentSessionRepository();
    appointmentLookup = new MockSchedulingAppointmentLookup();
    const clock = new SystemClock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TreatmentSessionsController],
      providers: [
        {
          provide: TREATMENT_SESSION_REPOSITORY_TOKEN,
          useValue: sessionRepository,
        },
        {
          provide: SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
          useValue: appointmentLookup,
        },
        {
          provide: KINESIOLOGY_CLOCK_TOKEN,
          useValue: clock,
        },
        {
          provide: PERMISSION_RESOLVER,
          useClass: DefaultPermissionResolver,
        },
        {
          provide: AUTHORIZATION_EVALUATOR,
          useClass: DefaultAuthorizationEvaluator,
        },
        AuthorizationGuard,
        {
          provide: CreateTreatmentSessionFromAppointmentHandler,
          useFactory: () =>
            new CreateTreatmentSessionFromAppointmentHandler(
              appointmentLookup,
              sessionRepository,
              clock,
            ),
        },
        {
          provide: GetTreatmentSessionByIdHandler,
          useFactory: () => new GetTreatmentSessionByIdHandler(sessionRepository),
        },
        {
          provide: StartTreatmentSessionHandler,
          useFactory: () => new StartTreatmentSessionHandler(sessionRepository, undefined, clock),
        },
        {
          provide: AssignTherapistToSessionHandler,
          useFactory: () =>
            new AssignTherapistToSessionHandler(sessionRepository, undefined, clock),
        },
        {
          provide: UpdateSessionNotesHandler,
          useFactory: () => new UpdateSessionNotesHandler(sessionRepository, clock),
        },
        {
          provide: CompleteTreatmentSessionHandler,
          useFactory: () =>
            new CompleteTreatmentSessionHandler(sessionRepository, undefined, clock),
        },
        {
          provide: CancelTreatmentSessionHandler,
          useFactory: () => new CancelTreatmentSessionHandler(sessionRepository, undefined, clock),
        },
        {
          provide: GetClientTreatmentHistoryHandler,
          useFactory: () => new GetClientTreatmentHistoryHandler(sessionRepository),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Middleware to simulate authentication context
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (currentUserContext) {
        (req as unknown as { user: Record<string, unknown> }).user = currentUserContext;
      }
      next();
    });

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    sessionRepository.clear();
    appointmentLookup.clear();
    currentUserContext = null;
  });

  const asTreatUser = () => {
    currentUserContext = {
      userId: 'user-practitioner-1',
      email: 'practitioner@kinergy.test',
      status: 'ACTIVE',
      roles: ['PRACTITIONER'],
      permissions: ['kinesiology.sessions.treat'],
      tenantId: 'tenant-1',
    };
  };

  const asReadOnlyUser = () => {
    currentUserContext = {
      userId: 'user-reader-1',
      email: 'reader@kinergy.test',
      status: 'ACTIVE',
      roles: ['VIEWER'],
      permissions: ['kinesiology.sessions.read'],
      tenantId: 'tenant-1',
    };
  };

  const asAssignUser = () => {
    currentUserContext = {
      userId: 'user-admin-1',
      email: 'admin@kinergy.test',
      status: 'ACTIVE',
      roles: ['COORDINATOR'],
      permissions: ['kinesiology.sessions.assign'],
      tenantId: 'tenant-1',
    };
  };

  const asDisabledUser = () => {
    currentUserContext = {
      userId: 'user-disabled-1',
      email: 'disabled@kinergy.test',
      status: 'DISABLED',
      roles: ['PRACTITIONER'],
      permissions: ['kinesiology.sessions.treat', 'kinesiology.sessions.read'],
      tenantId: 'tenant-1',
    };
  };

  describe('Route Security & Authorization Gates', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      currentUserContext = null;

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-100' });

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('returns 401 Unauthorized when user account is disabled/inactive', async () => {
      asDisabledUser();

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-100' });

      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when authenticated user lacks required permission', async () => {
      asReadOnlyUser(); // Has only kinesiology.sessions.read

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-100' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/kinesiology/sessions', () => {
    it('returns 400 Bad Request when appointmentId is missing or empty', async () => {
      asTreatUser();

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: '   ' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/appointmentId is required/i);
    });

    it('returns 404 Not Found when appointment does not exist in scheduling', async () => {
      asTreatUser();

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'non-existent-appt' });

      expect(res.status).toBe(404);
    });

    it('returns 422 Unprocessable Entity when appointment is ineligible for treatment', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-ineligible',
        clientId: 'client-1',
        therapistId: 'therapist-1',
        scheduledAt: new Date(),
        isEligibleForSession: false,
        ineligibilityReason: 'Appointment status is CANCELLED',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-ineligible' });

      expect(res.status).toBe(422);
    });

    it('returns 201 Created when appointment is eligible and creates session', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-200',
        clientId: 'client-abc',
        therapistId: 'therapist-xyz',
        scheduledAt: new Date('2026-11-01T10:00:00Z'),
        isEligibleForSession: true,
      });

      const res = await request(app.getHttpServer()).post('/api/v1/kinesiology/sessions').send({
        appointmentId: 'appt-200',
        initialNotes: 'Client presenting with acute hamstring tightness',
        autoStart: false,
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.appointmentId).toBe('appt-200');
      expect(res.body.clientId).toBe('client-abc');
      expect(res.body.therapistId).toBe('therapist-xyz');
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('returns 409 Conflict when treatment session already exists for appointment', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-duplicate',
        clientId: 'client-dup',
        therapistId: 'therapist-dup',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      // First creation: 201
      const first = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-duplicate' });
      expect(first.status).toBe(201);

      // Second creation: 409 Conflict
      const second = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-duplicate' });
      expect(second.status).toBe(409);
    });
  });

  describe('GET /api/v1/kinesiology/sessions/:id', () => {
    it('returns 404 Not Found for non-existent session ID', async () => {
      asReadOnlyUser();

      const res = await request(app.getHttpServer()).get(
        '/api/v1/kinesiology/sessions/sess-nonexistent',
      );

      expect(res.status).toBe(404);
    });

    it('returns 200 OK and session details when session exists', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-get-test',
        clientId: 'client-get',
        therapistId: 'therapist-get',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-get-test' });
      const sessionId = createRes.body.id;

      asReadOnlyUser();
      const getRes = await request(app.getHttpServer()).get(
        `/api/v1/kinesiology/sessions/${sessionId}`,
      );

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(sessionId);
      expect(getRes.body.clientId).toBe('client-get');
    });
  });

  describe('POST /api/v1/kinesiology/sessions/:id/start', () => {
    it('starts a scheduled session and transitions to IN_PROGRESS', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-start-test',
        clientId: 'client-start',
        therapistId: 'therapist-start',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-start-test' });
      const sessionId = createRes.body.id;

      const startRes = await request(app.getHttpServer()).post(
        `/api/v1/kinesiology/sessions/${sessionId}/start`,
      );

      expect(startRes.status).toBe(200);
      expect(startRes.body.status).toBe('IN_PROGRESS');

      // Attempting to start already started session returns 422
      const duplicateStart = await request(app.getHttpServer()).post(
        `/api/v1/kinesiology/sessions/${sessionId}/start`,
      );
      expect(duplicateStart.status).toBe(422);
    });
  });

  describe('POST & PATCH /api/v1/kinesiology/sessions/:id/assign-therapist and therapist', () => {
    it('reassigns practitioner to session using POST and PATCH aliases', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-reassign-test',
        clientId: 'client-reassign',
        therapistId: 'therapist-orig',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-reassign-test' });
      const sessionId = createRes.body.id;

      // Requires kinesiology.sessions.assign
      asAssignUser();
      const assignRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${sessionId}/assign-therapist`)
        .send({ newTherapistId: 'therapist-new' });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.therapistId).toBe('therapist-new');

      // Check PATCH alias
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/kinesiology/sessions/${sessionId}/therapist`)
        .send({ newTherapistId: 'therapist-patch' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.therapistId).toBe('therapist-patch');
    });

    it('returns 400 Bad Request when newTherapistId is omitted', async () => {
      asAssignUser();
      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions/sess-any/assign-therapist')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PUT & PATCH /api/v1/kinesiology/sessions/:id/notes', () => {
    it('updates SOAP notes on an active treatment session', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-notes-test',
        clientId: 'client-notes',
        therapistId: 'therapist-notes',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-notes-test' });
      const sessionId = createRes.body.id;

      const putRes = await request(app.getHttpServer())
        .put(`/api/v1/kinesiology/sessions/${sessionId}/notes`)
        .send({
          subjective: 'Patient reports pain level 4/10',
          objective: 'Reduced lumbar flexion by 15 degrees',
          assessment: 'Quadratus lumborum strain',
          plan: 'Myofascial release and stretching protocol',
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.notes.assessment).toBe('Quadratus lumborum strain');
      expect(putRes.body.notes.subjective).toBe('Patient reports pain level 4/10');
    });
  });

  describe('POST /api/v1/kinesiology/sessions/:id/complete', () => {
    it('completes an in-progress treatment session', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-complete-test',
        clientId: 'client-complete',
        therapistId: 'therapist-complete',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-complete-test' });
      const sessionId = createRes.body.id;

      await request(app.getHttpServer()).post(`/api/v1/kinesiology/sessions/${sessionId}/start`);

      const completeRes = await request(app.getHttpServer()).post(
        `/api/v1/kinesiology/sessions/${sessionId}/complete`,
      );

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.status).toBe('COMPLETED');
    });
  });

  describe('POST /api/v1/kinesiology/sessions/:id/cancel', () => {
    it('returns 400 Bad Request when cancellation reason is missing', async () => {
      asTreatUser();
      const res = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions/sess-any/cancel')
        .send({});

      expect(res.status).toBe(400);
    });

    it('cancels scheduled session with provided reason', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-cancel-test',
        clientId: 'client-cancel',
        therapistId: 'therapist-cancel',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-cancel-test' });
      const sessionId = createRes.body.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/kinesiology/sessions/${sessionId}/cancel`)
        .send({ reason: 'Client requested reschedule due to emergency' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');
    });
  });

  describe('GET /api/v1/kinesiology/clients/:clientId/treatment-history', () => {
    it('returns 400 when dateFrom query param is malformed', async () => {
      asReadOnlyUser();
      const res = await request(app.getHttpServer()).get(
        '/api/v1/kinesiology/clients/client-hist/treatment-history?dateFrom=not-a-valid-date',
      );

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Invalid dateFrom/i);
    });

    it('returns 400 when status query param is invalid enum value', async () => {
      asReadOnlyUser();
      const res = await request(app.getHttpServer()).get(
        '/api/v1/kinesiology/clients/client-hist/treatment-history?status=INVALID_STATUS',
      );

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Invalid session status/i);
    });

    it('returns 200 OK with paginated list of client sessions', async () => {
      asTreatUser();
      appointmentLookup.setAppointment({
        appointmentId: 'appt-hist-1',
        clientId: 'client-target',
        therapistId: 'therapist-1',
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      await request(app.getHttpServer())
        .post('/api/v1/kinesiology/sessions')
        .send({ appointmentId: 'appt-hist-1' });

      asReadOnlyUser();
      const res = await request(app.getHttpServer()).get(
        '/api/v1/kinesiology/clients/client-target/treatment-history?page=1&limit=10',
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].clientId).toBe('client-target');
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });
  });
});
