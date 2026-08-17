import { StartTreatmentSessionHandler } from './start-treatment-session.handler';
import { StartTreatmentSessionCommand } from '../commands/start-treatment-session.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import { DomainEvent } from '../../domain/shared/domain-event';
import { PaginatedTreatmentHistoryDTO } from '../dtos/treatment-history-summary.dto';

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private readonly store = new Map<string, TreatmentSession>();

  async save(session: TreatmentSession): Promise<void> {
    this.store.set(session.id.getValue(), session);
  }

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.store.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.store.values()) {
      if (session.appointmentId === appointmentId) {
        return session;
      }
    }
    return null;
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

describe('StartTreatmentSessionHandler Unit Tests', () => {
  let repository: InMemoryTreatmentSessionRepository;
  let publishedEvents: DomainEvent[];
  let handler: StartTreatmentSessionHandler;

  beforeEach(() => {
    repository = new InMemoryTreatmentSessionRepository();
    publishedEvents = [];
    const eventPublisher = {
      publish: jest.fn().mockImplementation(async (event: DomainEvent) => {
        publishedEvents.push(event);
      }),
    };
    handler = new StartTreatmentSessionHandler(repository, eventPublisher);
  });

  it('should successfully transition a SCHEDULED session to IN_PROGRESS', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    await repository.save(session);

    const command = new StartTreatmentSessionCommand({ sessionId: 'sess_100' });
    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe(SessionStatus.IN_PROGRESS);
    expect(dto.version).toBe(2);

    const saved = await repository.findById(SessionId.create('sess_100'));
    expect(saved?.status).toBe(SessionStatus.IN_PROGRESS);
    expect(publishedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should fail when sessionId is empty', async () => {
    const command = new StartTreatmentSessionCommand({ sessionId: '   ' });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty');
  });

  it('should fail when TreatmentSession is not found', async () => {
    const command = new StartTreatmentSessionCommand({ sessionId: 'sess_missing' });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("TreatmentSession with ID 'sess_missing' not found");
  });

  it('should reject starting an already COMPLETED session', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    session.start();
    session.complete();
    await repository.save(session);

    const command = new StartTreatmentSessionCommand({ sessionId: 'sess_100' });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'SCHEDULED' status to be started");
  });
});
