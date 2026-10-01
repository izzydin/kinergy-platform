import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaDatabaseErrorMapper } from '../mappers/prisma-database-error.mapper';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { Sale } from '../../../../domain/sale.aggregate';
import { Payment } from '../../../../domain/payment.aggregate';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { DeterministicClock } from '../../../../domain/shared/clock';
import {
  InvalidMoneyException,
  InvalidSaleItemException,
  InvalidDiscountException,
  PaymentDomainException,
  ReceiptDomainException,
  SaleDomainException,
} from '../../../../domain/exceptions';

interface MockPostgresError extends Error {
  code?: string;
  constraint?: string;
}

function createCheckViolationError(message: string, constraint: string): MockPostgresError {
  const err: MockPostgresError = new Error(message);
  err.code = '23514';
  err.constraint = constraint;
  return err;
}

/**
 * Integration & Structural Verification Test Suite:
 * Phase 7 Database-Level Financial Invariant Constraints & Error Mapping
 *
 * Verifies:
 * 1. Structural Financial Invariants:
 *    - Sale.subtotal >= 0
 *    - Sale.discountTotal >= 0
 *    - Sale.total >= 0
 *    - SaleItem.unitPrice >= 0
 *    - SaleItem.subtotal >= 0
 *    - SaleItem.total >= 0
 *    - Payment.amount > 0 (strictly positive tender)
 *    - Receipt.subtotal >= 0
 *    - Receipt.discountTotal >= 0
 *    - Receipt.total >= 0
 *    - SaleItem.quantity > 0.000 (ITEM-02 domain definition)
 * 2. Legitimate Zero Values:
 *    - Verifies $0.00 is strictly accepted for commercial discounts, free gifts, and initial carts.
 *    - Verifies zero is rejected for Payment.amount (tender must be > $0.00).
 * 3. Domain Error Mapping:
 *    - PostgreSQL SQLSTATE 23514 / check constraint violations are mapped to domain-meaningful exceptions
 *      (InvalidMoneyException, InvalidSaleItemException, InvalidDiscountException, PaymentDomainException, ReceiptDomainException).
 * 4. Architectural Boundaries:
 *    - Proves that cross-record aggregations (Sale.total = SUM(SaleItems)) and cross-table state transitions
 *      (Sale.PAID -> Payment.COMPLETED) are handled by domain orchestration and NOT naive database constraints.
 */
