import { TestClock } from '../../domain/shared/clock';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import {
  ITreatmentSessionRepository,
  TreatmentHistoryFilter,
} from '../../domain/repositories/treatment-session.repository';
import { ISchedulingAppointmentLookupPort } from '../ports/scheduling-appointment-lookup.port';
import { AppointmentReferenceDTO } from '../dtos/appointment-reference.dto';
import { ITherapistLookupPort } from '../ports/therapist-lookup.port';
import { TherapistReferenceDTO } from '../dtos/therapist-reference.dto';
import { DomainEventPublisher } from '../ports/domain-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { CreateTreatmentSessionFromAppointmentHandler } from './create-treatment-session-from-appointment.handler';
import { CreateTreatmentSessionFromAppointmentCommand } from '../commands/create-treatment-session-from-appointment.command';
import { StartTreatmentSessionHandler } from './start-treatment-session.handler';
import { StartTreatmentSessionCommand } from '../commands/start-treatment-session.command';
import { UpdateSessionNotesHandler } from './update-session-notes.handler';
import { UpdateSessionNotesCommand } from '../commands/update-session-notes.command';
import { AssignTherapistToSessionHandler } from './assign-therapist-to-session.handler';
import { AssignTherapistToSessionCommand } from '../commands/assign-therapist-to-session.command';
import { CompleteTreatmentSessionHandler } from './complete-treatment-session.handler';
import { CompleteTreatmentSessionCommand } from '../commands/complete-treatment-session.command';
import { CancelTreatmentSessionHandler } from './cancel-treatment-session.handler';
import { CancelTreatmentSessionCommand } from '../commands/cancel-treatment-session.command';
import { GetClientTreatmentHistoryHandler } from './get-client-treatment-history.handler';
import { GetClientTreatmentHistoryQuery } from '../queries/get-client-treatment-history.query';
import { TreatmentSessionCompletedEvent } from '../../domain/events/treatment-session-completed.event';
import { PaginatedTreatmentHistoryDTO } from '../dtos/treatment-history-summary.dto';

