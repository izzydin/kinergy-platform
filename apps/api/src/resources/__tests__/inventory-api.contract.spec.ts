import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  ResourcesApplicationResult,
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
  InventoryItemDTO,
  StockMovementDTO,
  StockMutationResultDTO,
  InventoryValuationDTO,
  StockLevelDTO,
} from '@kinergy-platform/core';
import { InventoryController } from '../controllers/inventory.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import {
  CreateInventoryItemRequestDto,
  UpdateInventoryItemRequestDto,
  ReceiveStockRequestDto,
  SellStockRequestDto,
  ConsumeStockRequestDto,
  ScrapStockRequestDto,
  AdjustStockRequestDto,
  ListInventoryItemsQueryDto,
} from '../dto';

describe('InventoryController HTTP Contracts (Milestone 6.9)', () => {
  let controller: InventoryController;

  let createHandler: jest.Mocked<CreateInventoryItemHandler>;
  let updateHandler: jest.Mocked<UpdateInventoryItemHandler>;
  let archiveHandler: jest.Mocked<ArchiveInventoryItemHandler>;
  let activateHandler: jest.Mocked<ActivateInventoryItemHandler>;
  let deactivateHandler: jest.Mocked<DeactivateInventoryItemHandler>;
  let receiveHandler: jest.Mocked<ReceiveStockHandler>;
  let sellHandler: jest.Mocked<SellStockHandler>;
  let consumeHandler: jest.Mocked<ConsumeStockHandler>;
  let scrapHandler: jest.Mocked<ScrapStockHandler>;
  let adjustHandler: jest.Mocked<AdjustStockHandler>;
  let getByIdHandler: jest.Mocked<GetInventoryItemByIdHandler>;
  let listHandler: jest.Mocked<ListInventoryItemsHandler>;
  let stockLevelHandler: jest.Mocked<GetStockLevelHandler>;
  let movementsHandler: jest.Mocked<ListStockMovementsHandler>;
  let lowStockHandler: jest.Mocked<GetLowStockItemsHandler>;
  let valuationHandler: jest.Mocked<GetInventoryValuationHandler>;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_mgr_01',
    email: 'mgr@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['inventory.read', 'inventory.write', 'billing.read'],
    tenantId: 'tenant_main',
  });

  const mockItemDTO: InventoryItemDTO = {
    id: 'item_123',
    tenantId: 'tenant_main',
    sku: 'PROT-WHEY-1KG',
    name: 'Grass-Fed Whey Isolate',
    description: '100% natural vanilla protein',
    category: InventoryCategory.SUPPLEMENTS,
    status: InventoryItemStatus.ACTIVE,
    unit: UnitOfMeasure.UNITS,
    minimumStock: 10,
    quantityOnHand: 50,
    purchaseCostAmount: 25.5,
    purchaseCostCurrency: 'USD',
    sellingPriceAmount: 45.0,
    sellingPriceCurrency: 'USD',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const mockStockLevelDTO: StockLevelDTO = {
    itemId: 'item_123',
    sku: 'PROT-WHEY-1KG',
    name: 'Grass-Fed Whey Isolate',
    quantityOnHand: 50,
    minimumStock: 10,
    unit: UnitOfMeasure.UNITS,
    status: InventoryItemStatus.ACTIVE,
    isLowStock: false,
    isOutOfStock: false,
    category: InventoryCategory.SUPPLEMENTS,
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const createMockMutationResult = (
    quantityOnHand: number,
    delta: number,
    movementType: string,
  ): StockMutationResultDTO => {
    const updatedItem: InventoryItemDTO = {
      ...mockItemDTO,
      quantityOnHand,
    };
    const movement: StockMovementDTO = {
      id: 'mov_001',
      inventoryItemId: 'item_123',
      movementType,
      quantityDelta: delta,
      balanceAfter: quantityOnHand,
      unitCostAmount: 25.5,
      unitCostCurrency: 'USD',
      reason: 'Test operational mutation',
      recordedByUserId: 'usr_mgr_01',
      referenceId: 'REF-001',
      recordedAt: '2026-01-01T00:00:00.000Z',
    };
    return { item: updatedItem, movement };
  };

  beforeEach(() => {
    createHandler = { execute: jest.fn() } as unknown as jest.Mocked<CreateInventoryItemHandler>;
    updateHandler = { execute: jest.fn() } as unknown as jest.Mocked<UpdateInventoryItemHandler>;
    archiveHandler = { execute: jest.fn() } as unknown as jest.Mocked<ArchiveInventoryItemHandler>;
    activateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivateInventoryItemHandler>;
    deactivateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivateInventoryItemHandler>;
    receiveHandler = { execute: jest.fn() } as unknown as jest.Mocked<ReceiveStockHandler>;
    sellHandler = { execute: jest.fn() } as unknown as jest.Mocked<SellStockHandler>;
    consumeHandler = { execute: jest.fn() } as unknown as jest.Mocked<ConsumeStockHandler>;
    scrapHandler = { execute: jest.fn() } as unknown as jest.Mocked<ScrapStockHandler>;
    adjustHandler = { execute: jest.fn() } as unknown as jest.Mocked<AdjustStockHandler>;
    getByIdHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryItemByIdHandler>;
    listHandler = { execute: jest.fn() } as unknown as jest.Mocked<ListInventoryItemsHandler>;
    stockLevelHandler = { execute: jest.fn() } as unknown as jest.Mocked<GetStockLevelHandler>;
    movementsHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListStockMovementsHandler>;
    lowStockHandler = { execute: jest.fn() } as unknown as jest.Mocked<GetLowStockItemsHandler>;
    valuationHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetInventoryValuationHandler>;

    controller = new InventoryController(
      createHandler,
      updateHandler,
      archiveHandler,
      activateHandler,
      deactivateHandler,
      receiveHandler,
      sellHandler,
      consumeHandler,
      scrapHandler,
      adjustHandler,
      getByIdHandler,
      listHandler,
      stockLevelHandler,
      movementsHandler,
      lowStockHandler,
      valuationHandler,
    );
  });

  describe('1. Static Taxonomy & Categories', () => {
    it('returns code-defined inventory category taxonomy metadata without database calls', () => {
      const categories = controller.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(8);
      expect(categories.find((c) => c.code === InventoryCategory.SUPPLEMENTS)).toEqual({
        code: InventoryCategory.SUPPLEMENTS,
        displayName: 'Supplements & Nutrition',
        description: expect.any(String),
      });
    });
  });

  describe('2. Catalog Product Management Contracts', () => {
    it('creates product and maps DTO to CreateInventoryItemCommand', async () => {
      const dto: CreateInventoryItemRequestDto = {
        sku: 'PROT-WHEY-1KG',
        name: 'Grass-Fed Whey Isolate',
        description: '100% natural vanilla protein',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 25.5,
        sellingPrice: 45.0,
        quantityOnHand: 20,
        reorderThreshold: 5,
        unitOfMeasure: 'UNITS',
      };

      createHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockItemDTO));

      const result = await controller.createItem(dto, mockUser);
      expect(result).toEqual(mockItemDTO);
      expect(createHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            sku: 'PROT-WHEY-1KG',
            name: 'Grass-Fed Whey Isolate',
            category: InventoryCategory.SUPPLEMENTS,
            initialStock: 20,
            actorId: 'usr_mgr_01',
          }),
        }),
      );
    });

    it('gets product by ID and throws NotFoundException when missing', async () => {
      getByIdHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockItemDTO));
      const res = await controller.getItem('item_123', mockUser);
      expect(res).toEqual(mockItemDTO);

      getByIdHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail("Inventory item with ID 'item_999' not found."),
      );
      await expect(controller.getItem('item_999', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('updates product metadata and handles NotFoundException vs BadRequestException', async () => {
      const updateDto: UpdateInventoryItemRequestDto = {
        name: 'Updated Whey Isolate',
        sellingPrice: 49.99,
      };

      updateHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          ...mockItemDTO,
          name: 'Updated Whey Isolate',
          sellingPriceAmount: 49.99,
        }),
      );

      const res = await controller.updateItem('item_123', updateDto, mockUser);
      expect(res.name).toBe('Updated Whey Isolate');

      updateHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail("Inventory item with ID 'item_999' not found."),
      );
      await expect(controller.updateItem('item_999', updateDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('archives product and executes ArchiveInventoryItemCommand', async () => {
      archiveHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({ ...mockItemDTO, status: InventoryItemStatus.ARCHIVED }),
      );
      const res = await controller.archiveItem('item_123', mockUser);
      expect(res.status).toBe(InventoryItemStatus.ARCHIVED);
    });

    it('activates product and executes ActivateInventoryItemCommand', async () => {
      activateHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({ ...mockItemDTO, status: InventoryItemStatus.ACTIVE }),
      );
      const res = await controller.activateItem('item_123', mockUser);
      expect(res.status).toBe(InventoryItemStatus.ACTIVE);
    });

    it('deactivates product and executes DeactivateInventoryItemCommand', async () => {
      deactivateHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({ ...mockItemDTO, status: InventoryItemStatus.INACTIVE }),
      );
      const res = await controller.deactivateItem('item_123', mockUser);
      expect(res.status).toBe(InventoryItemStatus.INACTIVE);
    });
  });

  describe('3. Query, Filtering, Search & Pagination Contracts', () => {
    it('lists products with multi-criteria filtering and structured pagination metadata', async () => {
      const queryDto: ListInventoryItemsQueryDto = {
        search: 'Whey',
        category: InventoryCategory.SUPPLEMENTS,
        status: InventoryItemStatus.ACTIVE,
        stockStatus: 'IN_STOCK',
        includeArchived: false,
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      };

      const paginatedResult = {
        items: [mockItemDTO],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };

      listHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(paginatedResult));

      const res = await controller.listItems(queryDto, mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(listHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            filter: expect.objectContaining({
              search: 'Whey',
              category: InventoryCategory.SUPPLEMENTS,
              stockStatus: 'IN_STOCK',
            }),
          }),
        }),
      );
    });

    it('retrieves current physical stock on hand via getStockLevel', async () => {
      stockLevelHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(mockStockLevelDTO),
      );

      const res = await controller.getStockLevel('item_123', mockUser);
      expect(res.quantityOnHand).toBe(50);
      expect(res.isLowStock).toBe(false);
    });

    it('retrieves low stock alerts via getLowStock', async () => {
      lowStockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [{ ...mockItemDTO, quantityOnHand: 2, minimumStock: 10 }],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const res = await controller.getLowStock(mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.quantityOnHand).toBe(2);
    });

    it('retrieves stock movements ledger with pagination', async () => {
      movementsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [
            {
              id: 'mov_001',
              inventoryItemId: 'item_123',
              movementType: StockMovementType.PURCHASE,
              quantityDelta: 50,
              balanceAfter: 50,
              unitCostAmount: 25.5,
              unitCostCurrency: 'USD',
              reason: 'Initial delivery',
              recordedByUserId: 'usr_mgr_01',
              referenceId: 'PO-001',
              recordedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const res = await controller.getMovements('item_123', 1, 20, undefined, mockUser);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.movementType).toBe(StockMovementType.PURCHASE);
    });

    it('computes inventory working capital valuation', async () => {
      const valuationResult: InventoryValuationDTO = {
        totalDistinctItems: 5,
        totalQuantityUnits: 250,
        totalValueAmount: 6250.0,
        currency: 'USD',
        calculatedAt: '2026-08-31T12:00:00.000Z',
        breakdownByCategory: {},
        items: [],
      };

      valuationHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(valuationResult),
      );

      const res = await controller.getValuation(mockUser);
      expect(res.totalDistinctItems).toBe(5);
      expect(res.totalQuantityUnits).toBe(250);
      expect(res.totalValueAmount).toBe(6250.0);
      expect(res.currency).toBe('USD');
    });
  });

  describe('4. Stock Mutation Action Endpoints', () => {
    it('records purchase stock receipt via POST :id/receive', async () => {
      const dto: ReceiveStockRequestDto = {
        quantity: 25,
        unitCost: 24.0,
        referenceNumber: 'PO-9912',
        notes: 'Monthly batch delivery',
      };

      receiveHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(createMockMutationResult(75, 25, StockMovementType.PURCHASE)),
      );

      const res = await controller.receiveStock('item_123', dto, mockUser);
      expect(res.item.quantityOnHand).toBe(75);
      expect(receiveHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            itemId: 'item_123',
            quantity: 25,
            referenceId: 'PO-9912',
          }),
        }),
      );
    });

    it('records retail sale deduction via POST :id/sell', async () => {
      const dto: SellStockRequestDto = {
        quantity: 2,
        unitPrice: 45.0,
        referenceId: 'POS-REC-001',
        notes: 'Counter POS sale',
      };

      sellHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(createMockMutationResult(73, -2, StockMovementType.SALE)),
      );

      const res = await controller.sellStock('item_123', dto, mockUser);
      expect(res.item.quantityOnHand).toBe(73);
    });

    it('records clinical consumption via POST :id/consume', async () => {
      const dto: ConsumeStockRequestDto = {
        quantity: 1,
        treatmentSessionId: 'sess_physio_01',
        notes: 'Used in knee therapy treatment',
      };

      consumeHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(
          createMockMutationResult(72, -1, StockMovementType.CONSUMPTION),
        ),
      );

      const res = await controller.consumeStock('item_123', dto, mockUser);
      expect(res.item.quantityOnHand).toBe(72);
    });

    it('records damaged/spoiled scrap disposal via POST :id/scrap', async () => {
      const dto: ScrapStockRequestDto = {
        quantity: 2,
        reason: 'Broken seal and contaminated packaging',
      };

      scrapHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(createMockMutationResult(70, -2, StockMovementType.SCRAP)),
      );

      const res = await controller.scrapStock('item_123', dto, mockUser);
      expect(res.item.quantityOnHand).toBe(70);
    });

    it('records physical inventory audit adjustment via POST :id/adjust', async () => {
      const dto: AdjustStockRequestDto = {
        deltaQuantity: -5,
        reason: 'Q3 Physical Inventory Count Variance',
      };

      adjustHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok(
          createMockMutationResult(65, -5, StockMovementType.ADJUSTMENT_OUT),
        ),
      );

      const res = await controller.adjustStock('item_123', dto, mockUser);
      expect(res.item.quantityOnHand).toBe(65);
    });

    it('throws BadRequestException when handler execution fails', async () => {
      const dto: ScrapStockRequestDto = {
        quantity: 9999,
        reason: 'Attempting invalid excessive scrap',
      };

      scrapHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Cannot scrap more stock than currently on hand.'),
      );

      await expect(controller.scrapStock('item_123', dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
