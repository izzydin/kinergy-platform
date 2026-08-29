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
import { AdjustStockHandler } from '../handlers/adjust-stock.handler';
import { AdjustStockInHandler } from '../handlers/adjust-stock-in.handler';
import { AdjustStockOutHandler } from '../handlers/adjust-stock-out.handler';
import { UpdateInventoryItemHandler } from '../handlers/update-inventory-item.handler';
import { AdjustStockCommand } from '../commands/adjust-stock.command';
import { AdjustStockInCommand } from '../commands/adjust-stock-in.command';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';
import { UpdateInventoryItemCommand } from '../commands/update-inventory-item.command';
import { InventoryOptimisticLockException as OptimisticLockException } from '../../domain/inventory/exceptions';
import { StockAdjustedDomainEvent } from '../../domain/inventory/events/stock-adjusted.event';

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

describe('Consumable Inventory AdjustStock & Audit-Safe Corrections (Phase 6.5)', () => {
  let repository: InMemoryInventoryItemRepository;
  let eventPublisher: MockEventPublisher;
  const actorId = 'usr_inventory_manager_42';
  const tenantId = 'tenant_kinergy_alpha';

  function createTestProduct(initialStock = 10, sku = 'TAPE-KINESIO-01'): InventoryItem {
    return InventoryItem.create({
      tenantId,
      sku,
      name: 'Kinesiology Therapeutic Tape 5cm x 5m',
      category: InventoryCategory.CLINICAL_SUPPLIES,
      unit: UnitOfMeasure.ROLLS,
      minimumStock: 5,
      initialStock,
      purchaseCost: { amount: 6.5, currency: 'USD' },
      sellingPrice: { amount: 18.0, currency: 'USD' },
      recordedByUserId: actorId,
    });
  }

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
    eventPublisher = new MockEventPublisher();
  });

  describe('1. VALID ADJUSTMENT IN (Positive Stock Reconciliation)', () => {
    it('executes AdjustStock with ADJUSTMENT_IN, increases stock, records movement and dispatches event', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const command = new AdjustStockCommand({
        itemId: product.id.getValue(),
        type: 'ADJUSTMENT_IN',
        quantity: 5,
        reason: 'Annual inventory audit: found uncounted carton in storage bin B-04',
        actorId,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(15);
      expect(result.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(result.value.movement.quantityDelta).toBe(5);
      expect(result.value.movement.balanceAfter).toBe(15);
      expect(result.value.movement.reason).toContain('Annual inventory audit');
      expect(result.value.movement.recordedByUserId).toBe(actorId);

      // Verify domain events
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockAdjusted');
      const event = eventPublisher.publishedEvents[0] as StockAdjustedDomainEvent;
      expect(event.payload?.movementType).toBe(StockMovementType.ADJUSTMENT_IN);

      // Verify repository persistence
      const reloaded = await repository.findById(product.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(15);
      expect(reloaded?.version).toBe(2);
    });

    it('works identically when calling granular AdjustStockInHandler', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockInHandler(repository, eventPublisher);
      const command = new AdjustStockInCommand({
        itemId: product.id.getValue(),
        quantity: 3,
        reason: 'Found misplaced stock',
        actorId,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(13);
      expect(result.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
    });
  });

  describe('2. VALID ADJUSTMENT OUT (Negative Stock Reconciliation / Spoilage)', () => {
    it('executes AdjustStock with ADJUSTMENT_OUT, decrements stock, records movement and dispatches event', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const command = new AdjustStockCommand({
        itemId: product.id.getValue(),
        type: 'ADJUSTMENT_OUT',
        quantity: 4,
        reason: 'Water leak damage during thunderstorm in storage rack A',
        actorId,
        tenantId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(6);
      expect(result.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
      expect(result.value.movement.quantityDelta).toBe(-4);
      expect(result.value.movement.balanceAfter).toBe(6);
      expect(result.value.movement.reason).toContain('Water leak damage');
      expect(result.value.movement.recordedByUserId).toBe(actorId);

      // Verify domain events
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('StockAdjusted');
      const event = eventPublisher.publishedEvents[0] as StockAdjustedDomainEvent;
      expect(event.payload?.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
    });

    it('works identically when calling granular AdjustStockOutHandler', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockOutHandler(repository, eventPublisher);
      const command = new AdjustStockOutCommand({
        itemId: product.id.getValue(),
        quantity: 2,
        reason: 'Discarding torn packaging',
        actorId,
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(8);
      expect(result.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
    });
  });

  describe('3. BOUNDARY & INVARIANT ENFORCEMENT', () => {
    it('allows adjusting out exact stock to zero without overdraft', async () => {
      const product = createTestProduct(5);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const command = new AdjustStockCommand({
        itemId: product.id.getValue(),
        type: 'ADJUSTMENT_OUT',
        quantity: 5,
        reason: 'Batch expired and disposed in full',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(0);
      expect(result.value.movement.balanceAfter).toBe(0);
      expect(result.value.movement.quantityDelta).toBe(-5);
    });

    it('strictly forbids adjusting out more than available stock', async () => {
      const product = createTestProduct(2);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const command = new AdjustStockCommand({
        itemId: product.id.getValue(),
        type: 'ADJUSTMENT_OUT',
        quantity: 3, // 3 > 2
        reason: 'Attempted excessive negative adjustment',
        actorId,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient stock');

      // State unaffected
      const reloaded = await repository.findById(product.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(2);
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('rejects missing, empty, or whitespace-only adjustment reason', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);

      const emptyReason = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 1,
          reason: '',
          actorId,
        }),
      );
      expect(emptyReason.isFailure).toBe(true);
      expect(emptyReason.error).toContain('mandatory, meaningful reason');

      const whitespaceReason = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 1,
          reason: '   ',
          actorId,
        }),
      );
      expect(whitespaceReason.isFailure).toBe(true);
      expect(whitespaceReason.error).toContain('mandatory, meaningful reason');

      const shortReason = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 1,
          reason: 'no', // 2 chars < 3 chars
          actorId,
        }),
      );
      expect(shortReason.isFailure).toBe(true);
      expect(shortReason.error).toContain('minimum 3 characters');
    });

    it('rejects invalid or non-positive quantities', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);

      const zeroQty = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 0,
          reason: 'Zero count adjustment',
          actorId,
        }),
      );
      expect(zeroQty.isFailure).toBe(true);
      expect(zeroQty.error).toContain('positive finite number');

      const negQty = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: -5,
          reason: 'Negative input adjustment',
          actorId,
        }),
      );
      expect(negQty.isFailure).toBe(true);
      expect(negQty.error).toContain('positive finite number');
    });

    it('rejects adjustment on INACTIVE or ARCHIVED items', async () => {
      const product = createTestProduct(0, 'SUSPENDED-AUDIT-01');
      product.deactivate(actorId, 'Suspended audit line');
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const res = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 10,
          reason: 'Attempted audit on suspended item',
          actorId,
        }),
      );
      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('INACTIVE');
    });
  });

  describe('4. TRANSACTIONAL FAILURE ROLLBACK & CONCURRENCY', () => {
    it('guarantees complete rollback if database transaction fails', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      repository.failOnSave = true;

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 5,
          reason: 'Audit addition with DB error',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('PostgreSQL unit-of-work transaction error');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('handles OCC concurrency conflict without dirty commits', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      repository.simulateOccConflict = true;

      const handler = new AdjustStockHandler(repository, eventPublisher);
      const result = await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_OUT',
          quantity: 2,
          reason: 'Simultaneous conflicting adjustment',
          actorId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Optimistic lock conflict');
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });
  });

  describe('5. NO SILENT CORRECTIONS & HISTORICAL IMMUTABILITY', () => {
    it('guarantees UpdateProduct cannot silently change stock without an audit movement', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const updateHandler = new UpdateInventoryItemHandler(repository, eventPublisher);

      // Attempting to update product details
      const updateResult = await updateHandler.execute(
        new UpdateInventoryItemCommand({
          id: product.id.getValue(),
          name: 'Updated Kinesiology Tape Deluxe',
          minimumStock: 8,
          actorId,
        }),
      );

      expect(updateResult.isSuccess).toBe(true);
      expect(updateResult.value.name).toBe('Updated Kinesiology Tape Deluxe');
      expect(updateResult.value.minimumStock).toBe(8);
      // Stock on hand remains strictly untouched (10)
      expect(updateResult.value.quantityOnHand).toBe(10);

      // Verify no extraneous stock movements created
      const reloaded = await repository.findById(product.id.getValue());
      expect(reloaded?.quantityOnHand.value).toBe(10);
      // Only the initial opening balance movement exists (1 movement)
      expect(reloaded?.movements.length).toBe(1);
    });

    it('proves adjustments append new immutable movements and never mutate historical records', async () => {
      const product = createTestProduct(10);
      await repository.save(product);

      const handler = new AdjustStockHandler(repository, eventPublisher);

      // 1. Adjustment In +5 -> balance 15
      await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_IN',
          quantity: 5,
          reason: 'Audit correction #1: Found 5 additional rolls',
          actorId,
        }),
      );

      // 2. Adjustment Out -2 -> balance 13
      await handler.execute(
        new AdjustStockCommand({
          itemId: product.id.getValue(),
          type: 'ADJUSTMENT_OUT',
          quantity: 2,
          reason: 'Audit correction #2: Discarded damaged adhesive',
          actorId,
        }),
      );

      const item = await repository.findById(product.id.getValue());
      expect(item).not.toBeNull();
      expect(item?.quantityOnHand.value).toBe(13);

      // Ledger has 3 immutable records: [Initial 10, Adj In 5, Adj Out -2]
      expect(item?.movements.length).toBe(3);

      const [m0, m1, m2] = item!.movements;
      expect(m0?.balanceAfter.value).toBe(10);
      expect(m0?.quantityDelta.value).toBe(10);

      expect(m1?.balanceAfter.value).toBe(15);
      expect(m1?.quantityDelta.value).toBe(5);
      expect(m1?.movementType).toBe(StockMovementType.ADJUSTMENT_IN);

      expect(m2?.balanceAfter.value).toBe(13);
      expect(m2?.quantityDelta.value).toBe(-2);
      expect(m2?.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
    });
  });
});
