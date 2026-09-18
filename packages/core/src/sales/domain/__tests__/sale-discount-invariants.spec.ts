import { Sale } from '../sale.aggregate';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SaleStatus } from '../enums/sale-status.enum';
import { Clock } from '../shared/clock';
import { InvalidDiscountException, SaleAlreadyFinalizedException } from '../exceptions';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('Sale Aggregate — Discount Invariants & Deterministic Reconciliation (Prompt 7.3.5)', () => {
  const testClock = new DeterministicClock(new Date('2026-09-18T10:00:00.000Z'));

  const validInventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-101',
    sourceCode: 'WHEY-VAN-01',
  });

  const validSessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-treat-202',
    sourceCode: 'PHYSIO-60',
  });

  describe('Core Scenarios: No Discount, Fixed Discount, Percentage Discount', () => {
    it('handles no discount: Item subtotal = 100, Discount = 0, Item total = 100', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);

      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Whey Protein Tub',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          // No discount passed
        },
        testClock,
      );

      expect(item.subtotal.amount).toBe(100.0);
      expect(item.discountTotal.amount).toBe(0.0);
      expect(item.total.amount).toBe(100.0);

      // Aggregate reconciliation
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(100.0);
    });

    it('handles zero discount explicitly (fixed $0 and 0%): Item total = 100', () => {
      const saleFixedZero = Sale.create({ source: validSessionSource }, testClock);
      const itemFixedZero = saleFixedZero.addItem(
        {
          source: validInventorySource,
          description: 'Item with Fixed $0 Discount',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(0, 'Zero Fixed Promo'),
        },
        testClock,
      );

      expect(itemFixedZero.subtotal.amount).toBe(100.0);
      expect(itemFixedZero.discountTotal.amount).toBe(0.0);
      expect(itemFixedZero.total.amount).toBe(100.0);
      expect(saleFixedZero.subtotal.amount).toBe(100.0);
      expect(saleFixedZero.discountTotal.amount).toBe(0.0);
      expect(saleFixedZero.total.amount).toBe(100.0);

      const salePctZero = Sale.create({ source: validSessionSource }, testClock);
      const itemPctZero = salePctZero.addItem(
        {
          source: validInventorySource,
          description: 'Item with 0% Discount',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(0, 'Zero Percentage Promo'),
        },
        testClock,
      );

      expect(itemPctZero.subtotal.amount).toBe(100.0);
      expect(itemPctZero.discountTotal.amount).toBe(0.0);
      expect(itemPctZero.total.amount).toBe(100.0);
      expect(salePctZero.subtotal.amount).toBe(100.0);
      expect(salePctZero.discountTotal.amount).toBe(0.0);
      expect(salePctZero.total.amount).toBe(100.0);
    });

    it('handles fixed discount: Item subtotal = 100, Discount = 20, Item total = 80', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);

      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Resistance Band Set',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(20.0, '$20 Voucher'),
        },
        testClock,
      );

      expect(item.subtotal.amount).toBe(100.0);
      expect(item.discountTotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(80.0);

      // Aggregate reconciliation
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(80.0);
    });

    it('handles percentage discount: Item subtotal = 100, Discount = 20%, Item total = 80', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);

      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Massage Gun',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(20, '20% Member Discount'),
        },
        testClock,
      );

      expect(item.subtotal.amount).toBe(100.0);
      expect(item.discountTotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(80.0);

      // Aggregate reconciliation
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(80.0);
    });
  });

  describe('Multiple Items Financial Reconciliation', () => {
    it('strictly maintains Sale subtotal = sum(items), discountTotal = sum(items), and total = subtotal - discountTotal', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);

      // Item 1: 2 x $50.00 = $100.00, 20% discount ($20.00) -> net $80.00
      const item1 = sale.addItem(
        {
          source: validInventorySource,
          description: 'Item 1 - Percentage Discount',
          quantity: 2,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.percentage(20, '20% Volume'),
        },
        testClock,
      );

      // Item 2: 1 x $50.00 = $50.00, fixed $15.00 discount -> net $35.00
      const item2 = sale.addItem(
        {
          source: validInventorySource,
          description: 'Item 2 - Fixed Discount',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(15.0, '$15 Coupon'),
        },
        testClock,
      );

      // Item 3: 3 x $20.00 = $60.00, no discount -> net $60.00
      const item3 = sale.addItem(
        {
          source: validInventorySource,
          description: 'Item 3 - No Discount',
          quantity: 3,
          unitPrice: Money.create(20.0, 'USD'),
        },
        testClock,
      );

      // Item 4: 1 x $49.99 = $49.99, 15% discount ($7.50 rounded Half-Up) -> net $42.49
      const item4 = sale.addItem(
        {
          source: validInventorySource,
          description: 'Item 4 - Half-Up Rounded Discount',
          quantity: 1,
          unitPrice: Money.create(49.99, 'USD'),
          discount: Discount.percentage(15, '15% Seasonal'),
        },
        testClock,
      );

      // Item 1: 100.00, 20.00, 80.00
      expect(item1.subtotal.amount).toBe(100.0);
      expect(item1.discountTotal.amount).toBe(20.0);
      expect(item1.total.amount).toBe(80.0);

      // Item 2: 50.00, 15.00, 35.00
      expect(item2.subtotal.amount).toBe(50.0);
      expect(item2.discountTotal.amount).toBe(15.0);
      expect(item2.total.amount).toBe(35.0);

      // Item 3: 60.00, 0.00, 60.00
      expect(item3.subtotal.amount).toBe(60.0);
      expect(item3.discountTotal.amount).toBe(0.0);
      expect(item3.total.amount).toBe(60.0);

      // Item 4: 49.99, 7.50, 42.49
      expect(item4.subtotal.amount).toBe(49.99);
      expect(item4.discountTotal.amount).toBe(7.5);
      expect(item4.total.amount).toBe(42.49);

      // Reconciled aggregate totals:
      // Subtotal: 100.00 + 50.00 + 60.00 + 49.99 = 259.99
      const expectedSubtotal = item1.subtotal
        .add(item2.subtotal)
        .add(item3.subtotal)
        .add(item4.subtotal);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.subtotal.amount).toBe(259.99);

      // Discount Total: 20.00 + 15.00 + 0.00 + 7.50 = 42.50
      const expectedDiscountTotal = item1.discountTotal
        .add(item2.discountTotal)
        .add(item3.discountTotal)
        .add(item4.discountTotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.discountTotal.amount).toBe(42.5);

      // Total: 259.99 - 42.50 = 217.49
      const expectedTotal = expectedSubtotal.subtract(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);
      expect(sale.total.amount).toBe(217.49);
    });
  });

  describe('Invalid Discount Rejection & Failure Atomicity', () => {
    it('fails when fixed discount exceeds subtotal (subtotal = 50, discount = 60) and leaves aggregate unchanged', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);
      sale.addItem(
        {
          source: validInventorySource,
          description: 'Existing Valid Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(10.0, 'Initial Promo'),
        },
        testClock,
      );

      const snapshotBefore = {
        itemsCount: sale.items.length,
        subtotal: sale.subtotal.amount,
        discountTotal: sale.discountTotal.amount,
        total: sale.total.amount,
        version: sale.version,
      };

      // 1. Attempt adding item where fixed discount (60) > subtotal (50)
      expect(() => {
        sale.addItem(
          {
            source: validInventorySource,
            description: 'Item Exceeding Discount',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
            discount: Discount.fixed(60.0, 'Overdiscount Voucher'),
          },
          testClock,
        );
      }).toThrow(InvalidDiscountException);

      // Failure atomicity verification: aggregate unchanged
      expect(sale.items.length).toBe(snapshotBefore.itemsCount);
      expect(sale.subtotal.amount).toBe(snapshotBefore.subtotal);
      expect(sale.discountTotal.amount).toBe(snapshotBefore.discountTotal);
      expect(sale.total.amount).toBe(snapshotBefore.total);
      expect(sale.version).toBe(snapshotBefore.version);

      // 2. Attempt applyItemDiscount where fixed discount (60) > item subtotal (100 is ok, let's test 110)
      expect(() => {
        sale.applyItemDiscount(
          sale.items[0]!.id,
          Discount.fixed(110.0, 'Huge Discount'),
          testClock,
        );
      }).toThrow(InvalidDiscountException);

      // Failure atomicity verification: item and aggregate unchanged
      expect(sale.items[0]!.discount?.value).toBe(10.0);
      expect(sale.items[0]!.discountTotal.amount).toBe(10.0);
      expect(sale.subtotal.amount).toBe(snapshotBefore.subtotal);
      expect(sale.discountTotal.amount).toBe(snapshotBefore.discountTotal);
      expect(sale.total.amount).toBe(snapshotBefore.total);
    });

    it('fails when percentage discount is invalid (101%) and leaves aggregate unchanged', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);
      sale.addItem(
        {
          source: validInventorySource,
          description: 'Base Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        testClock,
      );

      const snapshotBefore = {
        itemsCount: sale.items.length,
        subtotal: sale.subtotal.amount,
        discountTotal: sale.discountTotal.amount,
        total: sale.total.amount,
      };

      // Creation of discount itself fails
      expect(() => {
        Discount.percentage(101, 'Over 100%');
      }).toThrow(InvalidDiscountException);

      // Attempting to pass an invalid percentage into addItem or applyItemDiscount fails
      expect(() => {
        sale.addItem(
          {
            source: validInventorySource,
            description: 'Item with 101% Discount',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
            discount: Discount.percentage(101 as unknown as number),
          },
          testClock,
        );
      }).toThrow(InvalidDiscountException);

      expect(sale.items.length).toBe(snapshotBefore.itemsCount);
      expect(sale.subtotal.amount).toBe(snapshotBefore.subtotal);
      expect(sale.discountTotal.amount).toBe(snapshotBefore.discountTotal);
      expect(sale.total.amount).toBe(snapshotBefore.total);
    });

    it('fails when discount value is negative (-10) and leaves aggregate unchanged', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);
      sale.addItem(
        {
          source: validInventorySource,
          description: 'Base Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        testClock,
      );

      const snapshotBefore = {
        itemsCount: sale.items.length,
        subtotal: sale.subtotal.amount,
        discountTotal: sale.discountTotal.amount,
        total: sale.total.amount,
      };

      // Negative fixed discount
      expect(() => {
        Discount.fixed(-10, 'Negative Fixed');
      }).toThrow(InvalidDiscountException);

      // Negative percentage discount
      expect(() => {
        Discount.percentage(-5, 'Negative Percentage');
      }).toThrow(InvalidDiscountException);

      // Aggregate remains unchanged
      expect(sale.items.length).toBe(snapshotBefore.itemsCount);
      expect(sale.subtotal.amount).toBe(snapshotBefore.subtotal);
      expect(sale.discountTotal.amount).toBe(snapshotBefore.discountTotal);
      expect(sale.total.amount).toBe(snapshotBefore.total);
    });

    it('preserves complete failure atomicity: no partially mutated SaleItem remains on failure', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);
      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Stable Item',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'), // Subtotal: $60.00
          discount: Discount.fixed(10.0, 'Safe Discount'), // Net: $50.00
        },
        testClock,
      );

      const originalItemSnapshot = item.toSnapshot();

      // Attempt 1: Apply fixed discount exceeding subtotal ($70 > $60)
      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(70.0, 'Too Large'), testClock);
      }).toThrow(InvalidDiscountException);

      // SaleItem is completely untouched
      expect(item.toSnapshot()).toEqual(originalItemSnapshot);
      expect(sale.items[0]!.toSnapshot()).toEqual(originalItemSnapshot);

      // Attempt 2: Decrease quantity to 1 (subtotal becomes $30, which is fine with $10 discount)
      sale.updateItemQuantity(item.id, 1, testClock);
      expect(sale.items[0]!.subtotal.amount).toBe(30.0);
      expect(sale.items[0]!.discountTotal.amount).toBe(10.0);
      expect(sale.items[0]!.total.amount).toBe(20.0);

      const updatedSnapshot = sale.items[0]!.toSnapshot();

      // Attempt 3: Now apply a discount of $35 on the $30 subtotal
      expect(() => {
        sale.applyItemDiscount(
          item.id,
          Discount.fixed(35.0, 'Exceeds Reduced Subtotal'),
          testClock,
        );
      }).toThrow(InvalidDiscountException);

      // Remains exactly at the updatedSnapshot state
      expect(sale.items[0]!.toSnapshot()).toEqual(updatedSnapshot);
      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(20.0);
    });
  });

  describe('Historical Immutability (Decoupling from Source Entities)', () => {
    it('guarantees external source catalog modifications do not mutate established commercial terms', () => {
      const catalogSource = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-smoothie-001',
        sourceCode: 'SMOOTH-01',
      });

      // Commercial establishment
      const sale = Sale.create({ source: catalogSource }, testClock);
      const item = sale.addItem(
        {
          source: catalogSource,
          description: 'Green Smoothie (500ml)',
          skuOrCode: 'SMOOTH-01',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
          discount: Discount.percentage(10, 'Historical Promo 10%'),
        },
        testClock,
      );

      expect(item.description).toBe('Green Smoothie (500ml)');
      expect(item.unitPrice.amount).toBe(20.0);
      expect(item.discount?.value).toBe(10);
      expect(item.subtotal.amount).toBe(20.0);
      expect(item.discountTotal.amount).toBe(2.0);
      expect(item.total.amount).toBe(18.0);
      expect(sale.total.amount).toBe(18.0);

      // External source modifies pricing, promotion, and description
      const updatedExternalCatalog = {
        name: 'Super Green Deluxe Smoothie (600ml)',
        newUnitPrice: Money.create(30.0, 'USD'),
        newDiscount: Discount.percentage(20, 'Updated Promo 20%'),
      };

      // Assert that established Sale and SaleItem remain completely unaffected
      expect(item.description).toBe('Green Smoothie (500ml)');
      expect(item.description).not.toBe(updatedExternalCatalog.name);
      expect(item.unitPrice.amount).toBe(20.0);
      expect(item.unitPrice.amount).not.toBe(updatedExternalCatalog.newUnitPrice.amount);
      expect(item.discount?.value).toBe(10);
      expect(item.discount?.value).not.toBe(updatedExternalCatalog.newDiscount.value);
      expect(item.subtotal.amount).toBe(20.0);
      expect(item.discountTotal.amount).toBe(2.0);
      expect(item.total.amount).toBe(18.0);
      expect(sale.subtotal.amount).toBe(20.0);
      expect(sale.discountTotal.amount).toBe(2.0);
      expect(sale.total.amount).toBe(18.0);
      expect(Object.isFrozen(item)).toBe(true);
    });
  });

  describe('Lifecycle Finalization: Immutability After Leaving DRAFT', () => {
    it('strictly prohibits discount modifications after finalization, payment, or completion', () => {
      const sale = Sale.create({ source: validSessionSource }, testClock);
      const item = sale.addItem(
        {
          source: validInventorySource,
          description: 'Physiotherapy Band',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
          discount: Discount.fixed(5.0, '$5 Discount'),
        },
        testClock,
      );

      expect(sale.status).toBe(SaleStatus.DRAFT);

      // Finalize the commercial agreement (DRAFT -> PENDING_PAYMENT)
      sale.finalize(testClock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Any attempt to mutate item discount must be rejected with SaleAlreadyFinalizedException
      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(10.0, 'Late Discount'), testClock);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.removeItemDiscount(item.id, testClock);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.addItem(
          {
            source: validInventorySource,
            description: 'Late Item',
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
          },
          testClock,
        );
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.updateItemQuantity(item.id, 5, testClock);
      }).toThrow(SaleAlreadyFinalizedException);

      // Transition to PAID
      sale.markPaid(testClock);
      expect(sale.status).toBe(SaleStatus.PAID);

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(10.0, 'Late Discount'), testClock);
      }).toThrow(SaleAlreadyFinalizedException);

      // Transition to COMPLETED
      sale.markCompleted(testClock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(10.0, 'Late Discount'), testClock);
      }).toThrow(SaleAlreadyFinalizedException);

      // Commercial totals remain preserved
      expect(sale.subtotal.amount).toBe(40.0);
      expect(sale.discountTotal.amount).toBe(5.0);
      expect(sale.total.amount).toBe(35.0);
    });
  });
});
