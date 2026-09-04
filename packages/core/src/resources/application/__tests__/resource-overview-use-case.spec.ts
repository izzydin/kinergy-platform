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

class InMemoryInventoryRepository implements InventoryItemRepository {
  private items = new Map<string, InventoryItem>();
  public shouldFail = false;

  async findById(id: string): Promise<InventoryItem | null> {
    if (this.shouldFail) throw new Error('Database connection failure: Inventory findById');
    const item = this.items.get(id);
    return item ? this.clone(item) : null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    if (this.shouldFail) throw new Error('Database connection failure: Inventory findBySku');
    for (const item of this.items.values()) {
      if (item.sku.value === sku && (!tenantId || item.tenantId === tenantId)) {
        return this.clone(item);
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    if (this.shouldFail) throw new Error('Database connection failure: Inventory save');
    this.items.set(item.id.getValue(), this.clone(item));
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    if (this.shouldFail) throw new Error('Database connection failure: Inventory findMany');
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
    if (this.shouldFail) throw new Error('Database connection failure: Inventory count');
    const items = await this.findMany(filter);
    return items.length;
  }

  async delete(id: string): Promise<void> {
    if (this.shouldFail) throw new Error('Database connection failure: Inventory delete');
    this.items.delete(id);
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

class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  private store = new Map<string, FixedAsset>();
  public shouldFail = false;

  async findById(id: AssetId): Promise<FixedAsset | null> {
    if (this.shouldFail) throw new Error('Database connection failure: Asset findById');
    const asset = this.store.get(id.value);
    return asset ? this.clone(asset) : null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    if (this.shouldFail) throw new Error('Database connection failure: Asset findByAssetTag');
    const norm = assetTag.trim().toUpperCase();
    for (const asset of this.store.values()) {
      if (asset.assetTag === norm && (!tenantId || asset.tenantId === tenantId)) {
        return this.clone(asset);
      }
    }
    return null;
  }

  async save(asset: FixedAsset): Promise<void> {
    if (this.shouldFail) throw new Error('Database connection failure: Asset save');
    this.store.set(asset.id.value, this.clone(asset));
  }

  async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    if (this.shouldFail) throw new Error('Database connection failure: Asset findAll');
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
    if (this.shouldFail) throw new Error('Database connection failure: Asset count');
    const list = await this.findAll(filter);
    return list.length;
  }

  async delete(id: AssetId): Promise<void> {
    if (this.shouldFail) throw new Error('Database connection failure: Asset delete');
    this.store.delete(id.value);
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

describe('GetResourceOverviewHandler — Milestone 6.14 Application Layer Tests', () => {
  const actorId = 'usr_overview_operator_01';
  const testTenantId = 'tenant_kinergy_overview_test';

  let inventoryRepo: InMemoryInventoryRepository;
  let assetRepo: InMemoryFixedAssetRepository;
  let handler: GetResourceOverviewHandler;

  const defaultLocation = AssetLocation.create({
    facilityId: 'fac_main_rehab',
    roomId: 'room_rehab_101',
  });

  const createItem = (params: {
    sku: string;
    name: string;
    category: InventoryCategory;
    qty: number;
    minStock?: number;
    purchaseCost: number;
    status?: InventoryItemStatus;
    unit?: UnitOfMeasure;
  }): InventoryItem => {
    return InventoryItem.create({
      tenantId: testTenantId,
      sku: params.sku,
      name: params.name,
      category: params.category,
      unit: params.unit ?? UnitOfMeasure.UNITS,
      minimumStock: params.minStock ?? 10,
      initialStock: params.qty,
      purchaseCost: { amount: params.purchaseCost, currency: 'USD' },
      sellingPrice: { amount: params.purchaseCost * 1.5, currency: 'USD' },
      status: params.status ?? InventoryItemStatus.ACTIVE,
      recordedByUserId: actorId,
    });
  };

  const createAsset = (params: {
    tag: string;
    name: string;
    category: AssetCategory;
    purchaseValue: number;
    estimatedValue: number;
    status: AssetStatus;
    condition?: AssetCondition;
  }): FixedAsset => {
    return FixedAsset.reconstitute({
      id: AssetId.create(),
      tenantId: testTenantId,
      assetTag: params.tag,
      name: params.name,
      category: params.category,
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
    inventoryRepo = new InMemoryInventoryRepository();
    assetRepo = new InMemoryFixedAssetRepository();
    handler = new GetResourceOverviewHandler(inventoryRepo, assetRepo);
  });

  // 1. Empty resources
  it('1. returns zeroed metrics when tenant has no inventory and no assets', async () => {
    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    expect(data.consumableInventory.totalValueAmount).toBe(0);
    expect(data.consumableInventory.lowStockItemCount).toBe(0);
    expect(data.consumableInventory.totalDistinctItems).toBe(0);
    expect(data.consumableInventory.totalQuantityUnits).toBe(0);

    expect(data.fixedAssets.totalCarryingValueAmount).toBe(0);
    expect(data.fixedAssets.activeAssetCount).toBe(0);
    expect(data.fixedAssets.underMaintenanceAssetCount).toBe(0);
    expect(data.fixedAssets.damagedAssetCount).toBe(0);
    expect(data.fixedAssets.retiredAssetCount).toBe(0);
    expect(data.fixedAssets.totalAssetCount).toBe(0);

    expect(data.combined.totalCombinedValueAmount).toBe(0);
    expect(data.currency).toBe('USD');
    expect(data.calculatedAt).toBeDefined();
  });

  // 2. Inventory valuation
  it('2. calculates consumable inventory working capital value accurately: Σ(currentStock × purchaseCost)', async () => {
    // Item A: 20 units @ $15.50 = $310.00
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-A',
        name: 'Whey Protein',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 20,
        purchaseCost: 15.5,
      }),
    );
    // Item B: 10 units @ $42.25 = $422.50
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-B',
        name: 'Electrolyte Pack',
        category: InventoryCategory.HEALTHY_DRINKS,
        qty: 10,
        purchaseCost: 42.25,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    // 310.00 + 422.50 = 732.50
    expect(data.consumableInventory.totalValueAmount).toBe(732.5);
    expect(data.consumableInventory.totalDistinctItems).toBe(2);
    expect(data.consumableInventory.totalQuantityUnits).toBe(30);
  });

  // 3. Asset valuation
  it('3. calculates fixed asset carrying value accurately: Σ(currentEstimatedValue) for eligible states', async () => {
    // Active asset: $5,000.00
    await assetRepo.save(
      createAsset({
        tag: 'AST-001',
        name: 'Commercial Treadmill',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 6000,
        estimatedValue: 5000,
        status: AssetStatus.ACTIVE,
      }),
    );
    // Under maintenance asset: $2,500.00
    await assetRepo.save(
      createAsset({
        tag: 'AST-002',
        name: 'Hydrotherapy Bed',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValue: 3500,
        estimatedValue: 2500,
        status: AssetStatus.UNDER_MAINTENANCE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    // 5000 + 2500 = 7500.00
    expect(data.fixedAssets.totalCarryingValueAmount).toBe(7500);
  });

  // 4. Combined valuation
  it('4. calculates combined resource balance sheet value accurately: Inventory Value + Fixed Asset Value', async () => {
    // Inventory: 10 units @ $50.00 = $500.00
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-001',
        name: 'Massage Gel',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        qty: 10,
        purchaseCost: 50.0,
      }),
    );

    // Fixed Asset: $4,500.00
    await assetRepo.save(
      createAsset({
        tag: 'AST-001',
        name: 'Pilates Reformer',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 5000,
        estimatedValue: 4500,
        status: AssetStatus.ACTIVE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    expect(data.consumableInventory.totalValueAmount).toBe(500);
    expect(data.fixedAssets.totalCarryingValueAmount).toBe(4500);
    expect(data.combined.totalCombinedValueAmount).toBe(5000);
  });

  // 5. Low-stock count
  it('5. counts low-stock items correctly where currentStock <= minimumStock (including zero stock)', async () => {
    // Item 1: qty 15, min 10 -> Healthy (not low stock)
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-OK',
        name: 'Plenty of Stock',
        category: InventoryCategory.RETAIL_PRODUCTS,
        qty: 15,
        minStock: 10,
        purchaseCost: 20,
      }),
    );
    // Item 2: qty 5, min 10 -> Low stock
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-LOW',
        name: 'Low Stock Item',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 5,
        minStock: 10,
        purchaseCost: 25,
      }),
    );
    // Item 3: qty 0, min 5 -> Zero stock (critically low stock)
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-ZERO',
        name: 'Out of Stock Item',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 0,
        minStock: 5,
        purchaseCost: 30,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    expect(data.consumableInventory.lowStockItemCount).toBe(2);
  });

