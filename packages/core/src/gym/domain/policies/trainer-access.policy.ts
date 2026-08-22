/**
 * Domain Authorization & Access Policy governing Trainer Operational Boundaries (Phase 5.6-B).
 *
 * Implements deterministic policy evaluation for:
 * 1. Horizontal Isolation (Trainer A cannot view Trainer B's assigned client roster).
 * 2. Least Privilege / Commercial Masking (Trainers cannot view PlanPrice commercial details).
 * 3. Mutation Boundary Separation (Trainers cannot submit check-ins or mutate membership lifecycle).
 */
export class TrainerAccessPolicy {
  private static readonly ADMIN_ROLES = new Set(['Owner', 'Admin', 'PlatformAdmin']);
  private static readonly RECEPTION_ROLES = new Set(['Owner', 'Admin', 'Receptionist']);

  /**
   * Evaluates whether an actor may query the assigned client roster for a target trainerId.
   *
   * Rules:
   * - An actor may view their own assigned roster (actorUserId === targetTrainerId).
   * - Platform Owners/Admins may view any trainer's assigned roster.
   * - Any other cross-trainer query constitutes unauthorized horizontal escalation.
   */
  public static canAccessAssignedRoster(
    actorUserId: string,
    targetTrainerId: string,
    actorRoles: readonly string[] = [],
  ): boolean {
    if (!actorUserId || !targetTrainerId) {
      return false;
    }

    // Direct match: Trainer accessing their own assigned roster
    if (actorUserId.trim() === targetTrainerId.trim()) {
      return true;
    }

    // Administrative override: Owners and Admins can supervise all trainer rosters
    return actorRoles.some((role) => this.ADMIN_ROLES.has(role.trim()));
  }

  /**
   * Evaluates whether an actor may view commercial membership pricing fields (PlanPrice.amount).
   *
   * Rules:
   * - Requires explicit 'billing.read' permission or an administrative role.
   * - Standard 'Trainer' role lacks billing permissions and must receive masked/omitted pricing.
   */
  public static canViewMembershipPricing(
    actorPermissions: readonly string[] = [],
    actorRoles: readonly string[] = [],
  ): boolean {
    if (actorPermissions.includes('*') || actorPermissions.includes('billing.read')) {
      return true;
    }
    return actorRoles.some((role) => this.ADMIN_ROLES.has(role.trim()));
  }

  /**
   * Evaluates whether an actor may execute admission check-in mutations from their current context.
   *
   * Rules:
   * - Check-in mutations belong strictly to Front Desk Receptionists and Admins.
   * - Floor trainers on the Trainer Dashboard have read-only diagnostic visibility.
   */
  public static canMutateAttendance(
    actorRoles: readonly string[] = [],
    actorPermissions: readonly string[] = [],
  ): boolean {
    if (actorPermissions.includes('*') || actorPermissions.includes('attendance.write')) {
      return true;
    }
    return actorRoles.some((role) => this.RECEPTION_ROLES.has(role.trim()));
  }

  /**
   * Evaluates whether an actor may perform lifecycle mutations (renew, freeze, cancel, terminate).
   *
   * Rules:
   * - Membership lifecycle management requires administrative or billing write authority.
   * - Floor trainers cannot unilaterally mutate agreements.
   */
  public static canMutateMembershipLifecycle(
    actorRoles: readonly string[] = [],
    actorPermissions: readonly string[] = [],
  ): boolean {
    if (actorPermissions.includes('*') || actorPermissions.includes('memberships.write')) {
      return true;
    }
    return actorRoles.some((role) => this.ADMIN_ROLES.has(role.trim()));
  }
}
