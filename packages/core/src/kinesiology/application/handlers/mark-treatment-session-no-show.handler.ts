import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { MarkTreatmentSessionNoShowCommand } from '../commands/mark-treatment-session-no-show.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { Clock } from '../../domain/shared/clock';
import { DomainEventPublisher } from '../ports/domain-event-publisher.port';

export class MarkTreatmentSessionNoShowHandler implements CommandHandler<
  MarkTreatmentSessionNoShowCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly eventPublisher?: DomainEventPublisher,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: MarkTreatmentSessionNoShowCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { input } = command;

      if (!input.sessionId || input.sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      let sessionId: SessionId;
      try {
        sessionId = SessionId.create(input.sessionId.trim());
      } catch (err: unknown) {
        const error = err as Error;
        return ApplicationResult.fail(error.message);
      }

      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        return ApplicationResult.fail(`Treatment session with ID '${input.sessionId}' not found.`);
      }

      try {
        session.markAsNoShow(this.clock);
      } catch (err: unknown) {
        const error = err as Error;
        return ApplicationResult.fail(error.message);
      }

      await this.sessionRepository.save(session);

      if (this.eventPublisher) {
        const events = session.getUncommittedEvents();
        for (const event of events) {
          try {
            await this.eventPublisher.publish(event);
          } catch (error) {
            console.error(`Error publishing domain event '${event.eventType}':`, error);
          }
        }
      }

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (err: unknown) {
      const error = err as Error;
      return ApplicationResult.fail(error.message || 'An unexpected error occurred.');
    }
  }
}
