import { Discount } from '../value-objects/discount.vo';
import { DiscountType } from '../enums/discount-type.enum';
import { Money } from '../value-objects/money.vo';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';

describe('Discount Value Object', () => {
  it('creates a valid percentage discount', () => {
    const discount = Discount.percentage(15, 'VIP Client Discount');

    expect(discount.type).toBe(DiscountType.PERCENTAGE);
    expect(discount.value).toBe(15);
    expect(discount.reason).toBe('VIP Client Discount');
    expect(discount.toString()).toBe('15% (VIP Client Discount)');
  });

  it('creates a valid fixed amount discount', () => {
    const discount = Discount.fixedAmount(20.5, 'Promo Voucher');

    expect(discount.type).toBe(DiscountType.FIXED_AMOUNT);
    expect(discount.value).toBe(20.5);
    expect(discount.reason).toBe('Promo Voucher');
    expect(discount.toString()).toBe('$20.50 (Promo Voucher)');
  });

  it('calculates percentage reduction accurately in integer cents', () => {
    const discount = Discount.percentage(10, 'Standard 10%');
    const subtotal = Money.create(49.99, 'USD');

    // 49.99 * 0.10 = 4.999 -> rounds to 5.00
    const reduction = discount.calculateReduction(subtotal);
    expect(reduction.amount).toBe(5.0);
    expect(reduction.currency).toBe('USD');
  });

  it('caps fixed amount reduction at subtotal', () => {
    const discount = Discount.fixedAmount(100.0, 'Large Voucher');
    const subtotal = Money.create(35.0, 'USD');

    const reduction = discount.calculateReduction(subtotal);
    expect(reduction.amount).toBe(35.0);
  });

  it('returns zero reduction for zero subtotal', () => {
    const discount = Discount.percentage(20, 'Promo');
    const subtotal = Money.zero('USD');

    const reduction = discount.calculateReduction(subtotal);
    expect(reduction.isZero()).toBe(true);
  });

  it('throws InvalidDiscountException for negative percentage or amount', () => {
    expect(() => {
      Discount.percentage(-5, 'Invalid');
    }).toThrow(InvalidDiscountException);

    expect(() => {
      Discount.fixedAmount(-10, 'Invalid');
    }).toThrow(InvalidDiscountException);
  });

  it('throws InvalidDiscountException for percentage over 100%', () => {
    expect(() => {
      Discount.percentage(101, 'Over 100');
    }).toThrow(InvalidDiscountException);
  });

  it('throws InvalidDiscountException for empty or whitespace reason', () => {
    expect(() => {
      Discount.percentage(10, '   ');
    }).toThrow(InvalidDiscountException);
  });

  it('enforces immutability', () => {
    const discount = Discount.percentage(10, 'Staff');
    expect(Object.isFrozen(discount)).toBe(true);
  });
});
