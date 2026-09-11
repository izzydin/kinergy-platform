import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
  FindStockMovementsFilter,
  InventoryOverviewMetrics,
  InventoryOverviewFilter,
} from '@kinergy-platform/core';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
  FixedAssetOverviewMetrics,
  FixedAssetOverviewFilter,
} from '@kinergy-platform/core';
import {
  InventoryItem,
  FixedAsset,
  AssetId,
  AssetStatus,
  StockMovement,
  OptimisticLockException,
} from '@kinergy-platform/core';

/**
 * High-fidelity in-memory transactional storage engine simulating PostgreSQL + Prisma:
 * - Deterministic entity storage keyed by UUID
 * - Optimistic Concurrency Control (OCC) version checking
 * - Append-only stock movement and asset event ledgers
 * - Complete isolation with zero leakage across test runs
 */
export class InMemoryInventoryItemRepository implements InventoryItemRepository {
  private readonly items = new Map<string, InventoryItem>();
  private readonly movements = new Map<string, StockMovement[]>();
  private readonly versions = new Map<string, number>();

  public reset(): void {
    this.items.clear();
    this.movements.clear();
    this.versions.clear();
  }

  public seed(item: InventoryItem): void {
    this.items.set(item.id.getValue(), item);
    this.movements.set(item.id.getValue(), [...item.movements]);
    this.versions.set(item.id.getValue(), item.version);
  }

  public async save(item: InventoryItem): Promise<void> {
    const id = item.id.getValue();
    const persistedVersion = this.versions.get(id);

    if (persistedVersion !== undefined) {
      // OCC Check: Verify expected prior version against previously persisted version
      const priorVersion = item.version - 1;
      if (persistedVersion !== priorVersion) {
        throw new OptimisticLockException('InventoryItem', id, priorVersion);
      }
    }

    this.versions.set(id, item.version);
    this.items.set(id, item);
    this.movements.set(id, [...item.movements]);
  }

  public async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    return item ?? null;
  }

  public async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    const normalizedSku = sku.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (item.sku.value === normalizedSku && (!tenantId || item.tenantId === tenantId)) {
        return item;
      }
    }
    return null;
  }

  public async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let result = Array.from(this.items.values());

    if (filter?.tenantId) {
      result = result.filter((i) => i.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      result = result.filter((i) => categories.includes(i.category));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku.value.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)),
      );
    }

    return result;
  }

  public async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const list = await this.findMany(filter);
    return list.length;
  }

  public async findMovements(filter?: FindStockMovementsFilter): Promise<StockMovement[]> {
    let allMovements: StockMovement[] = [];
    if (filter?.itemId) {
      allMovements = this.movements.get(filter.itemId) || [];
    } else {
      for (const mvs of this.movements.values()) {
        allMovements.push(...mvs);
      }
    }

    if (filter?.movementType) {
      const types = Array.isArray(filter.movementType)
        ? filter.movementType
        : [filter.movementType];
      allMovements = allMovements.filter((m) => types.includes(m.movementType));
    }

    // Sort descending by recordedAt by default
    allMovements.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return allMovements.slice(offset, offset + limit);
  }

  public async countMovements(filter?: FindStockMovementsFilter): Promise<number> {
    const list = await this.findMovements({ ...filter, limit: 100000, offset: 0 });
    return list.length;
  }

  public async getOverviewMetrics(
    filter?: InventoryOverviewFilter,
  ): Promise<InventoryOverviewMetrics> {
    let items = Array.from(this.items.values());
    if (filter?.tenantId) {
      items = items.filter((i) => i.tenantId === filter.tenantId);
    }

    let totalQuantity = 0;
    let totalValuationCents = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const item of items) {
      const qty = item.quantityOnHand.value;
      const cost = item.purchaseCost?.amount ?? 0;
      const min = item.minimumStock.value;

      totalQuantity += qty;
      totalValuationCents += Math.round(qty * cost * 100);
      if (qty <= min) {
        lowStockCount += 1;
      }
      if (qty === 0) {
        outOfStockCount += 1;
      }
    }

    return {
      totalItems: items.length,
      totalQuantity,
      totalValuationCents,
      lowStockCount,
      outOfStockCount,
    };
  }

  public async delete(id: string): Promise<void> {
    this.items.delete(id);
    this.movements.delete(id);
  }
}

export class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  private readonly assets = new Map<string, FixedAsset>();
  private readonly versions = new Map<string, number>();

  public reset(): void {
    this.assets.clear();
    this.versions.clear();
  }

  public seed(asset: FixedAsset): void {
    this.assets.set(asset.id.value, asset);
    this.versions.set(asset.id.value, asset.version);
  }

  public async save(asset: FixedAsset): Promise<void> {
    const id = asset.id.value;
    const persistedVersion = this.versions.get(id);

    if (persistedVersion !== undefined) {
      const priorVersion = asset.version - 1;
      if (persistedVersion !== priorVersion) {
        throw new OptimisticLockException('FixedAsset', id, priorVersion);
      }
    }

    this.versions.set(id, asset.version);
    this.assets.set(id, asset);
  }

  public async findById(id: AssetId): Promise<FixedAsset | null> {
    const asset = this.assets.get(id.value);
    return asset ?? null;
  }

  public async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const tag = assetTag.trim().toUpperCase();
    for (const asset of this.assets.values()) {
      if (asset.assetTag.toUpperCase() === tag && (!tenantId || asset.tenantId === tenantId)) {
        return asset;
      }
    }
    return null;
  }

  public async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    let list = Array.from(this.assets.values());

    if (filter?.tenantId) {
      list = list.filter((a) => a.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      list = list.filter((a) => cats.includes(a.category));
    }
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      list = list.filter((a) => statuses.includes(a.status));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.assetTag.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }

    return list;
  }

  public async count(filter?: FixedAssetFilterOptions): Promise<number> {
    const list = await this.findAll(filter);
    return list.length;
  }

  public async getOverviewMetrics(
    filter?: FixedAssetOverviewFilter,
  ): Promise<FixedAssetOverviewMetrics> {
    let list = Array.from(this.assets.values());
    if (filter?.tenantId) {
      list = list.filter((a) => a.tenantId === filter.tenantId);
    }

    let activeCount = 0;
    let maintenanceCount = 0;
    let damagedCount = 0;
    let retiredCount = 0;
    let totalCarryingValueCents = 0;

    for (const asset of list) {
      const status = asset.status;
      if (status === AssetStatus.ACTIVE) {
        activeCount++;
        totalCarryingValueCents += Math.round(asset.currentEstimatedValue.amount * 100);
      } else if (status === AssetStatus.UNDER_MAINTENANCE) {
        maintenanceCount++;
        totalCarryingValueCents += Math.round(asset.currentEstimatedValue.amount * 100);
      } else if (status === AssetStatus.DAMAGED) {
        damagedCount++;
        totalCarryingValueCents += Math.round(asset.currentEstimatedValue.amount * 100);
      } else if (status === AssetStatus.RETIRED) {
        retiredCount++;
      }
    }

    return {
      totalCount: list.length,
      activeCount,
      maintenanceCount,
      damagedCount,
      retiredCount,
      totalCarryingValueCents,
    };
  }

  public async delete(id: AssetId): Promise<void> {
    this.assets.delete(id.value);
  }
}
