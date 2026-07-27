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
});
