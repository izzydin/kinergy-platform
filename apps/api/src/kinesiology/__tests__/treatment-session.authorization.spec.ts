import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';

describe('TreatmentSession Authorization & RBAC Evaluation', () => {
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
    requiredPermissions?: string[],
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    const handler = () => {};
    if (requiredPermissions) {
      Reflect.defineMetadata('permissions', requiredPermissions, handler);
    }

    return {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access when user has kinesiology.sessions.assign permission', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_supervisor_1',
      email: 'supervisor@kinergy.com',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      permissions: ['kinesiology.sessions.assign'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext(['kinesiology.sessions.assign'], user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['kinesiology.sessions.assign'],
      }),
    );
  });

  it('denies access when user lacks kinesiology.sessions.assign permission', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_receptionist_1',
      email: 'reception@kinergy.com',
      status: 'ACTIVE',
      roles: ['RECEPTIONIST'],
      permissions: ['appointments.read'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(
      AuthorizationDecision.denied('PERMISSIONS', 'Access denied: required permission missing'),
    );

    const context = createMockContext(['kinesiology.sessions.assign'], user);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('allows clinician with kinesiology.sessions.treat to document and conduct session', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_therapist_1',
      email: 'therapist@kinergy.com',
      status: 'ACTIVE',
      roles: ['THERAPIST'],
      permissions: ['kinesiology.sessions.treat', 'kinesiology.sessions.read'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext(['kinesiology.sessions.treat'], user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('prohibits unauthenticated requests when permissions are required', async () => {
    const context = createMockContext(['kinesiology.sessions.assign'], undefined);
    await expect(guard.canActivate(context)).rejects.toThrow();
  });
});
