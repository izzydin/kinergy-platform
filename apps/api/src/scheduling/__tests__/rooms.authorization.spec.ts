import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { RoomsController } from '../controllers/rooms.controller';

describe('RoomsController Authorization & RBAC Evaluation', () => {
  let guard: AuthorizationGuard;
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;

  beforeEach(() => {
    reflector = new Reflector();
    mockEvaluator = {
      evaluate: jest.fn(),
    };
    guard = new AuthorizationGuard(reflector, mockEvaluator);
  });

  const createMockContext = (
    handlerName: keyof RoomsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => RoomsController.prototype[handlerName],
      getClass: () => RoomsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access when user has settings.write permission for createRoom', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_owner',
      email: 'owner@kinergy.com',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['settings.write'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('createRoom', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['settings.write'],
      }),
    );
  });

  it('allows access when user has settings.read permission for listRooms', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_trainer',
      email: 'trainer@kinergy.com',
      status: 'ACTIVE',
      roles: ['TRAINER'],
      permissions: ['settings.read'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('listRooms', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['settings.read'],
      }),
    );
  });

  it('allows access when user has appointments.read permission for checkAvailability', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_receptionist',
      email: 'reception@kinergy.com',
      status: 'ACTIVE',
      roles: ['RECEPTIONIST'],
      permissions: ['appointments.read'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('checkAvailability', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['appointments.read'],
      }),
    );
  });

  it('denies access with ForbiddenException when user lacks required permission', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_guest',
      email: 'guest@kinergy.com',
      status: 'ACTIVE',
      roles: ['GUEST'],
      permissions: [],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(
      AuthorizationDecision.denied('Missing required permission'),
    );

    const context = createMockContext('createRoom', user);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
