import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';

// Command Handlers
import { CreateInventoryItemHandler } from '../handlers/create-inventory-item.handler';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { ScrapStockHandler } from '../handlers/scrap-stock.handler';
import { AdjustStockInHandler } from '../handlers/adjust-stock-in.handler';
import { AdjustStockOutHandler } from '../handlers/adjust-stock-out.handler';
import { AdjustStockHandler } from '../handlers/adjust-stock.handler';
import { CorrectStockHandler } from '../handlers/correct-stock.handler';

// Query Handlers
import { GetLowStockItemsHandler } from '../handlers/get-low-stock-items.handler';
import { GetInventoryValuationHandler } from '../handlers/get-inventory-valuation.handler';
import { GetInventoryItemByIdHandler } from '../handlers/get-inventory-item-by-id.handler';

// Commands
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { ScrapStockCommand } from '../commands/scrap-stock.command';
import { AdjustStockInCommand } from '../commands/adjust-stock-in.command';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';
import { AdjustStockCommand } from '../commands/adjust-stock.command';
import { CorrectStockCommand } from '../commands/correct-stock.command';

// Queries
import { GetLowStockItemsQuery } from '../queries/get-low-stock-items.query';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { GetInventoryItemByIdQuery } from '../queries/get-inventory-item-by-id.query';

import { InventoryOptimisticLockException as OptimisticLockException } from '../../domain/inventory/exceptions';

/**
 * High-fidelity, in-memory transactional repository double
 * faithfully simulating database persistence, optimistic concurrency control,
 * clone-on-write isolation, and multi-tenant scoping.
 */
class InMemoryTransactionalInventoryRepository implements InventoryItemRepository {
  public items = new Map<string, InventoryItem>();
  public saveCallCount = 0;

  async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    return item ? this.clone(item) : null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    const norm = sku.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (item.sku.value === norm && (!tenantId || item.tenantId === tenantId)) {
        return this.clone(item);
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.saveCallCount++;
    const existing = this.items.get(item.id.getValue());

    // Optimistic Concurrency Control
    if (existing && existing.version >= item.version) {
      throw new OptimisticLockException('InventoryItem', item.id.getValue(), existing.version);
    }

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

    if (filter?.stockStatus === 'LOW_STOCK') {
      all = all.filter((i) => i.isLowStock() && !i.isOutOfStock());
    } else if (filter?.stockStatus === 'IN_STOCK') {
      all = all.filter((i) => !i.isLowStock());
    } else if (filter?.stockStatus === 'OUT_OF_STOCK') {
      all = all.filter((i) => i.isOutOfStock());
    }

    return all;
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const list = await this.findMany(filter);
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

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Phase 6.10: Consumable Inventory Application & Persistence Integration Test Suite', () => {
  const actorId = 'usr_qa_integration_lead';
  const tenantId = 'tenant_rehab_center_01';

  let repository: InMemoryTransactionalInventoryRepository;
  let eventPublisher: MockEventPublisher;

  // Handlers under test
  let createItemHandler: CreateInventoryItemHandler;
  let receiveStockHandler: ReceiveStockHandler;
  let sellStockHandler: SellStockHandler;
  let consumeStockHandler: ConsumeStockHandler;
  let scrapStockHandler: ScrapStockHandler;
  let adjustStockInHandler: AdjustStockInHandler;
  let adjustStockOutHandler: AdjustStockOutHandler;
  let adjustStockHandler: AdjustStockHandler;
  let correctStockHandler: CorrectStockHandler;
  let getLowStockHandler: GetLowStockItemsHandler;
  let getValuationHandler: GetInventoryValuationHandler;
  let getItemByIdHandler: GetInventoryItemByIdHandler;

  beforeEach(() => {
    repository = new InMemoryTransactionalInventoryRepository();
    eventPublisher = new MockEventPublisher();

    createItemHandler = new CreateInventoryItemHandler(repository, eventPublisher);
    receiveStockHandler = new ReceiveStockHandler(repository, eventPublisher);
    sellStockHandler = new SellStockHandler(repository, eventPublisher);
    consumeStockHandler = new ConsumeStockHandler(repository, eventPublisher);
    scrapStockHandler = new ScrapStockHandler(repository, eventPublisher);
    adjustStockInHandler = new AdjustStockInHandler(repository, eventPublisher);
    adjustStockOutHandler = new AdjustStockOutHandler(repository, eventPublisher);
    adjustStockHandler = new AdjustStockHandler(repository, eventPublisher);
    correctStockHandler = new CorrectStockHandler(repository, eventPublisher);
    getLowStockHandler = new GetLowStockItemsHandler(repository);
    getValuationHandler = new GetInventoryValuationHandler(repository);
    getItemByIdHandler = new GetInventoryItemByIdHandler(repository);
  });

  // ============================================================================
  // 1. PRODUCT CREATION INTEGRATION
  // ============================================================================
  describe('1. Product Creation & Persistence Integration', () => {
    it('creates and persists a valid inventory item with opening balance movement', async () => {
      const command = new CreateInventoryItemCommand({
        tenantId,
        sku: 'MED-TAPE-01',
        name: 'Kinesiology Tape 5cm',
        description: 'Waterproof elastic rehab tape',
        category: InventoryCategory.THERAPY_CONSUMABLES,
        unit: UnitOfMeasure.ROLLS,
        minimumStock: 10,
        initialStock: 30,
        purchaseCost: { amount: 6.5, currency: 'USD' },
        sellingPrice: { amount: 15.0, currency: 'USD' },
        actorId,
      });

      const result = await createItemHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBeDefined();
      expect(dto.sku).toBe('MED-TAPE-01');
      expect(dto.quantityOnHand).toBe(30);
      expect(dto.version).toBe(1);

      // Inspect persisted state directly from repository
      const persisted = await repository.findById(dto.id);
      expect(persisted).not.toBeNull();
      expect(persisted?.name).toBe('Kinesiology Tape 5cm');
      expect(persisted?.version).toBe(1);
      expect(persisted?.movements).toHaveLength(1);
      expect(persisted?.movements[0]!.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(persisted?.movements[0]!.quantityDelta.value).toBe(30);
      expect(persisted?.movements[0]!.balanceAfter.value).toBe(30);

      // Verify domain events published
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]!.eventType).toBe('InventoryItemCreated');
    });

    it('rejects duplicate SKU within the same tenant', async () => {
      const cmd = new CreateInventoryItemCommand({
        tenantId,
        sku: 'DUP-SKU-01',
        name: 'Original Product',
        category: InventoryCategory.SUPPLEMENTS,
        unit: UnitOfMeasure.UNITS,
        actorId,
      });

      const firstRes = await createItemHandler.execute(cmd);
      expect(firstRes.isSuccess).toBe(true);

      const secondRes = await createItemHandler.execute(cmd);
      expect(secondRes.isSuccess).toBe(false);
      expect(secondRes.getError()).toContain('already exists');
    });
  });

