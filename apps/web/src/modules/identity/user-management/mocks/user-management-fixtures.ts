import type { ManagedUser } from '../domain/user.types';

export const MOCK_MANAGED_USERS: ManagedUser[] = [
  {
    id: 'usr_admin_1',
    email: 'admin@kinergy.io',
    name: 'Platform Admin',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['manage:users', 'admin:read', 'client:read'],
    tenantId: 'tenant_kinergy_master',
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    lastLoginAt: '2026-08-12T14:30:00.000Z',
  },
  {
    id: 'usr_operator_1',
    email: 'operator@kinergy.io',
    name: 'Grid Operator',
    status: 'ACTIVE',
    roles: ['OPERATOR'],
    permissions: ['energy:read', 'client:read'],
    tenantId: 'tenant_kinergy_master',
    createdAt: '2026-02-01T09:15:00.000Z',
    updatedAt: '2026-07-20T11:45:00.000Z',
    lastLoginAt: '2026-08-11T09:12:00.000Z',
  },
  {
    id: 'usr_member_1',
    email: 'member@kinergy.io',
    name: 'Energy Member',
    status: 'INACTIVE',
    roles: ['MEMBER'],
    permissions: ['client:read'],
    tenantId: 'tenant_kinergy_master',
    createdAt: '2026-03-10T11:20:00.000Z',
    updatedAt: '2026-08-05T16:00:00.000Z',
    lastLoginAt: '2026-07-15T18:22:00.000Z',
  },
  {
    id: 'usr_pending_1',
    email: 'pending@kinergy.io',
    name: 'Pending User',
    status: 'PENDING',
    roles: ['MEMBER'],
    permissions: [],
    tenantId: 'tenant_kinergy_master',
    createdAt: '2026-08-10T14:00:00.000Z',
    updatedAt: '2026-08-10T14:00:00.000Z',
    lastLoginAt: null,
  },
  {
    id: 'usr_blocked_1',
    email: 'blocked@kinergy.io',
    name: 'Blocked User',
    status: 'BLOCKED',
    roles: ['MEMBER'],
    permissions: [],
    tenantId: 'tenant_kinergy_master',
    createdAt: '2026-04-05T10:00:00.000Z',
    updatedAt: '2026-07-01T08:30:00.000Z',
    lastLoginAt: '2026-06-30T19:40:00.000Z',
  },
];

let mockUserDatabase: ManagedUser[] = [...MOCK_MANAGED_USERS];

export function getMockUserDatabase(): ManagedUser[] {
  return mockUserDatabase;
}

export function resetMockUserDatabase(): void {
  mockUserDatabase = MOCK_MANAGED_USERS.map((user) => ({ ...user }));
}
