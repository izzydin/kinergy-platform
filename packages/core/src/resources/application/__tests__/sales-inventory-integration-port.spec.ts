import { SellStockHandler } from '../handlers/sell-stock.handler';
import { InventoryStockDecrementPort } from '../ports/inventory-stock-decrement.port';
import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';

class InMemoryInventoryRepository implements InventoryItemRepository {
  private items = new Map<string, InventoryItem>();

  async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    return item ?? null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const item of this.items.values()) {
      if (
        item.sku.value === sku.trim().toUpperCase() &&
        (!tenantId || item.tenantId === tenantId)
      ) {
        return item;
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id.getValue(), item);
  }

  async findMany(): Promise<InventoryItem[]> {
    return Array.from(this.items.values());
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  seed(item: InventoryItem): void {
    this.items.set(item.id.getValue(), item);
  }
}

describe('Sales ↔ Inventory Integration Capability Port Contract', () => {
  let repository: InMemoryInventoryRepository;
  let port: InventoryStockDecrementPort;
  let testItem: InventoryItem;

  beforeEach(() => {
    repository = new InMemoryInventoryRepository();
    port = new SellStockHandler(repository);

    testItem = InventoryItem.create({
      sku: 'PROT-SHAKE-001',
      name: 'Organic Whey Protein Shake',
      category: InventoryCategory.HEALTHY_DRINKS,
      unit: UnitOfMeasure.BOTTLES,
      initialStock: 25,
      minimumStock: 5,
      purchaseCost: { amount: 2.5, currency: 'USD' },
      sellingPrice: { amount: 5.0, currency: 'USD' },
      recordedByUserId: 'usr_inventory_manager',
      tenantId: 'tenant_wellness_01',
    });

    repository.seed(testItem);
  });

  describe('1. Valid Commercial Sale Stock Mutation', () => {
    it('successfully deducts stock and logs append-only SALE movement with external order reference', async () => {
      const result = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 3,
        sellingPrice: { amount: 5.0, currency: 'USD' },
        referenceId: 'ord_pos_checkout_99182',
        reason: 'Retail checkout point-of-sale',
        actorId: 'usr_front_desk_cashier',
        tenantId: 'tenant_wellness_01',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(22);
      expect(result.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(result.value.movement.quantityDelta).toBe(-3);
      expect(result.value.movement.balanceAfter).toBe(22);
      expect(result.value.movement.referenceId).toBe('ord_pos_checkout_99182');
    });
  });

  describe('2. Negative Stock Prevention & Invariant Enforcement', () => {
    it('rejects sales exceeding available stock without mutating inventory balance or movement ledger', async () => {
      const initialStock = testItem.quantityOnHand.value;
      const initialMovementsCount = testItem.movements.length;

      const result = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 30, // Exceeds available 25
        referenceId: 'ord_pos_checkout_oversell',
        reason: 'Bulk retail purchase attempt',
        actorId: 'usr_front_desk_cashier',
        tenantId: 'tenant_wellness_01',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/insufficient stock/i);

      // Verify zero side-effects
      const persisted = await repository.findById(testItem.id.getValue());
      expect(persisted?.quantityOnHand.value).toBe(initialStock);
      expect(persisted?.movements.length).toBe(initialMovementsCount);
    });
  });

  describe('3. Validation & Defect Defense', () => {
    it('rejects invalid non-positive or zero sale quantities', async () => {
      const resultZero = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 0,
        reason: 'Zero quantity error',
        actorId: 'usr_cashier',
      });
      expect(resultZero.isSuccess).toBe(false);
      expect(resultZero.error).toMatch(/positive number greater than zero/i);

      const resultNegative = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: -5,
        reason: 'Negative quantity error',
        actorId: 'usr_cashier',
      });
      expect(resultNegative.isSuccess).toBe(false);
      expect(resultNegative.error).toMatch(/positive number greater than zero/i);
    });

    it('rejects missing or whitespace-only reason strings', async () => {
      const result = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 2,
        reason: '   ',
        actorId: 'usr_cashier',
      });
      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/valid reason.*minimum 3 characters/i);
    });

    it('rejects calls targeting non-existent products', async () => {
      const result = await port.sellStock({
        itemId: 'item_does_not_exist',
        quantity: 1,
        reason: 'Retail sale',
        actorId: 'usr_cashier',
      });
      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('enforces multi-tenant isolation by rejecting cross-tenant stock decrements', async () => {
      const result = await port.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 1,
        reason: 'Cross-tenant sale attempt',
        actorId: 'usr_cashier',
        tenantId: 'tenant_intruder_99',
      });
      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });

  describe('4. Concurrency & Failure Resilience Scenarios', () => {
    it('prevents negative stock under concurrent sales targeting remaining quantity', async () => {
      // Seed item with exactly 5 units left
      const lowStockItem = InventoryItem.create({
        sku: 'ENERGY-BAR-CRUNCH',
        name: 'Organic Energy Bar',
        category: InventoryCategory.RETAIL_PRODUCTS,
        unit: UnitOfMeasure.UNITS,
        initialStock: 5,
        minimumStock: 2,
        purchaseCost: { amount: 1.0, currency: 'USD' },
        sellingPrice: { amount: 2.5, currency: 'USD' },
        recordedByUserId: 'usr_inventory_manager',
        tenantId: 'tenant_wellness_01',
      });
      repository.seed(lowStockItem);

      // Simulate 2 parallel sales requests each trying to purchase 4 units (total 8 > 5)
      const sale1Promise = port.sellStock({
        itemId: lowStockItem.id.getValue(),
        quantity: 4,
        reason: 'Concurrent POS terminal 1',
        actorId: 'usr_cashier_1',
        tenantId: 'tenant_wellness_01',
      });

      const sale2Promise = port.sellStock({
        itemId: lowStockItem.id.getValue(),
        quantity: 4,
        reason: 'Concurrent POS terminal 2',
        actorId: 'usr_cashier_2',
        tenantId: 'tenant_wellness_01',
      });

      const [res1, res2] = await Promise.all([sale1Promise, sale2Promise]);

      // Exactly one sale succeeds and the other is safely rejected with Insufficient Stock
      const successes = [res1, res2].filter((r) => r.isSuccess);
      const failures = [res1, res2].filter((r) => !r.isSuccess);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0]?.error).toMatch(/insufficient stock/i);

      // Verify physical stock invariant: balance is 1 (5 - 4), never negative
      const finalItem = await repository.findById(lowStockItem.id.getValue());
      expect(finalItem?.quantityOnHand.value).toBe(1);
    });

    it('returns meaningful failure when repository throws an unhandled persistence error without corrupting memory', async () => {
      const faultyRepository: InventoryItemRepository = {
        findById: jest.fn().mockRejectedValue(new Error('PostgreSQL connection timeout')),
        findBySku: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn().mockResolvedValue(undefined),
      };

      const faultyPort = new SellStockHandler(faultyRepository);
      const result = await faultyPort.sellStock({
        itemId: testItem.id.getValue(),
        quantity: 1,
        reason: 'Sale during DB hiccup',
        actorId: 'usr_cashier',
        tenantId: 'tenant_wellness_01',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/PostgreSQL connection timeout/i);
    });
  });
});
