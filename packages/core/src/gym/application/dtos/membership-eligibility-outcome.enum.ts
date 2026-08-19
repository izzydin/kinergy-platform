/**
 * Canonical outcome codes for membership attendance eligibility evaluations.
 */
export enum MembershipEligibilityOutcome {
  /**
   * Client has an active, valid membership and is authorized for physical attendance.
   */
  ELIGIBLE = 'ELIGIBLE',

  /**
   * Client has no membership records in the system.
   */
  NO_MEMBERSHIP = 'NO_MEMBERSHIP',

  /**
   * Client record was not found or is in an inactive/suspended state in Client Management.
   */
  INACTIVE_CLIENT = 'INACTIVE_CLIENT',

  /**
   * Membership validity period has passed the expiration threshold (endDate <= asOf) or is in EXPIRED status.
   */
  EXPIRED = 'EXPIRED',

  /**
   * Membership is temporarily frozen and access is suspended.
   */
  FROZEN = 'FROZEN',

  /**
   * Membership was cancelled prior to natural expiration.
   */
  CANCELLED = 'CANCELLED',

  /**
   * Membership was terminated due to administrative or policy revocation.
   */
  TERMINATED = 'TERMINATED',

  /**
   * Membership is in PENDING status or its validity period starts in the future.
   */
  NOT_YET_ACTIVE = 'NOT_YET_ACTIVE',
}
