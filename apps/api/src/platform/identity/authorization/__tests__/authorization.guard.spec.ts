import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUserContext } from '../../context/authenticated-user-context';
import { AuthorizationGuard } from '../authorization.guard';
import { IAuthorizationEvaluator } from '../authorization-evaluator.interface';
import { AuthorizationDecision } from '../models/authorization-decision.model';

describe('AuthorizationGuard', () => {
  let guard: AuthorizationGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;

  const createMockContext = (user?: AuthenticatedUserContext): ExecutionContext => {
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

    mockEvaluator = {
      evaluate: jest.fn().mockResolvedValue(AuthorizationDecision.authorized()),
    };

    guard = new AuthorizationGuard(mockReflector, mockEvaluator);
  });

  it('should pass through if neither required roles nor permissions are specified on route', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if user context is missing when roles/permissions are required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should delegate policy requirements to IAuthorizationEvaluator', async () => {
    mockReflector.getAllAndOverride
      .mockReturnValueOnce(['MANAGER']) // requiredRoles
      .mockReturnValueOnce(['read:reports']); // requiredPermissions

    const userContext = new AuthenticatedUserContext({
      userId: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['MANAGER'],
      permissions: ['read:reports'],
      tenantId: 'tenant_1',
    });
    const context = createMockContext(userContext);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      userContext,
      expect.objectContaining({
        requiredRoles: ['MANAGER'],
        requiredPermissions: ['read:reports'],
      }),
    );
  });

  it('should throw ForbiddenException if IAuthorizationEvaluator returns denied decision', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    mockEvaluator.evaluate.mockResolvedValue(
      AuthorizationDecision.denied('Required role missing.', 'ROLES'),
    );

    const userContext = new AuthenticatedUserContext({
      userId: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['USER'],
      permissions: [],
    });
    const context = createMockContext(userContext);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should allow access when principal has required permission', async () => {
    mockReflector.getAllAndOverride
      .mockReturnValueOnce(undefined) // requiredRoles
      .mockReturnValueOnce(['sales.read']); // requiredPermissions

    mockEvaluator.evaluate.mockResolvedValue(AuthorizationDecision.authorized());

    const userContext = new AuthenticatedUserContext({
      userId: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['RECEPTIONIST'],
      permissions: ['sales.read'],
    });
    const context = createMockContext(userContext);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      userContext,
      expect.objectContaining({ requiredPermissions: ['sales.read'] }),
    );
  });

  it('should deny access and throw ForbiddenException when principal lacks permission', async () => {
    mockReflector.getAllAndOverride
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['payments.manage']);

    mockEvaluator.evaluate.mockResolvedValue(
      AuthorizationDecision.denied('Access denied: required permission missing.', 'PERMISSIONS'),
    );

    const userContext = new AuthenticatedUserContext({
      userId: 'usr_1',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['KITCHEN_STAFF'],
      permissions: ['payments.create'],
    });
    const context = createMockContext(userContext);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Access denied: required permission missing.'),
    );
  });

  it('should reconstitute plain object request.user into AuthenticatedUserContext', async () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(['MANAGER']);

    const plainUser = {
      userId: 'usr_plain_1',
      email: 'manager@example.com',
      status: 'ACTIVE',
      roles: ['MANAGER'],
      permissions: ['sales.read'],
      tenantId: 'tenant_1',
    };
    const mockRequest = { user: plainUser };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      expect.any(AuthenticatedUserContext),
      expect.anything(),
    );
  });

  it('should reconstitute plain object with id property when userId is absent', async () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(['ADMIN']);

    const plainUser = {
      id: 'usr_id_fallback',
      email: 'admin@example.com',
      status: 'ACTIVE',
      roles: ['ADMIN'],
    };
    const mockRequest = { user: plainUser };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr_id_fallback' }),
      expect.anything(),
    );
  });

  it('should fail closed with UnauthorizedException when request.user has empty userId', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    const mockRequest = { user: { userId: '   ', roles: ['ADMIN'] } };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Authentication required before authorization check.',
    );
  });

  it('should fail closed with UnauthorizedException when user status is inactive', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    const inactiveUser = new AuthenticatedUserContext({
      userId: 'usr_suspended',
      email: 'user@example.com',
      status: 'SUSPENDED',
      roles: ['ADMIN'],
      permissions: [],
    });
    const context = createMockContext(inactiveUser);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'User account is inactive or disabled.',
    );
  });
});
