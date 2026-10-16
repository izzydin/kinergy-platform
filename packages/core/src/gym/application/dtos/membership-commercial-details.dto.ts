export interface MembershipCommercialDetailsDTO {
  readonly planId: string;
  readonly planCode: string;
  readonly planName: string;
  readonly durationDays: number;
  readonly unitPriceCents: number;
  readonly currency: string;
  readonly description: string;
  readonly clientId?: string | null;
  readonly membershipId?: string | null;
  readonly isRenewal: boolean;
  readonly isEligible: boolean;
  readonly eligibilityReason: string;
  readonly planStatus: string;
  readonly membershipStatus?: string | null;
}
