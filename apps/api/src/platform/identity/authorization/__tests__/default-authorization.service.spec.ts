import { DefaultAuthorizationService } from '../default-authorization.service';

describe('DefaultAuthorizationService', () => {
  let service: DefaultAuthorizationService;

  beforeEach(() => {
    service = new DefaultAuthorizationService();
  });

  it('should authorize request when no roles or permissions are required', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: [],
    });

    expect(isAllowed).toBe(true);
  });

  it('should authorize request when user satisfies required role', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['MANAGER'],
      userPermissions: [],
      requiredRoles: ['ADMIN', 'MANAGER'],
    });

    expect(isAllowed).toBe(true);
  });

  it('should authorize ADMIN user automatically for any required role', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_admin',
      userRoles: ['ADMIN'],
      userPermissions: [],
      requiredRoles: ['SPECIAL_ROLE'],
    });

    expect(isAllowed).toBe(true);
  });

  it('should deny request when user does not satisfy required role', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: [],
      requiredRoles: ['ADMIN', 'MANAGER'],
    });

    expect(isAllowed).toBe(false);
  });

  it('should authorize request when user has exact required permissions', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: ['read:users', 'write:users'],
      requiredPermissions: ['read:users', 'write:users'],
    });

    expect(isAllowed).toBe(true);
  });

  it('should authorize request using wildcard permission patterns (* or prefix:*)', async () => {
    const isAllowedWildcardAll = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: ['*'],
      requiredPermissions: ['read:users', 'delete:system'],
    });
    expect(isAllowedWildcardAll).toBe(true);

    const isAllowedPrefix = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: ['users:*'],
      requiredPermissions: ['users:read', 'users:write'],
    });
    expect(isAllowedPrefix).toBe(true);
  });

  it('should deny request when user lacks any required permission', async () => {
    const isAllowed = await service.isAuthorized({
      userId: 'usr_1',
      userRoles: ['USER'],
      userPermissions: ['read:users'],
      requiredPermissions: ['read:users', 'delete:users'],
    });

    expect(isAllowed).toBe(false);
  });
});
