import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InventoryCategory,
  InventoryItemStatus,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  InventoryItemDTO,
  FixedAssetDTO,
  ResourcesApplicationResult,
  ListInventoryItemsHandler,
  ListFixedAssetsHandler,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryHandler,
} from '@kinergy-platform/core';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import {
  ListInventoryItemsQueryDto,
  ListFixedAssetsQueryDto,
  GetAssetHistoryQueryDto,
  GetMaintenanceHistoryQueryDto,
} from '../dto';

describe('Phase 6.9 Resources API Query Consistency, Pagination & Error Matrix', () => {
  let pipe: GlobalSanitizationValidationPipe;

  let mockListInventoryItemsHandler: jest.Mocked<ListInventoryItemsHandler>;
  let mockListFixedAssetsHandler: jest.Mocked<ListFixedAssetsHandler>;
  let mockGetAssetHistoryHandler: jest.Mocked<GetAssetHistoryHandler>;
  let mockGetMaintenanceHistoryHandler: jest.Mocked<GetMaintenanceHistoryHandler>;

  let inventoryController: InventoryController;
  let fixedAssetsController: FixedAssetsController;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_admin_01',
    email: 'admin@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: [
      'inventory.read',
      'inventory.write',
      'assets.read',
      'assets.write',
      'billing.read',
    ],
    tenantId: 'tenant_main',
  });

  const createMock = <T>() => ({ execute: jest.fn() }) as unknown as T;

  const mockInventoryItemDTO: InventoryItemDTO = {
    id: 'inv_101',
    tenantId: 'tenant_main',
    sku: 'PROT-WHEY-1KG',
    name: 'Vanilla Whey Isolate 1kg',
    description: '100% natural isolate',
    category: InventoryCategory.SUPPLEMENTS,
    unit: 'TUB',
    minimumStock: 5,
    quantityOnHand: 20,
    purchaseCostAmount: 25.0,
    purchaseCostCurrency: 'USD',
    sellingPriceAmount: 45.0,
    sellingPriceCurrency: 'USD',
    status: InventoryItemStatus.ACTIVE,
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  const mockFixedAssetDTO: FixedAssetDTO = {
    id: 'ast_201',
    tenantId: 'tenant_main',
    assetTag: 'AST-KNE-001',
    name: 'Biodex System 4 Pro',
    description: 'Isokinetic Dynamometer',
    category: AssetCategory.THERAPY_EQUIPMENT,
    status: AssetStatus.ACTIVE,
    condition: AssetCondition.EXCELLENT,
    purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
    purchaseValueAmount: 45000.0,
    purchaseValueCurrency: 'USD',
    currentEstimatedValueAmount: 45000.0,
    currentEstimatedValueCurrency: 'USD',
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
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  };

  beforeEach(() => {
    pipe = new GlobalSanitizationValidationPipe();

    mockListInventoryItemsHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListInventoryItemsHandler>;
    mockListFixedAssetsHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListFixedAssetsHandler>;
    mockGetAssetHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetAssetHistoryHandler>;
    mockGetMaintenanceHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetMaintenanceHistoryHandler>;

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
      mockListInventoryItemsHandler,
      createMock(),
      createMock(),
      createMock(),
      createMock(),
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
      mockListFixedAssetsHandler,
      mockGetAssetHistoryHandler,
      mockGetMaintenanceHistoryHandler,
      createMock(),
      createMock(),
    );
  });

  describe('1. Standardized Pagination Test Matrix', () => {
    it('applies default pagination parameters (page=1, limit=20)', async () => {
      const emptyQuery = {};
      const validatedDto = (await pipe.transform(emptyQuery, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      expect(validatedDto.page).toBe(1);
      expect(validatedDto.limit).toBe(20);

      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockInventoryItemDTO],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const response = await inventoryController.listItems(validatedDto, mockUser);
      expect(response.page).toBe(1);
      expect(response.limit).toBe(20);
      expect(response.total).toBe(1);
      expect(response.totalPages).toBe(1);
      expect(response.hasNextPage).toBe(false);
      expect(response.hasPreviousPage).toBe(false);
    });

    it('processes custom valid pagination (page=3, limit=50)', async () => {
      const customQuery = { page: '3', limit: '50' };
      const validatedDto = (await pipe.transform(customQuery, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      expect(validatedDto.page).toBe(3);
      expect(validatedDto.limit).toBe(50);

      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockInventoryItemDTO],
          total: 120,
          page: 3,
          limit: 50,
          totalPages: 3,
          hasNextPage: false,
          hasPreviousPage: true,
        }),
      );

      const response = await inventoryController.listItems(validatedDto, mockUser);
      expect(response.page).toBe(3);
      expect(response.limit).toBe(50);
      expect(response.total).toBe(120);
      expect(response.totalPages).toBe(3);
      expect(response.hasNextPage).toBe(false);
      expect(response.hasPreviousPage).toBe(true);
    });

    it('enforces maximum pagination limit (limit=100)', async () => {
      const maxQuery = { limit: '100' };
      const validatedDto = (await pipe.transform(maxQuery, {
        type: 'query',
        metatype: ListFixedAssetsQueryDto,
      })) as ListFixedAssetsQueryDto;

      expect(validatedDto.limit).toBe(100);
    });

    it('rejects invalid pagination parameters (page < 1 or limit < 1)', async () => {
      await expect(
        pipe.transform({ page: '0' }, { type: 'query', metatype: ListInventoryItemsQueryDto }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform({ limit: '-1' }, { type: 'query', metatype: ListFixedAssetsQueryDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns a deterministic empty pagination envelope when no records match', async () => {
      const query = { search: 'NonExistentProduct' };
      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const response = await inventoryController.listItems(validatedDto, mockUser);
      expect(response.items).toEqual([]);
      expect(response.total).toBe(0);
      expect(response.page).toBe(1);
      expect(response.totalPages).toBe(0);
      expect(response.hasNextPage).toBe(false);
      expect(response.hasPreviousPage).toBe(false);
    });
  });

  describe('2. Multi-Criteria Filtering & Search Consistency Matrix', () => {
    it('supports single facet filtering (category)', async () => {
      const query = { category: InventoryCategory.SUPPLEMENTS };
      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockInventoryItemDTO],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      await inventoryController.listItems(validatedDto, mockUser);
      expect(mockListInventoryItemsHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              category: InventoryCategory.SUPPLEMENTS,
            }),
          }),
        }),
      );
    });

    it('supports multiple combined filters (category + status + location)', async () => {
      const query = {
        category: AssetCategory.THERAPY_EQUIPMENT,
        status: AssetStatus.ACTIVE,
        condition: AssetCondition.EXCELLENT,
        facilityId: 'fac_main',
        roomId: 'room_rehab_01',
      };

      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: ListFixedAssetsQueryDto,
      })) as ListFixedAssetsQueryDto;

      mockListFixedAssetsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockFixedAssetDTO],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      await fixedAssetsController.listAssets(validatedDto, mockUser);
      expect(mockListFixedAssetsHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              category: AssetCategory.THERAPY_EQUIPMENT,
              status: AssetStatus.ACTIVE,
              condition: AssetCondition.EXCELLENT,
              facilityId: 'fac_main',
              roomId: 'room_rehab_01',
            }),
          }),
        }),
      );
    });

    it('supports keyword search combined with category and stockStatus filters', async () => {
      const query = {
        search: 'Whey Isolate',
        category: InventoryCategory.SUPPLEMENTS,
        stockStatus: 'IN_STOCK',
      };

      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [mockInventoryItemDTO],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      await inventoryController.listItems(validatedDto, mockUser);
      expect(mockListInventoryItemsHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              search: 'Whey Isolate',
              category: InventoryCategory.SUPPLEMENTS,
              stockStatus: 'IN_STOCK',
            }),
          }),
        }),
      );
    });
  });

  describe('3. Sorting & Deterministic Fallback Matrix', () => {
    it('applies deterministic default sorting (name asc / createdAt desc)', async () => {
      const emptyQuery = {};
      const validatedDto = (await pipe.transform(emptyQuery, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      expect(validatedDto.sortBy).toBe('name');
      expect(validatedDto.sortOrder).toBe('asc');
    });

    it('supports custom sorting fields and sort directions (asc and desc)', async () => {
      const sortQuery = {
        sortBy: 'quantityOnHand',
        sortOrder: 'desc',
      };

      const validatedDto = (await pipe.transform(sortQuery, {
        type: 'query',
        metatype: ListInventoryItemsQueryDto,
      })) as ListInventoryItemsQueryDto;

      expect(validatedDto.sortBy).toBe('quantityOnHand');
      expect(validatedDto.sortOrder).toBe('desc');

      const assetSortQuery = {
        sortBy: 'purchaseValue',
        sortOrder: 'desc',
      };

      const validatedAssetDto = (await pipe.transform(assetSortQuery, {
        type: 'query',
        metatype: ListFixedAssetsQueryDto,
      })) as ListFixedAssetsQueryDto;

      expect(validatedAssetDto.sortBy).toBe('purchaseValue');
      expect(validatedAssetDto.sortOrder).toBe('desc');
    });
  });

  describe('4. Ledger, Movement & History Query Consistency Matrix', () => {
    it('paginates asset audit history ledger via GetAssetHistoryQueryDto', async () => {
      const query = {
        eventType: AssetHistoryEventType.TRANSFERRED,
        page: '2',
        limit: '10',
        sortOrder: 'desc',
      };

      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: GetAssetHistoryQueryDto,
      })) as GetAssetHistoryQueryDto;

      expect(validatedDto.page).toBe(2);
      expect(validatedDto.limit).toBe(10);
      expect(validatedDto.eventType).toBe(AssetHistoryEventType.TRANSFERRED);

      mockGetAssetHistoryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [],
          total: 12,
          page: 2,
          limit: 10,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        }),
      );

      const response = await fixedAssetsController.getAssetHistory(
        'ast_201',
        validatedDto,
        mockUser,
      );
      expect(response.total).toBe(12);
      expect(response.page).toBe(2);
      expect(response.hasPreviousPage).toBe(true);
    });

    it('paginates servicing maintenance records via GetMaintenanceHistoryQueryDto', async () => {
      const query = {
        performedBy: 'Biodex Certified Tech',
        page: '1',
        limit: '20',
      };

      const validatedDto = (await pipe.transform(query, {
        type: 'query',
        metatype: GetMaintenanceHistoryQueryDto,
      })) as GetMaintenanceHistoryQueryDto;

      expect(validatedDto.performedBy).toBe('Biodex Certified Tech');

      mockGetMaintenanceHistoryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.ok({
          items: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      const response = await fixedAssetsController.getMaintenanceHistory(
        'ast_201',
        validatedDto,
        mockUser,
      );
      expect(response.total).toBe(0);
      expect(response.items).toEqual([]);
    });
  });

  describe('5. Error Consistency & Exception Mapping Matrix', () => {
    it('maps missing resource lookup to NotFoundException', async () => {
      mockGetAssetHistoryHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail("Fixed asset with ID 'ast_missing' not found."),
      );

      await expect(
        fixedAssetsController.getAssetHistory('ast_missing', {}, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps domain invariant failures to BadRequestException with descriptive business reason', async () => {
      mockListInventoryItemsHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Invalid search criteria filter combination.'),
      );

      await expect(inventoryController.listItems({}, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
