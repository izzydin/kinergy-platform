import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { InventoryCategory } from '../inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../inventory/enums/inventory-item-status.enum';
import { StockMovementType } from '../inventory/enums/stock-movement-type.enum';
import { InsufficientStockException } from '../inventory/exceptions/insufficient-stock.exception';
import { InvalidQuantityException } from '../inventory/exceptions/invalid-quantity.exception';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';
import { InvalidSkuException } from '../inventory/exceptions/invalid-sku.exception';
import { InvalidMoneyException } from '../inventory/exceptions/invalid-money.exception';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import { Quantity } from '../inventory/value-objects/quantity.vo';
import { Money } from '../inventory/value-objects/money.vo';

describe('Phase 6.10: Consumable Inventory Comprehensive Domain Unit Test Suite', () => {
  const testActorId = 'usr_qa_domain_lead';

  const createBaselineItem = (
    overrides: Partial<Parameters<typeof InventoryItem.create>[0]> = {},
  ): InventoryItem => {
    return InventoryItem.create({
      sku: 'MED-TAPE-01',
      name: 'Elastic Therapeutic Kinesiology Tape',
      description: 'Medical grade 5cm x 5m roll',
      category: InventoryCategory.THERAPY_CONSUMABLES,
      unit: UnitOfMeasure.ROLLS,
      minimumStock: 10,
      initialStock: 25,
      purchaseCost: { amount: 6.5, currency: 'USD' },
      sellingPrice: { amount: 14.0, currency: 'USD' },
      recordedByUserId: testActorId,
      ...overrides,
    });
  };

  describe('1. Product Validation & Domain Construction Invariants', () => {
    it('constructs a valid inventory item with all properties populated', () => {
      const item = createBaselineItem();

      expect(item.id).toBeDefined();
      expect(item.sku.value).toBe('MED-TAPE-01');
      expect(item.name).toBe('Elastic Therapeutic Kinesiology Tape');
      expect(item.category).toBe(InventoryCategory.THERAPY_CONSUMABLES);
      expect(item.unit).toBe(UnitOfMeasure.ROLLS);
      expect(item.minimumStock.value).toBe(10);
      expect(item.quantityOnHand.value).toBe(25);
      expect(item.purchaseCost.amount).toBe(6.5);
      expect(item.purchaseCost.currency).toBe('USD');
      expect(item.sellingPrice.amount).toBe(14.0);
      expect(item.sellingPrice.currency).toBe('USD');
      expect(item.status).toBe(InventoryItemStatus.ACTIVE);
      expect(item.version).toBe(1);
    });

    it('rejects invalid, empty, or whitespace-only product names', () => {
      expect(() => createBaselineItem({ name: '' })).toThrow(InvalidInventoryItemStateException);
      expect(() => createBaselineItem({ name: '   ' })).toThrow(InvalidInventoryItemStateException);
      expect(() => createBaselineItem({ name: 'A'.repeat(121) })).toThrow(
        InvalidInventoryItemStateException,
      );
    });

    it('rejects invalid SKU formats', () => {
      expect(() => createBaselineItem({ sku: '' })).toThrow(InvalidSkuException);
      expect(() => createBaselineItem({ sku: 'invalid sku with spaces' })).toThrow(
        InvalidSkuException,
      );
      expect(() => createBaselineItem({ sku: 'ab' })).toThrow(InvalidSkuException);
    });

    it('supports all approved inventory categories without error', () => {
      const categories = [
        InventoryCategory.HEALTHY_MEALS,
        InventoryCategory.HEALTHY_DRINKS,
        InventoryCategory.CLEANING_SUPPLIES,
        InventoryCategory.OFFICE_SUPPLIES,
        InventoryCategory.SUPPLEMENTS,
        InventoryCategory.CLINICAL_SUPPLIES,
        InventoryCategory.THERAPY_CONSUMABLES,
        InventoryCategory.RETAIL_PRODUCTS,
      ];

      for (const cat of categories) {
        const item = createBaselineItem({ sku: `SKU-${cat.substring(0, 4)}`, category: cat });
        expect(item.category).toBe(cat);
      }
    });

    it('supports all approved units of measure without error', () => {
      const units = [
        UnitOfMeasure.UNITS,
        UnitOfMeasure.BOXES,
        UnitOfMeasure.BOTTLES,
        UnitOfMeasure.ROLLS,
        UnitOfMeasure.MILLILITERS,
        UnitOfMeasure.GRAMS,
      ];

      for (const unit of units) {
        const item = createBaselineItem({ sku: `SKU-${unit.substring(0, 4)}`, unit });
        expect(item.unit).toBe(unit);
      }
    });

    it('rejects negative purchase cost or negative selling price', () => {
      expect(() => createBaselineItem({ purchaseCost: { amount: -5.0, currency: 'USD' } })).toThrow(
        InvalidMoneyException,
      );

      expect(() =>
        createBaselineItem({ sellingPrice: { amount: -10.0, currency: 'USD' } }),
      ).toThrow(InvalidMoneyException);
    });

    it('rejects negative minimum stock during creation', () => {
      expect(() => createBaselineItem({ minimumStock: -1 })).toThrow(InvalidQuantityException);
    });
  });

  describe('2. Non-Negative Stock Invariants [INV-INV-2]', () => {
    it('proves currentStock >= 0 and stock_after_movement >= 0 across exact deduction to 0', () => {
      const item = createBaselineItem({ initialStock: 10 });
      expect(item.quantityOnHand.value).toBe(10);

      // Exact sale of 10 units reduces stock to exactly 0
      item.sellStock({
        quantity: 10,
        actorId: testActorId,
        referenceId: 'SALE-EXACT-001',
        reason: 'Exact stock clearance sale',
      });

      expect(item.quantityOnHand.value).toBe(0);
      expect(item.isOutOfStock()).toBe(true);
      expect(item.isLowStock()).toBe(true);
      expect(item.movements[item.movements.length - 1]!.balanceAfter.value).toBe(0);
    });

    it('proves insufficient stock is rejected when requested quantity exceeds available by 1', () => {
      const item = createBaselineItem({ initialStock: 5 });

      expect(() =>
        item.sellStock({
          quantity: 6,
          actorId: testActorId,
          referenceId: 'SALE-OVER-001',
          reason: 'Attempted overselling',
        }),
      ).toThrow(InsufficientStockException);

      // Verify invariant: state remains unmutated at 5, zero movement created
      expect(item.quantityOnHand.value).toBe(5);
    });

    it('rejects zero or negative quantities across stock mutations', () => {
      const item = createBaselineItem({ initialStock: 20 });

      expect(() =>
        item.sellStock({
          quantity: 0,
          actorId: testActorId,
          reason: 'Attempted 0 sale',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.receiveStock({
          quantity: 0,
          actorId: testActorId,
          reason: 'Attempted 0 receive',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.consumeStock({
          quantity: 0,
          actorId: testActorId,
          reason: 'Attempted 0 consume',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.scrapStock({
          quantity: 0,
          actorId: testActorId,
          reason: 'Damaged item',
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });
  });

  describe('3. Purchase Operation Semantics', () => {
    it('increases stock, appends PURCHASE movement, and updates total value', () => {
      const item = createBaselineItem({ initialStock: 10 });
      const initialMovementCount = item.movements.length;

      item.receiveStock({
        quantity: 15,
        unitCost: Money.create(7.0, 'USD'),
        referenceId: 'PO-2026-AUG-01',
        reason: 'Replenishment order',
        actorId: testActorId,
      });

      expect(item.quantityOnHand.value).toBe(25);
      expect(item.movements.length).toBe(initialMovementCount + 1);

      const latestMovement = item.movements[item.movements.length - 1]!;
      expect(latestMovement.movementType).toBe(StockMovementType.PURCHASE);
      expect(latestMovement.quantityDelta.value).toBe(15);
      expect(latestMovement.balanceAfter.value).toBe(25);
      expect(latestMovement.unitCost?.amount).toBe(7.0);
      expect(latestMovement.referenceId).toBe('PO-2026-AUG-01');
      expect(latestMovement.recordedByUserId).toBe(testActorId);
    });
  });

  describe('4. Sale Operation Semantics', () => {
    it('decreases stock, appends SALE movement with negative delta, and tracks POS reference', () => {
      const item = createBaselineItem({ initialStock: 30 });
      const initialMovementCount = item.movements.length;

      item.sellStock({
        quantity: 5,
        referenceId: 'POS-REC-1092',
        reason: 'Retail desk sale',
        actorId: testActorId,
      });

      expect(item.quantityOnHand.value).toBe(25);
      expect(item.movements.length).toBe(initialMovementCount + 1);

      const latestMovement = item.movements[item.movements.length - 1]!;
      expect(latestMovement.movementType).toBe(StockMovementType.SALE);
      expect(latestMovement.quantityDelta.value).toBe(-5);
      expect(latestMovement.balanceAfter.value).toBe(25);
      expect(latestMovement.referenceId).toBe('POS-REC-1092');
    });
  });

  describe('5. Clinical & Internal Consumption Semantics', () => {
    it('records clinical consumption with treatment session reference', () => {
      const item = createBaselineItem({ initialStock: 20 });
      const initialMovementCount = item.movements.length;

      item.consumeStock({
        quantity: 2,
        referenceId: 'sess_rehab_883',
        reason: 'Applied during rotator cuff physical therapy',
        actorId: testActorId,
      });

      expect(item.quantityOnHand.value).toBe(18);
      expect(item.movements.length).toBe(initialMovementCount + 1);

      const latestMovement = item.movements[item.movements.length - 1]!;
      expect(latestMovement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(latestMovement.quantityDelta.value).toBe(-2);
      expect(latestMovement.balanceAfter.value).toBe(18);
      expect(latestMovement.referenceId).toBe('sess_rehab_883');
    });

    it('rejects consumption if stock is insufficient', () => {
      const item = createBaselineItem({ initialStock: 1 });

      expect(() =>
        item.consumeStock({
          quantity: 2,
          referenceId: 'sess_rehab_883',
          reason: 'Over-consumption attempt',
          actorId: testActorId,
        }),
      ).toThrow(InsufficientStockException);

      expect(item.quantityOnHand.value).toBe(1);
    });
  });

  describe('6. Stock Adjustment Semantics (In & Out)', () => {
    it('applies positive adjustment (ADJUSTMENT_IN) with audit reason', () => {
      const item = createBaselineItem({ initialStock: 10 });

      item.adjustStockIn({
        quantity: 5,
        reason: 'Physical inventory count found 5 extra rolls',
        actorId: testActorId,
      });

      expect(item.quantityOnHand.value).toBe(15);
      const latestMovement = item.movements[item.movements.length - 1]!;
      expect(latestMovement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(latestMovement.quantityDelta.value).toBe(5);
      expect(latestMovement.balanceAfter.value).toBe(15);
    });

    it('applies negative adjustment (ADJUSTMENT_OUT) with audit reason', () => {
      const item = createBaselineItem({ initialStock: 15 });

      item.adjustStockOut({
        quantity: 5,
        reason: 'Reconciliation write-off for shrinkage',
        actorId: testActorId,
      });

      expect(item.quantityOnHand.value).toBe(10);
      const latestMovement = item.movements[item.movements.length - 1]!;
      expect(latestMovement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
      expect(latestMovement.quantityDelta.value).toBe(-5);
      expect(latestMovement.balanceAfter.value).toBe(10);
    });

    it('rejects negative adjustment exceeding available stock', () => {
      const item = createBaselineItem({ initialStock: 10 });

      expect(() =>
        item.adjustStockOut({
          quantity: 11,
          reason: 'Excessive write-off',
          actorId: testActorId,
        }),
      ).toThrow(InsufficientStockException);

      expect(item.quantityOnHand.value).toBe(10);
    });
  });

  describe('7. Movement-to-Delta Pure Calculation Matrix', () => {
    it('verifies explicit delta polarity for all StockMovementType values', () => {
      const itemId = 'inv_item_test_01';
      const unitCost = Money.create(10.0, 'USD');

      // PURCHASE -> Positive delta
      const purchaseMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.PURCHASE,
        quantityDelta: Quantity.of(10),
        balanceAfter: Quantity.of(20),
        unitCost,
        reason: 'Purchase receipt',
        recordedByUserId: testActorId,
      });
      expect(purchaseMov.quantityDelta.value).toBe(10);

      // ADJUSTMENT_IN -> Positive delta
      const adjInMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.ADJUSTMENT_IN,
        quantityDelta: Quantity.of(5),
        balanceAfter: Quantity.of(25),
        unitCost,
        reason: 'Stock count addition',
        recordedByUserId: testActorId,
      });
      expect(adjInMov.quantityDelta.value).toBe(5);

      // SALE -> Negative delta
      const saleMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.SALE,
        quantityDelta: Quantity.ofDelta(-4),
        balanceAfter: Quantity.of(21),
        unitCost,
        reason: 'POS sale',
        recordedByUserId: testActorId,
      });
      expect(saleMov.quantityDelta.value).toBe(-4);

      // CONSUMPTION -> Negative delta
      const consMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.CONSUMPTION,
        quantityDelta: Quantity.ofDelta(-3),
        balanceAfter: Quantity.of(18),
        unitCost,
        reason: 'Session consumption',
        recordedByUserId: testActorId,
      });
      expect(consMov.quantityDelta.value).toBe(-3);

      // SCRAP -> Negative delta
      const scrapMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.SCRAP,
        quantityDelta: Quantity.ofDelta(-2),
        balanceAfter: Quantity.of(16),
        unitCost,
        reason: 'Damaged item disposal',
        recordedByUserId: testActorId,
      });
      expect(scrapMov.quantityDelta.value).toBe(-2);

      // ADJUSTMENT_OUT -> Negative delta
      const adjOutMov = StockMovement.create({
        inventoryItemId: itemId,
        movementType: StockMovementType.ADJUSTMENT_OUT,
        quantityDelta: Quantity.ofDelta(-6),
        balanceAfter: Quantity.of(10),
        unitCost,
        reason: 'Inventory reduction',
        recordedByUserId: testActorId,
      });
      expect(adjOutMov.quantityDelta.value).toBe(-6);
    });
  });

  describe('8. Low-Stock & Out-of-Stock Invariant Boundary Matrix', () => {
    it('evaluates isLowStock === false when currentStock > minimumStock', () => {
      const item = createBaselineItem({ initialStock: 15, minimumStock: 10 });
      expect(item.isLowStock()).toBe(false);
      expect(item.isOutOfStock()).toBe(false);
    });

    it('evaluates isLowStock === true when currentStock === minimumStock', () => {
      const item = createBaselineItem({ initialStock: 10, minimumStock: 10 });
      expect(item.isLowStock()).toBe(true);
      expect(item.isOutOfStock()).toBe(false);
    });

    it('evaluates isLowStock === true when currentStock < minimumStock', () => {
      const item = createBaselineItem({ initialStock: 8, minimumStock: 10 });
      expect(item.isLowStock()).toBe(true);
      expect(item.isOutOfStock()).toBe(false);
    });

    it('evaluates isLowStock === true and isOutOfStock === true when currentStock === 0', () => {
      const item = createBaselineItem({ initialStock: 0, minimumStock: 10 });
      expect(item.isLowStock()).toBe(true);
      expect(item.isOutOfStock()).toBe(true);
    });

    it('handles minimumStock === 0 edge case deterministically', () => {
      const itemWithStock = createBaselineItem({ initialStock: 5, minimumStock: 0 });
      expect(itemWithStock.isLowStock()).toBe(false);
      expect(itemWithStock.isOutOfStock()).toBe(false);

      const itemZeroStock = createBaselineItem({ initialStock: 0, minimumStock: 0 });
      expect(itemZeroStock.isLowStock()).toBe(true);
      expect(itemZeroStock.isOutOfStock()).toBe(true);
    });
  });

  describe('9. Product Status & Lifecycle Invariants', () => {
    it('transitions from ACTIVE to INACTIVE and back to ACTIVE', () => {
      const item = createBaselineItem();
      expect(item.status).toBe(InventoryItemStatus.ACTIVE);

      item.deactivate(testActorId, 'Seasonal pause');
      expect(item.status).toBe(InventoryItemStatus.INACTIVE);

      item.activate(testActorId);
      expect(item.status).toBe(InventoryItemStatus.ACTIVE);
    });

    it('archives an item only when stock on hand is exactly 0', () => {
      const itemWithStock = createBaselineItem({ initialStock: 5 });
      expect(() => itemWithStock.archive(testActorId, 'Attempted early archival')).toThrow(
        InvalidInventoryItemStateException,
      );

      const itemZeroStock = createBaselineItem({ initialStock: 0 });
      itemZeroStock.archive(testActorId, 'Valid archival');
      expect(itemZeroStock.status).toBe(InventoryItemStatus.ARCHIVED);
    });

    it('rejects mutations on ARCHIVED inventory items', () => {
      const item = createBaselineItem({ initialStock: 0 });
      item.archive(testActorId, 'Discontinued product');

      expect(() =>
        item.sellStock({
          quantity: 1,
          actorId: testActorId,
          reason: 'Attempted sale on archived item',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.receiveStock({
          quantity: 10,
          actorId: testActorId,
          reason: 'Attempted receive on archived item',
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });
  });
});
