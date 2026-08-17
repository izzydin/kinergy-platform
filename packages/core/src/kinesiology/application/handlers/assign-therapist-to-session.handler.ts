import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { AssignTherapistToSessionCommand } from '../commands/assign-therapist-to-session.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { Clock } from '../../domain/shared/clock';

/**
 * CQRS Command Handler for reassigning a practitioner to an active TreatmentSession.
 */
export class AssignTherapistToSessionHandler implements CommandHandler<
  AssignTherapistToSessionCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly clock?: Clock,
  ) {}

  public async execute(
    command: AssignTherapistToSessionCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { sessionId, newTherapistId } = command.input;

      if (!sessionId || sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      if (!newTherapistId || newTherapistId.trim().length === 0) {
        return ApplicationResult.fail('New Therapist ID cannot be empty.');
      }

      const sessionIdentifier = SessionId.create(sessionId.trim());
      const session = await this.sessionRepository.findById(sessionIdentifier);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${sessionId}' not found.`);
      }

      // Idempotent no-op if same therapist is already assigned
      if (session.therapistId === newTherapistId.trim()) {
        return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
      }

      // Reassign therapist on aggregate
      session.assignTherapist(newTherapistId.trim(), this.clock);

      // Persist aggregate state
      await this.sessionRepository.save(session);

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during therapist assignment.';
      return ApplicationResult.fail(errorMessage);
    }
  }
}
