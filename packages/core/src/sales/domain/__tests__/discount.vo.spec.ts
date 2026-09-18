import { Discount } from '../value-objects/discount.vo';
import { DiscountType } from '../enums/discount-type.enum';
import { Money } from '../value-objects/money.vo';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';

describe('Discount Value Object', () => {
  describe('Creation & Validation', () => {
    it('creates a valid percentage discount with reason', () => {
      const discount = Discount.percentage(15, 'VIP Client Discount');

      expect(discount.type).toBe(DiscountType.PERCENTAGE);
      expect(discount.value).toBe(15);
      expect(discount.reason).toBe('VIP Client Discount');
      expect(discount.isPercentage()).toBe(true);
      expect(discount.isFixed()).toBe(false);
      expect(discount.toString()).toBe('15% (VIP Client Discount)');
    });

    it('creates a valid fixed discount using Discount.fixed', () => {
      const discount = Discount.fixed(25.0, 'Holiday Promo');

      expect(discount.type).toBe(DiscountType.FIXED);
      expect(discount.value).toBe(25.0);
      expect(discount.reason).toBe('Holiday Promo');
      expect(discount.isFixed()).toBe(true);
      expect(discount.isPercentage()).toBe(false);
      expect(discount.toString()).toBe('$25.00 (Holiday Promo)');
    });

    it('creates a valid fixed amount discount using backward-compatible Discount.fixedAmount', () => {
      const discount = Discount.fixedAmount(20.5, 'Promo Voucher');

      expect(discount.type).toBe(DiscountType.FIXED_AMOUNT);
      expect(discount.value).toBe(20.5);
      expect(discount.reason).toBe('Promo Voucher');
      expect(discount.isFixed()).toBe(true);
      expect(discount.toString()).toBe('$20.50 (Promo Voucher)');
    });

    it('creates a discount with optional reason omitted or null', () => {
      const discountWithoutReason = Discount.percentage(10);
      expect(discountWithoutReason.reason).toBeNull();
      expect(discountWithoutReason.toString()).toBe('10%');

      const discountWithNullReason = Discount.fixed(5, null);
      expect(discountWithNullReason.reason).toBeNull();
      expect(discountWithNullReason.toString()).toBe('$5.00');
    });

    it('normalizes whitespace in reason', () => {
      const discount = Discount.percentage(10, '  Staff Courtesy   ');
      expect(discount.reason).toBe('Staff Courtesy');
    });

    it('allows 0% discount and $0.00 fixed discount', () => {
      const zeroPct = Discount.percentage(0, 'Zero reduction');
      expect(zeroPct.value).toBe(0);

      const zeroFixed = Discount.fixed(0, 'Zero fixed');
      expect(zeroFixed.value).toBe(0);
    });

    it('allows 100% discount', () => {
      const fullDiscount = Discount.percentage(100, 'Full Scholarship');
      expect(fullDiscount.value).toBe(100);
    });

    it('normalizes value to 2 decimal places', () => {
      const discount = Discount.percentage(12.555, 'Scale check');
      expect(discount.value).toBe(12.56);
    });
  });

  describe('Invariant Rejections', () => {
    it('throws for null or undefined props in create', () => {
      expect(() => {
        Discount.create(null as unknown as { type: DiscountType; value: number });
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.create(undefined as unknown as { type: DiscountType; value: number });
      }).toThrow(InvalidDiscountException);
    });

    it('throws for invalid discount type', () => {
      expect(() => {
        Discount.create({ type: 'INVALID_TYPE' as DiscountType, value: 10 });
      }).toThrow(InvalidDiscountException);
    });

    it('throws for negative percentage or amount', () => {
      expect(() => {
        Discount.percentage(-5, 'Invalid');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.fixed(-10, 'Invalid');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.fixedAmount(-10, 'Invalid');
      }).toThrow(InvalidDiscountException);
    });

    it('throws for percentage over 100% without silently clamping', () => {
      expect(() => {
        Discount.percentage(100.01, 'Over 100');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.percentage(150, 'Way over 100');
      }).toThrow(InvalidDiscountException);
    });

    it('throws for NaN, Infinity, or non-numeric value', () => {
      expect(() => {
        Discount.percentage(NaN, 'NaN');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.fixed(Infinity, 'Infinity');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.create({ type: DiscountType.FIXED, value: 'twenty' as unknown as number });
      }).toThrow(InvalidDiscountException);
    });

    it('throws for empty or whitespace reason string if provided', () => {
      expect(() => {
        Discount.percentage(10, '');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.percentage(10, '   ');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.fixed(10, '\t\n ');
      }).toThrow(InvalidDiscountException);
    });

    it('throws when reason exceeds maximum length (255 chars)', () => {
      const tooLongReason = 'A'.repeat(256);
      expect(() => {
        Discount.percentage(10, tooLongReason);
      }).toThrow(InvalidDiscountException);

      const exactMaxReason = 'A'.repeat(255);
      const valid = Discount.percentage(10, exactMaxReason);
      expect(valid.reason?.length).toBe(255);
    });

    it('throws if reason is not a string, null, or undefined', () => {
      expect(() => {
        Discount.create({
          type: DiscountType.FIXED,
          value: 10,
          reason: 12345 as unknown as string,
        });
      }).toThrow(InvalidDiscountException);
    });
  });

  describe('Financial Reduction Arithmetic', () => {
    it('calculates percentage reduction accurately in integer cents', () => {
      const discount = Discount.percentage(10, 'Standard 10%');
      const subtotal = Money.create(49.99, 'USD');

      // 49.99 * 0.10 = 4.999 -> rounds Half-Up to 5.00
      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.amount).toBe(5.0);
      expect(reduction.currency).toBe('USD');
    });

    it('calculates complex percentage reduction with commercial Half-Up rounding', () => {
      const discount = Discount.percentage(15, '15% VIP');
      const subtotal = Money.create(33.33, 'USD');

      // 33.33 * 0.15 = 4.9995 -> 499.95 cents -> rounds to 500 cents = $5.00
      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.amount).toBe(5.0);
    });

    it('calculates 100% discount reduction equal to exact subtotal', () => {
      const discount = Discount.percentage(100, 'Free promotion');
      const subtotal = Money.create(75.5, 'USD');

      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.amount).toBe(75.5);
      expect(subtotal.subtract(reduction).isZero()).toBe(true);
    });

    it('calculates 0% discount reduction as zero', () => {
      const discount = Discount.percentage(0);
      const subtotal = Money.create(50.0, 'USD');

      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.isZero()).toBe(true);
      expect(reduction.amount).toBe(0.0);
    });

    it('calculates fixed reduction accurately', () => {
      const discount = Discount.fixed(12.5, 'Coupon');
      const subtotal = Money.create(50.0, 'USD');

      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.amount).toBe(12.5);
      expect(reduction.currency).toBe('USD');
    });

    it('caps fixed reduction at subtotal to prevent negative totals', () => {
      const discount = Discount.fixed(100.0, 'Large Voucher');
      const subtotal = Money.create(35.0, 'USD');

      const reduction = discount.calculateReduction(subtotal);
      expect(reduction.amount).toBe(35.0);
      expect(subtotal.subtract(reduction).amount).toBe(0.0);
    });

    it('returns zero reduction for zero subtotal', () => {
      const pctDiscount = Discount.percentage(20, 'Promo');
      const fixedDiscount = Discount.fixed(20, 'Promo');
      const zeroSubtotal = Money.zero('USD');

      expect(pctDiscount.calculateReduction(zeroSubtotal).isZero()).toBe(true);
      expect(fixedDiscount.calculateReduction(zeroSubtotal).isZero()).toBe(true);
    });

    it('throws if calculateReduction is called with invalid or missing subtotal', () => {
      const discount = Discount.percentage(10);
      expect(() => {
        discount.calculateReduction(null as unknown as Money);
      }).toThrow(InvalidDiscountException);

      expect(() => {
        discount.calculateReduction({ amount: 10, currency: 'USD' } as unknown as Money);
      }).toThrow(InvalidDiscountException);
    });

    it('reason does not participate in financial reduction arithmetic', () => {
      const subtotal = Money.create(40.0, 'USD');
      const withReason = Discount.percentage(10, 'Specific Reason');
      const withoutReason = Discount.percentage(10, null);
      const differentReason = Discount.percentage(10, 'Another Reason');

      const r1 = withReason.calculateReduction(subtotal);
      const r2 = withoutReason.calculateReduction(subtotal);
      const r3 = differentReason.calculateReduction(subtotal);

      expect(r1.equals(r2)).toBe(true);
      expect(r2.equals(r3)).toBe(true);
    });
  });

  describe('Value Object Equality & Serialization', () => {
    it('determines equality based on type, value, and reason', () => {
      const d1 = Discount.percentage(10, 'Member');
      const d2 = Discount.percentage(10, 'Member');
      const d3 = Discount.percentage(15, 'Member');
      const d4 = Discount.percentage(10, 'Other');

      expect(d1.equals(d2)).toBe(true);
      expect(d1.equals(d3)).toBe(false);
      expect(d1.equals(d4)).toBe(false);
    });

    it('treats FIXED and FIXED_AMOUNT as type-equivalent in equality', () => {
      const dFixed = Discount.fixed(15.0, 'Voucher');
      const dFixedAmount = Discount.fixedAmount(15.0, 'Voucher');

      expect(dFixed.equals(dFixedAmount)).toBe(true);
      expect(dFixedAmount.equals(dFixed)).toBe(true);
    });

    it('handles null and undefined reason in equality', () => {
      const d1 = Discount.percentage(10, null);
      const d2 = Discount.percentage(10);
      const d3 = Discount.percentage(10, 'Promo');

      expect(d1.equals(d2)).toBe(true);
      expect(d1.equals(d3)).toBe(false);
    });

    it('returns false when comparing with null, undefined, or non-Discount', () => {
      const discount = Discount.percentage(10, 'Promo');
      expect(discount.equals(null)).toBe(false);
      expect(discount.equals(undefined)).toBe(false);
      expect(
        discount.equals({ type: DiscountType.PERCENTAGE, value: 10 } as unknown as Discount),
      ).toBe(false);
    });

    it('provides immutable snapshot via getValue', () => {
      const discount = Discount.percentage(10, 'Special Promo');
      const value = discount.getValue();

      expect(value).toEqual({
        type: DiscountType.PERCENTAGE,
        value: 10,
        reason: 'Special Promo',
      });
    });

    it('enforces immutability via Object.freeze', () => {
      const discount = Discount.percentage(10, 'Staff');
      expect(Object.isFrozen(discount)).toBe(true);

      // In strict mode, direct mutation throws TypeError
      expect(() => {
        (discount as unknown as { _value: number })._value = 20;
      }).toThrow(TypeError);
    });
  });

  describe('Deterministic Discount Calculation (calculate API — Prompt 7.3.3)', () => {
    describe('Fixed Discounts', () => {
      it('calculates zero fixed discount correctly', () => {
        const discount = Discount.fixed(0);
        expect(discount.calculate(Money.create(100, 'USD')).amount).toBe(0);
        expect(discount.calculate(Money.create(0, 'USD')).amount).toBe(0);
        expect(discount.calculate(100).amount).toBe(0);
      });

      it('calculates valid fixed discount (eligible = 100, discount = 20 -> 20)', () => {
        const discount = Discount.fixed(20);
        const result = discount.calculate(Money.create(100, 'USD'));

        expect(result.amount).toBe(20);
        expect(result.currency).toBe('USD');
      });

      it('calculates fixed discount equal to eligible amount (eligible = 20, discount = 20 -> 20)', () => {
        const discount = Discount.fixed(20);
        const result = discount.calculate(Money.create(20, 'USD'));

        expect(result.amount).toBe(20);
      });

      it('rejects fixed discount greater than eligible amount (eligible = 10, discount = 20)', () => {
        const discount = Discount.fixed(20);

        expect(() => {
          discount.calculate(Money.create(10, 'USD'));
        }).toThrow(InvalidDiscountException);

        expect(() => {
          discount.calculate(10);
        }).toThrow(InvalidDiscountException);
      });

      it('rejects negative fixed discount at construction', () => {
        expect(() => {
          Discount.fixed(-20);
        }).toThrow(InvalidDiscountException);
      });
    });

    describe('Percentage Discounts', () => {
      it('calculates zero percentage discount correctly', () => {
        const discount = Discount.percentage(0);
        const result = discount.calculate(Money.create(100, 'USD'));
        expect(result.amount).toBe(0);
        expect(result.isZero()).toBe(true);
      });

      it('calculates valid percentage discount (eligible = 100, discount = 20% -> 20)', () => {
        const discount = Discount.percentage(20);
        const result = discount.calculate(Money.create(100, 'USD'));

        expect(result.amount).toBe(20);
        expect(result.currency).toBe('USD');
      });

      it('calculates percentage equal to 100% (eligible = 100, discount = 100% -> 100)', () => {
        const discount = Discount.percentage(100);
        const result = discount.calculate(Money.create(100, 'USD'));

        expect(result.amount).toBe(100);
      });

      it('rejects percentage greater than 100 at construction without silently clamping', () => {
        expect(() => {
          Discount.percentage(100.01);
        }).toThrow(InvalidDiscountException);

        expect(() => {
          Discount.percentage(120);
        }).toThrow(InvalidDiscountException);
      });

      it('rejects negative percentage at construction', () => {
        expect(() => {
          Discount.percentage(-10);
        }).toThrow(InvalidDiscountException);
      });

      it('performs deterministic Commercial Half-Up rounding for fractional cents', () => {
        const discount15 = Discount.percentage(15);
        // 49.99 * 0.15 = 7.4985 -> 749.85 cents -> rounds to 750 cents = $7.50
        expect(discount15.calculate(Money.create(49.99, 'USD')).amount).toBe(7.5);

        const discount10 = Discount.percentage(10);
        // 33.33 * 0.10 = 3.333 -> 333.3 cents -> rounds to 333 cents = $3.33
        expect(discount10.calculate(Money.create(33.33, 'USD')).amount).toBe(3.33);

        // 33.33 * 0.15 = 4.9995 -> 499.95 cents -> rounds to 500 cents = $5.00
        expect(discount15.calculate(Money.create(33.33, 'USD')).amount).toBe(5.0);
      });

      it('handles very small monetary values correctly', () => {
        const discount10 = Discount.percentage(10);
        // 0.01 * 0.10 = 0.001 -> 0.1 cents -> rounds to 0 cents = $0.00
        expect(discount10.calculate(Money.create(0.01, 'USD')).amount).toBe(0);

        const discount50 = Discount.percentage(50);
        // 0.01 * 0.50 = 0.005 -> 0.5 cents -> Half-Up rounds to 1 cent = $0.01
        expect(discount50.calculate(Money.create(0.01, 'USD')).amount).toBe(0.01);

        // 0.05 * 0.10 = 0.005 -> 0.5 cents -> Half-Up rounds to 1 cent = $0.01
        expect(discount10.calculate(Money.create(0.05, 'USD')).amount).toBe(0.01);
      });

      it('handles large monetary values without floating-point overflow or drift', () => {
        const discount = Discount.percentage(12.5);
        const largeAmount = Money.create(1_000_000.0, 'USD');

        // 1,000,000.00 * 0.125 = 125,000.00
        const result = discount.calculate(largeAmount);
        expect(result.amount).toBe(125000.0);

        const maxScaleAmount = Money.create(9_999_999.99, 'USD');
        const discount10 = Discount.percentage(10);
        // 9,999,999.99 * 0.10 = 999,999.999 -> rounds to 1,000,000.00
        expect(discount10.calculate(maxScaleAmount).amount).toBe(1000000.0);
      });
    });

    describe('General Calculation Rules & Invariants', () => {
      it('guarantees discountAmount >= 0 and discountAmount <= eligibleAmount', () => {
        const pctDiscount = Discount.percentage(25);
        const fixedDiscount = Discount.fixed(15);
        const eligible = Money.create(50, 'USD');

        const pctResult = pctDiscount.calculate(eligible);
        expect(pctResult.amount).toBeGreaterThanOrEqual(0);
        expect(pctResult.amount).toBeLessThanOrEqual(eligible.amount);

        const fixedResult = fixedDiscount.calculate(eligible);
        expect(fixedResult.amount).toBeGreaterThanOrEqual(0);
        expect(fixedResult.amount).toBeLessThanOrEqual(eligible.amount);
      });

      it('is completely deterministic across repeated executions', () => {
        const discount = Discount.percentage(17.5);
        const eligible = Money.create(137.49, 'USD');

        const r1 = discount.calculate(eligible);
        const r2 = discount.calculate(eligible);
        const r3 = discount.calculate(eligible);

        expect(r1.amount).toBe(r2.amount);
        expect(r2.amount).toBe(r3.amount);
        expect(r1.equals(r2)).toBe(true);
      });

      it('handles zero eligible amount correctly', () => {
        const pct = Discount.percentage(15);
        expect(pct.calculate(Money.zero('USD')).amount).toBe(0);

        const zeroFixed = Discount.fixed(0);
        expect(zeroFixed.calculate(Money.zero('USD')).amount).toBe(0);

        const positiveFixed = Discount.fixed(10);
        expect(() => {
          positiveFixed.calculate(Money.zero('USD'));
        }).toThrow(InvalidDiscountException);
      });

      it('rejects negative, NaN, or invalid eligible amounts', () => {
        const discount = Discount.percentage(10);

        expect(() => {
          discount.calculate(-10);
        }).toThrow(InvalidDiscountException);

        expect(() => {
          discount.calculate(NaN);
        }).toThrow(InvalidDiscountException);

        expect(() => {
          discount.calculate(Infinity);
        }).toThrow(InvalidDiscountException);

        expect(() => {
          discount.calculate('100' as unknown as number);
        }).toThrow(InvalidDiscountException);
      });

      it('preserves discount immutability across calculations', () => {
        const discount = Discount.fixed(25, 'Unchanged Reason');
        const beforeSnapshot = discount.getValue();

        discount.calculate(Money.create(100, 'USD'));
        discount.calculate(Money.create(50, 'USD'));

        expect(discount.getValue()).toEqual(beforeSnapshot);
        expect(Object.isFrozen(discount)).toBe(true);
      });

      it('eliminates floating-point drift in cent arithmetic', () => {
        // In IEEE 754: 0.1 * 0.2 === 0.020000000000000004
        // Discount calculation must return exact 0.02
        const discount = Discount.percentage(10);
        const smallSubtotal = Money.create(0.2, 'USD');

        const result = discount.calculate(smallSubtotal);
        expect(result.amount).toBe(0.02);
      });
    });
  });
});
