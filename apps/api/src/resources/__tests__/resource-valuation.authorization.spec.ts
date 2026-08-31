import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { ResourceValuationController } from '../controllers/resource-valuation.controller';
import {
  GetInventoryValuationHandler,
  GetFixedAssetValuationSummaryHandler,
  GetCombinedResourceValuationHandler,
  ResourcesApplicationResult,
} from '@kinergy-platform/core';

describe('Resource Valuation Security & Authorization Gates (Milestone 6.8)', () => {
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;
  let guard: AuthorizationGuard;

  let mockInventoryValuationHandler: jest.Mocked<GetInventoryValuationHandler>;
  let mockFixedAssetValuationSummaryHandler: jest.Mocked<GetFixedAssetValuationSummaryHandler>;
  let mockCombinedValuationHandler: jest.Mocked<GetCombinedResourceValuationHandler>;

  let inventoryController: InventoryController;
  let fixedAssetsController: FixedAssetsController;
  let resourceValuationController: ResourceValuationController;

  beforeEach(() => {
    reflector = new Reflector();
    mockEvaluator = {
      evaluate: jest.fn(),
    };
    guard = new AuthorizationGuard(reflector, mockEvaluator);

    mockInventoryValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryValuationHandler>;

    mockFixedAssetValuationSummaryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetValuationSummaryHandler>;

    mockCombinedValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCombinedResourceValuationHandler>;

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
      mockFixedAssetValuationSummaryHandler,
    );

    resourceValuationController = new ResourceValuationController(mockCombinedValuationHandler);
  });

  const createInventoryContext = (
    handlerName: keyof InventoryController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext =>
    ({
      getHandler: () => InventoryController.prototype[handlerName],
      getClass: () => InventoryController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    }) as unknown as ExecutionContext;

  const createAssetContext = (
    handlerName: keyof FixedAssetsController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext =>
    ({
      getHandler: () => FixedAssetsController.prototype[handlerName],
      getClass: () => FixedAssetsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    }) as unknown as ExecutionContext;

  const createValuationContext = (
    handlerName: keyof ResourceValuationController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext =>
    ({
      getHandler: () => ResourceValuationController.prototype[handlerName],
      getClass: () => ResourceValuationController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userContext }),
      }),
    }) as unknown as ExecutionContext;

  describe('1. Inventory Valuation Endpoint Security (GET /resources/inventory/valuation)', () => {
    const validUser = new AuthenticatedUserContext({
      userId: 'usr_owner_01',
      email: 'owner@kinergy.platform',
      status: 'ACTIVE',
      roles: ['OWNER'],
      permissions: ['inventory.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('allows access when user possesses both inventory.read AND billing.read', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createInventoryContext('getValuation', validUser);

      const canActivate = await guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('blocks access when user has inventory.read but lacks billing.read', async () => {
      const unauthorizedUser = new AuthenticatedUserContext({
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
      const context = createInventoryContext('getValuation', unauthorizedUser);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('returns inventory valuation payload when authorized', async () => {
      mockInventoryValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalValueAmount: 307.5,
          currency: 'USD',
          totalDistinctItems: 1,
          totalQuantityUnits: 15,
          calculatedAt: '2026-08-31T12:00:00.000Z',
          breakdownByCategory: {},
          items: [],
        }),
      );

      const result = await inventoryController.getValuation(validUser);
      expect(result.totalValueAmount).toBe(307.5);
      expect(result.totalDistinctItems).toBe(1);
    });
  });

  describe('2. Fixed Asset Estate Valuation Summary Endpoint Security (GET /resources/assets/valuation/summary)', () => {
    const validUser = new AuthenticatedUserContext({
      userId: 'usr_gm_01',
      email: 'gm@kinergy.platform',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      permissions: ['assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('allows access when user possesses both assets.read AND billing.read', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createAssetContext('getValuationSummary', validUser);

      const canActivate = await guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('blocks access when user lacks billing.read', async () => {
      const unauthorizedUser = new AuthenticatedUserContext({
        userId: 'usr_reception_01',
        email: 'reception@kinergy.platform',
        status: 'ACTIVE',
        roles: ['RECEPTIONIST'],
        permissions: ['assets.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: billing.read'),
      );
      const context = createAssetContext('getValuationSummary', unauthorizedUser);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('returns fixed asset estate valuation summary when authorized', async () => {
      mockFixedAssetValuationSummaryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCarryingValueAmount: 6700.0,
          totalPurchaseValueAmount: 8500.0,
          currency: 'USD',
          totalAssetCount: 3,
          activeAssetCount: 3,
          calculatedAt: '2026-08-31T12:00:00.000Z',
          breakdownByCategory: {},
          breakdownByStatus: {},
          breakdownByCondition: {},
        }),
      );

      const result = await fixedAssetsController.getValuationSummary(validUser);
      expect(result.totalCarryingValueAmount).toBe(6700.0);
      expect(result.totalPurchaseValueAmount).toBe(8500.0);
    });
  });

  describe('3. Combined Resource Valuation Summary Endpoint Security (GET /resources/valuation/summary)', () => {
    const validUser = new AuthenticatedUserContext({
      userId: 'usr_cfo_01',
      email: 'cfo@kinergy.platform',
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
      permissions: ['inventory.read', 'assets.read', 'billing.read'],
      tenantId: 'tenant_01',
    });

    it('allows access when user possesses full composed valuation permissions', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(AuthorizationDecision.authorized());
      const context = createValuationContext('getCombinedSummary', validUser);

      const canActivate = await guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('blocks access when user is missing any of the three composed permissions', async () => {
      const partialUser = new AuthenticatedUserContext({
        userId: 'usr_partial_01',
        email: 'partial@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'billing.read'],
        tenantId: 'tenant_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.read'),
      );
      const context = createValuationContext('getCombinedSummary', partialUser);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('successfully calls handler and returns combined payload when authorized', async () => {
      mockCombinedValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCombinedValueAmount: 1500.5,
          totalCombinedPurchaseValueAmount: 2000.0,
          currency: 'USD',
          inventory: {
            totalValueAmount: 500.5,
            totalDistinctItems: 10,
            totalQuantityUnits: 120,
            sharePercentage: 33.36,
          },
          fixedAssets: {
            totalCarryingValueAmount: 1000.0,
            totalPurchaseValueAmount: 1500.0,
            totalAssetCount: 5,
            activeAssetCount: 4,
            sharePercentage: 66.64,
          },
          calculatedAt: '2026-08-31T12:00:00.000Z',
        }),
      );

      const result = await resourceValuationController.getCombinedSummary(validUser);
      expect(result.totalCombinedValueAmount).toBe(1500.5);
      expect(result.inventory.sharePercentage).toBe(33.36);
      expect(result.fixedAssets.sharePercentage).toBe(66.64);
    });
  });
});
