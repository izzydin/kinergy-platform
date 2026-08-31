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

import { GetInventoryValuationHandler } from '../handlers/get-inventory-valuation.handler';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { GetFixedAssetValuationSummaryHandler } from '../handlers/get-fixed-asset-valuation-summary.handler';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';
import { GetCombinedResourceValuationHandler } from '../handlers/get-combined-resource-valuation.handler';
import { GetCombinedResourceValuationQuery } from '../queries/get-combined-resource-valuation.query';

class InMemoryInventoryRepository implements InventoryItemRepository {
  public items = new Map<string, InventoryItem>();

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
      all = all.filter((i) => i.status !== 'ARCHIVED');
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
  public store = new Map<string, FixedAsset>();

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

describe('Resource Valuation Operations (Milestone 6.8)', () => {
  let inventoryRepo: InMemoryInventoryRepository;
  let assetRepo: InMemoryFixedAssetRepository;
  let inventoryValuationHandler: GetInventoryValuationHandler;
  let assetValuationHandler: GetFixedAssetValuationSummaryHandler;
  let combinedValuationHandler: GetCombinedResourceValuationHandler;

  const tenantA = 'tenant_val_01';
  const tenantB = 'tenant_val_02';

  beforeEach(() => {
    inventoryRepo = new InMemoryInventoryRepository();
    assetRepo = new InMemoryFixedAssetRepository();
    inventoryValuationHandler = new GetInventoryValuationHandler(inventoryRepo);
    assetValuationHandler = new GetFixedAssetValuationSummaryHandler(assetRepo);
    combinedValuationHandler = new GetCombinedResourceValuationHandler(inventoryRepo, assetRepo);
  });

  const createInventoryItem = (props: {
    sku: string;
    name: string;
    category: InventoryCategory;
    qty: number;
    purchaseCost: number;
    tenantId?: string;
    status?: InventoryItemStatus;
  }): InventoryItem => {
    return InventoryItem.reconstitute({
      id: `item_${props.sku}`,
      tenantId: props.tenantId ?? tenantA,
      sku: props.sku,
      name: props.name,
      category: props.category,
      unit: UnitOfMeasure.UNITS,
      minimumStock: 5,
      quantityOnHand: props.qty,
      purchaseCost: Money.create(props.purchaseCost, 'USD'),
      sellingPrice: Money.create(props.purchaseCost * 1.5, 'USD'),
      status: props.status ?? InventoryItemStatus.ACTIVE,
      version: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
  };

  const createFixedAsset = (props: {
    tag: string;
    name: string;
    category: AssetCategory;
    purchaseValue: number;
    currentValue: number;
    status?: AssetStatus;
    condition?: AssetCondition;
    tenantId?: string;
  }): FixedAsset => {
    return FixedAsset.reconstitute({
      id: AssetId.create(),
      tenantId: props.tenantId ?? tenantA,
      assetTag: props.tag,
      name: props.name,
      category: props.category,
      purchaseDate: new Date('2025-01-01'),
      purchaseValue: Money.create(props.purchaseValue, 'USD'),
      currentEstimatedValue: Money.create(props.currentValue, 'USD'),
      condition: props.condition ?? AssetCondition.EXCELLENT,
      location: AssetLocation.create({ facilityId: 'Building A', roomId: 'Room 101' }),
      status: props.status ?? AssetStatus.ACTIVE,
      version: 1,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    });
  };

  describe('1. Consumable Inventory Valuation (GetInventoryValuationHandler)', () => {
    it('returns $0.00 when inventory catalog is empty', async () => {
      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalValueAmount).toBe(0);
      expect(data.totalDistinctItems).toBe(0);
      expect(data.totalQuantityUnits).toBe(0);
      expect(data.items).toEqual([]);
    });

    it('calculates exact working capital for a single product', async () => {
      const item = createInventoryItem({
        sku: 'SKU-001',
        name: 'Whey Protein',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 15,
        purchaseCost: 20.5,
      });
      await inventoryRepo.save(item);

      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // 15 * 20.50 = 307.50
      expect(data.totalValueAmount).toBe(307.5);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(15);
      expect(data.breakdownByCategory[InventoryCategory.SUPPLEMENTS]?.totalValueAmount).toBe(307.5);
    });

    it('accumulates multiple products across categories without floating point drift', async () => {
      // 3.33 units * $1.99 = $6.63
      const item1 = createInventoryItem({
        sku: 'SKU-001',
        name: 'Energy Gel',
        category: InventoryCategory.HEALTHY_DRINKS,
        qty: 3.33,
        purchaseCost: 1.99,
      });
      // 2.50 units * $10.99 = $27.48
      const item2 = createInventoryItem({
        sku: 'SKU-002',
        name: 'Recovery Powder',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 2.5,
        purchaseCost: 10.99,
      });
      await inventoryRepo.save(item1);
      await inventoryRepo.save(item2);

      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // 6.63 + 27.48 = 34.11
      expect(data.totalValueAmount).toBe(34.11);
      expect(data.totalQuantityUnits).toBe(5.83);
    });

    it('evaluates zero stock items as contributing $0.00', async () => {
      const item = createInventoryItem({
        sku: 'SKU-ZERO',
        name: 'Out of Stock Bar',
        category: InventoryCategory.HEALTHY_MEALS,
        qty: 0,
        purchaseCost: 4.5,
      });
      await inventoryRepo.save(item);

      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalValueAmount).toBe(0);
      expect(data.totalQuantityUnits).toBe(0);
      expect(data.totalDistinctItems).toBe(1);
    });

    it('excludes archived items by default and includes them when requested', async () => {
      const activeItem = createInventoryItem({
        sku: 'SKU-ACTIVE',
        name: 'Active Towel',
        category: InventoryCategory.CLEANING_SUPPLIES,
        qty: 10,
        purchaseCost: 5.0,
      });
      const archivedItem = createInventoryItem({
        sku: 'SKU-ARCHIVED',
        name: 'Archived Shampoo',
        category: InventoryCategory.CLEANING_SUPPLIES,
        qty: 10,
        purchaseCost: 8.0,
        status: InventoryItemStatus.ARCHIVED,
      });
      await inventoryRepo.save(activeItem);
      await inventoryRepo.save(archivedItem);

      // Default query: exclude archived
      const defaultQuery = new GetInventoryValuationQuery({ tenantId: tenantA });
      const defaultResult = await inventoryValuationHandler.execute(defaultQuery);
      expect(defaultResult.getValue().totalValueAmount).toBe(50.0);
      expect(defaultResult.getValue().totalDistinctItems).toBe(1);

      // Explicit query: include archived
      const includeArchivedQuery = new GetInventoryValuationQuery({
        tenantId: tenantA,
        includeArchived: true,
      });
      const includeResult = await inventoryValuationHandler.execute(includeArchivedQuery);
      // 50.00 + 80.00 = 130.00
      expect(includeResult.getValue().totalValueAmount).toBe(130.0);
      expect(includeResult.getValue().totalDistinctItems).toBe(2);
    });

    it('evaluates zero cost items as contributing $0.00 while incrementing item counts', async () => {
      const item = createInventoryItem({
        sku: 'SKU-FREE-SAMPLE',
        name: 'Promotional Protein Sample',
        category: InventoryCategory.SUPPLEMENTS,
        qty: 100,
        purchaseCost: 0.0,
      });
      await inventoryRepo.save(item);

      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // 100 * 0.00 = 0.00
      expect(data.totalValueAmount).toBe(0.0);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(100);
      expect(data.breakdownByCategory[InventoryCategory.SUPPLEMENTS]?.totalValueAmount).toBe(0.0);
    });

    it('evaluates inactive products with stock as contributing to inventory working capital', async () => {
      const inactiveItem = createInventoryItem({
        sku: 'SKU-INACTIVE-STOCK',
        name: 'Seasonal Winter Tea',
        category: InventoryCategory.HEALTHY_DRINKS,
        qty: 20,
        purchaseCost: 3.5,
        status: InventoryItemStatus.INACTIVE,
      });
      await inventoryRepo.save(inactiveItem);

      const query = new GetInventoryValuationQuery({ tenantId: tenantA });
      const result = await inventoryValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Inactive catalog items remain part of active warehouse stock: 20 * $3.50 = $70.00
      expect(data.totalValueAmount).toBe(70.0);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(20);
    });

    it('strictly isolates inventory valuation across tenants', async () => {
      const itemTenantA = createInventoryItem({
        sku: 'SKU-TA',
        name: 'Tenant A Item',
        category: InventoryCategory.RETAIL_PRODUCTS,
        qty: 10,
        purchaseCost: 10.0,
        tenantId: tenantA,
      });
      const itemTenantB = createInventoryItem({
        sku: 'SKU-TB',
        name: 'Tenant B Item',
        category: InventoryCategory.RETAIL_PRODUCTS,
        qty: 20,
        purchaseCost: 10.0,
        tenantId: tenantB,
      });
      await inventoryRepo.save(itemTenantA);
      await inventoryRepo.save(itemTenantB);

      const queryA = new GetInventoryValuationQuery({ tenantId: tenantA });
      const resultA = await inventoryValuationHandler.execute(queryA);
      expect(resultA.getValue().totalValueAmount).toBe(100.0);

      const queryB = new GetInventoryValuationQuery({ tenantId: tenantB });
      const resultB = await inventoryValuationHandler.execute(queryB);
      expect(resultB.getValue().totalValueAmount).toBe(200.0);
    });
  });

  describe('2. Fixed Asset Valuation Summary (GetFixedAssetValuationSummaryHandler)', () => {
    it('returns $0.00 when no assets exist', async () => {
      const query = new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA });
      const result = await assetValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCarryingValueAmount).toBe(0);
      expect(data.totalPurchaseValueAmount).toBe(0);
      expect(data.totalAssetCount).toBe(0);
      expect(data.activeAssetCount).toBe(0);
    });

    it('accurately aggregates active, under-maintenance, and damaged assets', async () => {
      const activeTreadmill = createFixedAsset({
        tag: 'AST-001',
        name: 'Commercial Treadmill',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 5000,
        currentValue: 4200,
        status: AssetStatus.ACTIVE,
      });
      const maintenanceBike = createFixedAsset({
        tag: 'AST-002',
        name: 'Spin Bike',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 2000,
        currentValue: 1600,
        status: AssetStatus.UNDER_MAINTENANCE,
      });
      const damagedRowingMachine = createFixedAsset({
        tag: 'AST-003',
        name: 'Rowing Machine',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1500,
        currentValue: 900,
        status: AssetStatus.DAMAGED,
      });
      await assetRepo.save(activeTreadmill);
      await assetRepo.save(maintenanceBike);
      await assetRepo.save(damagedRowingMachine);

      const query = new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA });
      const result = await assetValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Carrying: 4200 + 1600 + 900 = 6700.00
      expect(data.totalCarryingValueAmount).toBe(6700);
      // Purchase CAPEX: 5000 + 2000 + 1500 = 8500.00
      expect(data.totalPurchaseValueAmount).toBe(8500);
      expect(data.activeAssetCount).toBe(3);
      expect(data.totalAssetCount).toBe(3);
    });

    it('excludes retired and sold assets from active carrying value per policy', async () => {
      const activeAsset = createFixedAsset({
        tag: 'AST-ACTIVE',
        name: 'Active Sauna',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValue: 10000,
        currentValue: 9000,
        status: AssetStatus.ACTIVE,
      });
      const retiredAsset = createFixedAsset({
        tag: 'AST-RETIRED',
        name: 'Retired Steam Room',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValue: 8000,
        currentValue: 1000,
        status: AssetStatus.RETIRED,
      });
      const soldAsset = createFixedAsset({
        tag: 'AST-SOLD',
        name: 'Sold Cryo Chamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValue: 15000,
        currentValue: 5000,
        status: AssetStatus.SOLD,
      });
      await assetRepo.save(activeAsset);
      await assetRepo.save(retiredAsset);
      await assetRepo.save(soldAsset);

      // Default query: exclude decommissioned
      const defaultQuery = new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA });
      const defaultResult = await assetValuationHandler.execute(defaultQuery);
      expect(defaultResult.getValue().totalCarryingValueAmount).toBe(9000);
      expect(defaultResult.getValue().totalAssetCount).toBe(1);

      // Decommissioned included query: retired/sold are loaded for audit, but carrying value is $0.00 for them
      const auditQuery = new GetFixedAssetValuationSummaryQuery({
        tenantId: tenantA,
        includeDecommissioned: true,
      });
      const auditResult = await assetValuationHandler.execute(auditQuery);
      expect(auditResult.getValue().totalCarryingValueAmount).toBe(9000); // Only active contributes to carrying value
      expect(auditResult.getValue().totalPurchaseValueAmount).toBe(33000); // 10000 + 8000 + 15000
      expect(auditResult.getValue().totalAssetCount).toBe(3);
      expect(auditResult.getValue().activeAssetCount).toBe(1);
    });

    it('does not artificially discount carrying value due to qualitative condition ratings', async () => {
      const fairAsset = createFixedAsset({
        tag: 'AST-FAIR',
        name: 'Fair Weight Bench',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 800,
        currentValue: 600,
        condition: AssetCondition.FAIR,
      });
      const needsRepairAsset = createFixedAsset({
        tag: 'AST-REPAIR',
        name: 'Needs Repair Cable Cross',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 3000,
        currentValue: 2200,
        condition: AssetCondition.NEEDS_REPAIR,
      });
      await assetRepo.save(fairAsset);
      await assetRepo.save(needsRepairAsset);

      const query = new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA });
      const result = await assetValuationHandler.execute(query);

      // 600 + 2200 = 2800 (exact carrying values preserved without double condition markdown)
      expect(result.getValue().totalCarryingValueAmount).toBe(2800);
      expect(
        result.getValue().breakdownByCondition[AssetCondition.FAIR]?.totalCarryingValueAmount,
      ).toBe(600);
      expect(
        result.getValue().breakdownByCondition[AssetCondition.NEEDS_REPAIR]
          ?.totalCarryingValueAmount,
      ).toBe(2200);
    });

    it('evaluates fully depreciated zero estimated value assets as contributing $0.00 without error', async () => {
      const zeroValueAsset = createFixedAsset({
        tag: 'AST-ZERO-BOOK',
        name: 'Fully Depreciated Cable Machine',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 4000,
        currentValue: 0.0,
        status: AssetStatus.ACTIVE,
      });
      await assetRepo.save(zeroValueAsset);

      const query = new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA });
      const result = await assetValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCarryingValueAmount).toBe(0.0);
      expect(data.totalPurchaseValueAmount).toBe(4000.0);
      expect(data.totalAssetCount).toBe(1);
      expect(data.activeAssetCount).toBe(1);
    });
  });

  describe('3. Combined Resource Valuation (GetCombinedResourceValuationHandler)', () => {
    it('evaluates combined totals as $0.00 when both repositories are empty', async () => {
      const query = new GetCombinedResourceValuationQuery({ tenantId: tenantA });
      const result = await combinedValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(0);
      expect(data.inventory.totalValueAmount).toBe(0);
      expect(data.inventory.sharePercentage).toBe(0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(0);
      expect(data.fixedAssets.sharePercentage).toBe(0);
    });

    it('correctly calculates portfolio distributions when only inventory exists', async () => {
      const item = createInventoryItem({
        sku: 'SKU-001',
        name: 'Towel Pack',
        category: InventoryCategory.CLEANING_SUPPLIES,
        qty: 50,
        purchaseCost: 10.0,
      });
      await inventoryRepo.save(item);

      const query = new GetCombinedResourceValuationQuery({ tenantId: tenantA });
      const result = await combinedValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(500.0);
      expect(data.inventory.totalValueAmount).toBe(500.0);
      expect(data.inventory.sharePercentage).toBe(100.0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(0);
      expect(data.fixedAssets.sharePercentage).toBe(0);
    });

    it('correctly calculates portfolio distributions when only fixed assets exist', async () => {
      const asset = createFixedAsset({
        tag: 'AST-001',
        name: 'Squat Rack',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 2000,
        currentValue: 1500,
      });
      await assetRepo.save(asset);

      const query = new GetCombinedResourceValuationQuery({ tenantId: tenantA });
      const result = await combinedValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(1500.0);
      expect(data.inventory.totalValueAmount).toBe(0);
      expect(data.inventory.sharePercentage).toBe(0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(1500.0);
      expect(data.fixedAssets.sharePercentage).toBe(100.0);
    });

    it('combines both domains with exact integer-cents addition and accurate share percentages', async () => {
      // Inventory: 100 bottles * $2.50 = $250.00
      const item = createInventoryItem({
        sku: 'SKU-DRINK',
        name: 'Electrolyte Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        qty: 100,
        purchaseCost: 2.5,
      });
      await inventoryRepo.save(item);

      // Fixed Asset: 1 Treadmill at $750.00 carrying value ($1,000 purchase)
      const asset = createFixedAsset({
        tag: 'AST-TM',
        name: 'Treadmill X',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValue: 1000,
        currentValue: 750,
      });
      await assetRepo.save(asset);

      const query = new GetCombinedResourceValuationQuery({ tenantId: tenantA });
      const result = await combinedValuationHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Combined: $250.00 + $750.00 = $1,000.00
      expect(data.totalCombinedValueAmount).toBe(1000.0);
      // CAPEX investment: $250.00 + $1,000.00 = $1,250.00
      expect(data.totalCombinedPurchaseValueAmount).toBe(1250.0);

      // Shares: 250 / 1000 = 25.00%, 750 / 1000 = 75.00%
      expect(data.inventory.sharePercentage).toBe(25.0);
      expect(data.fixedAssets.sharePercentage).toBe(75.0);
    });

    it('guarantees read-only execution without mutating underlying aggregates', async () => {
      const item = createInventoryItem({
        sku: 'SKU-RO',
        name: 'Read Only Item',
        category: InventoryCategory.OFFICE_SUPPLIES,
        qty: 10,
        purchaseCost: 5.0,
      });
      const asset = createFixedAsset({
        tag: 'AST-RO',
        name: 'Read Only Desk',
        category: AssetCategory.OFFICE_FURNITURE,
        purchaseValue: 500,
        currentValue: 400,
      });
      await inventoryRepo.save(item);
      await assetRepo.save(asset);

      const beforeItem = await inventoryRepo.findById(item.id.getValue());
      const beforeAsset = await assetRepo.findById(asset.id);

      const query = new GetCombinedResourceValuationQuery({ tenantId: tenantA });
      await combinedValuationHandler.execute(query);

      const afterItem = await inventoryRepo.findById(item.id.getValue());
      const afterAsset = await assetRepo.findById(asset.id);

      expect(afterItem?.version).toBe(beforeItem?.version);
      expect(afterItem?.quantityOnHand.value).toBe(beforeItem?.quantityOnHand.value);
      expect(afterAsset?.version).toBe(beforeAsset?.version);
      expect(afterAsset?.currentEstimatedValue.amount).toBe(
        beforeAsset?.currentEstimatedValue.amount,
      );
    });

    it('regression: strictly preserves mathematical invariant Combined = Inventory + FixedAssets with complex decimals and mixed lifecycle states', async () => {
      // 3 Inventory items
      await inventoryRepo.save(
        createInventoryItem({
          sku: 'SKU-C1',
          name: 'Item 1',
          category: InventoryCategory.SUPPLEMENTS,
          qty: 12.34,
          purchaseCost: 7.89, // 12.34 * 7.89 = 97.3626 -> 97.36
        }),
      );
      await inventoryRepo.save(
        createInventoryItem({
          sku: 'SKU-C2',
          name: 'Item 2',
          category: InventoryCategory.HEALTHY_DRINKS,
          qty: 5.67,
          purchaseCost: 4.12, // 5.67 * 4.12 = 23.3604 -> 23.36
        }),
      );
      await inventoryRepo.save(
        createInventoryItem({
          sku: 'SKU-C3',
          name: 'Archived Zero Stock',
          category: InventoryCategory.OFFICE_SUPPLIES,
          qty: 0,
          purchaseCost: 15.0,
          status: InventoryItemStatus.ARCHIVED,
        }),
      );

      // 4 Fixed Assets (Active, Maintenance, Damaged, and Sold)
      await assetRepo.save(
        createFixedAsset({
          tag: 'AST-C1',
          name: 'Active Bike',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 1200.5,
          currentValue: 950.25,
          status: AssetStatus.ACTIVE,
        }),
      );
      await assetRepo.save(
        createFixedAsset({
          tag: 'AST-C2',
          name: 'Maint Reformer',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseValue: 3500.0,
          currentValue: 2800.5,
          status: AssetStatus.UNDER_MAINTENANCE,
        }),
      );
      await assetRepo.save(
        createFixedAsset({
          tag: 'AST-C3',
          name: 'Damaged Mat',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 200.0,
          currentValue: 50.75,
          status: AssetStatus.DAMAGED,
        }),
      );
      await assetRepo.save(
        createFixedAsset({
          tag: 'AST-C4-SOLD',
          name: 'Sold Old Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 5000.0,
          currentValue: 1200.0, // Must NOT leak into carrying value
          status: AssetStatus.SOLD,
        }),
      );

      const invRes = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: tenantA }),
      );
      const assetRes = await assetValuationHandler.execute(
        new GetFixedAssetValuationSummaryQuery({ tenantId: tenantA }),
      );
      const combinedRes = await combinedValuationHandler.execute(
        new GetCombinedResourceValuationQuery({ tenantId: tenantA }),
      );

      const invValue = invRes.getValue().totalValueAmount; // 97.36 + 23.36 = 120.72
      const assetValue = assetRes.getValue().totalCarryingValueAmount; // 950.25 + 2800.50 + 50.75 = 3801.50
      const combinedValue = combinedRes.getValue().totalCombinedValueAmount;

      expect(invValue).toBe(120.72);
      expect(assetValue).toBe(3801.5);
      // Mathematical Invariant Assertion:
      expect(combinedValue).toBe(Math.round((invValue + assetValue) * 100) / 100);
      expect(combinedValue).toBe(3922.22);
      expect(combinedRes.getValue().fixedAssets.activeAssetCount).toBe(3);
    });
  });
});
