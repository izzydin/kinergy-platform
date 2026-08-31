import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { IAccessTokenService } from '../../platform/identity/tokens/access-token.service';
import { IUserRepository, User, UserStatus } from '../../platform/identity/domain';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { ResourceValuationController } from '../controllers/resource-valuation.controller';
import {
  GetInventoryValuationHandler,
  GetFixedAssetValuationSummaryHandler,
  GetCombinedResourceValuationHandler,
  GetAssetValueHandler,
  InventoryCategory,
  ResourcesApplicationResult,
} from '@kinergy-platform/core';

describe('Resource Valuation Security & API Contract Quality Gate (Milestone 6.8)', () => {
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;
  let mockTokenService: jest.Mocked<IAccessTokenService>;
  let mockUserRepo: jest.Mocked<IUserRepository>;

  let authGuard: AuthenticationGuard;
  let authzGuard: AuthorizationGuard;

  let mockInventoryValuationHandler: jest.Mocked<GetInventoryValuationHandler>;
  let mockFixedAssetValuationSummaryHandler: jest.Mocked<GetFixedAssetValuationSummaryHandler>;
  let mockCombinedValuationHandler: jest.Mocked<GetCombinedResourceValuationHandler>;
  let mockGetAssetValueHandler: jest.Mocked<GetAssetValueHandler>;

  let inventoryController: InventoryController;
  let fixedAssetsController: FixedAssetsController;
  let resourceValuationController: ResourceValuationController;

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

    mockInventoryValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryValuationHandler>;

    mockFixedAssetValuationSummaryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetValuationSummaryHandler>;

    mockCombinedValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCombinedResourceValuationHandler>;

    mockGetAssetValueHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetAssetValueHandler>;

    const createMock = <T>(): jest.Mocked<T> =>
      ({ execute: jest.fn() }) as unknown as jest.Mocked<T>;

    inventoryController = new InventoryController(
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      mockInventoryValuationHandler,
    );

    fixedAssetsController = new FixedAssetsController(
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      createMock(),
      mockGetAssetValueHandler,
      mockFixedAssetValuationSummaryHandler,
    );

    resourceValuationController = new ResourceValuationController(mockCombinedValuationHandler);
  });

  const createInventoryContext = (
    handlerName: keyof InventoryController,
    userContext?: AuthenticatedUserContext,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => InventoryController.prototype[handlerName],
      getClass: () => InventoryController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext, headers }),
      }),
    }) as unknown as ExecutionContext;

  const createAssetContext = (
    handlerName: keyof FixedAssetsController,
    userContext?: AuthenticatedUserContext,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => FixedAssetsController.prototype[handlerName],
      getClass: () => FixedAssetsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext, headers }),
      }),
    }) as unknown as ExecutionContext;

  const createValuationContext = (
    handlerName: keyof ResourceValuationController,
    userContext?: AuthenticatedUserContext,
    headers: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => ResourceValuationController.prototype[handlerName],
      getClass: () => ResourceValuationController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext, headers }),
      }),
    }) as unknown as ExecutionContext;

  // --------------------------------------------------------------------------
  // 1. UNAUTHENTICATED REQUESTS (AuthenticationGuard Rejections)
  // --------------------------------------------------------------------------
  describe('1. Unauthenticated Requests Protection', () => {
    it('rejects inventory valuation request when no Bearer authorization header is provided', async () => {
      const context = createInventoryContext('getValuation', undefined, {});
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects asset valuation summary request when token is invalid or expired', async () => {
      mockTokenService.validateToken.mockResolvedValueOnce(null);
      const context = createAssetContext('getValuationSummary', undefined, {
        authorization: 'Bearer invalid_token_xyz',
      });
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects combined valuation request when user account is inactive', async () => {
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

      const context = createValuationContext('getCombinedSummary', undefined, {
        authorization: 'Bearer valid_jwt_token',
      });
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  // --------------------------------------------------------------------------
  // 2. AUTHORIZED & UNAUTHORIZED REQUESTS (Phase 6.7 Authorization Matrix)
  // --------------------------------------------------------------------------
  describe('2. Authorization Matrix Enforcement & Permission Composition', () => {
    const ownerUser = new AuthenticatedUserContext({
      userId: 'usr_owner_01',
      email: 'owner@kinergy.platform',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('allows inventory valuation for user possessing inventory.read AND billing.read', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createInventoryContext('getValuation', ownerUser);

      const canActivate = await authzGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        ownerUser,
        expect.objectContaining({
          requiredPermissions: ['inventory.read', 'billing.read'],
        }),
      );
    });

    it('denies inventory valuation for operational staff lacking billing.read (e.g. TRAINER)', async () => {
      const trainerUser = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: billing.read'),
      );
      const context = createInventoryContext('getValuation', trainerUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows fixed asset estate valuation summary for user possessing assets.read AND billing.read', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createAssetContext('getValuationSummary', ownerUser);

      const canActivate = await authzGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        ownerUser,
        expect.objectContaining({
          requiredPermissions: ['assets.read', 'billing.read'],
        }),
      );
    });

    it('denies fixed asset estate valuation for receptionist lacking billing.read', async () => {
      const receptionist = new AuthenticatedUserContext({
        userId: 'usr_recept_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: billing.read'),
      );
      const context = createAssetContext('getValuationSummary', receptionist);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('allows individual asset valuation for user possessing assets.read AND billing.read', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createAssetContext('getAssetValue', ownerUser);

      const canActivate = await authzGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        ownerUser,
        expect.objectContaining({
          requiredPermissions: ['assets.read', 'billing.read'],
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. COMBINED-VALUE AUTHORIZATION BEHAVIOR (Triple Composition)
  // --------------------------------------------------------------------------
  describe('3. Combined Resource Valuation Authorization Multi-Perm Composition', () => {
    const fullAuthUser = new AuthenticatedUserContext({
      userId: 'usr_cfo_01',
      email: 'cfo@kinergy.platform',
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('allows access when user possesses ALL THREE required permissions', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createValuationContext('getCombinedSummary', fullAuthUser);

      const canActivate = await authzGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(
        fullAuthUser,
        expect.objectContaining({
          requiredPermissions: ['inventory.read', 'assets.read', 'billing.read'],
        }),
      );
    });

    it('denies access when user has inventory.read and billing.read but lacks assets.read', async () => {
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
      const context = createValuationContext('getCombinedSummary', missingAssetsUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access when user has assets.read and billing.read but lacks inventory.read', async () => {
      const missingInventoryUser = new AuthenticatedUserContext({
        userId: 'usr_asset_mgr',
        email: 'assets@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['assets.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.read'),
      );
      const context = createValuationContext('getCombinedSummary', missingInventoryUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access when user has inventory.read and assets.read but lacks billing.read', async () => {
      const missingBillingUser = new AuthenticatedUserContext({
        userId: 'usr_operations',
        email: 'ops@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['inventory.read', 'assets.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: billing.read'),
      );
      const context = createValuationContext('getCombinedSummary', missingBillingUser);

      await expect(authzGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // --------------------------------------------------------------------------
  // 4. RESPONSE FORMAT & SCHEMA COMPLIANCE
  // --------------------------------------------------------------------------
  describe('4. Response Format & Schema Compliance', () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_owner_01',
      email: 'owner@kinergy.platform',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('formats inventory valuation response with all required metadata', async () => {
      mockInventoryValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalValueAmount: 307.5,
          currency: 'USD',
          totalDistinctItems: 5,
          totalQuantityUnits: 120,
          calculatedAt: '2026-08-31T12:00:00.000Z',
          breakdownByCategory: {},
          items: [],
        }),
      );

      const response = await inventoryController.getValuation(user);
      expect(response).toEqual({
        totalValueAmount: 307.5,
        currency: 'USD',
        totalDistinctItems: 5,
        totalQuantityUnits: 120,
        calculatedAt: '2026-08-31T12:00:00.000Z',
      });
    });

    it('formats fixed asset estate valuation summary with category, status, and condition breakdowns', async () => {
      mockFixedAssetValuationSummaryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCarryingValueAmount: 6700.0,
          totalPurchaseValueAmount: 8500.0,
          currency: 'USD',
          totalAssetCount: 3,
          activeAssetCount: 3,
          calculatedAt: '2026-08-31T12:00:00.000Z',
          breakdownByCategory: {
            TRAINING_EQUIPMENT: {
              totalCarryingValueAmount: 6700.0,
              totalPurchaseValueAmount: 8500.0,
              assetCount: 3,
            },
          },
          breakdownByStatus: {
            ACTIVE: { count: 3, totalCarryingValueAmount: 6700.0 },
          },
          breakdownByCondition: {
            EXCELLENT: { count: 2, totalCarryingValueAmount: 5000.0 },
            GOOD: { count: 1, totalCarryingValueAmount: 1700.0 },
          },
        }),
      );

      const response = await fixedAssetsController.getValuationSummary(user);
      expect(response.totalCarryingValueAmount).toBe(6700.0);
      expect(response.totalPurchaseValueAmount).toBe(8500.0);
      expect(response.currency).toBe('USD');
      expect(response.totalAssetCount).toBe(3);
      expect(response.activeAssetCount).toBe(3);
      expect(response.breakdownByCategory['TRAINING_EQUIPMENT']?.assetCount).toBe(3);
      expect(response.breakdownByStatus['ACTIVE']?.count).toBe(3);
      expect(response.breakdownByCondition['EXCELLENT']?.count).toBe(2);
    });

    it('formats combined resource valuation response with exact component share percentages', async () => {
      mockCombinedValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCombinedValueAmount: 7007.5,
          totalCombinedPurchaseValueAmount: 8807.5,
          currency: 'USD',
          inventory: {
            totalValueAmount: 307.5,
            totalDistinctItems: 5,
            totalQuantityUnits: 120,
            sharePercentage: 4.39,
          },
          fixedAssets: {
            totalCarryingValueAmount: 6700.0,
            totalPurchaseValueAmount: 8500.0,
            totalAssetCount: 3,
            activeAssetCount: 3,
            sharePercentage: 95.61,
          },
          calculatedAt: '2026-08-31T12:00:00.000Z',
        }),
      );

      const response = await resourceValuationController.getCombinedSummary(user);
      expect(response.totalCombinedValueAmount).toBe(7007.5);
      expect(response.totalCombinedPurchaseValueAmount).toBe(8807.5);
      expect(response.inventory.sharePercentage).toBe(4.39);
      expect(response.fixedAssets.sharePercentage).toBe(95.61);
      expect(
        Math.round(
          (response.inventory.sharePercentage + response.fixedAssets.sharePercentage) * 100,
        ) / 100,
      ).toBe(100.0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. CORRECT PRECISION SERIALIZATION & ARITHMETIC CONSISTENCY
  // --------------------------------------------------------------------------
  describe('5. Exact Precision Serialization & Component Sum Invariants', () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_owner_01',
      email: 'owner@kinergy.platform',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('guarantees combinedValue = inventoryValue + fixedAssetValue exactly in cents without floating-point drift', async () => {
      const invVal = 1000.33;
      const assetVal = 2000.67;
      const expectedCombined = 3001.0;

      mockCombinedValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCombinedValueAmount: expectedCombined,
          totalCombinedPurchaseValueAmount: 3500.0,
          currency: 'USD',
          inventory: {
            totalValueAmount: invVal,
            totalDistinctItems: 1,
            totalQuantityUnits: 10,
            sharePercentage: 33.33,
          },
          fixedAssets: {
            totalCarryingValueAmount: assetVal,
            totalPurchaseValueAmount: 2500.0,
            totalAssetCount: 1,
            activeAssetCount: 1,
            sharePercentage: 66.67,
          },
          calculatedAt: '2026-08-31T12:00:00.000Z',
        }),
      );

      const response = await resourceValuationController.getCombinedSummary(user);

      // Verify mathematical equality: combined = inventory + fixedAsset
      const calculatedSum =
        Math.round(
          (response.inventory.totalValueAmount + response.fixedAssets.totalCarryingValueAmount) *
            100,
        ) / 100;
      expect(response.totalCombinedValueAmount).toBe(calculatedSum);
      expect(response.totalCombinedValueAmount).toBe(expectedCombined);
    });
  });

  // --------------------------------------------------------------------------
  // 6. RESTRICTED DATA LEAKAGE SAFEGUARDS (ADR-0095)
  // --------------------------------------------------------------------------
  describe('6. Sensitive Data Leakage Prevention (ADR-0095 Safeguards)', () => {
    const user = new AuthenticatedUserContext({
      userId: 'usr_owner_01',
      email: 'owner@kinergy.platform',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('ensures aggregate inventory valuation does not leak per-product acquisition costs or item lists', async () => {
      mockInventoryValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalValueAmount: 307.5,
          currency: 'USD',
          totalDistinctItems: 5,
          totalQuantityUnits: 120,
          calculatedAt: '2026-08-31T12:00:00.000Z',
          breakdownByCategory: {},
          items: [
            {
              itemId: 'item_01',
              sku: 'WHEY-01',
              name: 'Secret Supplier Protein',
              category: InventoryCategory.SUPPLEMENTS,
              unitCostAmount: 20.5,
              unitCostCurrency: 'USD',
              sellingPriceAmount: 35.0,
              sellingPriceCurrency: 'USD',
              quantityOnHand: 15,
              totalValueAmount: 307.5,
              totalValueCurrency: 'USD',
              unit: 'BOTTLE',
              status: 'ACTIVE',
            },
          ],
        }),
      );

      const response = await inventoryController.getValuation(user);
      const rawResponse = response as unknown as Record<string, unknown>;
      // Response DTO must NOT contain raw item-level supplier pricing
      expect(rawResponse['items']).toBeUndefined();
      expect(rawResponse['purchaseCost']).toBeUndefined();
      expect(response.totalValueAmount).toBe(307.5);
    });

    it('ensures combined valuation summary does not leak raw asset records or individual supplier costs', async () => {
      mockCombinedValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCombinedValueAmount: 7007.5,
          totalCombinedPurchaseValueAmount: 8807.5,
          currency: 'USD',
          inventory: {
            totalValueAmount: 307.5,
            totalDistinctItems: 5,
            totalQuantityUnits: 120,
            sharePercentage: 4.39,
          },
          fixedAssets: {
            totalCarryingValueAmount: 6700.0,
            totalPurchaseValueAmount: 8500.0,
            totalAssetCount: 3,
            activeAssetCount: 3,
            sharePercentage: 95.61,
          },
          calculatedAt: '2026-08-31T12:00:00.000Z',
        }),
      );

      const response = await resourceValuationController.getCombinedSummary(user);
      const rawResponse = response as unknown as Record<string, unknown>;
      expect(rawResponse['individualAssets']).toBeUndefined();
      expect(rawResponse['itemBreakdown']).toBeUndefined();
      expect(rawResponse['supplierInvoices']).toBeUndefined();
    });
  });
});
