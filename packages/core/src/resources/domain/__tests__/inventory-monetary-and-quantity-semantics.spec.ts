import { Money } from '../inventory/value-objects/money.vo';
import { Quantity } from '../inventory/value-objects/quantity.vo';
import {
  UnitOfMeasure,
  UNIT_OF_MEASURE_REGISTRY,
  isValidUnitOfMeasure,
  parseUnitOfMeasure,
} from '../inventory/enums/unit-of-measure.enum';
import { InventoryCategory } from '../inventory/enums/inventory-category.enum';
import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { InvalidMoneyException } from '../inventory/exceptions/invalid-money.exception';
import { InvalidQuantityException } from '../inventory/exceptions/invalid-quantity.exception';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';
import { PrismaInventoryItemMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-inventory-item.mapper';
import { PrismaStockMovementMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-stock-movement.mapper';

describe('Phase 6.1: Monetary, Quantity, and Unit Precision Semantics (ADR-0089)', () => {
  const actorId = 'usr_financial_auditor_99';

  describe('1. Monetary Semantics & Precision Rules', () => {
    it('1.1 creates valid monetary values with Scale 2 precision and default USD currency', () => {
      const money = Money.create(12.5);
      expect(money.amount).toBe(12.5);
      expect(money.currency).toBe('USD');
      expect(money.toString()).toBe('12.50 USD');
      expect(money.toJSON()).toEqual({ amount: 12.5, currency: 'USD' });
      expect(money.isZero()).toBe(false);
    });

    it('1.2 supports explicit zero monetary amount', () => {
      const zero = Money.zero('USD');
      expect(zero.amount).toBe(0);
      expect(zero.currency).toBe('USD');
      expect(zero.isZero()).toBe(true);
      expect(zero.toString()).toBe('0.00 USD');
    });

    it('1.3 normalizes excessive decimal precision using half-up rounding', () => {
      const moneyRoundUp = Money.create(12.505, 'USD');
      expect(moneyRoundUp.amount).toBe(12.51);

      const moneyRoundDown = Money.create(12.504, 'USD');
      expect(moneyRoundDown.amount).toBe(12.5);

      const moneyExactCents = Money.create(99.99, 'CAD');
      expect(moneyExactCents.amount).toBe(99.99);
      expect(moneyExactCents.currency).toBe('CAD');
    });

    it('1.4 strictly rejects negative monetary amounts', () => {
      expect(() => Money.create(-0.01, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(-100, 'USD')).toThrow(
        /Monetary amount must be a finite non-negative number/,
      );
    });

    it('1.5 rejects non-finite or NaN monetary amounts', () => {
      expect(() => Money.create(NaN, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(Infinity, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(-Infinity, 'USD')).toThrow(InvalidMoneyException);
    });

    it('1.6 validates ISO-4217 3-letter uppercase currency codes', () => {
      expect(Money.create(10, 'usd').currency).toBe('USD');
      expect(Money.create(10, ' cad ').currency).toBe('CAD');
      expect(Money.create(10, 'EUR').currency).toBe('EUR');

      expect(() => Money.create(10, '')).toThrow(/Currency cannot be empty/);
      expect(() => Money.create(10, 'US')).toThrow(/Must be a 3-letter ISO-4217 code/);
      expect(() => Money.create(10, 'USDD')).toThrow(/Must be a 3-letter ISO-4217 code/);
      expect(() => Money.create(10, '123')).toThrow(/Must be a 3-letter ISO-4217 code/);
    });

    it('1.7 performs exact addition without floating-point drift', () => {
      const a = Money.create(0.1, 'USD');
      const b = Money.create(0.2, 'USD');
      const sum = a.add(b);

      expect(sum.amount).toBe(0.3);
      expect(sum.currency).toBe('USD');
    });

    it('1.8 performs exact subtraction and prevents negative results', () => {
      const a = Money.create(10.5, 'USD');
      const b = Money.create(4.25, 'USD');
      const diff = a.subtract(b);

      expect(diff.amount).toBe(6.25);
      expect(diff.currency).toBe('USD');

      expect(() => b.subtract(a)).toThrow(/Resulting monetary amount cannot be negative/);
    });

    it('1.9 prevents cross-currency arithmetic', () => {
      const usd = Money.create(10, 'USD');
      const cad = Money.create(10, 'CAD');

      expect(() => usd.add(cad)).toThrow(/Cannot add money with different currencies/);
      expect(() => usd.subtract(cad)).toThrow(/Cannot subtract money with different currencies/);
    });

    it('1.10 performs exact multiplication by quantity', () => {
      const unitPrice = Money.create(12.5, 'USD');
      const qty = Quantity.of(3.5);

      const total = unitPrice.multiply(qty);
      expect(total.amount).toBe(43.75); // 12.50 * 3.50 = 43.75

      const totalFromScalar = unitPrice.multiply(2);
      expect(totalFromScalar.amount).toBe(25.0);

      expect(() => unitPrice.multiply(-1)).toThrow(InvalidMoneyException);
    });
  });

  describe('2. Quantity Semantics & Precision Rules', () => {
    it('2.1 creates valid quantities with Scale 2 precision', () => {
      const discreteQty = Quantity.of(10);
      expect(discreteQty.value).toBe(10);
      expect(discreteQty.toString()).toBe('10.00');
      expect(discreteQty.toJSON()).toBe(10);

      const continuousQty = Quantity.of(2.75);
      expect(continuousQty.value).toBe(2.75);
      expect(continuousQty.toString()).toBe('2.75');
    });

    it('2.2 supports explicit zero quantity', () => {
      const zero = Quantity.zero();
      expect(zero.value).toBe(0);
      expect(zero.isZero()).toBe(true);
      expect(zero.isPositive()).toBe(false);
      expect(zero.isNegative()).toBe(false);
    });

    it('2.3 normalizes excessive decimal precision using half-up rounding', () => {
      const q1 = Quantity.of(1.234);
      expect(q1.value).toBe(1.23);

      const q2 = Quantity.of(1.235);
      expect(q2.value).toBe(1.24);

      const q3 = Quantity.of(0.004);
      expect(q3.value).toBe(0);

      const q4 = Quantity.of(0.005);
      expect(q4.value).toBe(0.01);
    });

    it('2.4 strictly rejects negative quantities in standard of() factory', () => {
      expect(() => Quantity.of(-0.01)).toThrow(InvalidQuantityException);
      expect(() => Quantity.of(-5)).toThrow(/Quantity cannot be negative.*Invariant \[INV-1\]/);
    });

    it('2.5 allows signed quantities in ofDelta() factory for ledger movements', () => {
      const deltaPositive = Quantity.ofDelta(5.5);
      expect(deltaPositive.value).toBe(5.5);
      expect(deltaPositive.isPositive()).toBe(true);

      const deltaNegative = Quantity.ofDelta(-3.25);
      expect(deltaNegative.value).toBe(-3.25);
      expect(deltaNegative.isNegative()).toBe(true);
    });

    it('2.6 rejects non-finite or NaN quantities', () => {
      expect(() => Quantity.of(NaN)).toThrow(InvalidQuantityException);
      expect(() => Quantity.of(Infinity)).toThrow(InvalidQuantityException);
      expect(() => Quantity.ofDelta(-Infinity)).toThrow(InvalidQuantityException);
    });

    it('2.7 performs exact arithmetic addition and subtraction', () => {
      const a = Quantity.of(10.25);
      const b = Quantity.of(4.5);

      const sum = a.add(b);
      expect(sum.value).toBe(14.75);

      const diff = a.subtract(b);
      expect(diff.value).toBe(5.75);

      expect(() => b.subtract(a)).toThrow(/Resulting quantity cannot be negative/);
    });

    it('2.8 performs exact scalar multiplication', () => {
      const qty = Quantity.of(2.5);
      const multiplied = qty.multiply(3);
      expect(multiplied.value).toBe(7.5);

      expect(() => qty.multiply(-2)).toThrow(InvalidQuantityException);
    });

    it('2.9 evaluates comparisons correctly', () => {
      const small = Quantity.of(2.5);
      const large = Quantity.of(5.0);
      const equal = Quantity.of(2.5);

      expect(small.isLessThan(large)).toBe(true);
      expect(large.isGreaterThan(small)).toBe(true);
      expect(small.isLessThanOrEqual(equal)).toBe(true);
      expect(small.isGreaterThanOrEqual(equal)).toBe(true);
      expect(small.equals(equal)).toBe(true);
    });
  });

  describe('3. Unit of Measure (UOM) Semantics & Registry', () => {
    it('3.1 provides authoritative descriptors for all canonical units', () => {
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.UNITS].isContinuous).toBe(false);
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.BOXES].displayName).toBe('Boxes');
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.BOTTLES].isContinuous).toBe(false);
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.ROLLS].displayName).toBe('Rolls');
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.MILLILITERS].isContinuous).toBe(true);
      expect(UNIT_OF_MEASURE_REGISTRY[UnitOfMeasure.GRAMS].isContinuous).toBe(true);
    });

    it('3.2 validates recognized and unrecognized unit values', () => {
      expect(isValidUnitOfMeasure('UNITS')).toBe(true);
      expect(isValidUnitOfMeasure('MILLILITERS')).toBe(true);
      expect(isValidUnitOfMeasure('INVALID_UNIT')).toBe(false);
      expect(isValidUnitOfMeasure(123)).toBe(false);
      expect(isValidUnitOfMeasure(null)).toBe(false);

      expect(parseUnitOfMeasure('BOTTLES')).toBe(UnitOfMeasure.BOTTLES);
      expect(() => parseUnitOfMeasure('PALLETS')).toThrow(/Invalid unit of measure: 'PALLETS'/);
    });
  });

  describe('4. Aggregate Integration & Invariant Validation', () => {
    it('4.1 initializes item with exact financial and quantity properties', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-500ML',
        name: 'Conductive Ultrasound Gel 500ml',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.MILLILITERS,
        minimumStock: 250.0,
        initialStock: 1500.0,
        purchaseCost: { amount: 14.5, currency: 'USD' },
        sellingPrice: { amount: 0.0, currency: 'USD' }, // Clinical consumable, not sold at retail
        recordedByUserId: actorId,
      });

      expect(item.quantityOnHand.value).toBe(1500.0);
      expect(item.minimumStock.value).toBe(250.0);
      expect(item.purchaseCost.amount).toBe(14.5);
      expect(item.purchaseCost.currency).toBe('USD');
      expect(item.sellingPrice.amount).toBe(0.0);
      expect(item.unit).toBe(UnitOfMeasure.MILLILITERS);
      expect(item.isLowStock()).toBe(false);
    });

    it('4.2 rejects invalid unit of measure during creation', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'MED-GEL-INVALID',
          name: 'Invalid Unit Gel',
          unit: 'NON_EXISTENT_UNIT' as unknown as UnitOfMeasure,
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('4.3 rejects invalid unit of measure during catalog update', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-VALID',
        name: 'Valid Unit Gel',
        recordedByUserId: actorId,
      });

      expect(() =>
        item.updateCatalogDetails({
          unit: 'GALLONS' as unknown as UnitOfMeasure,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('4.4 enforces stock consumption with continuous fractional quantities', () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-FRACTION',
        name: 'Ultrasound Gel Bulk',
        initialStock: 5.0,
        unit: UnitOfMeasure.BOTTLES,
        purchaseCost: { amount: 10.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      // Consume 1.25 bottles across therapy sessions
      const movement = item.consumeStock({
        quantity: 1.25,
        actorId,
        reason: 'Consumed 1.25 bottles across morning treatments',
      });

      expect(item.quantityOnHand.value).toBe(3.75);
      expect(movement.quantityDelta.value).toBe(-1.25);
      expect(movement.balanceAfter.value).toBe(3.75);
    });

    it('4.5 calculates dynamic total stock valuation accurately', () => {
      const item = InventoryItem.create({
        sku: 'RET-DRINK-ELECTRO',
        name: 'Electrolyte Wellness Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 24.0,
        purchaseCost: { amount: 1.75, currency: 'USD' },
        sellingPrice: { amount: 3.5, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const totalValuation = item.purchaseCost.multiply(item.quantityOnHand);
      expect(totalValuation.amount).toBe(42.0); // 24 * 1.75 = 42.00 USD
      expect(totalValuation.currency).toBe('USD');
    });

    it('4.6 supports persistence round-trip with lossless decimal precision', () => {
      const item = InventoryItem.create({
        sku: 'SUP-PROTEIN-WHEY',
        name: 'Isolate Whey Protein 1kg',
        category: InventoryCategory.SUPPLEMENTS,
        unit: UnitOfMeasure.GRAMS,
        minimumStock: 500.0,
        initialStock: 2500.5,
        purchaseCost: { amount: 45.99, currency: 'USD' },
        sellingPrice: { amount: 79.99, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const rawItem = PrismaInventoryItemMapper.toPersistence(item);
      const rawMovements = item.movements.map(PrismaStockMovementMapper.toPersistence);

      expect(rawItem.quantityOnHand.toString()).toBe('2500.5');
      expect(rawItem.minimumStock.toString()).toBe('500');
      expect(rawItem.purchaseCostAmount.toString()).toBe('45.99');
      expect(rawItem.purchaseCostCurrency).toBe('USD');
      expect(rawItem.sellingPriceAmount.toString()).toBe('79.99');
      expect(rawItem.unit).toBe(UnitOfMeasure.GRAMS);

      const reconstituted = PrismaInventoryItemMapper.toDomain({
        ...rawItem,
        createdAt: new Date(),
        updatedAt: new Date(),
        movements: rawMovements,
      });

      expect(reconstituted.quantityOnHand.value).toBe(2500.5);
      expect(reconstituted.minimumStock.value).toBe(500.0);
      expect(reconstituted.purchaseCost.amount).toBe(45.99);
      expect(reconstituted.sellingPrice.amount).toBe(79.99);
      expect(reconstituted.unit).toBe(UnitOfMeasure.GRAMS);
      expect(reconstituted.movements).toHaveLength(1);
      expect(reconstituted.movements[0]?.quantityDelta.value).toBe(2500.5);
    });
  });
});
