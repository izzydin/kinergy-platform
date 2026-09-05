import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { IAccessTokenService } from '../../platform/identity/tokens/access-token.service';
import { IUserRepository, User, UserStatus } from '../../platform/identity/domain';
import { ResourceOverviewController } from '../controllers/resource-overview.controller';
import { GetResourceOverviewHandler, ResourcesApplicationResult } from '@kinergy-platform/core';

describe('Resource Overview Authorization & Security Gate', () => {
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;
  let mockTokenService: jest.Mocked<IAccessTokenService>;
  let mockUserRepo: jest.Mocked<IUserRepository>;

  let authGuard: AuthenticationGuard;
  let authzGuard: AuthorizationGuard;

  let mockOverviewHandler: jest.Mocked<GetResourceOverviewHandler>;
  let controller: ResourceOverviewController;

  beforeEach(() => {
    reflector = new Reflector();
    mockEvaluator = {
      evaluate: jest.fn(),
    };
    mockTokenService = {
      generateTokens: jest.fn(),
      validateToken: jest.fn(),
      revokeToken: jest.fn(),
    } as unknown as jest.Mocked<IAccessTokenService>;
    mockUserRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    authGuard = new AuthenticationGuard(reflector, mockTokenService, mockUserRepo);
    authzGuard = new AuthorizationGuard(reflector, mockEvaluator);

    mockOverviewHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetResourceOverviewHandler>;

    controller = new ResourceOverviewController(mockOverviewHandler);
  });

  const createOverviewContext = (
    userContext?: AuthenticatedUserContext,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => ResourceOverviewController.prototype.getOverview,
      getClass: () => ResourceOverviewController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext, headers }),
      }),
    }) as unknown as ExecutionContext;

  describe('1. Unauthenticated Requests Protection (AuthenticationGuard)', () => {
    it('rejects request when no Bearer authorization header is provided', async () => {
      const context = createOverviewContext(undefined, {});
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects request when bearer token is invalid or expired', async () => {
      mockTokenService.validateToken.mockResolvedValueOnce(null);
      const context = createOverviewContext(undefined, {
        authorization: 'Bearer expired_or_tampered_token',
      });
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects request when user account is inactive', async () => {
      mockTokenService.validateToken.mockResolvedValueOnce({
        sub: 'usr_inactive_01',
        email: 'inactive@kinergy.platform',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'assets.read', 'billing.read'],
        tenantId: 'tenant_01',
        tokenVersion: 1,
      });
      mockUserRepo.findById.mockResolvedValueOnce(
        new User({
          id: 'usr_inactive_01',
          email: 'inactive@kinergy.platform',
          passwordHash: 'hashed_pw',
          status: UserStatus.INACTIVE,
          roles: ['ADMIN'],
          permissions: ['inventory.read', 'assets.read', 'billing.read'],
          tenantId: 'tenant_01',
          tokenVersion: 1,
        }),
      );

      const context = createOverviewContext(undefined, {
        authorization: 'Bearer valid_jwt_token',
      });
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('2. Declarative Decorators & Permission Composition Matrix (ADR-0094)', () => {
    it('declares Roles: ADMIN, SUPER_ADMIN, OWNER', () => {
      const roles = reflector.get<string[]>(
        'roles',
        ResourceOverviewController.prototype.getOverview,
      );
      expect(roles).toEqual(expect.arrayContaining(['ADMIN', 'SUPER_ADMIN', 'OWNER']));
      expect(roles.length).toBe(3);
    });

    it('declares Permissions: inventory.read, assets.read, billing.read', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        ResourceOverviewController.prototype.getOverview,
      );
      expect(permissions).toEqual(
        expect.arrayContaining(['inventory.read', 'assets.read', 'billing.read']),
      );
      expect(permissions.length).toBe(3);
    });

    it('allows access when user possesses all three permissions (inventory.read, assets.read, billing.read)', async () => {
      const fullAuthUser = new AuthenticatedUserContext({
        userId: 'usr_admin_01',
        email: 'admin@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'assets.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createOverviewContext(fullAuthUser);

      const canActivate = await authzGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        fullAuthUser,
        expect.objectContaining({
          requiredPermissions: ['inventory.read', 'assets.read', 'billing.read'],
        }),
      );
    });

    it('denies access when user lacks assets.read permission', async () => {
      const missingAssetsUser = new AuthenticatedUserContext({
        userId: 'usr_inv_mgr',
        email: 'inv@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.read'),
      );
      const context = createOverviewContext(missingAssetsUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access when user lacks inventory.read permission', async () => {
      const missingInventoryUser = new AuthenticatedUserContext({
        userId: 'usr_asset_mgr',
        email: 'asset@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['assets.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.read'),
      );
      const context = createOverviewContext(missingInventoryUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access when user lacks billing.read permission', async () => {
      const missingBillingUser = new AuthenticatedUserContext({
        userId: 'usr_staff_01',
        email: 'staff@kinergy.platform',
        status: 'ACTIVE',
        roles: ['STAFF'],
        permissions: ['inventory.read', 'assets.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: billing.read'),
      );
      const context = createOverviewContext(missingBillingUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Controller Execution & Clean Domain Separation (ADR-0081, ADR-0098)', () => {
    it('executes handler and returns full overview payload with separated inventory and fixed assets', async () => {
      const user = new AuthenticatedUserContext({
        userId: 'usr_admin_01',
        email: 'admin@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'assets.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockOverviewHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          consumableInventory: {
            totalValueAmount: 12500.5,
            lowStockItemCount: 2,
            totalDistinctItems: 25,
            totalQuantityUnits: 400,
          },
          fixedAssets: {
            totalCarryingValueAmount: 85000.0,
            activeAssetCount: 10,
            underMaintenanceAssetCount: 1,
            damagedAssetCount: 0,
            retiredAssetCount: 1,
            totalAssetCount: 12,
          },
          combined: {
            totalCombinedValueAmount: 97500.5,
          },
          currency: 'USD',
          calculatedAt: '2026-09-05T12:00:00.000Z',
        }),
      );

      const response = await controller.getOverview(user);

      expect(response.consumableInventory.totalValueAmount).toBe(12500.5);
      expect(response.consumableInventory.lowStockItemCount).toBe(2);
      expect(response.fixedAssets.totalCarryingValueAmount).toBe(85000.0);
      expect(response.fixedAssets.activeAssetCount).toBe(10);
      expect(response.combined.totalCombinedValueAmount).toBe(97500.5);
      expect(response.currency).toBe('USD');
    });
  });
});
