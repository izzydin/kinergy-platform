import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { AssignedClientMembershipDTO } from '../dtos/assigned-client-membership.dto';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { Clock } from '../../domain/shared/clock';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { Membership } from '../../domain/membership/membership.aggregate';

const DEFAULT_HORIZON_DAYS = 7;
const DEFAULT_STATUSES: MembershipStatus[] = [
  MembershipStatus.ACTIVE,
  MembershipStatus.FROZEN,
  MembershipStatus.PENDING,
];

/**
 * CQRS Query Handler projecting assigned-client memberships for the Trainer Operational Dashboard.
 *
 * Boundary rules enforced:
 * - Filters by TrainerAssignment.trainerId — does NOT create a Trainer aggregate.
 * - Resolves MembershipPlan.name via MembershipPlanRepository — no cross-context joins.
 * - Pricing fields (PlanPrice.amount / currency) are NOT included in the projection.
 * - Temporal indicators (isExpiringSoon, daysRemaining, isExpired) are computed here —
 *   never delegated to the frontend.
 */
export class GetAssignedClientMembershipsHandler implements QueryHandler<
  GetAssignedClientMembershipsQuery,
  ApplicationResult<AssignedClientMembershipDTO[]>
> {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly planRepository: MembershipPlanRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    query: GetAssignedClientMembershipsQuery,
  ): Promise<ApplicationResult<AssignedClientMembershipDTO[]>> {
    try {
      const { input } = query;

      if (!input.trainerId || input.trainerId.trim().length === 0) {
        return ApplicationResult.fail(
          'trainerId is required for GetAssignedClientMembershipsQuery.',
        );
      }

      // Resolve evaluation timestamp
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
          : DEFAULT_HORIZON_DAYS;

      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
      const statuses =
        input.statuses && input.statuses.length > 0 ? input.statuses : DEFAULT_STATUSES;

      // Retrieve memberships assigned to this trainer
      let memberships: Membership[];
      if (this.membershipRepository.findByTrainerId) {
        memberships = await this.membershipRepository.findByTrainerId(
          input.trainerId.trim(),
          statuses,
        );
      } else {
        const all = await this.membershipRepository.findAll();
        const statusSet = new Set(statuses);
        memberships = all.filter(
          (m) =>
            m.trainerAssignment?.trainerId === input.trainerId.trim() && statusSet.has(m.status),
        );
      }

      // Build a plan-name lookup cache to avoid N+1 calls
      const planNameCache = new Map<string, string>();
      const uniquePlanIds = [...new Set(memberships.map((m) => m.planId))];
      await Promise.all(
        uniquePlanIds.map(async (planId) => {
          if (!planNameCache.has(planId)) {
            const plan = await this.planRepository.findById(planId);
            planNameCache.set(planId, plan?.name ?? planId);
          }
        }),
      );

      // Project into DTOs
      const items: AssignedClientMembershipDTO[] = memberships.map((m: Membership) => {
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

        const assignedAt = m.trainerAssignment?.assignedAt ?? m.createdAt;

        return {
          membershipId: m.id.value,
          clientId: m.clientId,
          planId: m.planId,
          planName: planNameCache.get(m.planId) ?? m.planId,
          status: m.status,
          startDate: m.period.startDate.toISOString(),
          endDate: m.period.endDate.toISOString(),
          daysRemaining,
          isExpiringSoon,
          isExpired,
          isCurrentlyFrozen,
          assignedAt: assignedAt.toISOString(),
        };
      });

      // Sort: expiring-soon first, then by daysRemaining ascending
      items.sort((a, b) => {
        if (a.isExpiringSoon && !b.isExpiringSoon) return -1;
        if (!a.isExpiringSoon && b.isExpiringSoon) return 1;
        return a.daysRemaining - b.daysRemaining;
      });

      return ApplicationResult.ok(items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
