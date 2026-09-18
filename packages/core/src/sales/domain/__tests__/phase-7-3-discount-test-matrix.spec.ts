import * as fs from 'fs';
import * as path from 'path';
import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { Discount, DiscountProps } from '../value-objects/discount.vo';
import { DiscountType } from '../enums/discount-type.enum';
import { Money } from '../value-objects/money.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { Clock } from '../shared/clock';
import { InvalidDiscountException, SaleAlreadyFinalizedException } from '../exceptions';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

/**
 * Phase 7.3 Complete Test Matrix Specification
 *
 * Verifies all business rules, domain invariants, and mathematical formulas
 * mandated for Phase 7.3: Discount Domain Model & Deterministic Calculation.
 */
describe('Phase 7.3 Complete Test Matrix', () => {
  const clock = new DeterministicClock(new Date('2026-09-18T12:00:00.000Z'));

  const baseSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'WHEY-VAN-01',
  });

  // ============================================================================
  // 1. Discount Construction
  // ============================================================================
  describe('1. Discount Construction', () => {
    it('constructs FIXED discount properly', () => {
      const discount = Discount.fixed(25.0, 'Loyalty Voucher');
      expect(discount.type).toBe(DiscountType.FIXED);
      expect(discount.value).toBe(25.0);
      expect(discount.reason).toBe('Loyalty Voucher');
      expect(discount.isFixed()).toBe(true);
      expect(discount.isPercentage()).toBe(false);
      expect(Object.isFrozen(discount)).toBe(true);
    });

    it('constructs PERCENTAGE discount properly', () => {
      const discount = Discount.percentage(20, 'Seasonal 20%');
      expect(discount.type).toBe(DiscountType.PERCENTAGE);
      expect(discount.value).toBe(20);
      expect(discount.reason).toBe('Seasonal 20%');
      expect(discount.isPercentage()).toBe(true);
      expect(discount.isFixed()).toBe(false);
      expect(Object.isFrozen(discount)).toBe(true);
    });

    it('rejects missing or invalid type', () => {
      expect(() => {
        Discount.create(null as unknown as DiscountProps);
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.create({ type: 'BOGUS_TYPE' as DiscountType, value: 10 });
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.create({ type: undefined as unknown as DiscountType, value: 10 });
      }).toThrow(InvalidDiscountException);
    });

    it('rejects negative fixed value', () => {
      expect(() => {
        Discount.fixed(-0.01, 'Negative Fixed');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.fixed(-50, 'Negative Fixed Large');
      }).toThrow(InvalidDiscountException);
    });

    it('rejects negative percentage value', () => {
      expect(() => {
        Discount.percentage(-0.01, 'Negative Pct');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.percentage(-25, 'Negative Pct Large');
      }).toThrow(InvalidDiscountException);
    });

    it('allows percentage 100%', () => {
      const full = Discount.percentage(100, 'Complimentary Service');
      expect(full.value).toBe(100);
      expect(full.isPercentage()).toBe(true);
    });

    it('rejects percentage > 100%', () => {
      expect(() => {
        Discount.percentage(100.01, 'Slightly above 100');
      }).toThrow(InvalidDiscountException);

      expect(() => {
        Discount.percentage(150, 'Way above 100');
      }).toThrow(InvalidDiscountException);
    });

    it('allows zero values for both fixed and percentage discounts', () => {
      const zeroFixed = Discount.fixed(0, 'Zero Fixed');
      expect(zeroFixed.value).toBe(0);
      expect(zeroFixed.isFixed()).toBe(true);

      const zeroPct = Discount.percentage(0, 'Zero Pct');
      expect(zeroPct.value).toBe(0);
      expect(zeroPct.isPercentage()).toBe(true);
    });

    it('validates reason string constraints (trimming, whitespace rejection, max length)', () => {
      // Reason omitted or null is valid
      const omitted = Discount.fixed(10);
      expect(omitted.reason).toBeNull();

      const nullReason = Discount.percentage(10, null);
      expect(nullReason.reason).toBeNull();

      // Trims whitespace
      const trimmed = Discount.percentage(10, '  Front Desk Courtesy  ');
      expect(trimmed.reason).toBe('Front Desk Courtesy');

      // Empty or whitespace-only is rejected
      expect(() => Discount.percentage(10, '')).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(10, '   ')).toThrow(InvalidDiscountException);
      expect(() => Discount.fixed(10, '\t\n ')).toThrow(InvalidDiscountException);

      // Max length 255 chars
      const exact255 = 'R'.repeat(255);
      expect(Discount.percentage(10, exact255).reason?.length).toBe(255);

      const tooLong256 = 'R'.repeat(256);
      expect(() => Discount.percentage(10, tooLong256)).toThrow(InvalidDiscountException);

      // Non-string reason rejected
      expect(() => {
        Discount.create({
          type: DiscountType.FIXED,
          value: 10,
          reason: 12345 as unknown as string,
        });
      }).toThrow(InvalidDiscountException);
    });
  });

  // ============================================================================
  // 2. Discount Calculation
  // ============================================================================
  describe('2. Discount Calculation', () => {
    it('calculates fixed discount correctly', () => {
      const discount = Discount.fixed(20.0);
      const result = discount.calculate(Money.create(100.0, 'USD'));
      expect(result.amount).toBe(20.0);
      expect(result.currency).toBe('USD');
    });

    it('calculates percentage discount correctly', () => {
      const discount = Discount.percentage(20);
      const result = discount.calculate(Money.create(100.0, 'USD'));
      expect(result.amount).toBe(20.0);
      expect(result.currency).toBe('USD');
    });

    it('calculates zero discount as exactly $0.00 for both types', () => {
      const zeroFixed = Discount.fixed(0);
      const zeroPct = Discount.percentage(0);
      const eligible = Money.create(75.5, 'USD');

      expect(zeroFixed.calculate(eligible).amount).toBe(0.0);
      expect(zeroFixed.calculate(eligible).isZero()).toBe(true);
      expect(zeroPct.calculate(eligible).amount).toBe(0.0);
      expect(zeroPct.calculate(eligible).isZero()).toBe(true);
    });

    it('calculates full 100% discount equal to exact eligible amount', () => {
      const full = Discount.percentage(100);
      const eligible = Money.create(84.99, 'USD');
      const result = full.calculate(eligible);

      expect(result.amount).toBe(84.99);
      expect(result.equals(eligible)).toBe(true);
    });

    it('calculates fixed discount exactly equal to eligible amount', () => {
      const discount = Discount.fixed(50.0);
      const eligible = Money.create(50.0, 'USD');
      const result = discount.calculate(eligible);

      expect(result.amount).toBe(50.0);
      expect(result.equals(eligible)).toBe(true);
    });

    it('strictly rejects fixed discount greater than eligible amount without clamping', () => {
      const discount = Discount.fixed(50.01);
      const eligible = Money.create(50.0, 'USD');

      expect(() => {
        discount.calculate(eligible);
      }).toThrow(InvalidDiscountException);

      expect(() => {
        discount.calculate(50.0);
      }).toThrow(InvalidDiscountException);
    });

    it('performs Commercial Half-Up rounding for percentage calculations', () => {
      const discount15 = Discount.percentage(15);
      // 49.99 * 0.15 = 7.4985 -> 749.85 cents -> rounds to 750 cents = $7.50
      expect(discount15.calculate(Money.create(49.99, 'USD')).amount).toBe(7.5);

      const discount10 = Discount.percentage(10);
      // 33.33 * 0.10 = 3.333 -> 333.3 cents -> rounds to 333 cents = $3.33
      expect(discount10.calculate(Money.create(33.33, 'USD')).amount).toBe(3.33);

      // 33.33 * 0.15 = 4.9995 -> 499.95 cents -> rounds to 500 cents = $5.00
      expect(discount15.calculate(Money.create(33.33, 'USD')).amount).toBe(5.0);
    });

    it('handles very small monetary amounts without fractional penny leakage', () => {
      const discount10 = Discount.percentage(10);
      // 0.01 * 0.10 = 0.001 -> 0.1 cents -> rounds down to 0 cents = $0.00
      expect(discount10.calculate(Money.create(0.01, 'USD')).amount).toBe(0.0);

      const discount50 = Discount.percentage(50);
      // 0.01 * 0.50 = 0.005 -> 0.5 cents -> Half-Up rounds to 1 cent = $0.01
      expect(discount50.calculate(Money.create(0.01, 'USD')).amount).toBe(0.01);

      // 0.05 * 0.10 = 0.005 -> 0.5 cents -> Half-Up rounds to 1 cent = $0.01
      expect(discount10.calculate(Money.create(0.05, 'USD')).amount).toBe(0.01);
    });

    it('handles large monetary amounts deterministically without precision loss', () => {
      const discount12Half = Discount.percentage(12.5);
      const million = Money.create(1_000_000.0, 'USD');
      expect(discount12Half.calculate(million).amount).toBe(125_000.0);

      const maxTen = Discount.percentage(10);
      const maxScale = Money.create(9_999_999.99, 'USD');
      // 9,999,999.99 * 0.10 = 999,999.999 -> rounds to 1,000,000.00
      expect(maxTen.calculate(maxScale).amount).toBe(1_000_000.0);
    });

    it('produces identical deterministic results across repeated calculations', () => {
      const discount = Discount.percentage(18.75);
      const eligible = Money.create(142.85, 'USD');

      const r1 = discount.calculate(eligible);
      const r2 = discount.calculate(eligible);
      const r3 = discount.calculate(eligible);

      expect(r1.amount).toBe(r2.amount);
      expect(r2.amount).toBe(r3.amount);
      expect(r1.equals(r2)).toBe(true);
      expect(r2.equals(r3)).toBe(true);
    });

    it('handles zero eligible amount correctly', () => {
      const pct = Discount.percentage(20);
      expect(pct.calculate(Money.zero('USD')).amount).toBe(0);

      const zeroFixed = Discount.fixed(0);
      expect(zeroFixed.calculate(Money.zero('USD')).amount).toBe(0);

      // Positive fixed discount against zero eligible amount must be rejected
      const positiveFixed = Discount.fixed(5.0);
      expect(() => positiveFixed.calculate(Money.zero('USD'))).toThrow(InvalidDiscountException);
    });

    it('rejects negative, NaN, non-finite, and non-numeric eligible amounts', () => {
      const discount = Discount.percentage(10);

      expect(() => discount.calculate(-5.0)).toThrow(InvalidDiscountException);
      expect(() => discount.calculate(NaN)).toThrow(InvalidDiscountException);
      expect(() => discount.calculate(Infinity)).toThrow(InvalidDiscountException);
      expect(() => discount.calculate(-Infinity)).toThrow(InvalidDiscountException);
      expect(() => discount.calculate('100' as unknown as number)).toThrow(
        InvalidDiscountException,
      );
    });
  });

  // ============================================================================
  // 3. SaleItem Integration
  // ============================================================================
  describe('3. SaleItem Integration', () => {
    it('handles SaleItem without discount', () => {
      const item = SaleItem.create({
        source: baseSource,
        description: 'Plain Item',
        quantity: 3,
        unitPrice: Money.create(25.0, 'USD'),
      });

      expect(item.discount).toBeNull();
      expect(item.subtotal.amount).toBe(75.0);
      expect(item.discountTotal.amount).toBe(0.0);
      expect(item.total.amount).toBe(75.0);
    });

    it('handles SaleItem with fixed discount', () => {
      const item = SaleItem.create({
        source: baseSource,
        description: 'Fixed Discount Item',
        quantity: 2,
        unitPrice: Money.create(40.0, 'USD'), // subtotal = 80.00
        discount: Discount.fixed(15.0, '$15 Off Voucher'),
      });

      expect(item.subtotal.amount).toBe(80.0);
      expect(item.discountTotal.amount).toBe(15.0);
      expect(item.total.amount).toBe(65.0);
    });

    it('handles SaleItem with percentage discount', () => {
      const item = SaleItem.create({
        source: baseSource,
        description: 'Percentage Discount Item',
        quantity: 1,
        unitPrice: Money.create(80.0, 'USD'),
        discount: Discount.percentage(25, '25% Off'),
      });

      expect(item.subtotal.amount).toBe(80.0);
      expect(item.discountTotal.amount).toBe(20.0);
      expect(item.total.amount).toBe(60.0);
    });

    it('strictly rejects fixed discount exceeding subtotal on SaleItem creation', () => {
      expect(() => {
        SaleItem.create({
          source: baseSource,
          description: 'Excessive Discount Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(55.0, 'Exceeds Subtotal'),
        });
      }).toThrow(InvalidDiscountException);
    });

    it('preserves historical discount terms across functional updates', () => {
      const item = SaleItem.create({
        source: baseSource,
        description: 'Original Item',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
        discount: Discount.fixed(10.0, 'Voucher 10'),
      });

      const updatedQty = item.withQuantity(2); // subtotal becomes 200, discount 10 -> net 190
      expect(updatedQty.subtotal.amount).toBe(200.0);
      expect(updatedQty.discountTotal.amount).toBe(10.0);
      expect(updatedQty.total.amount).toBe(190.0);

      // Original instance is completely untouched
      expect(item.quantity).toBe(1);
      expect(item.subtotal.amount).toBe(100.0);
      expect(item.discountTotal.amount).toBe(10.0);
      expect(item.total.amount).toBe(90.0);
    });
  });

  // ============================================================================
  // 4. Sale Aggregate Reconciliation & Invariants
  // ============================================================================
  describe('4. Sale Aggregate Reconciliation & Invariants', () => {
    it('reconciles Sale with one discounted item', () => {
      const sale = Sale.create({ source: baseSource }, clock);
      sale.addItem(
        {
          source: baseSource,
          description: 'Single Discounted Item',
          quantity: 2,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.percentage(20, '20% Member'),
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(80.0);
    });

    it('reconciles Sale with multiple differently discounted items', () => {
      const sale = Sale.create({ source: baseSource }, clock);

      // Line 1: 1 x 100.00 with 20% discount (20.00) -> net 80.00
      sale.addItem(
        {
          source: baseSource,
          description: 'Line 1 - Percentage',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(20),
        },
        clock,
      );

      // Line 2: 2 x 30.00 with fixed 15.00 discount -> subtotal 60.00, discount 15.00 -> net 45.00
      sale.addItem(
        {
          source: baseSource,
          description: 'Line 2 - Fixed',
          quantity: 2,
          unitPrice: Money.create(30.0, 'USD'),
          discount: Discount.fixed(15.0),
        },
        clock,
      );

      // Line 3: 1 x 40.00 without discount -> net 40.00
      sale.addItem(
        {
          source: baseSource,
          description: 'Line 3 - None',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );

      // Aggregations:
      // subtotal = 100 + 60 + 40 = 200.00
      // discountTotal = 20 + 15 + 0 = 35.00
      // total = 200 - 35 = 165.00
      expect(sale.subtotal.amount).toBe(200.0);
      expect(sale.discountTotal.amount).toBe(35.0);
      expect(sale.total.amount).toBe(165.0);
    });

    it('preserves failure atomicity when invalid mutation is attempted', () => {
      const sale = Sale.create({ source: baseSource }, clock);
      sale.addItem(
        {
          source: baseSource,
          description: 'Initial Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixed(10.0),
        },
        clock,
      );

      const beforeItems = sale.items.length;
      const beforeSubtotal = sale.subtotal.amount;
      const beforeDiscountTotal = sale.discountTotal.amount;
      const beforeTotal = sale.total.amount;

      // Attempt invalid item addition where fixed discount (60) > subtotal (50)
      expect(() => {
        sale.addItem(
          {
            source: baseSource,
            description: 'Excessive Discount Item',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
            discount: Discount.fixed(60.0),
          },
          clock,
        );
      }).toThrow(InvalidDiscountException);

      // State is 100% unchanged
      expect(sale.items.length).toBe(beforeItems);
      expect(sale.subtotal.amount).toBe(beforeSubtotal);
      expect(sale.discountTotal.amount).toBe(beforeDiscountTotal);
      expect(sale.total.amount).toBe(beforeTotal);
    });

    it('prohibits discount mutation on finalized/immutable Sales', () => {
      const sale = Sale.create({ source: baseSource }, clock);
      const item = sale.addItem(
        {
          source: baseSource,
          description: 'Locked Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(10.0),
        },
        clock,
      );

      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.fixed(20.0), clock);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.removeItemDiscount(item.id, clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });
  });

  // ============================================================================
  // 5. Historical Regression (Source Mutability Decoupling)
  // ============================================================================
  describe('5. Historical Regression (Source Mutability Decoupling)', () => {
    it('proves that source price, description, discount, and status changes leave existing SaleItem unchanged', () => {
      // 1. Initial source state in operational catalog
      const sourceState = {
        id: 'catalog-item-42',
        code: 'YOGA-MAT-ECO',
        name: 'Eco-Friendly Cork Yoga Mat',
        catalogPrice: Money.create(48.0, 'USD'),
        promotionalDiscount: Discount.percentage(10, 'Seasonal 10%'),
        status: 'ACTIVE',
      };

      const sourceRef = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: sourceState.id,
        sourceCode: sourceState.code,
      });

      // 2. Checkout session snapshots commercial terms
      const sale = Sale.create({ source: sourceRef }, clock);
      const item = sale.addItem(
        {
          source: sourceRef,
          description: sourceState.name,
          skuOrCode: sourceState.code,
          quantity: 2,
          unitPrice: sourceState.catalogPrice,
          discount: sourceState.promotionalDiscount,
        },
        clock,
      );

      // Captured historical state
      expect(item.description).toBe('Eco-Friendly Cork Yoga Mat');
      expect(item.unitPrice.amount).toBe(48.0);
      expect(item.quantity).toBe(2);
      expect(item.discount?.value).toBe(10);
      expect(item.subtotal.amount).toBe(96.0);
      expect(item.discountTotal.amount).toBe(9.6);
      expect(item.total.amount).toBe(86.4);
      expect(sale.total.amount).toBe(86.4);

      // 3. Upstream catalog mutates ALL four dimensions:
      // a) Source price changes: $48.00 -> $65.00
      sourceState.catalogPrice = Money.create(65.0, 'USD');
      // b) Source description changes: Renamed product
      sourceState.name = 'Premium Ultra-Grip Natural Cork Mat (Pro Edition)';
      // c) Source discount changes: Promo increased to 25%
      sourceState.promotionalDiscount = Discount.percentage(25, 'Super Promo 25%');
      // d) Source status changes: Product discontinued / archived
      sourceState.status = 'DISCONTINUED';

      // 4. Assert that established historical SaleItem and Sale remain completely frozen
      expect(item.description).toBe('Eco-Friendly Cork Yoga Mat');
      expect(item.description).not.toBe(sourceState.name);

      expect(item.unitPrice.amount).toBe(48.0);
      expect(item.unitPrice.amount).not.toBe(sourceState.catalogPrice.amount);

      expect(item.discount?.value).toBe(10);
      expect(item.discount?.value).not.toBe(sourceState.promotionalDiscount.value);

      expect(item.subtotal.amount).toBe(96.0);
      expect(item.discountTotal.amount).toBe(9.6);
      expect(item.total.amount).toBe(86.4);

      expect(sale.subtotal.amount).toBe(96.0);
      expect(sale.discountTotal.amount).toBe(9.6);
      expect(sale.total.amount).toBe(86.4);

      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.discount)).toBe(true);
    });
  });

  // ============================================================================
  // 6. Security & Architecture Boundaries
  // ============================================================================
  describe('6. Security & Architecture Boundaries', () => {
    it('guarantees zero foreign aggregate, NestJS, Prisma, or HTTP imports in Sales Domain code', () => {
      const salesDomainPath = path.resolve(__dirname, '..');

      function getTsFiles(dirPath: string): string[] {
        const files: string[] = [];
        if (!fs.existsSync(dirPath)) return files;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory() && entry.name !== '__tests__') {
            files.push(...getTsFiles(fullPath));
          } else if (
            entry.isFile() &&
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.spec.ts')
          ) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const domainFiles = getTsFiles(salesDomainPath);
      expect(domainFiles.length).toBeGreaterThan(0);

      const forbiddenImports = [
        '@nestjs',
        '@prisma',
        'prisma',
        'express',
        'axios',
        'fetch',
        'gym/domain',
        'resources/domain/inventory-item',
        'kinesiology/domain',
        'scheduling/domain',
      ];

      for (const filePath of domainFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const forbidden of forbiddenImports) {
          const regex = new RegExp(`from\\s+['"].*${forbidden}.*['"]`, 'i');
          if (regex.test(content)) {
            throw new Error(
              `Architecture boundary violation: File '${filePath}' imports '${forbidden}'.`,
            );
          }
        }
      }
    });

    it('proves that Discount and SaleItem instances are deeply immutable', () => {
      const discount = Discount.fixed(15.0, 'Frozen Voucher');
      const item = SaleItem.create({
        source: baseSource,
        description: 'Frozen Item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        discount,
      });

      expect(Object.isFrozen(discount)).toBe(true);
      expect(Object.isFrozen(item)).toBe(true);

      // Mutation attempts throw in strict mode
      expect(() => {
        (discount as unknown as { _value: number })._value = 99;
      }).toThrow(TypeError);

      expect(() => {
        (item as unknown as { _quantity: number })._quantity = 99;
      }).toThrow(TypeError);
    });
  });
});
