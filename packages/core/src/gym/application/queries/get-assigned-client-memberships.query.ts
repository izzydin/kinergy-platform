import { Query } from '../shared/query.interface';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

export interface GetAssignedClientMembershipsInput {
  /**
   * The IAM User.id of the trainer whose assigned memberships are projected.
   * Matches Membership.TrainerAssignment.trainerId.
   */
  readonly trainerId: string;

  /**
   * Optional filter by membership lifecycle status.
   * Defaults to [ACTIVE, FROZEN, PENDING] when omitted.
   */
  readonly statuses?: MembershipStatus[];

  /**
   * Optional evaluation timestamp (UTC) for temporal projections.
   * Defaults to clock.now() when omitted.
   */
  readonly asOfDate?: Date | string;

  /**
   * Future lookahead window in days for isExpiringSoon projection.
   * Defaults to 7 days when omitted.
   */
  readonly horizonDays?: number;
}

/**
 * CQRS Read Query projecting all memberships assigned to a specific trainer.
 *
 * Authorized only for the trainer identified by trainerId (enforced at controller layer).
 * Returns operational read-model projections including expiry and freeze indicators.
 */
export class GetAssignedClientMembershipsQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: GetAssignedClientMembershipsInput,
    queryId?: string,
    timestamp: Date = new Date(),
  ) {
    this.queryId =
      queryId ?? `qry_assigned_clients_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
