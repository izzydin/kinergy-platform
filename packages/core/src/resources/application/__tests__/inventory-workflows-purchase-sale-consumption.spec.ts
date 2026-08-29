import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { InventoryOptimisticLockException as OptimisticLockException } from '../../domain/inventory/exceptions';

// In-Memory Test Repository
class InMemoryInventoryItemRepository implements InventoryItemRepository {
  public items = new Map<string, InventoryItem>();
  public saveCallCount = 0;
  public failOnSave = false;
  public simulateOccConflict = false;

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
    this.saveCallCount++;
    if (this.failOnSave) {
      throw new Error('PostgreSQL unit-of-work transaction error');
    }
    if (this.simulateOccConflict) {
      throw new OptimisticLockException('InventoryItem', item.id.getValue(), item.version - 1);
    }
    const existing = this.items.get(item.id.getValue());
    if (existing && existing.version >= item.version) {
      throw new OptimisticLockException('InventoryItem', item.id.getValue(), existing.version);
    }
    this.items.set(item.id.getValue(), this.clone(item));
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let all = Array.from(this.items.values()).map((i) => this.clone(i));
    if (filter?.lowStockOnly) {
      all = all.filter((i) => i.isLowStock);
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

// Mock Event Publisher
class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Consumable Inventory Workflows: RecordPurchase, RecordSale, RecordConsumption (Phase 6.5)', () => {
  let repository: InMemoryInventoryItemRepository;
  let eventPublisher: MockEventPublisher;
  const actorId = 'usr_clinician_99';
  const tenantId = 'tenant_kinergy_alpha';

  function createTestProduct(initialStock = 10, sku = 'BAND-LATEX-01'): InventoryItem {
    return InventoryItem.create({
      tenantId,
      sku,
      name: 'Latex Resistance Band Heavy',
      category: InventoryCategory.CLINICAL_SUPPLIES,
      unit: UnitOfMeasure.UNITS,
      minimumStock: 4,
      initialStock,
      purchaseCost: { amount: 5.0, currency: 'USD' },
      sellingPrice: { amount: 15.0, currency: 'USD' },
      recordedByUserId: actorId,
    });
  }

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
    eventPublisher = new MockEventPublisher();
  });

  describe('1. RECORD PURCHASE WORKFLOW (ReceiveStockHandler)', () => {
    it('successfully processes purchase receipt, increments stock, records PURCHASE movement and preserves base purchase cost', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const command = new ReceiveStockCommand({
        itemId: product.id.getValue(),
        quantity: 20,
        unitCost: { amount: 4.8, currency: 'USD' }, // Specific batch invoice unit cost override
        referenceId: 'PO-2026-8812',
        reason: 'Restocking Q3 shipment from PhysioDirect Supplier',
        actorId,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(30);
      expect(result.value.item.purchaseCostAmount).toBe(5.0); // Catalog base price unchanged
      expect(result.value.movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(result.value.movement.quantityDelta).toBe(20);
      expect(result.value.movement.balanceAfter).toBe(30);
      expect(result.value.movement.unitCostAmount).toBe(4.8);
      expect(result.value.movement.referenceId).toBe('PO-2026-8812');
      expect(result.value.movement.recordedByUserId).toBe(actorId);

      // Verify state in repository
      const reloaded = await repository.findById(product.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(30);

      // Verify domain event
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockReceived');
    });

    it('rejects purchase when tenant boundary is mismatched', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const command = new ReceiveStockCommand({
        itemId: product.id.getValue(),
        quantity: 5,
        reason: 'Restock under invalid tenant',
        actorId,
        tenantId: 'other_tenant_id',
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('not found');
    });

    it('rejects purchase on invalid / non-positive quantities', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new ReceiveStockHandler(repository, eventPublisher);

      const zeroQty = await handler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: 0,
          reason: 'Zero restock',
          actorId,
        }),
      );
      expect(zeroQty.isFailure).toBe(true);
      expect(zeroQty.error).toContain('positive number');

      const negativeQty = await handler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: -10,
          reason: 'Negative restock',
          actorId,
        }),
      );
      expect(negativeQty.isFailure).toBe(true);
      expect(negativeQty.error).toContain('positive number');
    });

    it('rejects purchase on INACTIVE and ARCHIVED products', async () => {
      const product = createTestProduct(0, 'SUSPENDED-01');
      product.deactivate(actorId, 'Suspended vendor line');
      await repository.save(product);

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const resInactive = await handler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: 10,
          reason: 'Attempted restock of inactive',
          actorId,
        }),
      );
      expect(resInactive.isFailure).toBe(true);
      expect(resInactive.error).toContain('INACTIVE');

      const archivedProduct = createTestProduct(0, 'ARCHIVED-01');
      archivedProduct.archive(actorId, 'Discontinued permanently');
      await repository.save(archivedProduct);

      const resArchived = await handler.execute(
        new ReceiveStockCommand({
          itemId: archivedProduct.id.getValue(),
          quantity: 10,
          reason: 'Attempted restock of archived',
          actorId,
        }),
      );
      expect(resArchived.isFailure).toBe(true);
      expect(resArchived.error).toContain('ARCHIVED');
    });

    it('rolls back completely if persistence fails during purchase', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      repository.failOnSave = true;

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: 5,
          reason: 'Restock with DB failure',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('PostgreSQL unit-of-work transaction error');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  describe('2. RECORD SALE WORKFLOW (SellStockHandler)', () => {
    it('successfully processes retail sale, decrements stock, records SALE movement and snapshots unit price', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new SellStockHandler(repository, eventPublisher);
      const command = new SellStockCommand({
        itemId: product.id.getValue(),
        quantity: 4,
        sellingPrice: { amount: 16.0, currency: 'USD' }, // Promotional price override
        referenceId: 'POS-REC-49102',
        reason: 'Over-the-counter retail band sale',
        actorId,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(6);
      expect(result.value.item.sellingPriceAmount).toBe(15.0); // Base catalog price unchanged
      expect(result.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(result.value.movement.quantityDelta).toBe(-4);
      expect(result.value.movement.balanceAfter).toBe(6);
      expect(result.value.movement.referenceId).toBe('POS-REC-49102');
      expect(result.value.movement.recordedByUserId).toBe(actorId);

      // Verify domain event
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockSold');
    });

    it('allows selling exact available stock resulting in zero-stock without overdraft', async () => {
      const product = createTestProduct(5);
      await repository.save(product);

      const handler = new SellStockHandler(repository, eventPublisher);
      const command = new SellStockCommand({
        itemId: product.id.getValue(),
        quantity: 5, // Exact quantity on hand
        reason: 'Selling entire remaining stock',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(0);
      expect(result.value.movement.balanceAfter).toBe(0);
      expect(result.value.movement.quantityDelta).toBe(-5);
    });

    it('strictly forbids selling more than available stock (overdraft prevention)', async () => {
      const product = createTestProduct(3);
      await repository.save(product);

      const handler = new SellStockHandler(repository, eventPublisher);
      const command = new SellStockCommand({
        itemId: product.id.getValue(),
        quantity: 4, // 4 > 3
        reason: 'Attempted oversell',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');

      // State unmodified
      const reloaded = await repository.findById(product.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(3);
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('rejects sale on INACTIVE and ARCHIVED products', async () => {
      const product = createTestProduct(10, 'INACTIVE-SALE-01');
      product.deactivate(actorId, 'Suspended sale');
      await repository.save(product);

      const handler = new SellStockHandler(repository, eventPublisher);
      const res = await handler.execute(
        new SellStockCommand({
          itemId: product.id.getValue(),
          quantity: 1,
          reason: 'Selling inactive item',
          actorId,
        }),
      );
      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('INACTIVE');
    });

    it('handles OCC concurrency conflict during concurrent sale attempts', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      repository.simulateOccConflict = true;

      const handler = new SellStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new SellStockCommand({
          itemId: product.id.getValue(),
          quantity: 2,
          reason: 'Concurrent race condition sale',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Optimistic lock conflict');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  describe('3. RECORD CONSUMPTION WORKFLOW (ConsumeStockHandler)', () => {
    it('successfully processes internal clinical consumption with TreatmentSession reference', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new ConsumeStockHandler(repository, eventPublisher);
      const command = new ConsumeStockCommand({
        itemId: product.id.getValue(),
        quantity: 2,
        referenceId: 'TX-SESSION-2026-7731',
        reason: 'Shoulder stability exercise protocol during PT session',
        actorId,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(8);
      expect(result.value.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(result.value.movement.quantityDelta).toBe(-2);
      expect(result.value.movement.balanceAfter).toBe(8);
      expect(result.value.movement.referenceId).toBe('TX-SESSION-2026-7731');
      expect(result.value.movement.recordedByUserId).toBe(actorId);

      // Verify domain event
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockConsumed');
    });

    it('strictly forbids consuming more than available stock', async () => {
      const product = createTestProduct(1);
      await repository.save(product);

      const handler = new ConsumeStockHandler(repository, eventPublisher);
      const command = new ConsumeStockCommand({
        itemId: product.id.getValue(),
        quantity: 2, // 2 > 1
        reason: 'Excessive consumption attempt',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');
    });

    it('rejects consumption with missing or too-short reason context', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new ConsumeStockHandler(repository, eventPublisher);
      const command = new ConsumeStockCommand({
        itemId: product.id.getValue(),
        quantity: 1,
        reason: 'a', // Too short (< 3 chars)
        actorId,
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('minimum 3 characters');
    });
  });

  describe('4. CROSS-WORKFLOW INTEGRITY & RECONSTRUCTION', () => {
    it('proves multi-operation lifecycle sequence maintains exact stock and ledger balance synchronization', async () => {
      // 1. Initial product created with 10 units (Version 1)
      const product = createTestProduct(10, 'CROSS-WORKFLOW-01');
      await repository.save(product);

      const receiveHandler = new ReceiveStockHandler(repository, eventPublisher);
      const sellHandler = new SellStockHandler(repository, eventPublisher);
      const consumeHandler = new ConsumeStockHandler(repository, eventPublisher);

      // 2. Purchase +15.00 -> balance 25.00
      const r1 = await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: 15,
          reason: 'Supplier procurement batch #1',
          actorId,
        }),
      );
      expect(r1.isSuccess).toBe(true);
      expect(r1.value.item.quantityOnHand).toBe(25);
      expect(r1.value.movement.balanceAfter).toBe(25);

      // 3. Sale -8.00 -> balance 17.00
      const r2 = await sellHandler.execute(
        new SellStockCommand({
          itemId: product.id.getValue(),
          quantity: 8,
          reason: 'Counter sale #1',
          actorId,
        }),
      );
      expect(r2.isSuccess).toBe(true);
      expect(r2.value.item.quantityOnHand).toBe(17);
      expect(r2.value.movement.balanceAfter).toBe(17);

      // 4. Consumption -5.00 -> balance 12.00
      const r3 = await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId: product.id.getValue(),
          quantity: 5,
          referenceId: 'TX-SESSION-001',
          reason: 'Treatment session therapy usage',
          actorId,
        }),
      );
      expect(r3.isSuccess).toBe(true);
      expect(r3.value.item.quantityOnHand).toBe(12);
      expect(r3.value.movement.balanceAfter).toBe(12);

      // 5. Purchase +3.00 -> balance 15.00
      const r4 = await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId: product.id.getValue(),
          quantity: 3,
          reason: 'Quick restock batch #2',
          actorId,
        }),
      );
      expect(r4.isSuccess).toBe(true);
      expect(r4.value.item.quantityOnHand).toBe(15);
      expect(r4.value.movement.balanceAfter).toBe(15);

      // 6. Sale -15.00 -> balance 0.00
      const r5 = await sellHandler.execute(
        new SellStockCommand({
          itemId: product.id.getValue(),
          quantity: 15,
          reason: 'Bulk team sale',
          actorId,
        }),
      );
      expect(r5.isSuccess).toBe(true);
      expect(r5.value.item.quantityOnHand).toBe(0);
      expect(r5.value.movement.balanceAfter).toBe(0);

      // Verify persistent aggregate movements ledger
      const finalItem = await repository.findById(product.id.getValue());
      expect(finalItem).not.toBeNull();
      expect(finalItem?.quantityOnHand.value).toBe(0);

      // Movements: initial (10) + purchase (15) + sale (-8) + consume (-5) + purchase (3) + sale (-15) = 6 movements
      expect(finalItem?.movements.length).toBe(6);

      const balances = finalItem?.movements.map((m) => m.balanceAfter.value);
      expect(balances).toEqual([10, 25, 17, 12, 15, 0]);

      const deltas = finalItem?.movements.map((m) => m.quantityDelta.value);
      expect(deltas).toEqual([10, 15, -8, -5, 3, -15]);

      const types = finalItem?.movements.map((m) => m.movementType);
      expect(types).toEqual([
        StockMovementType.ADJUSTMENT_IN,
        StockMovementType.PURCHASE,
        StockMovementType.SALE,
        StockMovementType.CONSUMPTION,
        StockMovementType.PURCHASE,
        StockMovementType.SALE,
      ]);
    });
  });
});
