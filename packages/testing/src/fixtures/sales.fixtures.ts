import {
  Prisma,
  SaleStatus as PrismaSaleStatus,
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
  ReceiptStatus as PrismaReceiptStatus,
} from '@prisma/client';
import {
  Sale,
  SaleItem,
  SaleId,
  SaleItemId,
  Money,
  SaleSource,
  SaleSourceType,
  Payment,
  PaymentId,
  PaymentMethod,
  Receipt,
  ReceiptId,
  ReceiptNumber,
  ReceiptClientSnapshot,
  ReceiptItemSnapshot,
  ReceiptPaymentSnapshot,
  Clock,
  TestClock,
} from '@kinergy-platform/core';

export const DEFAULT_TEST_CLOCK: Clock = new TestClock(new Date('2026-10-02T12:00:00.000Z'));
export const DEFAULT_TEST_TENANT_ID = 'tenant-kinergy-test';

/**
 * Creates a valid, finalized domain Sale aggregate with matching line items and totals.
 */
export function createValidSaleFixture(overrides?: {
  id?: string;
  tenantId?: string;
  clientId?: string;
  sourceType?: SaleSourceType;
  sourceId?: string;
  itemDescription?: string;
  unitPrice?: Money;
  quantity?: number;
  clock?: Clock;
}): Sale {
  const clock = overrides?.clock ?? DEFAULT_TEST_CLOCK;
  const saleId = SaleId.create(overrides?.id ?? 'sale-fixture-001');
  const source = SaleSource.create(
    overrides?.sourceType ?? SaleSourceType.KINESIOLOGY_SESSION,
    overrides?.sourceId ?? 'sess-fixture-001',
  );

  const sale = Sale.create(
    {
      id: saleId,
      tenantId: overrides?.tenantId ?? DEFAULT_TEST_TENANT_ID,
      clientId: overrides?.clientId ?? 'cli-fixture-001',
      source,
      currency: 'USD',
    },
    clock,
  );

  const item = SaleItem.create({
    id: SaleItemId.create(`item-${saleId.value}-1`),
    source,
    description: overrides?.itemDescription ?? 'Clinical Rehabilitation Consultation',
    quantity: overrides?.quantity ?? 1,
    unitPrice: overrides?.unitPrice ?? Money.create(100.0, 'USD'),
  });

  sale.addItem(item);
  sale.finalize(clock);
  return sale;
}

/**
 * Coordinated cluster fixture:
 * Produces a Sale in PAID status, an exactly matching settled Payment, and an authoritative Receipt.
 * Guarantees zero impossible states (no PAID sale without payment; no receipt without matching snapshot).
 */
export function createPaidSaleWithPaymentAndReceiptFixture(overrides?: {
  saleId?: string;
  paymentId?: string;
  receiptId?: string;
  receiptNumber?: string;
  tenantId?: string;
  clientId?: string;
  amount?: Money;
  paymentMethod?: PaymentMethod;
  clock?: Clock;
}): {
  sale: Sale;
  payment: Payment;
  receipt: Receipt;
} {
  const clock = overrides?.clock ?? DEFAULT_TEST_CLOCK;
  const tenantId = overrides?.tenantId ?? DEFAULT_TEST_TENANT_ID;
  const amount = overrides?.amount ?? Money.create(150.0, 'USD');
  const paymentMethod = overrides?.paymentMethod ?? PaymentMethod.QR;

  // 1. Create and finalize Sale
  const sale = createValidSaleFixture({
    id: overrides?.saleId ?? 'sale-paid-fixture-01',
    tenantId,
    clientId: overrides?.clientId ?? 'cli-paid-01',
    unitPrice: amount,
    quantity: 1,
    clock,
  });

  // 2. Create settled Payment
  const payment = Payment.createCompleted(
    {
      id: PaymentId.create(overrides?.paymentId ?? 'pay-fixture-01'),
      saleId: sale.id,
      tenantId,
      amount: sale.total,
      method: paymentMethod,
      reference: 'QR-REF-FIXTURE-01',
    },
    clock,
  );

  // Transition sale to PAID using coordination
  sale.markPaid(clock);

  // 3. Create Receipt reflecting exact sale and payment snapshots
  const receipt = Receipt.create(
    {
      id: ReceiptId.create(overrides?.receiptId ?? 'rcpt-fixture-01'),
      receiptNumber: ReceiptNumber.create(overrides?.receiptNumber ?? 'REC-2026-000001'),
      saleId: sale.id,
      saleReference: sale.source.sourceCode ?? sale.id.value,
      tenantId,
      clientSnapshot: ReceiptClientSnapshot.create({
        clientId: 'cli-paid-01',
        fullName: 'Jane Test Client',
        email: 'jane.test@example.com',
      }),
      items: sale.items.map((i) =>
        ReceiptItemSnapshot.create({
          itemId: i.id.value,
          sourceType: i.source.sourceType,
          sourceId: i.source.sourceId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
          total: i.total,
        }),
      ),
      payments: [
        ReceiptPaymentSnapshot.create({
          paymentId: payment.id.value,
          method: payment.method,
          status: payment.status,
          amount: payment.amount,
          reference: payment.reference?.value ?? null,
          paidAt: payment.paidAt ?? clock.now(),
        }),
      ],
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
    },
    clock,
  );

  return { sale, payment, receipt };
}

