import { SaleItem } from '../entities/sale-item.entity';
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

  it('creates a valid SaleItem and calculates line totals without discount', () => {
    const item = SaleItem.create({
      source: defaultSource,
      description: 'Vanilla Whey Protein (1kg)',
      skuOrCode: 'WHEY-VAN-01',
      quantity: 2,
      unitPrice: Money.create(45.0, 'USD'),
    });

    expect(item.id).toBeDefined();
    expect(item.description).toBe('Vanilla Whey Protein (1kg)');
    expect(item.quantity).toBe(2);
    expect(item.unitPrice.amount).toBe(45.0);
    expect(item.lineSubtotal.amount).toBe(90.0);
    expect(item.lineDiscountTotal.amount).toBe(0.0);
    expect(item.lineTotal.amount).toBe(90.0);
  });

  it('calculates line totals with line discount', () => {
    const discount = Discount.percentage(10, 'Seasonal 10% off');
    const item = SaleItem.create({
      source: defaultSource,
      description: 'Vanilla Whey Protein (1kg)',
      quantity: 2,
      unitPrice: Money.create(50.0, 'USD'),
      discount,
    });

    // Subtotal: 100.00, Discount 10%: 10.00, Net Total: 90.00
    expect(item.lineSubtotal.amount).toBe(100.0);
    expect(item.lineDiscountTotal.amount).toBe(10.0);
    expect(item.lineTotal.amount).toBe(90.0);
  });

  it('updates quantity and recalculates line totals', () => {
    const item = SaleItem.create({
      source: defaultSource,
      description: 'Protein Bar',
      quantity: 1,
      unitPrice: Money.create(3.5, 'USD'),
    });

    expect(item.lineTotal.amount).toBe(3.5);

    item.updateQuantity(4);
    expect(item.quantity).toBe(4);
    expect(item.lineSubtotal.amount).toBe(14.0);
    expect(item.lineTotal.amount).toBe(14.0);
  });

  it('applies and removes discount dynamically', () => {
    const item = SaleItem.create({
      source: defaultSource,
      description: 'Water Bottle',
      quantity: 1,
      unitPrice: Money.create(20.0, 'USD'),
    });

    item.applyDiscount(Discount.fixedAmount(5.0, 'Coupon'));
    expect(item.lineDiscountTotal.amount).toBe(5.0);
    expect(item.lineTotal.amount).toBe(15.0);

    item.removeDiscount();
    expect(item.lineDiscountTotal.amount).toBe(0.0);
    expect(item.lineTotal.amount).toBe(20.0);
  });

  it('throws InvalidSaleItemException for non-positive quantity', () => {
    expect(() => {
      SaleItem.create({
        source: defaultSource,
        description: 'Invalid Item',
        quantity: 0,
        unitPrice: Money.create(10.0, 'USD'),
      });
    }).toThrow(InvalidSaleItemException);

    expect(() => {
      SaleItem.create({
        source: defaultSource,
        description: 'Invalid Item',
        quantity: -2,
        unitPrice: Money.create(10.0, 'USD'),
      });
    }).toThrow(InvalidSaleItemException);
  });

  it('throws InvalidSaleItemException for empty description', () => {
    expect(() => {
      SaleItem.create({
        source: defaultSource,
        description: '   ',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
    }).toThrow(InvalidSaleItemException);
  });
});
