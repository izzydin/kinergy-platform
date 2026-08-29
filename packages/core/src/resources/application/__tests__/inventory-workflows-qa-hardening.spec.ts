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
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { CreateInventoryItemHandler } from '../handlers/create-inventory-item.handler';
import { UpdateInventoryItemHandler } from '../handlers/update-inventory-item.handler';
import { ArchiveInventoryItemHandler } from '../handlers/archive-inventory-item.handler';
import { DeactivateInventoryItemHandler } from '../handlers/deactivate-inventory-item.handler';
import { ActivateInventoryItemHandler } from '../handlers/activate-inventory-item.handler';
import { GetInventoryItemByIdHandler } from '../handlers/get-inventory-item-by-id.handler';
import { ListInventoryItemsHandler } from '../handlers/list-inventory-items.handler';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { AdjustStockHandler } from '../handlers/adjust-stock.handler';
import { GetStockLevelHandler } from '../handlers/get-stock-level.handler';
import { ListStockMovementsHandler } from '../handlers/list-stock-movements.handler';
import { GetLowStockItemsHandler } from '../handlers/get-low-stock-items.handler';
import { GetInventoryValuationHandler } from '../handlers/get-inventory-valuation.handler';
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { UpdateInventoryItemCommand } from '../commands/update-inventory-item.command';
import { ArchiveInventoryItemCommand } from '../commands/archive-inventory-item.command';
import { DeactivateInventoryItemCommand } from '../commands/deactivate-inventory-item.command';
import { ActivateInventoryItemCommand } from '../commands/activate-inventory-item.command';
import { GetInventoryItemByIdQuery } from '../queries/get-inventory-item-by-id.query';
import { ListInventoryItemsQuery } from '../queries/list-inventory-items.query';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { AdjustStockCommand } from '../commands/adjust-stock.command';
import { GetStockLevelQuery } from '../queries/get-stock-level.query';
import { ListStockMovementsQuery } from '../queries/list-stock-movements.query';
import { GetLowStockItemsQuery } from '../queries/get-low-stock-items.query';
import { GetInventoryValuationQuery } from '../queries/get-inventory-valuation.query';
import { InventoryOptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';

// Mock Event Publisher
class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

// In-Memory Repository with OCC Concurrency Control
class ConcurrencySafeInventoryRepository implements InventoryItemRepository {
  public store = new Map<string, { item: InventoryItem; version: number }>();
  public simulateNetworkDelayMs = 0;
  public failOnSave = false;

  async findById(id: string): Promise<InventoryItem | null> {
    if (this.simulateNetworkDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateNetworkDelayMs));
    }
    const entry = this.store.get(id);
    return entry ? this.clone(entry.item) : null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const entry of this.store.values()) {
      if (entry.item.sku.value === sku && (!tenantId || entry.item.tenantId === tenantId)) {
        return this.clone(entry.item);
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    if (this.failOnSave) {
      throw new Error('Database transaction abort simulated.');
    }

    if (this.simulateNetworkDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateNetworkDelayMs));
    }

    const id = item.id.getValue();
    const existing = this.store.get(id);

    if (!existing) {
      // Create new record
      this.store.set(id, { item: this.clone(item), version: item.version });
      return;
    }

    // Optimistic Concurrency Control (OCC) Check:
    // When aggregate version is incremented (e.g. from v1 to v2), prior version must match store version (v1).
    const priorVersion = item.version - 1;
    if (existing.version !== priorVersion) {
      throw new InventoryOptimisticLockException('InventoryItem', id, priorVersion);
    }

    this.store.set(id, { item: this.clone(item), version: item.version });
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let all = Array.from(this.store.values()).map((e) => this.clone(e.item));

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
    const list = await this.findMany({ ...filter, limit: undefined, offset: undefined });
    return list.length;
  }

  async findMovements(filter?: FindStockMovementsFilter): Promise<StockMovement[]> {
    let allMovements: StockMovement[] = [];
    for (const entry of this.store.values()) {
      if (filter?.tenantId && entry.item.tenantId !== filter.tenantId) {
        continue;
      }
      if (filter?.itemId && entry.item.id.getValue() !== filter.itemId) {
        continue;
      }
      allMovements.push(...entry.item.movements);
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
    this.store.delete(id);
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

describe('Consumable Inventory Application Layer QA Hardening & Workflows (Phase 6.5)', () => {
  let repository: ConcurrencySafeInventoryRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_production';
  const actorId = 'usr_qa_principal_01';

  beforeEach(() => {
    repository = new ConcurrencySafeInventoryRepository();
    publisher = new MockEventPublisher();
  });

  // ==========================================
  // 1. PRODUCT LIFECYCLE WORKFLOWS
  // ==========================================
  describe('1. Product Lifecycle Matrix', () => {
    it('creates product deterministically and initializes stock with a movement when initialStock > 0', async () => {
      const handler = new CreateInventoryItemHandler(repository, publisher);
      const cmd = new CreateInventoryItemCommand({
        tenantId,
        sku: 'CLIN-TAPE-001',
        name: 'Elastic Therapeutic Tape Roll 5m',
        description: 'Water-resistant kinesiology taping supply',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.UNITS,
        minimumStock: 10,
        initialStock: 25,
        purchaseCost: { amount: 8.5, currency: 'USD' },
        sellingPrice: { amount: 16.0, currency: 'USD' },
        actorId,
      });

      const res = await handler.execute(cmd);
      expect(res.isSuccess).toBe(true);
      expect(res.value.sku).toBe('CLIN-TAPE-001');
      expect(res.value.quantityOnHand).toBe(25);
      expect(res.value.status).toBe('ACTIVE');

      // Check movements in repository
      const movements = await repository.findMovements({ itemId: res.value.id });
      expect(movements.length).toBe(1);
      expect(movements[0]?.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(movements[0]?.quantityDelta.value).toBe(25);
      expect(movements[0]?.balanceAfter.value).toBe(25);
    });

    it('rejects duplicate SKU creation collision within the same tenant', async () => {
      const handler = new CreateInventoryItemHandler(repository, publisher);
      await handler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'DUPLICATE-SKU-01',
          name: 'Original Item',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          unit: UnitOfMeasure.UNITS,
          actorId,
        }),
      );

      const collisionRes = await handler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'DUPLICATE-SKU-01',
          name: 'Colliding Item',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          unit: UnitOfMeasure.UNITS,
          actorId,
        }),
      );

      expect(collisionRes.isFailure).toBe(true);
      expect(collisionRes.error).toContain('already exists');
    });

    it('updates catalog metadata without allowing stock balance tampering', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'SHAKE-VAN-01',
          name: 'Vanilla Protein Shake 330ml',
          category: InventoryCategory.HEALTHY_DRINKS,
          unit: UnitOfMeasure.BOTTLES,
          initialStock: 15,
          minimumStock: 5,
          purchaseCost: { amount: 2.2, currency: 'USD' },
          sellingPrice: { amount: 4.5, currency: 'USD' },
          actorId,
        }),
      );

      const updateHandler = new UpdateInventoryItemHandler(repository, publisher);
      const updateRes = await updateHandler.execute(
        new UpdateInventoryItemCommand({
          id: created.value.id,
          tenantId,
          actorId,
          name: 'Organic Vanilla Protein Shake 330ml',
          sellingPrice: { amount: 5.0, currency: 'USD' },
          minimumStock: 8,
        }),
      );

      expect(updateRes.isSuccess).toBe(true);
      expect(updateRes.value.name).toBe('Organic Vanilla Protein Shake 330ml');
      expect(updateRes.value.sellingPriceAmount).toBe(5.0);
      expect(updateRes.value.minimumStock).toBe(8);
      // Stock balance remains unaffected at 15
      expect(updateRes.value.quantityOnHand).toBe(15);
    });

    it('handles deactivation and reactivation workflows seamlessly', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'DEACT-ITEM-01',
          name: 'Seasonal Drink',
          category: InventoryCategory.HEALTHY_DRINKS,
          unit: UnitOfMeasure.BOTTLES,
          initialStock: 5,
          actorId,
        }),
      );

      const deactHandler = new DeactivateInventoryItemHandler(repository, publisher);
      const deactRes = await deactHandler.execute(
        new DeactivateInventoryItemCommand({
          id: created.value.id,
          tenantId,
          actorId,
          reason: 'Out of season supply',
        }),
      );
      expect(deactRes.isSuccess).toBe(true);
      expect(deactRes.value.status).toBe('INACTIVE');

      const actHandler = new ActivateInventoryItemHandler(repository, publisher);
      const actRes = await actHandler.execute(
        new ActivateInventoryItemCommand({
          id: created.value.id,
          tenantId,
          actorId,
        }),
      );
      expect(actRes.isSuccess).toBe(true);
      expect(actRes.value.status).toBe('ACTIVE');
    });

    it('retrieves products by ID and lists with multi-dimensional filtering', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'GET-TEST-01',
          name: 'Electrolyte Hydration Pack',
          category: InventoryCategory.HEALTHY_DRINKS,
          unit: UnitOfMeasure.BOXES,
          initialStock: 10,
          actorId,
        }),
      );

      const getHandler = new GetInventoryItemByIdHandler(repository);
      const getRes = await getHandler.execute(
        new GetInventoryItemByIdQuery({ id: created.value.id, tenantId }),
      );
      expect(getRes.isSuccess).toBe(true);
      expect(getRes.value.sku).toBe('GET-TEST-01');

      const listHandler = new ListInventoryItemsHandler(repository);
      const listRes = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId,
          filter: { category: InventoryCategory.HEALTHY_DRINKS, limit: 10, page: 1 },
        }),
      );
      expect(listRes.isSuccess).toBe(true);
      expect(listRes.value.total).toBe(1);
      expect(listRes.value.items[0]?.sku).toBe('GET-TEST-01');
    });

    it('archives active product only when stock is 0 and blocks future mutations', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'ARCHIVE-ITEM-01',
          name: 'Discontinued Rehab Ball',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 2,
          actorId,
        }),
      );

      const archiveHandler = new ArchiveInventoryItemHandler(repository, publisher);

      // Attempt archive with remaining stock (2 > 0) -> rejected by invariant [INV-4]
      const failArchive = await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: created.value.id,
          tenantId,
          actorId,
          reason: 'Attempt archive with stock',
        }),
      );
      expect(failArchive.isFailure).toBe(true);
      expect(failArchive.error).toContain('Cannot archive');

      // Sell the 2 units to reach 0 stock
      const sellHandler = new SellStockHandler(repository, publisher);
      await sellHandler.execute(
        new SellStockCommand({
          itemId: created.value.id,
          quantity: 2,
          reason: 'Deplete before archiving',
          actorId,
          tenantId,
        }),
      );

      // Now archiving succeeds
      const successArchive = await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: created.value.id,
          tenantId,
          actorId,
          reason: 'Catalog line discontinued',
        }),
      );
      expect(successArchive.isSuccess).toBe(true);
      expect(successArchive.value.status).toBe('ARCHIVED');

      // Post-archive stock mutation attempts are strictly rejected
      const postArchiveMutation = await sellHandler.execute(
        new SellStockCommand({
          itemId: created.value.id,
          quantity: 1,
          reason: 'Illegal post archive sale',
          actorId,
          tenantId,
        }),
      );
      expect(postArchiveMutation.isFailure).toBe(true);
      expect(postArchiveMutation.error).toContain('ARCHIVED');
    });
  });

  // ==========================================
  // 2. STOCK WORKFLOW & ATOMICITY TESTS
  // ==========================================
  describe('2. Stock Operations & Ledger Atomicity Matrix', () => {
    let itemId: string;

    beforeEach(async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'FLOW-GLOVE-M',
          name: 'Nitrile Exam Gloves Medium Box 100',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          unit: UnitOfMeasure.BOXES,
          initialStock: 10,
          minimumStock: 5,
          purchaseCost: { amount: 12.0, currency: 'USD' },
          sellingPrice: { amount: 22.0, currency: 'USD' },
          actorId,
        }),
      );
      itemId = created.value.id;
    });

    it('Purchase (ReceiveStock) increases balance, records unit cost, and appends PURCHASE movement', async () => {
      const handler = new ReceiveStockHandler(repository, publisher);
      const res = await handler.execute(
        new ReceiveStockCommand({
          itemId,
          tenantId,
          quantity: 15,
          unitCost: { amount: 11.5, currency: 'USD' },
          reason: 'Quarterly supplier restock',
          referenceId: 'PO-2026-9901',
          actorId: 'usr_buyer_01',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.item.quantityOnHand).toBe(25);
      expect(res.value.movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(res.value.movement.quantityDelta).toBe(15);
      expect(res.value.movement.balanceAfter).toBe(25);
      expect(res.value.movement.unitCostAmount).toBe(11.5);
      expect(res.value.movement.recordedByUserId).toBe('usr_buyer_01');
      expect(res.value.movement.referenceId).toBe('PO-2026-9901');
    });

    it('Sale (SellStock) decreases balance, allows exact depletion to 0, and rejects insufficient stock', async () => {
      const handler = new SellStockHandler(repository, publisher);

      // Exact depletion from 10 to 0
      const exactDepletion = await handler.execute(
        new SellStockCommand({
          itemId,
          tenantId,
          quantity: 10,
          sellingPrice: { amount: 24.0, currency: 'USD' },
          reason: 'Bulk client purchase',
          referenceId: 'POS-REC-4412',
          actorId: 'usr_cashier_01',
        }),
      );

      expect(exactDepletion.isSuccess).toBe(true);
      expect(exactDepletion.value.item.quantityOnHand).toBe(0);
      expect(exactDepletion.value.movement.balanceAfter).toBe(0);
      expect(exactDepletion.value.movement.movementType).toBe(StockMovementType.SALE);

      // Subsequent sale attempt on 0 balance fails
      const overdrawAttempt = await handler.execute(
        new SellStockCommand({
          itemId,
          tenantId,
          quantity: 1,
          reason: 'Overdraw attempt',
          actorId: 'usr_cashier_01',
        }),
      );

      expect(overdrawAttempt.isFailure).toBe(true);
      expect(overdrawAttempt.error).toContain('Insufficient stock');

      // Verify repository balance remains strictly 0
      const item = await repository.findById(itemId);
      expect(item?.quantityOnHand.value).toBe(0);
    });

    it('Consumption (ConsumeStock) decreases balance and retains internal usage reason and clinician actor', async () => {
      const handler = new ConsumeStockHandler(repository, publisher);
      const res = await handler.execute(
        new ConsumeStockCommand({
          itemId,
          tenantId,
          quantity: 4,
          reason: 'Acupuncture therapy treatment consumption',
          referenceId: 'SESSION-TX-8831',
          actorId: 'usr_clinician_02',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.item.quantityOnHand).toBe(6);
      expect(res.value.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(res.value.movement.quantityDelta).toBe(-4);
      expect(res.value.movement.balanceAfter).toBe(6);
      expect(res.value.movement.recordedByUserId).toBe('usr_clinician_02');
    });

    it('AdjustStock handles inbound/outbound adjustments with mandatory justification', async () => {
      const handler = new AdjustStockHandler(repository, publisher);

      // Inbound adjustment
      const inRes = await handler.execute(
        new AdjustStockCommand({
          itemId,
          tenantId,
          type: 'ADJUSTMENT_IN',
          quantity: 3,
          reason: 'Found 3 unopened boxes during physical audit',
          actorId: 'usr_auditor_01',
        }),
      );
      expect(inRes.isSuccess).toBe(true);
      expect(inRes.value.item.quantityOnHand).toBe(13);
      expect(inRes.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);

      // Outbound adjustment (e.g. damaged stock)
      const outRes = await handler.execute(
        new AdjustStockCommand({
          itemId,
          tenantId,
          type: 'ADJUSTMENT_OUT',
          quantity: 2,
          reason: 'Water damaged packaging in storage closet',
          actorId: 'usr_auditor_01',
        }),
      );
      expect(outRes.isSuccess).toBe(true);
      expect(outRes.value.item.quantityOnHand).toBe(11);
      expect(outRes.value.movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);

      // Missing/short reason is strictly rejected
      const invalidReasonRes = await handler.execute(
        new AdjustStockCommand({
          itemId,
          tenantId,
          type: 'ADJUSTMENT_OUT',
          quantity: 1,
          reason: '  ',
          actorId: 'usr_auditor_01',
        }),
      );
      expect(invalidReasonRes.isFailure).toBe(true);
      expect(invalidReasonRes.error).toContain('minimum 3 characters');
    });

    it('queries stock level and lists movement log accurately', async () => {
      const levelHandler = new GetStockLevelHandler(repository);
      const levelRes = await levelHandler.execute(new GetStockLevelQuery({ itemId, tenantId }));
      expect(levelRes.isSuccess).toBe(true);
      expect(levelRes.value.quantityOnHand).toBe(10);

      const moveHandler = new ListStockMovementsHandler(repository);
      const moveRes = await moveHandler.execute(
        new ListStockMovementsQuery({ itemId, tenantId, page: 1, pageSize: 10 }),
      );
      expect(moveRes.isSuccess).toBe(true);
      expect(moveRes.value.total).toBe(1);
    });
  });

  // ==========================================
  // 3. CONCURRENCY & RACE CONDITION PROOFS
  // ==========================================
  describe('3. Concurrency Strategy & Race Condition Resistance', () => {
    it('prevents double-spend overdraw: competing operations cannot both consume stock beyond initial quantity', async () => {
      // Initial Stock: 10
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'CONC-FOAM-ROLLER',
          name: 'High Density Foam Roller',
          category: InventoryCategory.RETAIL_PRODUCTS,
          unit: UnitOfMeasure.UNITS,
          initialStock: 10,
          minimumStock: 2,
          actorId,
        }),
      );
      const itemId = created.value.id;

      // Enable simulateNetworkDelay to ensure race overlap
      repository.simulateNetworkDelayMs = 5;

      const sellHandler = new SellStockHandler(repository, publisher);
      const consumeHandler = new ConsumeStockHandler(repository, publisher);

      // Operation A attempts sale of 7 units
      const opA = sellHandler.execute(
        new SellStockCommand({
          itemId,
          tenantId,
          quantity: 7,
          reason: 'Concurrent sale worker A',
          actorId: 'worker_A',
        }),
      );

      // Operation B attempts consumption of 7 units concurrently
      const opB = consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          tenantId,
          quantity: 7,
          reason: 'Concurrent consumption worker B',
          actorId: 'worker_B',
        }),
      );

      const [resA, resB] = await Promise.all([opA, opB]);

      // Exactly one operation must succeed (reducing stock from 10 to 3)
      // The other must fail with an OCC conflict or insufficient stock.
      const successfulOps = [resA, resB].filter((r) => r.isSuccess);
      const failedOps = [resA, resB].filter((r) => r.isFailure);

      expect(successfulOps.length).toBe(1);
      expect(failedOps.length).toBe(1);

      // The failing operation must state an OCC conflict or insufficient stock
      expect(
        failedOps[0]?.error?.includes('Optimistic lock conflict') ||
          failedOps[0]?.error?.includes('Insufficient stock') ||
          failedOps[0]?.error?.includes('Cannot decrement'),
      ).toBe(true);

      // The resulting stock in the repository must be strictly 3 (10 - 7 = 3), NEVER -4.00!
      const finalItem = await repository.findById(itemId);
      expect(finalItem?.quantityOnHand.value).toBe(3);

      // Movements ledger must have exactly 2 entries (Initial Count + the winning operation)
      const movements = await repository.findMovements({ itemId });
      expect(movements.length).toBe(2);
      // Latest movement (descending order) must reflect balance 3
      expect(movements[0]?.balanceAfter.value).toBe(3);
    });

    it('rolls back completely on simulated database abort, preventing phantom movements or desynchronization', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'ABORT-TEST-01',
          name: 'Abort Item',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 10,
          actorId,
        }),
      );
      const itemId = created.value.id;

      // Simulate mid-transaction persistence error
      repository.failOnSave = true;

      const sellHandler = new SellStockHandler(repository, publisher);
      const failRes = await sellHandler.execute(
        new SellStockCommand({
          itemId,
          tenantId,
          quantity: 5,
          reason: 'Failed transaction',
          actorId,
        }),
      );

      expect(failRes.isFailure).toBe(true);

      // Reset failure flag and inspect database state
      repository.failOnSave = false;
      const reloaded = await repository.findById(itemId);

      // Stock remains exactly 10.00
      expect(reloaded?.quantityOnHand.value).toBe(10);
      // No extra movement row was persisted
      const movements = await repository.findMovements({ itemId });
      expect(movements.length).toBe(1); // Only initial count
    });
  });

  // ==========================================
  // 4. LOW STOCK & INVENTORY VALUE QA
  // ==========================================
  describe('4. Low-Stock Reorder Triggers & Exact Decimal Valuation', () => {
    it('verifies low stock triggers for equal (==), below (<), and zero stock (== 0)', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);

      // Surplus: 20 > 5
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'SURPLUS-ITEM',
          name: 'Surplus Rolls',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 20,
          minimumStock: 5,
          actorId,
        }),
      );

      // Equal: 5 == 5 (Low Stock)
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'EQUAL-MIN-ITEM',
          name: 'Threshold Item',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 5,
          minimumStock: 5,
          actorId,
        }),
      );

      // Below: 2 < 10 (Low Stock)
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'BELOW-MIN-ITEM',
          name: 'Below Threshold Item',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 2,
          minimumStock: 10,
          actorId,
        }),
      );

      // Zero Stock: 0 <= 5 (Low Stock)
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'ZERO-STOCK-ITEM',
          name: 'Out of Stock Item',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 0,
          minimumStock: 5,
          actorId,
        }),
      );

      const lowStockHandler = new GetLowStockItemsHandler(repository);
      const res = await lowStockHandler.execute(new GetLowStockItemsQuery({ tenantId }));

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(3);
      const skus = res.value.items.map((i) => i.sku);
      expect(skus).toContain('EQUAL-MIN-ITEM');
      expect(skus).toContain('BELOW-MIN-ITEM');
      expect(skus).toContain('ZERO-STOCK-ITEM');
      expect(skus).not.toContain('SURPLUS-ITEM');
    });

    it('computes exact asset valuation in Scale 2 fixed cents without float accumulation drift', async () => {
      const createHandler = new CreateInventoryItemHandler(repository, publisher);

      // 15 units * $19.99 = $299.85
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'PROT-POWDER-01',
          name: 'Protein Powder Chocolate 1kg',
          category: InventoryCategory.SUPPLEMENTS,
          unit: UnitOfMeasure.UNITS,
          initialStock: 15,
          minimumStock: 3,
          purchaseCost: { amount: 19.99, currency: 'USD' },
          sellingPrice: { amount: 39.99, currency: 'USD' },
          actorId,
        }),
      );

      // 8.5 units * $7.30 = $62.05
      await createHandler.execute(
        new CreateInventoryItemCommand({
          tenantId,
          sku: 'REHAB-BAND-01',
          name: 'Resistance Band Heavy',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          unit: UnitOfMeasure.UNITS,
          initialStock: 8.5,
          minimumStock: 2,
          purchaseCost: { amount: 7.3, currency: 'USD' },
          sellingPrice: { amount: 15.0, currency: 'USD' },
          actorId,
        }),
      );

      const valuationHandler = new GetInventoryValuationHandler(repository);
      const res = await valuationHandler.execute(new GetInventoryValuationQuery({ tenantId }));

      expect(res.isSuccess).toBe(true);
      // Expected total: 299.85 + 62.05 = 361.90
      expect(res.value.totalValueAmount).toBe(361.9);
      expect(res.value.totalQuantityUnits).toBe(23.5);
      expect(res.value.totalDistinctItems).toBe(2);

      // Category breakdowns
      expect(res.value.breakdownByCategory[InventoryCategory.SUPPLEMENTS]?.totalValueAmount).toBe(
        299.85,
      );
      expect(
        res.value.breakdownByCategory[InventoryCategory.THERAPY_CONSUMABLES]?.totalValueAmount,
      ).toBe(62.05);
    });
  });
});
