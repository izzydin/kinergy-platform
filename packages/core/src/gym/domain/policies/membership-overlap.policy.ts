import { Membership } from '../membership/membership.aggregate';
import { MembershipPeriod } from '../membership/membership-period.vo';
import { MembershipStatus } from '../membership/membership-status.enum';
import { OverlappingMembershipException } from '../exceptions/overlapping-membership.exception';

export interface OverlapEvaluationResult {
  readonly hasOverlap: boolean;
  readonly conflictingMembership?: Membership;
  readonly reason?: string;
}

/**
 * Domain Policy governing duplicate and overlapping memberships for a single Client.
 *
 * Invariants:
 * 1. A Client cannot possess two simultaneous active, pending, or frozen memberships whose validity periods overlap.
 * 2. Terminal or non-blocking states (EXPIRED, CANCELLED, TERMINATED) do not prevent new or adjacent memberships.
 * 3. Adjacent periods (where next.startDate >= current.endDate) do NOT overlap and are valid (supporting pre-scheduled renewals).
 */
export class MembershipOverlapPolicy {
  /**
   * Set of statuses representing currently active or committed membership commitments.
   */
  private static readonly ACTIVE_COMMITMENT_STATUSES = new Set<MembershipStatus>([
    MembershipStatus.PENDING,
    MembershipStatus.ACTIVE,
    MembershipStatus.FROZEN,
  ]);

  /**
   * Evaluates whether a candidate period overlaps with any existing non-terminal memberships of the client.
   *
   * @param existingMemberships All historical and active memberships for the client
   * @param candidatePeriod The proposed validity period for the new/renewed membership
   * @param excludeMembershipId Optional ID to exclude from comparison (e.g. during aggregate self-updates)
   */
  public evaluateOverlap(
    existingMemberships: ReadonlyArray<Membership>,
    candidatePeriod: MembershipPeriod,
    excludeMembershipId?: string,
  ): OverlapEvaluationResult {
    for (const membership of existingMemberships) {
      if (excludeMembershipId && membership.id.value === excludeMembershipId) {
        continue;
      }

      // Inactive/terminal states never block new membership periods
      if (!MembershipOverlapPolicy.ACTIVE_COMMITMENT_STATUSES.has(membership.status)) {
        continue;
      }

      if (membership.period.overlaps(candidatePeriod)) {
        return {
          hasOverlap: true,
          conflictingMembership: membership,
          reason: `Requested period [${candidatePeriod.startDate.toISOString()} - ${candidatePeriod.endDate.toISOString()}] overlaps with existing ${membership.status} membership '${membership.id.value}' [${membership.period.startDate.toISOString()} - ${membership.period.endDate.toISOString()}].`,
        };
      }
    }

    return {
      hasOverlap: false,
    };
  }

  /**
   * Asserts that candidatePeriod does not overlap with any existing active commitments,
   * throwing OverlappingMembershipException if a conflict exists.
   */
  public assertNoOverlap(
    clientId: string,
    existingMemberships: ReadonlyArray<Membership>,
    candidatePeriod: MembershipPeriod,
    excludeMembershipId?: string,
  ): void {
    const evaluation = this.evaluateOverlap(
      existingMemberships,
      candidatePeriod,
      excludeMembershipId,
    );
    if (evaluation.hasOverlap && evaluation.conflictingMembership) {
      throw new OverlappingMembershipException(
        clientId,
        evaluation.conflictingMembership.id.value,
        evaluation.reason,
      );
    }
  }
}
