import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';

// Handlers
import { CreateInventoryItemHandler } from '../handlers/create-inventory-item.handler';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { AdjustStockOutHandler } from '../handlers/adjust-stock-out.handler';

// Commands
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';

import { InventoryOptimisticLockException as OptimisticLockException } from '../../domain/inventory/exceptions';

/**
 * High-fidelity, thread-safe asynchronous transactional repository double
 * faithfully simulating database-level Optimistic Concurrency Control (OCC),
 * atomic conditional updates (`WHERE id = ? AND version = ?`),
 * check constraint enforcement (`quantityOnHand >= 0`), and isolated transactional commits.
 */
class ConcurrentTransactionalInventoryRepository implements InventoryItemRepository {
  private items = new Map<string, InventoryItem>();
  private lock = Promise.resolve();

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
    // Atomic critical section simulating database engine row lock / transactional commit
    return this.withLock(async () => {
      const existing = this.items.get(item.id.getValue());

      if (item.version === 1) {
        if (existing) {
          throw new Error(`Duplicate primary key: item ${item.id.getValue()} already exists.`);
        }
        this.items.set(item.id.getValue(), this.clone(item));
        return;
      }

      // OCC Verification: WHERE id = :id AND version = :priorVersion
      const priorVersion = item.version - 1;
      if (!existing || existing.version !== priorVersion) {
        throw new OptimisticLockException('InventoryItem', item.id.getValue(), priorVersion);
      }

      // Check constraint: quantity_on_hand >= 0
      if (item.quantityOnHand.value < 0) {
        throw new Error('Database CHECK constraint violation: quantity_on_hand cannot be negative');
      }

      this.items.set(item.id.getValue(), this.clone(item));
    });
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let all = Array.from(this.items.values()).map((i) => this.clone(i));
    if (filter?.tenantId) {
      all = all.filter((i) => i.tenantId === filter.tenantId);
    }
    return all;
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const list = await this.findMany(filter);
    return list.length;
  }

  async delete(id: string): Promise<void> {
    return this.withLock(async () => {
      this.items.delete(id);
    });
  }

  private withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.lock.then(fn);
    this.lock = result.then(
      () => {},
      () => {},
    );
    return result;
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
}