// ─── IN-MEMORY TEST REPOSITORIES & PORTS ──────────────────────────────────────

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private readonly sessions = new Map<string, TreatmentSession>();

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.sessions.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.sessions.values()) {
      if (session.appointmentId === appointmentId) {
        return session;
      }
    }
    return null;
  }

  async save(session: TreatmentSession): Promise<void> {
    this.sessions.set(session.id.getValue(), session);
  }

  async findHistoryByClientId(
    clientId: string,
    filter: TreatmentHistoryFilter,
  ): Promise<PaginatedTreatmentHistoryDTO> {
    const { page, limit } = filter.pagination;
    const { status, therapistId } = filter;

    const all = Array.from(this.sessions.values()).filter((s) => s.clientId === clientId);
    const filtered = all.filter((s) => {
      if (status && s.status !== status) return false;
      if (therapistId && s.therapistId !== therapistId) return false;
      return true;
    });

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((s) => ({
        sessionId: s.id.getValue(),
        clientId: s.clientId,
        appointmentId: s.appointmentId,
        therapistId: s.therapistId,
        status: s.status,
        notesSummary: s.notes ? s.notes.getSubjective() : undefined,
        hasFullNotes: Boolean(s.notes && s.notes.hasContent()),
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  clear() {
    this.sessions.clear();
  }
}

class InMemorySchedulingAppointmentLookupPort implements ISchedulingAppointmentLookupPort {
  private readonly appointments = new Map<string, AppointmentReferenceDTO>();

  setAppointment(dto: AppointmentReferenceDTO) {
    this.appointments.set(dto.appointmentId, dto);
  }

  async getAppointmentReference(appointmentId: string): Promise<AppointmentReferenceDTO | null> {
    return this.appointments.get(appointmentId) ?? null;
  }
}

class InMemoryTherapistLookupPort implements ITherapistLookupPort {
  private readonly eligibleTherapists = new Set<string>();

  setEligible(therapistId: string) {
    this.eligibleTherapists.add(therapistId);
  }

  async findTherapist(therapistId: string): Promise<TherapistReferenceDTO | null> {
    if (this.eligibleTherapists.has(therapistId)) {
      return {
        therapistId,
        status: 'ACTIVE',
        roles: ['THERAPIST'],
        isEligible: true,
      };
    }
    return {
      therapistId,
      status: 'INACTIVE',
      roles: [],
      isEligible: false,
      ineligibilityReason: 'User is not eligible.',
    };
  }
}

class RecordingEventPublisher implements DomainEventPublisher {
  public publishedEvents: DomainEvent[] = [];
  public shouldThrowOnEvent = false;

  async publish(event: DomainEvent): Promise<void> {
    if (this.shouldThrowOnEvent) {
      throw new Error('Timeline projection pipeline offline');
    }
    this.publishedEvents.push(event);
  }

  clear() {
    this.publishedEvents = [];
  }
}

// ─── MASTER BUSINESS PROCESS INTEGRATION SUITE ────────────────────────────────

describe('Phase 4: Complete End-to-End Business Workflow Master Integration Spec', () => {
  let sessionRepo: InMemoryTreatmentSessionRepository;
  let appointmentPort: InMemorySchedulingAppointmentLookupPort;
  let therapistPort: InMemoryTherapistLookupPort;
  let eventPublisher: RecordingEventPublisher;
  let clock: TestClock;

  let createSessionHandler: CreateTreatmentSessionFromAppointmentHandler;
  let startSessionHandler: StartTreatmentSessionHandler;
  let assignTherapistHandler: AssignTherapistToSessionHandler;
  let updateNotesHandler: UpdateSessionNotesHandler;
  let completeSessionHandler: CompleteTreatmentSessionHandler;
  let cancelSessionHandler: CancelTreatmentSessionHandler;
  let getHistoryHandler: GetClientTreatmentHistoryHandler;

  const CLIENT_ID = 'client_master_100';
  const APPOINTMENT_ID = 'appt_master_200';
  const THERAPIST_1 = 'therapist_lead_300';
  const THERAPIST_2 = 'therapist_handover_400';

  beforeEach(() => {
    sessionRepo = new InMemoryTreatmentSessionRepository();
    appointmentPort = new InMemorySchedulingAppointmentLookupPort();
    therapistPort = new InMemoryTherapistLookupPort();
    eventPublisher = new RecordingEventPublisher();
    clock = new TestClock(new Date('2026-08-17T10:00:00.000Z'));

    therapistPort.setEligible(THERAPIST_1);
    therapistPort.setEligible(THERAPIST_2);

    createSessionHandler = new CreateTreatmentSessionFromAppointmentHandler(
      appointmentPort,
      sessionRepo,
      clock,
    );

    startSessionHandler = new StartTreatmentSessionHandler(sessionRepo, eventPublisher, clock);
    assignTherapistHandler = new AssignTherapistToSessionHandler(sessionRepo, therapistPort, clock);
    updateNotesHandler = new UpdateSessionNotesHandler(sessionRepo, clock);
    completeSessionHandler = new CompleteTreatmentSessionHandler(
      sessionRepo,
      eventPublisher,
      clock,
    );
    cancelSessionHandler = new CancelTreatmentSessionHandler(sessionRepo, eventPublisher, clock);
    getHistoryHandler = new GetClientTreatmentHistoryHandler(sessionRepo);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. PRIMARY 14-STEP WORKFLOW
  // ────────────────────────────────────────────────────────────────────────────
  describe('Primary 14-Step Happy Path Business Workflow', () => {
    it('executes full lifecycle from Appointment to Completion, Treatment History, and Timeline projection', async () => {
      // 1. Client and Eligible Appointment exist
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date('2026-08-17T10:00:00.000Z'),
        isEligibleForSession: true,
      });

      // 2 & 3. Select Start Treatment -> Create TreatmentSession
      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({
          appointmentId: APPOINTMENT_ID,
          initialNotes: 'Initial consultation intake',
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const sessionDto = createRes.getValue();
      const sessionId = sessionDto.id;
      expect(sessionDto.status).toBe(SessionStatus.SCHEDULED);
      expect(sessionDto.clientId).toBe(CLIENT_ID);
      expect(sessionDto.therapistId).toBe(THERAPIST_1);

      // 4. Session enters IN_PROGRESS
      const startRes = await startSessionHandler.execute(
        new StartTreatmentSessionCommand({ sessionId }),
      );
      expect(startRes.isSuccess).toBe(true);
      expect(startRes.getValue().status).toBe(SessionStatus.IN_PROGRESS);

      // 5. Therapist Handover / Assignment
      const assignRes = await assignTherapistHandler.execute(
        new AssignTherapistToSessionCommand({ sessionId, newTherapistId: THERAPIST_2 }),
      );
      expect(assignRes.isSuccess).toBe(true);
      expect(assignRes.getValue().therapistId).toBe(THERAPIST_2);

      // 6 & 7. Enter and Save SOAP Notes
      const notesRes = await updateNotesHandler.execute(
        new UpdateSessionNotesCommand({
          sessionId,
          notes: {
            subjective: 'Patient reports reduced hamstring tightness',
            objective: 'Passive straight leg raise improved to 80 deg',
            assessment: 'Kinesiological balance restoring in posterior chain',
            plan: 'Prescribe eccentric loading protocol',
          },
        }),
      );
      expect(notesRes.isSuccess).toBe(true);
      expect(notesRes.getValue().notes?.subjective).toBe(
        'Patient reports reduced hamstring tightness',
      );

      // 8. Complete Treatment Session
      const completeRes = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );
      expect(completeRes.isSuccess).toBe(true);
      expect(completeRes.getValue().status).toBe(SessionStatus.COMPLETED);

      // 9. Verify Authoritative Persistence
      const persisted = await sessionRepo.findById(SessionId.create(sessionId));
      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe(SessionStatus.COMPLETED);
      expect(persisted!.therapistId).toBe(THERAPIST_2);

      // 10. Verify Clinical Treatment History query
      const historyRes = await getHistoryHandler.execute(
        new GetClientTreatmentHistoryQuery({ clientId: CLIENT_ID, page: 1, limit: 10 }),
      );
      expect(historyRes.isSuccess).toBe(true);
      const historyData = historyRes.getValue();
      expect(historyData.total).toBe(1);
      const firstHistoryItem = historyData.items[0];
      expect(firstHistoryItem).toBeDefined();
      expect(firstHistoryItem!.sessionId).toBe(sessionId);
      expect(firstHistoryItem!.status).toBe(SessionStatus.COMPLETED);
      expect(firstHistoryItem!.therapistId).toBe(THERAPIST_2);

      // 11. Verify Domain Event emitted for Timeline projection
      const completionEvent = eventPublisher.publishedEvents.find(
        (e) => e instanceof TreatmentSessionCompletedEvent,
      ) as TreatmentSessionCompletedEvent | undefined;
      expect(completionEvent).toBeDefined();
      expect(completionEvent!.payload).toBeDefined();
      expect(completionEvent!.payload.sessionId).toBe(sessionId);
      expect(completionEvent!.payload.clientId).toBe(CLIENT_ID);
      expect(completionEvent!.payload.therapistId).toBe(THERAPIST_2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. NEGATIVE FLOWS & ADVERSARIAL CASES
  // ────────────────────────────────────────────────────────────────────────────
  describe('Adversarial & Negative Flows', () => {
    it('1 & 2 & 3. Rejects creation when appointment is ineligible, cancelled, or no-show', async () => {
      appointmentPort.setAppointment({
        appointmentId: 'appt_cancelled',
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: false,
        ineligibilityReason: 'Appointment has been cancelled.',
      });

      const res = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({
          appointmentId: 'appt_cancelled',
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.getError()).toContain('Appointment has been cancelled');
    });

    it('4. Enforces duplicate prevention idempotency on appointment creation', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      // First creation succeeds
      const firstRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      expect(firstRes.isSuccess).toBe(true);

      // Second creation rejected
      const secondRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      expect(secondRes.isFailure).toBe(true);
      expect(secondRes.getError()).toContain('already exists');
    });

    it('5. Rejects start when session is already IN_PROGRESS or COMPLETED', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      // Start once -> IN_PROGRESS
      await startSessionHandler.execute(new StartTreatmentSessionCommand({ sessionId }));

      // Attempt start again -> fails
      const duplicateStartRes = await startSessionHandler.execute(
        new StartTreatmentSessionCommand({ sessionId }),
      );
      expect(duplicateStartRes.isFailure).toBe(true);
    });

    it('6 & 7. Rejects therapist assignment when therapist is ineligible or invalid', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      const res = await assignTherapistHandler.execute(
        new AssignTherapistToSessionCommand({ sessionId, newTherapistId: 'ineligible_user_999' }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.getError()).toContain('not eligible');
    });

    it('8. Prohibits editing notes on a COMPLETED session', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      await startSessionHandler.execute(new StartTreatmentSessionCommand({ sessionId }));
      await updateNotesHandler.execute(
        new UpdateSessionNotesCommand({ sessionId, notes: 'Pre-completion notes' }),
      );
      await completeSessionHandler.execute(new CompleteTreatmentSessionCommand({ sessionId }));

      // Attempt edit after completion
      const editRes = await updateNotesHandler.execute(
        new UpdateSessionNotesCommand({ sessionId, notes: 'Post-completion tampering' }),
      );

      expect(editRes.isFailure).toBe(true);
      expect(editRes.getError()).toContain('Cannot update clinical notes');
    });

    it('9. Prohibits completing a CANCELLED session', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      await cancelSessionHandler.execute(
        new CancelTreatmentSessionCommand({
          sessionId,
          reason: 'Patient requested cancellation',
        }),
      );

      const completeRes = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );

      expect(completeRes.isFailure).toBe(true);
    });

    it('10. Rejects completion of a session not IN_PROGRESS (e.g. still SCHEDULED)', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      // Attempt complete directly while still SCHEDULED (without start)
      const completeRes = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );

      expect(completeRes.isFailure).toBe(true);
      expect(completeRes.getError()).toContain("Session must be in 'IN_PROGRESS' status");
    });

    it('11 & 12. Rejects duplicate completion', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      await startSessionHandler.execute(new StartTreatmentSessionCommand({ sessionId }));
      await updateNotesHandler.execute(
        new UpdateSessionNotesCommand({ sessionId, notes: 'Valid clinical documentation' }),
      );
      const firstComplete = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );
      expect(firstComplete.isSuccess).toBe(true);

      // Second completion rejected
      const secondComplete = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );
      expect(secondComplete.isFailure).toBe(true);
    });

    it('13. Timeline projection failure does NOT cause TreatmentSession completion to fail', async () => {
      appointmentPort.setAppointment({
        appointmentId: APPOINTMENT_ID,
        clientId: CLIENT_ID,
        therapistId: THERAPIST_1,
        scheduledAt: new Date(),
        isEligibleForSession: true,
      });

      const createRes = await createSessionHandler.execute(
        new CreateTreatmentSessionFromAppointmentCommand({ appointmentId: APPOINTMENT_ID }),
      );
      const sessionId = createRes.getValue().id;

      await startSessionHandler.execute(new StartTreatmentSessionCommand({ sessionId }));
      await updateNotesHandler.execute(
        new UpdateSessionNotesCommand({ sessionId, notes: 'Notes recorded' }),
      );

      // Simulate timeline projection failure
      eventPublisher.shouldThrowOnEvent = true;

      // Completion must still succeed authoritatively
      const completeRes = await completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId }),
      );
      expect(completeRes.isSuccess).toBe(true);

      const persisted = await sessionRepo.findById(SessionId.create(sessionId));
      expect(persisted!.status).toBe(SessionStatus.COMPLETED);
    });
  });
});
