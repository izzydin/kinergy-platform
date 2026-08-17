import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CancelTreatmentSessionCommand } from '../commands/cancel-treatment-session.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { Clock } from '../../domain/shared/clock';
import { DomainEventPublisher } from '../ports/domain-event-publisher.port';

export class CancelTreatmentSessionHandler implements CommandHandler<
  CancelTreatmentSessionCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly eventPublisher?: DomainEventPublisher,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: CancelTreatmentSessionCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { input } = command;

      if (!input.sessionId || input.sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }
      if (!input.reason || input.reason.trim().length === 0) {
        return ApplicationResult.fail('Cancellation reason cannot be empty.');
      }

      const sessionIdVo = SessionId.create(input.sessionId);
      const session = await this.sessionRepository.findById(sessionIdVo);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${input.sessionId}' not found.`);
      }

      session.cancel(input.reason, this.clock);

      await this.sessionRepository.save(session);

      if (this.eventPublisher && typeof session.pullEvents === 'function') {
        const events = session.pullEvents();
        for (const event of events) {
          try {
            await this.eventPublisher.publish(event);
          } catch (pubErr) {
            console.error('Failed to publish domain event:', pubErr);
          }
        }
      }

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