  // ============================================================================
  // 2. STOCK PURCHASE (RECEIVE) INTEGRATION
  // ============================================================================
  describe('2. Stock Purchase (Receive) Integration', () => {
    it('receives stock, increases quantity, appends PURCHASE movement, and increments version atomically', async () => {
      // 1. Create item with 10 initial units
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'PO-TEST-01',
          name: 'Electrodes Gel Pack',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          initialStock: 10,
          purchaseCost: { amount: 5.0, currency: 'USD' },
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      // 2. Receive 15 units via purchase order
      const receiveCmd = new ReceiveStockCommand({
        tenantId,
        itemId,
        quantity: 15,
        unitCost: { amount: 5.5, currency: 'USD' },
        referenceId: 'PO-2026-AUG-101',
        reason: 'Vendor replenishment shipment',
        actorId,
      });

      const receiveRes = await receiveStockHandler.execute(receiveCmd);
      expect(receiveRes.isSuccess).toBe(true);

      const resData = receiveRes.getValue();
      expect(resData.item.quantityOnHand).toBe(25);
      expect(resData.item.version).toBe(2);
      expect(resData.movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(resData.movement.quantityDelta).toBe(15);
      expect(resData.movement.balanceAfter).toBe(25);
      expect(resData.movement.referenceId).toBe('PO-2026-AUG-101');

      // 3. Inspect persisted state
      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(25);
      expect(persisted?.version).toBe(2);
      expect(persisted?.movements).toHaveLength(2); // opening + purchase
    });
  });

  // ============================================================================
  // 3. RETAIL SALE & NEGATIVE STOCK PREVENTION INTEGRATION
  // ============================================================================
  describe('3. Retail Sale & Negative Stock Prevention Integration', () => {
    it('sells stock, decreases quantityOnHand, appends SALE movement, and tracks exact deduction to zero', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'SALE-TEST-01',
          name: 'Protein Shake 500ml',
          category: InventoryCategory.HEALTHY_DRINKS,
          initialStock: 10,
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      // 1. Partial sale of 6 units -> stock becomes 4
      const sale1Res = await sellStockHandler.execute(
        new SellStockCommand({
          tenantId,
          itemId,
          quantity: 6,
          referenceId: 'POS-REC-001',
          reason: 'Front desk retail sale',
          actorId,
        }),
      );
      expect(sale1Res.isSuccess).toBe(true);
      expect(sale1Res.getValue().item.quantityOnHand).toBe(4);
      expect(sale1Res.getValue().movement.quantityDelta).toBe(-6);

      // 2. Exact sale of remaining 4 units -> stock becomes 0
      const sale2Res = await sellStockHandler.execute(
        new SellStockCommand({
          tenantId,
          itemId,
          quantity: 4,
          referenceId: 'POS-REC-002',
          reason: 'Clearance sale',
          actorId,
        }),
      );
      expect(sale2Res.isSuccess).toBe(true);
      expect(sale2Res.getValue().item.quantityOnHand).toBe(0);

      // 3. Attempt overselling 1 unit when stock is 0 -> Rejected!
      const failedSaleRes = await sellStockHandler.execute(
        new SellStockCommand({
          tenantId,
          itemId,
          quantity: 1,
          referenceId: 'POS-REC-FAIL',
          reason: 'Oversell attempt',
          actorId,
        }),
      );
      expect(failedSaleRes.isSuccess).toBe(false);
      expect(failedSaleRes.getError()).toContain('Insufficient stock');

      // 4. Inspect persisted state: verify zero partial mutation & version unchanged
      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(0);
      expect(persisted?.isOutOfStock()).toBe(true);
      expect(persisted?.isLowStock()).toBe(true);
      expect(persisted?.version).toBe(3); // 1 (create) + 1 (sale 1) + 1 (sale 2)
      expect(persisted?.movements).toHaveLength(3); // opening + sale 1 + sale 2 (no orphan movement!)
    });
  });

