import { UpdateSessionNotesHandler } from './update-session-notes.handler';
import { UpdateSessionNotesCommand } from '../commands/update-session-notes.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { TestClock } from '../../domain/shared/clock';
import { MAX_NOTE_SECTION_LENGTH } from '../../domain/treatment-session/session-notes.vo';
import { PaginatedTreatmentHistoryDTO } from '../dtos/treatment-history-summary.dto';

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

  async findHistoryByClientId(): Promise<PaginatedTreatmentHistoryDTO> {
    return {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }
}

describe('UpdateSessionNotesHandler', () => {
  let sessionRepository: InMemoryTreatmentSessionRepository;
  let handler: UpdateSessionNotesHandler;
  let clock: TestClock;
  const now = new Date('2026-08-17T10:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(now);
    sessionRepository = new InMemoryTreatmentSessionRepository();
    handler = new UpdateSessionNotesHandler(sessionRepository, clock);
  });

  const createTestSession = async (
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' = 'SCHEDULED',
  ): Promise<TreatmentSession> => {
    const session = TreatmentSession.create(
      {
        clientId: 'client_uuid_100',
        therapistId: 'therapist_uuid_200',
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

  it('should successfully update structured SOAP notes for a SCHEDULED session', async () => {
    const session = await createTestSession('SCHEDULED');

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: {
        subjective: 'Initial patient intake: lumbar tension.',
        plan: 'Trigger point release.',
      },
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.notes.subjective).toBe('Initial patient intake: lumbar tension.');
    expect(dto.notes.plan).toBe('Trigger point release.');
    expect(dto.version).toBe(2);

    const persisted = await sessionRepository.findById(session.id);
    expect(persisted?.notes.getSubjective()).toBe('Initial patient intake: lumbar tension.');
    expect(persisted?.version).toBe(2);
  });

  it('should successfully update notes for an IN_PROGRESS session', async () => {
    const session = await createTestSession('IN_PROGRESS');
    expect(session.version).toBe(2);

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: {
        subjective: 'Pain resolved during treatment.',
        objective: 'Full ROM restored.',
        assessment: 'Good recovery.',
        plan: 'Follow up as needed.',
      },
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.notes.objective).toBe('Full ROM restored.');
    expect(dto.version).toBe(3);
  });

  it('should accept raw text notes input', async () => {
    const session = await createTestSession('SCHEDULED');

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: 'General observation notes in free text format.',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.notes.rawText).toBe('General observation notes in free text format.');
  });

  it('should reject note update if session is not found', async () => {
    const command = new UpdateSessionNotesCommand({
      sessionId: 'sess_non_existent',
      notes: 'Some notes',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("TreatmentSession with ID 'sess_non_existent' not found.");
  });

  it('should reject note update if session ID is empty', async () => {
    const command = new UpdateSessionNotesCommand({
      sessionId: '   ',
      notes: 'Some notes',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty.');
  });

  it('should reject note update if section exceeds maximum character length', async () => {
    const session = await createTestSession('SCHEDULED');
    const oversized = 'x'.repeat(MAX_NOTE_SECTION_LENGTH + 1);

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: {
        subjective: oversized,
      },
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      `Subjective note section cannot exceed ${MAX_NOTE_SECTION_LENGTH} characters.`,
    );
  });

  it('should reject note update when session is in COMPLETED terminal status', async () => {
    const session = await createTestSession('COMPLETED');

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: 'Attempting edit on completed session',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      "Cannot update clinical notes for a session in 'COMPLETED' status",
    );
  });

  it('should reject note update when session is in CANCELLED terminal status', async () => {
    const session = await createTestSession('CANCELLED');

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: 'Attempting edit on cancelled session',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      "Cannot update clinical notes for a session in 'CANCELLED' status",
    );
  });

  it('should reject note update when session is in NO_SHOW terminal status', async () => {
    const session = await createTestSession('NO_SHOW');

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: 'Attempting edit on no-show session',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain(
      "Cannot update clinical notes for a session in 'NO_SHOW' status",
    );
  });

  it('should handle repository save failures cleanly without unhandled exceptions', async () => {
    const session = await createTestSession('SCHEDULED');
    jest
      .spyOn(sessionRepository, 'save')
      .mockRejectedValueOnce(new Error('Database deadlock occurred'));

    const command = new UpdateSessionNotesCommand({
      sessionId: session.id.getValue(),
      notes: 'Valid notes',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe('Database deadlock occurred');
  });
});
