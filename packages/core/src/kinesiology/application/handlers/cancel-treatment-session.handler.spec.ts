import { CancelTreatmentSessionHandler } from './cancel-treatment-session.handler';
import { CancelTreatmentSessionCommand } from '../commands/cancel-treatment-session.command';
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

describe('CancelTreatmentSessionHandler Unit Tests', () => {
  let repository: InMemoryTreatmentSessionRepository;
  let handler: CancelTreatmentSessionHandler;

  beforeEach(() => {
    repository = new InMemoryTreatmentSessionRepository();
    handler = new CancelTreatmentSessionHandler(repository);
  });

  it('should successfully cancel a SCHEDULED session with a valid reason', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    await repository.save(session);

    const command = new CancelTreatmentSessionCommand({
      sessionId: 'sess_100',
      reason: 'Patient requested rescheduling',
    });
    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe(SessionStatus.CANCELLED);
    expect(dto.cancellationReason).toBe('Patient requested rescheduling');
    expect(dto.version).toBe(2);
  });

  it('should reject cancelling an IN_PROGRESS session', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    session.start();
    await repository.save(session);

    const command = new CancelTreatmentSessionCommand({
      sessionId: 'sess_100',
      reason: 'Emergency interruption',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'SCHEDULED' status to be cancelled");
  });

  it('should fail when cancellation reason is empty', async () => {
    const command = new CancelTreatmentSessionCommand({
      sessionId: 'sess_100',
      reason: '   ',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Cancellation reason cannot be empty');
  });

  it('should reject cancelling an already COMPLETED session', async () => {
    const session = TreatmentSession.create({
      id: SessionId.create('sess_100'),
      clientId: 'client_200',
      therapistId: 'therapist_300',
      appointmentId: 'appt_400',
    });
    session.start();
    session.complete();
    await repository.save(session);

    const command = new CancelTreatmentSessionCommand({
      sessionId: 'sess_100',
      reason: 'Late cancellation attempt',
    });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'SCHEDULED' status to be cancelled");
  });
});
