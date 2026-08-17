import { MarkTreatmentSessionNoShowHandler } from './mark-treatment-session-no-show.handler';
import { MarkTreatmentSessionNoShowCommand } from '../commands/mark-treatment-session-no-show.command';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import { TestClock } from '../../domain/shared/clock';
import { DomainEventPublisher } from '../ports/domain-event-publisher.port';
import { TreatmentSessionNoShowEvent } from '../../domain/events/treatment-session-no-show.event';

describe('MarkTreatmentSessionNoShowHandler', () => {
  let sessionRepository: jest.Mocked<ITreatmentSessionRepository>;
  let eventPublisher: jest.Mocked<DomainEventPublisher>;
  let clock: TestClock;
  let handler: MarkTreatmentSessionNoShowHandler;

  const validSessionId = 'sess_12345678-1234-1234-1234-123456789abc';

  beforeEach(() => {
    sessionRepository = {
      findById: jest.fn(),
      findByAppointmentId: jest.fn(),
      save: jest.fn(),
      findHistoryByClientId: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    clock = new TestClock(new Date('2026-08-17T10:00:00.000Z'));

    handler = new MarkTreatmentSessionNoShowHandler(sessionRepository, eventPublisher, clock);
  });

  it('should successfully mark a SCHEDULED session as NO_SHOW and publish event', async () => {
    const session = TreatmentSession.create(
      {
        id: SessionId.create(validSessionId),
        clientId: 'client_100',
        therapistId: 'therapist_200',
        appointmentId: 'appt_300',
      },
      clock,
    );
    session.clearEvents();

    sessionRepository.findById.mockResolvedValue(session);
    sessionRepository.save.mockResolvedValue(undefined);

    const command = new MarkTreatmentSessionNoShowCommand({ sessionId: validSessionId });
    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe(SessionStatus.NO_SHOW);
    expect(dto.version).toBe(2);
    expect(sessionRepository.save).toHaveBeenCalledWith(session);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(TreatmentSessionNoShowEvent));
  });

  it('should return failure if session ID is empty', async () => {
    const command = new MarkTreatmentSessionNoShowCommand({ sessionId: '' });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Session ID cannot be empty');
  });

  it('should return failure if session is not found in repository', async () => {
    sessionRepository.findById.mockResolvedValue(null);

    const command = new MarkTreatmentSessionNoShowCommand({ sessionId: validSessionId });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('not found');
  });

  it('should return failure if session is in invalid status for no-show', async () => {
    const session = TreatmentSession.create(
      {
        id: SessionId.create(validSessionId),
        clientId: 'client_100',
        therapistId: 'therapist_200',
        appointmentId: 'appt_300',
      },
      clock,
    );
    session.start(clock);
    session.clearEvents();

    sessionRepository.findById.mockResolvedValue(session);

    const command = new MarkTreatmentSessionNoShowCommand({ sessionId: validSessionId });
    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain("Session must be in 'SCHEDULED' status");
  });
});
