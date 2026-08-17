import { CompleteTreatmentSessionHandler } from './complete-treatment-session.handler';
import { CompleteTreatmentSessionCommand } from '../commands/complete-treatment-session.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import { SessionNotes } from '../../domain/treatment-session/session-notes.vo';
import { TestClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { TreatmentSessionCompletedEvent } from '../../domain/events/treatment-session-completed.event';

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  public sessions = new Map<string, TreatmentSession>();

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.sessions.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(_appointmentId: string): Promise<TreatmentSession | null> {
    return null;
  }

  async save(session: TreatmentSession): Promise<void> {
    this.sessions.set(session.id.getValue(), session);
  }

  async findHistoryByClientId(): Promise<never> {
    throw new Error('Not used in test.');
  }
}

describe('CompleteTreatmentSessionHandler Unit Tests', () => {
  let repository: InMemoryTreatmentSessionRepository;
  let publishedEvents: DomainEvent[];
  let mockPublisher: { publish: (event: DomainEvent) => void };
  let clock: TestClock;
  let handler: CompleteTreatmentSessionHandler;

  beforeEach(() => {
    repository = new InMemoryTreatmentSessionRepository();
    publishedEvents = [];
    mockPublisher = {
      publish: (event: DomainEvent) => {
        publishedEvents.push(event);
      },
    };
    clock = new TestClock(new Date('2026-08-17T14:00:00.000Z'));
    handler = new CompleteTreatmentSessionHandler(repository, mockPublisher, clock);
  });

  function seedSession(status: SessionStatus = SessionStatus.IN_PROGRESS): TreatmentSession {
    const session = TreatmentSession.reconstitute({
      id: SessionId.create('sess_100'),
      version: 2,
      status,
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
      notes: SessionNotes.create({
        subjective: 'Patient feels relief',
        plan: 'Follow up in 1 month',
      }),
      createdAt: new Date('2026-08-17T13:00:00.000Z'),
      updatedAt: new Date('2026-08-17T13:30:00.000Z'),
    });
    repository.sessions.set(session.id.getValue(), session);
    return session;
  }

  it('should successfully complete an IN_PROGRESS session, save aggregate, and publish TreatmentSessionCompletedEvent', async () => {
    seedSession(SessionStatus.IN_PROGRESS);

    const command = new CompleteTreatmentSessionCommand({
      sessionId: 'sess_100',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe(SessionStatus.COMPLETED);
    expect(dto.version).toBe(3);
    expect(dto.updatedAt).toBe('2026-08-17T14:00:00.000Z');

    const saved = await repository.findById(SessionId.create('sess_100'));
    expect(saved?.status).toBe(SessionStatus.COMPLETED);
    expect(saved?.version).toBe(3);

    expect(publishedEvents).toHaveLength(1);
    const completedEvent = publishedEvents[0] as TreatmentSessionCompletedEvent;
    expect(completedEvent.eventType).toBe('TreatmentSessionCompleted');
    expect(completedEvent.payload.sessionId).toBe('sess_100');
    expect(completedEvent.payload.clientId).toBe('client_200');
    expect(completedEvent.payload.therapistId).toBe('therapist_300');
    expect(completedEvent.payload.appointmentId).toBe('appt_400');
  });

  it('should fail when sessionId is empty', async () => {
    const command = new CompleteTreatmentSessionCommand({ sessionId: '   ' });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty');
    expect(publishedEvents).toHaveLength(0);
  });

  it('should fail when TreatmentSession is not found in repository', async () => {
    const command = new CompleteTreatmentSessionCommand({
      sessionId: 'sess_missing',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("TreatmentSession with ID 'sess_missing' not found");
    expect(publishedEvents).toHaveLength(0);
  });

  it('should reject completion if session is not in IN_PROGRESS status (SCHEDULED)', async () => {
    seedSession(SessionStatus.SCHEDULED);

    const command = new CompleteTreatmentSessionCommand({
      sessionId: 'sess_100',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'IN_PROGRESS' status to be completed");
    expect(publishedEvents).toHaveLength(0);
  });

  it('should reject completion if session is already COMPLETED', async () => {
    seedSession(SessionStatus.COMPLETED);

    const command = new CompleteTreatmentSessionCommand({
      sessionId: 'sess_100',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'IN_PROGRESS' status to be completed");
    expect(publishedEvents).toHaveLength(0);
  });

  it('should preserve successful session completion even if event publication encounters an error (failure isolation)', async () => {
    seedSession(SessionStatus.IN_PROGRESS);

    // Mock publisher that throws an error
    const faultyPublisher = {
      publish: jest.fn().mockImplementation(() => {
        throw new Error('Event bus network timeout');
      }),
    };

    const resilientHandler = new CompleteTreatmentSessionHandler(
      repository,
      faultyPublisher,
      clock,
    );

    const command = new CompleteTreatmentSessionCommand({
      sessionId: 'sess_100',
    });

    const result = await resilientHandler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe(SessionStatus.COMPLETED);

    const saved = await repository.findById(SessionId.create('sess_100'));
    expect(saved?.status).toBe(SessionStatus.COMPLETED);
  });
});
