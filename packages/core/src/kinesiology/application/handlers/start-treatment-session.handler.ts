import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { StartTreatmentSessionCommand } from '../commands/start-treatment-session.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { Clock } from '../../domain/shared/clock';
import { DomainEventPublisher } from '../ports/domain-event-publisher.port';

export class StartTreatmentSessionHandler implements CommandHandler<
  StartTreatmentSessionCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly eventPublisher?: DomainEventPublisher,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: StartTreatmentSessionCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { input } = command;

      if (!input.sessionId || input.sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      const sessionIdVo = SessionId.create(input.sessionId);
      const session = await this.sessionRepository.findById(sessionIdVo);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${input.sessionId}' not found.`);
      }

      session.start(this.clock);

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
