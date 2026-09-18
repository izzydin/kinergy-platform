import { Sale } from '../sale.aggregate';
import { Discount } from '../value-objects/discount.vo';
import { DiscountType } from '../enums/discount-type.enum';
import { Money } from '../value-objects/money.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { Clock } from '../shared/clock';
import {
  InvalidDiscountException,
  InvalidSaleStateException,
  SaleAlreadyFinalizedException,
} from '../exceptions';

class DeterministicClock implements Clock {
  constructor(private readonly currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

/**
 * Milestone 7.4.4: Discount Domain Integration & Deterministic Totals Lifecycle
 *
 * Preserves the domain contract established in Milestone 7.3 and guarantees:
 * 1. Single location for discount-to-monetary conversion (Discount.calculate / calculateReduction).
 * 2. Strict adherence to financial formula:
 *    subtotal = Σ(item.quantity × item.unitPrice)
 *    discountTotal = Σ(valid discounts)
 *    total = subtotal - discountTotal
 * 3. Invariants: subtotal >= 0, discountTotal >= 0, total >= 0.
 * 4. Regression protection: Discounts affect Sale totals exactly once (no double counting).
 */
describe('Milestone 7.4.4: Sale Discount Integration & Deterministic Calculation', () => {
  const clock = new DeterministicClock(new Date('2026-09-18T12:00:00.000Z'));

  const inventorySource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-protein-01',
    sourceCode: 'WHEY-VAN-01',
  });

  const sessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-rehab-02',
    sourceCode: 'KINESIO-60',
  });

  const membershipSource = SourceReference.create({
    sourceType: SourceType.MEMBERSHIP_PLAN,
    sourceId: 'plan-gold-03',
    sourceCode: 'GYM-GOLD-M',
  });

  // ==========================================================================
  // 1. No Discounts
  // ==========================================================================
  describe('1. No Discounts', () => {
    it('calculates totals correctly when no items have discounts', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      sale.addItem(
        {
          source: inventorySource,
          description: 'Whey Protein Tub',
          quantity: 2,
          unitPrice: Money.create(35.5, 'USD'),
        },
        clock,
      );

      sale.addItem(
        {
          source: sessionSource,
          description: 'Therapy Session',
          quantity: 1,
          unitPrice: Money.create(90.0, 'USD'),
        },
        clock,
      );

      // Subtotal: (2 * 35.50) + (1 * 90.00) = 71.00 + 90.00 = 161.00
      expect(sale.subtotal.cents).toBe(16100);
      expect(sale.subtotal.amount).toBe(161.0);

      // Discount total must be strictly zero
      expect(sale.discountTotal.cents).toBe(0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.discountTotal.isZero()).toBe(true);

      // Total must equal subtotal exactly
      expect(sale.total.cents).toBe(16100);
      expect(sale.total.amount).toBe(161.0);
      expect(sale.total.equals(sale.subtotal)).toBe(true);
      expect(sale.total.isPositive()).toBe(true);
    });

    it('calculates totals for empty draft sale with zero discounts', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      expect(sale.subtotal.isZero()).toBe(true);
      expect(sale.discountTotal.isZero()).toBe(true);
      expect(sale.total.isZero()).toBe(true);
      expect(sale.total.isNegative()).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Fixed Discount
  // ==========================================================================
  describe('2. Fixed Discount', () => {
    it('applies a valid fixed discount on a line item', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      const discount = Discount.fixed(15.0, '$15 Welcome Voucher');

      sale.addItem(
        {
          source: inventorySource,
          description: 'Ergonomic Foam Roller',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'), // subtotal = $50.00
          discount,
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(5000);
      expect(sale.discountTotal.cents).toBe(1500);
      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.total.cents).toBe(3500);
      expect(sale.total.amount).toBe(35.0);
    });

    it('applies fixed discount using exact integer minor units (cents)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      const discount = Discount.fixed(4.35, 'Coupon 4.35');

      sale.addItem(
        {
          source: inventorySource,
          description: 'Shaker Bottle',
          quantity: 1,
          unitPrice: Money.create(12.99, 'USD'),
          discount,
        },
        clock,
      );

      // 12.99 - 4.35 = 8.64
      expect(sale.subtotal.cents).toBe(1299);
      expect(sale.discountTotal.cents).toBe(435);
      expect(sale.total.cents).toBe(864);
      expect(sale.total.amount).toBe(8.64);
    });
  });

  // ==========================================================================
  // 3. Percentage Discount
  // ==========================================================================
  describe('3. Percentage Discount', () => {
    it('applies percentage discount with Commercial Half-Up rounding at cent boundary', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // 49.99 * 0.15 = 7.4985 -> rounds to 750 cents = $7.50
      sale.addItem(
        {
          source: inventorySource,
          description: 'Premium Resistance Bands',
          quantity: 1,
          unitPrice: Money.create(49.99, 'USD'),
          discount: Discount.percentage(15, '15% Seasonal Promo'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(4999);
      expect(sale.discountTotal.cents).toBe(750);
      expect(sale.discountTotal.amount).toBe(7.5);
      expect(sale.total.cents).toBe(4249);
      expect(sale.total.amount).toBe(42.49);
    });

    it('handles full 100% discount reducing total to exactly $0.00', () => {
      const sale = Sale.create({ source: sessionSource }, clock);

      sale.addItem(
        {
          source: sessionSource,
          description: 'Complimentary Initial Assessment',
          quantity: 1,
          unitPrice: Money.create(85.0, 'USD'),
          discount: Discount.percentage(100, 'First Visit 100% Free'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(8500);
      expect(sale.discountTotal.cents).toBe(8500);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
      expect(sale.total.isNegative()).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Multiple Discounts
  // ==========================================================================
  describe('4. Multiple Discounts', () => {
    it('reconciles multiple items with mixed discount types and an order discount', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Line 1: 2 x $30.00 = $60.00, fixed $10.00 discount -> subtotal 60.00, lineDisc 10.00 -> net 50.00
      sale.addItem(
        {
          source: inventorySource,
          description: 'Yoga Mat',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.fixed(10.0, '$10 Mat Discount'),
        },
        clock,
      );

      // Line 2: 1 x $100.00 = $100.00, 20% discount ($20.00) -> subtotal 100.00, lineDisc 20.00 -> net 80.00
      sale.addItem(
        {
          source: sessionSource,
          description: 'Kinesiology Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(20, '20% Member Consultation'),
        },
        clock,
      );

      // Line 3: 3 x $10.00 = $30.00, no discount -> subtotal 30.00, lineDisc 0.00 -> net 30.00
      sale.addItem(
        {
          source: inventorySource,
          description: 'Electrolyte Sachets',
          quantity: 3,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      // Pre-order totals:
      // Subtotal = 60.00 + 100.00 + 30.00 = 190.00
      // Line discounts = 10.00 + 20.00 + 0.00 = 30.00
      // Net pre-order subtotal = 190.00 - 30.00 = 160.00
      expect(sale.subtotal.cents).toBe(19000);
      expect(sale.discountTotal.cents).toBe(3000);
      expect(sale.total.cents).toBe(16000);

      // Apply order-level discount: 10% on remaining net pre-order subtotal ($160.00 * 0.10 = $16.00)
      sale.applyOrderDiscount(Discount.percentage(10, '10% Cart Coupon'), clock);

      // Grand aggregations:
      // Order discount = 16.00
      // Total discount = 30.00 (lines) + 16.00 (order) = 46.00
      // Final total = 190.00 - 46.00 = 144.00
      expect(sale.subtotal.cents).toBe(19000);
      expect(sale.discountTotal.cents).toBe(4600);
      expect(sale.discountTotal.amount).toBe(46.0);
      expect(sale.total.cents).toBe(14400);
      expect(sale.total.amount).toBe(144.0);
      expect(sale.total.cents + sale.discountTotal.cents).toBe(sale.subtotal.cents);
    });
  });

  // ==========================================================================
  // 5. Invalid Discount
  // ==========================================================================
  describe('5. Invalid Discount', () => {
    it('strictly rejects negative percentage discount', () => {
      expect(() => Discount.percentage(-5)).toThrow(InvalidDiscountException);
      expect(() => Discount.create({ type: DiscountType.PERCENTAGE, value: -0.01 })).toThrow(
        InvalidDiscountException,
      );
    });

    it('strictly rejects percentage discount exceeding 100%', () => {
      expect(() => Discount.percentage(100.01)).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(150)).toThrow(InvalidDiscountException);
    });

    it('strictly rejects negative fixed discount', () => {
      expect(() => Discount.fixed(-1.0)).toThrow(InvalidDiscountException);
      expect(() => Discount.fixedAmount(-50.0)).toThrow(InvalidDiscountException);
    });

    it('strictly rejects non-finite or NaN discount values', () => {
      expect(() => Discount.percentage(NaN)).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(Infinity)).toThrow(InvalidDiscountException);
      expect(() => Discount.fixed(NaN)).toThrow(InvalidDiscountException);
      expect(() => Discount.fixed(-Infinity)).toThrow(InvalidDiscountException);
    });

    it('rejects invalid discount objects passed to Sale and SaleItem', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      expect(() =>
        sale.applyOrderDiscount({ type: 'PERCENTAGE', value: 10 } as unknown as Discount, clock),
      ).toThrow(InvalidSaleStateException);

      const item = sale.addItem({
        source: inventorySource,
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });

      expect(() =>
        sale.applyItemDiscount(item.id, { value: 5 } as unknown as Discount, clock),
      ).toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 6. Excessive Discount
  // ==========================================================================
  describe('6. Excessive Discount', () => {
    it('strictly rejects line-item fixed discount exceeding subtotal upon creation (fast fail, no clamping)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Item subtotal = 1 x $40.00 = $40.00; discount = $45.00
      expect(() => {
        sale.addItem(
          {
            source: inventorySource,
            description: 'Foam Roller',
            quantity: 1,
            unitPrice: Money.create(40.0, 'USD'),
            discount: Discount.fixed(45.0, 'Exceeds Item Subtotal'),
          },
          clock,
        );
      }).toThrow(InvalidDiscountException);

      // Failure atomicity: Sale state is completely unchanged
      expect(sale.items.length).toBe(0);
      expect(sale.subtotal.isZero()).toBe(true);
      expect(sale.discountTotal.isZero()).toBe(true);
      expect(sale.total.isZero()).toBe(true);
    });

    it('strictly rejects applyItemDiscount when fixed discount exceeds line subtotal', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      const item = sale.addItem(
        {
          source: inventorySource,
          description: 'Chalk Block',
          quantity: 2,
          unitPrice: Money.create(10.0, 'USD'), // subtotal = 20.00
        },
        clock,
      );

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(25.0, 'Exceeds $20 Subtotal'), clock);
      }).toThrow(InvalidDiscountException);

      // Item and sale state remain untouched
      expect(sale.items[0]?.discount).toBeNull();
      expect(sale.discountTotal.isZero()).toBe(true);
      expect(sale.total.amount).toBe(20.0);
    });

    it('caps order voucher at remaining pre-order subtotal so total never violates total >= 0', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Wrist Wraps',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      // Excessive order discount: $100 voucher on a $25 sale
      sale.applyOrderDiscount(Discount.fixed(100.0, '$100 Massive Voucher'), clock);

      expect(sale.subtotal.cents).toBe(2500);
      // Capped at subtotal
      expect(sale.discountTotal.cents).toBe(2500);
      expect(sale.discountTotal.amount).toBe(25.0);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
      expect(sale.total.isNegative()).toBe(false);
    });
  });

  // ==========================================================================
  // 7. Zero-Value Discount If Permitted
  // ==========================================================================
  describe('7. Zero-Value Discount', () => {
    it('permits $0.00 fixed discount and 0% percentage discount', () => {
      const zeroFixed = Discount.fixed(0, 'Zero Fixed');
      const zeroPct = Discount.percentage(0, 'Zero Pct');

      expect(zeroFixed.value).toBe(0);
      expect(zeroPct.value).toBe(0);

      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Item with 0% Discount',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
          discount: zeroPct,
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(30.0);

      // Apply $0 order discount
      sale.applyOrderDiscount(zeroFixed, clock);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(30.0);
    });
  });

  // ==========================================================================
  // 8. Precision-Sensitive Percentage Discount
  // ==========================================================================
  describe('8. Precision-Sensitive Percentage Discount', () => {
    it('calculates complex percentage fractions without fractional penny leakage', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // 18.75% discount on $142.85:
      // 142.85 * 0.1875 = 26.784375 -> 2678.4375 cents -> Half-Up rounds to 2678 cents ($26.78)
      const discount = Discount.percentage(18.75, '18.75% Employee Concession');
      sale.addItem(
        {
          source: inventorySource,
          description: 'Specialty Equipment Package',
          quantity: 1,
          unitPrice: Money.create(142.85, 'USD'),
          discount,
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(14285);
      expect(sale.discountTotal.cents).toBe(2678);
      expect(sale.discountTotal.amount).toBe(26.78);
      expect(sale.total.cents).toBe(11607);
      expect(sale.total.amount).toBe(116.07);
      expect(sale.subtotal.cents - sale.discountTotal.cents).toBe(sale.total.cents);
    });

    it('handles exact sub-cent midpoint rounding up (Commercial Half-Up)', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // $0.01 * 50% = $0.005 -> 0.5 cents -> Half-Up rounds to 1 cent ($0.01)
      sale.addItem(
        {
          source: inventorySource,
          description: 'Penny Candy',
          quantity: 1,
          unitPrice: Money.create(0.01, 'USD'),
          discount: Discount.percentage(50, 'Half-price penny'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(1);
      expect(sale.discountTotal.cents).toBe(1);
      expect(sale.total.cents).toBe(0);
    });

    it('handles 33.33% discount on repeating decimals deterministically', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // 33.33 * 0.15 = 4.9995 -> 499.95 cents -> Half-Up rounds to 500 cents ($5.00)
      sale.addItem(
        {
          source: inventorySource,
          description: 'Third Share Item',
          quantity: 1,
          unitPrice: Money.create(33.33, 'USD'),
          discount: Discount.percentage(15, '15% Promo'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(3333);
      expect(sale.discountTotal.cents).toBe(500);
      expect(sale.discountTotal.amount).toBe(5.0);
      expect(sale.total.cents).toBe(2833);
      expect(sale.total.amount).toBe(28.33);
    });
  });

  // ==========================================================================
  // 9. Combination of Item Prices and Discounts
  // ==========================================================================
  describe('9. Combination of Item Prices and Discounts', () => {
    it('accurately reconciles fractional quantities, free items, and tiered discounts', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Fractional consumable: 1.250 kg @ $24.00/kg = $30.00, 10% discount ($3.00) -> net $27.00
      sale.addItem(
        {
          source: inventorySource,
          description: 'Bulk Protein Powder (1.250 kg)',
          quantity: 1.25,
          unitPrice: Money.create(24.0, 'USD'),
          discount: Discount.percentage(10, '10% Bulk Discount'),
        },
        clock,
      );

      // Complimentary gift: 1 @ $0.00 = $0.00
      sale.addItem(
        {
          source: inventorySource,
          description: 'Free Promotional Wristband',
          quantity: 1,
          unitPrice: Money.zero('USD'),
        },
        clock,
      );

      // Premium therapy session: 1 @ $150.00, fixed $25.00 voucher -> net $125.00
      sale.addItem(
        {
          source: sessionSource,
          description: 'Comprehensive Kinesiology Evaluation',
          quantity: 1,
          unitPrice: Money.create(150.0, 'USD'),
          discount: Discount.fixed(25.0, 'Doctor Referral Voucher'),
        },
        clock,
      );

      // Gym membership: 1 @ $89.99, no discount -> net $89.99
      sale.addItem(
        {
          source: membershipSource,
          description: 'Monthly All-Access Gym Pass',
          quantity: 1,
          unitPrice: Money.create(89.99, 'USD'),
        },
        clock,
      );

      // Line subtotals: 30.00 + 0.00 + 150.00 + 89.99 = 269.99
      // Line discounts: 3.00 + 0.00 + 25.00 + 0.00 = 28.00
      // Pre-order net = 269.99 - 28.00 = 241.99
      expect(sale.subtotal.cents).toBe(26999);
      expect(sale.discountTotal.cents).toBe(2800);
      expect(sale.total.cents).toBe(24199);

      // Apply fixed order discount of $20.00
      sale.applyOrderDiscount(Discount.fixed(20.0, 'Front-Desk Loyalty Reward'), clock);

      // Total discount: 28.00 + 20.00 = 48.00
      // Final total: 269.99 - 48.00 = 221.99
      expect(sale.subtotal.cents).toBe(26999);
      expect(sale.discountTotal.cents).toBe(4800);
      expect(sale.discountTotal.amount).toBe(48.0);
      expect(sale.total.cents).toBe(22199);
      expect(sale.total.amount).toBe(221.99);
    });
  });

  // ==========================================================================
  // 10. Repeated Calculation Producing the Same Result (Idempotence)
  // ==========================================================================
  describe('10. Repeated Calculation Idempotence', () => {
    it('produces strictly bit-for-bit identical totals over multiple access and recalculation cycles', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Item A',
          quantity: 3,
          unitPrice: Money.create(19.95, 'USD'),
          discount: Discount.percentage(12.5, '12.5% Promo'),
        },
        clock,
      );

      sale.addItem(
        {
          source: sessionSource,
          description: 'Item B',
          quantity: 1,
          unitPrice: Money.create(80.0, 'USD'),
          discount: Discount.fixed(15.0, 'Voucher'),
        },
        clock,
      );

      sale.applyOrderDiscount(Discount.percentage(5, 'Order 5%'), clock);

      const subtotal1 = sale.subtotal;
      const discountTotal1 = sale.discountTotal;
      const total1 = sale.total;

      // Re-read properties multiple times
      for (let i = 0; i < 5; i++) {
        expect(sale.subtotal.cents).toBe(subtotal1.cents);
        expect(sale.discountTotal.cents).toBe(discountTotal1.cents);
        expect(sale.total.cents).toBe(total1.cents);
        expect(sale.subtotal.equals(subtotal1)).toBe(true);
        expect(sale.discountTotal.equals(discountTotal1)).toBe(true);
        expect(sale.total.equals(total1)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 11. Regression Protection: Discount Cannot Be Counted Twice
  // ==========================================================================
  describe('11. Regression Protection: Preventing Double Counting', () => {
    it('REG-01: updating item quantity recalculates discount cleanly without accumulating old discounts', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      // Line: 1 x $100.00 with fixed $20.00 discount -> subtotal 100.00, discount 20.00, total 80.00
      const item = sale.addItem(
        {
          source: inventorySource,
          description: 'Adjustable Barbell',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(20.0, '$20 Voucher'),
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(80.0);

      // Increase quantity to 2:
      // Fixed discount remains $20.00 (discount does NOT double into $40.00, nor keep the previous $20 + new $20)
      sale.updateItemQuantity(item.id, 2, clock);

      expect(sale.subtotal.amount).toBe(200.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(180.0);

      // Increase quantity to 3:
      sale.updateItemQuantity(item.id, 3, clock);

      expect(sale.subtotal.amount).toBe(300.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(280.0);
    });

    it('REG-02: replacing an item discount replaces the previous discount instead of adding to it', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      const item = sale.addItem(
        {
          source: inventorySource,
          description: 'Resistance Bands Set',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(10.0, 'Initial $10 Voucher'),
        },
        clock,
      );

      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(40.0);

      // Replace with a 20% discount (20% of $50 = $10.00)
      sale.applyItemDiscount(item.id, Discount.percentage(20, 'Upgraded 20% Discount'), clock);

      // Must NOT be $10 + $10 = $20. Exactly $10.00
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(40.0);

      // Replace with a $15.00 fixed discount
      sale.applyItemDiscount(item.id, Discount.fixed(15.0, 'Superceded $15 Voucher'), clock);

      // Must be exactly $15.00, not $10 + $10 + $15 = $35.00
      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(35.0);
    });

    it('REG-03: replacing order discount replaces the previous order discount cleanly', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Gym Bag',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      // First order discount: $10.00
      sale.applyOrderDiscount(Discount.fixed(10.0, '$10 Coupon'), clock);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(90.0);

      // Second order discount: $25.00
      sale.applyOrderDiscount(Discount.fixed(25.0, 'VIP $25 Coupon'), clock);
      // Must NOT be $10 + $25 = $35
      expect(sale.discountTotal.amount).toBe(25.0);
      expect(sale.total.amount).toBe(75.0);

      // Remove order discount
      sale.removeOrderDiscount(clock);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(100.0);
    });

    it('REG-04: removing discounted item clears its discount contribution entirely from aggregate totals', () => {
      const sale = Sale.create({ source: inventorySource }, clock);

      const item1 = sale.addItem(
        {
          source: inventorySource,
          description: 'Item To Keep',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(5.0, '$5 Off'),
        },
        clock,
      );

      const item2 = sale.addItem(
        {
          source: inventorySource,
          description: 'Item To Remove',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(20.0, '$20 Off'),
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(150.0);
      expect(sale.discountTotal.amount).toBe(25.0);
      expect(sale.total.amount).toBe(125.0);

      // Remove item2
      sale.removeItem(item2.id, clock);

      // Totals must reflect only item1, with no residual discount from item2
      expect(sale.items.length).toBe(1);
      expect(sale.items[0]?.id.equals(item1.id)).toBe(true);
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.discountTotal.amount).toBe(5.0);
      expect(sale.total.amount).toBe(45.0);
    });

    it('REG-05: reconstitution verifies that snapshot totals reconcile with single-application discount sum', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Reconstituted Item',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.percentage(10, '10% Discount'),
        },
        clock,
      );

      // Subtotal: 60.00, Discount: 6.00, Total: 54.00
      expect(sale.subtotal.amount).toBe(60.0);
      expect(sale.discountTotal.amount).toBe(6.0);
      expect(sale.total.amount).toBe(54.0);

      // Reconstitute with exact matching values succeeds
      const reconstituted = Sale.reconstitute({
        id: sale.id,
        source: sale.source,
        status: sale.status,
        currency: sale.currency,
        items: [...sale.items],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: sale.version,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
      });

      expect(reconstituted.subtotal.equals(sale.subtotal)).toBe(true);
      expect(reconstituted.discountTotal.equals(sale.discountTotal)).toBe(true);
      expect(reconstituted.total.equals(sale.total)).toBe(true);

      // Reconstituting with double-counted discountTotal must be rejected
      expect(() => {
        Sale.reconstitute({
          id: sale.id,
          source: sale.source,
          status: sale.status,
          currency: sale.currency,
          items: [...sale.items],
          subtotal: sale.subtotal,
          discountTotal: Money.create(12.0, 'USD'), // double-counted!
          total: Money.create(48.0, 'USD'),
          version: sale.version,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        });
      }).toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 12. State Transition Locks
  // ==========================================================================
  describe('12. State Transition Locks', () => {
    it('forbids applying or removing discounts once departing DRAFT status', () => {
      const sale = Sale.create({ source: inventorySource }, clock);
      const item = sale.addItem(
        {
          source: inventorySource,
          description: 'Lockable Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      expect(() => sale.applyItemDiscount(item.id, Discount.fixed(10.0), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.removeItemDiscount(item.id, clock)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.applyOrderDiscount(Discount.fixed(10.0), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.removeOrderDiscount(clock)).toThrow(SaleAlreadyFinalizedException);
    });
  });
});