  // ============================================================================
  // 4. CLINICAL & INTERNAL CONSUMPTION INTEGRATION
  // ============================================================================
  describe('4. Clinical & Internal Consumption Integration', () => {
    it('consumes stock during clinical treatment session and appends CONSUMPTION movement', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'CLIN-TAPE-01',
          name: 'Rigid Strapping Tape',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          initialStock: 20,
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      const consumeCmd = new ConsumeStockCommand({
        tenantId,
        itemId,
        quantity: 2,
        referenceId: 'sess_acl_rehab_909',
        reason: 'Applied patellar tendon support during therapy',
        actorId,
      });

      const result = await consumeStockHandler.execute(consumeCmd);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.item.quantityOnHand).toBe(18);
      expect(dto.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(dto.movement.quantityDelta).toBe(-2);
      expect(dto.movement.balanceAfter).toBe(18);
      expect(dto.movement.referenceId).toBe('sess_acl_rehab_909');

      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(18);
      expect(persisted?.version).toBe(2);
    });

    it('rejects consumption exceeding available stock without leaving partial mutation', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'CLIN-GEL-01',
          name: 'Ultrasound Gel 5L',
          initialStock: 1,
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      const failedConsume = await consumeStockHandler.execute(
        new ConsumeStockCommand({
          tenantId,
          itemId,
          quantity: 2,
          reason: 'Excessive consumption',
          actorId,
        }),
      );

      expect(failedConsume.isSuccess).toBe(false);
      expect(failedConsume.getError()).toContain('Insufficient stock');

      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(1);
      expect(persisted?.version).toBe(1);
      expect(persisted?.movements).toHaveLength(1);
    });
  });

  // ============================================================================
  // 5. INVENTORY ADJUSTMENT (IN, OUT, SIGNED, CORRECTION) INTEGRATION
  // ============================================================================
  describe('5. Inventory Adjustment & Correction Integration', () => {
    it('applies AdjustStockIn (+5) and AdjustStockOut (-3) with audit reasons', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'ADJ-TEST-01',
          name: 'Disinfectant Wipes',
          initialStock: 10,
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      // Adjust In +5
      const adjInRes = await adjustStockInHandler.execute(
        new AdjustStockInCommand({
          tenantId,
          itemId,
          quantity: 5,
          reason: 'Audit found 5 extra canisters',
          actorId,
        }),
      );
      expect(adjInRes.isSuccess).toBe(true);
      expect(adjInRes.getValue().item.quantityOnHand).toBe(15);
      expect(adjInRes.getValue().movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);

      // Adjust Out -3
      const adjOutRes = await adjustStockOutHandler.execute(
        new AdjustStockOutCommand({
          tenantId,
          itemId,
          quantity: 3,
          reason: 'Damaged packaging disposal',
          actorId,
        }),
      );
      expect(adjOutRes.isSuccess).toBe(true);
      expect(adjOutRes.getValue().item.quantityOnHand).toBe(12);
      expect(adjOutRes.getValue().movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);

      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(12);
      expect(persisted?.version).toBe(3);
    });

    it('applies CorrectStock to set absolute physical inventory count', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'CORRECT-TEST-01',
          name: 'Massage Lotion Bottles',
          initialStock: 18,
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      // Correct count from 18 to 22 (discrepancy +4)
      const correctRes = await correctStockHandler.execute(
        new CorrectStockCommand({
          tenantId,
          itemId,
          targetCount: 22,
          reason: 'Annual comprehensive physical inventory count',
          actorId,
        }),
      );

      expect(correctRes.isSuccess).toBe(true);
      expect(correctRes.getValue().item.quantityOnHand).toBe(22);
      expect(correctRes.getValue().movement.movementType).toBe(StockMovementType.CORRECTION);
      expect(correctRes.getValue().movement.quantityDelta).toBe(4);
      expect(correctRes.getValue().movement.balanceAfter).toBe(22);

      const persisted = await repository.findById(itemId);
      expect(persisted?.quantityOnHand.value).toBe(22);
    });
  });

  // ============================================================================
  // 6. MOVEMENT CONSISTENCY & RECONSTRUCTION MATRIX
  // ============================================================================
  describe('6. Movement Consistency & Ledger Reconciliation Proof', () => {
    it('proves persisted stock matches reconstructed ledger sum after 10 mixed operations', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RECON-LEDGER-01',
          name: 'Multi-Op Test Item',
          category: InventoryCategory.SUPPLEMENTS,
          initialStock: 50,
          purchaseCost: { amount: 10.0, currency: 'USD' },
          actorId,
        }),
      );
      const itemId = createRes.getValue().id;

      // Sequence of operations:
      // Initial: 50
      // 1. Receive +20 -> 70
      await receiveStockHandler.execute(
        new ReceiveStockCommand({ tenantId, itemId, quantity: 20, reason: 'PO 1', actorId }),
      );
      // 2. Sell -15 -> 55
      await sellStockHandler.execute(
        new SellStockCommand({ tenantId, itemId, quantity: 15, reason: 'Sale 1', actorId }),
      );
      // 3. Consume -5 -> 50
      await consumeStockHandler.execute(
        new ConsumeStockCommand({ tenantId, itemId, quantity: 5, reason: 'Use 1', actorId }),
      );
      // 4. Scrap -2 -> 48
      await scrapStockHandler.execute(
        new ScrapStockCommand({ tenantId, itemId, quantity: 2, reason: 'Damaged', actorId }),
      );
      // 5. AdjustIn +10 -> 58
      await adjustStockInHandler.execute(
        new AdjustStockInCommand({
          tenantId,
          itemId,
          quantity: 10,
          reason: 'Found stock',
          actorId,
        }),
      );
      // 6. AdjustOut -8 -> 50
      await adjustStockOutHandler.execute(
        new AdjustStockOutCommand({ tenantId, itemId, quantity: 8, reason: 'Shrinkage', actorId }),
      );
      // 7. Generic Adjust IN (+12) -> 62
      await adjustStockHandler.execute(
        new AdjustStockCommand({
          tenantId,
          itemId,
          type: 'ADJUSTMENT_IN',
          quantity: 12,
          reason: 'Audit delta',
          actorId,
        }),
      );
      // 8. Generic Adjust OUT (-7) -> 55
      await adjustStockHandler.execute(
        new AdjustStockCommand({
          tenantId,
          itemId,
          type: 'ADJUSTMENT_OUT',
          quantity: 7,
          reason: 'Audit correction',
          actorId,
        }),
      );
      // 9. Correct to 60 (delta +5) -> 60
      await correctStockHandler.execute(
        new CorrectStockCommand({
          tenantId,
          itemId,
          targetCount: 60,
          reason: 'Cycle count',
          actorId,
        }),
      );

      // Verify item query by ID returns the latest persisted state
      const itemQueryRes = await getItemByIdHandler.execute(
        new GetInventoryItemByIdQuery({ id: itemId, tenantId }),
      );
      expect(itemQueryRes.isSuccess).toBe(true);
      expect(itemQueryRes.getValue().quantityOnHand).toBe(60);

      const persisted = await repository.findById(itemId);
      expect(persisted).not.toBeNull();
      expect(persisted?.quantityOnHand.value).toBe(60);
      expect(persisted?.movements).toHaveLength(10); // 1 initial + 9 mutations

      // Authoritative Ledger Reconciliation:
      // Sum all movement deltas:
      let runningBalance = 0;
      for (const mov of persisted!.movements) {
        runningBalance = Math.round((runningBalance + mov.quantityDelta.value) * 100) / 100;
        expect(mov.balanceAfter.value).toBe(runningBalance);
      }

      expect(runningBalance).toBe(60);
      expect(persisted?.quantityOnHand.value).toBe(runningBalance);
    });
  });

  // ============================================================================
  // 7. LOW-STOCK PERSISTED QUERY INTEGRATION
  // ============================================================================
  describe('7. Low-Stock Persisted Query Integration', () => {
    it('correctly filters items across boundary states: above, equal, below, and zero stock', async () => {
      // 1. Above minimum (Stock 20, Min 10) -> NOT low stock
      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'STOCK-ABOVE',
          name: 'Healthy Stock Item',
          initialStock: 20,
          minimumStock: 10,
          actorId,
        }),
      );

      // 2. Exactly equal to minimum (Stock 10, Min 10) -> LOW STOCK
      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'STOCK-EQUAL',
          name: 'Boundary Stock Item',
          initialStock: 10,
          minimumStock: 10,
          actorId,
        }),
      );

      // 3. Below minimum (Stock 5, Min 10) -> LOW STOCK
      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'STOCK-BELOW',
          name: 'Depleted Stock Item',
          initialStock: 5,
          minimumStock: 10,
          actorId,
        }),
      );

      // 4. Zero stock (Stock 0, Min 10) -> LOW STOCK & OUT OF STOCK
      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'STOCK-ZERO',
          name: 'Zero Stock Item',
          initialStock: 0,
          minimumStock: 10,
          actorId,
        }),
      );

      const queryRes = await getLowStockHandler.execute(new GetLowStockItemsQuery({ tenantId }));

      expect(queryRes.isSuccess).toBe(true);
      const lowStockItems = queryRes.getValue().items;

      expect(lowStockItems).toHaveLength(3); // EQUAL, BELOW, ZERO
      const skus = lowStockItems.map((i) => i.sku);
      expect(skus).toContain('STOCK-EQUAL');
      expect(skus).toContain('STOCK-BELOW');
      expect(skus).toContain('STOCK-ZERO');
      expect(skus).not.toContain('STOCK-ABOVE');
    });
  });

  // ============================================================================
  // 8. INVENTORY VALUATION PERSISTED QUERY INTEGRATION
  // ============================================================================
  describe('8. Inventory Valuation Persisted Query Integration', () => {
    it('computes exact aggregate working capital valuation from persisted data', async () => {
      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'VAL-A',
          name: 'Product A',
          category: InventoryCategory.HEALTHY_DRINKS,
          initialStock: 100,
          purchaseCost: { amount: 2.5, currency: 'USD' }, // 100 * 2.50 = 250.00
          actorId,
        }),
      );

      await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'VAL-B',
          name: 'Product B',
          category: InventoryCategory.SUPPLEMENTS,
          initialStock: 20,
          purchaseCost: { amount: 35.0, currency: 'USD' }, // 20 * 35.00 = 700.00
          actorId,
        }),
      );

      const valRes = await getValuationHandler.execute(
        new GetInventoryValuationQuery({ tenantId }),
      );

      expect(valRes.isSuccess).toBe(true);
      const val = valRes.getValue();
      expect(val.totalValueAmount).toBe(950.0);
      expect(val.totalDistinctItems).toBe(2);
      expect(val.totalQuantityUnits).toBe(120);
      expect(val.breakdownByCategory[InventoryCategory.HEALTHY_DRINKS]?.totalValueAmount).toBe(
        250.0,
      );
      expect(val.breakdownByCategory[InventoryCategory.SUPPLEMENTS]?.totalValueAmount).toBe(700.0);
    });
  });
});
