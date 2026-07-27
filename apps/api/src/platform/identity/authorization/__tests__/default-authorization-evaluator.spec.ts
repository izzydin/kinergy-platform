import { AuthenticatedUserContext } from '../../context/authenticated-user-context';
import { DefaultAuthorizationEvaluator } from '../default-authorization-evaluator';
import { IPermissionResolver } from '../authorization.interface';
import { AuthorizationRequirements } from '../models/authorization-requirements.model';

describe('DefaultAuthorizationEvaluator', () => {
  let evaluator: DefaultAuthorizationEvaluator;
  let mockPermissionResolver: jest.Mocked<IPermissionResolver>;

  const defaultUserContext = new AuthenticatedUserContext({
    userId: 'usr_100',
    email: 'user@example.com',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: ['reports:read', 'reports:export'],
    tenantId: 'tenant_acme',
  });

  beforeEach(() => {
    mockPermissionResolver = {
      resolvePermissions: jest
        .fn()
        .mockImplementation((_id, _roles, directPerms) => Promise.resolve(directPerms ?? [])),
    };

    evaluator = new DefaultAuthorizationEvaluator(mockPermissionResolver);
  });

  it('should return authorized decision when no policy requirements are defined', async () => {
    const requirements = new AuthorizationRequirements();
    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it('should return authorized decision when user satisfies required role', async () => {
    const requirements = new AuthorizationRequirements({
      requiredRoles: ['MANAGER', 'ADMIN'],
    });

    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(true);
  });

  it('should return denied decision with failure requirement when user lacks required role', async () => {
    const requirements = new AuthorizationRequirements({
      requiredRoles: ['SUPER_ADMIN'],
    });

    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(false);
    expect(decision.failedRequirement).toBe('ROLES');
    expect(decision.reason).toContain('Access denied: required role missing');
  });

  it('should return authorized decision when user satisfies required permissions', async () => {
    const requirements = new AuthorizationRequirements({
      requiredPermissions: ['reports:read', 'reports:export'],
    });

    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(true);
  });

  it('should return denied decision when user lacks required permission', async () => {
    const requirements = new AuthorizationRequirements({
      requiredPermissions: ['reports:delete'],
    });

    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(false);
    expect(decision.failedRequirement).toBe('PERMISSIONS');
    expect(decision.reason).toContain('Access denied: required permission missing');
  });

  it('should support wildcard permission matching (* or prefix:*)', async () => {
    mockPermissionResolver.resolvePermissions.mockResolvedValue(['users:*']);

    const requirements = new AuthorizationRequirements({
      requiredPermissions: ['users:read', 'users:write'],
    });

    const decision = await evaluator.evaluate(defaultUserContext, requirements);

    expect(decision.isAuthorized).toBe(true);
  });
});
