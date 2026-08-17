import { AssignTherapistToSessionHandler } from './assign-therapist-to-session.handler';
import { AssignTherapistToSessionCommand } from '../commands/assign-therapist-to-session.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { TestClock } from '../../domain/shared/clock';

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private sessions = new Map<string, TreatmentSession>();

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
}

describe('AssignTherapistToSessionHandler', () => {
  let sessionRepository: InMemoryTreatmentSessionRepository;
  let handler: AssignTherapistToSessionHandler;
  let clock: TestClock;
  const now = new Date('2026-08-17T10:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(now);
    sessionRepository = new InMemoryTreatmentSessionRepository();
    handler = new AssignTherapistToSessionHandler(sessionRepository, clock);
  });

  const createTestSession = async (
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' = 'SCHEDULED',
    therapistId = 'therapist_initial_100',
  ): Promise<TreatmentSession> => {
    const session = TreatmentSession.create(
      {
        clientId: 'client_uuid_100',
        therapistId,
        appointmentId: `appt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      },
      clock,
    );

    if (status === 'IN_PROGRESS') {
      session.start(clock);
    } else if (status === 'COMPLETED') {
      session.start(clock);
      session.complete(clock);
    } else if (status === 'CANCELLED') {
      session.cancel('Cancelled for test', clock);
    } else if (status === 'NO_SHOW') {
      session.markAsNoShow(clock);
    }

    await sessionRepository.save(session);
    return session;
  };

  it('should successfully reassign therapist for a SCHEDULED session', async () => {
    const session = await createTestSession('SCHEDULED');

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: 'therapist_new_200',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.therapistId).toBe('therapist_new_200');
    expect(dto.version).toBe(2);

    const persisted = await sessionRepository.findById(session.id);
    expect(persisted?.therapistId).toBe('therapist_new_200');
    expect(persisted?.version).toBe(2);
  });

  it('should successfully reassign therapist for an IN_PROGRESS session (clinical handover)', async () => {
    const session = await createTestSession('IN_PROGRESS');
    expect(session.version).toBe(2);

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: 'therapist_handover_300',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.therapistId).toBe('therapist_handover_300');
    expect(dto.status).toBe('IN_PROGRESS');
    expect(dto.version).toBe(3);
  });

  it('should be an idempotent no-op when assigning the exact same therapist', async () => {
    const session = await createTestSession('SCHEDULED', 'therapist_same_100');
    expect(session.version).toBe(1);

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: 'therapist_same_100',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.therapistId).toBe('therapist_same_100');
    expect(dto.version).toBe(1); // Version not bumped on no-op
  });

  it('should reject reassignment if session is not found', async () => {
    const command = new AssignTherapistToSessionCommand({
      sessionId: 'sess_non_existent',
      newTherapistId: 'therapist_new_200',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("TreatmentSession with ID 'sess_non_existent' not found.");
  });

  it('should reject reassignment if session ID is empty', async () => {
    const command = new AssignTherapistToSessionCommand({
      sessionId: '   ',
      newTherapistId: 'therapist_new_200',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty.');
  });

  it('should reject reassignment if new therapist ID is empty', async () => {
    const session = await createTestSession('SCHEDULED');

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: '   ',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('New Therapist ID cannot be empty.');
  });

  it('should reject reassignment when session is in COMPLETED terminal status', async () => {
    const session = await createTestSession('COMPLETED');

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: 'therapist_new_200',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      "Cannot reassign therapist for a session in 'COMPLETED' terminal status",
    );
  });

  it('should reject reassignment when session is in CANCELLED terminal status', async () => {
    const session = await createTestSession('CANCELLED');

    const command = new AssignTherapistToSessionCommand({
      sessionId: session.id.getValue(),
      newTherapistId: 'therapist_new_200',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      "Cannot reassign therapist for a session in 'CANCELLED' terminal status",
    );
  });
});
