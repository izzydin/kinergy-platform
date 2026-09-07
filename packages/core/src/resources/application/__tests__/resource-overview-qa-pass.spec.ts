import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
} from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { GetResourceOverviewHandler } from '../handlers/get-resource-overview.handler';
import { GetResourceOverviewQuery } from '../queries/get-resource-overview.query';

class QAInMemoryInventoryRepository implements InventoryItemRepository {
  private items = new Map<string, InventoryItem>();

  async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    return item ? this.clone(item) : null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const item of this.items.values()) {
      if (item.sku.value === sku && (!tenantId || item.tenantId === tenantId)) {
        return this.clone(item);
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id.getValue(), this.clone(item));
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let all = Array.from(this.items.values()).map((i) => this.clone(i));

    if (filter?.tenantId) {
      all = all.filter((i) => i.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      all = all.filter((i) => cats.includes(i.category));
    }
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      all = all.filter((i) => statuses.includes(i.status));
    } else if (!filter?.includeArchived) {
      all = all.filter((i) => i.status !== InventoryItemStatus.ARCHIVED);
    }
    if (filter?.lowStockOnly) {
      all = all.filter((i) => i.isLowStock());
    }
    return all;
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const items = await this.findMany(filter);
    return items.length;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  public clear(): void {
    this.items.clear();
  }

  private clone(item: InventoryItem): InventoryItem {
    return InventoryItem.reconstitute({
      id: item.id,
      tenantId: item.tenantId,
      sku: item.sku,
      name: item.name,
      description: item.description,
      category: item.category,
      unit: item.unit,
      minimumStock: item.minimumStock,
      quantityOnHand: item.quantityOnHand,
      purchaseCost: item.purchaseCost,
      sellingPrice: item.sellingPrice,
      status: item.status,
      locationRef: item.locationRef,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }
}

class QAInMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  private store = new Map<string, FixedAsset>();

  async findById(id: AssetId): Promise<FixedAsset | null> {
    const asset = this.store.get(id.value);
    return asset ? this.clone(asset) : null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const norm = assetTag.trim().toUpperCase();
    for (const asset of this.store.values()) {
      if (asset.assetTag === norm && (!tenantId || asset.tenantId === tenantId)) {
        return this.clone(asset);
      }
    }
    return null;
  }

  async save(asset: FixedAsset): Promise<void> {
    this.store.set(asset.id.value, this.clone(asset));
  }

  async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    let list = Array.from(this.store.values()).map((a) => this.clone(a));

    if (filter?.tenantId) {
      list = list.filter((a) => a.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      list = list.filter((a) => cats.includes(a.category));
    }
    if (!filter?.includeDecommissioned) {
      list = list.filter((a) => a.status !== AssetStatus.RETIRED && a.status !== AssetStatus.SOLD);
    }
    return list;
  }

  async count(filter?: FixedAssetFilterOptions): Promise<number> {
    const list = await this.findAll(filter);
    return list.length;
  }

  async delete(id: AssetId): Promise<void> {
    this.store.delete(id.value);
  }

  public clear(): void {
    this.store.clear();
  }

  private clone(asset: FixedAsset): FixedAsset {
    return FixedAsset.reconstitute({
      id: asset.id,
      tenantId: asset.tenantId,
      assetTag: asset.assetTag,
      name: asset.name,
      description: asset.description,
      category: asset.category,
      purchaseDate: asset.purchaseDate,
      purchaseValue: asset.purchaseValue,
      currentEstimatedValue: asset.currentEstimatedValue,
      condition: asset.condition,
      status: asset.status,
      location: asset.location,
      notes: asset.notes,
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }
}

describe('Milestone 6.14 Resource Overview QA Pass — Comprehensive Domain Verification', () => {
  const actorId = 'usr_qa_reviewer_01';
  const tenantId = 'tenant_qa_verification';

  let inventoryRepo: QAInMemoryInventoryRepository;
  let assetRepo: QAInMemoryFixedAssetRepository;
  let handler: GetResourceOverviewHandler;

  const defaultLocation = AssetLocation.create({
    facilityId: 'facility_qa_center',
    roomId: 'room_101',
  });

  const createItem = (params: {
    sku: string;
    name: string;
    category?: InventoryCategory;
    qty: number;
    minStock?: number;
    purchaseCost: number;
    status?: InventoryItemStatus;
  }): InventoryItem => {
    return InventoryItem.create({
      tenantId,
      sku: params.sku,
      name: params.name,
      category: params.category ?? InventoryCategory.SUPPLEMENTS,
      unit: UnitOfMeasure.UNITS,
      minimumStock: params.minStock ?? 10,
      initialStock: params.qty,
      purchaseCost: { amount: params.purchaseCost, currency: 'USD' },
      sellingPrice: { amount: params.purchaseCost * 1.4, currency: 'USD' },
      status: params.status ?? InventoryItemStatus.ACTIVE,
      recordedByUserId: actorId,
    });
  };

  const createAsset = (params: {
    tag: string;
    name: string;
    category?: AssetCategory;
    purchaseValue: number;
    estimatedValue: number;
    status: AssetStatus;
    condition?: AssetCondition;
  }): FixedAsset => {
    return FixedAsset.reconstitute({
      id: AssetId.create(),
      tenantId,
      assetTag: params.tag,
      name: params.name,
      category: params.category ?? AssetCategory.GYM_EQUIPMENT,
      purchaseDate: new Date('2025-01-01T00:00:00Z'),
      purchaseValue: Money.create(params.purchaseValue, 'USD'),
      currentEstimatedValue: Money.create(params.estimatedValue, 'USD'),
      condition: params.condition ?? AssetCondition.EXCELLENT,
      status: params.status,
      location: defaultLocation,
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    });
  };

  beforeEach(() => {
    inventoryRepo = new QAInMemoryInventoryRepository();
    assetRepo = new QAInMemoryFixedAssetRepository();
    handler = new GetResourceOverviewHandler(inventoryRepo, assetRepo);
  });

  // =========================================================================
  // 1. Inventory Valuation: Σ(currentStock × purchaseCost)
  // =========================================================================
  describe('1. Inventory Valuation', () => {
    it('verifies exact Σ(currentStock × purchaseCost) across multiple items', async () => {
      // Product 1: 15 units @ $24.50 = $367.50
      await inventoryRepo.save(
        createItem({ sku: 'PRD-1', name: 'Product 1', qty: 15, purchaseCost: 24.5 }),
      );
      // Product 2: 40 units @ $12.25 = $490.00
      await inventoryRepo.save(
        createItem({ sku: 'PRD-2', name: 'Product 2', qty: 40, purchaseCost: 12.25 }),
      );
      // Product 3: 5 units @ $110.00 = $550.00
      await inventoryRepo.save(
        createItem({ sku: 'PRD-3', name: 'Product 3', qty: 5, purchaseCost: 110.0 }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      // 367.50 + 490.00 + 550.00 = 1407.50
      expect(overview.consumableInventory.totalValueAmount).toBe(1407.5);
      expect(overview.consumableInventory.totalDistinctItems).toBe(3);
      expect(overview.consumableInventory.totalQuantityUnits).toBe(60);
    });
  });

  // =========================================================================
  // 2. Asset Valuation: Σ(currentEstimatedValue)
  // =========================================================================
  describe('2. Asset Valuation', () => {
    it('verifies Σ(currentEstimatedValue) for all carrying assets (Active, Maintenance, Damaged)', async () => {
      // Asset 1 (Active): $4,200.00
      await assetRepo.save(
        createAsset({
          tag: 'AST-QA-1',
          name: 'Rowing Machine',
          purchaseValue: 5000,
          estimatedValue: 4200,
          status: AssetStatus.ACTIVE,
        }),
      );
      // Asset 2 (Under Maintenance): $2,800.00
      await assetRepo.save(
        createAsset({
          tag: 'AST-QA-2',
          name: 'Kinesiology Bench',
          purchaseValue: 3500,
          estimatedValue: 2800,
          status: AssetStatus.UNDER_MAINTENANCE,
        }),
      );
      // Asset 3 (Damaged): $650.00
      await assetRepo.save(
        createAsset({
          tag: 'AST-QA-3',
          name: 'Adjustable Pulley',
          purchaseValue: 1200,
          estimatedValue: 650,
          status: AssetStatus.DAMAGED,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      // 4200 + 2800 + 650 = 7650.00
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(7650);
      expect(overview.fixedAssets.totalAssetCount).toBe(3);
    });
  });

  // =========================================================================
  // 3. Combined Valuation: inventoryValue + fixedAssetValue
  // =========================================================================
  describe('3. Combined Valuation', () => {
    it('verifies exact combined balance: inventoryValue + fixedAssetValue', async () => {
      // Inventory: 20 units @ $75.25 = $1,505.00
      await inventoryRepo.save(
        createItem({ sku: 'INV-COMB-1', name: 'Recovery Gel', qty: 20, purchaseCost: 75.25 }),
      );
      // Fixed Asset: $18,495.00
      await assetRepo.save(
        createAsset({
          tag: 'AST-COMB-1',
          name: 'Infrared Sauna Unit',
          purchaseValue: 22000,
          estimatedValue: 18495,
          status: AssetStatus.ACTIVE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      expect(overview.consumableInventory.totalValueAmount).toBe(1505.0);
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(18495.0);
      // 1505.00 + 18495.00 = 20000.00
      expect(overview.combined.totalCombinedValueAmount).toBe(20000.0);
    });
  });

  // =========================================================================
  // 4. Low Stock Minimum-Stock Semantics
  // =========================================================================
  describe('4. Low Stock Semantics', () => {
    it('Scenario 4a: zero low-stock items when all items exceed minimum stock', async () => {
      await inventoryRepo.save(
        createItem({ sku: 'HEALTHY-1', name: 'Stock 1', qty: 25, minStock: 10, purchaseCost: 10 }),
      );
      await inventoryRepo.save(
        createItem({ sku: 'HEALTHY-2', name: 'Stock 2', qty: 50, minStock: 20, purchaseCost: 15 }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().consumableInventory.lowStockItemCount).toBe(0);
    });

    it('Scenario 4b: exactly one low-stock item', async () => {
      await inventoryRepo.save(
        createItem({ sku: 'HEALTHY-1', name: 'Stock 1', qty: 25, minStock: 10, purchaseCost: 10 }),
      );
      await inventoryRepo.save(
        createItem({ sku: 'LOW-1', name: 'Low Stock 1', qty: 3, minStock: 10, purchaseCost: 15 }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().consumableInventory.lowStockItemCount).toBe(1);
    });

    it('Scenario 4c: multiple low-stock items', async () => {
      await inventoryRepo.save(
        createItem({ sku: 'LOW-1', name: 'Low Stock 1', qty: 2, minStock: 10, purchaseCost: 10 }),
      );
      await inventoryRepo.save(
        createItem({ sku: 'LOW-2', name: 'Low Stock 2', qty: 0, minStock: 5, purchaseCost: 15 }),
      );
      await inventoryRepo.save(
        createItem({ sku: 'LOW-3', name: 'Low Stock 3', qty: 4, minStock: 8, purchaseCost: 20 }),
      );
      await inventoryRepo.save(
        createItem({ sku: 'HEALTHY-1', name: 'Healthy', qty: 50, minStock: 10, purchaseCost: 5 }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().consumableInventory.lowStockItemCount).toBe(3);
    });

    it('Scenario 4d: boundary conditions (currentStock === minStock is LOW; currentStock === minStock + 1 is HEALTHY)', async () => {
      // Exactly at boundary: currentStock = 10, minStock = 10 -> isLowStock: true
      await inventoryRepo.save(
        createItem({
          sku: 'BOUND-LOW',
          name: 'Boundary Low',
          qty: 10,
          minStock: 10,
          purchaseCost: 10,
        }),
      );
      // One unit above boundary: currentStock = 11, minStock = 10 -> isLowStock: false
      await inventoryRepo.save(
        createItem({
          sku: 'BOUND-OK',
          name: 'Boundary Healthy',
          qty: 11,
          minStock: 10,
          purchaseCost: 10,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().consumableInventory.lowStockItemCount).toBe(1);
    });

    it('Scenario 4e: inactive/archived products according to domain rules', async () => {
      // Archived item that has qty <= minStock
      await inventoryRepo.save(
        createItem({
          sku: 'ARCH-1',
          name: 'Archived Item',
          qty: 2,
          minStock: 10,
          purchaseCost: 20,
          status: InventoryItemStatus.ARCHIVED,
        }),
      );
      // Active item with healthy stock
      await inventoryRepo.save(
        createItem({
          sku: 'ACT-1',
          name: 'Active Item',
          qty: 30,
          minStock: 10,
          purchaseCost: 20,
          status: InventoryItemStatus.ACTIVE,
        }),
      );

      // Default query: includeArchived = false
      const defaultQuery = new GetResourceOverviewQuery({ tenantId, includeArchived: false });
      const defaultResult = await handler.execute(defaultQuery);

      expect(defaultResult.isSuccess).toBe(true);
      // Archived item must NOT be counted as low stock or included in total distinct items
      expect(defaultResult.getValue().consumableInventory.lowStockItemCount).toBe(0);
      expect(defaultResult.getValue().consumableInventory.totalDistinctItems).toBe(1);

      // Query with includeArchived = true
      const archivedQuery = new GetResourceOverviewQuery({ tenantId, includeArchived: true });
      const archivedResult = await handler.execute(archivedQuery);

      expect(archivedResult.isSuccess).toBe(true);
      expect(archivedResult.getValue().consumableInventory.lowStockItemCount).toBe(1);
      expect(archivedResult.getValue().consumableInventory.totalDistinctItems).toBe(2);
    });
  });

  // =========================================================================
  // 5. Asset Statuses: Each State Independently
  // =========================================================================
  describe('5. Asset Statuses Independently', () => {
    it('tests ACTIVE status independently', async () => {
      await assetRepo.save(
        createAsset({
          tag: 'AST-ACTIVE-SOLO',
          name: 'Active Asset',
          purchaseValue: 2000,
          estimatedValue: 1800,
          status: AssetStatus.ACTIVE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const { fixedAssets } = result.getValue();
      expect(fixedAssets.activeAssetCount).toBe(1);
      expect(fixedAssets.underMaintenanceAssetCount).toBe(0);
      expect(fixedAssets.damagedAssetCount).toBe(0);
      expect(fixedAssets.retiredAssetCount).toBe(0);
      expect(fixedAssets.totalAssetCount).toBe(1);
      expect(fixedAssets.totalCarryingValueAmount).toBe(1800);
    });

    it('tests UNDER_MAINTENANCE status independently', async () => {
      await assetRepo.save(
        createAsset({
          tag: 'AST-MAINT-SOLO',
          name: 'Maintenance Asset',
          purchaseValue: 3000,
          estimatedValue: 2500,
          status: AssetStatus.UNDER_MAINTENANCE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const { fixedAssets } = result.getValue();
      expect(fixedAssets.activeAssetCount).toBe(0);
      expect(fixedAssets.underMaintenanceAssetCount).toBe(1);
      expect(fixedAssets.damagedAssetCount).toBe(0);
      expect(fixedAssets.retiredAssetCount).toBe(0);
      expect(fixedAssets.totalAssetCount).toBe(1);
      expect(fixedAssets.totalCarryingValueAmount).toBe(2500);
    });

    it('tests DAMAGED status independently', async () => {
      await assetRepo.save(
        createAsset({
          tag: 'AST-DMG-SOLO',
          name: 'Damaged Asset',
          purchaseValue: 1500,
          estimatedValue: 400,
          status: AssetStatus.DAMAGED,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const { fixedAssets } = result.getValue();
      expect(fixedAssets.activeAssetCount).toBe(0);
      expect(fixedAssets.underMaintenanceAssetCount).toBe(0);
      expect(fixedAssets.damagedAssetCount).toBe(1);
      expect(fixedAssets.retiredAssetCount).toBe(0);
      expect(fixedAssets.totalAssetCount).toBe(1);
      expect(fixedAssets.totalCarryingValueAmount).toBe(400);
    });

    it('tests RETIRED status independently (must track count but carry 0 on balance sheet)', async () => {
      await assetRepo.save(
        createAsset({
          tag: 'AST-RET-SOLO',
          name: 'Retired Asset',
          purchaseValue: 8000,
          estimatedValue: 1200,
          status: AssetStatus.RETIRED,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const { fixedAssets } = result.getValue();
      expect(fixedAssets.activeAssetCount).toBe(0);
      expect(fixedAssets.underMaintenanceAssetCount).toBe(0);
      expect(fixedAssets.damagedAssetCount).toBe(0);
      expect(fixedAssets.retiredAssetCount).toBe(1);
      expect(fixedAssets.totalAssetCount).toBe(1);
      // Carrying value of retired equipment must be $0
      expect(fixedAssets.totalCarryingValueAmount).toBe(0);
    });
  });

  // =========================================================================
  // 6. Separation: Dramatically Different Values
  // =========================================================================
  describe('6. Separation with Dramatically Different Values', () => {
    it('maintains strict domain separation when Fixed Assets value massively dwarfs Inventory', async () => {
      // Inventory: $2.50
      await inventoryRepo.save(
        createItem({ sku: 'TINY-INV', name: 'Sticker Pack', qty: 1, purchaseCost: 2.5 }),
      );
      // Fixed Asset: $10,000,000.00
      await assetRepo.save(
        createAsset({
          tag: 'MEGA-BLDG',
          name: 'HQ Wellness Facility Complex',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 12000000,
          estimatedValue: 10000000,
          status: AssetStatus.ACTIVE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      // No bleed-through or scale flattening
      expect(overview.consumableInventory.totalValueAmount).toBe(2.5);
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(10000000.0);
      expect(overview.combined.totalCombinedValueAmount).toBe(10000002.5);
    });

    it('maintains strict domain separation when Inventory value massively dwarfs Fixed Assets', async () => {
      // Inventory: $5,000,000.00 (50,000 units @ $100)
      await inventoryRepo.save(
        createItem({
          sku: 'MASSIVE-INV',
          name: 'Specialty Peptide Stock',
          qty: 50000,
          purchaseCost: 100.0,
        }),
      );
      // Fixed Asset: $150.00
      await assetRepo.save(
        createAsset({
          tag: 'TINY-ASSET',
          name: 'Small Desk Fan',
          category: AssetCategory.ELECTRONICS,
          purchaseValue: 200,
          estimatedValue: 150,
          status: AssetStatus.ACTIVE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      expect(overview.consumableInventory.totalValueAmount).toBe(5000000.0);
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(150.0);
      expect(overview.combined.totalCombinedValueAmount).toBe(5000150.0);
    });
  });

  // =========================================================================
  // 7. Empty State: All Metrics Zero
  // =========================================================================
  describe('7. Empty State', () => {
    it('verifies that all metrics are strictly zero when tenant has no resources', async () => {
      const query = new GetResourceOverviewQuery({ tenantId: 'tenant_empty_slate' });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      expect(overview.consumableInventory.totalValueAmount).toBe(0);
      expect(overview.consumableInventory.lowStockItemCount).toBe(0);
      expect(overview.consumableInventory.totalDistinctItems).toBe(0);
      expect(overview.consumableInventory.totalQuantityUnits).toBe(0);

      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(0);
      expect(overview.fixedAssets.activeAssetCount).toBe(0);
      expect(overview.fixedAssets.underMaintenanceAssetCount).toBe(0);
      expect(overview.fixedAssets.damagedAssetCount).toBe(0);
      expect(overview.fixedAssets.retiredAssetCount).toBe(0);
      expect(overview.fixedAssets.totalAssetCount).toBe(0);

      expect(overview.combined.totalCombinedValueAmount).toBe(0);
      expect(overview.currency).toBe('USD');
      expect(overview.calculatedAt).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Decimal Correctness: Precision & Floating-Point Drift
  // =========================================================================
  describe('8. Decimal Correctness', () => {
    it('prevents binary floating point accumulation drift with tricky decimal combinations', async () => {
      // 0.10 + 0.20 = 0.30000000000000004 in raw JS
      await inventoryRepo.save(
        createItem({ sku: 'DEC-1', name: 'Item 1', qty: 1, purchaseCost: 0.1 }),
      );
      await assetRepo.save(
        createAsset({
          tag: 'DEC-AST-1',
          name: 'Equipment 1',
          purchaseValue: 1,
          estimatedValue: 0.2,
          status: AssetStatus.ACTIVE,
        }),
      );

      // Item 2: 7 units @ $19.99 = $139.93 (in raw JS 7 * 19.99 = 139.92999999999998)
      await inventoryRepo.save(
        createItem({ sku: 'DEC-2', name: 'Item 2', qty: 7, purchaseCost: 19.99 }),
      );

      // Asset 2: $0.07 (0.07 + 0.14 + 0.28 often exposes rounding drift)
      await assetRepo.save(
        createAsset({
          tag: 'DEC-AST-2',
          name: 'Equipment 2',
          purchaseValue: 1,
          estimatedValue: 0.07,
          status: AssetStatus.ACTIVE,
        }),
      );

      const query = new GetResourceOverviewQuery({ tenantId });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const overview = result.getValue();

      // Inventory: 0.10 + 139.93 = 140.03
      expect(overview.consumableInventory.totalValueAmount).toBe(140.03);

      // Assets: 0.20 + 0.07 = 0.27
      expect(overview.fixedAssets.totalCarryingValueAmount).toBe(0.27);

      // Combined: 140.03 + 0.27 = 140.30
      expect(overview.combined.totalCombinedValueAmount).toBe(140.3);
    });
  });
});
