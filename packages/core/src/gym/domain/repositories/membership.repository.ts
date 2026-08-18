import { Membership } from '../membership/membership.aggregate';
import { MembershipId } from '../membership/membership-id.vo';

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
}
