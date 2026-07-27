import { UserTestFactoryProps } from '../factories/user-test.factory';

export const adminUserFixture: UserTestFactoryProps = {
  id: 'usr_admin_fixture',
  email: 'admin@kinergy.local',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fixture_salt$admin_hash',
  status: 'ACTIVE',
  roles: ['SUPER_ADMIN', 'ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant_platform',
  hashedRefreshToken: null,
  tokenVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

export const activeUserFixture: UserTestFactoryProps = {
  id: 'usr_active_fixture',
  email: 'active.user@kinergy.local',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fixture_salt$user_hash',
  status: 'ACTIVE',
  roles: ['USER'],
  permissions: ['read:profile'],
  tenantId: 'tenant_1',
  hashedRefreshToken: null,
  tokenVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

export const pendingUserFixture: UserTestFactoryProps = {
  ...activeUserFixture,
  id: 'usr_pending_fixture',
  email: 'pending.user@kinergy.local',
  status: 'PENDING',
};

export const inactiveUserFixture: UserTestFactoryProps = {
  ...activeUserFixture,
  id: 'usr_inactive_fixture',
  email: 'inactive.user@kinergy.local',
  status: 'INACTIVE',
};

export const blockedUserFixture: UserTestFactoryProps = {
  ...activeUserFixture,
  id: 'usr_blocked_fixture',
  email: 'blocked.user@kinergy.local',
  status: 'BLOCKED',
};
