import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { IAuthorizationEvaluator } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { AuthorizationDecision } from '../../platform/identity/authorization/models/authorization-decision.model';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import {
  CreateInventoryItemHandler,
  UpdateInventoryItemHandler,
  ArchiveInventoryItemHandler,
  ActivateInventoryItemHandler,
  DeactivateInventoryItemHandler,
  ReceiveStockHandler,
  SellStockHandler,
  ConsumeStockHandler,
  ScrapStockHandler,
  AdjustStockHandler,
  GetInventoryItemByIdHandler,
  ListInventoryItemsHandler,
  GetStockLevelHandler,
  ListStockMovementsHandler,
  GetLowStockItemsHandler,
  GetInventoryValuationHandler,
  CreateFixedAssetHandler,
  UpdateFixedAssetDetailsHandler,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationHandler,
  GetFixedAssetByIdHandler,
  ListFixedAssetsHandler,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryHandler,
  GetAssetValueHandler,
  GetFixedAssetValuationSummaryHandler,
  ResourcesApplicationResult,
} from '@kinergy-platform/core';

describe('Phase 6 Resources Security Negative Testing & No-Side-Effect Verification (Milestone 6.7)', () => {
  let reflector: Reflector;
  let mockEvaluator: jest.Mocked<IAuthorizationEvaluator>;
  let guard: AuthorizationGuard;

  // Mock handlers
  let mockCreateInventoryItem: jest.Mocked<CreateInventoryItemHandler>;
  let mockUpdateInventoryItem: jest.Mocked<UpdateInventoryItemHandler>;
  let mockArchiveInventoryItem: jest.Mocked<ArchiveInventoryItemHandler>;
  let mockActivateInventoryItem: jest.Mocked<ActivateInventoryItemHandler>;
  let mockDeactivateInventoryItem: jest.Mocked<DeactivateInventoryItemHandler>;
  let mockReceiveStock: jest.Mocked<ReceiveStockHandler>;
  let mockSellStock: jest.Mocked<SellStockHandler>;
  let mockConsumeStock: jest.Mocked<ConsumeStockHandler>;
  let mockScrapStock: jest.Mocked<ScrapStockHandler>;
  let mockAdjustStock: jest.Mocked<AdjustStockHandler>;
  let mockGetInventoryItemById: jest.Mocked<GetInventoryItemByIdHandler>;
  let mockListInventoryItems: jest.Mocked<ListInventoryItemsHandler>;
  let mockGetStockLevel: jest.Mocked<GetStockLevelHandler>;
  let mockListStockMovements: jest.Mocked<ListStockMovementsHandler>;
  let mockGetLowStockItems: jest.Mocked<GetLowStockItemsHandler>;
  let mockGetInventoryValuation: jest.Mocked<GetInventoryValuationHandler>;

  let mockCreateFixedAsset: jest.Mocked<CreateFixedAssetHandler>;
  let mockUpdateFixedAssetDetails: jest.Mocked<UpdateFixedAssetDetailsHandler>;
  let mockTransferFixedAssetLocation: jest.Mocked<TransferFixedAssetLocationHandler>;
  let mockChangeFixedAssetStatus: jest.Mocked<ChangeFixedAssetStatusHandler>;
  let mockUpdateFixedAssetCondition: jest.Mocked<UpdateFixedAssetConditionHandler>;
  let mockRecordAssetMaintenance: jest.Mocked<RecordAssetMaintenanceHandler>;
  let mockUpdateFixedAssetValuation: jest.Mocked<UpdateFixedAssetValuationHandler>;
  let mockGetFixedAssetById: jest.Mocked<GetFixedAssetByIdHandler>;
  let mockListFixedAssets: jest.Mocked<ListFixedAssetsHandler>;
  let mockGetAssetHistory: jest.Mocked<GetAssetHistoryHandler>;
  let mockGetMaintenanceHistory: jest.Mocked<GetMaintenanceHistoryHandler>;
  let mockGetAssetValue: jest.Mocked<GetAssetValueHandler>;
  let mockGetFixedAssetValuationSummary: jest.Mocked<GetFixedAssetValuationSummaryHandler>;

  let inventoryController: InventoryController;
  let fixedAssetsController: FixedAssetsController;

  beforeEach(() => {
    reflector = new Reflector();
    mockEvaluator = {
      evaluate: jest.fn(),
    };
    guard = new AuthorizationGuard(reflector, mockEvaluator);

    // Handlers instantiation
    mockCreateInventoryItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateInventoryItemHandler>;
    mockUpdateInventoryItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateInventoryItemHandler>;
    mockArchiveInventoryItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ArchiveInventoryItemHandler>;
    mockActivateInventoryItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivateInventoryItemHandler>;
    mockDeactivateInventoryItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivateInventoryItemHandler>;
    mockReceiveStock = { execute: jest.fn() } as unknown as jest.Mocked<ReceiveStockHandler>;
    mockSellStock = { execute: jest.fn() } as unknown as jest.Mocked<SellStockHandler>;
    mockConsumeStock = { execute: jest.fn() } as unknown as jest.Mocked<ConsumeStockHandler>;
    mockScrapStock = { execute: jest.fn() } as unknown as jest.Mocked<ScrapStockHandler>;
    mockAdjustStock = { execute: jest.fn() } as unknown as jest.Mocked<AdjustStockHandler>;
    mockGetInventoryItemById = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryItemByIdHandler>;
    mockListInventoryItems = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListInventoryItemsHandler>;
    mockGetStockLevel = { execute: jest.fn() } as unknown as jest.Mocked<GetStockLevelHandler>;
    mockListStockMovements = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListStockMovementsHandler>;
    mockGetLowStockItems = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetLowStockItemsHandler>;
    mockGetInventoryValuation = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryValuationHandler>;

    mockCreateFixedAsset = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateFixedAssetHandler>;
    mockUpdateFixedAssetDetails = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetDetailsHandler>;
    mockTransferFixedAssetLocation = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<TransferFixedAssetLocationHandler>;
    mockChangeFixedAssetStatus = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ChangeFixedAssetStatusHandler>;
    mockUpdateFixedAssetCondition = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetConditionHandler>;
    mockRecordAssetMaintenance = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RecordAssetMaintenanceHandler>;
    mockUpdateFixedAssetValuation = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetValuationHandler>;
    mockGetFixedAssetById = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetByIdHandler>;
    mockListFixedAssets = { execute: jest.fn() } as unknown as jest.Mocked<ListFixedAssetsHandler>;
    mockGetAssetHistory = { execute: jest.fn() } as unknown as jest.Mocked<GetAssetHistoryHandler>;
    mockGetMaintenanceHistory = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetMaintenanceHistoryHandler>;
    mockGetAssetValue = { execute: jest.fn() } as unknown as jest.Mocked<GetAssetValueHandler>;
    mockGetFixedAssetValuationSummary = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetFixedAssetValuationSummaryHandler>;

    inventoryController = new InventoryController(
      mockCreateInventoryItem,
      mockUpdateInventoryItem,
      mockArchiveInventoryItem,
      mockActivateInventoryItem,
      mockDeactivateInventoryItem,
      mockReceiveStock,
      mockSellStock,
      mockConsumeStock,
      mockScrapStock,
      mockAdjustStock,
      mockGetInventoryItemById,
      mockListInventoryItems,
      mockGetStockLevel,
      mockListStockMovements,
      mockGetLowStockItems,
      mockGetInventoryValuation,
    );

    fixedAssetsController = new FixedAssetsController(
      mockCreateFixedAsset,
      mockUpdateFixedAssetDetails,
      mockTransferFixedAssetLocation,
      mockChangeFixedAssetStatus,
      mockUpdateFixedAssetCondition,
      mockRecordAssetMaintenance,
      mockUpdateFixedAssetValuation,
      mockGetFixedAssetById,
      mockListFixedAssets,
      mockGetAssetHistory,
      mockGetMaintenanceHistory,
      mockGetAssetValue,
      mockGetFixedAssetValuationSummary,
    );
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

  describe('1. Forbidden Consumable Inventory Mutations: Zero Side-Effect Guarantee', () => {
    const unauthorizedUser = new AuthenticatedUserContext({
      userId: 'usr_unauthorized_trainer',
      email: 'trainer@kinergy.platform',
      status: 'ACTIVE',
      roles: ['TRAINER'],
      permissions: ['inventory.read'], // Lacks inventory.write
      tenantId: 'tenant_gym_01',
    });

    it('rejects stock receipt, preventing stock increment and movement ledger creation', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.write'),
      );

      const context = createInventoryContext('receiveStock', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      // Verify NO handler execution occurred and NO side effects were produced
      expect(mockReceiveStock.execute).not.toHaveBeenCalled();
    });

    it('rejects stock sale, preventing inventory decrements or financial POS mutations', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.write'),
      );

      const context = createInventoryContext('sellStock', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockSellStock.execute).not.toHaveBeenCalled();
    });

    it('rejects stock consumption, preventing stock reductions', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.write'),
      );

      const context = createInventoryContext('consumeStock', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockConsumeStock.execute).not.toHaveBeenCalled();
    });

    it('rejects manual stock adjustment, preventing stock balance overwrite and ledger emission', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.write'),
      );

      const context = createInventoryContext('adjustStock', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockAdjustStock.execute).not.toHaveBeenCalled();
    });

    it('rejects product archival, keeping active product status intact', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: inventory.write'),
      );

      const context = createInventoryContext('archiveItem', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockArchiveInventoryItem.execute).not.toHaveBeenCalled();
    });
  });

  describe('2. Forbidden Fixed Asset Mutations: Zero Side-Effect Guarantee', () => {
    const unauthorizedUser = new AuthenticatedUserContext({
      userId: 'usr_receptionist_01',
      email: 'reception@kinergy.platform',
      status: 'ACTIVE',
      roles: ['RECEPTIONIST'],
      permissions: ['assets.read'], // Lacks assets.write
      tenantId: 'tenant_gym_01',
    });

    it('rejects location transfer, leaving physical room assignment unchanged with 0 history events', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.write'),
      );

      const context = createAssetContext('transferLocation', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockTransferFixedAssetLocation.execute).not.toHaveBeenCalled();
    });

    it('rejects lifecycle status change, preventing state transitions and history logging', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.write'),
      );

      const context = createAssetContext('changeStatus', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockChangeFixedAssetStatus.execute).not.toHaveBeenCalled();
    });

    it('rejects condition rating change, preventing condition degradation update', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.write'),
      );

      const context = createAssetContext('changeCondition', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockUpdateFixedAssetCondition.execute).not.toHaveBeenCalled();
    });

    it('rejects maintenance logging, preventing maintenance work order and audit entry creation', async () => {
      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied('Missing required permission: assets.write'),
      );

      const context = createAssetContext('recordMaintenance', unauthorizedUser);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockRecordAssetMaintenance.execute).not.toHaveBeenCalled();
    });

    it('rejects asset revaluation, preserving existing balance sheet book value', async () => {
      const userWithAssetWriteOnly = new AuthenticatedUserContext({
        userId: 'usr_trainer_lead',
        email: 'trainer_lead@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.write'], // Lacks billing.read
        tenantId: 'tenant_gym_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Missing required permission: billing.read for asset revaluation',
        ),
      );

      const context = createAssetContext('updateValuation', userWithAssetWriteOnly);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockUpdateFixedAssetValuation.execute).not.toHaveBeenCalled();
    });
  });

  describe('3. Sensitive Valuation Read Protection: Information Disclosure Prevention', () => {
    it('prevents operational staff from querying total inventory valuation', async () => {
      const operationalCook = new AuthenticatedUserContext({
        userId: 'usr_kitchen_cook',
        email: 'cook@kinergy.platform',
        status: 'ACTIVE',
        roles: ['KITCHEN_STAFF'],
        permissions: ['inventory.read', 'inventory.write'], // Lacks billing.read
        tenantId: 'tenant_gym_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Missing required permission: billing.read for inventory valuation',
        ),
      );

      const context = createInventoryContext('getValuation', operationalCook);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockGetInventoryValuation.execute).not.toHaveBeenCalled();
    });

    it('prevents operational trainers from querying fixed asset capital valuation', async () => {
      const operationalTrainer = new AuthenticatedUserContext({
        userId: 'usr_trainer_01',
        email: 'trainer@kinergy.platform',
        status: 'ACTIVE',
        roles: ['TRAINER'],
        permissions: ['assets.read', 'assets.write'], // Lacks billing.read
        tenantId: 'tenant_gym_01',
      });

      mockEvaluator.evaluate.mockResolvedValueOnce(
        AuthorizationDecision.denied(
          'Missing required permission: billing.read for asset valuation',
        ),
      );

      const context = createAssetContext('getAssetValue', operationalTrainer);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      expect(mockGetAssetValue.execute).not.toHaveBeenCalled();
    });
  });

  describe('4. Cross-Tenant Business Boundary Isolation', () => {
    it('prevents cross-tenant inventory item retrieval when tenantId does not match', async () => {
      const tenantAUser = new AuthenticatedUserContext({
        userId: 'usr_tenant_a_mgr',
        email: 'mgr@tenanta.com',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'inventory.write'],
        tenantId: 'tenant_alpha',
      });

      // Handler returns not found when querying resource belonging to another tenant
      mockGetInventoryItemById.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Inventory item with id not found for tenant'),
      );

      await expect(
        inventoryController.getItem('item_belonging_to_tenant_bravo', tenantAUser),
      ).rejects.toThrow(NotFoundException);

      expect(mockGetInventoryItemById.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            id: 'item_belonging_to_tenant_bravo',
            tenantId: 'tenant_alpha',
          },
        }),
      );
    });

    it('prevents cross-tenant fixed asset modification when tenantId does not match', async () => {
      const tenantAUser = new AuthenticatedUserContext({
        userId: 'usr_tenant_a_admin',
        email: 'admin@tenanta.com',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['assets.write'],
        tenantId: 'tenant_alpha',
      });

      mockTransferFixedAssetLocation.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Fixed asset with id not found for tenant'),
      );

      await expect(
        fixedAssetsController.transferLocation(
          'asset_belonging_to_tenant_bravo',
          {
            location: {
              facilityId: 'fac_1',
              roomId: 'room_1',
              zone: 'Cardio',
            },
            reason: 'Unauthorized attempt',
          },
          tenantAUser,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockTransferFixedAssetLocation.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            id: 'asset_belonging_to_tenant_bravo',
            tenantId: 'tenant_alpha',
            actorId: 'usr_tenant_a_admin',
          }),
        }),
      );
    });
  });

  describe('5. Unauthenticated Caller Invariant', () => {
    it('throws UnauthorizedException for unauthenticated requests before handler invocation', async () => {
      const context = createInventoryContext('createItem', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);

      expect(mockCreateInventoryItem.execute).not.toHaveBeenCalled();
    });
  });
});
