/**
 * Authoritative lifecycle status for Gym Membership aggregates.
 * Codified in ADR-0055 and ADR-0057.
 */
export enum MembershipStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  TERMINATED = 'TERMINATED',
}
