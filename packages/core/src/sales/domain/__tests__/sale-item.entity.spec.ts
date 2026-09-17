import { SaleItem } from '../entities/sale-item.entity';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';

describe('SaleItem Entity', () => {
  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_101',
    sourceCode: 'WHEY-VAN-01',
  });

  describe('Creation and Invariants', () => {
    it('creates a valid SaleItem and calculates subtotal and total without discount', () => {
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Vanilla Whey Protein (1kg)',
        skuOrCode: 'WHEY-VAN-01',
        quantity: 2,
        unitPrice: Money.create(45.0, 'USD'),
      });

      expect(item.id).toBeDefined();
      expect(item.source.equals(defaultSource)).toBe(true);
      expect(item.sourceReference.equals(defaultSource)).toBe(true);
      expect(item.description).toBe('Vanilla Whey Protein (1kg)');
      expect(item.skuOrCode).toBe('WHEY-VAN-01');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice.amount).toBe(45.0);
      expect(item.discount).toBeNull();
      expect(item.subtotal.amount).toBe(90.0);
      expect(item.discountTotal.amount).toBe(0.0);
      expect(item.total.amount).toBe(90.0);

      // Compatibility aliases
      expect(item.lineSubtotal.amount).toBe(90.0);
      expect(item.lineDiscountTotal.amount).toBe(0.0);
      expect(item.lineTotal.amount).toBe(90.0);
    });

    it('creates a valid SaleItem with fractional bulk quantity (up to 3 decimal places)', () => {
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Bulk Creatine Powder',
        quantity: 1.25,
        unitPrice: Money.create(20.0, 'USD'),
      });

      expect(item.quantity).toBe(1.25);
      expect(item.subtotal.amount).toBe(25.0);
      expect(item.total.amount).toBe(25.0);
    });

    it('calculates subtotal and total with percentage discount', () => {
      const discount = Discount.percentage(15, '15% Promo');
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Gym Bag',
        quantity: 1,
        unitPrice: Money.create(60.0, 'USD'),
        discount,
      });

      // 60.00 * 0.15 = 9.00
      expect(item.subtotal.amount).toBe(60.0);
      expect(item.discountTotal.amount).toBe(9.0);
      expect(item.total.amount).toBe(51.0);
    });

    it('calculates subtotal and total with fixed amount discount', () => {
      const discount = Discount.fixedAmount(15.5, 'Voucher');
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Foam Roller',
        quantity: 2,
        unitPrice: Money.create(20.0, 'USD'),
        discount,
      });

      // Subtotal: 40.00, Discount: 15.50, Total: 24.50
      expect(item.subtotal.amount).toBe(40.0);
      expect(item.discountTotal.amount).toBe(15.5);
      expect(item.total.amount).toBe(24.5);
    });

    it('caps fixed discount at subtotal so item total never drops below zero', () => {
      const discount = Discount.fixedAmount(100.0, 'Huge Coupon');
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Water Bottle',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
        discount,
      });

      expect(item.subtotal.amount).toBe(15.0);
      expect(item.discountTotal.amount).toBe(15.0);
      expect(item.total.amount).toBe(0.0);
    });

    it('rejects invalid quantity (zero, negative, NaN, non-finite)', () => {
      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: 0,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: -1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: NaN,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: Infinity,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('rejects invalid unit price', () => {
      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: 1,
          unitPrice: null as unknown as Money,
        });
      }).toThrow(InvalidSaleItemException);

      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: 1,
          unitPrice: { amount: 10, currency: 'USD' } as unknown as Money,
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('rejects empty or whitespace description', () => {
      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: '',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);

      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: '   ',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('rejects invalid discount object', () => {
      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
          discount: { value: 10 } as unknown as Discount,
        });
      }).toThrow(InvalidSaleItemException);
    });
  });

  describe('Immutability and Value Modification', () => {
    it('is immutable and frozen', () => {
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Protein Bar',
        quantity: 1,
        unitPrice: Money.create(3.5, 'USD'),
      });

      expect(Object.isFrozen(item)).toBe(true);
      expect(() => {
        (item as unknown as { description: string }).description = 'Hacked';
      }).toThrow();
    });

    it('returns a new SaleItem with updated quantity while preserving identity', () => {
      const original = SaleItem.create({
        source: defaultSource,
        description: 'Protein Bar',
        quantity: 1,
        unitPrice: Money.create(3.5, 'USD'),
      });

      const updated = original.withQuantity(4);

      expect(updated.id.equals(original.id)).toBe(true);
      expect(updated.quantity).toBe(4);
      expect(updated.subtotal.amount).toBe(14.0);
      expect(updated.total.amount).toBe(14.0);

      // Original remains completely unchanged
      expect(original.quantity).toBe(1);
      expect(original.subtotal.amount).toBe(3.5);
    });

    it('returns a new SaleItem with updated discount while preserving identity', () => {
      const original = SaleItem.create({
        source: defaultSource,
        description: 'Towel',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });

      const withDiscount = original.withDiscount(Discount.fixedAmount(5.0, 'Promo'));
      expect(withDiscount.id.equals(original.id)).toBe(true);
      expect(withDiscount.discountTotal.amount).toBe(5.0);
      expect(withDiscount.total.amount).toBe(15.0);

      const withoutDiscount = withDiscount.withDiscount(null);
      expect(withoutDiscount.discount).toBeNull();
      expect(withoutDiscount.discountTotal.amount).toBe(0.0);
      expect(withoutDiscount.total.amount).toBe(20.0);
    });
  });

  describe('Reconstitution and Historical Snapshot Validation', () => {
    it('reconstitutes an existing SaleItem when persisted totals reconcile', () => {
      const id = SaleItemId.create();
      const item = SaleItem.reconstitute({
        id,
        source: defaultSource,
        description: 'Historical Shaker Bottle',
        skuOrCode: 'SHAKE-01',
        quantity: 3,
        unitPrice: Money.create(10.0, 'USD'),
        discount: Discount.percentage(10, 'Historical Promo'),
        subtotal: Money.create(30.0, 'USD'),
        discountTotal: Money.create(3.0, 'USD'),
        total: Money.create(27.0, 'USD'),
      });

      expect(item.id.equals(id)).toBe(true);
      expect(item.subtotal.amount).toBe(30.0);
      expect(item.discountTotal.amount).toBe(3.0);
      expect(item.total.amount).toBe(27.0);
    });

    it('throws InvalidSaleItemException during reconstitution if subtotal does not reconcile', () => {
      expect(() => {
        SaleItem.reconstitute({
          id: SaleItemId.create(),
          source: defaultSource,
          description: 'Tampered Item',
          quantity: 2,
          unitPrice: Money.create(10.0, 'USD'),
          subtotal: Money.create(99.0, 'USD'), // Expected 20.00
          total: Money.create(99.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });

    it('throws InvalidSaleItemException during reconstitution if total does not reconcile', () => {
      expect(() => {
        SaleItem.reconstitute({
          id: SaleItemId.create(),
          source: defaultSource,
          description: 'Tampered Item',
          quantity: 2,
          unitPrice: Money.create(10.0, 'USD'),
          subtotal: Money.create(20.0, 'USD'),
          total: Money.create(5.0, 'USD'), // Expected 20.00
        });
      }).toThrow(InvalidSaleItemException);
    });
  });
});
