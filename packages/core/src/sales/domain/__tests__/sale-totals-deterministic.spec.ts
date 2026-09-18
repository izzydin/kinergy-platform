import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleStatus } from '../enums/sale-status.enum';
import { Clock } from '../shared/clock';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';

class MockClock implements Clock {
  private _currentTime: Date;

  constructor(initialTime: Date = new Date('2026-09-18T10:00:00.000Z')) {
    this._currentTime = initialTime;
  }

  public now(): Date {
    return new Date(this._currentTime.getTime());
  }

  public advanceMinutes(minutes: number): void {
    this._currentTime = new Date(this._currentTime.getTime() + minutes * 60000);
  }
}

describe('Deterministic Sale Total Calculation (Milestone 7.4)', () => {
  const clock = new MockClock();
  const sessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'sess_001',
  });
  const inventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_001',
  });
  const gymSource = SourceReference.create({
    sourceType: SourceType.MEMBERSHIP_PLAN,
    sourceId: 'plan_001',
  });

  // ============================================================================
  // 1. Subtotal Calculations
  // ============================================================================
  describe('1. Subtotal Calculations', () => {
    it('calculates subtotal for a single item with integer quantity and price', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'Kinesiology 60min Session',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });

      expect(sale.subtotal.cents).toBe(10000);
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.subtotal.currency).toBe('USD');
      expect(sale.items[0]!.subtotal.equals(Money.create(100.0, 'USD'))).toBe(true);
      expect(sale.items[0]!.lineTotal.equals(Money.create(100.0, 'USD'))).toBe(true);
    });

    it('calculates subtotal for multiple items with different quantities and prices', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Item 1: 2 x $25.50 = $51.00 (5100 cents)
      sale.addItem({
        source: inventorySource,
        description: 'Protein Shaker',
        quantity: 2,
        unitPrice: Money.create(25.5, 'USD'),
      });

      // Item 2: 3 x $4.99 = $14.97 (1497 cents)
      sale.addItem({
        source: inventorySource,
        description: 'Electrolyte Gel',
        quantity: 3,
        unitPrice: Money.create(4.99, 'USD'),
      });

      // Item 3: 1 x $120.00 = $120.00 (12000 cents)
      sale.addItem({
        source: gymSource,
        description: 'Monthly Pass',
        quantity: 1,
        unitPrice: Money.create(120.0, 'USD'),
      });

      // Expected subtotal: $51.00 + $14.97 + $120.00 = $185.97 (18597 cents)
      expect(sale.subtotal.cents).toBe(18597);
      expect(sale.subtotal.amount).toBe(185.97);
      expect(sale.subtotal.toString()).toBe('185.97 USD');
    });

    it('enforces quantity domain rules (strictly positive quantity; rejects zero)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Quantity must be strictly positive (> 0)
      expect(() => {
        sale.addItem({
          source: inventorySource,
          description: 'Zero quantity item',
          quantity: 0,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      // Fractional quantity below precision boundary rounding to zero is rejected
      expect(() => {
        sale.addItem({
          source: inventorySource,
          description: 'Sub-precision quantity item',
          quantity: 0.0004,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      // Minimum valid fractional quantity: 0.001
      const item = sale.addItem({
        source: inventorySource,
        description: 'Bulk Powder (1g)',
        quantity: 0.001,
        unitPrice: Money.create(50.0, 'USD'), // 0.001 * 5000 cents = 5 cents ($0.05)
      });
      expect(item.quantity).toBe(0.001);
      expect(item.subtotal.cents).toBe(5);
      expect(item.subtotal.amount).toBe(0.05);
      expect(sale.subtotal.cents).toBe(5);
    });

    it('supports zero unit price for complimentary promotional items', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      sale.addItem({
        source: inventorySource,
        description: 'Complimentary Welcome Water',
        quantity: 1,
        unitPrice: Money.zero('USD'),
      });

      expect(sale.subtotal.cents).toBe(0);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.subtotal.isZero()).toBe(true);
      expect(sale.total.isZero()).toBe(true);
    });

    it('calculates complex subtotal with fractional bulk quantities and decimal prices', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // 1.250 kg @ $24.50/kg = 2450 cents * 1.250 = 3062.5 cents -> Half-Up rounds to 3063 cents ($30.63)
      sale.addItem({
        source: inventorySource,
        description: 'Bulk Protein Powder',
        quantity: 1.25,
        unitPrice: Money.create(24.5, 'USD'),
      });

      // 0.750 L @ $18.25/L = 1825 cents * 0.750 = 1368.75 cents -> Half-Up rounds to 1369 cents ($13.69)
      sale.addItem({
        source: inventorySource,
        description: 'Massage Oil',
        quantity: 0.75,
        unitPrice: Money.create(18.25, 'USD'),
      });

      // Subtotal = 3063 + 1369 = 4432 cents ($44.32)
      expect(sale.subtotal.cents).toBe(4432);
      expect(sale.subtotal.amount).toBe(44.32);
    });

    it('handles large realistic commercial Sale with 10+ diverse items without drift', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      const itemsConfig = [
        { qty: 1, price: 150.0 }, // 150.00
        { qty: 2, price: 45.0 }, // 90.00
        { qty: 4, price: 12.5 }, // 50.00
        { qty: 3, price: 3.75 }, // 11.25
        { qty: 1, price: 89.99 }, // 89.99
        { qty: 5, price: 2.2 }, // 11.00
        { qty: 2, price: 65.49 }, // 130.98
        { qty: 1, price: 0.0 }, // 0.00 (promo)
        { qty: 10, price: 1.99 }, // 19.90
        { qty: 1.5, price: 20.0 }, // 30.00
      ];

      let manualSumCents = 0;
      for (let i = 0; i < itemsConfig.length; i++) {
        const conf = itemsConfig[i]!;
        const item = sale.addItem({
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: `sku_${i}`,
          }),
          description: `Line item ${i + 1}`,
          quantity: conf.qty,
          unitPrice: Money.create(conf.price, 'USD'),
        });
        manualSumCents += item.subtotal.cents;
      }

      expect(sale.items).toHaveLength(10);
      expect(sale.subtotal.cents).toBe(manualSumCents);
      // 150.00 + 90.00 + 50.00 + 11.25 + 89.99 + 11.00 + 130.98 + 0.00 + 19.90 + 30.00 = 583.12
      expect(sale.subtotal.cents).toBe(58312);
      expect(sale.subtotal.amount).toBe(583.12);
    });
  });

  // ============================================================================
  // 2. Discount Calculations & Invariants
  // ============================================================================
  describe('2. Discount Calculations & Invariants', () => {
    it('reports zero discountTotal when no discounts are applied', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'Session',
        quantity: 1,
        unitPrice: Money.create(80.0, 'USD'),
      });

      expect(sale.discountTotal.cents).toBe(0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.discountTotal.isZero()).toBe(true);
      expect(sale.total.equals(sale.subtotal)).toBe(true);
    });

    it('calculates single fixed line discount correctly', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'Session',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        discount: Discount.fixed(15.0, 'First Visit Credit'),
      });

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(85.0);
      expect(sale.items[0]!.total.amount).toBe(85.0);
    });

    it('calculates multiple fixed line discounts across separate items', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: 'Item A',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        discount: Discount.fixed(10.0, 'Promo A'),
      });
      sale.addItem({
        source: inventorySource,
        description: 'Item B',
        quantity: 2,
        unitPrice: Money.create(30.0, 'USD'), // Subtotal $60
        discount: Discount.fixed(5.0, 'Promo B'),
      });

      expect(sale.subtotal.cents).toBe(11000); // 50 + 60 = 110.00
      expect(sale.discountTotal.cents).toBe(1500); // 10 + 5 = 15.00
      expect(sale.total.cents).toBe(9500); // 110 - 15 = 95.00
    });

    it('calculates percentage line discounts with exact cent Half-Up rounding', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      // Item: 1 x $49.99 with 15% VIP discount
      // 4999 cents * 0.15 = 749.85 cents -> Half-Up rounds to 750 cents ($7.50)
      sale.addItem({
        source: inventorySource,
        description: 'Premium Foam Roller',
        quantity: 1,
        unitPrice: Money.create(49.99, 'USD'),
        discount: Discount.percentage(15, 'VIP 15%'),
      });

      expect(sale.subtotal.cents).toBe(4999);
      expect(sale.discountTotal.cents).toBe(750);
      expect(sale.total.cents).toBe(4249); // 49.99 - 7.50 = 42.49
      expect(sale.total.amount).toBe(42.49);
    });

    it('combines multiple line discounts with an order-level discount', () => {
      const sale = Sale.create({ source: sessionSource }, clock);

      // Item 1: 1 x $100 with $10 fixed discount -> Net $90
      sale.addItem({
        source: sessionSource,
        description: 'Assessment',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        discount: Discount.fixed(10.0, 'Promo'),
      });

      // Item 2: 1 x $50 with no line discount -> Net $50
      sale.addItem({
        source: sessionSource,
        description: 'Follow-up',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });

      // Subtotal = $150.00
      // Line discounts = $10.00
      // Pre-order net = $140.00
      // Order discount = 10% on $140.00 = $14.00 (1400 cents)
      sale.applyOrderDiscount(Discount.percentage(10, 'Seasonal 10%'));

      expect(sale.subtotal.cents).toBe(15000);
      expect(sale.discountTotal.cents).toBe(2400); // $10 line + $14 order = $24.00
      expect(sale.total.cents).toBe(12600); // $150 - $24 = $126.00
    });

    it('strictly excludes invalid discounts according to Milestone 7.3 rules', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // 1. Line fixed discount exceeding item subtotal is rejected
      expect(() => {
        sale.addItem({
          source: inventorySource,
          description: 'Cheap Tape',
          quantity: 1,
          unitPrice: Money.create(5.0, 'USD'),
          discount: Discount.fixed(10.0, 'Excessive Discount'),
        });
      }).toThrow(InvalidDiscountException);

      // 2. Negative discount percentage rejected
      expect(() => Discount.percentage(-5)).toThrow(InvalidDiscountException);

      // 3. Discount percentage > 100% rejected
      expect(() => Discount.percentage(101)).toThrow(InvalidDiscountException);

      // 4. Negative fixed discount rejected
      expect(() => Discount.fixed(-10)).toThrow(InvalidDiscountException);
    });
  });

  // ============================================================================
  // 3. Total Calculations & Floor Invariants
  // ============================================================================
  describe('3. Total Calculations & Floor Invariants', () => {
    it('ensures total equals subtotal when no discount is applied', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'Standard Rehab',
        quantity: 1,
        unitPrice: Money.create(95.0, 'USD'),
      });

      expect(sale.total.cents).toBe(9500);
      expect(sale.total.equals(sale.subtotal)).toBe(true);
    });

    it('ensures total reconciles exactly: total = subtotal - discountTotal', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'Session A',
        quantity: 2,
        unitPrice: Money.create(75.0, 'USD'), // 150.00
        discount: Discount.fixed(20.0, 'Early Bird'),
      });
      sale.applyOrderDiscount(Discount.fixed(15.0, 'Member Appreciation'));

      const expectedSubtotal = Money.create(150.0, 'USD');
      const expectedDiscount = Money.create(35.0, 'USD');
      const expectedTotal = Money.create(115.0, 'USD');

      expect(sale.subtotal.equals(expectedSubtotal)).toBe(true);
      expect(sale.discountTotal.equals(expectedDiscount)).toBe(true);
      expect(sale.total.equals(expectedTotal)).toBe(true);
      expect(sale.total.equals(sale.subtotal.subtract(sale.discountTotal))).toBe(true);
    });

    it('handles exact zero total when 100% discount is applied', () => {
      const sale = Sale.create({ source: sessionSource }, clock);
      sale.addItem({
        source: sessionSource,
        description: 'VIP Complimentary Session',
        quantity: 1,
        unitPrice: Money.create(120.0, 'USD'),
        discount: Discount.percentage(100, 'Staff Comp'),
      });

      expect(sale.subtotal.cents).toBe(12000);
      expect(sale.discountTotal.cents).toBe(12000);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
      expect(sale.total.amount).toBe(0.0);
    });

    it('preserves $0.00 floor when large order discount exceeds pre-order subtotal', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: 'Water Bottle',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });

      // Voucher of $100 on a $15 item
      sale.applyOrderDiscount(Discount.fixed(100.0, 'Big Voucher'));

      expect(sale.subtotal.cents).toBe(1500);
      // Capped at subtotal: cannot exceed $15.00
      expect(sale.discountTotal.cents).toBe(1500);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
      expect(sale.total.amount).toBe(0.0);
      // Total must never be negative
      expect(sale.total.isNegative()).toBe(false);
    });

    it('handles boundary scale values (relational maximum column boundary)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      // Item near relational maximum
      sale.addItem({
        source: inventorySource,
        description: 'State of the Art Equipment Suite',
        quantity: 1,
        unitPrice: Money.create(5000000000.0, 'USD'), // $5 billion
      });
      sale.addItem({
        source: inventorySource,
        description: 'Specialized Hardware Calibration',
        quantity: 1,
        unitPrice: Money.create(4999999999.99, 'USD'), // $4.999 billion
      });

      // Total = $9,999,999,999.99 (Postgres DECIMAL(12, 2) maximum)
      expect(sale.subtotal.cents).toBe(999999999999);
      expect(sale.total.cents).toBe(999999999999);
      expect(sale.total.amount).toBe(9999999999.99);
      expect(sale.total.toString()).toBe('9999999999.99 USD');
    });
  });

  // ============================================================================
  // 4. Mathematical Determinism & Ordering Independence
  // ============================================================================
  describe('4. Mathematical Determinism & Ordering Independence', () => {
    it('produces bit-for-bit identical monetary totals for identical inputs', () => {
      const createCart = (): Sale => {
        const s = Sale.create({ source: inventorySource }, clock);
        s.addItem({
          source: inventorySource,
          description: 'Item 1',
          quantity: 3,
          unitPrice: Money.create(19.99, 'USD'),
          discount: Discount.percentage(10, '10% line'),
        });
        s.addItem({
          source: inventorySource,
          description: 'Item 2',
          quantity: 1.5,
          unitPrice: Money.create(25.4, 'USD'),
        });
        s.applyOrderDiscount(Discount.fixed(5.0, '$5 order coupon'));
        return s;
      };

      const cart1 = createCart();
      const cart2 = createCart();
      const cart3 = createCart();

      expect(cart1.subtotal.cents).toBe(cart2.subtotal.cents);
      expect(cart2.subtotal.cents).toBe(cart3.subtotal.cents);

      expect(cart1.discountTotal.cents).toBe(cart2.discountTotal.cents);
      expect(cart2.discountTotal.cents).toBe(cart3.discountTotal.cents);

      expect(cart1.total.cents).toBe(cart2.total.cents);
      expect(cart2.total.cents).toBe(cart3.total.cents);

      expect(cart1.subtotal.equals(cart2.subtotal)).toBe(true);
      expect(cart1.discountTotal.equals(cart2.discountTotal)).toBe(true);
      expect(cart1.total.equals(cart2.total)).toBe(true);
    });

    it('guarantees additive ordering independence for independent line items', () => {
      // Basket A added in order [Item1, Item2, Item3]
      const saleA = Sale.create({ source: inventorySource }, clock);
      saleA.addItem({
        source: inventorySource,
        description: 'Towel',
        quantity: 2,
        unitPrice: Money.create(12.5, 'USD'),
      });
      saleA.addItem({
        source: inventorySource,
        description: 'Shake',
        quantity: 1,
        unitPrice: Money.create(8.95, 'USD'),
      });
      saleA.addItem({
        source: inventorySource,
        description: 'Wristband',
        quantity: 4,
        unitPrice: Money.create(3.25, 'USD'),
      });

      // Basket B added in reversed order [Item3, Item2, Item1]
      const saleB = Sale.create({ source: inventorySource }, clock);
      saleB.addItem({
        source: inventorySource,
        description: 'Wristband',
        quantity: 4,
        unitPrice: Money.create(3.25, 'USD'),
      });
      saleB.addItem({
        source: inventorySource,
        description: 'Shake',
        quantity: 1,
        unitPrice: Money.create(8.95, 'USD'),
      });
      saleB.addItem({
        source: inventorySource,
        description: 'Towel',
        quantity: 2,
        unitPrice: Money.create(12.5, 'USD'),
      });

      expect(saleA.subtotal.cents).toBe(saleB.subtotal.cents);
      expect(saleA.total.cents).toBe(saleB.total.cents);
      expect(saleA.total.equals(saleB.total)).toBe(true);
    });
  });

  // ============================================================================
  // 5. Floating-Point Drift Regressions
  // ============================================================================
  describe('5. Floating-Point Drift Regressions', () => {
    it('reg-01: handles 0.10 + 0.20 addition without IEEE-754 float drift', () => {
      // In native JS: 0.1 + 0.2 === 0.30000000000000004
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: '10 cent washer',
        quantity: 1,
        unitPrice: Money.create(0.1, 'USD'),
      });
      sale.addItem({
        source: inventorySource,
        description: '20 cent bolt',
        quantity: 1,
        unitPrice: Money.create(0.2, 'USD'),
      });

      expect(sale.subtotal.cents).toBe(30);
      expect(sale.subtotal.amount).toBe(0.3);
      expect(sale.subtotal.toString()).toBe('0.30 USD');
      expect(sale.total.equals(Money.create(0.3, 'USD'))).toBe(true);
    });

    it('reg-02: handles 19.99 * 3 multiplication without float precision artifacts', () => {
      // In native JS: 19.99 * 3 === 59.970000000000006
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: 'Resistance Band',
        quantity: 3,
        unitPrice: Money.create(19.99, 'USD'),
      });

      expect(sale.subtotal.cents).toBe(5997);
      expect(sale.subtotal.amount).toBe(59.97);
      expect(sale.subtotal.toString()).toBe('59.97 USD');
    });

    it('reg-03: handles midpoint half-up rounding on fractional quantity (24.50 * 1.25 = 30.63)', () => {
      // 24.50 * 1.25 = 30.625 -> half-up rounds away from zero to 30.63
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: 'Organic Balm',
        quantity: 1.25,
        unitPrice: Money.create(24.5, 'USD'),
      });

      expect(sale.subtotal.cents).toBe(3063);
      expect(sale.subtotal.amount).toBe(30.63);
    });

    it('reg-04: handles float subtraction artifacts (1.005 - 1.000 = 0.01 cent boundary)', () => {
      // In native JS: 1.005 - 1.000 === 0.004999999999999893
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem({
        source: inventorySource,
        description: 'Item Dollar',
        quantity: 1,
        unitPrice: Money.create(1.0, 'USD'),
        discount: Discount.fixed(0.99, '99 cent off'),
      });

      expect(sale.subtotal.cents).toBe(100);
      expect(sale.discountTotal.cents).toBe(99);
      expect(sale.total.cents).toBe(1);
      expect(sale.total.amount).toBe(0.01);
    });

    it('reg-05: accumulates 100 penny items to exact $1.00 without floating drift', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      for (let i = 0; i < 100; i++) {
        sale.addItem({
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: `penny_${i}`,
          }),
          description: `Penny item ${i}`,
          quantity: 1,
          unitPrice: Money.create(0.01, 'USD'),
        });
      }

      expect(sale.items).toHaveLength(100);
      expect(sale.subtotal.cents).toBe(100);
      expect(sale.subtotal.amount).toBe(1.0);
      expect(sale.total.cents).toBe(100);
      expect(sale.total.amount).toBe(1.0);
      expect(sale.total.equals(Money.create(1.0, 'USD'))).toBe(true);
    });
  });

  // ============================================================================
  // 6. Reconstitution Reconciliation Invariants
  // ============================================================================
  describe('6. Reconstitution Reconciliation Invariants', () => {
    it('successfully reconstitutes when persisted snapshot totals reconcile exactly', () => {
      const saleId = SaleId.create();
      const item = SaleItem.create({
        saleId,
        source: inventorySource,
        description: 'Towel',
        quantity: 2,
        unitPrice: Money.create(15.0, 'USD'),
      });

      const sale = Sale.reconstitute({
        id: saleId,
        source: inventorySource,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        items: [item],
        subtotal: Money.create(30.0, 'USD'),
        discountTotal: Money.zero('USD'),
        total: Money.create(30.0, 'USD'),
      });

      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.total.amount).toBe(30.0);
    });

    it('rejects reconstitution if persisted total drifts by even 1 cent', () => {
      const saleId = SaleId.create();
      const item = SaleItem.create({
        saleId,
        source: inventorySource,
        description: 'Towel',
        quantity: 2,
        unitPrice: Money.create(15.0, 'USD'), // Subtotal $30.00
      });

      expect(() => {
        Sale.reconstitute({
          id: saleId,
          source: inventorySource,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          version: 1,
          createdAt: clock.now(),
          updatedAt: clock.now(),
          items: [item],
          subtotal: Money.create(30.0, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(30.01, 'USD'), // 1 cent drift!
        });
      }).toThrow(/Invariant violated/);
    });
  });
});
