import { User, IUserProps } from '../user.entity';
import { UserStatus } from '../user-status.enum';
import { UserTestFactory, EntityAssertions } from '@kinergy-platform/testing';

describe('User Aggregate Root', () => {
  const userFactory = new UserTestFactory();

  const toUserProps = (overrides?: Parameters<typeof userFactory.create>[0]): IUserProps => {
    const raw = userFactory.create(overrides);
    return {
      ...raw,
      status: raw.status as UserStatus,
    };
  };

  describe('Instantiation & Identity', () => {
    it('should create user with default PENDING status if unspecified', () => {
      const props = toUserProps();
      delete (props as Partial<IUserProps>).status;
      const user = new User(props);

      expect(user.id).toBe(props.id);
      expect(user.email).toBe(props.email);
      expect(user.status).toBe(UserStatus.PENDING);
      expect(user.tokenVersion).toBe(1);
    });

    it('should compare entity identity equality', () => {
      const props = toUserProps();
      const user1 = new User(props);
      const user2 = new User(props);

      expect(() => EntityAssertions.expectEqualId(user1, user2)).not.toThrow();
    });
  });

  describe('Authentication Eligibility', () => {
    it('should allow authentication ONLY for ACTIVE users', () => {
      const activeUser = new User(toUserProps({ status: UserStatus.ACTIVE }));
      const pendingUser = new User(toUserProps({ status: UserStatus.PENDING }));
      const inactiveUser = new User(toUserProps({ status: UserStatus.INACTIVE }));
      const blockedUser = new User(toUserProps({ status: UserStatus.BLOCKED }));

      expect(activeUser.canAuthenticate()).toBe(true);
      expect(pendingUser.canAuthenticate()).toBe(false);
      expect(inactiveUser.canAuthenticate()).toBe(false);
      expect(blockedUser.canAuthenticate()).toBe(false);
    });

    it('should deny authentication for soft-deleted users even if ACTIVE', () => {
      const deletedUser = new User(
        toUserProps({ status: UserStatus.ACTIVE, deletedAt: new Date() }),
      );

      expect(deletedUser.canAuthenticate()).toBe(false);
      expect(deletedUser.isDeleted()).toBe(true);
    });
  });

  describe('Status Transitions & State Machine Enforcement', () => {
    it('should allow valid transition from PENDING to ACTIVE', () => {
      const user = new User(toUserProps({ status: UserStatus.PENDING }));
      user.activate();

      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.canAuthenticate()).toBe(true);
    });

    it('should revoke refresh tokens and increment token version when transitioning out of ACTIVE', () => {
      const user = new User(
        toUserProps({
          status: UserStatus.ACTIVE,
          hashedRefreshToken: 'token_abc',
          refreshTokenExpiresAt: new Date(Date.now() + 100000),
          tokenVersion: 1,
        }),
      );

      user.deactivate();

      expect(user.status).toBe(UserStatus.DEACTIVATED);
      expect(user.hashedRefreshToken).toBeNull();
      expect(user.refreshTokenExpiresAt).toBeNull();
      expect(user.tokenVersion).toBe(2);
    });

    it('should reject invalid transition from BLOCKED directly to INACTIVE', () => {
      const user = new User(toUserProps({ status: UserStatus.BLOCKED }));

      expect(() => user.inactivate()).toThrow();
      expect(user.status).toBe(UserStatus.BLOCKED);
    });

    it('should allow unblocking a BLOCKED user to ACTIVE', () => {
      const user = new User(toUserProps({ status: UserStatus.BLOCKED }));
      user.unblock();

      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.canAuthenticate()).toBe(true);
    });
  });

  describe('Soft Delete & Immutability Invariants', () => {
    it('should soft delete user and revoke active sessions', () => {
      const user = new User(
        toUserProps({
          status: UserStatus.ACTIVE,
          hashedRefreshToken: 'token_123',
          tokenVersion: 1,
        }),
      );

      user.softDelete();

      expect(user.isDeleted()).toBe(true);
      expect(user.status).toBe(UserStatus.DEACTIVATED);
      expect(user.hashedRefreshToken).toBeNull();
      expect(user.tokenVersion).toBe(2);
    });

    it('should reject double soft-delete', () => {
      const user = new User(toUserProps({ deletedAt: new Date() }));
      expect(() => user.softDelete()).toThrow('User is already soft-deleted.');
    });

    it('should prevent password changes, email updates, and status transitions on soft-deleted users', () => {
      const user = new User(toUserProps({ deletedAt: new Date() }));

      expect(() => user.changePassword('new_hash')).toThrow();
      expect(() => user.updateEmail('new@example.com')).toThrow();
      expect(() => user.updateRoles(['ADMIN'])).toThrow();
      expect(() => user.activate()).toThrow();
    });
  });

  describe('Password & Credential Lifecycle', () => {
    it('should change password, clear refresh tokens, increment token version, and push old hash to history', () => {
      const user = new User(
        toUserProps({
          status: UserStatus.ACTIVE,
          passwordHash: 'old_hash',
          hashedRefreshToken: 'old_refresh_token',
          tokenVersion: 5,
        }),
      );

      user.changePassword('new_argon2id_hash');

      expect(user.passwordHash).toBe('new_argon2id_hash');
      expect(user.passwordHistory).toEqual(['old_hash']);
      expect(user.hashedRefreshToken).toBeNull();
      expect(user.tokenVersion).toBe(6);
    });

    it('should limit rolling passwordHistory length according to historyLimit parameter', () => {
      const user = new User(
        toUserProps({
          status: UserStatus.ACTIVE,
          passwordHash: 'hash_0',
        }),
      );

      user.changePassword('hash_1', 2);
      user.changePassword('hash_2', 2);
      user.changePassword('hash_3', 2);

      expect(user.passwordHash).toBe('hash_3');
      expect(user.passwordHistory).toEqual(['hash_2', 'hash_1']);
      expect(user.passwordHistory).toHaveLength(2);
    });
  });
});
