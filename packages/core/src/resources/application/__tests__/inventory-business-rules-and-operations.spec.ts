import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { CreateInventoryItemHandler } from '../handlers/create-inventory-item.handler';
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { ReceiveStockHandler } from '../handlers/receive-stock.handler';
import { ReceiveStockCommand } from '../commands/receive-stock.command';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { SellStockCommand } from '../commands/sell-stock.command';
import { ConsumeStockHandler } from '../handlers/consume-stock.handler';
import { ConsumeStockCommand } from '../commands/consume-stock.command';
import { AdjustStockInHandler } from '../handlers/adjust-stock-in.handler';
import { AdjustStockInCommand } from '../commands/adjust-stock-in.command';
import { AdjustStockOutHandler } from '../handlers/adjust-stock-out.handler';
import { AdjustStockOutCommand } from '../commands/adjust-stock-out.command';
import { OptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';
import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * In-Memory Test Harness for InventoryItemRepository that simulates
 * ACID transactions, Optimistic Concurrency Control (OCC), and persistence constraints.
 */
class InMemoryInventoryItemRepository implements InventoryItemRepository {
  private readonly items = new Map<string, InventoryItem>();
  private readonly versions = new Map<string, number>();

  public async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    return this.cloneItem(item);
  }

  public async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const item of this.items.values()) {
      if (item.sku.value.toUpperCase() === sku.toUpperCase()) {
        if (!tenantId || item.tenantId === tenantId) {
          return this.cloneItem(item);
        }
      }
    }
    return null;
  }

  public async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let results = Array.from(this.items.values()).map((item) => this.cloneItem(item));
    if (filter?.tenantId) {
      results = results.filter((i) => i.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      results = results.filter((i) => i.category === filter.category);
    }
    if (filter?.status) {
      results = results.filter((i) => i.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (i) => i.name.toLowerCase().includes(q) || i.sku.value.toLowerCase().includes(q),
      );
    }
    return results;
  }

  public async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const items = await this.findMany(filter);
    return items.length;
  }

  public async save(item: InventoryItem): Promise<void> {
    const id = item.id.getValue();
    const currentPersistedVersion = this.versions.get(id) ?? 0;

    // OCC Check: item.version is incremented during aggregate mutation.
    // In persistence, the prior version must match the stored version.
    if (this.versions.has(id)) {
      const expectedPriorVersion = item.version - 1;
      if (expectedPriorVersion !== currentPersistedVersion) {
        throw new OptimisticLockException('InventoryItem', id, expectedPriorVersion);
      }
    }

    // Persistence Invariant: Quantity on hand can never be negative in DB
    if (item.quantityOnHand.value < 0) {
      throw new Error(
        `DB CHECK constraint violation: quantity_on_hand (${item.quantityOnHand.value}) < 0`,
      );
    }

    this.items.set(id, this.cloneItem(item));
    this.versions.set(id, item.version);
  }

  public async delete(id: string): Promise<void> {
    this.items.delete(id);
    this.versions.delete(id);
  }

  public async list(): Promise<InventoryItem[]> {
    return Array.from(this.items.values()).map((item) => this.cloneItem(item));
  }

  private cloneItem(item: InventoryItem): InventoryItem {
    return InventoryItem.reconstitute({
      id: item.id.getValue(),
      tenantId: item.tenantId,
      sku: item.sku.value,
      name: item.name,
      description: item.description,
      category: item.category,
      unit: item.unit,
      minimumStock: item.minimumStock.value,
      quantityOnHand: item.quantityOnHand.value,
      purchaseCost: item.purchaseCost.toJSON(),
      sellingPrice: item.sellingPrice.toJSON(),
      status: item.status,
      locationRef: item.locationRef?.getValue(),
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      movements: [...item.movements],
    });
  }
}

class MockEventPublisher implements ResourcesEventPublisherPort {
  public readonly publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Resources Management — Executable Business Rules & Operations Suite', () => {
  let repository: InMemoryInventoryItemRepository;
  let eventPublisher: MockEventPublisher;

