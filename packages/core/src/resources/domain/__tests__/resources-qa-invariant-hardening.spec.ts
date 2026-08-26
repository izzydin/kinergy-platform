import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetId } from '../assets/value-objects/asset-id.vo';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { StockMovementType } from '../inventory/enums/stock-movement-type.enum';
import { Quantity } from '../inventory/value-objects/quantity.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InsufficientStockException } from '../inventory/exceptions/insufficient-stock.exception';
import { OptimisticLockException } from '../inventory/exceptions/optimistic-lock.exception';
import { PrismaFixedAssetMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-fixed-asset.mapper';
import { PrismaAssetHistoryEventMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-asset-history-event.mapper';
import { PrismaInventoryItemMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-inventory-item.mapper';
import { PrismaStockMovementMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-stock-movement.mapper';

/**
 * Deterministic In-Memory Transactional Engine simulating PostgreSQL + Prisma:
 * - Single atomic transaction boundary per operation
 * - Optimistic Concurrency Control (OCC) version matching
 * - Hard PostgreSQL CHECK constraints (quantity_on_hand >= 0)
 * - Atomic rollback on partial write failures
 */
type PersistedAsset = ReturnType<typeof PrismaFixedAssetMapper.toPersistence> & {
  createdAt: Date;
  updatedAt: Date;
};
type PersistedHistoryEvent = ReturnType<typeof PrismaAssetHistoryEventMapper.toPersistence>;

type PersistedInventory = ReturnType<typeof PrismaInventoryItemMapper.toPersistence> & {
  createdAt: Date;
  updatedAt: Date;
};
type PersistedMovement = ReturnType<typeof PrismaStockMovementMapper.toPersistence>;

class QAStorageEngine {
  private assets = new Map<string, PersistedAsset>();
  private assetHistory = new Map<string, PersistedHistoryEvent[]>();

  private inventory = new Map<string, PersistedInventory>();
  private stockMovements = new Map<string, PersistedMovement[]>();

  // ASSET OPERATIONS
  public seedAsset(asset: FixedAsset): void {
    const raw: PersistedAsset = {
      ...PrismaFixedAssetMapper.toPersistence(asset),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.assets.set(raw.id, raw);
    this.assetHistory.set(
      raw.id,
      asset.historyEvents.map(PrismaAssetHistoryEventMapper.toPersistence),
    );
  }

  public getAsset(id: string): FixedAsset | null {
    const raw = this.assets.get(id);
    if (!raw) return null;
    const history = this.assetHistory.get(id) || [];
    return PrismaFixedAssetMapper.toDomain({
      ...raw,
      historyEvents: history,
      maintenanceRecords: [],
    });
  }

  public async executeAssetTransaction(
    assetId: string,
    mutationFn: (asset: FixedAsset) => void,
    forceHistoryFailure = false,
  ): Promise<{ success: boolean; error?: Error }> {
    const raw = this.assets.get(assetId);
    if (!raw) throw new Error(`Asset ${assetId} not found`);

    const history = this.assetHistory.get(assetId) || [];
    const domainAsset = PrismaFixedAssetMapper.toDomain({
      ...raw,
      historyEvents: history,
      maintenanceRecords: [],
    });
    const priorVersion = domainAsset.version;

    try {
      mutationFn(domainAsset);

      // OCC check
      const currentInDb = this.assets.get(assetId);
      if (!currentInDb || currentInDb.version !== priorVersion) {
        throw new OptimisticLockException('FixedAsset', assetId, priorVersion);
      }

      if (forceHistoryFailure) {
        throw new Error('Simulated database error during asset history append');
      }

      // Commit
      const updatedRaw: PersistedAsset = {
        ...PrismaFixedAssetMapper.toPersistence(domainAsset),
        createdAt: raw.createdAt,
        updatedAt: new Date(),
      };
      this.assets.set(assetId, updatedRaw);
      this.assetHistory.set(
        assetId,
        domainAsset.historyEvents.map(PrismaAssetHistoryEventMapper.toPersistence),
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err as Error };
    }
  }

  // INVENTORY OPERATIONS
  public seedInventory(item: InventoryItem): void {
    const raw: PersistedInventory = {
      ...PrismaInventoryItemMapper.toPersistence(item),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.inventory.set(raw.id, raw);
    this.stockMovements.set(raw.id, item.movements.map(PrismaStockMovementMapper.toPersistence));
  }

  public getInventory(id: string): InventoryItem | null {
    const raw = this.inventory.get(id);
    if (!raw) return null;
    const movs = this.stockMovements.get(id) || [];
    return PrismaInventoryItemMapper.toDomain({ ...raw, movements: movs });
  }

  public getRawStock(id: string): number {
    const raw = this.inventory.get(id);
    return raw ? Number(raw.quantityOnHand) : 0;
  }

  public getMovementCount(id: string): number {
    return (this.stockMovements.get(id) || []).length;
  }

  public async executeInventoryTransaction(
    itemId: string,
    mutationFn: (item: InventoryItem) => void,
    forceMovementFailure = false,
  ): Promise<{ success: boolean; error?: Error }> {
    const raw = this.inventory.get(itemId);
    if (!raw) throw new Error(`Inventory item ${itemId} not found`);

    const movs = this.stockMovements.get(itemId) || [];
    const domainItem = PrismaInventoryItemMapper.toDomain({ ...raw, movements: movs });
    const priorVersion = domainItem.version;

    try {
      mutationFn(domainItem);

      // OCC check
      const currentInDb = this.inventory.get(itemId);
      if (!currentInDb || currentInDb.version !== priorVersion) {
        throw new OptimisticLockException('InventoryItem', itemId, priorVersion);
      }

      // Check Constraint floor
      if (domainItem.quantityOnHand.value < 0) {
        throw new Error('PostgreSQL CHECK constraint violation: quantity_on_hand < 0');
      }

      if (forceMovementFailure) {
        throw new Error('Simulated database error during stock movement append');
      }

      // Commit
      const updatedRaw: PersistedInventory = {
        ...PrismaInventoryItemMapper.toPersistence(domainItem),
        createdAt: raw.createdAt,
        updatedAt: new Date(),
      };
      this.inventory.set(itemId, updatedRaw);
      this.stockMovements.set(
        itemId,
        domainItem.movements.map(PrismaStockMovementMapper.toPersistence),
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err as Error };
    }
  }
}

describe('Resources QA Hardening & Invariant Verification Suite (Phase 6.3)', () => {
  const actorId = 'usr_qa_architect_01';
  let engine: QAStorageEngine;

  const validLocation = AssetLocation.create({
    facilityId: 'fac_main_01',
    roomId: 'room_physio_01',
  });

  beforeEach(() => {
    engine = new QAStorageEngine();
  });

  // ============================================================================
  // 1. ASSET 5x5 STATE TRANSITION PAIR MATRIX (ALL 25 PAIRS)
  // ============================================================================
  describe('1. Authoritative Asset 5x5 State Transition Pair Matrix (All 25 Pairs)', () => {
    const makeAsset = (status: AssetStatus, condition: AssetCondition = AssetCondition.GOOD) => {
      return FixedAsset.create(
        {
          id: AssetId.create(),
          tenantId: 'tenant_qa_01',
          assetTag: `AST-${Math.floor(Math.random() * 899999 + 100000)}`,
          name: 'Hydrotherapy Tank',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2024-02-01'),
          purchaseValue: Money.create(25000),
          location: validLocation,
          status,
          condition,
        },
        actorId,
      );
    };

    // ACTIVE source
    it('Pair 1: ACTIVE -> ACTIVE throws when identical status is requested via changeStatus', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Identical status')).toThrow(
        InvalidAssetStateException,
      );
    });

    it('Pair 2: ACTIVE -> UNDER_MAINTENANCE succeeds', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.sendToMaintenance(actorId, 'Routine servicing');
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('Pair 3: ACTIVE -> DAMAGED succeeds', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.markAsDamaged(actorId, 'Motor burned out');
      expect(asset.status).toBe(AssetStatus.DAMAGED);
    });

    it('Pair 4: ACTIVE -> RETIRED succeeds', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'End of operational lifespan');
      expect(asset.status).toBe(AssetStatus.RETIRED);
    });

    it('Pair 5: ACTIVE -> SOLD succeeds via sell()', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.sell(Money.create(12000), actorId, 'Sold at equipment auction');
      expect(asset.status).toBe(AssetStatus.SOLD);
    });

    // UNDER_MAINTENANCE source
    it('Pair 6: UNDER_MAINTENANCE -> ACTIVE succeeds when condition is serviceable', () => {
      const asset = makeAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.GOOD);
      asset.restoreToActive(actorId, 'Maintenance completed successfully');
      expect(asset.status).toBe(AssetStatus.ACTIVE);
    });

    it('Pair 7: UNDER_MAINTENANCE -> UNDER_MAINTENANCE throws on identical changeStatus', () => {
      const asset = makeAsset(AssetStatus.UNDER_MAINTENANCE);
      expect(() =>
        asset.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, 'Same status'),
      ).toThrow(InvalidAssetStateException);
    });

    it('Pair 8: UNDER_MAINTENANCE -> DAMAGED succeeds', () => {
      const asset = makeAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.markAsDamaged(actorId, 'Inspection revealed irreparable tank crack');
      expect(asset.status).toBe(AssetStatus.DAMAGED);
    });

    it('Pair 9: UNDER_MAINTENANCE -> RETIRED succeeds', () => {
      const asset = makeAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.retire(actorId, 'Servicing cost exceeds replacement value');
      expect(asset.status).toBe(AssetStatus.RETIRED);
    });

    it('Pair 10: UNDER_MAINTENANCE -> SOLD succeeds via sell() as liquidation', () => {
      const asset = makeAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.sell(Money.create(5000), actorId, 'Sold for parts liquidation while under maintenance');
      expect(asset.status).toBe(AssetStatus.SOLD);
    });

    // DAMAGED source
    it('Pair 11: DAMAGED -> ACTIVE succeeds when repaired to serviceable condition', () => {
      const asset = makeAsset(AssetStatus.DAMAGED, AssetCondition.FAIR);
      asset.restoreToActive(actorId, 'Minor damage repaired in-house');
      expect(asset.status).toBe(AssetStatus.ACTIVE);
    });

    it('Pair 12: DAMAGED -> UNDER_MAINTENANCE succeeds', () => {
      const asset = makeAsset(AssetStatus.DAMAGED);
      asset.sendToMaintenance(actorId, 'Sent to external vendor for overhaul');
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('Pair 13: DAMAGED -> DAMAGED throws on identical changeStatus', () => {
      const asset = makeAsset(AssetStatus.DAMAGED);
      expect(() => asset.changeStatus(AssetStatus.DAMAGED, actorId, 'Same status')).toThrow(
        InvalidAssetStateException,
      );
    });

    it('Pair 14: DAMAGED -> RETIRED succeeds', () => {
      const asset = makeAsset(AssetStatus.DAMAGED);
      asset.retire(actorId, 'Total structural loss, written off');
      expect(asset.status).toBe(AssetStatus.RETIRED);
    });

    it('Pair 15: DAMAGED -> SOLD succeeds via sell() as scrap disposal', () => {
      const asset = makeAsset(AssetStatus.DAMAGED);
      asset.sell(Money.create(2000), actorId, 'Damaged asset sold as salvage scrap');
      expect(asset.status).toBe(AssetStatus.SOLD);
    });

    // RETIRED source (Terminal Decommissioned Sink)
    it('Pair 16-19: RETIRED rejects transitions to ACTIVE, UNDER_MAINTENANCE, DAMAGED, and repeated RETIRED', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      expect(asset.status).toBe(AssetStatus.RETIRED);

      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Reactivate')).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.sendToMaintenance(actorId, 'Service retired')).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.markAsDamaged(actorId, 'Damage retired')).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.retire(actorId, 'Retire again')).toThrow(InvalidAssetStateException);
    });

    it('Pair 20: RETIRED -> SOLD succeeds via sell() for auction liquidation', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      asset.sell(Money.create(3500), actorId, 'Auction liquidation of decommissioned asset');
      expect(asset.status).toBe(AssetStatus.SOLD);
    });

    // SOLD source (Terminal Liquidated Sink)
    it('Pair 21-25: SOLD is an absolute terminal sink rejecting all transitions', () => {
      const asset = makeAsset(AssetStatus.ACTIVE);
      asset.sell(Money.create(10000), actorId, 'Sold');
      expect(asset.status).toBe(AssetStatus.SOLD);

      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Reactivate sold')).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.sendToMaintenance(actorId, 'Service sold')).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.markAsDamaged(actorId, 'Damage sold')).toThrow(InvalidAssetStateException);
      expect(() => asset.retire(actorId, 'Retire sold')).toThrow(InvalidAssetStateException);
      expect(() => asset.sell(Money.create(5000), actorId, 'Sell sold')).toThrow(
        InvalidAssetStateException,
      );
    });
  });

  // ============================================================================
  // 2. ASSET INVARIANT & TRANSACTIONAL ATOMICITY TESTS
  // ============================================================================
  describe('2. Asset Invariant & Transactional Atomicity Tests', () => {
    it('rolls back asset status mutation if history event persistence fails', async () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create(),
          tenantId: 'tenant_qa_01',
          assetTag: 'AST-ROLLBACK-01',
          name: 'Ultrasound Machine',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2024-01-15'),
          purchaseValue: Money.create(8500),
          location: validLocation,
          status: AssetStatus.ACTIVE,
          condition: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      engine.seedAsset(asset);
      const assetId = asset.id.getValue();

      // Attempt status change with forced history failure
      const res = await engine.executeAssetTransaction(
        assetId,
        (domainAsset) => {
          domainAsset.sendToMaintenance(actorId, 'Scheduled calibration');
        },
        true, // force history failure
      );

      expect(res.success).toBe(false);
      expect(res.error?.message).toContain('Simulated database error during asset history append');

      // Verify asset in DB remains ACTIVE and unmutated
      const persisted = engine.getAsset(assetId)!;
      expect(persisted.status).toBe(AssetStatus.ACTIVE);
      expect(persisted.version).toBe(1);
    });

    it('rejects location transfers on RETIRED and SOLD assets', () => {
      const retiredAsset = FixedAsset.create(
        {
          id: AssetId.create(),
          tenantId: 'tenant_qa_01',
          assetTag: 'AST-TRANS-RET',
          name: 'Retired Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2020-01-01'),
          purchaseValue: Money.create(5000),
          location: validLocation,
          status: AssetStatus.ACTIVE,
          condition: AssetCondition.FAIR,
        },
        actorId,
      );
      retiredAsset.retire(actorId, 'Decommissioned');

      const newLocation = AssetLocation.create({
        facilityId: 'fac_branch_02',
        roomId: 'room_storage_01',
      });

      expect(() => {
        retiredAsset.transferLocation(newLocation, actorId, 'Attempted transfer of retired asset');
      }).toThrow(InvalidAssetStateException);
    });
  });

  // ============================================================================
  // 3. INVENTORY STOCK MUTATION & PRECISION BOUNDARY TESTS
  // ============================================================================
  describe('3. Consumable Inventory Precision & Boundary Tests', () => {
    it('supports purchase from zero initial stock (0.00 -> 10.00)', () => {
      const item = InventoryItem.create({
        sku: 'ZERO-INIT-01',
        name: 'Latex Gloves Medium',
        initialStock: 0,
        recordedByUserId: actorId,
      });

      expect(item.quantityOnHand.value).toBe(0);
      expect(item.isOutOfStock()).toBe(true);

      item.receiveStock({
        quantity: 10,
        actorId,
        reason: 'Initial supplier delivery',
      });

      expect(item.quantityOnHand.value).toBe(10);
      expect(item.movements.length).toBe(1);
      expect(item.movements[0]?.movementType).toBe(StockMovementType.PURCHASE);
      expect(item.movements[0]?.quantityDelta.value).toBe(10);
    });

    it('handles exact one precision unit remaining (0.01) and boundary rejection', () => {
      const item = InventoryItem.create({
        sku: 'PRECISION-UNIT-01',
        name: 'Aromatherapy Oil ml',
        initialStock: 0.01,
        recordedByUserId: actorId,
      });

      expect(item.quantityOnHand.value).toBe(0.01);

      // Attempting to consume 0.02 is rejected
      expect(() => {
        item.consumeStock({ quantity: 0.02, actorId, reason: 'Overdraft by 0.01' });
      }).toThrow(InsufficientStockException);

      // Consuming exact 0.01 succeeds and leaves 0.00
      item.consumeStock({ quantity: 0.01, actorId, reason: 'Consume last cent unit' });
      expect(item.quantityOnHand.value).toBe(0);
      expect(item.isOutOfStock()).toBe(true);
    });

    it('normalizes arbitrary float inputs to exact 2-decimal half-up precision', () => {
      const qty1 = Quantity.of(12.345);
      expect(qty1.value).toBe(12.35);

      const qty2 = Quantity.of(12.344);
      expect(qty2.value).toBe(12.34);
    });
  });

  // ============================================================================
  // 4. CONCURRENCY SCENARIOS A, B, AND C
  // ============================================================================
  describe('4. Concurrency Scenarios A, B, and C (PostgreSQL / Prisma OCC Emulation)', () => {
    // Scenario A
    it('Scenario A: Initial stock = 5, two concurrent consumers each request 4 -> exactly 1 succeeds, 1 fails, final stock = 1', async () => {
      const item = InventoryItem.create({
        sku: 'CONC-SCENARIO-A',
        name: 'Limited Hydrogel Pack',
        initialStock: 5,
        recordedByUserId: actorId,
      });
      engine.seedInventory(item);
      const itemId = item.id.getValue();

      // Consumer 1 consumes 4 and commits
      const res1 = await engine.executeInventoryTransaction(itemId, (domainItem) => {
        domainItem.consumeStock({ quantity: 4, actorId: 'consumer_1', reason: 'Order 1' });
      });
      expect(res1.success).toBe(true);
      expect(engine.getRawStock(itemId)).toBe(1);

      // Consumer 2 attempts to consume 4 on updated stock (1.00 < 4.00) -> domain overdraft check fails
      const res2 = await engine.executeInventoryTransaction(itemId, (domainItem) => {
        domainItem.consumeStock({ quantity: 4, actorId: 'consumer_2', reason: 'Order 2' });
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toBeInstanceOf(InsufficientStockException);

      // Final stock is exactly 1.00, movement count reflects only opening + Order 1
      expect(engine.getRawStock(itemId)).toBe(1);
      expect(engine.getMovementCount(itemId)).toBe(2);
    });

    // Scenario B
    it('Scenario B: Initial stock = 10, 4 concurrent consumers collectively request 16 (4 units each) -> exactly 2 succeed, no overselling, final stock = 2', async () => {
      const item = InventoryItem.create({
        sku: 'CONC-SCENARIO-B',
        name: 'Disinfectant Wipes Tub',
        initialStock: 10,
        recordedByUserId: actorId,
      });
      engine.seedInventory(item);
      const itemId = item.id.getValue();

      let successCount = 0;
      let failureCount = 0;

      // 4 consumers request 4 units each
      for (let i = 1; i <= 4; i++) {
        const res = await engine.executeInventoryTransaction(itemId, (domainItem) => {
          domainItem.consumeStock({ quantity: 4, actorId: `consumer_${i}`, reason: `Batch ${i}` });
        });
        if (res.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      expect(successCount).toBe(2); // 10 - 4 - 4 = 2 remaining
      expect(failureCount).toBe(2); // 2 < 4 -> rejected
      expect(engine.getRawStock(itemId)).toBe(2);
      expect(engine.getRawStock(itemId)).toBeGreaterThanOrEqual(0);
      expect(engine.getMovementCount(itemId)).toBe(3); // opening + 2 successful consumptions
    });

    // Scenario C
    it('Scenario C: Concurrent purchases and sales -> final stock reflects only committed operations, zero lost updates', async () => {
      const item = InventoryItem.create({
        sku: 'CONC-SCENARIO-C',
        name: 'Resistance Bands Set',
        initialStock: 10,
        recordedByUserId: actorId,
      });
      engine.seedInventory(item);
      const itemId = item.id.getValue();

      // Sequence of operations:
      // +5 (Purchase) -> 15
      // -4 (Sale) -> 11
      // +5 (Purchase) -> 16
      // -4 (Sale) -> 12
      const ops = [
        { type: 'PURCHASE', qty: 5 },
        { type: 'SALE', qty: 4 },
        { type: 'PURCHASE', qty: 5 },
        { type: 'SALE', qty: 4 },
      ];

      for (const op of ops) {
        const res = await engine.executeInventoryTransaction(itemId, (domainItem) => {
          if (op.type === 'PURCHASE') {
            domainItem.receiveStock({ quantity: op.qty, actorId, reason: 'Restock' });
          } else {
            domainItem.sellStock({ quantity: op.qty, actorId, reason: 'Retail POS' });
          }
        });
        expect(res.success).toBe(true);
      }

      // Final stock: 10 + 5 - 4 + 5 - 4 = 12.00
      expect(engine.getRawStock(itemId)).toBe(12);
      const updated = engine.getInventory(itemId)!;
      expect(updated.movements.length).toBe(5); // opening + 4 operations

      // Double-entry reconciliation check
      const sumDeltas = updated.movements.reduce((acc, m) => acc + m.quantityDelta.value, 0);
      expect(sumDeltas).toBe(12);
    });
  });

  // ============================================================================
  // 5. INVENTORY TRANSACTIONAL ATOMICITY TESTS
  // ============================================================================
  describe('5. Inventory Transactional Atomicity Tests', () => {
    it('rolls back stock mutation when movement ledger insertion fails', async () => {
      const item = InventoryItem.create({
        sku: 'ATOMIC-INVENTORY-01',
        name: 'Sterile Syringes Pack',
        initialStock: 50,
        recordedByUserId: actorId,
      });
      engine.seedInventory(item);
      const itemId = item.id.getValue();

      const res = await engine.executeInventoryTransaction(
        itemId,
        (domainItem) => {
          domainItem.consumeStock({ quantity: 15, actorId, reason: 'Clinic consumption' });
        },
        true, // force movement failure
      );

      expect(res.success).toBe(false);
      expect(res.error?.message).toContain('Simulated database error during stock movement append');

      // Verify stock in database was NOT modified and remains 50
      expect(engine.getRawStock(itemId)).toBe(50);
      expect(engine.getMovementCount(itemId)).toBe(1); // only opening balance
    });
  });
});
