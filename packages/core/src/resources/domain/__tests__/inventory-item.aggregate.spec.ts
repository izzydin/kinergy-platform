import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { InventoryCategory } from '../inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../inventory/enums/inventory-item-status.enum';
import { StockMovementType } from '../inventory/enums/stock-movement-type.enum';
import { InsufficientStockException } from '../inventory/exceptions/insufficient-stock.exception';
import { InvalidSkuException } from '../inventory/exceptions/invalid-sku.exception';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';
import { InvalidQuantityException } from '../inventory/exceptions/invalid-quantity.exception';

describe('Phase 6.1: Consumable Inventory Aggregate Root (InventoryItem)', () => {
  const actorId = 'usr_clinician_456';

  describe('1. Valid & Invalid Creation Invariants', () => {
    it('creates an inventory item with default values and opening stock', () => {
      const item = InventoryItem.create({
        sku: 'MED-TAPE-01',
        name: 'Elastic Therapeutic Tape (Black)',
        description: '5cm x 5m roll for kinesiology taping',
        category: InventoryCategory.THERAPY_CONSUMABLES,
        unit: UnitOfMeasure.ROLLS,
        minimumStock: 10,
        initialStock: 50,
        purchaseCost: { amount: 8.5, currency: 'USD' },
        sellingPrice: { amount: 15.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      expect(item.id).toBeDefined();
      expect(item.sku.value).toBe('MED-TAPE-01');
      expect(item.name).toBe('Elastic Therapeutic Tape (Black)');
      expect(item.category).toBe(InventoryCategory.THERAPY_CONSUMABLES);
      expect(item.unit).toBe(UnitOfMeasure.ROLLS);
      expect(item.minimumStock.value).toBe(10);
      expect(item.quantityOnHand.value).toBe(50);
      expect(item.purchaseCost.amount).toBe(8.5);
      expect(item.sellingPrice.amount).toBe(15.0);
      expect(item.status).toBe(InventoryItemStatus.ACTIVE);
      expect(item.version).toBe(1);
      expect(item.isLowStock()).toBe(false);
      expect(item.isOutOfStock()).toBe(false);

      // Opening stock movement generated
      expect(item.movements.length).toBe(1);
      expect(item.movements[0]!.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(item.movements[0]!.quantityDelta.value).toBe(50);
      expect(item.movements[0]!.balanceAfter.value).toBe(50);

      // Domain events raised
      const events = item.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('InventoryItemCreated');
    });

    it('creates an inventory item with zero initial stock and no opening movement', () => {
      const item = InventoryItem.create({
        sku: 'SUP-NEEDLE-01',
        name: 'Acupuncture Needles 0.25x30mm',
        minimumStock: 5,
        initialStock: 0,
        recordedByUserId: actorId,
      });

      expect(item.quantityOnHand.value).toBe(0);
      expect(item.movements.length).toBe(0);
      expect(item.isOutOfStock()).toBe(true);
      expect(item.isLowStock()).toBe(true);
    });

    it('rejects empty or excessively long item name', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'SUP-001',
          name: '',
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        InventoryItem.create({
          sku: 'SUP-001',
          name: 'A'.repeat(121),
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects item creation without recordedByUserId', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'SUP-001',
          name: 'Ultrasound Gel 5L',
          recordedByUserId: '',
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects invalid SKU during item creation', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'invalid sku!',
          name: 'Disinfectant Spray',
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidSkuException);
    });

    it('rejects negative minimum stock during creation', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'SUP-002',
          name: 'Disinfectant Spray',
          minimumStock: -5,
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidQuantityException);
    });
  });

  describe('2. Stock Additions (PURCHASE & ADJUSTMENT_IN)', () => {
    it('receives stock (PURCHASE) and increments quantity on hand', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-01',
        name: 'Ultrasound Gel 5L',
        initialStock: 10,
        recordedByUserId: actorId,
      });
      item.clearEvents();

      const movement = item.receiveStock({
        quantity: 20,
        unitCost: { amount: 22.5, currency: 'USD' },
        actorId,
        referenceId: 'PO-98765',
        reason: 'Received vendor order #98765',
      });

      expect(item.quantityOnHand.value).toBe(30);
      expect(movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(movement.quantityDelta.value).toBe(20);
      expect(movement.balanceAfter.value).toBe(30);
      expect(movement.unitCost.amount).toBe(22.5);
      expect(item.version).toBe(2);

      const events = item.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('StockReceived');
    });

    it('manually adjusts stock upward (ADJUSTMENT_IN)', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-01',
        name: 'Ultrasound Gel 5L',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      const movement = item.adjustStockIn({
        quantity: 5,
        actorId,
        reason: 'Annual audit found 5 unaccounted bottles in storage',
      });

      expect(item.quantityOnHand.value).toBe(15);
      expect(movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(movement.quantityDelta.value).toBe(5);
      expect(movement.balanceAfter.value).toBe(15);
    });

    it('rejects zero or negative quantities for stock additions [INV-3]', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-01',
        name: 'Ultrasound Gel 5L',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.receiveStock({
          quantity: 0,
          actorId,
          reason: 'Test',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.adjustStockIn({
          quantity: -3,
          actorId,
          reason: 'Test',
        }),
      ).toThrow(InvalidQuantityException);
    });
  });

  describe('3. Stock Deductions & Negative Prevention [INV-1]', () => {
    it('consumes stock during clinical treatment', () => {
      const item = InventoryItem.create({
        sku: 'MED-NEEDLE-01',
        name: 'Dry Needling Box (100ct)',
        initialStock: 25,
        minimumStock: 5,
        recordedByUserId: actorId,
      });
      item.clearEvents();

      const movement = item.consumeStock({
        quantity: 4,
        actorId,
        referenceId: 'SESSION-7788',
        reason: 'Consumed in knee rehab session',
      });

      expect(item.quantityOnHand.value).toBe(21);
      expect(movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(movement.quantityDelta.value).toBe(-4);
      expect(movement.balanceAfter.value).toBe(21);

      const events = item.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('StockConsumed');
    });

    it('sells stock at retail checkout', () => {
      const item = InventoryItem.create({
        sku: 'RET-ROLLER-01',
        name: 'Foam Roller (High Density)',
        initialStock: 12,
        sellingPrice: { amount: 35.0, currency: 'USD' },
        recordedByUserId: actorId,
      });
      item.clearEvents();

      const movement = item.sellStock({
        quantity: 2,
        actorId,
        referenceId: 'INV-2026-001',
        reason: 'Retail sale to client',
      });

      expect(item.quantityOnHand.value).toBe(10);
      expect(movement.movementType).toBe(StockMovementType.SALE);
      expect(movement.quantityDelta.value).toBe(-2);
      expect(movement.balanceAfter.value).toBe(10);

      const events = item.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('StockSold');
    });

    it('scraps damaged or expired stock', () => {
      const item = InventoryItem.create({
        sku: 'MED-CREAM-01',
        name: 'Massage Cream 1L',
        initialStock: 8,
        recordedByUserId: actorId,
      });

      const movement = item.scrapStock({
        quantity: 3,
        actorId,
        reason: 'Expired on 2026-08-01',
      });

      expect(item.quantityOnHand.value).toBe(5);
      expect(movement.movementType).toBe(StockMovementType.SCRAP);
      expect(movement.quantityDelta.value).toBe(-3);
      expect(movement.balanceAfter.value).toBe(5);
    });

    it('throws InsufficientStockException when consumption exceeds available stock [INV-1]', () => {
      const item = InventoryItem.create({
        sku: 'MED-CREAM-01',
        name: 'Massage Cream 1L',
        initialStock: 5,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.consumeStock({
          quantity: 6,
          actorId,
          reason: 'Excess consumption',
        }),
      ).toThrow(InsufficientStockException);

      // State remains unchanged
      expect(item.quantityOnHand.value).toBe(5);
    });

    it('throws InsufficientStockException when retail sale exceeds available stock [INV-1]', () => {
      const item = InventoryItem.create({
        sku: 'RET-BAND-01',
        name: 'Resistance Band (Red)',
        initialStock: 2,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.sellStock({
          quantity: 5,
          actorId,
          reason: 'Excess sale',
        }),
      ).toThrow(InsufficientStockException);
    });

    it('throws InsufficientStockException when adjust out exceeds available stock [INV-1]', () => {
      const item = InventoryItem.create({
        sku: 'RET-BAND-01',
        name: 'Resistance Band (Red)',
        initialStock: 2,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.adjustStockOut({
          quantity: 3,
          actorId,
          reason: 'Audit shrinkage',
        }),
      ).toThrow(InsufficientStockException);
    });
  });

  describe('4. Stock Correction & Low Stock Alerts', () => {
    it('sets absolute target count and calculates signed delta on correction', () => {
      const item = InventoryItem.create({
        sku: 'MED-PAD-01',
        name: 'Electrode Pads 4pk',
        initialStock: 20,
        minimumStock: 10,
        recordedByUserId: actorId,
      });
      item.clearEvents();

      const movement = item.correctStock({
        targetCount: 8,
        actorId,
        reason: 'Managerial inventory reconciliation discrepancy',
      });

      expect(item.quantityOnHand.value).toBe(8);
      expect(movement.movementType).toBe(StockMovementType.CORRECTION);
      expect(movement.quantityDelta.value).toBe(-12);
      expect(movement.balanceAfter.value).toBe(8);

      const events = item.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'StockCorrected')).toBe(true);
      expect(events.some((e) => e.eventType === 'LowStockThresholdReached')).toBe(true);
    });

    it('raises LowStockThresholdReachedDomainEvent when stock reaches or drops below minimum', () => {
      const item = InventoryItem.create({
        sku: 'MED-PAD-01',
        name: 'Electrode Pads 4pk',
        initialStock: 15,
        minimumStock: 10,
        recordedByUserId: actorId,
      });
      item.clearEvents();

      item.consumeStock({
        quantity: 5,
        actorId,
        reason: 'Session consumption',
      });

      expect(item.quantityOnHand.value).toBe(10);
      expect(item.isLowStock()).toBe(true);

      const events = item.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'LowStockThresholdReached')).toBe(true);
    });
  });

  describe('5. Catalog Lifecycle State Machine [INV-5]', () => {
    it('deactivates and reactivates an active item', () => {
      const item = InventoryItem.create({
        sku: 'MED-PAD-01',
        name: 'Electrode Pads 4pk',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      item.deactivate(actorId, 'Supplier recall under investigation');
      expect(item.status).toBe(InventoryItemStatus.INACTIVE);

      // Mutations blocked while INACTIVE [INV-5]
      expect(() =>
        item.consumeStock({
          quantity: 1,
          actorId,
          reason: 'Test',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      item.activate(actorId);
      expect(item.status).toBe(InventoryItemStatus.ACTIVE);

      // Mutations work again
      item.consumeStock({
        quantity: 1,
        actorId,
        reason: 'Resumed consumption',
      });
      expect(item.quantityOnHand.value).toBe(9);
    });

    it('permanently archives an item with zero stock and forbids future mutations', () => {
      const item = InventoryItem.create({
        sku: 'MED-PAD-01',
        name: 'Electrode Pads 4pk',
        initialStock: 0,
        recordedByUserId: actorId,
      });

      item.archive(actorId, 'Discontinued product line');
      expect(item.status).toBe(InventoryItemStatus.ARCHIVED);

      expect(() => item.activate(actorId)).toThrow(InvalidInventoryItemStateException);
      expect(() => item.deactivate(actorId)).toThrow(InvalidInventoryItemStateException);
      expect(() => item.updateCatalogDetails({ name: 'New Name' })).toThrow(
        InvalidInventoryItemStateException,
      );
    });

    it('forbids archiving an item when positive stock remains on hand', () => {
      const item = InventoryItem.create({
        sku: 'MED-PAD-02',
        name: 'Electrode Pads 4pk With Stock',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      expect(() => item.archive(actorId, 'Premature archival attempt')).toThrow(
        InvalidInventoryItemStateException,
      );
    });
  });

  describe('6. Valuation and Reconstitution', () => {
    it('calculates total stock valuation dynamically', () => {
      const item = InventoryItem.create({
        sku: 'SUP-VAL-01',
        name: 'Therapeutic Resistance Tubing',
        initialStock: 40,
        purchaseCost: { amount: 12.5, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const valuation = item.calculateStockValuation();
      expect(valuation.amount).toBe(500.0);
      expect(valuation.currency).toBe('USD');
    });

    it('reconstitutes an inventory item from persistence snapshot', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-08-01T00:00:00Z');

      const item = InventoryItem.reconstitute({
        id: '11111111-2222-3333-4444-555555555555',
        tenantId: 'tenant_main',
        sku: 'RECON-SKU-01',
        name: 'Reconstituted Item',
        description: 'Testing reconstitution',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.BOXES,
        minimumStock: 15,
        quantityOnHand: 45,
        purchaseCost: { amount: 20.0, currency: 'CAD' },
        sellingPrice: { amount: 35.0, currency: 'CAD' },
        status: InventoryItemStatus.ACTIVE,
        version: 5,
        createdAt,
        updatedAt,
      });

      expect(item.id.getValue()).toBe('11111111-2222-3333-4444-555555555555');
      expect(item.tenantId).toBe('tenant_main');
      expect(item.sku.value).toBe('RECON-SKU-01');
      expect(item.quantityOnHand.value).toBe(45);
      expect(item.purchaseCost.currency).toBe('CAD');
      expect(item.version).toBe(5);
    });
  });
});
