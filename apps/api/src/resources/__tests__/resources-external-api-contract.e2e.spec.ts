import { BadRequestException } from '@nestjs/common';
import {
  InventoryCategory,
  InventoryItemStatus,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  StockMovementType,
  InventoryItemDTO,
  FixedAssetDTO,
  StockMutationResultDTO,
  StockLevelDTO,
  AssetMaintenanceRecordDTO,
  ResourcesApplicationResult,
  CreateInventoryItemHandler,
  ReceiveStockHandler,
  SellStockHandler,
  ConsumeStockHandler,
  AdjustStockHandler,
  ArchiveInventoryItemHandler,
  GetStockLevelHandler,
  GetInventoryValuationHandler,
  CreateFixedAssetHandler,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationHandler,
  GetAssetHistoryHandler,
  GetCombinedResourceValuationHandler,
} from '@kinergy-platform/core';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { ResourceValuationController } from '../controllers/resource-valuation.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import {
  CreateInventoryItemRequestDto,
  ReceiveStockRequestDto,
  SellStockRequestDto,
  ConsumeStockRequestDto,
  CreateFixedAssetRequestDto,
  TransferFixedAssetLocationRequestDto,
  ChangeFixedAssetStatusRequestDto,
  RecordAssetMaintenanceRequestDto,
  UpdateFixedAssetValuationRequestDto,
} from '../dto';

