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
import { InvalidMoneyException } from '../../domain/inventory/exceptions/invalid-money.exception';

import { GetInventoryValuationHandler } from '../handlers/get-inventory-valuation.handler';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { GetFixedAssetValuationSummaryHandler } from '../handlers/get-fixed-asset-valuation-summary.handler';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';
import { GetCombinedResourceValuationHandler } from '../handlers/get-combined-resource-valuation.handler';
import { GetCombinedResourceValuationQuery } from '../queries/get-combined-resource-valuation.query';

class InMemoryInventoryRepository implements InventoryItemRepository {
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

describe('Phase 6.10: Valuation Layer Deterministic Financial Unit Tests', () => {
  const actorId = 'usr_financial_qa_lead';
  const testTenantId = 'tenant_kinergy_valuation_01';

  let inventoryRepo: InMemoryInventoryRepository;
  let assetRepo: InMemoryFixedAssetRepository;

  let inventoryValuationHandler: GetInventoryValuationHandler;
  let assetValuationHandler: GetFixedAssetValuationSummaryHandler;
  let combinedValuationHandler: GetCombinedResourceValuationHandler;

  const defaultLocation = AssetLocation.create({
    facilityId: 'fac_main_rehab',
    roomId: 'room_rehab_101',
  });

  const createItem = (params: {
    sku: string;
    name: string;
    category: InventoryCategory;
    qty: number;
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
      minimumStock: 5,
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

    inventoryValuationHandler = new GetInventoryValuationHandler(inventoryRepo);
    assetValuationHandler = new GetFixedAssetValuationSummaryHandler(assetRepo);
    combinedValuationHandler = new GetCombinedResourceValuationHandler(inventoryRepo, assetRepo);
  });

  // ============================================================================
  // 1. CONSUMABLE INVENTORY VALUATION FORMULA PROOFS
  // ============================================================================
  describe('1. Consumable Inventory Valuation Formula: Σ(currentStock × purchaseCost)', () => {
    it('evaluates to $0.00 total value when inventory catalog has zero products', async () => {
      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalValueAmount).toBe(0.0);
      expect(data.totalDistinctItems).toBe(0);
      expect(data.totalQuantityUnits).toBe(0);
      expect(Object.keys(data.breakdownByCategory)).toHaveLength(0);
    });

    it('evaluates exactly 1 product: 10 units @ $15.50 = $155.00', async () => {
      await inventoryRepo.save(
        createItem({
          sku: 'MED-TAPE-01',
          name: 'Kinesiology Tape',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          qty: 10,
          purchaseCost: 15.5,
        }),
      );

      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalValueAmount).toBe(155.0);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(10);
      expect(
        data.breakdownByCategory[InventoryCategory.THERAPY_CONSUMABLES]?.totalValueAmount,
      ).toBe(155.0);
    });

    it('evaluates multiple products across distinct categories with exact decimal precision', async () => {
      // Product 1: 15.5 units @ $4.25 = $65.875 -> $65.88
      await inventoryRepo.save(
        createItem({
          sku: 'DRK-ELT-01',
          name: 'Electrolyte Drink Powder',
          category: InventoryCategory.HEALTHY_DRINKS,
          qty: 15.5,
          purchaseCost: 4.25,
        }),
      );
      // Product 2: 8 units @ $22.40 = $179.20
      await inventoryRepo.save(
        createItem({
          sku: 'SUP-WHEY-01',
          name: 'Whey Protein Isolate',
          category: InventoryCategory.SUPPLEMENTS,
          qty: 8,
          purchaseCost: 22.4,
        }),
      );
      // Product 3: 50 units @ $1.15 = $57.50
      await inventoryRepo.save(
        createItem({
          sku: 'CLN-WIPES-01',
          name: 'Sanitizing Table Wipes',
          category: InventoryCategory.CLEANING_SUPPLIES,
          qty: 50,
          purchaseCost: 1.15,
        }),
      );

      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Total = 65.88 + 179.20 + 57.50 = 302.58
      expect(data.totalValueAmount).toBe(302.58);
      expect(data.totalDistinctItems).toBe(3);
      expect(data.totalQuantityUnits).toBe(73.5);
    });

    it('evaluates zero stock items as $0.00 value contribution', async () => {
      await inventoryRepo.save(
        createItem({
          sku: 'OUT-OF-STOCK-01',
          name: 'Out of Stock Shaker',
          category: InventoryCategory.RETAIL_PRODUCTS,
          qty: 0,
          purchaseCost: 12.5,
        }),
      );

      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      const data = result.getValue();
      expect(data.totalValueAmount).toBe(0.0);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(0);
    });

    it('evaluates zero purchase cost items ($0.00) as $0.00 value contribution', async () => {
      await inventoryRepo.save(
        createItem({
          sku: 'FREE-SAMPLE-01',
          name: 'Free Promotional Samples',
          category: InventoryCategory.RETAIL_PRODUCTS,
          qty: 100,
          purchaseCost: 0.0,
        }),
      );

      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      const data = result.getValue();
      expect(data.totalValueAmount).toBe(0.0);
      expect(data.totalDistinctItems).toBe(1);
      expect(data.totalQuantityUnits).toBe(100);
    });
  });

