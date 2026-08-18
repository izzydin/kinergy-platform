import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetExpiringMembershipsQuery } from './get-expiring-memberships.query';
import { ExpiringMembershipItemDTO } from '../dtos/expiring-membership-item.dto';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { Clock } from '../../domain/shared/clock';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

/**
 * Query handler projecting operational expiring-soon membership records for front-desk dashboards.
 */
export class GetExpiringMembershipsHandler implements QueryHandler<
  GetExpiringMembershipsQuery,
  ApplicationResult<ExpiringMembershipItemDTO[]>
> {
  private static readonly DEFAULT_HORIZON_DAYS = 7;

  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetExpiringMembershipsQuery,
  ): Promise<ApplicationResult<ExpiringMembershipItemDTO[]>> {
    try {
      const { input } = query;

      let asOf: Date;
      if (input.asOfDate) {
        asOf = input.asOfDate instanceof Date ? input.asOfDate : new Date(input.asOfDate);
        if (isNaN(asOf.getTime())) {
          return ApplicationResult.fail(`Invalid asOfDate '${String(input.asOfDate)}'.`);
        }
      } else {
        asOf = this.clock.now();
      }

      const horizonDays =
        input.horizonDays !== undefined && input.horizonDays > 0
          ? input.horizonDays
          : GetExpiringMembershipsHandler.DEFAULT_HORIZON_DAYS;

      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;

      // Query candidate memberships within horizon
      const memberships = await this.membershipRepository.findExpiringWithinHorizon(
        asOf,
        horizonDays,
      );

      const items: ExpiringMembershipItemDTO[] = memberships.map((m) => {
        const endMs = m.period.endDate.getTime();
        const asOfMs = asOf.getTime();
        const diffMs = endMs - asOfMs;

        const daysRemaining = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
        const isExpiringSoon =
          (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
          diffMs <= horizonMs &&
          diffMs > 0;

        const isExpired = m.status === MembershipStatus.EXPIRED || diffMs <= 0;
        const isCurrentlyFrozen = m.isCurrentlyFrozen(asOf);

        return {
          membershipId: m.id.value,
          clientId: m.clientId,
          planId: m.planId,
          status: m.status,
          startDate: m.period.startDate.toISOString(),
          endDate: m.period.endDate.toISOString(),
          daysRemaining,
          isExpiringSoon,
          isExpired,
          isCurrentlyFrozen,
        };
      });

      // Sort by daysRemaining ascending (most urgent first)
      items.sort((a, b) => a.daysRemaining - b.daysRemaining);

      return ApplicationResult.ok(items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
