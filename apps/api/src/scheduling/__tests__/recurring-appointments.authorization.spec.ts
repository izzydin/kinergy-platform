import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { RecurringAppointmentsController } from '../controllers/recurring-appointments.controller';

describe('RecurringAppointmentsController Authorization & RBAC Evaluation', () => {
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
    handlerName: keyof RecurringAppointmentsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => RecurringAppointmentsController.prototype[handlerName],
      getClass: () => RecurringAppointmentsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access when user has required appointments.create permission for createSeries', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_receptionist',
      email: 'reception@kinergy.com',
      status: 'ACTIVE',
      roles: ['RECEPTIONIST'],
      permissions: ['appointments.create'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('createSeries', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['appointments.create'],
      }),
    );
  });

  it('allows access when user has required appointments.update permission for skipOccurrence', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_therapist',
      email: 'therapist@kinergy.com',
      status: 'ACTIVE',
      roles: ['THERAPIST'],
      permissions: ['appointments.update'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('skipOccurrence', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['appointments.update'],
      }),
    );
  });

  it('allows access when user has required appointments.delete permission for cancelSeries', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_admin',
      email: 'admin@kinergy.com',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      permissions: ['appointments.delete'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

    const context = createMockContext('cancelSeries', user);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        requiredPermissions: ['appointments.delete'],
      }),
    );
  });

  it('rejects with ForbiddenException when user lacks required permission', async () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_unprivileged',
      email: 'member@kinergy.com',
      status: 'ACTIVE',
      roles: ['MEMBER'],
      permissions: ['read:own_profile'],
    });

    mockEvaluator.evaluate.mockResolvedValueOnce(
      AuthorizationDecision.denied('Missing permission: appointments.create'),
    );

    const context = createMockContext('createSeries', user);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rejects with UnauthorizedException when no user context is provided', async () => {
    const context = createMockContext('createSeries', undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