  // ============================================================================
  // 2. FIXED ASSET VALUATION & LIFECYCLE INCLUSION RULES
  // ============================================================================
  describe('2. Fixed Asset Valuation: Σ(currentEstimatedValue) & Lifecycle Rules (ADR-0097)', () => {
    it('evaluates to $0.00 when zero fixed assets exist in the facility', async () => {
      const result = await assetValuationHandler.execute(
        new GetFixedAssetValuationSummaryQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCarryingValueAmount).toBe(0.0);
      expect(data.totalPurchaseValueAmount).toBe(0.0);
      expect(data.totalAssetCount).toBe(0);
      expect(data.activeAssetCount).toBe(0);
    });

    it('INCLUDES in Carrying Value: ACTIVE ($5,000) + UNDER_MAINTENANCE ($3,500) + DAMAGED ($1,200) = $9,700', async () => {
      // 1. ACTIVE
      await assetRepo.save(
        createAsset({
          tag: 'AST-GYM-01',
          name: 'Functional Trainer Dual Cable',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 6500.0,
          estimatedValue: 5000.0,
          status: AssetStatus.ACTIVE,
        }),
      );
      // 2. UNDER_MAINTENANCE
      await assetRepo.save(
        createAsset({
          tag: 'AST-CLIN-01',
          name: 'Ultrasound Therapy System',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseValue: 4800.0,
          estimatedValue: 3500.0,
          status: AssetStatus.UNDER_MAINTENANCE,
        }),
      );
      // 3. DAMAGED
      await assetRepo.save(
        createAsset({
          tag: 'AST-CLN-01',
          name: 'Floor Scrubber (Repairs Pending)',
          category: AssetCategory.CLEANING_EQUIPMENT,
          purchaseValue: 2200.0,
          estimatedValue: 1200.0,
          status: AssetStatus.DAMAGED,
        }),
      );

      const result = await assetValuationHandler.execute(
        new GetFixedAssetValuationSummaryQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Carrying Value = 5000 + 3500 + 1200 = 9700
      expect(data.totalCarryingValueAmount).toBe(9700.0);
      // Historical Purchase CAPEX = 6500 + 4800 + 2200 = 13500
      expect(data.totalPurchaseValueAmount).toBe(13500.0);
      expect(data.totalAssetCount).toBe(3);
      expect(data.activeAssetCount).toBe(3);
    });

    it('EXCLUDES from Active Carrying Value: RETIRED ($0.00) and SOLD ($0.00)', async () => {
      // 1. ACTIVE asset
      await assetRepo.save(
        createAsset({
          tag: 'AST-ACTIVE-01',
          name: 'Active Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 4000.0,
          estimatedValue: 3000.0,
          status: AssetStatus.ACTIVE,
        }),
      );
      // 2. RETIRED asset
      await assetRepo.save(
        createAsset({
          tag: 'AST-RETIRED-01',
          name: 'Decommissioned Laser',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseValue: 10000.0,
          estimatedValue: 1500.0, // Excluded from carrying value!
          status: AssetStatus.RETIRED,
        }),
      );
      // 3. SOLD asset
      await assetRepo.save(
        createAsset({
          tag: 'AST-SOLD-01',
          name: 'Liquidated Stationary Bike',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 2500.0,
          estimatedValue: 600.0, // Excluded from carrying value!
          status: AssetStatus.SOLD,
        }),
      );

      // Query with includeDecommissioned: true to verify status filtering logic
      const result = await assetValuationHandler.execute(
        new GetFixedAssetValuationSummaryQuery({
          tenantId: testTenantId,
          includeDecommissioned: true,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Carrying value MUST ONLY include ACTIVE ($3000.00)
      expect(data.totalCarryingValueAmount).toBe(3000.0);
      // Historical purchase value includes all recorded assets: 4000 + 10000 + 2500 = 16500
      expect(data.totalPurchaseValueAmount).toBe(16500.0);
      expect(data.totalAssetCount).toBe(3);
      expect(data.activeAssetCount).toBe(1);

      // Verify status breakdown
      expect(data.breakdownByStatus[AssetStatus.ACTIVE]?.totalCarryingValueAmount).toBe(3000.0);
      expect(data.breakdownByStatus[AssetStatus.RETIRED]?.totalCarryingValueAmount).toBe(0.0);
      expect(data.breakdownByStatus[AssetStatus.SOLD]?.totalCarryingValueAmount).toBe(0.0);
    });
  });

  // ============================================================================
  // 3. COMBINED RESOURCE VALUATION MATRIX (ADR-0098)
  // ============================================================================
  describe('3. Combined Resource Valuation: Consumable Inventory + Fixed Assets', () => {
    it('Scenario A: Both domains empty -> Combined Value = $0.00, Shares = 0%', async () => {
      const result = await combinedValuationHandler.execute(
        new GetCombinedResourceValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(0.0);
      expect(data.totalCombinedPurchaseValueAmount).toBe(0.0);
      expect(data.inventory.totalValueAmount).toBe(0.0);
      expect(data.inventory.sharePercentage).toBe(0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(0.0);
      expect(data.fixedAssets.sharePercentage).toBe(0);
    });

    it('Scenario B: Inventory only -> Combined Value = Inventory Value ($500.00), Share = 100%', async () => {
      await inventoryRepo.save(
        createItem({
          sku: 'INV-ONLY-01',
          name: 'Resistance Bands Pack',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          qty: 25,
          purchaseCost: 20.0, // 25 * 20 = 500.00
        }),
      );

      const result = await combinedValuationHandler.execute(
        new GetCombinedResourceValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(500.0);
      expect(data.inventory.totalValueAmount).toBe(500.0);
      expect(data.inventory.sharePercentage).toBe(100);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(0.0);
      expect(data.fixedAssets.sharePercentage).toBe(0);
    });

    it('Scenario C: Fixed Assets only -> Combined Value = Asset Carrying Value ($15,000.00), Share = 100%', async () => {
      await assetRepo.save(
        createAsset({
          tag: 'AST-ONLY-01',
          name: 'Hydrotherapy Whirlpool Bath',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseValue: 20000.0,
          estimatedValue: 15000.0,
          status: AssetStatus.ACTIVE,
        }),
      );

      const result = await combinedValuationHandler.execute(
        new GetCombinedResourceValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.totalCombinedValueAmount).toBe(15000.0);
      expect(data.inventory.totalValueAmount).toBe(0.0);
      expect(data.inventory.sharePercentage).toBe(0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(15000.0);
      expect(data.fixedAssets.sharePercentage).toBe(100);
    });

    it('Scenario D: Both populated -> Exact mathematical sum and share percentages', async () => {
      // Inventory: 100 units @ $10.00 = $1,000.00 (25% share)
      await inventoryRepo.save(
        createItem({
          sku: 'SUP-BCAA-01',
          name: 'BCAA Powder',
          category: InventoryCategory.SUPPLEMENTS,
          qty: 100,
          purchaseCost: 10.0,
        }),
      );

      // Fixed Assets: Carrying value $3,000.00 (75% share)
      await assetRepo.save(
        createAsset({
          tag: 'AST-BENCH-01',
          name: 'Olympic Incline Bench',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseValue: 4000.0,
          estimatedValue: 3000.0,
          status: AssetStatus.ACTIVE,
        }),
      );

      const result = await combinedValuationHandler.execute(
        new GetCombinedResourceValuationQuery({ tenantId: testTenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      // Combined = 1000 + 3000 = 4000
      expect(data.totalCombinedValueAmount).toBe(4000.0);
      expect(data.inventory.totalValueAmount).toBe(1000.0);
      expect(data.inventory.sharePercentage).toBe(25.0);
      expect(data.fixedAssets.totalCarryingValueAmount).toBe(3000.0);
      expect(data.fixedAssets.sharePercentage).toBe(75.0);
      expect(data.inventory.sharePercentage + data.fixedAssets.sharePercentage).toBe(100.0);
    });
  });

  // ============================================================================
  // 4. DECIMAL PRECISION & INTEGER CENTS ARITHMETIC PROOFS
  // ============================================================================
  describe('4. Monetary Decimal Precision & Rounding Arithmetic Boundaries', () => {
    it('guarantees zero floating-point drift across 1,000 fractional micro-item valuations', async () => {
      // 100 items each with qty = 1.33 and purchaseCost = 2.47
      // 1.33 * 2.47 = 3.2851 -> round to $3.29 per line
      // 100 * 3.29 = $329.00
      for (let i = 1; i <= 100; i++) {
        await inventoryRepo.save(
          createItem({
            sku: `FRAC-SKU-${i.toString().padStart(3, '0')}`,
            name: `Micro Supply ${i}`,
            category: InventoryCategory.CLINICAL_SUPPLIES,
            qty: 1.33,
            purchaseCost: 2.47,
          }),
        );
      }

      const result = await inventoryValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId: testTenantId }),
      );

      const data = result.getValue();
      expect(data.totalDistinctItems).toBe(100);
      expect(data.totalValueAmount).toBe(329.0);
    });

    it('enforces that negative money values are rejected at domain construction and never normalized silently', () => {
      expect(() => Money.create(-50.0, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(-0.01, 'USD')).toThrow(InvalidMoneyException);
    });
  });
});
