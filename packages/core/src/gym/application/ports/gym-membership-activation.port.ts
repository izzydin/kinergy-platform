import { MembershipDTO } from '../dtos/membership.dto';

export interface ActivateOrRenewMembershipInput {
  readonly clientId: string;
  readonly planId: string;
  readonly paymentRef: string;
  readonly membershipId?: string;
  readonly effectiveDate?: Date | string;
  readonly assignedTrainerId?: string;
  readonly customId?: string;
}

export interface ActivateOrRenewMembershipResult {
  readonly isSuccess: boolean;
  readonly isFailure: boolean;
  readonly membership?: MembershipDTO;
  readonly errorMessage?: string;
  readonly wasReplay?: boolean;
  readonly action?: 'PURCHASED' | 'RENEWED';
}

/**
 * Authoritative outbound/in-process capability port for fulfilling commercial gym membership sales.
 * Codified in ADR-0110, ADR-0112, and ADR-0139 (§3.2, §4).
 *
 * Responsibilities:
 * 1. Post-payment fulfillment: Upon SalePaidEvent, Sales invokes activateOrRenew().
 * 2. Idempotency defense: Prevents double billing, duplicate memberships, and repeated date extensions by keying on paymentRef.
 * 3. Lifecycle preservation: Respects active, expired, frozen, cancelled, and terminated domain invariants.
 */
export interface GymMembershipActivationPort {
  activateOrRenew(input: ActivateOrRenewMembershipInput): Promise<ActivateOrRenewMembershipResult>;
}
