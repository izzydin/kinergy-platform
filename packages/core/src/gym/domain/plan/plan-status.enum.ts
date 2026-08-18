/**
 * Canonical lifecycle status for MembershipPlan commercial catalog items.
 */
export enum PlanStatus {
  /** In design / staging; not available for customer purchase or renewal */
  DRAFT = 'DRAFT',
  /** Published in commercial catalog; available for purchase and renewal */
  ACTIVE = 'ACTIVE',
  /** Retired from sale; cannot be selected for new purchases or renewals */
  ARCHIVED = 'ARCHIVED',
}
