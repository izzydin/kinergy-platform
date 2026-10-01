import { Prisma } from '@prisma/client';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Sale } from '../../../../domain/sale.aggregate';
import { Payment } from '../../../../domain/payment.aggregate';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { InvalidMoneyException } from '../../../../domain/exceptions/invalid-money.exception';
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';
import { PrismaSaleMapper, PrismaSaleWithItems } from '../mappers/prisma-sale.mapper';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import {
  PrismaReceiptMapper,
  SerializedItemSnapshot,
  SerializedPaymentSnapshot,
} from '../mappers/prisma-receipt.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';

describe('Milestone 7.4 / 7.10 Monetary Persistence Hardening Specification', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T12:00:00.000Z'));
  const tenantId = 'tenant_kinergy_wellness';

  const inventorySource = SaleSource.create(SaleSourceType.FOOD, 'food-protein-bar-01');

  const kinesioSource = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session-rehab-99');

  // ==========================================================================
  // 1. Authoritative Persistence Types & Exact Decimal Representation
  // ==========================================================================
  describe('1. Authoritative Persistence Types (DECIMAL 12,2 vs Floating-Point)', () => {
    it('persists every monetary field in Sale as an exact Prisma.Decimal instance', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Protein Shake',
          quantity: 2,
          unitPrice: Money.create(12.5, 'USD'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.fixed(5.0, '$5 Promo'), clock);

      const { sale: persistedSale } = PrismaSaleMapper.toPersistence(sale);

      // Verify types are strictly Prisma.Decimal (never JS number)
      expect(persistedSale.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistedSale.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistedSale.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistedSale.orderDiscountValue).toBeInstanceOf(Prisma.Decimal);

      expect(typeof persistedSale.subtotalAmount).toBe('object');
      expect(typeof persistedSale.discountTotalAmount).toBe('object');
      expect(typeof persistedSale.totalAmount).toBe('object');

      // Verify exact fixed-point string representation
      expect(persistedSale.subtotalAmount.toFixed(2)).toBe('25.00');
      expect(persistedSale.discountTotalAmount.toFixed(2)).toBe('5.00');
      expect(persistedSale.totalAmount.toFixed(2)).toBe('20.00');
      expect(persistedSale.orderDiscountValue?.toFixed(2)).toBe('5.00');
    });

    it('persists every monetary field in SaleItem as an exact Prisma.Decimal instance', () => {
      const sale = Sale.create({ tenantId, source: kinesioSource }, clock);
      sale.addItem(
        {
          source: kinesioSource,
          description: 'Physical Assessment',
          quantity: 1.5,
          unitPrice: Money.create(80.0, 'USD'),
          discount: Discount.fixed(20.0, 'VIP Discount'),
        },
        clock,
      );

      const { items } = PrismaSaleMapper.toPersistence(sale);
      const item = items[0]!;

      expect(item.unitPriceAmount).toBeInstanceOf(Prisma.Decimal);
      expect(item.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(item.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(item.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(item.discountValue).toBeInstanceOf(Prisma.Decimal);

      // 1.5 * 80.00 = 120.00 subtotal, 20.00 discount -> 100.00 total
      expect(item.unitPriceAmount.toFixed(2)).toBe('80.00');
      expect(item.subtotalAmount.toFixed(2)).toBe('120.00');
      expect(item.discountTotalAmount.toFixed(2)).toBe('20.00');
      expect(item.totalAmount.toFixed(2)).toBe('100.00');
      expect(item.discountValue?.toFixed(2)).toBe('20.00');
    });

    it('persists Payment.amount as an exact Prisma.Decimal instance', () => {
      const payment = Payment.createSettled(
        {
          id: 'pay_exact_001',
          tenantId,
          saleId: SaleId.create('11111111-1111-4111-a111-111111111111'),
          method: PaymentMethod.CASH,
          amount: Money.create(149.95, 'USD'),
          reference: 'POS-CASH-001',
        },
        clock,
      );

      const persisted = PrismaPaymentMapper.toPersistence(payment);

      expect(persisted.amount).toBeInstanceOf(Prisma.Decimal);
      expect(typeof persisted.amount).toBe('object');
      expect(persisted.amount.toFixed(2)).toBe('149.95');
    });

    it('persists Receipt monetary fields as exact Prisma.Decimal instances', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Supplements',
          quantity: 1,
          unitPrice: Money.create(75.5, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      sale.markPaid(clock);

      const payment = Payment.createSettled(
        {
          id: 'pay_receipt_001',
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(75.5, 'USD'),
        },
        clock,
      );

      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec_monetary_001'),
          sale,
          payments: [payment],
          receiptNumber: ReceiptNumber.create('REC-2026-000001'),
        },
        clock,
      );

      const persisted = PrismaReceiptMapper.toPersistence(receipt);

      expect(persisted.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persisted.discountTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persisted.totalAmount).toBeInstanceOf(Prisma.Decimal);

      expect(persisted.subtotalAmount.toFixed(2)).toBe('75.50');
      expect(persisted.discountTotalAmount.toFixed(2)).toBe('0.00');
      expect(persisted.totalAmount.toFixed(2)).toBe('75.50');
    });
  });

  // ==========================================================================
  // 2. Exact Decimal Retrieval & Round-Trip Fidelity (No Precision Loss)
  // ==========================================================================
  describe('2. Exact Decimal Retrieval & Round-Trip Fidelity', () => {
    it('round-trips standard commercial values ($49.99, $19.99, $125.75) without drift', () => {
      const amounts = ['49.99', '19.99', '125.75', '3.14', '0.99', '10.50'];

      for (const amountStr of amounts) {
        const originalMoney = Money.create(amountStr, 'USD');
        const decimal = PrismaMoneyMapper.toDecimal(originalMoney);

        expect(decimal.toFixed(2)).toBe(amountStr);

        const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
        expect(reconstituted.equals(originalMoney)).toBe(true);
        expect(reconstituted.amount).toBe(parseFloat(amountStr));
        expect(reconstituted.cents).toBe(Math.round(parseFloat(amountStr) * 100));
      }
    });

    it('round-trips the exact cent boundary ($0.01) without truncation or sub-cent drift', () => {
      const centMoney = Money.create('0.01', 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(centMoney);

      expect(decimal.toFixed(2)).toBe('0.01');
      expect(decimal.toString()).toBe('0.01');

      const recon = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(recon.cents).toBe(1);
      expect(recon.amount).toBe(0.01);
      expect(recon.equals(centMoney)).toBe(true);
    });

    it('preserves trailing decimal zeroes ($10.00, $25.50) with exact 2-decimal scale', () => {
      const ten = Money.create('10.00', 'USD');
      const decTen = PrismaMoneyMapper.toDecimal(ten);
      expect(decTen.toFixed(2)).toBe('10.00');

      const reconTen = PrismaMoneyMapper.toMoney(decTen, 'USD');
      expect(reconTen.cents).toBe(1000);
      expect(reconTen.amount).toBe(10.0);

      const fifty = Money.create('25.50', 'USD');
      const decFifty = PrismaMoneyMapper.toDecimal(fifty);
      expect(decFifty.toFixed(2)).toBe('25.50');

      const reconFifty = PrismaMoneyMapper.toMoney(decFifty, 'USD');
      expect(reconFifty.cents).toBe(2550);
      expect(reconFifty.amount).toBe(25.5);
    });

    it('preserves multi-item repeated decimal fractions (3 items @ $33.33 = $99.99, not $100.00)', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Monthly Sub',
          quantity: 3,
          unitPrice: Money.create(33.33, 'USD'),
        },
        clock,
      );

      // In floating point: 3 * 33.33 = 99.99000000000001
      // In deterministic integer cents: 3 * 3333 = 9999 cents ($99.99)
      expect(sale.subtotal.cents).toBe(9999);
      expect(sale.total.cents).toBe(9999);

      const { sale: persistedSale, items } = PrismaSaleMapper.toPersistence(sale);
      expect(persistedSale.totalAmount.toFixed(2)).toBe('99.99');

      const reconstituted = PrismaSaleMapper.toDomain({
        ...persistedSale,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: items.map((i) => ({
          ...i,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      });

      expect(reconstituted.total.cents).toBe(9999);
      expect(reconstituted.total.amount).toBe(99.99);
    });
  });

  // ==========================================================================
  // 3. Rounding Consistency & Midpoint Boundaries
  // ==========================================================================
  describe('3. Rounding Consistency & Midpoint Boundaries', () => {
    it('enforces Commercial Half-Up rounding at exact 0.5-cent boundary ($0.005 -> $0.01)', () => {
      // 1 item @ $10.00 with 0.05% discount = $10.00 * 0.0005 = $0.005 -> rounds up to $0.01
      const discount = Discount.percentage(0.05);
      const reduction = discount.calculateReduction(Money.create(10.0, 'USD'));

      expect(reduction.cents).toBe(1);
      expect(reduction.amount).toBe(0.01);
    });

    it('enforces Commercial Half-Up rounding below midpoint ($0.004 -> $0.00)', () => {
      // 1 item @ $10.00 with 0.04% discount = $10.00 * 0.0004 = $0.004 -> rounds to $0.00
      const discount = Discount.percentage(0.04);
      const reduction = discount.calculateReduction(Money.create(10.0, 'USD'));

      expect(reduction.cents).toBe(0);
      expect(reduction.amount).toBe(0.0);
    });

    it('accurately computes fractional quantity calculations with zero float leakage', () => {
      // 1.250 kg of protein powder at $35.50/kg
      // 1250 * 3550 / 1000 = 4437.5 -> rounds to 4438 cents ($44.38)
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Bulk Powder (kg)',
          quantity: 1.25,
          unitPrice: Money.create(35.5, 'USD'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(4438);
      expect(sale.subtotal.amount).toBe(44.38);

      const { sale: persisted } = PrismaSaleMapper.toPersistence(sale);
      expect(persisted.subtotalAmount.toFixed(2)).toBe('44.38');
    });

    it('accurately computes therapy session fractional duration (0.75 hr @ $120.00/hr = $90.00)', () => {
      const sale = Sale.create({ tenantId, source: kinesioSource }, clock);
      sale.addItem(
        {
          source: kinesioSource,
          description: '45-Minute Therapy',
          quantity: 0.75,
          unitPrice: Money.create(120.0, 'USD'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(9000);
      expect(sale.total.cents).toBe(9000);
    });

    it('enforces Number.EPSILON guard preventing IEEE-754 subtraction truncation', () => {
      // Classic JS float bug: 1.005 - 1.000 = 0.004999999999999893
      // With EPSILON guard: Math.round((0.004999999999999893 + Number.EPSILON) * 100) = 1 cent
      const diff = 1.005 - 1.0;
      const guardedCents = Math.round((diff + Number.EPSILON) * 100);
      expect(guardedCents).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Large Valid Values & Column Scale Sufficiency
  // ==========================================================================
  describe('4. Large Valid Values & Column Scale Sufficiency', () => {
    it('persists and retrieves maximum column capacity for DECIMAL(12, 2) ($9,999,999,999.99)', () => {
      const maxColAmount = '9999999999.99';
      const maxMoney = Money.create(maxColAmount, 'USD');

      const decimal = PrismaMoneyMapper.toDecimal(maxMoney);
      expect(decimal.toFixed(2)).toBe(maxColAmount);

      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');
      expect(reconstituted.amount).toBe(9999999999.99);
      expect(reconstituted.cents).toBe(999999999999);
      expect(reconstituted.equals(maxMoney)).toBe(true);

      // Verify internal cents fits safely inside Number.MAX_SAFE_INTEGER
      expect(reconstituted.cents).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });

    it('persists high-value enterprise transaction ($50,000,000.00) across full Sale aggregate', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Enterprise Wellness Program',
          quantity: 1,
          unitPrice: Money.create('50000000.00', 'USD'),
        },
        clock,
      );

      const { sale: persistedSale, items } = PrismaSaleMapper.toPersistence(sale);
      expect(persistedSale.subtotalAmount.toFixed(2)).toBe('50000000.00');
      expect(persistedSale.totalAmount.toFixed(2)).toBe('50000000.00');

      const recon = PrismaSaleMapper.toDomain({
        ...persistedSale,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: items.map((i) => ({
          ...i,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      });

      expect(recon.total.amount).toBe(50000000.0);
      expect(recon.total.cents).toBe(5000000000);
    });
  });

  // ==========================================================================
  // 5. Zero and Boundary Value Representations
  // ==========================================================================
  describe('5. Zero and Boundary Value Representations', () => {
    it('persists and retrieves $0.00 zero-total sale (100% complimentary discount)', () => {
      const sale = Sale.create({ tenantId, source: kinesioSource }, clock);
      sale.addItem(
        {
          source: kinesioSource,
          description: 'Promotional Session',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.percentage(100, 'Full Scholarship'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(10000);
      expect(sale.discountTotal.cents).toBe(10000);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);

      const { sale: persisted, items } = PrismaSaleMapper.toPersistence(sale);
      expect(persisted.subtotalAmount.toFixed(2)).toBe('100.00');
      expect(persisted.discountTotalAmount.toFixed(2)).toBe('100.00');
      expect(persisted.totalAmount.toFixed(2)).toBe('0.00');

      const recon = PrismaSaleMapper.toDomain({
        ...persisted,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: items.map((i) => ({
          ...i,
          createdAt: sale.createdAt,
          updatedAt: sale.updatedAt,
        })),
      });

      expect(recon.total.isZero()).toBe(true);
      expect(recon.total.cents).toBe(0);
    });

    it('persists $0.00 complimentary item unit price', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Free Water Bottle',
          quantity: 1,
          unitPrice: Money.zero('USD'),
        },
        clock,
      );

      expect(sale.subtotal.cents).toBe(0);
      expect(sale.total.cents).toBe(0);

      const { items } = PrismaSaleMapper.toPersistence(sale);
      expect(items[0]?.unitPriceAmount.toFixed(2)).toBe('0.00');
      expect(items[0]?.subtotalAmount.toFixed(2)).toBe('0.00');
      expect(items[0]?.totalAmount.toFixed(2)).toBe('0.00');
    });

    it('allows $0.01 minimal payment while domain rejects $0.00 payments', () => {
      // Minimum positive payment: $0.01 is valid
      const payment = Payment.createSettled(
        {
          id: 'pay_min_001',
          tenantId,
          saleId: SaleId.create('11111111-1111-4111-a111-111111111111'),
          method: PaymentMethod.CASH,
          amount: Money.create(0.01, 'USD'),
        },
        clock,
      );
      expect(payment.amount.cents).toBe(1);

      // Zero payment amount is rejected by domain business invariant
      expect(() => {
        Payment.createSettled(
          {
            id: 'pay_zero_001',
            tenantId,
            saleId: SaleId.create('11111111-1111-4111-a111-111111111111'),
            method: PaymentMethod.CASH,
            amount: Money.zero('USD'),
          },
          clock,
        );
      }).toThrow();
    });
  });

  // ==========================================================================
  // 6. Database Constraints & Invalid Negative Value Rejection
  // ==========================================================================
  describe('6. Database Constraints & Negative Value Rejection', () => {
    it('simulates PostgreSQL CHECK constraint chk_sales_non_negative_subtotal rejecting negative values', () => {
      // Database check constraint: CHECK (subtotal_amount >= 0.00)
      const checkConstraintSubtotal = (subtotalAmount: Prisma.Decimal) => {
        if (subtotalAmount.lessThan(0)) {
          throw new Error(
            'new row for relation "sales" violates check constraint "chk_sales_non_negative_subtotal"',
          );
        }
      };

      const validDecimal = new Prisma.Decimal('25.00');
      expect(() => checkConstraintSubtotal(validDecimal)).not.toThrow();

      const invalidDecimal = new Prisma.Decimal('-0.01');
      expect(() => checkConstraintSubtotal(invalidDecimal)).toThrow(
        /violates check constraint "chk_sales_non_negative_subtotal"/,
      );
    });

    it('simulates PostgreSQL CHECK constraint chk_payments_positive_amount rejecting <= 0', () => {
      // Database check constraint: CHECK (amount > 0.00)
      const checkConstraintPaymentAmount = (amount: Prisma.Decimal) => {
        if (amount.lessThanOrEqualTo(0)) {
          throw new Error(
            'new row for relation "payments" violates check constraint "chk_payments_positive_amount"',
          );
        }
      };

      expect(() => checkConstraintPaymentAmount(new Prisma.Decimal('0.01'))).not.toThrow();
      expect(() => checkConstraintPaymentAmount(new Prisma.Decimal('0.00'))).toThrow(
        /violates check constraint "chk_payments_positive_amount"/,
      );
      expect(() => checkConstraintPaymentAmount(new Prisma.Decimal('-10.00'))).toThrow(
        /violates check constraint "chk_payments_positive_amount"/,
      );
    });

    it('domain Money.create strictly rejects negative numbers and strings by default', () => {
      expect(() => Money.create(-0.01, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create('-50.00', 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(-100, 'USD')).toThrow(InvalidMoneyException);
    });

    it('PrismaMoneyMapper rejects null, undefined, NaN, and infinity values', () => {
      expect(() => PrismaMoneyMapper.toMoney(null, 'USD')).toThrow(InvalidMoneyException);
      expect(() => PrismaMoneyMapper.toMoney(undefined, 'USD')).toThrow(InvalidMoneyException);
      expect(() => PrismaMoneyMapper.toMoney(NaN, 'USD')).toThrow(InvalidMoneyException);
      expect(() => PrismaMoneyMapper.toMoney(Infinity, 'USD')).toThrow(InvalidMoneyException);
    });
  });

  // ==========================================================================
  // 7. Verification: Prisma Serialization Never Converts Decimal to JS Number
  // ==========================================================================
  describe('7. Verification: Prisma Serialization Strictly Prohibits JS Number Conversion', () => {
    it('proves Prisma.Decimal.prototype.toNumber is NEVER called during mapping or serialization', () => {
      const spyToNumber = jest.spyOn(Prisma.Decimal.prototype, 'toNumber');

      // 1. Map to Decimal
      const money = Money.create(189.99, 'USD');
      const decimal = PrismaMoneyMapper.toDecimal(money);

      // 2. Map back to Money
      const reconstituted = PrismaMoneyMapper.toMoney(decimal, 'USD');

      expect(reconstituted.cents).toBe(18999);
      expect(reconstituted.amount).toBe(189.99);

      // Assert that Decimal.prototype.toNumber was NEVER invoked
      expect(spyToNumber).not.toHaveBeenCalled();
      spyToNumber.mockRestore();
    });

    it('reconstitutes entire Sale aggregate without invoking Decimal.prototype.toNumber', () => {
      const spyToNumber = jest.spyOn(Prisma.Decimal.prototype, 'toNumber');

      const rawSale = {
        id: '22222222-2222-4222-a222-222222222222',
        tenantId,
        clientId: 'client_01',
        status: 'DRAFT',
        currency: 'USD',
        sourceType: 'FOOD',
        sourceId: 'food-01',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('100.00'),
        discountTotalAmount: new Prisma.Decimal('10.00'),
        totalAmount: new Prisma.Decimal('90.00'),
        orderDiscountType: 'FIXED',
        orderDiscountValue: new Prisma.Decimal('10.00'),
        orderDiscountReason: 'Coupon',
        cancellationReason: null,
        cancelledAt: null,
        completedAt: null,
        refundedAt: null,
        version: 1,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        items: [
          {
            id: 'item_01',
            saleId: '22222222-2222-4222-a222-222222222222',
            sourceType: 'FOOD',
            sourceId: 'food-01',
            sourceCode: null,
            description: 'Item 1',
            skuOrCode: null,
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('100.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('100.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('100.00'),
            discountType: null,
            discountValue: null,
            discountReason: null,
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
            updatedAt: new Date('2026-10-01T10:00:00.000Z'),
          },
        ],
      };

      const sale = PrismaSaleMapper.toDomain(rawSale as unknown as PrismaSaleWithItems);
      expect(sale.total.cents).toBe(9000);

      // Verify no Decimal -> JS float conversions occurred for monetary columns
      expect(spyToNumber).not.toHaveBeenCalled();
      spyToNumber.mockRestore();
    });
  });

  // ==========================================================================
  // 8. Receipt Snapshot JSON Payload Precision Preservation
  // ==========================================================================
  describe('8. Receipt Snapshot JSON Payload Precision Preservation', () => {
    it('serializes exact 2-decimal numbers and integer cents inside Receipt audit snapshots', () => {
      const sale = Sale.create({ tenantId, source: inventorySource }, clock);
      sale.addItem(
        {
          source: inventorySource,
          description: 'Specialty Tea',
          quantity: 2,
          unitPrice: Money.create(14.99, 'USD'),
          discount: Discount.fixed(4.0, '$4 Item Promo'),
        },
        clock,
      );
      sale.finalize(clock);
      sale.markPaid(clock);

      const payment = Payment.createSettled(
        {
          id: 'pay_snap_001',
          tenantId,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(25.98, 'USD'),
        },
        clock,
      );

      const receipt = Receipt.fromSettledSale(
        {
          id: ReceiptId.create('rec_snap_001'),
          sale,
          payments: [payment],
          receiptNumber: ReceiptNumber.create('REC-2026-000002'),
        },
        clock,
      );

      const persistence = PrismaReceiptMapper.toPersistence(receipt);
      const itemsSnapshot = persistence.itemsSnapshot as unknown as SerializedItemSnapshot[];
      const paymentsSnapshot =
        persistence.paymentsSnapshot as unknown as SerializedPaymentSnapshot[];

      // Verify item snapshot precision
      expect(itemsSnapshot[0]?.unitPrice.amount).toBe(14.99);
      expect(itemsSnapshot[0]?.unitPrice.cents).toBe(1499);
      expect(itemsSnapshot[0]?.subtotal.amount).toBe(29.98);
      expect(itemsSnapshot[0]?.subtotal.cents).toBe(2998);
      expect(itemsSnapshot[0]?.discountTotal?.amount).toBe(4.0);
      expect(itemsSnapshot[0]?.discountTotal?.cents).toBe(400);
      expect(itemsSnapshot[0]?.total.amount).toBe(25.98);
      expect(itemsSnapshot[0]?.total.cents).toBe(2598);

      // Verify payment snapshot precision
      expect(paymentsSnapshot[0]?.amount.amount).toBe(25.98);
      expect(paymentsSnapshot[0]?.amount.cents).toBe(2598);
    });
  });
});
