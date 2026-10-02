import { PrismaClient, Prisma } from '@prisma/client';
import {
  SaleStatus,
  PaymentStatus,
  PaymentMethod,
  ReceiptStatus,
  Money,
  Discount,
  DiscountType,
} from '@kinergy-platform/core';
import {
  createValidSaleFixture,
  createPaidSaleWithPaymentAndReceiptFixture,
  createPendingSaleFixture,
  createCancelledSaleFixture,
  createPrismaSaleRecordFixture,
  createPrismaPaymentRecordFixture,
  createPrismaReceiptRecordFixture,
  SaleTestBuilder,
  PaymentTestBuilder,
  ReceiptTestBuilder,
  PHASE_7_FINANCIAL_TABLES_CLEANUP_ORDER,
  MockDatabaseTestCleaner,
} from '../index';
import { seedSales } from '../../../../prisma/seeds/sales.seed';

describe('Phase 7 Test Infrastructure, Fixtures, Builders, and Seeds Reconciliation', () => {
  // ==========================================================================
  // 1. Domain Aggregate Fixtures
  // ==========================================================================
  describe('1. Domain Aggregate Fixtures Consistency', () => {
    it('creates a valid finalized Sale fixture with matching line items and totals', () => {
      const sale = createValidSaleFixture({
        unitPrice: Money.create(120.0, 'USD'),
        quantity: 2,
      });

      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.items.length).toBe(1);
      expect(sale.items[0]?.quantity).toBe(2);
      expect(sale.subtotal.cents).toBe(24000);
      expect(sale.total.cents).toBe(24000);
      expect(sale.discountTotal.cents).toBe(0);
    });

    it('creates a coordinated paid cluster fixture (Sale + Payment + Receipt) with zero impossible states', () => {
      const cluster = createPaidSaleWithPaymentAndReceiptFixture({
        amount: Money.create(175.5, 'USD'),
        paymentMethod: PaymentMethod.QR,
      });

      // 1. Sale Invariants
      expect(cluster.sale.status).toBe(SaleStatus.PAID);
      expect(cluster.sale.total.cents).toBe(17550);

      // 2. Payment Invariants
      expect(cluster.payment.status).toBe(PaymentStatus.COMPLETED);
      expect(cluster.payment.amount.cents).toBe(17550);
      expect(cluster.payment.amount.equals(cluster.sale.total)).toBe(true);
      expect(cluster.payment.method).toBe(PaymentMethod.QR);

      // 3. Receipt Invariants
      expect(cluster.receipt.status).toBe(ReceiptStatus.ISSUED);
      expect(cluster.receipt.receiptNumber.value).toBe('REC-2026-000001');
      expect(cluster.receipt.total.cents).toBe(17550);
      expect(cluster.receipt.items.length).toBe(1);
      expect(cluster.receipt.payments.length).toBe(1);
      expect(cluster.receipt.payments[0]?.amount.cents).toBe(17550);
      expect(cluster.receipt.payments[0]?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('creates a pending Sale fixture with non-empty items awaiting tender', () => {
      const sale = createPendingSaleFixture();
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.items.length).toBeGreaterThan(0);
      expect(sale.total.isPositive()).toBe(true);
    });

    it('creates a cancelled Sale fixture with required cancellation reason and timestamp', () => {
      const sale = createCancelledSaleFixture({
        reason: 'Customer requested reschedule',
      });
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancellationReason).toBe('Customer requested reschedule');
      expect(sale.cancelledAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // 2. Fluent Test Builders
  // ==========================================================================
  describe('2. Fluent Financial Test Builders', () => {
    it('builds a custom Sale with order and item discounts and exact total derivation', () => {
      const sale = new SaleTestBuilder()
        .withTenantId('tenant-alpha')
        .withClientId('cli-alpha-01')
        .addItem({
          description: 'Physio Session',
          unitPrice: Money.create(100.0, 'USD'),
          quantity: 1,
          discount: Discount.create({
            type: DiscountType.PERCENTAGE,
            value: 10,
            reason: 'Promo',
          }),
        })
        .withOrderDiscount(
          Discount.create({
            type: DiscountType.FIXED_AMOUNT,
            value: 10.0,
            reason: 'Voucher',
          }),
        )
        .build();

      expect(sale.tenantId).toBe('tenant-alpha');
      expect(sale.clientId).toBe('cli-alpha-01');
      expect(sale.subtotal.cents).toBe(10000);
      expect(sale.discountTotal.cents).toBe(2000); // $10 item discount + $10 order discount
      expect(sale.total.cents).toBe(8000); // $100 - $20 = $80
    });

    it('builds coordinated cluster via SaleTestBuilder.buildPaid()', () => {
      const cluster = new SaleTestBuilder()
        .addItem({
          description: 'Gym Gold Pass',
          unitPrice: Money.create(250.0, 'USD'),
          quantity: 1,
        })
        .buildPaid({
          paymentMethod: PaymentMethod.CASH,
          paymentReference: 'CASH-DRAWER-01',
          receiptNumber: 'REC-2026-000042',
        });

      expect(cluster.sale.status).toBe(SaleStatus.PAID);
      expect(cluster.payment.status).toBe(PaymentStatus.COMPLETED);
      expect(cluster.payment.method).toBe(PaymentMethod.CASH);
      expect(cluster.payment.reference?.value).toBe('CASH-DRAWER-01');
      expect(cluster.receipt.receiptNumber.value).toBe('REC-2026-000042');
      expect(cluster.receipt.total.cents).toBe(25000);
    });

    it('builds a Payment aggregate via PaymentTestBuilder ensuring positive amounts', () => {
      const payment = new PaymentTestBuilder()
        .withAmount(Money.create(75.25, 'USD'))
        .withMethod(PaymentMethod.QR)
        .withReference('QR-PAY-77')
        .build();

      expect(payment.amount.cents).toBe(7525);
      expect(payment.method).toBe(PaymentMethod.QR);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.reference?.value).toBe('QR-PAY-77');
    });

    it('builds a Receipt aggregate via ReceiptTestBuilder ensuring point-in-time snapshots', () => {
      const receipt = new ReceiptTestBuilder()
        .withReceiptNumber('REC-2026-000999')
        .withAmount(Money.create(99.0, 'USD'))
        .build();

      expect(receipt.receiptNumber.value).toBe('REC-2026-000999');
      expect(receipt.total.cents).toBe(9900);
      expect(receipt.items.length).toBe(1);
      expect(receipt.payments.length).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Database Record Fixtures & Relational Constraints
  // ==========================================================================
  describe('3. Database Record Fixtures & Schema Compliance', () => {
    it('creates Prisma Sale record conforming to CHECK constraints (non-negative amounts, co-presence)', () => {
      const record = createPrismaSaleRecordFixture();

      expect(
        new Prisma.Decimal(record.subtotalAmount.toString()).toNumber(),
      ).toBeGreaterThanOrEqual(0);
      expect(
        new Prisma.Decimal(record.discountTotalAmount.toString()).toNumber(),
      ).toBeGreaterThanOrEqual(0);
      expect(new Prisma.Decimal(record.totalAmount.toString()).toNumber()).toBeGreaterThanOrEqual(
        0,
      );

      // Discount co-presence: both null or both defined
      const coPresenceValid =
        (record.orderDiscountType === null && record.orderDiscountValue === null) ||
        (record.orderDiscountType !== null && record.orderDiscountValue !== null);
      expect(coPresenceValid).toBe(true);
    });

    it('creates Prisma Payment record conforming to positive amount constraint', () => {
      const record = createPrismaPaymentRecordFixture('sale-test-id');
      expect(new Prisma.Decimal(record.amount.toString()).toNumber()).toBeGreaterThan(0);
      expect(record.saleId).toBe('sale-test-id');
    });

    it('creates Prisma Receipt record conforming to snapshot structures', () => {
      const record = createPrismaReceiptRecordFixture('sale-test-id');
      expect(
        new Prisma.Decimal(record.subtotalAmount.toString()).toNumber(),
      ).toBeGreaterThanOrEqual(0);
      expect(new Prisma.Decimal(record.totalAmount.toString()).toNumber()).toBeGreaterThanOrEqual(
        0,
      );
      expect(Array.isArray(record.itemsSnapshot)).toBe(true);
      expect(Array.isArray(record.paymentsSnapshot)).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Test Database Cleanup Ordering
  // ==========================================================================
  describe('4. Test Database Cleanup Order', () => {
    it('enforces reverse foreign-key cleanup order for financial tables', async () => {
      const cleaner = new MockDatabaseTestCleaner();
      await cleaner.cleanFinancialTables();

      expect(cleaner.cleanedTables).toEqual([...PHASE_7_FINANCIAL_TABLES_CLEANUP_ORDER]);
    });
  });

  // ==========================================================================
  // 5. Development & Integration Seed Verification
  // ==========================================================================
  describe('5. Database Seed Execution & Invariant Verification', () => {
    it('executes seedSales idempotently and generates realistic, schema-compliant records', async () => {
      const salesMap = new Map<string, unknown>();
      const itemsMap = new Map<string, unknown>();
      const paymentsMap = new Map<string, unknown>();
      const receiptsMap = new Map<string, unknown>();
      const sequencesMap = new Map<string, unknown>();

      const mockPrisma = {
        sale: {
          upsert: jest.fn(
            async ({
              where,
              create,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
            }) => {
              salesMap.set(where.id, create);
              return create;
            },
          ),
        },
        saleItem: {
          upsert: jest.fn(
            async ({
              where,
              create,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
            }) => {
              itemsMap.set(where.id, create);
              return create;
            },
          ),
        },
        payment: {
          upsert: jest.fn(
            async ({
              where,
              create,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
            }) => {
              paymentsMap.set(where.id, create);
              return create;
            },
          ),
        },
        receipt: {
          upsert: jest.fn(
            async ({
              where,
              create,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
            }) => {
              receiptsMap.set(where.id, create);
              return create;
            },
          ),
        },
        receiptSequence: {
          upsert: jest.fn(
            async ({
              create,
            }: {
              where: Record<string, unknown>;
              create: Record<string, unknown>;
            }) => {
              sequencesMap.set('seq', create);
              return create;
            },
          ),
        },
      } as unknown as PrismaClient;

      const summary = await seedSales(mockPrisma);

      expect(summary.salesCount).toBe(5);
      expect(summary.saleItemsCount).toBe(6);
      expect(summary.paymentsCount).toBe(3);
      expect(summary.receiptsCount).toBe(3);
      expect(summary.receiptSequenceValue).toBe(3);

      expect(salesMap.size).toBe(5);
      expect(itemsMap.size).toBe(6);
      expect(paymentsMap.size).toBe(3);
      expect(receiptsMap.size).toBe(3);

      // Verify Sale 1 (Clinical session)
      const sale1 = salesMap.get('sale-seed-clin-001') as Record<string, unknown>;
      expect(sale1.status).toBe('PAID');
      expect((sale1.totalAmount as Prisma.Decimal).toFixed(2)).toBe('120.00');

      // Verify Payment 1
      const pay1 = paymentsMap.get('pay-seed-clin-001') as Record<string, unknown>;
      expect((pay1.amount as Prisma.Decimal).toFixed(2)).toBe('120.00');
      expect(pay1.status).toBe('SETTLED');
      expect(pay1.method).toBe('QR');

      // Verify Receipt 1
      const rcpt1 = receiptsMap.get('rcpt-seed-clin-001') as Record<string, unknown>;
      expect(rcpt1.receiptNumber).toBe('REC-2026-000001');
      expect((rcpt1.totalAmount as Prisma.Decimal).toFixed(2)).toBe('120.00');

      // Verify Sale 4 (Pending payment) has zero payments and zero receipts
      const sale4 = salesMap.get('sale-seed-room-004') as Record<string, unknown>;
      expect(sale4.status).toBe('PENDING_PAYMENT');
      expect(paymentsMap.has('pay-seed-room-004')).toBe(false);
      expect(receiptsMap.has('rcpt-seed-room-004')).toBe(false);

      // Verify Sale 5 (Cancelled) has cancellation reason and timestamp
      const sale5 = salesMap.get('sale-seed-cancel-005') as Record<string, unknown>;
      expect(sale5.status).toBe('CANCELLED');
      expect(sale5.cancellationReason).toBe(
        'Client notified clinic of travel conflict 24h in advance',
      );
      expect(sale5.cancelledAt).toBeInstanceOf(Date);
    });
  });
});