describe('Phase 6.9 Resources External API Contract & End-to-End Lifecycle Verification', () => {
  let pipe: GlobalSanitizationValidationPipe;

  // Handlers
  let mockCreateInventoryItemHandler: jest.Mocked<CreateInventoryItemHandler>;
  let mockReceiveStockHandler: jest.Mocked<ReceiveStockHandler>;
  let mockSellStockHandler: jest.Mocked<SellStockHandler>;
  let mockConsumeStockHandler: jest.Mocked<ConsumeStockHandler>;
  let mockAdjustStockHandler: jest.Mocked<AdjustStockHandler>;
  let mockArchiveInventoryItemHandler: jest.Mocked<ArchiveInventoryItemHandler>;
  let mockGetStockLevelHandler: jest.Mocked<GetStockLevelHandler>;
  let mockGetInventoryValuationHandler: jest.Mocked<GetInventoryValuationHandler>;

  let mockCreateFixedAssetHandler: jest.Mocked<CreateFixedAssetHandler>;
  let mockTransferFixedAssetLocationHandler: jest.Mocked<TransferFixedAssetLocationHandler>;
  let mockChangeFixedAssetStatusHandler: jest.Mocked<ChangeFixedAssetStatusHandler>;
  let mockUpdateFixedAssetConditionHandler: jest.Mocked<UpdateFixedAssetConditionHandler>;
  let mockRecordAssetMaintenanceHandler: jest.Mocked<RecordAssetMaintenanceHandler>;
  let mockUpdateFixedAssetValuationHandler: jest.Mocked<UpdateFixedAssetValuationHandler>;
  let mockGetAssetHistoryHandler: jest.Mocked<GetAssetHistoryHandler>;

  let mockGetCombinedResourceValuationHandler: jest.Mocked<GetCombinedResourceValuationHandler>;

  // Controllers
  let inventoryController: InventoryController;
  let fixedAssetsController: FixedAssetsController;
  let valuationController: ResourceValuationController;

  const mockAdminUser = new AuthenticatedUserContext({
    userId: 'usr_admin_qa',
    email: 'qa.lead@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN', 'OWNER'],
    permissions: [
      'inventory.read',
      'inventory.write',
      'assets.read',
      'assets.write',
      'billing.read',
    ],
    tenantId: 'tenant_enterprise',
  });

  const createMock = <T>() => ({ execute: jest.fn() }) as unknown as T;

  const buildMockItem = (
    quantityOnHand = 0,
    status = InventoryItemStatus.ACTIVE,
  ): InventoryItemDTO => ({
    id: 'inv_101',
    tenantId: 'tenant_enterprise',
    sku: 'PROT-ISO-1KG',
    name: 'Hydrolyzed Whey Isolate 1kg',
    category: InventoryCategory.SUPPLEMENTS,
    unit: 'UNIT',
    minimumStock: 10,
    quantityOnHand,
    purchaseCostAmount: 32.0,
    purchaseCostCurrency: 'USD',
    sellingPriceAmount: 55.0,
    sellingPriceCurrency: 'USD',
    status,
    version: 1,
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  });

  const buildMockAsset = (options: Partial<FixedAssetDTO> = {}): FixedAssetDTO => ({
    id: 'ast_501',
    tenantId: 'tenant_enterprise',
    assetTag: 'AST-KNE-002',
    name: 'Biodex System 4 Pro Dynamometer',
    category: AssetCategory.THERAPY_EQUIPMENT,
    purchaseDate: new Date('2026-01-10T00:00:00.000Z'),
    purchaseValueAmount: 52000.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 52000.0,
    currentEstimatedValueCurrency: 'USD',
    condition: AssetCondition.EXCELLENT,
    status: AssetStatus.ACTIVE,
    location: {
      facilityId: 'fac_main',
      roomId: 'room_rehab_01',
      zone: 'Zone A',
      description: 'Physical Therapy Suite 1',
      formatted: 'fac_main / room_rehab_01 (Zone A)',
    },
    historyEventsCount: 0,
    maintenanceRecordsCount: 0,
    version: 1,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...options,
  });

  beforeEach(() => {
    pipe = new GlobalSanitizationValidationPipe();

    mockCreateInventoryItemHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateInventoryItemHandler>;
    mockReceiveStockHandler = { execute: jest.fn() } as unknown as jest.Mocked<ReceiveStockHandler>;
    mockSellStockHandler = { execute: jest.fn() } as unknown as jest.Mocked<SellStockHandler>;
    mockConsumeStockHandler = { execute: jest.fn() } as unknown as jest.Mocked<ConsumeStockHandler>;
    mockAdjustStockHandler = { execute: jest.fn() } as unknown as jest.Mocked<AdjustStockHandler>;
    mockArchiveInventoryItemHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ArchiveInventoryItemHandler>;
    mockGetStockLevelHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetStockLevelHandler>;
    mockGetInventoryValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryValuationHandler>;

    mockCreateFixedAssetHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateFixedAssetHandler>;
    mockTransferFixedAssetLocationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<TransferFixedAssetLocationHandler>;
    mockChangeFixedAssetStatusHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ChangeFixedAssetStatusHandler>;
    mockUpdateFixedAssetConditionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetConditionHandler>;
    mockRecordAssetMaintenanceHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RecordAssetMaintenanceHandler>;
    mockUpdateFixedAssetValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateFixedAssetValuationHandler>;
    mockGetAssetHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetAssetHistoryHandler>;

    mockGetCombinedResourceValuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCombinedResourceValuationHandler>;

    inventoryController = new InventoryController(
      mockCreateInventoryItemHandler,
      createMock(),
      mockArchiveInventoryItemHandler,
      createMock(),
      createMock(),
      mockReceiveStockHandler,
      mockSellStockHandler,
      mockConsumeStockHandler,
      createMock(),
      mockAdjustStockHandler,
      createMock(),
      createMock(),
      mockGetStockLevelHandler,
      createMock(),
      createMock(),
      mockGetInventoryValuationHandler,
    );

    fixedAssetsController = new FixedAssetsController(
      mockCreateFixedAssetHandler,
      createMock(),
      mockTransferFixedAssetLocationHandler,
      mockChangeFixedAssetStatusHandler,
      mockUpdateFixedAssetConditionHandler,
      mockRecordAssetMaintenanceHandler,
      mockUpdateFixedAssetValuationHandler,
      createMock(),
      createMock(),
      createMock(),
      mockGetAssetHistoryHandler,
      createMock(),
      createMock(),
      createMock(),
    );

    valuationController = new ResourceValuationController(mockGetCombinedResourceValuationHandler);
  });

  describe('1. Consumable Inventory Complete Lifecycle Journey', () => {
    it('executes commissioning -> receipt -> sales -> clinical consumption -> low stock -> archival journey', async () => {
      // 1. Create Product
      const createDto = (await pipe.transform(
        {
          sku: 'PROT-ISO-1KG',
          name: 'Hydrolyzed Whey Isolate 1kg',
          category: InventoryCategory.SUPPLEMENTS,
          unitCost: 32.0,
          sellingPrice: 55.0,
          quantityOnHand: 0,
          reorderThreshold: 10,
        },
        { type: 'body', metatype: CreateInventoryItemRequestDto },
      )) as CreateInventoryItemRequestDto;

      mockCreateInventoryItemHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(buildMockItem(0)),
      );

      const createdProduct = await inventoryController.createItem(createDto, mockAdminUser);
      expect(createdProduct.sku).toBe('PROT-ISO-1KG');
      expect(createdProduct.quantityOnHand).toBe(0);

      // 2. Receive Stock (PO Receipt)
      const receiveDto = (await pipe.transform(
        { quantity: 50, unitCost: 30.0, referenceNumber: 'PO-2026-001' },
        { type: 'body', metatype: ReceiveStockRequestDto },
      )) as ReceiveStockRequestDto;

      const receiveMutationResult: StockMutationResultDTO = {
        item: buildMockItem(50),
        movement: {
          id: 'mov_01',
          inventoryItemId: 'inv_101',
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 50,
          balanceAfter: 50,
          unitCostAmount: 30.0,
          unitCostCurrency: 'USD',
          reason: 'PO Receipt',
          referenceId: 'PO-2026-001',
          recordedByUserId: 'usr_admin_qa',
          recordedAt: '2026-08-31T12:05:00.000Z',
        },
      };

      mockReceiveStockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(receiveMutationResult),
      );

      const receiveRes = await inventoryController.receiveStock(
        'inv_101',
        receiveDto,
        mockAdminUser,
      );
      expect(receiveRes.item.quantityOnHand).toBe(50);
      expect(receiveRes.movement.quantityDelta).toBe(50);

      // 3. Sell Stock (POS Sale)
      const sellDto = (await pipe.transform(
        { quantity: 5, unitPrice: 55.0, referenceId: 'POS-REC-001' },
        { type: 'body', metatype: SellStockRequestDto },
      )) as SellStockRequestDto;

      const sellMutationResult: StockMutationResultDTO = {
        item: buildMockItem(45),
        movement: {
          id: 'mov_02',
          inventoryItemId: 'inv_101',
          movementType: StockMovementType.SALE,
          quantityDelta: -5,
          balanceAfter: 45,
          unitCostAmount: 30.0,
          unitCostCurrency: 'USD',
          reason: 'POS Sale',
          referenceId: 'POS-REC-001',
          recordedByUserId: 'usr_admin_qa',
          recordedAt: '2026-08-31T12:10:00.000Z',
        },
      };

      mockSellStockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(sellMutationResult),
      );

      const sellRes = await inventoryController.sellStock('inv_101', sellDto, mockAdminUser);
      expect(sellRes.item.quantityOnHand).toBe(45);

      // 4. Clinical Consumption (Treatment Session)
      const consumeDto = (await pipe.transform(
        { quantity: 40, treatmentSessionId: 'sess_999' },
        { type: 'body', metatype: ConsumeStockRequestDto },
      )) as ConsumeStockRequestDto;

      const consumeMutationResult: StockMutationResultDTO = {
        item: buildMockItem(5),
        movement: {
          id: 'mov_03',
          inventoryItemId: 'inv_101',
          movementType: StockMovementType.CONSUMPTION,
          quantityDelta: -40,
          balanceAfter: 5,
          unitCostAmount: 30.0,
          unitCostCurrency: 'USD',
          reason: 'Session consumption',
          referenceId: 'sess_999',
          recordedByUserId: 'usr_admin_qa',
          recordedAt: '2026-08-31T12:15:00.000Z',
        },
      };

      mockConsumeStockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(consumeMutationResult),
      );

      const consumeRes = await inventoryController.consumeStock(
        'inv_101',
        consumeDto,
        mockAdminUser,
      );
      expect(consumeRes.item.quantityOnHand).toBe(5);

      // 5. Stock Level Check (Trigger Low Stock Indicator: 5 <= 10)
      const mockStockLevel: StockLevelDTO = {
        itemId: 'inv_101',
        sku: 'PROT-ISO-1KG',
        name: 'Hydrolyzed Whey Isolate 1kg',
        category: InventoryCategory.SUPPLEMENTS,
        unit: 'UNIT',
        quantityOnHand: 5,
        minimumStock: 10,
        status: InventoryItemStatus.ACTIVE,
        isLowStock: true,
        isOutOfStock: false,
        version: 1,
        updatedAt: '2026-08-31T12:15:00.000Z',
      };

      mockGetStockLevelHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(mockStockLevel),
      );

      const stockLevel = await inventoryController.getStockLevel('inv_101', mockAdminUser);
      expect(stockLevel.isLowStock).toBe(true);
      expect(stockLevel.quantityOnHand).toBe(5);

      // 6. Archival
      mockArchiveInventoryItemHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(buildMockItem(5, InventoryItemStatus.ARCHIVED)),
      );

      const archivedItem = await inventoryController.archiveItem('inv_101', mockAdminUser);
      expect(archivedItem.status).toBe(InventoryItemStatus.ARCHIVED);
    });

    it('rejects insufficient stock sales with 400 Bad Request [INV-INV-2]', async () => {
      const sellDto = (await pipe.transform(
        { quantity: 100 },
        { type: 'body', metatype: SellStockRequestDto },
      )) as SellStockRequestDto;

      mockSellStockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail(
          'Insufficient stock: cannot deduct 100 units from available 5 [INV-INV-2]',
        ),
      );

      await expect(
        inventoryController.sellStock('inv_101', sellDto, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Fixed Assets Complete Lifecycle Journey', () => {
    it('executes commissioning -> location transfer -> maintenance servicing -> valuation appraisal -> condition rating journey', async () => {
      // 1. Commission Asset
      const createDto = (await pipe.transform(
        {
          assetTag: 'AST-KNE-002',
          name: 'Biodex System 4 Pro Dynamometer',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: '2026-01-10T00:00:00.000Z',
          purchaseValueAmount: 52000.0,
          purchaseValueCurrency: 'USD',
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: {
            facilityId: 'fac_main',
            roomId: 'room_rehab_01',
            zone: 'Zone A',
            description: 'Physical Therapy Suite 1',
          },
        },
        { type: 'body', metatype: CreateFixedAssetRequestDto },
      )) as CreateFixedAssetRequestDto;

      mockCreateFixedAssetHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(buildMockAsset()),
      );

      const createdAsset = await fixedAssetsController.createAsset(createDto, mockAdminUser);
      expect(createdAsset.assetTag).toBe('AST-KNE-002');
      expect(createdAsset.name).toBe('Biodex System 4 Pro Dynamometer');

      // 2. Transfer Location
      const transferDto = (await pipe.transform(
        {
          location: {
            facilityId: 'fac_north',
            roomId: 'room_pt_02',
            zone: 'Zone B',
            description: 'North Rehabilitation Clinic',
          },
          reason: 'Facility upgrade transfer',
        },
        { type: 'body', metatype: TransferFixedAssetLocationRequestDto },
      )) as TransferFixedAssetLocationRequestDto;

      const transferredAsset = buildMockAsset({
        location: {
          facilityId: 'fac_north',
          roomId: 'room_pt_02',
          zone: 'Zone B',
          description: 'North Rehabilitation Clinic',
          formatted: 'fac_north / room_pt_02 (Zone B)',
        },
      });

      mockTransferFixedAssetLocationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(transferredAsset),
      );

      const transferRes = await fixedAssetsController.transferLocation(
        'ast_501',
        transferDto,
        mockAdminUser,
      );
      expect(transferRes.location.facilityId).toBe('fac_north');

      // 3. Record Maintenance Event
      const maintDto = (await pipe.transform(
        {
          serviceDate: '2026-08-30T10:00:00.000Z',
          description: 'Replaced hydraulic actuator seals and dynamometer calibration',
          costAmount: 650.0,
          costCurrency: 'USD',
          performedBy: 'Biodex Senior Field Engineer',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        { type: 'body', metatype: RecordAssetMaintenanceRequestDto },
      )) as RecordAssetMaintenanceRequestDto;

      const mockMaintRecord: AssetMaintenanceRecordDTO = {
        id: 'maint_01',
        assetId: 'ast_501',
        serviceDate: new Date('2026-08-30T10:00:00.000Z'),
        description: 'Replaced hydraulic actuator seals and dynamometer calibration',
        costAmount: 650.0,
        costCurrency: 'USD',
        performedBy: 'Biodex Senior Field Engineer',
        createdAt: new Date('2026-08-31T13:15:00.000Z'),
        recordedByUserId: 'usr_admin_qa',
      };

      mockRecordAssetMaintenanceHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(mockMaintRecord),
      );

      const maintRes = await fixedAssetsController.recordMaintenance(
        'ast_501',
        maintDto,
        mockAdminUser,
      );
      expect(maintRes.costAmount).toBe(650.0);

      // 4. Update Valuation Appraisal
      const valuationDto = (await pipe.transform(
        {
          estimatedValueAmount: 48000.0,
          currency: 'USD',
          reason: 'Annual fair value appraisal',
        },
        { type: 'body', metatype: UpdateFixedAssetValuationRequestDto },
      )) as UpdateFixedAssetValuationRequestDto;

      const appraisedAsset = buildMockAsset({
        currentEstimatedValueAmount: 48000.0,
      });

      mockUpdateFixedAssetValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(appraisedAsset),
      );

      const valRes = await fixedAssetsController.updateValuation(
        'ast_501',
        valuationDto,
        mockAdminUser,
      );
      expect(valRes.id).toBe('ast_501');
    });

    it('rejects invalid state transition on terminal SOLD asset [AST-INV-1]', async () => {
      const statusDto = (await pipe.transform(
        {
          status: AssetStatus.ACTIVE,
          reason: 'Attempted resurrection',
        },
        { type: 'body', metatype: ChangeFixedAssetStatusRequestDto },
      )) as ChangeFixedAssetStatusRequestDto;

      mockChangeFixedAssetStatusHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail(
          'Cannot transition fixed asset in terminal SOLD status back to ACTIVE [AST-INV-1]',
        ),
      );

      await expect(
        fixedAssetsController.changeStatus('ast_501', statusDto, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Cross-Domain Valuation Integrity', () => {
    it('retrieves combined balance sheet carrying value', async () => {
      mockGetCombinedResourceValuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          totalCombinedValueAmount: 76000.0,
          totalCombinedPurchaseValueAmount: 85000.0,
          currency: 'USD',
          inventory: {
            totalValueAmount: 28000.0,
            totalDistinctItems: 14,
            totalQuantityUnits: 450,
            sharePercentage: 36.84,
          },
          fixedAssets: {
            totalCarryingValueAmount: 48000.0,
            totalPurchaseValueAmount: 52000.0,
            totalAssetCount: 1,
            activeAssetCount: 1,
            sharePercentage: 63.16,
          },
          calculatedAt: '2026-08-31T14:00:00.000Z',
        }),
      );

      const summary = await valuationController.getCombinedSummary(mockAdminUser);
      expect(summary.totalCombinedValueAmount).toBe(76000.0);
      expect(summary.inventory.sharePercentage).toBe(36.84);
      expect(summary.fixedAssets.sharePercentage).toBe(63.16);
    });
  });
});
