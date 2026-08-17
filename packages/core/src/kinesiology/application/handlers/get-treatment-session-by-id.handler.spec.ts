import { GetTreatmentSessionByIdHandler } from './get-treatment-session-by-id.handler';
import { GetTreatmentSessionByIdQuery } from '../queries/get-treatment-session-by-id.query';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
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

describe('GetTreatmentSessionByIdHandler Unit Tests', () => {
  let repository: InMemoryTreatmentSessionRepository;
  let handler: GetTreatmentSessionByIdHandler;

  beforeEach(() => {
    repository = new InMemoryTreatmentSessionRepository();
    handler = new GetTreatmentSessionByIdHandler(repository);
  });

  it('should successfully return TreatmentSessionDTO for existing session', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    await repository.save(session);

    const query = new GetTreatmentSessionByIdQuery({ sessionId: 'sess_100' });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.id).toBe('sess_100');
    expect(dto.clientId).toBe('client_200');
    expect(dto.therapistId).toBe('therapist_300');
    expect(dto.appointmentId).toBe('appt_400');
    expect(dto.status).toBe(SessionStatus.SCHEDULED);
  });

  it('should fail when sessionId is empty', async () => {
    const query = new GetTreatmentSessionByIdQuery({ sessionId: '   ' });
    const result = await handler.execute(query);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty');
  });

  it('should fail when TreatmentSession is not found', async () => {
    const query = new GetTreatmentSessionByIdQuery({ sessionId: 'sess_missing' });
    const result = await handler.execute(query);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("TreatmentSession with ID 'sess_missing' not found");
  });
});
