import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { StockMovement } from '../inventory/entities/stock-movement.entity';
import {
  StockMovementType,
  STOCK_MOVEMENT_TYPE_REGISTRY,
} from '../inventory/enums/stock-movement-type.enum';
import { InventoryCategory } from '../inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../inventory/enums/inventory-item-status.enum';
import { Quantity } from '../inventory/value-objects/quantity.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InsufficientStockException } from '../inventory/exceptions/insufficient-stock.exception';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';
import { InvalidQuantityException } from '../inventory/exceptions/invalid-quantity.exception';

describe('Phase 6.1: Inventory Movement Ledger & Historical Mutation Semantics (ADR-0083)', () => {
  const actorId = 'usr_staff_alice';

  describe('1. Movement Type Directionality & Registry Descriptors', () => {
    it('verifies deterministic directional effects across all movement types', () => {
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.PURCHASE].direction).toBe('INCREASE');
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.ADJUSTMENT_IN].direction).toBe(
        'INCREASE',
      );
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.SALE].direction).toBe('DECREASE');
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.CONSUMPTION].direction).toBe(
        'DECREASE',
      );
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.ADJUSTMENT_OUT].direction).toBe(
        'DECREASE',
      );
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.SCRAP].direction).toBe('DECREASE');
      expect(STOCK_MOVEMENT_TYPE_REGISTRY[StockMovementType.CORRECTION].direction).toBe('VARIABLE');
    });
  });

  describe('2. Comprehensive Movement Ledger Execution', () => {
    it('records PURCHASE movement with positive delta and unit cost provenance', () => {
      const item = InventoryItem.create({
        sku: 'MED-NEEDLE-100',
        name: 'Dry Needles Box',
        initialStock: 10,
        purchaseCost: { amount: 15.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const movement = item.receiveStock({
        quantity: 25,
        unitCost: { amount: 14.5, currency: 'USD' },
        actorId,
        referenceId: 'PO-2026-8899',
        reason: 'Restock shipment received from MedSupply Direct',
      });

      expect(movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(movement.isIncrease()).toBe(true);
      expect(movement.isDecrease()).toBe(false);
      expect(movement.quantityDelta.value).toBe(25);
      expect(movement.balanceAfter.value).toBe(35);
      expect(movement.unitCost.amount).toBe(14.5);
      expect(movement.recordedByUserId).toBe(actorId);
      expect(movement.referenceId).toBe('PO-2026-8899');
      expect(item.quantityOnHand.value).toBe(35);
    });

    it('records SALE movement with negative delta and retail reference', () => {
      const item = InventoryItem.create({
        sku: 'RET-ROLLER-EVA',
        name: 'EVA Foam Roller',
        initialStock: 20,
        sellingPrice: { amount: 30.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const movement = item.sellStock({
        quantity: 3,
        actorId,
        referenceId: 'POS-REC-5544',
        reason: 'Retail purchase by client at front desk',
      });

      expect(movement.movementType).toBe(StockMovementType.SALE);
      expect(movement.isIncrease()).toBe(false);
      expect(movement.isDecrease()).toBe(true);
      expect(movement.quantityDelta.value).toBe(-3);
      expect(movement.balanceAfter.value).toBe(17);
      expect(item.quantityOnHand.value).toBe(17);
    });

    it('records CONSUMPTION movement during clinical treatment', () => {
      const item = InventoryItem.create({
        sku: 'MED-TAPE-ROLL',
        name: 'Kinesio Tape 5cm x 5m',
        initialStock: 15,
        recordedByUserId: actorId,
      });

      const movement = item.consumeStock({
        quantity: 2,
        actorId,
        referenceId: 'SESSION-90812',
        reason: 'Applied during shoulder rehab treatment',
      });

      expect(movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(movement.isDecrease()).toBe(true);
      expect(movement.quantityDelta.value).toBe(-2);
      expect(movement.balanceAfter.value).toBe(13);
      expect(item.quantityOnHand.value).toBe(13);
    });

    it('records ADJUSTMENT_IN movement from physical discovery', () => {
      const item = InventoryItem.create({
        sku: 'CLN-WIPES-100',
        name: 'Sanitizing Wipes Tub',
        initialStock: 5,
        recordedByUserId: actorId,
      });

      const movement = item.adjustStockIn({
        quantity: 4,
        actorId,
        reason: 'Found 4 unboxed tubs in back storage locker',
      });

      expect(movement.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(movement.isIncrease()).toBe(true);
      expect(movement.quantityDelta.value).toBe(4);
      expect(movement.balanceAfter.value).toBe(9);
    });

    it('records ADJUSTMENT_OUT movement from damaged packaging shrinkage', () => {
      const item = InventoryItem.create({
        sku: 'CLN-WIPES-100',
        name: 'Sanitizing Wipes Tub',
        initialStock: 9,
        recordedByUserId: actorId,
      });

      const movement = item.adjustStockOut({
        quantity: 2,
        actorId,
        reason: 'Deteriorated seal drying out wipes',
      });

      expect(movement.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
      expect(movement.isDecrease()).toBe(true);
      expect(movement.quantityDelta.value).toBe(-2);
      expect(movement.balanceAfter.value).toBe(7);
    });

    it('records CORRECTION upward and downward with automatic delta calculation', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-BTL',
        name: 'Ultrasound Gel 250ml',
        initialStock: 20,
        recordedByUserId: actorId,
      });

      // Correction downward (20 -> 14)
      const correctionDown = item.correctStock({
        targetCount: 14,
        actorId,
        reason: 'Monthly physical count discrepancy reconciliation',
      });

      expect(correctionDown.movementType).toBe(StockMovementType.CORRECTION);
      expect(correctionDown.isCorrection()).toBe(true);
      expect(correctionDown.quantityDelta.value).toBe(-6);
      expect(correctionDown.balanceAfter.value).toBe(14);
      expect(item.quantityOnHand.value).toBe(14);

      // Correction upward (14 -> 18)
      const correctionUp = item.correctStock({
        targetCount: 18,
        actorId,
        reason: 'Audit recount verified 18 bottles on shelf',
      });

      expect(correctionUp.quantityDelta.value).toBe(4);
      expect(correctionUp.balanceAfter.value).toBe(18);
      expect(item.quantityOnHand.value).toBe(18);
    });

    it('records SCRAP movement for expired or contaminated medical items', () => {
      const item = InventoryItem.create({
        sku: 'MED-LOTION-1L',
        name: 'Massage Lotion Organic',
        initialStock: 8,
        recordedByUserId: actorId,
      });

      const movement = item.scrapStock({
        quantity: 3,
        actorId,
        reason: 'Batch reached manufacturer expiration date 2026-08-01',
      });

      expect(movement.movementType).toBe(StockMovementType.SCRAP);
      expect(movement.isDecrease()).toBe(true);
      expect(movement.quantityDelta.value).toBe(-3);
      expect(movement.balanceAfter.value).toBe(5);
      expect(item.quantityOnHand.value).toBe(5);
    });
  });

  describe('3. Immutability & Ledger Protection (Object.freeze)', () => {
    it('enforces runtime immutability on StockMovement entity instances', () => {
      const movement = StockMovement.create({
        inventoryItemId: '123e4567-e89b-12d3-a456-426614174000',
        movementType: StockMovementType.PURCHASE,
        quantityDelta: 10,
        balanceAfter: 10,
        reason: 'Opening delivery',
        recordedByUserId: actorId,
      });

      expect(Object.isFrozen(movement)).toBe(true);
      // Attempting mutation in strict mode throws TypeError
      expect(() => {
        (movement as unknown as Record<string, unknown>)._reason = 'Tampered reason';
      }).toThrow(TypeError);
    });

    it('demonstrates that history is corrected strictly via compensating movements rather than rewriting history', () => {
      const item = InventoryItem.create({
        sku: 'SUP-BANDS-HD',
        name: 'Heavy Duty Resistance Bands',
        initialStock: 50,
        recordedByUserId: actorId,
      });

      // Erroneous entry: mistakenly recorded receiving 20 instead of 10
      item.receiveStock({
        quantity: 20,
        actorId,
        reason: 'Vendor PO #100 - Erroneously entered 20 instead of 10',
      });
      expect(item.quantityOnHand.value).toBe(70);

      // Historical ledger has 2 movements (opening + purchase)
      expect(item.movements.length).toBe(2);

      // Compensating movement: adjustment out to correct the surplus (+10 net effect)
      item.adjustStockOut({
        quantity: 10,
        actorId,
        reason: 'Compensating adjustment for PO #100 data entry overage',
      });

      expect(item.quantityOnHand.value).toBe(60);
      expect(item.movements.length).toBe(3);
      expect(item.movements[0]?.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(item.movements[1]?.movementType).toBe(StockMovementType.PURCHASE);
      expect(item.movements[2]?.movementType).toBe(StockMovementType.ADJUSTMENT_OUT);
    });
  });

  describe('4. Input Validation & Defense-in-Depth', () => {
    it('rejects creation of movements with invalid StockMovementType', () => {
      expect(() =>
        StockMovement.create({
          inventoryItemId: '123e4567-e89b-12d3-a456-426614174000',
          movementType: 'BOGUS_TYPE' as unknown as StockMovementType,
          quantityDelta: 5,
          balanceAfter: 5,
          reason: 'Test invalid type',
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects creation of movements with empty or whitespace recordedByUserId', () => {
      expect(() =>
        StockMovement.create({
          inventoryItemId: '123e4567-e89b-12d3-a456-426614174000',
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 5,
          balanceAfter: 5,
          reason: 'Valid reason',
          recordedByUserId: '',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        StockMovement.create({
          inventoryItemId: '123e4567-e89b-12d3-a456-426614174000',
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 5,
          balanceAfter: 5,
          reason: 'Valid reason',
          recordedByUserId: '   ',
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects creation of movements with empty or too-short reason (< 3 characters)', () => {
      expect(() =>
        StockMovement.create({
          inventoryItemId: '123e4567-e89b-12d3-a456-426614174000',
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 5,
          balanceAfter: 5,
          reason: 'ab',
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects zero or negative input quantities for operations [INV-3]', () => {
      const item = InventoryItem.create({
        sku: 'SUP-BANDS-MED',
        name: 'Medium Resistance Bands',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.receiveStock({
          quantity: 0,
          actorId,
          reason: 'Zero quantity purchase',
        }),
      ).toThrow(InvalidInventoryItemStateException);

      expect(() =>
        item.consumeStock({
          quantity: -5,
          actorId,
          reason: 'Negative quantity consumption',
        }),
      ).toThrow(InvalidQuantityException);

      expect(() =>
        item.sellStock({
          quantity: 0,
          actorId,
          reason: 'Zero quantity sale',
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('prevents stock deductions from producing negative stock [INV-1]', () => {
      const item = InventoryItem.create({
        sku: 'SUP-BANDS-MED',
        name: 'Medium Resistance Bands',
        initialStock: 5,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.consumeStock({
          quantity: 6,
          actorId,
          reason: 'Attempted overdraft consumption',
        }),
      ).toThrow(InsufficientStockException);

      expect(() =>
        item.sellStock({
          quantity: 6,
          actorId,
          reason: 'Attempted overdraft sale',
        }),
      ).toThrow(InsufficientStockException);

      expect(() =>
        item.adjustStockOut({
          quantity: 6,
          actorId,
          reason: 'Attempted overdraft adjust out',
        }),
      ).toThrow(InsufficientStockException);

      expect(() =>
        item.scrapStock({
          quantity: 6,
          actorId,
          reason: 'Attempted overdraft scrap',
        }),
      ).toThrow(InsufficientStockException);

      // Stock remains exactly 5
      expect(item.quantityOnHand.value).toBe(5);
    });
  });

  describe('5. Historical Ordering & Reconstitution', () => {
    it('preserves chronological movement ordering when reconstituted from persistence', () => {
      const t1 = new Date('2026-08-01T10:00:00.000Z');
      const t2 = new Date('2026-08-02T11:00:00.000Z');
      const t3 = new Date('2026-08-03T14:30:00.000Z');

      const mv1 = StockMovement.reconstitute({
        id: '11111111-1111-1111-1111-111111111111',
        inventoryItemId: '99999999-9999-9999-9999-999999999999',
        movementType: StockMovementType.ADJUSTMENT_IN,
        quantityDelta: Quantity.ofDelta(100),
        balanceAfter: Quantity.of(100),
        unitCost: Money.create(10, 'USD'),
        reason: 'Opening stock',
        recordedByUserId: 'usr_admin',
        recordedAt: t1,
      });

      const mv2 = StockMovement.reconstitute({
        id: '22222222-2222-2222-2222-222222222222',
        inventoryItemId: '99999999-9999-9999-9999-999999999999',
        movementType: StockMovementType.CONSUMPTION,
        quantityDelta: Quantity.ofDelta(-5),
        balanceAfter: Quantity.of(95),
        unitCost: Money.create(10, 'USD'),
        reason: 'Used in clinic',
        recordedByUserId: 'usr_therapist',
        recordedAt: t2,
      });

      const mv3 = StockMovement.reconstitute({
        id: '33333333-3333-3333-3333-333333333333',
        inventoryItemId: '99999999-9999-9999-9999-999999999999',
        movementType: StockMovementType.PURCHASE,
        quantityDelta: Quantity.ofDelta(50),
        balanceAfter: Quantity.of(145),
        unitCost: Money.create(9.5, 'USD'),
        reason: 'Supplier restock',
        recordedByUserId: 'usr_admin',
        recordedAt: t3,
      });

      const item = InventoryItem.reconstitute({
        id: '99999999-9999-9999-9999-999999999999',
        sku: 'MED-TAPE-RECON',
        name: 'Reconstituted Item',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.UNITS,
        minimumStock: 10,
        quantityOnHand: 145,
        purchaseCost: { amount: 9.5, currency: 'USD' },
        sellingPrice: { amount: 15.0, currency: 'USD' },
        status: InventoryItemStatus.ACTIVE,
        version: 3,
        createdAt: t1,
        updatedAt: t3,
        movements: [mv1, mv2, mv3],
      });

      expect(item.movements.length).toBe(3);
      expect(item.movements[0]?.recordedAt).toEqual(t1);
      expect(item.movements[1]?.recordedAt).toEqual(t2);
      expect(item.movements[2]?.recordedAt).toEqual(t3);
      expect(item.movements[0]?.balanceAfter.value).toBe(100);
      expect(item.movements[1]?.balanceAfter.value).toBe(95);
      expect(item.movements[2]?.balanceAfter.value).toBe(145);
    });
  });
});
