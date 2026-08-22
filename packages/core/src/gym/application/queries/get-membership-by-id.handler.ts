import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetMembershipByIdQuery } from './get-membership-by-id.query';
import { MembershipDTO } from '../dtos/membership.dto';
import { MembershipMapper } from '../mappers/membership.mapper';
import { MembershipRepository } from '../../domain/repositories/membership.repository';

export class GetMembershipByIdHandler implements QueryHandler<
  GetMembershipByIdQuery,
  ApplicationResult<MembershipDTO>
> {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  public async execute(query: GetMembershipByIdQuery): Promise<ApplicationResult<MembershipDTO>> {
    try {
      const { input } = query;
      if (!input.membershipId || input.membershipId.trim().length === 0) {
        return ApplicationResult.fail('Membership ID cannot be empty.');
      }

      const membership = await this.membershipRepository.findById(input.membershipId.trim());
      if (!membership) {
        return ApplicationResult.fail(`Membership with ID '${input.membershipId}' not found.`);
      }

      return ApplicationResult.ok(MembershipMapper.toDTO(membership));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
