import { Membership } from '../membership/membership.aggregate';
import { MembershipId } from '../membership/membership-id.vo';
import { MembershipStatus } from '../membership/membership-status.enum';

export interface MembershipRepository {
  save(membership: Membership): Promise<void>;
  findById(id: MembershipId | string): Promise<Membership | null>;
  findByClientId(clientId: string): Promise<Membership[]>;
  /**
   * Retrieves active or frozen memberships whose validity interval end date is on or before `asOf`.
   * @param asOf The temporal boundary threshold (UTC)
   * @param limit Optional maximum batch size for paginated chunk processing
   */
  findExpiringCandidates(asOf: Date, limit?: number): Promise<Membership[]>;

  /**
   * Retrieves active or frozen memberships expiring within a specified future horizon in days.
   * @param asOf Current evaluation timestamp (UTC)
   * @param horizonDays Future lookahead window in days
   */
  findExpiringWithinHorizon(asOf: Date, horizonDays: number): Promise<Membership[]>;

  /**
   * Retrieves all memberships across statuses for operational summary aggregations.
   */
  findAll(): Promise<Membership[]>;

  /**
   * Retrieves memberships assigned to a specific trainer via TrainerAssignment value object.
   * Used exclusively by the Trainer Operational Dashboard read model.
   *
   * @param trainerId IAM User.id of the assigned trainer (matches Membership.TrainerAssignment.trainerId)
   * @param statuses Optional filter by lifecycle status; defaults to [ACTIVE, FROZEN, PENDING]
   */
  findByTrainerId?(trainerId: string, statuses?: MembershipStatus[]): Promise<Membership[]>;
}
