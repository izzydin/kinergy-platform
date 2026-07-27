import { AuthenticatedUserContext } from '../authenticated-user-context';

describe('AuthenticatedUserContext', () => {
  const defaultProps = {
    userId: 'usr_123',
    email: 'user@example.com',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: ['reports:read', 'reports:export'],
    tenantId: 'tenant_acme',
    organizationId: 'org_999',
    deviceId: 'dev_mobile_1',
    locale: 'en-US',
    timezone: 'UTC',
    isImpersonating: false,
    featureFlags: { enableBeta: true },
  };

  it('should instantiate immutable user context model with complete properties', () => {
    const context = new AuthenticatedUserContext(defaultProps);

    expect(context.userId).toBe('usr_123');
    expect(context.email).toBe('user@example.com');
    expect(context.status).toBe('ACTIVE');
    expect(context.roles).toEqual(['MANAGER']);
    expect(context.permissions).toEqual(['reports:read', 'reports:export']);
    expect(context.tenantId).toBe('tenant_acme');
    expect(context.organizationId).toBe('org_999');
    expect(context.deviceId).toBe('dev_mobile_1');
    expect(context.locale).toBe('en-US');
    expect(context.timezone).toBe('UTC');
    expect(context.isImpersonating).toBe(false);
    expect(context.featureFlags).toEqual({ enableBeta: true });
    expect(context.isAuthenticated).toBe(true);
  });

  it('should evaluate role checking methods (hasRole, hasAnyRole) correctly', () => {
    const context = new AuthenticatedUserContext(defaultProps);

    expect(context.hasRole('MANAGER')).toBe(true);
    expect(context.hasRole('MEMBER')).toBe(false);
    expect(context.hasAnyRole(['MEMBER', 'MANAGER'])).toBe(true);

    const adminContext = new AuthenticatedUserContext({
      ...defaultProps,
      roles: ['ADMIN'],
    });
    expect(adminContext.hasRole('ANY_ROLE')).toBe(true);
  });

  it('should evaluate permission checking methods (hasPermission, hasAllPermissions) correctly including wildcards', () => {
    const context = new AuthenticatedUserContext(defaultProps);

    expect(context.hasPermission('reports:read')).toBe(true);
    expect(context.hasPermission('reports:delete')).toBe(false);
    expect(context.hasAllPermissions(['reports:read', 'reports:export'])).toBe(true);
    expect(context.hasAllPermissions(['reports:read', 'reports:delete'])).toBe(false);

    const wildcardContext = new AuthenticatedUserContext({
      ...defaultProps,
      permissions: ['reports:*'],
    });

    expect(wildcardContext.hasPermission('reports:delete')).toBe(true);
    expect(wildcardContext.hasPermission('users:read')).toBe(false);
  });
});
