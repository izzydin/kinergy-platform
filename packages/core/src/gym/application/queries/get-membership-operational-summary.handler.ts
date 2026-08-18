import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetMembershipOperationalSummaryQuery } from './get-membership-operational-summary.query';
import { MembershipOperationalSummaryDTO } from '../dtos/membership-operational-summary.dto';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { Clock } from '../../domain/shared/clock';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

/**
 * Query handler aggregating operational front-desk summary statistics across all gym memberships.
 */
export class GetMembershipOperationalSummaryHandler implements QueryHandler<
  GetMembershipOperationalSummaryQuery,
  ApplicationResult<MembershipOperationalSummaryDTO>
> {
  private static readonly DEFAULT_HORIZON_DAYS = 7;

  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetMembershipOperationalSummaryQuery,
  ): Promise<ApplicationResult<MembershipOperationalSummaryDTO>> {
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
          : GetMembershipOperationalSummaryHandler.DEFAULT_HORIZON_DAYS;

      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
      const asOfMs = asOf.getTime();

      const allMemberships = await this.membershipRepository.findAll();

      let totalActive = 0;
      let expiringSoonCount = 0;
      let expiredCount = 0;
      let frozenCount = 0;
      let pendingCount = 0;

      for (const m of allMemberships) {
        const endMs = m.period.endDate.getTime();
        const diffMs = endMs - asOfMs;

        if (m.status === MembershipStatus.ACTIVE) {
          totalActive++;
          if (diffMs <= horizonMs && diffMs > 0) {
            expiringSoonCount++;
          }
        } else if (m.status === MembershipStatus.FROZEN) {
          frozenCount++;
          if (diffMs <= horizonMs && diffMs > 0) {
            expiringSoonCount++;
          }
        } else if (m.status === MembershipStatus.EXPIRED) {
          expiredCount++;
        } else if (m.status === MembershipStatus.PENDING) {
          pendingCount++;
        }

        // Catch unmaterialized expired state for reporting
        if (
          (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
          diffMs <= 0
        ) {
          expiredCount++;
        }
      }

      const summaryDTO: MembershipOperationalSummaryDTO = {
        totalActive,
        expiringSoonCount,
        expiredCount,
        frozenCount,
        pendingCount,
        totalMemberships: allMemberships.length,
        asOfDate: asOf.toISOString(),
        horizonDays,
      };

      return ApplicationResult.ok(summaryDTO);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
