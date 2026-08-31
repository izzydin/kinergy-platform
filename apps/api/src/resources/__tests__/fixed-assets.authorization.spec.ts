import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';

describe('FixedAssetsController Authorization & RBAC Evaluation (Milestone 6.7)', () => {
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
    handlerName: keyof FixedAssetsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => FixedAssetsController.prototype[handlerName],
      getClass: () => FixedAssetsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('1. Fixed Asset Standard Mutations (Require assets.write)', () => {
    it('allows createAsset when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_01',
        email: 'owner@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('createAsset', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies createAsset when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('createAsset', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows updateDetails when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_admin_01',
        email: 'admin@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('updateDetails', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies updateDetails when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('updateDetails', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows transferLocation when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_lead',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('transferLocation', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies transferLocation when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_02',
        email: 'reception2@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('transferLocation', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows changeStatus when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_super_admin',
        email: 'superadmin@kinergy.platform',
        status: 'ACTIVE',
        roles: ['SUPER_ADMIN'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('changeStatus', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies changeStatus when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_03',
        email: 'trainer3@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('changeStatus', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows changeCondition when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_tech',
        email: 'tech@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('changeCondition', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies changeCondition when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_03',
        email: 'reception3@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('changeCondition', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows recordMaintenance when user possesses assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_maint',
        email: 'maint@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.write'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('recordMaintenance', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write'],
        }),
      );
    });

    it('denies recordMaintenance when user lacks assets.write permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_read',
        email: 'trainer_read@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.write'),
      );

      const context = createMockContext('recordMaintenance', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Sensitive Asset Valuation Mutation (Requires assets.write AND billing.read)', () => {
    it('allows updateValuation when user possesses BOTH assets.write and billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_cfo',
        email: 'cfo@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['assets.write', 'billing.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('updateValuation', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.write', 'billing.read'],
        }),
      );
    });

    it('denies updateValuation when user has assets.write but lacks billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_ops',
        email: 'ops@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.write'], // Lacks billing.read
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Access denied: missing required permission billing.read for asset valuation mutation.',
        ),
      );

      const context = createMockContext('updateValuation', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Fixed Asset Read Operations (Require assets.read)', () => {
    it('allows listAssets when user possesses assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('listAssets', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.read'],
        }),
      );
    });

    it('denies listAssets when user lacks assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_cook',
        email: 'kitchen@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read', 'inventory.write'], // Lacks assets.read
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.read'),
      );

      const context = createMockContext('listAssets', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows getAsset when user possesses assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_reception_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getAsset', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.read'],
        }),
      );
    });

    it('denies getAsset when user lacks assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_client',
        email: 'client@kinergy.platform',
        status: 'ACTIVE',
        roles: ['CLIENT'],
        permissions: ['client.portal'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.read'),
      );

      const context = createMockContext('getAsset', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows getAssetHistory when user possesses assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_admin_audit',
        email: 'audit@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getAssetHistory', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.read'],
        }),
      );
    });

    it('denies getAssetHistory when user lacks assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_guest',
        email: 'guest@kinergy.platform',
        status: 'ACTIVE',
        roles: ['CLIENT'],
        permissions: ['client.portal'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.read'),
      );

      const context = createMockContext('getAssetHistory', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows getMaintenanceHistory when user possesses assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_maint',
        email: 'maint@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getMaintenanceHistory', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.read'],
        }),
      );
    });

    it('denies getMaintenanceHistory when user lacks assets.read permission', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_kitchen_staff',
        email: 'kitchen@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Access denied: missing required permission assets.read'),
      );

      const context = createMockContext('getMaintenanceHistory', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Sensitive Fixed Asset Valuation Query (Requires assets.read AND billing.read)', () => {
    it('allows getAssetValue when user possesses BOTH assets.read and billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_owner_cfo',
        email: 'cfo@kinergy.platform',
        status: 'ACTIVE',
        roles: ['OWNER'],
        permissions: ['assets.read', 'billing.read'],
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());

      const context = createMockContext('getAssetValue', user);
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          requiredPermissions: ['assets.read', 'billing.read'],
        }),
      );
    });

    it('denies getAssetValue with ForbiddenException when operational user lacks billing.read', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_trainer_lead',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read', 'assets.write'], // Lacks billing.read
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Access denied: missing required billing.read permission for asset valuation.',
        ),
      );

      const context = createMockContext('getAssetValue', user);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Unauthenticated Invariant', () => {
    it('throws UnauthorizedException when request context is unauthenticated', async () => {
      const context = createMockContext('createAsset', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
