import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard, RequestUserPayload } from '../authorization.guard';
import { IAuthorizationService, IPermissionResolver } from '../authorization.interface';

describe('AuthorizationGuard', () => {
  let guard: AuthorizationGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockAuthorizationService: jest.Mocked<IAuthorizationService>;
  let mockPermissionResolver: jest.Mocked<IPermissionResolver>;

  const createMockContext = (user?: RequestUserPayload): ExecutionContext => {
    const mockRequest = { user };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<Reflector>;

    mockAuthorizationService = {
      isAuthorized: jest.fn().mockResolvedValue(true),
    };

    mockPermissionResolver = {
      resolvePermissions: jest
        .fn()
        .mockImplementation((_id, _roles, directPerms) => Promise.resolve(directPerms ?? [])),
    };

    guard = new AuthorizationGuard(mockReflector, mockAuthorizationService, mockPermissionResolver);
  });

  it('should pass through if neither required roles nor permissions are specified on route', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockAuthorizationService.isAuthorized).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if request.user is missing when roles/permissions are required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should delegate resolution and evaluation to IPermissionResolver and IAuthorizationService', async () => {
    mockReflector.getAllAndOverride
      .mockReturnValueOnce(['MANAGER']) // requiredRoles
      .mockReturnValueOnce(['read:reports']); // requiredPermissions

    const userPayload: RequestUserPayload = {
      id: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['MANAGER'],
      permissions: ['read:reports'],
      tenantId: 'tenant_1',
    };
    const context = createMockContext(userPayload);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockPermissionResolver.resolvePermissions).toHaveBeenCalledWith(
      'usr_1',
      ['MANAGER'],
      ['read:reports'],
      'tenant_1',
    );
    expect(mockAuthorizationService.isAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr_1',
        userRoles: ['MANAGER'],
        requiredRoles: ['MANAGER'],
        requiredPermissions: ['read:reports'],
      }),
    );
  });

  it('should throw ForbiddenException if IAuthorizationService denies access', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    mockAuthorizationService.isAuthorized.mockResolvedValue(false);

    const userPayload: RequestUserPayload = {
      id: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['USER'],
      permissions: [],
    };
    const context = createMockContext(userPayload);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
