import { UserStatus } from './user-status.enum';

export class InvalidUserStatusTransitionException extends Error {
  constructor(
    public readonly currentStatus: UserStatus,
    public readonly targetStatus: UserStatus,
  ) {
    super(`Invalid user status transition from '${currentStatus}' to '${targetStatus}'.`);
    this.name = 'InvalidUserStatusTransitionException';
  }
}

/**
 * Domain Service encapsulating the User Account Status State Machine.
 * Enforces explicit transition rules and authentication authorization rules.
 */
export class UserStatusStateMachine {
  private static readonly VALID_TRANSITIONS: Record<string, UserStatus[]> = {
    [UserStatus.PENDING]: [
      UserStatus.ACTIVE,
      UserStatus.INACTIVE,
      UserStatus.DEACTIVATED,
      UserStatus.BLOCKED,
      UserStatus.LOCKED,
    ],
    [UserStatus.PENDING_ACTIVATION]: [
      UserStatus.ACTIVE,
      UserStatus.INACTIVE,
      UserStatus.DEACTIVATED,
      UserStatus.BLOCKED,
      UserStatus.LOCKED,
    ],
    [UserStatus.ACTIVE]: [
      UserStatus.INACTIVE,
      UserStatus.DEACTIVATED,
      UserStatus.SUSPENDED,
      UserStatus.BLOCKED,
      UserStatus.LOCKED,
    ],
    [UserStatus.INACTIVE]: [UserStatus.ACTIVE, UserStatus.BLOCKED, UserStatus.LOCKED],
    [UserStatus.DEACTIVATED]: [UserStatus.ACTIVE, UserStatus.BLOCKED, UserStatus.LOCKED],
    [UserStatus.SUSPENDED]: [UserStatus.ACTIVE, UserStatus.BLOCKED, UserStatus.LOCKED],
    [UserStatus.BLOCKED]: [UserStatus.ACTIVE],
    [UserStatus.LOCKED]: [UserStatus.ACTIVE],
  };

  private static readonly AUTHENTICATABLE_STATES: Set<UserStatus> = new Set([UserStatus.ACTIVE]);

  /**
   * Evaluates if a transition from currentStatus to targetStatus is valid.
   */
  public static canTransition(currentStatus: UserStatus, targetStatus: UserStatus): boolean {
    if (currentStatus === targetStatus) {
      return true; // No-op transition
    }

    const allowedTargets = this.VALID_TRANSITIONS[currentStatus];
    return allowedTargets ? allowedTargets.includes(targetStatus) : false;
  }

  /**
   * Asserts that a transition from currentStatus to targetStatus is valid,
   * throwing InvalidUserStatusTransitionException if forbidden.
   */
  public static assertValidTransition(currentStatus: UserStatus, targetStatus: UserStatus): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new InvalidUserStatusTransitionException(currentStatus, targetStatus);
    }
  }

  /**
   * Determines if a user in the given status is permitted to authenticate.
   * Only ACTIVE users are permitted. PENDING, INACTIVE, and BLOCKED users are denied.
   */
  public static canAuthenticate(status: UserStatus): boolean {
    return this.AUTHENTICATABLE_STATES.has(status);
  }
}
