import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import { StockMovement } from '../../domain/inventory/entities/stock-movement.entity';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
  FindStockMovementsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { GetStockLevelHandler } from '../handlers/get-stock-level.handler';
import { ListStockMovementsHandler } from '../handlers/list-stock-movements.handler';
import { GetLowStockItemsHandler } from '../handlers/get-low-stock-items.handler';
import { GetInventoryValuationHandler } from '../handlers/get-inventory-valuation.handler';
import { GetStockLevelQuery } from '../queries/get-stock-level.query';
import { ListStockMovementsQuery } from '../queries/list-stock-movements.query';
import { GetLowStockItemsQuery } from '../queries/get-low-stock-items.query';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';

// In-Memory Test Repository Supporting Items & Movements Queries
class InMemoryInventoryItemRepository implements InventoryItemRepository {
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
    if (filter?.lowStockOnly) {
      all = all.filter((i) => i.isLowStock());
    }

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const items = await this.findMany({ ...filter, limit: undefined, offset: undefined });
    return items.length;
  }

  async findMovements(filter?: FindStockMovementsFilter): Promise<StockMovement[]> {
    let allMovements: StockMovement[] = [];
    for (const item of this.items.values()) {
      if (filter?.tenantId && item.tenantId !== filter.tenantId) {
        continue;
      }
      if (filter?.itemId && item.id.getValue() !== filter.itemId) {
        continue;
      }
      allMovements.push(...item.movements);
    }

    if (filter?.movementType) {
      const types = Array.isArray(filter.movementType)
        ? filter.movementType
        : [filter.movementType];
      allMovements = allMovements.filter((m) => types.includes(m.movementType));
    }
    if (filter?.recordedByUserId) {
      allMovements = allMovements.filter((m) => m.recordedByUserId === filter.recordedByUserId);
    }
    if (filter?.referenceId) {
      allMovements = allMovements.filter((m) => m.referenceId === filter.referenceId);
    }
    if (filter?.fromDate) {
      allMovements = allMovements.filter((m) => m.recordedAt >= filter.fromDate!);
    }
    if (filter?.toDate) {
      allMovements = allMovements.filter((m) => m.recordedAt <= filter.toDate!);
    }

    // Sort
    const sortOrder = filter?.sortOrder === 'asc' ? 1 : -1;
    allMovements.sort((a, b) => {
      const tDiff = (a.recordedAt.getTime() - b.recordedAt.getTime()) * sortOrder;
      if (tDiff !== 0) return tDiff;
      return a.id.getValue().localeCompare(b.id.getValue()) * sortOrder;
    });

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? allMovements.length;
    return allMovements.slice(offset, offset + limit);
  }

  async countMovements(filter?: FindStockMovementsFilter): Promise<number> {
    const list = await this.findMovements({ ...filter, limit: undefined, offset: undefined });
    return list.length;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  private clone(item: InventoryItem): InventoryItem {
    return InventoryItem.reconstitute({
      id: item.id.getValue(),
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
      movements: [...item.movements],
    });
  }
}

