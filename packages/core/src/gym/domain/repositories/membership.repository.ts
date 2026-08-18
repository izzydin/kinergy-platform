import { Membership } from '../membership/membership.aggregate';
import { MembershipId } from '../membership/membership-id.vo';

export interface MembershipRepository {
  save(membership: Membership): Promise<void>;
  findById(id: MembershipId | string): Promise<Membership | null>;
  findByClientId(clientId: string): Promise<Membership[]>;
}
