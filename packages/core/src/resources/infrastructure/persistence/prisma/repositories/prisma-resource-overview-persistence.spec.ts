import { PrismaClient, AssetStatus, InventoryItemStatus } from '@prisma/client';
import { PrismaFixedAssetRepository } from './prisma-fixed-asset.repository';
import { PrismaInventoryItemRepository } from './prisma-inventory-item.repository';
import { GetResourceOverviewHandler } from '../../../../application/handlers/get-resource-overview.handler';
import { GetResourceOverviewQuery } from '../../../../application/queries/get-resource-overview.query';

describe('Resource Overview Infrastructure & Database Aggregation Persistence (Milestone 6.14)', () => {
  const tenantId = 'tenant_kinergy_prod_01';

  describe('1. PrismaFixedAssetRepository.getOverviewMetrics (ADR-0097 Lifecycle & Valuation Rules)', () => {
    it('executes single groupBy aggregation and computes carrying value strictly for operational assets', async () => {
      const mockGroupBy = jest.fn().mockResolvedValue([
        {
          status: AssetStatus.ACTIVE,
          _count: { id: 12 },
          _sum: { currentEstimatedValueAmount: '125000.50' },
        },
        {
          status: AssetStatus.UNDER_MAINTENANCE,
          _count: { id: 3 },
          _sum: { currentEstimatedValueAmount: '15400.25' },
        },
        {
          status: AssetStatus.DAMAGED,
          _count: { id: 2 },
          _sum: { currentEstimatedValueAmount: '6200.10' },
        },
        {
          status: AssetStatus.RETIRED,
          _count: { id: 5 },
          _sum: { currentEstimatedValueAmount: '45000.00' }, // Must be excluded from carrying value!
        },
        {
          status: AssetStatus.SOLD,
          _count: { id: 1 },
          _sum: { currentEstimatedValueAmount: '8000.00' }, // Must be excluded from carrying value!
        },
      ]);

      const mockPrisma = {
        fixedAsset: {
          groupBy: mockGroupBy,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaFixedAssetRepository(mockPrisma);
      const metrics = await repository.getOverviewMetrics({
        tenantId,
        includeDecommissioned: true,
      });

      expect(mockGroupBy).toHaveBeenCalledTimes(1);
      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
        _sum: { currentEstimatedValueAmount: true },
      });

      // Total count across all queried categories: 12 + 3 + 2 + 5 + 1 = 23
      expect(metrics.totalCount).toBe(23);
      expect(metrics.activeCount).toBe(12);
      expect(metrics.maintenanceCount).toBe(3);
      expect(metrics.damagedCount).toBe(2);
      expect(metrics.retiredCount).toBe(5);

      // Carrying value must strictly include ACTIVE + UNDER_MAINTENANCE + DAMAGED:
      // 125000.50 -> 12500050 cents
      // 15400.25  -> 1540025 cents
      // 6200.10   -> 620010 cents
      // Total: 14660085 cents ($146,600.85)
      expect(metrics.totalCarryingValueCents).toBe(14660085);
    });

    it('applies facility location filter and default decommissioned status exclusion when requested', async () => {
      const mockGroupBy = jest.fn().mockResolvedValue([]);
      const mockPrisma = {
        fixedAsset: {
          groupBy: mockGroupBy,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaFixedAssetRepository(mockPrisma);
      await repository.getOverviewMetrics({
        tenantId,
        facilityId: 'fac_east_wing',
        includeDecommissioned: false,
      });

      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: {
          tenantId,
          location: {
            path: ['facilityId'],
            equals: 'fac_east_wing',
          },
          status: {
            in: [AssetStatus.ACTIVE, AssetStatus.UNDER_MAINTENANCE, AssetStatus.DAMAGED],
          },
        },
        _count: { id: true },
        _sum: { currentEstimatedValueAmount: true },
      });
    });

    it('falls back to minimal column select without loading relations when groupBy is not available', async () => {
      const mockFindMany = jest.fn().mockResolvedValue([
        { status: AssetStatus.ACTIVE, currentEstimatedValueAmount: '100.25' },
        { status: AssetStatus.UNDER_MAINTENANCE, currentEstimatedValueAmount: '50.10' },
        { status: AssetStatus.RETIRED, currentEstimatedValueAmount: '999.99' },
      ]);

      const mockPrisma = {
        fixedAsset: {
          findMany: mockFindMany,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaFixedAssetRepository(mockPrisma);
      const metrics = await repository.getOverviewMetrics({
        tenantId,
        includeDecommissioned: true,
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { tenantId },
        select: {
          status: true,
          currentEstimatedValueAmount: true,
        },
      });

      expect(metrics.totalCount).toBe(3);
      expect(metrics.activeCount).toBe(1);
      expect(metrics.maintenanceCount).toBe(1);
      expect(metrics.retiredCount).toBe(1);
      // Carrying value excludes RETIRED: 10025 + 5010 = 15035 cents
      expect(metrics.totalCarryingValueCents).toBe(15035);
    });
  });

  describe('2. PrismaInventoryItemRepository.getOverviewMetrics (Database Aggregation)', () => {
    it('executes single raw SQL aggregation computing valuation cents, low-stock, and out-of-stock items', async () => {
      const mockQueryRaw = jest.fn().mockResolvedValue([
        {
          totalItems: 42,
          totalQuantity: 350.5,
          totalValuationCents: BigInt(874250), // $8,742.50
          lowStockCount: 7,
          outOfStockCount: 2,
        },
      ]);

      const mockPrisma = {
        $queryRaw: mockQueryRaw,
      } as unknown as PrismaClient;

      const repository = new PrismaInventoryItemRepository(mockPrisma);
      const metrics = await repository.getOverviewMetrics({
        tenantId,
        includeArchived: false,
      });

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(metrics.totalItems).toBe(42);
      expect(metrics.totalQuantity).toBe(350.5);
      expect(metrics.totalValuationCents).toBe(874250);
      expect(metrics.lowStockCount).toBe(7);
      expect(metrics.outOfStockCount).toBe(2);
    });

    it('falls back to minimal scalar projection when $queryRaw is not available', async () => {
      const mockFindMany = jest.fn().mockResolvedValue([
        { quantityOnHand: '10', purchaseCostAmount: '15.50', minimumStock: '5' },
        { quantityOnHand: '2', purchaseCostAmount: '20.00', minimumStock: '5' }, // low stock
        { quantityOnHand: '0', purchaseCostAmount: '12.00', minimumStock: '3' }, // out of stock & low stock
      ]);

      const mockPrisma = {
        inventoryItem: {
          findMany: mockFindMany,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaInventoryItemRepository(mockPrisma);
      const metrics = await repository.getOverviewMetrics({
        tenantId,
        includeArchived: false,
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          status: {
            in: [InventoryItemStatus.ACTIVE, InventoryItemStatus.INACTIVE],
          },
        },
        select: {
          quantityOnHand: true,
          purchaseCostAmount: true,
          minimumStock: true,
        },
      });

      expect(metrics.totalItems).toBe(3);
      expect(metrics.totalQuantity).toBe(12);
      // (10 * 15.50 = 155.00) + (2 * 20.00 = 40.00) + (0 * 12.00 = 0) = 195.00 -> 19500 cents
      expect(metrics.totalValuationCents).toBe(19500);
      expect(metrics.lowStockCount).toBe(2);
      expect(metrics.outOfStockCount).toBe(1);
    });
  });

  describe('3. PrismaInventoryItemRepository.count Optimizations', () => {
    it('uses scalar projection without loading movements when filtering lowStockOnly', async () => {
      const mockFindMany = jest.fn().mockResolvedValue([
        { quantityOnHand: '2', minimumStock: '5' }, // low stock
        { quantityOnHand: '10', minimumStock: '5' }, // in stock
        { quantityOnHand: '0', minimumStock: '2' }, // low stock
      ]);
      const mockCount = jest.fn();

      const mockPrisma = {
        inventoryItem: {
          findMany: mockFindMany,
          count: mockCount,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaInventoryItemRepository(mockPrisma);
      const count = await repository.count({
        tenantId,
        lowStockOnly: true,
      });

      expect(count).toBe(2);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          status: {
            in: [InventoryItemStatus.ACTIVE, InventoryItemStatus.INACTIVE],
          },
        },
        select: {
          quantityOnHand: true,
          minimumStock: true,
        },
      });
      // Database count should not have been called for cross-column filter
      expect(mockCount).not.toHaveBeenCalled();
    });

    it('delegates directly to database count when no cross-column filter is needed', async () => {
      const mockCount = jest.fn().mockResolvedValue(15);
      const mockFindMany = jest.fn();

      const mockPrisma = {
        inventoryItem: {
          count: mockCount,
          findMany: mockFindMany,
        },
      } as unknown as PrismaClient;

      const repository = new PrismaInventoryItemRepository(mockPrisma);
      const count = await repository.count({
        tenantId,
        includeArchived: true,
      });

      expect(count).toBe(15);
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });
      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });

  describe('4. End-to-End GetResourceOverviewHandler with Direct Repository Aggregations', () => {
    it('synthesizes complete ResourceOverviewDTO in parallel using direct database aggregation methods', async () => {
      const mockPrismaFixedAsset = {
        fixedAsset: {
          groupBy: jest.fn().mockResolvedValue([
            {
              status: AssetStatus.ACTIVE,
              _count: { id: 8 },
              _sum: { currentEstimatedValueAmount: '80000.00' },
            },
            {
              status: AssetStatus.UNDER_MAINTENANCE,
              _count: { id: 2 },
              _sum: { currentEstimatedValueAmount: '12000.50' },
            },
            {
              status: AssetStatus.DAMAGED,
              _count: { id: 1 },
              _sum: { currentEstimatedValueAmount: '3500.25' },
            },
            {
              status: AssetStatus.RETIRED,
              _count: { id: 3 },
              _sum: { currentEstimatedValueAmount: '15000.00' },
            },
          ]),
        },
      } as unknown as PrismaClient;

      const mockPrismaInventory = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            totalItems: 25,
            totalQuantity: 500,
            totalValuationCents: BigInt(2450000), // $24,500.00
            lowStockCount: 4,
            outOfStockCount: 1,
          },
        ]),
      } as unknown as PrismaClient;

      const fixedAssetRepo = new PrismaFixedAssetRepository(mockPrismaFixedAsset);
      const inventoryRepo = new PrismaInventoryItemRepository(mockPrismaInventory);

      const handler = new GetResourceOverviewHandler(inventoryRepo, fixedAssetRepo);
      const query = new GetResourceOverviewQuery({ tenantId });

      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      // Consumable Inventory metrics
      expect(overview.consumableInventory.totalValueAmount).toBe(24500.0);
      expect(overview.consumableInventory.lowStockItemCount).toBe(4);
      expect(overview.consumableInventory.totalDistinctItems).toBe(25);
      expect(overview.consumableInventory.totalQuantityUnits).toBe(500);

      // Fixed Asset metrics (carrying value excludes RETIRED: 80000 + 12000.50 + 3500.25 = 95500.75)
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(95500.75);
      expect(overview.fixedAssets.activeAssetCount).toBe(8);
      expect(overview.fixedAssets.underMaintenanceAssetCount).toBe(2);
      expect(overview.fixedAssets.damagedAssetCount).toBe(1);
      expect(overview.fixedAssets.retiredAssetCount).toBe(3);
      expect(overview.fixedAssets.totalAssetCount).toBe(14); // 8 + 2 + 1 + 3

      // Combined balance sheet value: 24500.00 + 95500.75 = 120000.75
      expect(overview.combined.totalCombinedValueAmount).toBe(120000.75);
      expect(overview.currency).toBe('USD');
      expect(overview.calculatedAt).toBeDefined();
    });
  });
});