  let createHandler: CreateInventoryItemHandler;
  let receiveHandler: ReceiveStockHandler;
  let sellHandler: SellStockHandler;
  let consumeHandler: ConsumeStockHandler;
  let adjustInHandler: AdjustStockInHandler;
  let adjustOutHandler: AdjustStockOutHandler;

  const ACTOR_CLINICIAN = 'usr_clinician_001';
  const ACTOR_CASHIER = 'usr_cashier_002';
  const ACTOR_MANAGER = 'usr_manager_003';

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
    eventPublisher = new MockEventPublisher();

    createHandler = new CreateInventoryItemHandler(repository, eventPublisher);
    receiveHandler = new ReceiveStockHandler(repository, eventPublisher);
    sellHandler = new SellStockHandler(repository, eventPublisher);
    consumeHandler = new ConsumeStockHandler(repository, eventPublisher);
    adjustInHandler = new AdjustStockInHandler(repository, eventPublisher);
    adjustOutHandler = new AdjustStockOutHandler(repository, eventPublisher);
  });

  // ==========================================================================
  // 1. PRODUCT RULES TEST MATRIX
  // ==========================================================================
  describe('1. Product Lifecycle & Invariants', () => {
    it('creates product with valid required fields and default invariants', async () => {
      const result = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'DRK-ELECTRO-001',
          name: 'Electrolyte Recovery Drink 500ml',
          description: 'Ready-to-drink citrus electrolyte hydration beverage.',
          category: InventoryCategory.HEALTHY_DRINKS,
          unit: UnitOfMeasure.BOTTLES,
          minimumStock: 10,
          initialStock: 24,
          purchaseCost: { amount: 1.5, currency: 'USD' },
          sellingPrice: { amount: 3.5, currency: 'USD' },
          actorId: ACTOR_MANAGER,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBeDefined();
      expect(dto.sku).toBe('DRK-ELECTRO-001');
      expect(dto.quantityOnHand).toBe(24.0);
      expect(dto.minimumStock).toBe(10.0);
      expect(dto.status).toBe(InventoryItemStatus.ACTIVE);
      expect(dto.purchaseCostAmount).toBe(1.5);
      expect(dto.sellingPriceAmount).toBe(3.5);
      expect(dto.unit).toBe(UnitOfMeasure.BOTTLES);
      expect(dto.category).toBe(InventoryCategory.HEALTHY_DRINKS);
    });

    it('rejects product creation when SKU or Name is missing or empty', async () => {
      const missingSku = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: '   ',
          name: 'Item without SKU',
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(missingSku.isFailure).toBe(true);
      expect(missingSku.getError()).toContain('SKU is required');

      const missingName = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'VALID-SKU',
          name: '',
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(missingName.isFailure).toBe(true);
      expect(missingName.getError()).toContain('Item name is required');
    });

    it('rejects duplicate SKU per tenant (Uniqueness Invariant)', async () => {
      await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'DUPLICATE-SKU',
          name: 'First Item',
          actorId: ACTOR_MANAGER,
        }),
      );

      const duplicateResult = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'DUPLICATE-SKU',
          name: 'Second Item with same SKU',
          actorId: ACTOR_MANAGER,
        }),
      );

      expect(duplicateResult.isFailure).toBe(true);
      expect(duplicateResult.getError()).toContain("SKU 'DUPLICATE-SKU' already exists");
    });

    it('rejects negative minimum stock or negative initial stock', async () => {
      const negMinStock = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'NEG-MIN-001',
          name: 'Negative Min Stock Item',
          minimumStock: -5,
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(negMinStock.isFailure).toBe(true);
      expect(negMinStock.getError()).toContain('Quantity cannot be negative');

      const negInitStock = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'NEG-INIT-001',
          name: 'Negative Initial Stock Item',
          initialStock: -10,
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(negInitStock.isFailure).toBe(true);
      expect(negInitStock.getError()).toContain('Quantity cannot be negative');
    });
  });

  // ==========================================================================
  // 2. MOVEMENT RULES & STOCK MUTATION OPERATIONS
  // ==========================================================================
  describe('2. Business Operations & Movement Semantics', () => {
    let itemId: string;

    beforeEach(async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'CLN-GEL-500ML',
          name: 'Diagnostic Ultrasound Gel 500ml',
          category: InventoryCategory.CLEANING_SUPPLIES,
          unit: UnitOfMeasure.BOTTLES,
          minimumStock: 5,
          initialStock: 10,
          purchaseCost: { amount: 12.0, currency: 'USD' },
          sellingPrice: { amount: 0.0, currency: 'USD' },
          actorId: ACTOR_MANAGER,
        }),
      );
      itemId = res.getValue().id;
    });

    it('PURCHASE: increases stock, records unit cost and vendor reference', async () => {
      const result = await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId,
          quantity: 20,
          unitCost: { amount: 11.5, currency: 'USD' },
          referenceId: 'PO-2026-9901',
          reason: 'Quarterly clinic restock from MedSupply Corp',
          actorId: ACTOR_MANAGER,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const { item, movement } = result.getValue();
      expect(item.quantityOnHand).toBe(30.0);
      expect(movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(movement.quantityDelta).toBe(20.0);
      expect(movement.balanceAfter).toBe(30.0);
      expect(movement.unitCostAmount).toBe(11.5);
      expect(movement.referenceId).toBe('PO-2026-9901');
      expect(movement.recordedByUserId).toBe(ACTOR_MANAGER);
    });

    it('SALE: decreases stock, enforces non-negative invariant and records sale price', async () => {
      // Create retail item
      const retailItem = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'MEAL-SALMON-01',
          name: 'Grilled Salmon Prep',
          category: InventoryCategory.HEALTHY_MEALS,
          unit: UnitOfMeasure.UNITS,
          initialStock: 15,
          purchaseCost: { amount: 7.0, currency: 'USD' },
          sellingPrice: { amount: 14.5, currency: 'USD' },
          actorId: ACTOR_MANAGER,
        }),
      );
      const retailId = retailItem.getValue().id;

      const result = await sellHandler.execute(
        new SellStockCommand({
          itemId: retailId,
          quantity: 3,
          sellingPrice: { amount: 14.5, currency: 'USD' },
          referenceId: 'POS-REC-48102',
          reason: 'Front desk meal purchase by gym member',
          actorId: ACTOR_CASHIER,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const { item, movement } = result.getValue();
      expect(item.quantityOnHand).toBe(12.0);
      expect(movement.movementType).toBe(StockMovementType.SALE);
      expect(movement.quantityDelta).toBe(-3.0);
      expect(movement.balanceAfter).toBe(12.0);
      expect(movement.unitCostAmount).toBe(7.0); // Cost of goods sold (purchaseCost)
      expect(movement.referenceId).toBe('POS-REC-48102');
      expect(movement.recordedByUserId).toBe(ACTOR_CASHIER);
    });

    it('CONSUMPTION: decreases stock for clinical treatment session', async () => {
      const result = await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          quantity: 2,
          referenceId: 'sess_treatment_7721',
          reason: 'Consumed during ultrasound therapy session',
          actorId: ACTOR_CLINICIAN,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const { item, movement } = result.getValue();
      expect(item.quantityOnHand).toBe(8.0);
      expect(movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(movement.quantityDelta).toBe(-2.0);
      expect(movement.balanceAfter).toBe(8.0);
      expect(movement.referenceId).toBe('sess_treatment_7721');
      expect(movement.recordedByUserId).toBe(ACTOR_CLINICIAN);
    });

    it('ADJUSTMENT_IN: increases stock due to audit surplus discovery', async () => {
      const result = await adjustInHandler.execute(
        new AdjustStockInCommand({
          itemId,
          quantity: 4,
          reason: 'Physical inventory count found 4 extra uncataloged bottles',
          actorId: ACTOR_MANAGER,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const { item, movement } = result.getValue();
      expect(item.quantityOnHand).toBe(14.0);
      expect(movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(movement.quantityDelta).toBe(4.0);
      expect(movement.balanceAfter).toBe(14.0);
      expect(movement.recordedByUserId).toBe(ACTOR_MANAGER);
    });

    it('ADJUSTMENT_OUT: decreases stock due to damage, shrinkage, or audit deficit', async () => {
      const result = await adjustOutHandler.execute(
        new AdjustStockOutCommand({
          itemId,
          quantity: 3,
          reason: 'Damaged bottles discarded after storage rack leak',
          actorId: ACTOR_MANAGER,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const { item, movement } = result.getValue();
      expect(item.quantityOnHand).toBe(7.0);
      expect(movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
      expect(movement.quantityDelta).toBe(-3.0);
      expect(movement.balanceAfter).toBe(7.0);
      expect(movement.recordedByUserId).toBe(ACTOR_MANAGER);
    });

    it('ZERO STOCK & INSUFFICIENT STOCK: prevents depletion beyond available balance', async () => {
      // Consume exact stock (10 -> 0)
      const exactConsume = await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          quantity: 10,
          reason: 'Complete clinic depletion',
          actorId: ACTOR_CLINICIAN,
        }),
      );
      expect(exactConsume.isSuccess).toBe(true);
      expect(exactConsume.getValue().item.quantityOnHand).toBe(0.0);

      // Attempting to consume 1 more item from 0 stock must fail
      const overConsume = await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          quantity: 1,
          reason: 'Attempting to consume from empty stock',
          actorId: ACTOR_CLINICIAN,
        }),
      );
      expect(overConsume.isFailure).toBe(true);
      expect(overConsume.getError()).toContain('Insufficient stock for item with SKU');

      // Attempting to sell from 0 stock must fail
      const overSell = await sellHandler.execute(
        new SellStockCommand({
          itemId,
          quantity: 0.5,
          reason: 'Attempting sale on empty stock',
          actorId: ACTOR_CASHIER,
        }),
      );
      expect(overSell.isFailure).toBe(true);
      expect(overSell.getError()).toContain('Insufficient stock for item with SKU');

      // Attempting adjustment out on empty stock must fail
      const overAdjustOut = await adjustOutHandler.execute(
        new AdjustStockOutCommand({
          itemId,
          quantity: 0.1,
          reason: 'Negative adjustment on empty stock',
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(overAdjustOut.isFailure).toBe(true);
      expect(overAdjustOut.getError()).toContain('Insufficient stock for item with SKU');
    });

    it('rejects mutations with non-positive quantities or invalid reasons', async () => {
      const zeroQty = await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId,
          quantity: 0,
          reason: 'Zero quantity receipt',
          actorId: ACTOR_MANAGER,
        }),
      );
      expect(zeroQty.isFailure).toBe(true);
      expect(zeroQty.getError()).toContain('Received quantity must be a positive number');

      const negQty = await sellHandler.execute(
        new SellStockCommand({
          itemId,
          quantity: -5,
          reason: 'Negative sale quantity',
          actorId: ACTOR_CASHIER,
        }),
      );
      expect(negQty.isFailure).toBe(true);
      expect(negQty.getError()).toContain('Sale quantity must be a positive number');

      const shortReason = await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          quantity: 1,
          reason: 'no',
          actorId: ACTOR_CLINICIAN,
        }),
      );
      expect(shortReason.isFailure).toBe(true);
      expect(shortReason.getError()).toContain('A valid reason (minimum 3 characters) is required');
    });
  });

  // ==========================================================================
  // 3. CONSISTENCY & TRANSACTION INTEGRITY
  // ==========================================================================
  describe('3. Consistency & Transaction Integrity', () => {
    it('failed mutation leaves aggregate completely unmutated with no phantom movement', async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'OFF-PAPER-A4',
          name: 'Office Copy Paper Ream',
          category: InventoryCategory.OFFICE_SUPPLIES,
          unit: UnitOfMeasure.BOXES,
          initialStock: 5,
          actorId: ACTOR_MANAGER,
        }),
      );
      const itemId = res.getValue().id;

      const initialItem = await repository.findById(itemId);
      const initialVersion = initialItem!.version;
      const initialMovementsCount = initialItem!.movements.length;

      // Attempt impossible overdraft mutation
      const failedResult = await sellHandler.execute(
        new SellStockCommand({
          itemId,
          quantity: 50, // Available is only 5
          reason: 'Impossible bulk sale',
          actorId: ACTOR_CASHIER,
        }),
      );

      expect(failedResult.isFailure).toBe(true);

      // Re-fetch persisted state to verify zero side-effects
      const persistedAfter = await repository.findById(itemId);
      expect(persistedAfter!.quantityOnHand.value).toBe(5.0);
      expect(persistedAfter!.version).toBe(initialVersion);
      expect(persistedAfter!.movements).toHaveLength(initialMovementsCount);
    });

    it('each successful mutation creates exactly one corresponding movement and increments version by 1', async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'SUPP-MAG-01',
          name: 'Magnesium Citrate Powder 200g',
          category: InventoryCategory.SUPPLEMENTS,
          unit: UnitOfMeasure.GRAMS,
          initialStock: 1000,
          actorId: ACTOR_MANAGER,
        }),
      );
      const itemId = res.getValue().id;

      // Mutation 1: Sale of 200g
      await sellHandler.execute(
        new SellStockCommand({
          itemId,
          quantity: 200,
          reason: 'Retail sale to athlete',
          actorId: ACTOR_CASHIER,
        }),
      );

      // Mutation 2: Consumption of 50g
      await consumeHandler.execute(
        new ConsumeStockCommand({
          itemId,
          quantity: 50,
          reason: 'Clinical dose during rehab',
          actorId: ACTOR_CLINICIAN,
        }),
      );

      // Mutation 3: Restock receipt of 500g
      await receiveHandler.execute(
        new ReceiveStockCommand({
          itemId,
          quantity: 500,
          reason: 'Batch restock',
          actorId: ACTOR_MANAGER,
        }),
      );

      const persisted = await repository.findById(itemId);
      expect(persisted!.quantityOnHand.value).toBe(1250.0);
      // Movements: 1 initial (since initialStock > 0) + 3 operations = 4
      expect(persisted!.movements).toHaveLength(4);
      expect(persisted!.version).toBe(4);
    });
  });

  // ==========================================================================
  // 4. CONCURRENCY & OCC RACE CONDITIONS
  // ==========================================================================
  describe('4. Concurrency Verification & Race Conditions', () => {
    it('handles competing sales: first succeeds, second fails gracefully with OCC conflict or insufficient stock', async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'DRK-RECOVERY-02',
          name: 'Hydration Sparkling Water',
          initialStock: 5,
          actorId: ACTOR_MANAGER,
        }),
      );
      const itemId = res.getValue().id;

      // Simulate 2 competing checkout registers loading the exact same initial state concurrently
      const register1Item = await repository.findById(itemId);
      const register2Item = await repository.findById(itemId);

      expect(register1Item!.version).toBe(1);
      expect(register2Item!.version).toBe(1);

      // Register 1 sells 4 items
      register1Item!.sellStock({
        quantity: 4,
        reason: 'Register 1 sale',
        actorId: 'usr_cashier_1',
      });
      await repository.save(register1Item!);

      // Register 2 attempts to sell 3 items based on stale snapshot (5 items available)
      register2Item!.sellStock({
        quantity: 3,
        reason: 'Register 2 sale',
        actorId: 'usr_cashier_2',
      });

      // Saving Register 2 must throw OCC OptimisticLockException because version 1 has already been committed to version 2
      await expect(repository.save(register2Item!)).rejects.toThrow(OptimisticLockException);

      // The final persisted state must reflect exactly Register 1's commit (balance = 1.0)
      const finalState = await repository.findById(itemId);
      expect(finalState!.quantityOnHand.value).toBe(1.0);
      expect(finalState!.version).toBe(2);
    });

    it('handles sale vs consumption race condition correctly', async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'CLN-TAPE-01',
          name: 'Kinesio Tex Tape Gold',
          initialStock: 10,
          actorId: ACTOR_MANAGER,
        }),
      );
      const itemId = res.getValue().id;

      // Clinician and Front Desk both read current stock = 10
      const clinicianItem = await repository.findById(itemId);
      const frontDeskItem = await repository.findById(itemId);

      // Clinician commits consumption of 6 rolls
      clinicianItem!.consumeStock({
        quantity: 6,
        reason: 'Applied to 3 athletes',
        actorId: ACTOR_CLINICIAN,
      });
      await repository.save(clinicianItem!);

      // Front desk attempts to sell 8 rolls using stale version
      frontDeskItem!.sellStock({
        quantity: 8,
        reason: 'Bulk purchase',
        actorId: ACTOR_CASHIER,
      });
      await expect(repository.save(frontDeskItem!)).rejects.toThrow(OptimisticLockException);

      // Persisted balance remains 4.0
      const state = await repository.findById(itemId);
      expect(state!.quantityOnHand.value).toBe(4.0);
    });
  });

  // ==========================================================================
  // 5. PROPERTY / INVARIANT TESTING
  // ==========================================================================
  describe('5. Mathematical Invariant Verification', () => {
    it('satisfies Fundamental Invariant: QOH >= 0 and QOH = initialStock + sum(quantityDelta)', async () => {
      const initialQuantity = 100.0;

      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'INV-MATH-TEST-01',
          name: 'Precision Invariant Verification Item',
          category: InventoryCategory.CLEANING_SUPPLIES,
          unit: UnitOfMeasure.UNITS,
          initialStock: initialQuantity,
          actorId: ACTOR_MANAGER,
        }),
      );
      const itemId = res.getValue().id;

      // Execute a deterministic series of 10 sequential mutations
      const mutations = [
        { type: 'RECEIVE', qty: 25.5 },
        { type: 'SELL', qty: 14.25 },
        { type: 'CONSUME', qty: 5.75 },
        { type: 'ADJUST_IN', qty: 10.0 },
        { type: 'ADJUST_OUT', qty: 3.5 },
        { type: 'SELL', qty: 30.0 },
        { type: 'CONSUME', qty: 12.0 },
        { type: 'RECEIVE', qty: 50.0 },
        { type: 'ADJUST_OUT', qty: 20.0 },
        { type: 'SELL', qty: 20.0 },
      ];

      for (const m of mutations) {
        if (m.type === 'RECEIVE') {
          await receiveHandler.execute(
            new ReceiveStockCommand({
              itemId,
              quantity: m.qty,
              reason: 'Test receipt',
              actorId: ACTOR_MANAGER,
            }),
          );
        } else if (m.type === 'SELL') {
          await sellHandler.execute(
            new SellStockCommand({
              itemId,
              quantity: m.qty,
              reason: 'Test sale',
              actorId: ACTOR_CASHIER,
            }),
          );
        } else if (m.type === 'CONSUME') {
          await consumeHandler.execute(
            new ConsumeStockCommand({
              itemId,
              quantity: m.qty,
              reason: 'Test consume',
              actorId: ACTOR_CLINICIAN,
            }),
          );
        } else if (m.type === 'ADJUST_IN') {
          await adjustInHandler.execute(
            new AdjustStockInCommand({
              itemId,
              quantity: m.qty,
              reason: 'Test adjust in',
              actorId: ACTOR_MANAGER,
            }),
          );
        } else if (m.type === 'ADJUST_OUT') {
          await adjustOutHandler.execute(
            new AdjustStockOutCommand({
              itemId,
              quantity: m.qty,
              reason: 'Test adjust out',
              actorId: ACTOR_MANAGER,
            }),
          );
        }
      }

      const item = await repository.findById(itemId);
      expect(item).not.toBeNull();

      // 1. Current stock >= 0
      expect(item!.quantityOnHand.value).toBeGreaterThanOrEqual(0);

      // 2. Sum of effective movement quantities
      const sumDeltas = item!.movements.reduce((sum, mov) => sum + mov.quantityDelta.value, 0);

      // Mathematical Identity: Current Stock === Initial Stock (which is the first movement) + subsequent deltas
      expect(Math.round(sumDeltas * 100) / 100).toBe(item!.quantityOnHand.value);

      // Exact calculated verification:
      // 100 + 25.5 - 14.25 - 5.75 + 10.0 - 3.5 - 30.0 - 12.0 + 50.0 - 20.0 - 20.0 = 80.0
      expect(item!.quantityOnHand.value).toBe(80.0);
      expect(item!.movements).toHaveLength(11); // 1 initial + 10 mutations
    });
  });
});
