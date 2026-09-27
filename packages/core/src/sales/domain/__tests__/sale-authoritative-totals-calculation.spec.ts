import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';

describe('Sale Authoritative Commercial Total Calculation', () => {
  const sourceRef = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SUPPLEMENT-01',
  });

  const createSale = (currency = 'USD'): Sale => {
    return Sale.create({
      currency,
      clientId: 'client-123',
      source: SourceReference.create({
        sourceType: SourceType.CUSTOM_SERVICE,
        sourceId: 'pos-terminal-01',
      }),
    });
  };

  describe('1. Authoritative Formulas Verification', () => {
    it('subtotal equals exact sum of (item.quantity * item.unitPrice)', () => {
      const sale = createSale('USD');

      // Item 1: 3 @ $19.99 = $59.97
      sale.addItem({
        description: 'Protein Powder',
        quantity: 3,
        unitPrice: Money.create(19.99, 'USD'),
        source: sourceRef,
      });

      // Item 2: 2 @ $5.50 = $11.00
      sale.addItem({
        description: 'Shaker Bottle',
        quantity: 2,
        unitPrice: Money.create(5.5, 'USD'),
        source: sourceRef,
      });

      // Total subtotal = 59.97 + 11.00 = 70.97
      expect(sale.subtotal.amount).toBe(70.97);
      expect(sale.subtotal.cents).toBe(7097);
      expect(sale.discountTotal.cents).toBe(0);
      expect(sale.total.cents).toBe(7097);
    });

    it('discountTotal equals exact sum of line discounts plus order discount', () => {
      const sale = createSale('USD');

      // Item 1: 2 @ $50.00 = $100.00, discount $10.00 -> line total $90.00
      sale.addItem({
        description: 'Item 1',
        quantity: 2,
        unitPrice: Money.create(50.0, 'USD'),
        discount: Discount.fixed(10.0, 'Special Promo'),
        source: sourceRef,
      });

      // Item 2: 1 @ $100.00 = $100.00, discount 20% = $20.00 -> line total $80.00
      sale.addItem({
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        discount: Discount.percentage(20, '20% off'),
        source: sourceRef,
      });

      // Total subtotal = $200.00
      // Line discounts = $10.00 + $20.00 = $30.00
      // Net pre-order discount = $170.00
      expect(sale.subtotal.amount).toBe(200.0);
      expect(sale.discountTotal.amount).toBe(30.0);
      expect(sale.total.amount).toBe(170.0);

      // Apply 10% order-level discount on the remaining eligible $170.00: 10% of 170.00 = $17.00
      sale.applyOrderDiscount(Discount.percentage(10, 'Seasonal 10% Off'));

      // Total discount = $30.00 (line) + $17.00 (order) = $47.00
      // Net total = $200.00 - $47.00 = $153.00
      expect(sale.discountTotal.amount).toBe(47.0);
      expect(sale.discountTotal.cents).toBe(4700);
      expect(sale.total.amount).toBe(153.0);
      expect(sale.total.cents).toBe(15300);
      expect(sale.subtotal.cents - sale.discountTotal.cents).toBe(sale.total.cents);
    });
  });

  describe('2. Elimination of Floating-Point Drift & Half-Up Rounding', () => {
    it('eliminates classic 0.1 + 0.2 floating-point artifacts', () => {
      const sale = createSale('USD');

      // 0.10 + 0.20 in JavaScript floats is 0.30000000000000004
      sale.addItem({
        description: 'Dime item',
        quantity: 1,
        unitPrice: Money.create(0.1, 'USD'),
        source: sourceRef,
      });

      sale.addItem({
        description: 'Two-dimes item',
        quantity: 1,
        unitPrice: Money.create(0.2, 'USD'),
        source: sourceRef,
      });

      expect(sale.subtotal.cents).toBe(30);
      expect(sale.subtotal.amount).toBe(0.3);
      expect(sale.total.cents).toBe(30);
      expect(sale.total.amount).toBe(0.3);
    });

    it('performs exact Commercial Half-Up rounding on percentage discounts', () => {
      const sale = createSale('USD');

      // Item: $14.95 with 15% discount
      // 1495 cents * 0.15 = 224.25 cents -> rounds to 224 cents ($2.24)
      sale.addItem({
        description: 'T-Shirt',
        quantity: 1,
        unitPrice: Money.create(14.95, 'USD'),
        discount: Discount.percentage(15, '15% discount'),
        source: sourceRef,
      });

      expect(sale.subtotal.cents).toBe(1495);
      expect(sale.discountTotal.cents).toBe(224);
      expect(sale.total.cents).toBe(1271); // 1495 - 224 = 1271 ($12.71)
      expect(sale.total.amount).toBe(12.71);
    });
  });

  describe('3. Automatic Internal Recalculation (No Stale Totals)', () => {
    it('automatically recalculates after addItem without manual calculateTotals()', () => {
      const sale = createSale('USD');
      expect(sale.total.cents).toBe(0);

      sale.addItem({
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        source: sourceRef,
      });

      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.total.amount).toBe(50.0);
    });

    it('automatically recalculates after updateItem and updateItemQuantity', () => {
      const sale = createSale('USD');
      const item = sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
        source: sourceRef,
      });

      expect(sale.total.amount).toBe(25.0);

      // updateItemQuantity to 4
      sale.updateItemQuantity(item.id, 4);
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.total.amount).toBe(100.0);

      // updateItem with discount
      sale.updateItem(item.id, {
        quantity: 2,
        discount: Discount.fixed(10.0, '$10 off'),
      });

      // 2 @ $25.00 = $50.00, discount $10.00 -> total $40.00
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(40.0);
    });

    it('automatically recalculates after applyItemDiscount and removeItemDiscount', () => {
      const sale = createSale('USD');
      const item = sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        source: sourceRef,
      });

      expect(sale.total.amount).toBe(100.0);

      sale.applyItemDiscount(item.id, Discount.percentage(25, '25% Off'));
      expect(sale.discountTotal.amount).toBe(25.0);
      expect(sale.total.amount).toBe(75.0);

      sale.removeItemDiscount(item.id);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(100.0);
    });

    it('automatically recalculates after removeItem', () => {
      const sale = createSale('USD');
      const item1 = sale.addItem({
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
        source: sourceRef,
      });
      sale.addItem({
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(60.0, 'USD'),
        source: sourceRef,
      });

      expect(sale.total.amount).toBe(100.0);

      sale.removeItem(item1.id);
      expect(sale.subtotal.amount).toBe(60.0);
      expect(sale.total.amount).toBe(60.0);
      expect(sale.itemCount).toBe(1);
    });

    it('automatically recalculates after applyOrderDiscount and removeOrderDiscount', () => {
      const sale = createSale('USD');
      sale.addItem({
        description: 'Item',
        quantity: 2,
        unitPrice: Money.create(50.0, 'USD'),
        source: sourceRef,
      });

      expect(sale.total.amount).toBe(100.0);

      sale.applyOrderDiscount(Discount.fixed(15.0, 'Coupon'));
      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(85.0);

      sale.removeOrderDiscount();
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(100.0);
    });

    it('guarantees fresh recalculation internally before finalize transition', () => {
      const sale = createSale('USD');
      sale.addItem({
        description: 'Consultation',
        quantity: 1,
        unitPrice: Money.create(150.0, 'USD'),
        source: sourceRef,
      });

      sale.finalize();

      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.subtotal.amount).toBe(150.0);
      expect(sale.total.amount).toBe(150.0);
    });
  });

  describe('4. Invariants Enforcement & State Protection', () => {
    it('callers cannot set totals directly (read-only encapsulation)', () => {
      const sale = createSale('USD');
      sale.addItem({
        description: 'Pass',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        source: sourceRef,
      });

      // Attempting to overwrite properties without setters will fail at compile-time,
      // and runtime Object property descriptors verify getter-only access
      const totalDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'total');
      expect(totalDescriptor?.set).toBeUndefined();
      expect(typeof totalDescriptor?.get).toBe('function');

      const subtotalDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(sale),
        'subtotal',
      );
      expect(subtotalDescriptor?.set).toBeUndefined();
      expect(typeof subtotalDescriptor?.get).toBe('function');

      const discountDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(sale),
        'discountTotal',
      );
      expect(discountDescriptor?.set).toBeUndefined();
      expect(typeof discountDescriptor?.get).toBe('function');
    });

    it('rejects reconstitution if persisted totals do not match deterministic recalculation', () => {
      const item = SaleItem.create({
        saleId: SaleId.create('sale-rec-01'),
        description: 'Whey Protein',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        source: sourceRef,
      });

      // Persisted subtotal says $100.00, but actual item is $50.00
      expect(() =>
        Sale.reconstitute({
          id: SaleId.create('sale-rec-01'),
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: sourceRef,
          items: [item],
          subtotal: Money.create(100.0, 'USD'), // Tampered subtotal!
          discountTotal: Money.zero('USD'),
          total: Money.create(100.0, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);

      // Persisted total says $40.00, but actual is $50.00
      expect(() =>
        Sale.reconstitute({
          id: SaleId.create('sale-rec-01'),
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: sourceRef,
          items: [item],
          subtotal: Money.create(50.0, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(40.0, 'USD'), // Tampered total!
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('total cannot become negative (capped by discount reduction ceiling)', () => {
      const sale = createSale('USD');
      sale.addItem({
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(20.0, 'USD'),
        source: sourceRef,
      });

      // Fixed order discount cannot exceed eligible amount
      sale.applyOrderDiscount(Discount.fixed(100.0, 'Massive Discount'));

      // Reduction is capped to $20.00, so total is $0.00, never negative
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.cents >= 0).toBe(true);
    });
  });
});