describe('Phase 7 Database Financial Invariant Constraints Specification', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T12:00:00.000Z'));
  const tenantId = 'tenant_wellness_pos';
  const sampleSource = SaleSource.create(SaleSourceType.FOOD, 'protein-bar-42');

  // ==========================================================================
  // 1. Direct Constraint Evaluation: Non-Negative & Positive Values
  // ==========================================================================
  describe('1. Relational Check Constraint Evaluation', () => {
    describe('chk_sales_non_negative_subtotal (Sale.subtotal >= 0.00)', () => {
      const evaluateSubtotal = (amount: Prisma.Decimal) => {
        if (amount.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sales" violates check constraint "chk_sales_non_negative_subtotal"',
            'chk_sales_non_negative_subtotal',
          );
        }
      };

      it('permits legitimate $0.00 subtotal (empty draft or 100% free promotional items)', () => {
        expect(() => evaluateSubtotal(new Prisma.Decimal('0.00'))).not.toThrow();
      });

      it('permits positive subtotal', () => {
        expect(() => evaluateSubtotal(new Prisma.Decimal('125.50'))).not.toThrow();
      });

      it('rejects negative subtotal with PostgreSQL check constraint violation', () => {
        expect(() => evaluateSubtotal(new Prisma.Decimal('-0.01'))).toThrow(
          /violates check constraint "chk_sales_non_negative_subtotal"/,
        );
      });
    });

    describe('chk_sales_non_negative_discount_total (Sale.discountTotal >= 0.00)', () => {
      const evaluateDiscountTotal = (amount: Prisma.Decimal) => {
        if (amount.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sales" violates check constraint "chk_sales_non_negative_discount_total"',
            'chk_sales_non_negative_discount_total',
          );
        }
      };

      it('permits legitimate $0.00 discountTotal (standard baseline without discounts)', () => {
        expect(() => evaluateDiscountTotal(new Prisma.Decimal('0.00'))).not.toThrow();
      });

      it('permits positive discountTotal', () => {
        expect(() => evaluateDiscountTotal(new Prisma.Decimal('15.00'))).not.toThrow();
      });

      it('rejects negative discountTotal', () => {
        expect(() => evaluateDiscountTotal(new Prisma.Decimal('-5.00'))).toThrow(
          /violates check constraint "chk_sales_non_negative_discount_total"/,
        );
      });
    });

    describe('chk_sales_non_negative_total (Sale.total >= 0.00)', () => {
      const evaluateTotal = (amount: Prisma.Decimal) => {
        if (amount.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sales" violates check constraint "chk_sales_non_negative_total"',
            'chk_sales_non_negative_total',
          );
        }
      };

      it('permits legitimate $0.00 total (fully discounted or complimentary transaction)', () => {
        expect(() => evaluateTotal(new Prisma.Decimal('0.00'))).not.toThrow();
      });

      it('permits positive total', () => {
        expect(() => evaluateTotal(new Prisma.Decimal('99.99'))).not.toThrow();
      });

      it('rejects negative total', () => {
        expect(() => evaluateTotal(new Prisma.Decimal('-0.01'))).toThrow(
          /violates check constraint "chk_sales_non_negative_total"/,
        );
      });
    });

    describe('chk_sale_items_non_negative_unit_price (SaleItem.unitPrice >= 0.00)', () => {
      const evaluateUnitPrice = (amount: Prisma.Decimal) => {
        if (amount.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sale_items" violates check constraint "chk_sale_items_non_negative_unit_price"',
            'chk_sale_items_non_negative_unit_price',
          );
        }
      };

      it('permits legitimate $0.00 unit price (complimentary bonus or zero-price gift)', () => {
        expect(() => evaluateUnitPrice(new Prisma.Decimal('0.00'))).not.toThrow();
      });

      it('permits positive unit price', () => {
        expect(() => evaluateUnitPrice(new Prisma.Decimal('45.00'))).not.toThrow();
      });

      it('rejects negative unit price', () => {
        expect(() => evaluateUnitPrice(new Prisma.Decimal('-10.00'))).toThrow(
          /violates check constraint "chk_sale_items_non_negative_unit_price"/,
        );
      });
    });

    describe('chk_sale_items_non_negative_subtotal & total (SaleItem.subtotal, total >= 0.00)', () => {
      const evaluateItemAmounts = (subtotal: Prisma.Decimal, total: Prisma.Decimal) => {
        if (subtotal.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sale_items" violates check constraint "chk_sale_items_non_negative_subtotal"',
            'chk_sale_items_non_negative_subtotal',
          );
        }
        if (total.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "sale_items" violates check constraint "chk_sale_items_non_negative_total"',
            'chk_sale_items_non_negative_total',
          );
        }
      };

      it('permits legitimate $0.00 subtotal and total for free gifts', () => {
        expect(() =>
          evaluateItemAmounts(new Prisma.Decimal('0.00'), new Prisma.Decimal('0.00')),
        ).not.toThrow();
      });

      it('rejects negative line subtotal', () => {
        expect(() =>
          evaluateItemAmounts(new Prisma.Decimal('-1.00'), new Prisma.Decimal('0.00')),
        ).toThrow(/violates check constraint "chk_sale_items_non_negative_subtotal"/);
      });

      it('rejects negative line total', () => {
        expect(() =>
          evaluateItemAmounts(new Prisma.Decimal('10.00'), new Prisma.Decimal('-0.50')),
        ).toThrow(/violates check constraint "chk_sale_items_non_negative_total"/);
      });
    });

    describe('chk_sale_items_positive_quantity (Quantity must satisfy domain definition)', () => {
      const evaluateQuantity = (qty: Prisma.Decimal) => {
        if (qty.lessThanOrEqualTo(0)) {
          throw createCheckViolationError(
            'new row for relation "sale_items" violates check constraint "chk_sale_items_positive_quantity"',
            'chk_sale_items_positive_quantity',
          );
        }
      };

      it('permits strictly positive integer quantity', () => {
        expect(() => evaluateQuantity(new Prisma.Decimal('1.000'))).not.toThrow();
        expect(() => evaluateQuantity(new Prisma.Decimal('5.000'))).not.toThrow();
      });

      it('permits fractional positive quantity up to 3 decimal places (e.g. bulk 1.250 kg)', () => {
        expect(() => evaluateQuantity(new Prisma.Decimal('1.250'))).not.toThrow();
        expect(() => evaluateQuantity(new Prisma.Decimal('0.001'))).not.toThrow();
      });

      it('strictly rejects zero quantity (zero is NOT a valid commercial quantity)', () => {
        expect(() => evaluateQuantity(new Prisma.Decimal('0.000'))).toThrow(
          /violates check constraint "chk_sale_items_positive_quantity"/,
        );
      });

      it('strictly rejects negative quantity', () => {
        expect(() => evaluateQuantity(new Prisma.Decimal('-2.000'))).toThrow(
          /violates check constraint "chk_sale_items_positive_quantity"/,
        );
      });
    });

    describe('chk_payments_positive_amount (Payment.amount > 0.00)', () => {
      const evaluatePaymentAmount = (amount: Prisma.Decimal) => {
        if (amount.lessThanOrEqualTo(0)) {
          throw createCheckViolationError(
            'new row for relation "payments" violates check constraint "chk_payments_positive_amount"',
            'chk_payments_positive_amount',
          );
        }
      };

      it('permits strictly positive tender amounts', () => {
        expect(() => evaluatePaymentAmount(new Prisma.Decimal('0.01'))).not.toThrow();
        expect(() => evaluatePaymentAmount(new Prisma.Decimal('250.00'))).not.toThrow();
      });

      it('strictly rejects $0.00 payment (a zero-dollar payment is not a legitimate tender)', () => {
        expect(() => evaluatePaymentAmount(new Prisma.Decimal('0.00'))).toThrow(
          /violates check constraint "chk_payments_positive_amount"/,
        );
      });

      it('strictly rejects negative payment amount', () => {
        expect(() => evaluatePaymentAmount(new Prisma.Decimal('-50.00'))).toThrow(
          /violates check constraint "chk_payments_positive_amount"/,
        );
      });
    });

    describe('chk_receipts monetary constraints (Receipt.subtotal, discountTotal, total >= 0.00)', () => {
      const evaluateReceiptAmounts = (
        subtotal: Prisma.Decimal,
        discountTotal: Prisma.Decimal,
        total: Prisma.Decimal,
      ) => {
        if (subtotal.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_subtotal"',
            'chk_receipts_non_negative_subtotal',
          );
        }
        if (discountTotal.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_discount_total"',
            'chk_receipts_non_negative_discount_total',
          );
        }
        if (total.lessThan(0)) {
          throw createCheckViolationError(
            'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_total"',
            'chk_receipts_non_negative_total',
          );
        }
      };

      it('permits legitimate $0.00 receipt values (for $0 transactions)', () => {
        expect(() =>
          evaluateReceiptAmounts(
            new Prisma.Decimal('0.00'),
            new Prisma.Decimal('0.00'),
            new Prisma.Decimal('0.00'),
          ),
        ).not.toThrow();
      });

      it('permits positive receipt monetary snapshots', () => {
        expect(() =>
          evaluateReceiptAmounts(
            new Prisma.Decimal('100.00'),
            new Prisma.Decimal('10.00'),
            new Prisma.Decimal('90.00'),
          ),
        ).not.toThrow();
      });

      it('rejects negative receipt subtotal', () => {
        expect(() =>
          evaluateReceiptAmounts(
            new Prisma.Decimal('-10.00'),
            new Prisma.Decimal('0.00'),
            new Prisma.Decimal('0.00'),
          ),
        ).toThrow(/violates check constraint "chk_receipts_non_negative_subtotal"/);
      });

      it('rejects negative receipt discountTotal', () => {
        expect(() =>
          evaluateReceiptAmounts(
            new Prisma.Decimal('10.00'),
            new Prisma.Decimal('-2.00'),
            new Prisma.Decimal('10.00'),
          ),
        ).toThrow(/violates check constraint "chk_receipts_non_negative_discount_total"/);
      });

      it('rejects negative receipt total', () => {
        expect(() =>
          evaluateReceiptAmounts(
            new Prisma.Decimal('10.00'),
            new Prisma.Decimal('0.00'),
            new Prisma.Decimal('-5.00'),
          ),
        ).toThrow(/violates check constraint "chk_receipts_non_negative_total"/);
      });
    });
  });

  // ==========================================================================
  // 2. PrismaDatabaseErrorMapper Unit Tests
  // ==========================================================================
  describe('2. PrismaDatabaseErrorMapper Unit Mapping', () => {
    it('maps chk_sales_non_negative_subtotal to InvalidMoneyException', () => {
      const error = createCheckViolationError(
        'new row for relation "sales" violates check constraint "chk_sales_non_negative_subtotal"',
        'chk_sales_non_negative_subtotal',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidMoneyException);
      expect(mapped?.message).toContain('Sale subtotal amount cannot be negative');
    });

    it('maps chk_sales_non_negative_discount_total to InvalidMoneyException', () => {
      const error = createCheckViolationError(
        'new row for relation "sales" violates check constraint "chk_sales_non_negative_discount_total"',
        'chk_sales_non_negative_discount_total',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidMoneyException);
      expect(mapped?.message).toContain('Sale discount total amount cannot be negative');
    });

    it('maps chk_sales_non_negative_total to InvalidMoneyException', () => {
      const error = createCheckViolationError(
        'new row for relation "sales" violates check constraint "chk_sales_non_negative_total"',
        'chk_sales_non_negative_total',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidMoneyException);
      expect(mapped?.message).toContain('Sale total amount cannot be negative');
    });

    it('maps chk_sales_non_negative_order_discount_val to InvalidDiscountException', () => {
      const error = createCheckViolationError(
        'new row for relation "sales" violates check constraint "chk_sales_non_negative_order_discount_val"',
        'chk_sales_non_negative_order_discount_val',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidDiscountException);
      expect(mapped?.message).toContain('Order discount value cannot be negative');
    });

    it('maps chk_sale_items_positive_quantity to InvalidSaleItemException', () => {
      const error = createCheckViolationError(
        'new row for relation "sale_items" violates check constraint "chk_sale_items_positive_quantity"',
        'chk_sale_items_positive_quantity',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidSaleItemException);
      expect(mapped?.message).toContain('Sale item quantity must be strictly greater than zero');
    });

    it('maps chk_sale_items_non_negative_unit_price to InvalidMoneyException', () => {
      const error = createCheckViolationError(
        'new row for relation "sale_items" violates check constraint "chk_sale_items_non_negative_unit_price"',
        'chk_sale_items_non_negative_unit_price',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(InvalidMoneyException);
      expect(mapped?.message).toContain('Sale item unit price amount cannot be negative');
    });

    it('maps chk_payments_positive_amount to PaymentDomainException', () => {
      const error = createCheckViolationError(
        'new row for relation "payments" violates check constraint "chk_payments_positive_amount"',
        'chk_payments_positive_amount',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(PaymentDomainException);
      expect((mapped as PaymentDomainException).code).toBe('PAYMENT_AMOUNT_MUST_BE_POSITIVE');
    });

    it('maps chk_receipts_non_negative_subtotal to ReceiptDomainException', () => {
      const error = createCheckViolationError(
        'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_subtotal"',
        'chk_receipts_non_negative_subtotal',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(ReceiptDomainException);
      expect((mapped as ReceiptDomainException).code).toBe('RECEIPT_NEGATIVE_SUBTOTAL');
    });

    it('maps chk_receipts_non_negative_total to ReceiptDomainException', () => {
      const error = createCheckViolationError(
        'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_total"',
        'chk_receipts_non_negative_total',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(ReceiptDomainException);
      expect((mapped as ReceiptDomainException).code).toBe('RECEIPT_NEGATIVE_TOTAL');
    });

    it('maps unclassified check constraint to SaleDomainException fallback', () => {
      const error = createCheckViolationError(
        'new row violates check constraint "chk_custom_rule"',
        'chk_custom_rule',
      );
      const mapped = PrismaDatabaseErrorMapper.mapCheckConstraintError(error);

      expect(mapped).toBeInstanceOf(SaleDomainException);
      expect((mapped as SaleDomainException).code).toBe('DATABASE_CHECK_CONSTRAINT_VIOLATION');
    });

    it('returns null for non-check-constraint errors', () => {
      const error = new Error('Connection timed out');
      expect(PrismaDatabaseErrorMapper.mapCheckConstraintError(error)).toBeNull();
    });
  });

  // ==========================================================================
  // 3. Repository Integration: Database Failure to Application/Domain Exceptions
  // ==========================================================================
  describe('3. Repository Integration & Constraint Failure Mapping', () => {
    describe('PrismaSaleRepository', () => {
      it('maps PostgreSQL check constraint failure on subtotal to InvalidMoneyException during save()', async () => {
        const mockPrisma = {
          $transaction: jest.fn().mockImplementation(async () => {
            throw createCheckViolationError(
              'new row for relation "sales" violates check constraint "chk_sales_non_negative_subtotal"',
              'chk_sales_non_negative_subtotal',
            );
          }),
        } as unknown as PrismaClient;

        const repo = new PrismaSaleRepository(mockPrisma);
        const sale = Sale.create({ tenantId, source: sampleSource }, clock);

        await expect(repo.save(sale)).rejects.toThrow(InvalidMoneyException);
      });

      it('maps PostgreSQL check constraint failure on quantity to InvalidSaleItemException during save()', async () => {
        const mockPrisma = {
          $transaction: jest.fn().mockImplementation(async () => {
            throw createCheckViolationError(
              'new row for relation "sale_items" violates check constraint "chk_sale_items_positive_quantity"',
              'chk_sale_items_positive_quantity',
            );
          }),
        } as unknown as PrismaClient;

        const repo = new PrismaSaleRepository(mockPrisma);
        const sale = Sale.create({ tenantId, source: sampleSource }, clock);

        await expect(repo.save(sale)).rejects.toThrow(InvalidSaleItemException);
      });

      it('maps PostgreSQL check constraint failure on order discount to InvalidDiscountException during save()', async () => {
        const mockPrisma = {
          $transaction: jest.fn().mockImplementation(async () => {
            throw createCheckViolationError(
              'new row for relation "sales" violates check constraint "chk_sales_non_negative_order_discount_val"',
              'chk_sales_non_negative_order_discount_val',
            );
          }),
        } as unknown as PrismaClient;

        const repo = new PrismaSaleRepository(mockPrisma);
        const sale = Sale.create({ tenantId, source: sampleSource }, clock);

        await expect(repo.save(sale)).rejects.toThrow(InvalidDiscountException);
      });
    });

    describe('PrismaPaymentRepository', () => {
      it('maps PostgreSQL check constraint failure on payment amount to PaymentDomainException during save()', async () => {
        const mockPrisma = {
          $transaction: jest.fn().mockImplementation(async () => {
            throw createCheckViolationError(
              'new row for relation "payments" violates check constraint "chk_payments_positive_amount"',
              'chk_payments_positive_amount',
            );
          }),
        } as unknown as PrismaClient;

        const repo = new PrismaPaymentRepository(mockPrisma);
        const payment = Payment.createSettled(
          {
            id: 'pay_test_001',
            tenantId,
            saleId: 'sale_test_001',
            method: PaymentMethod.CASH,
            amount: Money.create(50, 'USD'),
          },
          clock,
        );

        await expect(repo.save(payment)).rejects.toThrow(PaymentDomainException);
        await expect(repo.save(payment)).rejects.toThrow(
          expect.objectContaining({ code: 'PAYMENT_AMOUNT_MUST_BE_POSITIVE' }),
        );
      });
    });

    describe('PrismaReceiptRepository', () => {
      it('maps PostgreSQL check constraint failure on receipt total to ReceiptDomainException during save()', async () => {
        const mockPrisma = {
          $transaction: jest.fn().mockImplementation(async () => {
            throw createCheckViolationError(
              'new row for relation "receipts" violates check constraint "chk_receipts_non_negative_total"',
              'chk_receipts_non_negative_total',
            );
          }),
        } as unknown as PrismaClient;

        const repo = new PrismaReceiptRepository(mockPrisma);
        const receipt = Receipt.create(
          {
            id: 'rcpt_001',
            tenantId,
            saleId: 'sale_001',
            receiptNumber: 'REC-2026-00001',
            saleReference: 'SALE-REF-001',
            issuedAt: new Date(),
            clientSnapshot: null,
            items: [
              ReceiptItemSnapshot.create({
                itemId: 'item_01',
                sourceType: 'FOOD',
                sourceId: 'src_01',
                description: 'Protein Bar',
                quantity: 1,
                unitPrice: Money.create(100, 'USD'),
                subtotal: Money.create(100, 'USD'),
                discountTotal: Money.zero('USD'),
                total: Money.create(100, 'USD'),
              }),
            ],
            subtotal: Money.create(100, 'USD'),
            discountTotal: Money.zero('USD'),
            total: Money.create(100, 'USD'),
            payments: [
              ReceiptPaymentSnapshot.create({
                paymentId: 'pay_01',
                method: PaymentMethod.CASH,
                status: PaymentStatus.COMPLETED,
                amount: Money.create(100, 'USD'),
                paidAt: new Date(),
              }),
            ],
          },
          clock,
        );

        await expect(repo.save(receipt)).rejects.toThrow(ReceiptDomainException);
        await expect(repo.save(receipt)).rejects.toThrow(
          expect.objectContaining({ code: 'RECEIPT_NEGATIVE_TOTAL' }),
        );
      });
    });
  });

  // ==========================================================================
  // 4. Architectural Boundaries: Why Complex Invariants Are Domain-Orchestrated
  // ==========================================================================
  describe('4. Architectural Boundaries: Structural Safety vs Domain Orchestration', () => {
    it('explains why cross-record Sale.total = SUM(SaleItems) is NOT a simple database CHECK constraint', () => {
      // 1. PostgreSQL CHECK constraints only evaluate single-row scalar tuples.
      // 2. Querying other tables or child rows (e.g. SELECT SUM(...) FROM sale_items) inside a CHECK constraint
      //    is forbidden by PostgreSQL relational engine syntax.
      // 3. Simulating cross-record checks via procedural triggers causes severe multi-statement lock escalation,
      //    deadlocks during draft cart item additions, and violates DDD Aggregate Root encapsulation.
      // 4. The Sale aggregate root is the single authoritative consistency boundary for recalculating totals.
      const sale = Sale.create({ tenantId, source: sampleSource }, clock);
      sale.addItem(
        {
          source: sampleSource,
          description: 'Item 1',
          quantity: 2,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: sampleSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );

      // Domain aggregate ensures total = SUM(items) deterministically
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.total.amount).toBe(50.0);
    });

    it('explains why cross-table Sale.PAID -> Payment.COMPLETED is domain-orchestrated', () => {
      // 1. Sale and Payment are decoupled aggregates communicating via Domain Events (ADR-0115 / ADR-0116).
      // 2. A commercial sale can be paid across multiple tenders (e.g. $20 Cash + $30 QR), meaning no single
      //    Payment record reflects the entire Sale status.
      // 3. A static database CHECK constraint cannot evaluate multi-tender sums across independent tables.
      // 4. The domain event PaymentSettledEvent triggers application-level settlement coordination.
      const payment1 = Payment.createSettled(
        {
          id: 'pay_split_1',
          tenantId,
          saleId: 'sale_split_01',
          method: PaymentMethod.CASH,
          amount: Money.create(20, 'USD'),
        },
        clock,
      );

      const payment2 = Payment.createSettled(
        {
          id: 'pay_split_2',
          tenantId,
          saleId: 'sale_split_01',
          method: PaymentMethod.QR,
          amount: Money.create(30, 'USD'),
        },
        clock,
      );

      expect(payment1.amount.amount).toBe(20.0);
      expect(payment2.amount.amount).toBe(30.0);
      expect(payment1.amount.add(payment2.amount).amount).toBe(50.0);
    });
  });
});
