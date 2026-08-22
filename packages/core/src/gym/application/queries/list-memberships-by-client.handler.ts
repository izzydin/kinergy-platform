import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListMembershipsByClientQuery } from './list-memberships-by-client.query';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';

export class ListMembershipsByClientHandler implements QueryHandler<
  ListMembershipsByClientQuery,
  ApplicationResult<MembershipDTO[]>
> {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  public async execute(
    query: ListMembershipsByClientQuery,
  ): Promise<ApplicationResult<MembershipDTO[]>> {
    try {
      const { input } = query;
      if (!input.clientId || input.clientId.trim().length === 0) {
        return ApplicationResult.fail('Client ID cannot be empty.');
      }

      const memberships = await this.membershipRepository.findByClientId(input.clientId.trim());
      const dtos = memberships.map((m) => MembershipMapper.toDTO(m));

      return ApplicationResult.ok(dtos);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
