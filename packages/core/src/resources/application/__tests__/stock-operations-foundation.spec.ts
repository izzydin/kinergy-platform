import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { AdjustStockInHandler } from '../handlers/adjust-stock-in.handler';
import { AdjustStockOutHandler } from '../handlers/adjust-stock-out.handler';
import { CorrectStockHandler } from '../handlers/correct-stock.handler';
import { ScrapStockHandler } from '../handlers/scrap-stock.handler';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { AdjustStockInCommand } from '../commands/adjust-stock-in.command';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';
import { CorrectStockCommand } from '../commands/correct-stock.command';
import { ScrapStockCommand } from '../commands/scrap-stock.command';
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
      throw new Error('Database transaction connection error');
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

import { DomainEvent } from '../../domain/shared/domain-event';

// Mock Event Publisher
class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Consumable Inventory Stock Operations Application Foundation (Phase 6.5)', () => {
  let repository: InMemoryInventoryItemRepository;
  let eventPublisher: MockEventPublisher;
  const actorId = 'usr_inventory_manager_1';
  const tenantId = 'tenant_kinergy_main';

  function createActiveTestItem(initialStock = 10, sku = 'TAPE-RIGID-01'): InventoryItem {
    const item = InventoryItem.create({
      tenantId,
      sku,
      name: 'Rigid Strapping Tape 38mm',
      category: InventoryCategory.CLINICAL_SUPPLIES,
      unit: UnitOfMeasure.ROLLS,
      minimumStock: 5,
      initialStock,
      purchaseCost: { amount: 4.5, currency: 'USD' },
      sellingPrice: { amount: 10.0, currency: 'USD' },
      recordedByUserId: actorId,
    });
    return item;
  }

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
    eventPublisher = new MockEventPublisher();
  });

  describe('1. Shared Orchestration & Operation Sequence', () => {
    it('executes RecordPurchase (ReceiveStock) through orchestrator with atomic movement and event dispatch', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const command = new ReceiveStockCommand({
        itemId: item.id.getValue(),
        quantity: 15,
        unitCost: { amount: 4.2, currency: 'USD' },
        referenceId: 'PO-2026-9901',
        reason: 'Received supplier shipment batch #4',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(25);
      expect(result.value.item.version).toBe(2);
      expect(result.value.movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(result.value.movement.quantityDelta).toBe(15);
      expect(result.value.movement.balanceAfter).toBe(25);
      expect(result.value.movement.referenceId).toBe('PO-2026-9901');

      // Verify repository was updated
      const reloaded = await repository.findById(item.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(25);

      // Verify domain events dispatched
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockReceived');
    });

    it('executes RecordSale (SellStock) decrements stock and snapshots selling price', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const handler = new SellStockHandler(repository, eventPublisher);
      const command = new SellStockCommand({
        itemId: item.id.getValue(),
        quantity: 3,
        sellingPrice: { amount: 12.5, currency: 'USD' },
        referenceId: 'INV-2026-0044',
        reason: 'POS retail counter sale',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(7);
      expect(result.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(result.value.movement.quantityDelta).toBe(-3);
      expect(result.value.movement.balanceAfter).toBe(7);
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockSold');
    });

    it('executes RecordConsumption (ConsumeStock) linking clinical reference ID', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const handler = new ConsumeStockHandler(repository, eventPublisher);
      const command = new ConsumeStockCommand({
        itemId: item.id.getValue(),
        quantity: 2,
        referenceId: 'SESSION-TX-8832',
        reason: 'Applied during rotator cuff physical therapy session',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(8);
      expect(result.value.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(result.value.movement.quantityDelta).toBe(-2);
      expect(result.value.movement.balanceAfter).toBe(8);
      expect(result.value.movement.referenceId).toBe('SESSION-TX-8832');
    });

    it('executes AdjustStockIn and AdjustStockOut for inventory discrepancy reconciliation', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const adjustInHandler = new AdjustStockInHandler(repository, eventPublisher);
      const inRes = await adjustInHandler.execute(
        new AdjustStockInCommand({
          itemId: item.id.getValue(),
          quantity: 4,
          reason: 'Physical count found 4 additional rolls in backroom storage',
          actorId,
        }),
      );
      expect(inRes.isSuccess).toBe(true);
      expect(inRes.value.item.quantityOnHand).toBe(14);
      expect(inRes.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);

      const adjustOutHandler = new AdjustStockOutHandler(repository, eventPublisher);
      const outRes = await adjustOutHandler.execute(
        new AdjustStockOutCommand({
          itemId: item.id.getValue(),
          quantity: 1,
          reason: 'Water damaged roll discarded during storage inspection',
          actorId,
        }),
      );
      expect(outRes.isSuccess).toBe(true);
      expect(outRes.value.item.quantityOnHand).toBe(13);
      expect(outRes.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
    });

    it('executes CorrectStock directly reconciling inventory balance to absolute target count', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const handler = new CorrectStockHandler(repository, eventPublisher);
      const command = new CorrectStockCommand({
        itemId: item.id.getValue(),
        targetCount: 42,
        reason: 'Quarterly full warehouse physical audit reconciliation',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(42);
      expect(result.value.movement.movementType).toBe(StockMovementType.CORRECTION);
      expect(result.value.movement.quantityDelta).toBe(32); // 42 - 10 = +32
      expect(result.value.movement.balanceAfter).toBe(42);
    });

    it('executes ScrapStock recording disposal of expired supplies', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      const handler = new ScrapStockHandler(repository, eventPublisher);
      const command = new ScrapStockCommand({
        itemId: item.id.getValue(),
        quantity: 5,
        reason: 'Expired past sterile manufacturer expiration date',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(5);
      expect(result.value.movement.movementType).toBe(StockMovementType.SCRAP);
      expect(result.value.movement.quantityDelta).toBe(-5);
      expect(result.value.movement.balanceAfter).toBe(5);
    });
  });

  describe('2. Core Invariant Enforcement (currentStock >= 0 & stock_after_movement >= 0)', () => {
    it('strictly forbids selling more stock than available on hand (overdraft prevention)', async () => {
      const item = createActiveTestItem(5);
      await repository.save(item);

      const handler = new SellStockHandler(repository, eventPublisher);
      const command = new SellStockCommand({
        itemId: item.id.getValue(),
        quantity: 6, // 6 > 5
        reason: 'Attempted oversell at checkout',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');

      // State remains completely unmodified
      const reloaded = await repository.findById(item.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(5);
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('strictly forbids consuming more stock than available on hand', async () => {
      const item = createActiveTestItem(2);
      await repository.save(item);

      const handler = new ConsumeStockHandler(repository, eventPublisher);
      const command = new ConsumeStockCommand({
        itemId: item.id.getValue(),
        quantity: 3,
        reason: 'Over-consumption attempt',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');
    });

    it('strictly forbids adjusting out more stock than available on hand', async () => {
      const item = createActiveTestItem(3);
      await repository.save(item);

      const handler = new AdjustStockOutHandler(repository, eventPublisher);
      const command = new AdjustStockOutCommand({
        itemId: item.id.getValue(),
        quantity: 4,
        reason: 'Excessive shrinkage adjustment',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');
    });

    it('strictly forbids scrapping more stock than available on hand', async () => {
      const item = createActiveTestItem(1);
      await repository.save(item);

      const handler = new ScrapStockHandler(repository, eventPublisher);
      const command = new ScrapStockCommand({
        itemId: item.id.getValue(),
        quantity: 2,
        reason: 'Disposal exceeding available stock',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');
    });
  });

  describe('3. Lifecycle Status Constraints (INACTIVE & ARCHIVED Rejection)', () => {
    it('rejects stock mutations on INACTIVE items', async () => {
      const item = createActiveTestItem(10);
      item.deactivate(actorId, 'Temporarily suspended due to supplier recall');
      await repository.save(item);

      const receiveHandler = new ReceiveStockHandler(repository, eventPublisher);
      const res = await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId: item.id.getValue(),
          quantity: 5,
          reason: 'Restocking suspended item',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('INACTIVE');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('rejects stock mutations on ARCHIVED items', async () => {
      const item = createActiveTestItem(0, 'DISCONTINUED-01');
      item.archive(actorId, 'Permanently discontinued product line');
      await repository.save(item);

      const sellHandler = new SellStockHandler(repository, eventPublisher);
      const res = await sellHandler.execute(
        new SellStockCommand({
          itemId: item.id.getValue(),
          quantity: 1,
          reason: 'Selling archived item',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('ARCHIVED');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  describe('4. Concurrency Race Conditions & Lost Update Prevention', () => {
    it('PROVES OCC SERIALIZATION: second concurrent requester fails with conflict when version changed', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      // Thread A reads item (version 2)
      const threadAItem = await repository.findById(item.id.getValue());
      // Thread B reads item (version 2)
      const threadBItem = await repository.findById(item.id.getValue());

      expect(threadAItem?.version).toBe(threadBItem?.version);

      // Thread A executes and saves successfully (advancing version to 3)
      threadAItem?.sellStock({ quantity: 6, reason: 'Thread A Sale', actorId });
      await repository.save(threadAItem!);

      // Thread B attempts to save its stale aggregate mutation
      threadBItem?.sellStock({ quantity: 4, reason: 'Thread B Sale', actorId });

      await expect(repository.save(threadBItem!)).rejects.toThrow(OptimisticLockException);

      // Verify the item's stock in repository is 4 (10 - 6), NOT 0 or corrupted
      const verified = await repository.findById(item.id.getValue());
      expect(verified?.quantityOnHand.value).toBe(4);
    });

    it('orchestrator translates OptimisticLockException into clean ApplicationResult.fail', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      repository.simulateOccConflict = true;

      const handler = new SellStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new SellStockCommand({
          itemId: item.id.getValue(),
          quantity: 2,
          reason: 'Concurrent sale attempt',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Optimistic lock conflict');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  describe('5. Failure Atomicity & Rollback Guarantees', () => {
    it('rolls back completely if repository save fails with database error (no ghost events published)', async () => {
      const item = createActiveTestItem(10);
      await repository.save(item);

      repository.failOnSave = true;

      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new ReceiveStockCommand({
          itemId: item.id.getValue(),
          quantity: 20,
          reason: 'Shipment receipt failing on DB commit',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Database transaction connection error');

      // Crucial invariant: No domain events dispatched if persistence failed
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('returns fail result when item ID does not exist', async () => {
      const handler = new ReceiveStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new ReceiveStockCommand({
          itemId: 'non-existent-id',
          quantity: 5,
          reason: 'Restock missing item',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain("Inventory item with id 'non-existent-id' not found.");
    });

    it('returns fail result when command input fails syntax validation', async () => {
      const handler = new ReceiveStockHandler(repository, eventPublisher);

      const badQty = await handler.execute(
        new ReceiveStockCommand({
          itemId: 'item_1',
          quantity: -5,
          reason: 'Negative restock',
          actorId,
        }),
      );
      expect(badQty.isFailure).toBe(true);
      expect(badQty.error).toContain('positive number');

      const badReason = await handler.execute(
        new ReceiveStockCommand({
          itemId: 'item_1',
          quantity: 5,
          reason: 'a', // Too short
          actorId,
        }),
      );
      expect(badReason.isFailure).toBe(true);
      expect(badReason.error).toContain('minimum 3 characters');
    });
  });
});
