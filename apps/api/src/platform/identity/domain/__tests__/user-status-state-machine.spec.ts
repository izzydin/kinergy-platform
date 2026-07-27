import {
  InvalidUserStatusTransitionException,
  UserStatusStateMachine,
} from '../user-status-state-machine';
import { UserStatus } from '../user-status.enum';
import { User } from '../user.entity';

describe('UserStatusStateMachine', () => {
  describe('Transition Validation Rules', () => {
    it('should allow valid transitions from PENDING state', () => {
      expect(UserStatusStateMachine.canTransition(UserStatus.PENDING, UserStatus.ACTIVE)).toBe(
        true,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.PENDING, UserStatus.INACTIVE)).toBe(
        true,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.PENDING, UserStatus.BLOCKED)).toBe(
        true,
      );
    });

    it('should allow valid transitions from ACTIVE state', () => {
      expect(UserStatusStateMachine.canTransition(UserStatus.ACTIVE, UserStatus.INACTIVE)).toBe(
        true,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.ACTIVE, UserStatus.BLOCKED)).toBe(
        true,
      );
    });

    it('should allow valid transitions from INACTIVE state', () => {
      expect(UserStatusStateMachine.canTransition(UserStatus.INACTIVE, UserStatus.ACTIVE)).toBe(
        true,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.INACTIVE, UserStatus.BLOCKED)).toBe(
        true,
      );
    });

    it('should allow unblocking BLOCKED state to ACTIVE only', () => {
      expect(UserStatusStateMachine.canTransition(UserStatus.BLOCKED, UserStatus.ACTIVE)).toBe(
        true,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.BLOCKED, UserStatus.INACTIVE)).toBe(
        false,
      );
      expect(UserStatusStateMachine.canTransition(UserStatus.BLOCKED, UserStatus.PENDING)).toBe(
        false,
      );
    });

    it('should throw InvalidUserStatusTransitionException on illegal transition', () => {
      expect(() => {
        UserStatusStateMachine.assertValidTransition(UserStatus.BLOCKED, UserStatus.INACTIVE);
      }).toThrow(InvalidUserStatusTransitionException);
    });
  });

  describe('Authentication Authorization Rules', () => {
    it('should permit authentication for ACTIVE status only', () => {
      expect(UserStatusStateMachine.canAuthenticate(UserStatus.ACTIVE)).toBe(true);
    });

    it('should deny authentication for PENDING, INACTIVE, and BLOCKED statuses', () => {
      expect(UserStatusStateMachine.canAuthenticate(UserStatus.PENDING)).toBe(false);
      expect(UserStatusStateMachine.canAuthenticate(UserStatus.INACTIVE)).toBe(false);
      expect(UserStatusStateMachine.canAuthenticate(UserStatus.BLOCKED)).toBe(false);
    });
  });

  describe('User Aggregate State Integration', () => {
    it('should execute state transition on User aggregate and update timestamps/tokens', () => {
      const user = new User({
        id: 'usr_1',
        email: 'user@example.com',
        passwordHash: 'hash',
        status: UserStatus.PENDING,
        roles: ['USER'],
        permissions: [],
        hashedRefreshToken: 'token_123',
        tokenVersion: 1,
      });

      expect(user.canAuthenticate()).toBe(false);

      // Transition PENDING -> ACTIVE
      user.activate();
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.canAuthenticate()).toBe(true);

      // Transition ACTIVE -> INACTIVE
      user.inactivate();
      expect(user.status).toBe(UserStatus.INACTIVE);
      expect(user.canAuthenticate()).toBe(false);
      expect(user.hashedRefreshToken).toBeNull();
      expect(user.tokenVersion).toBe(2);

      // Transition INACTIVE -> BLOCKED
      user.block();
      expect(user.status).toBe(UserStatus.BLOCKED);
      expect(user.canAuthenticate()).toBe(false);

      // Transition BLOCKED -> ACTIVE
      user.unblock();
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.canAuthenticate()).toBe(true);
    });
  });
});