/**
 * Creates a Sale in PENDING_PAYMENT status awaiting tender.
 */
export function createPendingSaleFixture(overrides?: {
  id?: string;
  tenantId?: string;
  clientId?: string;
  unitPrice?: Money;
  clock?: Clock;
}): Sale {
  return createValidSaleFixture(overrides);
}

/**
 * Creates a Sale in CANCELLED status with mandatory reason and timestamp.
 */
export function createCancelledSaleFixture(overrides?: {
  id?: string;
  tenantId?: string;
  reason?: string;
  clock?: Clock;
}): Sale {
  const clock = overrides?.clock ?? DEFAULT_TEST_CLOCK;
  const sale = createValidSaleFixture(overrides);
  sale.cancel(overrides?.reason ?? 'Client requested cancellation', clock);
  return sale;
}

/**
 * Creates a raw database row fixture for Sale conforming to all PostgreSQL CHECK constraints.
 */
export function createPrismaSaleRecordFixture(
  overrides?: Partial<Prisma.SaleCreateInput>,
): Prisma.SaleUncheckedCreateInput {
  const now = new Date('2026-10-02T12:00:00.000Z');
  return {
    id: overrides?.id ?? 'sale-db-fixture-01',
    tenantId: DEFAULT_TEST_TENANT_ID,
    clientId: 'cli-db-01',
    status: PrismaSaleStatus.PENDING_PAYMENT,
    currency: 'USD',
    sourceType: 'KINESIOLOGY_SESSION',
    sourceId: 'sess-db-01',
    sourceCode: 'KINESIO-60',
    subtotalAmount: new Prisma.Decimal('100.00'),
    discountTotalAmount: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('100.00'),
    orderDiscountType: null,
    orderDiscountValue: null,
    orderDiscountReason: null,
    cancellationReason: null,
    cancelledAt: null,
    completedAt: null,
    refundedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates a raw database row fixture for Payment conforming to `amount > 0.00`.
 */
export function createPrismaPaymentRecordFixture(
  saleId: string,
  overrides?: Partial<Prisma.PaymentCreateInput>,
): Prisma.PaymentUncheckedCreateInput {
  const now = new Date('2026-10-02T12:00:00.000Z');
  return {
    id: overrides?.id ?? 'pay-db-fixture-01',
    tenantId: DEFAULT_TEST_TENANT_ID,
    saleId,
    method: PrismaPaymentMethod.QR,
    amount: new Prisma.Decimal('100.00'),
    currency: 'USD',
    status: PrismaPaymentStatus.SETTLED,
    reference: 'QR-REF-DB-01',
    paidAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates a raw database row fixture for Receipt conforming to JSON snapshots and non-negative amounts.
 */
export function createPrismaReceiptRecordFixture(
  saleId: string,
  overrides?: Partial<Prisma.ReceiptCreateInput>,
): Prisma.ReceiptUncheckedCreateInput {
  const now = new Date('2026-10-02T12:00:00.000Z');
  return {
    id: overrides?.id ?? 'rcpt-db-fixture-01',
    tenantId: DEFAULT_TEST_TENANT_ID,
    saleId,
    receiptNumber: 'REC-2026-000001',
    saleReference: 'KINESIO-60',
    issuedAt: now,
    clientSnapshot: { clientId: 'cli-db-01', fullName: 'Jane Doe' },
    itemsSnapshot: [
      {
        itemId: 'item-1',
        sourceType: 'KINESIOLOGY_SESSION',
        sourceId: 'sess-db-01',
        description: 'Physiotherapy Consultation',
        quantity: 1,
        unitPrice: { amount: 100, cents: 10000, currency: 'USD' },
        subtotal: { amount: 100, cents: 10000, currency: 'USD' },
        total: { amount: 100, cents: 10000, currency: 'USD' },
      },
    ],
    paymentsSnapshot: [
      {
        paymentId: 'pay-1',
        method: 'QR',
        status: 'COMPLETED',
        amount: { amount: 100, cents: 10000, currency: 'USD' },
        paidAt: now.toISOString(),
      },
    ],
    subtotalAmount: new Prisma.Decimal('100.00'),
    discountTotalAmount: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('100.00'),
    currency: 'USD',
    status: PrismaReceiptStatus.ISSUED,
    reprintCount: 0,
    lastReprintedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