describe('Consumable Inventory Deterministic Queries (Phase 6.5)', () => {
  let repository: InMemoryInventoryItemRepository;
  const actorId = 'usr_query_auditor_01';
  const tenantId = 'tenant_kinergy_alpha';

  function createProduct(params: {
    sku: string;
    name: string;
    stock: number;
    minStock: number;
    purchaseCost: number;
    category?: InventoryCategory;
  }): InventoryItem {
    return InventoryItem.create({
      tenantId,
      sku: params.sku,
      name: params.name,
      category: params.category ?? InventoryCategory.CLINICAL_SUPPLIES,
      unit: UnitOfMeasure.UNITS,
      minimumStock: params.minStock,
      initialStock: params.stock,
      purchaseCost: { amount: params.purchaseCost, currency: 'USD' },
      sellingPrice: { amount: params.purchaseCost * 2, currency: 'USD' },
      recordedByUserId: actorId,
    });
  }

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
  });

  describe('1. GET STOCK LEVEL (GetStockLevelHandler)', () => {
    it('returns maintained stock level with accurate low-stock and out-of-stock flags', async () => {
      const product = createProduct({
        sku: 'NEEDLE-ACU-01',
        name: 'Acupuncture Needles Box 100',
        stock: 3,
        minStock: 5,
        purchaseCost: 12.0,
      });
      await repository.save(product);

      const handler = new GetStockLevelHandler(repository);
      const result = await handler.execute(
        new GetStockLevelQuery({
          itemId: product.id.getValue(),
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.itemId).toBe(product.id.getValue());
      expect(result.value.sku).toBe('NEEDLE-ACU-01');
      expect(result.value.quantityOnHand).toBe(3);
      expect(result.value.minimumStock).toBe(5);
      expect(result.value.isLowStock).toBe(true);
      expect(result.value.isOutOfStock).toBe(false);
      expect(result.value.status).toBe('ACTIVE');
    });

    it('returns not found error for non-existent product ID', async () => {
      const handler = new GetStockLevelHandler(repository);
      const result = await handler.execute(
        new GetStockLevelQuery({
          itemId: 'non_existent_uuid',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('not found');
    });

    it('returns stock level for archived products with 0 stock', async () => {
      const product = createProduct({
        sku: 'DISCONTINUED-01',
        name: 'Discontinued Band',
        stock: 0,
        minStock: 0,
        purchaseCost: 5.0,
      });
      product.archive(actorId, 'Permanently discontinued');
      await repository.save(product);

      const handler = new GetStockLevelHandler(repository);
      const result = await handler.execute(
        new GetStockLevelQuery({
          itemId: product.id.getValue(),
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('ARCHIVED');
      expect(result.value.quantityOnHand).toBe(0);
      expect(result.value.isOutOfStock).toBe(true);
    });
  });

  describe('2. GET INVENTORY MOVEMENTS (ListStockMovementsHandler)', () => {
    it('filters movements by product ID, movement type, actor, and date range', async () => {
      const p1 = createProduct({
        sku: 'GEL-ULTRA-01',
        name: 'Ultrasound Gel 5L',
        stock: 10,
        minStock: 2,
        purchaseCost: 25.0,
      });
      p1.receiveStock({
        quantity: 5,
        reason: 'Restock batch A',
        referenceId: 'PO-101',
        actorId: 'usr_buyer_1',
      });
      p1.sellStock({
        quantity: 2,
        reason: 'Client retail purchase',
        referenceId: 'INV-201',
        actorId: 'usr_cashier_2',
      });
      await repository.save(p1);

      const handler = new ListStockMovementsHandler(repository);

      // Query movements for p1 of type SALE
      const saleMovements = await handler.execute(
        new ListStockMovementsQuery({
          itemId: p1.id.getValue(),
          movementType: StockMovementType.SALE,
        }),
      );

      expect(saleMovements.isSuccess).toBe(true);
      expect(saleMovements.value.total).toBe(1);
      expect(saleMovements.value.items[0]?.movementType).toBe(StockMovementType.SALE);
      expect(saleMovements.value.items[0]?.referenceId).toBe('INV-201');

      // Query movements by actor
      const buyerMovements = await handler.execute(
        new ListStockMovementsQuery({
          recordedByUserId: 'usr_buyer_1',
        }),
      );
      expect(buyerMovements.isSuccess).toBe(true);
      expect(buyerMovements.value.total).toBe(1);
      expect(buyerMovements.value.items[0]?.reason).toContain('Restock batch A');
    });

    it('rejects invalid date range where fromDate is after toDate', async () => {
      const handler = new ListStockMovementsHandler(repository);
      const result = await handler.execute(
        new ListStockMovementsQuery({
          fromDate: '2026-08-30',
          toDate: '2026-08-01',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('fromDate cannot be after toDate');
    });
  });

  describe('3. GET LOW STOCK PRODUCTS (GetLowStockItemsHandler)', () => {
    it('accurately identifies low stock (<= minStock) and zero stock items, excluding surplus', async () => {
      const surplusItem = createProduct({
        sku: 'SURPLUS-01',
        name: 'Surplus Foam Rollers',
        stock: 20, // 20 > 5
        minStock: 5,
        purchaseCost: 15.0,
      });

      const exactThresholdItem = createProduct({
        sku: 'EXACT-MIN-01',
        name: 'Massage Balm',
        stock: 4, // 4 == 4
        minStock: 4,
        purchaseCost: 8.0,
      });

      const belowThresholdItem = createProduct({
        sku: 'BELOW-MIN-01',
        name: 'Alcohol Wipes',
        stock: 2, // 2 < 10
        minStock: 10,
        purchaseCost: 4.5,
      });

      const zeroStockItem = createProduct({
        sku: 'ZERO-STOCK-01',
        name: 'Disposable Gloves L',
        stock: 0, // 0 <= 5
        minStock: 5,
        purchaseCost: 6.0,
      });

      await repository.save(surplusItem);
      await repository.save(exactThresholdItem);
      await repository.save(belowThresholdItem);
      await repository.save(zeroStockItem);

      const handler = new GetLowStockItemsHandler(repository);
      const result = await handler.execute(new GetLowStockItemsQuery({ tenantId }));

      expect(result.isSuccess).toBe(true);
      expect(result.value.total).toBe(3); // exact (4), below (2), zero (0); excludes surplus (20)

      const returnedSkus = result.value.items.map((i) => i.sku);
      expect(returnedSkus).toContain('EXACT-MIN-01');
      expect(returnedSkus).toContain('BELOW-MIN-01');
      expect(returnedSkus).toContain('ZERO-STOCK-01');
      expect(returnedSkus).not.toContain('SURPLUS-01');
    });

    it('excludes archived low-stock items by default unless includeArchived is true', async () => {
      const activeLow = createProduct({
        sku: 'ACTIVE-LOW-01',
        name: 'Active Low Item',
        stock: 1,
        minStock: 5,
        purchaseCost: 10.0,
      });

      const archivedLow = createProduct({
        sku: 'ARCHIVED-LOW-01',
        name: 'Archived Low Item',
        stock: 0,
        minStock: 5,
        purchaseCost: 10.0,
      });
      archivedLow.archive(actorId, 'Discontinued');

      await repository.save(activeLow);
      await repository.save(archivedLow);

      const handler = new GetLowStockItemsHandler(repository);

      // Default (without archived)
      const resDefault = await handler.execute(new GetLowStockItemsQuery());
      expect(resDefault.value.total).toBe(1);
      expect(resDefault.value.items[0]?.sku).toBe('ACTIVE-LOW-01');

      // With includeArchived: true
      const resWithArchived = await handler.execute(
        new GetLowStockItemsQuery({ includeArchived: true }),
      );
      expect(resWithArchived.value.total).toBe(2);
    });
  });

  describe('4. GET INVENTORY VALUE (GetInventoryValuationHandler)', () => {
    it('calculates exact inventory asset valuation using purchase cost with Scale 2 decimal precision', async () => {
      const p1 = createProduct({
        sku: 'VAL-TAPE-01',
        name: 'Kinesio Tape Blue',
        stock: 12.5, // 12.5 * 6.50 = 81.25
        minStock: 2,
        purchaseCost: 6.5,
        category: InventoryCategory.CLINICAL_SUPPLIES,
      });

      const p2 = createProduct({
        sku: 'VAL-PROTEIN-01',
        name: 'Whey Protein Isolate 1kg',
        stock: 8, // 8 * 24.99 = 199.92
        minStock: 2,
        purchaseCost: 24.99,
        category: InventoryCategory.SUPPLEMENTS,
      });

      const zeroStockProduct = createProduct({
        sku: 'VAL-ZERO-01',
        name: 'Out of stock shaker',
        stock: 0, // 0 * 5.00 = 0.00
        minStock: 1,
        purchaseCost: 5.0,
        category: InventoryCategory.RETAIL_PRODUCTS,
      });

      await repository.save(p1);
      await repository.save(p2);
      await repository.save(zeroStockProduct);

      const handler = new GetInventoryValuationHandler(repository);
      const result = await handler.execute(new GetInventoryValuationQuery());

      expect(result.isSuccess).toBe(true);
      // Expected total: 81.25 + 199.92 + 0.00 = 281.17
      expect(result.value.totalValueAmount).toBe(281.17);
      expect(result.value.currency).toBe('USD');
      expect(result.value.totalDistinctItems).toBe(3);
      expect(result.value.totalQuantityUnits).toBe(20.5);

      // Category breakdown
      expect(
        result.value.breakdownByCategory[InventoryCategory.CLINICAL_SUPPLIES]?.totalValueAmount,
      ).toBe(81.25);
      expect(
        result.value.breakdownByCategory[InventoryCategory.SUPPLEMENTS]?.totalValueAmount,
      ).toBe(199.92);
      expect(
        result.value.breakdownByCategory[InventoryCategory.RETAIL_PRODUCTS]?.totalValueAmount,
      ).toBe(0.0);
    });

    it('returns zero totals when inventory is completely empty', async () => {
      const handler = new GetInventoryValuationHandler(repository);
      const result = await handler.execute(new GetInventoryValuationQuery());

      expect(result.isSuccess).toBe(true);
      expect(result.value.totalValueAmount).toBe(0);
      expect(result.value.totalDistinctItems).toBe(0);
      expect(result.value.totalQuantityUnits).toBe(0);
    });
  });
});
