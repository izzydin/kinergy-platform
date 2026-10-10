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

  it('should support dot-notation wildcard and backward-compatible permission mappings', async () => {
    // payments.* wildcard
    mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['payments.*']);
    let decision = await evaluator.evaluate(
      defaultUserContext,
      new AuthorizationRequirements({
        requiredPermissions: ['payments.create', 'payments.read'],
      }),
    );
    expect(decision.isAuthorized).toBe(true);

    // billing.read implies payments.read and sales.read
    mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['billing.read']);
    decision = await evaluator.evaluate(
      defaultUserContext,
      new AuthorizationRequirements({
        requiredPermissions: ['payments.read', 'sales.read'],
      }),
    );
    expect(decision.isAuthorized).toBe(true);

    // billing.write implies payments.create and sales.create
    mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['billing.write']);
    decision = await evaluator.evaluate(
      defaultUserContext,
      new AuthorizationRequirements({
        requiredPermissions: ['payments.create', 'sales.create'],
      }),
    );
    expect(decision.isAuthorized).toBe(true);

    // payments.manage implies payments.create and payments.read
    mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['payments.manage']);
    decision = await evaluator.evaluate(
      defaultUserContext,
      new AuthorizationRequirements({
        requiredPermissions: ['payments.create', 'payments.read'],
      }),
    );
    expect(decision.isAuthorized).toBe(true);

    // receipts.manage implies receipts.read
    mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['receipts.manage']);
    decision = await evaluator.evaluate(
      defaultUserContext,
      new AuthorizationRequirements({
        requiredPermissions: ['receipts.read'],
      }),
    );
    expect(decision.isAuthorized).toBe(true);
  });

  describe('Colon-Notation Normalization & Safe Denial (ADR-0135)', () => {
    it('should normalize and match colon notation requirements to canonical dot-notation permissions', async () => {
      // User has canonical dot-notation, requirement uses colon notation
      mockPermissionResolver.resolvePermissions.mockResolvedValueOnce([
        'sales.read',
        'payments.read',
        'receipts.read',
      ]);
      let decision = await evaluator.evaluate(
        defaultUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['sales:read', 'payments:read', 'receipts:read'],
        }),
      );
      expect(decision.isAuthorized).toBe(true);

      // User has colon notation, requirement uses canonical dot-notation
      mockPermissionResolver.resolvePermissions.mockResolvedValueOnce([
        'sales:manage',
        'payments:manage',
      ]);
      decision = await evaluator.evaluate(
        defaultUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['sales.manage', 'payments.manage'],
        }),
      );
      expect(decision.isAuthorized).toBe(true);

      // receipts.manage implies receipts:read
      mockPermissionResolver.resolvePermissions.mockResolvedValueOnce(['receipts.manage']);
      decision = await evaluator.evaluate(
        defaultUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['receipts:read'],
        }),
      );
      expect(decision.isAuthorized).toBe(true);
    });

    it('should safely deny access when caller has invalid, unregistered, or arbitrary permissions', async () => {
      mockPermissionResolver.resolvePermissions.mockResolvedValueOnce([
        'invalid.permission',
        'arbitrary:privilege',
        'sales.read',
      ]);

      const decision = await evaluator.evaluate(
        defaultUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['sales.manage'],
        }),
      );

      expect(decision.isAuthorized).toBe(false);
      expect(decision.failedRequirement).toBe('PERMISSIONS');
      expect(decision.reason).toContain('Access denied: required permission missing.');
    });

    it('should safely deny access when requirement requests an unknown permission code', async () => {
      mockPermissionResolver.resolvePermissions.mockResolvedValueOnce([
        'sales.read',
        'payments.read',
        'receipts.read',
      ]);

      const decision = await evaluator.evaluate(
        defaultUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['unknown.super.admin'],
        }),
      );

      expect(decision.isAuthorized).toBe(false);
      expect(decision.failedRequirement).toBe('PERMISSIONS');
    });

    it('should fail closed and return denied when principal identity userId is empty or missing', async () => {
      const invalidUserContext = new AuthenticatedUserContext({
        userId: '',
        email: 'user@example.com',
        status: 'ACTIVE',
        roles: ['MANAGER'],
        permissions: ['sales.read'],
      });

      const decision = await evaluator.evaluate(
        invalidUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['sales.read'],
        }),
      );

      expect(decision.isAuthorized).toBe(false);
      expect(decision.failedRequirement).toBe('IDENTITY');
      expect(decision.reason).toBe('Access denied: missing authenticated identity.');
    });

    it('should fail closed and return denied when principal account status is inactive or disabled', async () => {
      const inactiveUserContext = new AuthenticatedUserContext({
        userId: 'usr_inactive',
        email: 'user@example.com',
        status: 'SUSPENDED',
        roles: ['MANAGER'],
        permissions: ['sales.read'],
      });

      const decision = await evaluator.evaluate(
        inactiveUserContext,
        new AuthorizationRequirements({
          requiredPermissions: ['sales.read'],
        }),
      );

      expect(decision.isAuthorized).toBe(false);
      expect(decision.failedRequirement).toBe('IDENTITY');
      expect(decision.reason).toBe('Access denied: user account is inactive or disabled.');
    });
  });
});