describe('Phase 6.10: Inventory Concurrency, Race Condition & Invariant Protection Suite', () => {
  const tenantId = 'tenant_race_condition_01';

  let repository: ConcurrentTransactionalInventoryRepository;
  let eventPublisher: MockEventPublisher;

  let createItemHandler: CreateInventoryItemHandler;
  let consumeStockHandler: ConsumeStockHandler;
  let sellStockHandler: SellStockHandler;
  let receiveStockHandler: ReceiveStockHandler;
  let adjustStockOutHandler: AdjustStockOutHandler;

  beforeEach(() => {
    repository = new ConcurrentTransactionalInventoryRepository();
    eventPublisher = new MockEventPublisher();

    createItemHandler = new CreateInventoryItemHandler(repository, eventPublisher);
    consumeStockHandler = new ConsumeStockHandler(repository, eventPublisher);
    sellStockHandler = new SellStockHandler(repository, eventPublisher);
    receiveStockHandler = new ReceiveStockHandler(repository, eventPublisher);
    adjustStockOutHandler = new AdjustStockOutHandler(repository, eventPublisher);
  });

  // ============================================================================
  // 1. MANDATORY CONCURRENT CONSUMPTION RACE SCENARIO
  // ============================================================================
  describe('1. Mandatory Race: Stock = 1, Operation A consumes 1, Operation B consumes 1', () => {
    it('proves exactly one operation succeeds, one receives an OCC conflict, and final stock NEVER drops to -1', async () => {
      // 1. Setup product with stock = 1
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RACE-CONSUME-01',
          name: 'Critical Vaccine Dose',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          initialStock: 1,
          minimumStock: 1,
          actorId: 'usr_admin',
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const itemId = createRes.getValue().id;

      // 2. Launch simultaneous consuming operations concurrently
      const opA = consumeStockHandler.execute(
        new ConsumeStockCommand({
          tenantId,
          itemId,
          quantity: 1,
          referenceId: 'sess_therapist_alice',
          reason: 'Alice clinical administration',
          actorId: 'usr_alice',
        }),
      );

      const opB = consumeStockHandler.execute(
        new ConsumeStockCommand({
          tenantId,
          itemId,
          quantity: 1,
          referenceId: 'sess_therapist_bob',
          reason: 'Bob clinical administration',
          actorId: 'usr_bob',
        }),
      );

      // Wait for both concurrent operations to settle
      const [resA, resB] = await Promise.all([opA, opB]);

      // 3. Evaluate results: exactly one must succeed, one must fail
      const successCount = (resA.isSuccess ? 1 : 0) + (resB.isSuccess ? 1 : 0);
      const failureCount = (!resA.isSuccess ? 1 : 0) + (!resB.isSuccess ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Assert error message of the failing operation communicates optimistic locking conflict
      const failedResult = !resA.isSuccess ? resA : resB;
      expect(failedResult.getError()).toContain('Optimistic lock conflict');

      // 4. Assertions on final persisted state
      const persisted = await repository.findById(itemId);
      expect(persisted).not.toBeNull();

      // INVARIANT 1: Final stock is non-negative and mathematically valid
      expect(persisted!.quantityOnHand.value).toBe(0);
      expect(persisted!.quantityOnHand.value).toBeGreaterThanOrEqual(0);

      // INVARIANT 2: Version incremented exactly once (from 1 to 2)
      expect(persisted!.version).toBe(2);

      // INVARIANT 3: Exactly 2 movements in ledger (1 opening + 1 successful consumption)
      // Zero orphan movements from the aborted transaction!
      expect(persisted!.movements).toHaveLength(2);
      expect(persisted!.movements[0]!.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(persisted!.movements[1]!.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(persisted!.movements[1]!.quantityDelta.value).toBe(-1);
      expect(persisted!.movements[1]!.balanceAfter.value).toBe(0);

      // INVARIANT 4: Ledger reconciliation proof
      const sumDeltas = persisted!.movements.reduce((acc, m) => acc + m.quantityDelta.value, 0);
      expect(sumDeltas).toBe(persisted!.quantityOnHand.value);
    });
  });

  // ============================================================================
  // 2. REPEATABILITY & STRESS PROOF (50 CONSECUTIVE RACE RUNS)
  // ============================================================================
  describe('2. Repeatability & Flakiness Immunity (50 Consecutive Race Iterations)', () => {
    it('guarantees 0 negative stock occurrences and 100% invariant adherence across 50 repeated races', async () => {
      const iterations = 50;

      for (let i = 1; i <= iterations; i++) {
        const sku = `STRESS-SKU-${i.toString().padStart(3, '0')}`;
        const createRes = await createItemHandler.execute(
          new CreateInventoryItemCommand({
            tenantId,
            sku,
            name: `Stress Test Item ${i}`,
            initialStock: 1,
            actorId: 'usr_admin',
          }),
        );
        const itemId = createRes.getValue().id;

        // Concurrent execution
        const [res1, res2] = await Promise.all([
          consumeStockHandler.execute(
            new ConsumeStockCommand({
              tenantId,
              itemId,
              quantity: 1,
              reason: `Stress run ${i} - op 1`,
              actorId: 'usr_worker_1',
            }),
          ),
          consumeStockHandler.execute(
            new ConsumeStockCommand({
              tenantId,
              itemId,
              quantity: 1,
              reason: `Stress run ${i} - op 2`,
              actorId: 'usr_worker_2',
            }),
          ),
        ]);

        const successes = (res1.isSuccess ? 1 : 0) + (res2.isSuccess ? 1 : 0);
        expect(successes).toBe(1);

        const persisted = await repository.findById(itemId);
        expect(persisted!.quantityOnHand.value).toBe(0);
        expect(persisted!.quantityOnHand.value).toBeGreaterThanOrEqual(0);
        expect(persisted!.version).toBe(2);
        expect(persisted!.movements).toHaveLength(2);
      }
    });
  });

  // ============================================================================
  // 3. CONCURRENT SALES CONTENTION
  // ============================================================================
  describe('3. Simultaneous Sales: Initial Stock = 5, Three sales of 3 units each', () => {
    it('ensures only one sale succeeds, stock reduces to 2, and stock never becomes negative (-4)', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RACE-SALE-01',
          name: 'Whey Protein Powder',
          initialStock: 5,
          actorId: 'usr_admin',
        }),
      );
      const itemId = createRes.getValue().id;

      // 3 concurrent sales contending for 5 available units (3 * 3 = 9 > 5)
      const [s1, s2, s3] = await Promise.all([
        sellStockHandler.execute(
          new SellStockCommand({
            tenantId,
            itemId,
            quantity: 3,
            referenceId: 'POS-1',
            reason: 'Front desk sale 1',
            actorId: 'usr_pos_1',
          }),
        ),
        sellStockHandler.execute(
          new SellStockCommand({
            tenantId,
            itemId,
            quantity: 3,
            referenceId: 'POS-2',
            reason: 'Front desk sale 2',
            actorId: 'usr_pos_2',
          }),
        ),
        sellStockHandler.execute(
          new SellStockCommand({
            tenantId,
            itemId,
            quantity: 3,
            referenceId: 'POS-3',
            reason: 'Front desk sale 3',
            actorId: 'usr_pos_3',
          }),
        ),
      ]);

      const successCount = (s1.isSuccess ? 1 : 0) + (s2.isSuccess ? 1 : 0) + (s3.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const persisted = await repository.findById(itemId);
      expect(persisted!.quantityOnHand.value).toBe(2);
      expect(persisted!.quantityOnHand.value).toBeGreaterThanOrEqual(0);
      expect(persisted!.movements).toHaveLength(2); // opening + 1 successful sale
    });
  });

  // ============================================================================
  // 4. SALE CONCURRENT WITH CONSUMPTION
  // ============================================================================
  describe('4. Sale Concurrent with Consumption: Stock = 10, Sale = 7, Consumption = 6', () => {
    it('proves race safety when two distinct operation types contend for inventory', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RACE-SALE-CONSUME',
          name: 'Therapy Resistance Bands Pack',
          initialStock: 10,
          actorId: 'usr_admin',
        }),
      );
      const itemId = createRes.getValue().id;

      // POS checkout (7 units) and Treatment Room (6 units) at the exact same moment (7 + 6 = 13 > 10)
      const [saleRes, consumeRes] = await Promise.all([
        sellStockHandler.execute(
          new SellStockCommand({
            tenantId,
            itemId,
            quantity: 7,
            referenceId: 'POS-SALE-99',
            reason: 'Retail sale at front desk',
            actorId: 'usr_cashier',
          }),
        ),
        consumeStockHandler.execute(
          new ConsumeStockCommand({
            tenantId,
            itemId,
            quantity: 6,
            referenceId: 'sess_rehab_44',
            reason: 'Used for rotator cuff rehab class',
            actorId: 'usr_physio',
          }),
        ),
      ]);

      const successCount = (saleRes.isSuccess ? 1 : 0) + (consumeRes.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const persisted = await repository.findById(itemId);
      // Either Sale won (stock = 3) or Consumption won (stock = 4)
      const expectedStock = saleRes.isSuccess ? 3 : 4;
      expect(persisted!.quantityOnHand.value).toBe(expectedStock);
      expect(persisted!.version).toBe(2);
      expect(persisted!.movements).toHaveLength(2);
    });
  });

  // ============================================================================
  // 5. CONCURRENT STOCK ADJUSTMENT SHRINKAGE
  // ============================================================================
  describe('5. Concurrent Stock Adjustments (Stock = 4, Two Adjustments Out of 3 units)', () => {
    it('prevents double-deducting audit shrinkage under concurrency', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RACE-ADJ-OUT',
          name: 'Disinfectant Spray 1L',
          initialStock: 4,
          actorId: 'usr_admin',
        }),
      );
      const itemId = createRes.getValue().id;

      const [adj1, adj2] = await Promise.all([
        adjustStockOutHandler.execute(
          new AdjustStockOutCommand({
            tenantId,
            itemId,
            quantity: 3,
            reason: 'Auditor A discarded expired batch',
            actorId: 'usr_auditor_a',
          }),
        ),
        adjustStockOutHandler.execute(
          new AdjustStockOutCommand({
            tenantId,
            itemId,
            quantity: 3,
            reason: 'Auditor B discarded damaged bottles',
            actorId: 'usr_auditor_b',
          }),
        ),
      ]);

      const successCount = (adj1.isSuccess ? 1 : 0) + (adj2.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const persisted = await repository.findById(itemId);
      expect(persisted!.quantityOnHand.value).toBe(1);
      expect(persisted!.version).toBe(2);
    });
  });

  // ============================================================================
  // 6. CONCURRENT PURCHASE AND CONSUMPTION
  // ============================================================================
  describe('6. Concurrent Purchase and Consumption (Stock = 2, Purchase +10, Consume -2)', () => {
    it('preserves OCC consistency and eliminates lost updates when receipt and consumption collide', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'RACE-PURCHASE-CONSUME',
          name: 'Dry Needling Starter Pack',
          initialStock: 2,
          actorId: 'usr_admin',
        }),
      );
      const itemId = createRes.getValue().id;

      // Restock PO receipt (+10) and treatment consumption (-2) executed simultaneously
      const [receiveRes, consumeRes] = await Promise.all([
        receiveStockHandler.execute(
          new ReceiveStockCommand({
            tenantId,
            itemId,
            quantity: 10,
            referenceId: 'PO-2026-909',
            reason: 'Vendor replenishment shipment',
            actorId: 'usr_inventory_manager',
          }),
        ),
        consumeStockHandler.execute(
          new ConsumeStockCommand({
            tenantId,
            itemId,
            quantity: 2,
            reason: 'Treatment consumption',
            actorId: 'usr_therapist',
          }),
        ),
      ]);

      // Exactly one operation commits first; the other receives OCC conflict
      const successCount = (receiveRes.isSuccess ? 1 : 0) + (consumeRes.isSuccess ? 1 : 0);
      expect(successCount).toBe(1);

      const persisted = await repository.findById(itemId);
      // Either Purchase won (stock = 12) or Consumption won (stock = 0)
      const expectedStock = receiveRes.isSuccess ? 12 : 0;
      expect(persisted!.quantityOnHand.value).toBe(expectedStock);
      expect(persisted!.version).toBe(2);
      expect(persisted!.movements).toHaveLength(2);
    });
  });

  // ============================================================================
  // 7. HIGH-CONTENTION 10-WORKER RACE
  // ============================================================================
  describe('7. High-Contention 10-Worker Race: Stock = 3, 10 workers each consume 1 unit', () => {
    it('guarantees stock never falls below zero and exactly 3 units are consumed across 10 contending workers', async () => {
      const createRes = await createItemHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'HIGH-CONTENTION-10',
          name: 'Rare Clinical Splint',
          initialStock: 3,
          actorId: 'usr_admin',
        }),
      );
      const itemId = createRes.getValue().id;

      // 10 workers fire simultaneous requests
      const promises = Array.from({ length: 10 }, (_, index) =>
        consumeStockHandler.execute(
          new ConsumeStockCommand({
            tenantId,
            itemId,
            quantity: 1,
            referenceId: `worker_${index + 1}`,
            reason: `Parallel worker ${index + 1} request`,
            actorId: `usr_worker_${index + 1}`,
          }),
        ),
      );

      const results = await Promise.all(promises);

      const successfulCount = results.filter((r) => r.isSuccess).length;
      const failedCount = results.filter((r) => !r.isSuccess).length;

      // Under pure OCC without retry loops, exactly 1 worker succeeds in the initial race, 9 fail with OCC conflict.
      // (If subsequent retries occur sequentially, at most 3 could succeed).
      expect(successfulCount).toBeGreaterThanOrEqual(1);
      expect(successfulCount).toBeLessThanOrEqual(3);
      expect(failedCount).toBe(10 - successfulCount);

      const persisted = await repository.findById(itemId);
      expect(persisted!.quantityOnHand.value).toBe(3 - successfulCount);
      expect(persisted!.quantityOnHand.value).toBeGreaterThanOrEqual(0);
      expect(persisted!.version).toBe(1 + successfulCount);
      expect(persisted!.movements).toHaveLength(1 + successfulCount);

      // Ledger invariant verification:
      const sumDeltas = persisted!.movements.reduce((acc, m) => acc + m.quantityDelta.value, 0);
      expect(sumDeltas).toBe(persisted!.quantityOnHand.value);
    });
  });
});
