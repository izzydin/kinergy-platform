import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateSessionNotesCommand } from '../commands/update-session-notes.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionNotes } from '../../domain/treatment-session/session-notes.vo';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { Clock } from '../../domain/shared/clock';

/**
 * CQRS Command Handler for updating clinical progress notes on a TreatmentSession.
 */
export class UpdateSessionNotesHandler implements CommandHandler<
  UpdateSessionNotesCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: UpdateSessionNotesCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { sessionId, notes } = command.input;

      if (!sessionId || sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      const sessionIdentifier = SessionId.create(sessionId.trim());
      const session = await this.sessionRepository.findById(sessionIdentifier);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${sessionId}' not found.`);
      }

      // Convert input to SessionNotes domain Value Object
      const sessionNotes = SessionNotes.create(notes);

      // Invoke aggregate method (enforces lifecycle invariants)
      session.updateNotes(sessionNotes, this.clock);

      // Persist aggregate state
      await this.sessionRepository.save(session);

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during session notes update.';
      return ApplicationResult.fail(errorMessage);
    }
  }
}
