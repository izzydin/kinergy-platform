import { SKU } from '../inventory/value-objects/sku.vo';
import { Quantity } from '../inventory/value-objects/quantity.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { LocationRef } from '../inventory/value-objects/location-ref.vo';
import { InventoryItemId } from '../inventory/value-objects/inventory-item-id.vo';
import { StockMovementId } from '../inventory/value-objects/stock-movement-id.vo';
import { InvalidSkuException } from '../inventory/exceptions/invalid-sku.exception';
import { InvalidQuantityException } from '../inventory/exceptions/invalid-quantity.exception';
import { InvalidMoneyException } from '../inventory/exceptions/invalid-money.exception';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';

describe('Phase 6.1: Consumable Inventory Value Objects', () => {
  describe('SKU Value Object', () => {
    it('creates a valid normalized uppercase SKU', () => {
      const sku = SKU.create('sup-tape-001');
      expect(sku.value).toBe('SUP-TAPE-001');
      expect(sku.getValue()).toBe('SUP-TAPE-001');
      expect(sku.toString()).toBe('SUP-TAPE-001');
    });

    it('rejects empty or whitespace-only SKU', () => {
      expect(() => SKU.create('')).toThrow(InvalidSkuException);
      expect(() => SKU.create('   ')).toThrow(InvalidSkuException);
    });

    it('rejects SKU with invalid length or special characters', () => {
      expect(() => SKU.create('AB')).toThrow(InvalidSkuException); // < 3 chars
      expect(() => SKU.create('A'.repeat(33))).toThrow(InvalidSkuException); // > 32 chars
      expect(() => SKU.create('SUP@TAPE!')).toThrow(InvalidSkuException); // illegal symbols
      expect(() => SKU.create('SUP TAPE')).toThrow(InvalidSkuException); // spaces not allowed
    });

    it('evaluates equality correctly', () => {
      const sku1 = SKU.create('MED-GLOVE-M');
      const sku2 = SKU.create('med-glove-m');
      const sku3 = SKU.create('MED-GLOVE-L');
      expect(sku1.equals(sku2)).toBe(true);
      expect(sku1.equals(sku3)).toBe(false);
    });
  });

  describe('Quantity Value Object', () => {
    it('creates a valid non-negative quantity with scale 2 precision', () => {
      const qty = Quantity.of(12.3456);
      expect(qty.value).toBe(12.35);
      expect(qty.toString()).toBe('12.35');
      expect(qty.isZero()).toBe(false);
      expect(qty.isPositive()).toBe(true);
    });

    it('creates a zero quantity', () => {
      const qty = Quantity.zero();
      expect(qty.value).toBe(0);
      expect(qty.isZero()).toBe(true);
      expect(qty.isPositive()).toBe(false);
    });

    it('rejects negative numbers when created via of()', () => {
      expect(() => Quantity.of(-1)).toThrow(InvalidQuantityException);
    });

    it('allows negative deltas when created via ofDelta()', () => {
      const delta = Quantity.ofDelta(-5.25);
      expect(delta.value).toBe(-5.25);
      expect(delta.isNegative()).toBe(true);
    });

    it('rejects NaN or non-finite numbers', () => {
      expect(() => Quantity.of(NaN)).toThrow(InvalidQuantityException);
      expect(() => Quantity.of(Infinity)).toThrow(InvalidQuantityException);
    });

    it('performs arithmetic operations accurately', () => {
      const q1 = Quantity.of(10.5);
      const q2 = Quantity.of(4.25);

      const sum = q1.add(q2);
      expect(sum.value).toBe(14.75);

      const diff = q1.subtract(q2);
      expect(diff.value).toBe(6.25);
    });

    it('throws error when subtraction yields negative balance', () => {
      const q1 = Quantity.of(5);
      const q2 = Quantity.of(10);
      expect(() => q1.subtract(q2)).toThrow(InvalidQuantityException);
    });

    it('performs comparisons correctly', () => {
      const q1 = Quantity.of(10);
      const q2 = Quantity.of(5);
      const q3 = Quantity.of(10);

      expect(q1.isGreaterThan(q2)).toBe(true);
      expect(q2.isLessThan(q1)).toBe(true);
      expect(q1.isGreaterThanOrEqual(q3)).toBe(true);
      expect(q1.isLessThanOrEqual(q3)).toBe(true);
      expect(q1.equals(q3)).toBe(true);
    });
  });

  describe('Money Value Object', () => {
    it('creates a valid non-negative money amount', () => {
      const money = Money.create(49.994, 'CAD');
      expect(money.amount).toBe(49.99);
      expect(money.currency).toBe('CAD');
      expect(money.toString()).toBe('49.99 CAD');
    });

    it('rejects negative amounts', () => {
      expect(() => Money.create(-10, 'USD')).toThrow(InvalidMoneyException);
    });

    it('rejects invalid currency codes', () => {
      expect(() => Money.create(10, '')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, 'US')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, 'US1')).toThrow(InvalidMoneyException);
    });

    it('performs addition with currency protection', () => {
      const m1 = Money.create(25.5, 'USD');
      const m2 = Money.create(14.25, 'USD');
      const sum = m1.add(m2);
      expect(sum.amount).toBe(39.75);
      expect(sum.currency).toBe('USD');

      const mCad = Money.create(10, 'CAD');
      expect(() => m1.add(mCad)).toThrow(InvalidMoneyException);
    });

    it('multiplies money by quantity', () => {
      const unitCost = Money.create(15.5, 'USD');
      const quantity = Quantity.of(4);
      const total = unitCost.multiply(quantity);
      expect(total.amount).toBe(62.0);
      expect(total.currency).toBe('USD');
    });
  });

  describe('LocationRef Value Object', () => {
    it('creates a valid structured location reference', () => {
      const loc = LocationRef.create({
        facilityId: 'FAC_DOWNTOWN',
        roomRef: 'ROOM_STORAGE_A',
        binCode: 'BIN-104',
        shelf: 'SHELF-3',
      });
      expect(loc.facilityId).toBe('FAC_DOWNTOWN');
      expect(loc.roomRef).toBe('ROOM_STORAGE_A');
      expect(loc.binCode).toBe('BIN-104');
      expect(loc.shelf).toBe('SHELF-3');
    });

    it('rejects location without facilityId', () => {
      expect(() => LocationRef.create({ facilityId: '' })).toThrow(
        InvalidInventoryItemStateException,
      );
    });

    it('evaluates equality correctly', () => {
      const loc1 = LocationRef.create({ facilityId: 'FAC_1', binCode: 'B1' });
      const loc2 = LocationRef.create({ facilityId: 'FAC_1', binCode: 'B1' });
      const loc3 = LocationRef.create({ facilityId: 'FAC_1', binCode: 'B2' });
      expect(loc1.equals(loc2)).toBe(true);
      expect(loc1.equals(loc3)).toBe(false);
    });
  });

  describe('Entity IDs (InventoryItemId & StockMovementId)', () => {
    it('generates random UUID when none provided', () => {
      const itemId = InventoryItemId.create();
      expect(itemId.getValue()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const movementId = StockMovementId.create();
      expect(movementId.getValue()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('rejects empty ID strings', () => {
      expect(() => InventoryItemId.create('')).toThrow(InvalidInventoryItemStateException);
      expect(() => StockMovementId.create('')).toThrow(InvalidInventoryItemStateException);
    });
  });
});
