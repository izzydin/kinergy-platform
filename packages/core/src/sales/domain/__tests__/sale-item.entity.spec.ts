import { SaleItem } from '../entities/sale-item.entity';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';

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

    it('rejects fixed discount exceeding subtotal with InvalidDiscountException', () => {
      const discount = Discount.fixedAmount(100.0, 'Huge Coupon');
      expect(() => {
        SaleItem.create({
          source: defaultSource,
          description: 'Water Bottle',
          quantity: 1,
          unitPrice: Money.create(15.0, 'USD'),
          discount,
        });
      }).toThrow(InvalidDiscountException);
    });

    it('allows fixed discount exactly equal to subtotal resulting in zero total', () => {
      const discount = Discount.fixedAmount(15.0, 'Full Price Voucher');
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

    it('reconstitutes with optional saleId from instance or string', () => {
      const saleId = SaleId.create('sale_rec_999');
      const itemWithInstance = SaleItem.reconstitute({
        id: SaleItemId.create(),
        saleId,
        source: defaultSource,
        description: 'Historical Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      expect(itemWithInstance.saleId?.equals(saleId)).toBe(true);

      const itemWithString = SaleItem.reconstitute({
        id: SaleItemId.create(),
        saleId: 'sale_rec_999',
        source: defaultSource,
        description: 'Historical Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      expect(itemWithString.saleId?.value).toBe('sale_rec_999');
    });

    it('throws InvalidSaleItemException on reconstitution if saleId is invalid', () => {
      expect(() => {
        SaleItem.reconstitute({
          id: SaleItemId.create(),
          saleId: '   ' as unknown as SaleId,
          source: defaultSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        });
      }).toThrow(InvalidSaleItemException);
    });
  });

  describe('Entity Identity & Equality', () => {
    it('returns true when comparing two SaleItem instances with identical SaleItemId', () => {
      const id = SaleItemId.create('item_common_1');
      const item1 = SaleItem.create({
        id,
        source: defaultSource,
        description: 'Product A',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      const item2 = SaleItem.create({
        id,
        source: defaultSource,
        description: 'Product A (Modified Description)',
        quantity: 5,
        unitPrice: Money.create(20.0, 'USD'),
      });

      expect(item1.equals(item2)).toBe(true);
    });

    it('returns false when comparing two SaleItem instances with different IDs', () => {
      const item1 = SaleItem.create({
        source: defaultSource,
        description: 'Product A',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      const item2 = SaleItem.create({
        source: defaultSource,
        description: 'Product A',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(item1.equals(item2)).toBe(false);
    });

    it('returns false when comparing against null or undefined or non-SaleItem', () => {
      const item = SaleItem.create({
        source: defaultSource,
        description: 'Product A',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(item.equals(null)).toBe(false);
      expect(item.equals(undefined)).toBe(false);
      expect(item.equals({} as unknown as SaleItem)).toBe(false);
    });
  });

  describe('Snapshot Serialization', () => {
    it('produces a plain JavaScript snapshot with all properties for persistence mapping', () => {
      const saleId = SaleId.create('sale_snap_1');
      const discount = Discount.percentage(10, 'Seasonal Discount');
      const item = SaleItem.create({
        saleId,
        source: defaultSource,
        description: 'Snapshot Product',
        skuOrCode: 'SNAP-01',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
        discount,
      });

      const snapshot = item.toSnapshot();

      expect(snapshot).toEqual({
        id: item.id.value,
        saleId: 'sale_snap_1',
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_101',
        sourceCode: 'WHEY-VAN-01',
        description: 'Snapshot Product',
        skuOrCode: 'SNAP-01',
        quantity: 2,
        unitPrice: 25.0,
        currency: 'USD',
        discount: {
          type: 'PERCENTAGE',
          value: 10,
          reason: 'Seasonal Discount',
        },
        subtotal: 50.0,
        discountTotal: 5.0,
        total: 45.0,
      });
    });

    it('preserves saleId across withQuantity and withDiscount mutations', () => {
      const saleId = SaleId.create('sale_mutate_1');
      const item = SaleItem.create({
        saleId,
        source: defaultSource,
        description: 'Mutating Product',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
      });

      expect(item.saleId?.value).toBe('sale_mutate_1');

      const updatedQty = item.withQuantity(3);
      expect(updatedQty.saleId?.value).toBe('sale_mutate_1');
      expect(updatedQty.quantity).toBe(3);

      const updatedDisc = updatedQty.withDiscount(Discount.fixedAmount(5, 'Coupon'));
      expect(updatedDisc.saleId?.value).toBe('sale_mutate_1');
      expect(updatedDisc.discountTotal.amount).toBe(5);
    });
  });

  describe('Financial Determinism & Invariant Guardrails (MNY-01 through MNY-05, ITEM-02, ITEM-03, ITEM-07, ITEM-08)', () => {
    describe('Quantity Semantics & Boundaries', () => {
      it('supports discrete integer quantities', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Resistance Band Set',
          quantity: 4,
          unitPrice: Money.create(15.0, 'USD'),
        });
        expect(item.quantity).toBe(4);
        expect(item.subtotal.amount).toBe(60.0);
        expect(item.total.amount).toBe(60.0);
      });

      it('supports fractional bulk quantities with 3-decimal precision', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Electrolyte Powder (Bulk kg)',
          quantity: 0.75,
          unitPrice: Money.create(40.0, 'USD'),
        });
        expect(item.quantity).toBe(0.75);
        expect(item.subtotal.amount).toBe(30.0);
      });

      it('accepts minimum supported quantity (0.001)', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Microgram Sample',
          quantity: 0.001,
          unitPrice: Money.create(1000.0, 'USD'),
        });
        expect(item.quantity).toBe(0.001);
        expect(item.subtotal.amount).toBe(1.0);
      });

      it('accepts maximum supported quantity (999,999)', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Bulk Order',
          quantity: 999_999,
          unitPrice: Money.create(1.0, 'USD'),
        });
        expect(item.quantity).toBe(999_999);
        expect(item.subtotal.amount).toBe(999_999.0);
      });

      it('rejects quantities exceeding MAX_QUANTITY (1,000,000)', () => {
        expect(() => {
          SaleItem.create({
            source: defaultSource,
            description: 'Excessive Quantity',
            quantity: 1_000_000,
            unitPrice: Money.create(1.0, 'USD'),
          });
        }).toThrow(InvalidSaleItemException);
      });

      it('rejects fractional quantities that round down to 0 at 3 decimals (< 0.0005)', () => {
        expect(() => {
          SaleItem.create({
            source: defaultSource,
            description: 'Too Small',
            quantity: 0.0004,
            unitPrice: Money.create(100.0, 'USD'),
          });
        }).toThrow(InvalidSaleItemException);
      });
    });

    describe('Unit Price Invariants', () => {
      it('supports zero-price promotional complimentary items ($0.00)', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Free Promotional Sample',
          quantity: 2,
          unitPrice: Money.zero('USD'),
        });
        expect(item.unitPrice.amount).toBe(0.0);
        expect(item.subtotal.amount).toBe(0.0);
        expect(item.discountTotal.amount).toBe(0.0);
        expect(item.total.amount).toBe(0.0);
      });

      it('supports large commercial price points within safe scale', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Commercial Commercial Machine',
          quantity: 2,
          unitPrice: Money.create(12500.5, 'USD'),
        });
        expect(item.subtotal.amount).toBe(25001.0);
        expect(item.total.amount).toBe(25001.0);
      });

      it('rejects negative unit price', () => {
        expect(() => {
          SaleItem.create({
            source: defaultSource,
            description: 'Negative Item',
            quantity: 1,
            unitPrice: Money.create(-10.0, 'USD'),
          });
        }).toThrow();
      });
    });

    describe('Discount Semantics & Caps', () => {
      it('calculates zero discount correctly for 0% and $0.00 discounts', () => {
        const itemWithZeroPct = SaleItem.create({
          source: defaultSource,
          description: 'Item A',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'),
          discount: Discount.percentage(0, 'Zero Discount'),
        });
        expect(itemWithZeroPct.discountTotal.amount).toBe(0.0);
        expect(itemWithZeroPct.total.amount).toBe(50.0);

        const itemWithZeroFixed = SaleItem.create({
          source: defaultSource,
          description: 'Item B',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'),
          discount: Discount.fixedAmount(0, 'Zero Fixed'),
        });
        expect(itemWithZeroFixed.discountTotal.amount).toBe(0.0);
        expect(itemWithZeroFixed.total.amount).toBe(50.0);
      });

      it('calculates 100% maximum percentage discount leaving zero net total', () => {
        const item = SaleItem.create({
          source: defaultSource,
          description: '100% Scholarship',
          quantity: 1,
          unitPrice: Money.create(75.0, 'USD'),
          discount: Discount.percentage(100, 'Full Waiver'),
        });
        expect(item.subtotal.amount).toBe(75.0);
        expect(item.discountTotal.amount).toBe(75.0);
        expect(item.total.amount).toBe(0.0);
      });

      it('rejects fixed discount exceeding subtotal rather than silently capping', () => {
        expect(() => {
          SaleItem.create({
            source: defaultSource,
            description: 'Gift Card Exceeding Item Price',
            quantity: 1,
            unitPrice: Money.create(30.0, 'USD'),
            discount: Discount.fixedAmount(50.0, '$50 Gift Card'),
          });
        }).toThrow(InvalidDiscountException);
      });

      it('rejects invalid discount parameters (negative, > 100%, empty reason)', () => {
        expect(() => Discount.percentage(-5, 'Invalid Negative')).toThrow();
        expect(() => Discount.percentage(101, 'Over 100%')).toThrow();
        expect(() => Discount.fixedAmount(-10, 'Negative Fixed')).toThrow();
        expect(() => Discount.percentage(10, '   ')).toThrow();
      });
    });

    describe('Exact Half-Up Cent Rounding Math', () => {
      it('executes Half-Up rounding when unit price multiplied by fractional quantity yields sub-cents', () => {
        // unitPrice: 10.55, quantity: 1.333 -> 10.55 * 1.333 = 14.06315 -> rounds to 14.06
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Fractional Powder',
          quantity: 1.333,
          unitPrice: Money.create(10.55, 'USD'),
        });
        expect(item.subtotal.amount).toBe(14.06);
      });

      it('executes Half-Up rounding on percentage discounts yielding fractional cents', () => {
        // subtotal: 14.06, discount: 15% -> 14.06 * 0.15 = 2.109 -> rounds to 2.11
        // net total: 14.06 - 2.11 = 11.95
        const item = SaleItem.create({
          source: defaultSource,
          description: 'Fractional Powder with Discount',
          quantity: 1.333,
          unitPrice: Money.create(10.55, 'USD'),
          discount: Discount.percentage(15, '15% Seasonal Promo'),
        });
        expect(item.subtotal.amount).toBe(14.06);
        expect(item.discountTotal.amount).toBe(2.11);
        expect(item.total.amount).toBe(11.95);
      });

      it('reconstitutes reconciled totals successfully and rejects un-reconciled totals by even 1 cent', () => {
        const id = SaleItemId.create();
        const valid = SaleItem.reconstitute({
          id,
          source: defaultSource,
          description: 'Exact Reconstitution',
          quantity: 1.333,
          unitPrice: Money.create(10.55, 'USD'),
          discount: Discount.percentage(15, 'Promo'),
          subtotal: Money.create(14.06, 'USD'),
          discountTotal: Money.create(2.11, 'USD'),
          total: Money.create(11.95, 'USD'),
        });
        expect(valid.total.amount).toBe(11.95);

        // 1 cent drift in subtotal
        expect(() => {
          SaleItem.reconstitute({
            id,
            source: defaultSource,
            description: '1 Cent Drift',
            quantity: 1.333,
            unitPrice: Money.create(10.55, 'USD'),
            subtotal: Money.create(14.07, 'USD'), // drift
            total: Money.create(14.07, 'USD'),
          });
        }).toThrow(InvalidSaleItemException);

        // 1 cent drift in discountTotal
        expect(() => {
          SaleItem.reconstitute({
            id,
            source: defaultSource,
            description: '1 Cent Drift in Discount',
            quantity: 1.333,
            unitPrice: Money.create(10.55, 'USD'),
            discount: Discount.percentage(15, 'Promo'),
            subtotal: Money.create(14.06, 'USD'),
            discountTotal: Money.create(2.12, 'USD'), // drift
            total: Money.create(11.94, 'USD'),
          });
        }).toThrow(InvalidSaleItemException);
      });
    });
  });

  describe('Historical Commercial Stability (Prompt 7.3.4)', () => {
    it('preserves historical unitPrice, discount, and total even if original source changes later', () => {
      // Original product: Green Smoothie, unitPrice = 20, discount = 10%
      const sourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-smoothie-001',
        sourceCode: 'SMOOTH-01',
      });
      const historicalItem = SaleItem.create({
        source: sourceRef,
        description: 'Green Smoothie',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
        discount: Discount.percentage(10, 'Seasonal 10% Off'),
      });

      expect(historicalItem.unitPrice.amount).toBe(20.0);
      expect(historicalItem.discount?.value).toBe(10);
      expect(historicalItem.subtotal.amount).toBe(20.0);
      expect(historicalItem.discountTotal.amount).toBe(2.0);
      expect(historicalItem.total.amount).toBe(18.0);

      // Simulated external change: current product later changes to unitPrice = 30, discount = 20%
      const currentExternalCatalogState = {
        unitPrice: Money.create(30.0, 'USD'),
        discount: Discount.percentage(20, 'New Promotion'),
      };

      // Existing historical SaleItem remains completely unchanged
      expect(historicalItem.unitPrice.amount).toBe(20.0);
      expect(historicalItem.discount?.value).toBe(10);
      expect(historicalItem.subtotal.amount).toBe(20.0);
      expect(historicalItem.discountTotal.amount).toBe(2.0);
      expect(historicalItem.total.amount).toBe(18.0);
      expect(historicalItem.unitPrice.amount).not.toBe(
        currentExternalCatalogState.unitPrice.amount,
      );
      expect(historicalItem.discount?.value).not.toBe(currentExternalCatalogState.discount.value);
      expect(Object.isFrozen(historicalItem)).toBe(true);
    });
  });
});
