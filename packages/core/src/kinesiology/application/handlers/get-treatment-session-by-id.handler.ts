import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetTreatmentSessionByIdQuery } from '../queries/get-treatment-session-by-id.query';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { SessionId } from '../../domain/treatment-session/session-id.vo';

export class GetTreatmentSessionByIdHandler implements QueryHandler<
  GetTreatmentSessionByIdQuery,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(private readonly sessionRepository: ITreatmentSessionRepository) {}

  public async execute(
    query: GetTreatmentSessionByIdQuery,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { input } = query;

      if (!input.sessionId || input.sessionId.trim().length === 0) {
        return ApplicationResult.fail('Session ID cannot be empty.');
      }

      const sessionIdVo = SessionId.create(input.sessionId);
      const session = await this.sessionRepository.findById(sessionIdVo);

      if (!session) {
        return ApplicationResult.fail(`TreatmentSession with ID '${input.sessionId}' not found.`);
      }

      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
