import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CompleteTreatmentSessionCommand } from '../commands/complete-treatment-session.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { Clock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void> | void;
}

/**
 * CQRS Command Handler for marking a TreatmentSession as COMPLETED and publishing integration/domain events.
 */
export class CompleteTreatmentSessionHandler implements CommandHandler<
  CompleteTreatmentSessionCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly eventPublisher?: DomainEventPublisher,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: CompleteTreatmentSessionCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { sessionId } = command.input;

      if (!sessionId || sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      const sessionIdentifier = SessionId.create(sessionId.trim());
      const session = await this.sessionRepository.findById(sessionIdentifier);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${sessionId}' not found.`);
      }

      // Execute completion business method on aggregate
      session.complete(this.clock);

      // Persist aggregate state
      await this.sessionRepository.save(session);

      // Pull recorded domain events and publish
      const events = session.pullEvents();
      if (this.eventPublisher && events.length > 0) {
        for (const event of events) {
          try {
            await this.eventPublisher.publish(event);
          } catch (error) {
            // Structured warning without rolling back successful completion
            console.error(`Error publishing domain event '${event.eventType}':`, error);
          }
        }
      }

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error during treatment session completion.';
      return ApplicationResult.fail(errorMessage);
    }
  }
}