  // 6. Active asset count
  it('6. counts active in-service assets accurately', async () => {
    await assetRepo.save(
      createAsset({
        tag: 'AST-A1',
        name: 'Active 1',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1000,
        estimatedValue: 900,
        status: AssetStatus.ACTIVE,
      }),
    );
    await assetRepo.save(
      createAsset({
        tag: 'AST-A2',
        name: 'Active 2',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1000,
        estimatedValue: 850,
        status: AssetStatus.ACTIVE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().fixedAssets.activeAssetCount).toBe(2);
  });

  // 7. Maintenance count
  it('7. counts equipment under maintenance accurately', async () => {
    await assetRepo.save(
      createAsset({
        tag: 'AST-M1',
        name: 'Maintenance 1',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValue: 3000,
        estimatedValue: 2000,
        status: AssetStatus.UNDER_MAINTENANCE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().fixedAssets.underMaintenanceAssetCount).toBe(1);
  });

  // 8. Damaged asset count
  it('8. counts damaged assets awaiting servicing accurately', async () => {
    await assetRepo.save(
      createAsset({
        tag: 'AST-D1',
        name: 'Damaged Bench',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 500,
        estimatedValue: 200,
        status: AssetStatus.DAMAGED,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().fixedAssets.damagedAssetCount).toBe(1);
  });

  // 9. Retired asset count
  it('9. counts retired assets accurately without omitting decommissioned equipment', async () => {
    await assetRepo.save(
      createAsset({
        tag: 'AST-R1',
        name: 'Old Elliptical',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 4000,
        estimatedValue: 0,
        status: AssetStatus.RETIRED,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().fixedAssets.retiredAssetCount).toBe(1);
  });

  // 10. Correct separation between inventory and assets
  it('10. preserves explicit structural separation between Consumable Inventory and Fixed Assets', async () => {
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-001',
        name: 'Protein Bar',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 50,
        purchaseCost: 2.0,
      }),
    );
    await assetRepo.save(
      createAsset({
        tag: 'AST-001',
        name: 'Spin Bike',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1200,
        estimatedValue: 1000,
        status: AssetStatus.ACTIVE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    // Must be distinct nested objects
    expect(data.consumableInventory).toBeDefined();
    expect(data.fixedAssets).toBeDefined();
    expect(data.combined).toBeDefined();

    // Inventory contains inventory-specific metrics
    expect(data.consumableInventory.totalValueAmount).toBe(100);
    expect(data.consumableInventory.totalQuantityUnits).toBe(50);
    expect(data.consumableInventory).not.toHaveProperty('activeAssetCount');

    // Fixed assets contains asset-specific metrics
    expect(data.fixedAssets.totalCarryingValueAmount).toBe(1000);
    expect(data.fixedAssets.activeAssetCount).toBe(1);
    expect(data.fixedAssets).not.toHaveProperty('totalQuantityUnits');
  });

  // 11. Decimal/money correctness
  it('11. performs integer cents arithmetic to avoid floating-point accumulation drift', async () => {
    // 0.10 + 0.20 in JavaScript floating point = 0.30000000000000004
    await inventoryRepo.save(
      createItem({
        sku: 'SKU-FLOAT-1',
        name: 'Item 1',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        qty: 1,
        purchaseCost: 0.1,
      }),
    );
    await assetRepo.save(
      createAsset({
        tag: 'AST-FLOAT-1',
        name: 'Equipment 1',
        category: AssetCategory.OFFICE_FURNITURE,
        purchaseValue: 0.2,
        estimatedValue: 0.2,
        status: AssetStatus.ACTIVE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    // Must be clean 0.3, NOT 0.30000000000000004
    expect(data.combined.totalCombinedValueAmount).toBe(0.3);
  });

  // 12. Repository failures
  it('12. handles repository failures gracefully returning an ApplicationResult failure', async () => {
    inventoryRepo.shouldFail = true;

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toContain('Database connection failure');
  });

  // 13. Relevant domain invariants
  it('13. enforces domain valuation inclusion rules: RETIRED and SOLD assets contribute zero to carrying value', async () => {
    // Retired asset with residual estimated value recorded
    await assetRepo.save(
      createAsset({
        tag: 'AST-RET',
        name: 'Retired Treadmill',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 5000,
        estimatedValue: 1000,
        status: AssetStatus.RETIRED,
      }),
    );
    // Sold asset with residual value
    await assetRepo.save(
      createAsset({
        tag: 'AST-SOLD',
        name: 'Sold Table',
        category: AssetCategory.OFFICE_FURNITURE,
        purchaseValue: 2000,
        estimatedValue: 500,
        status: AssetStatus.SOLD,
      }),
    );
    // Active asset
    await assetRepo.save(
      createAsset({
        tag: 'AST-ACT',
        name: 'Active Bike',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1500,
        estimatedValue: 1200,
        status: AssetStatus.ACTIVE,
      }),
    );

    const query = new GetResourceOverviewQuery({ tenantId: testTenantId });
    const result = await handler.execute(query);

    expect(result.isSuccess).toBe(true);
    const data = result.getValue();

    // Only the ACTIVE asset ($1,200) contributes to carrying value
    // RETIRED and SOLD must NOT be included in carrying value per ADR-0097
    expect(data.fixedAssets.totalCarryingValueAmount).toBe(1200);

    // But they ARE tracked in counts
    expect(data.fixedAssets.activeAssetCount).toBe(1);
    expect(data.fixedAssets.retiredAssetCount).toBe(1);
    expect(data.fixedAssets.totalAssetCount).toBe(3);
  });
});
