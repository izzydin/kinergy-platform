import {
  PrismaClient,
  Prisma,
  SaleStatus,
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
} from '@prisma/client';

export interface SalesSeedSummary {
  salesCount: number;
  saleItemsCount: number;
  paymentsCount: number;
  receiptsCount: number;
  receiptSequenceValue: number;
}

/**
 * Seeds realistic Phase 7 Sales, Payments, and Receipts data.
 * Adheres strictly to:
 * - Domain aggregate invariants (no PAID sale without settled payment; no receipt without payment).
 * - Exact PostgreSQL Decimal precision (12, 2) without floating-point math.
 * - Idempotency via upsert.
 * - Relational CHECK constraints.
 */
export async function seedSales(prisma: PrismaClient): Promise<SalesSeedSummary> {
  console.log('  🛒 Seeding Phase 7 Sales & Financial Records...');

  const tenantId = 'tenant-kinergy-main';
  const now = new Date('2026-10-02T12:00:00.000Z');
  const year = 2026;

  // --------------------------------------------------------------------------
  // 1. Sale 1: Clinical Kinesiology Session (Paid via QR with Receipt)
  // --------------------------------------------------------------------------
  const sale1Id = 'sale-seed-clin-001';
  await prisma.sale.upsert({
    where: { id: sale1Id },
    update: {},
    create: {
      id: sale1Id,
      tenantId,
      clientId: 'cli-seed-jane-01',
      status: SaleStatus.PAID,
      currency: 'USD',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'sess-seed-rehab-001',
      sourceCode: 'KINESIO-ASSESS-60',
      subtotalAmount: new Prisma.Decimal('120.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('120.00'),
      version: 2,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
  });

  const item1Id = 'item-seed-clin-001';
  await prisma.saleItem.upsert({
    where: { id: item1Id },
    update: {},
    create: {
      id: item1Id,
      saleId: sale1Id,
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'sess-seed-rehab-001',
      sourceCode: 'KINESIO-ASSESS-60',
      description: 'Initial Clinical Kinesiology Assessment (60 min)',
      skuOrCode: 'SRV-KINESIO-01',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('120.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('120.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('120.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  const payment1Id = 'pay-seed-clin-001';
  await prisma.payment.upsert({
    where: { id: payment1Id },
    update: {},
    create: {
      id: payment1Id,
      tenantId,
      saleId: sale1Id,
      method: PaymentMethod.QR,
      amount: new Prisma.Decimal('120.00'),
      currency: 'USD',
      status: PaymentStatus.SETTLED,
      reference: 'QR-SEED-2026-001',
      paidAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  const receipt1Id = 'rcpt-seed-clin-001';
  await prisma.receipt.upsert({
    where: { id: receipt1Id },
    update: {},
    create: {
      id: receipt1Id,
      tenantId,
      saleId: sale1Id,
      receiptNumber: 'REC-2026-000001',
      saleReference: 'KINESIO-ASSESS-60',
      issuedAt: now,
      clientSnapshot: {
        clientId: 'cli-seed-jane-01',
        referenceNumber: 'CLI-001',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+1-555-0199',
      },
      itemsSnapshot: [
        {
          itemId: item1Id,
          sourceType: 'KINESIOLOGY_SESSION',
          sourceId: 'sess-seed-rehab-001',
          description: 'Initial Clinical Kinesiology Assessment (60 min)',
          skuOrCode: 'SRV-KINESIO-01',
          quantity: 1,
          unitPrice: { amount: 120, cents: 12000, currency: 'USD' },
          discountTotal: { amount: 0, cents: 0, currency: 'USD' },
          subtotal: { amount: 120, cents: 12000, currency: 'USD' },
          total: { amount: 120, cents: 12000, currency: 'USD' },
        },
      ],
      paymentsSnapshot: [
        {
          paymentId: payment1Id,
          method: 'QR',
          status: 'COMPLETED',
          amount: { amount: 120, cents: 12000, currency: 'USD' },
          reference: 'QR-SEED-2026-001',
          paidAt: now.toISOString(),
        },
      ],
      subtotalAmount: new Prisma.Decimal('120.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('120.00'),
      currency: 'USD',
      status: ReceiptStatus.ISSUED,
      reprintCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  // --------------------------------------------------------------------------
  // 2. Sale 2: Gym Membership Plan with 10% Discount (Paid via Cash)
  // --------------------------------------------------------------------------
  const sale2Id = 'sale-seed-gym-002';
  await prisma.sale.upsert({
    where: { id: sale2Id },
    update: {},
    create: {
      id: sale2Id,
      tenantId,
      clientId: 'cli-seed-john-02',
      status: SaleStatus.PAID,
      currency: 'USD',
      sourceType: 'GYM_MEMBERSHIP',
      sourceId: 'plan-seed-gold-annual',
      sourceCode: 'MEM-GOLD-2026',
      subtotalAmount: new Prisma.Decimal('600.00'),
      discountTotalAmount: new Prisma.Decimal('60.00'),
      totalAmount: new Prisma.Decimal('540.00'),
      orderDiscountType: 'PERCENTAGE',
      orderDiscountValue: new Prisma.Decimal('10.00'),
      orderDiscountReason: 'Annual Pre-payment 10% Off',
      version: 2,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
  });

  const item2Id = 'item-seed-gym-002';
  await prisma.saleItem.upsert({
    where: { id: item2Id },
    update: {},
    create: {
      id: item2Id,
      saleId: sale2Id,
      sourceType: 'GYM_MEMBERSHIP',
      sourceId: 'plan-seed-gold-annual',
      sourceCode: 'MEM-GOLD-2026',
      description: 'Gold Annual Gym Membership Subscription',
      skuOrCode: 'PLAN-GOLD-YR',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('600.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('600.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('600.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  const payment2Id = 'pay-seed-gym-002';
  await prisma.payment.upsert({
    where: { id: payment2Id },
    update: {},
    create: {
      id: payment2Id,
      tenantId,
      saleId: sale2Id,
      method: PaymentMethod.CASH,
      amount: new Prisma.Decimal('540.00'),
      currency: 'USD',
      status: PaymentStatus.SETTLED,
      reference: 'CASH-REG-01-TNDR',
      paidAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  const receipt2Id = 'rcpt-seed-gym-002';
  await prisma.receipt.upsert({
    where: { id: receipt2Id },
    update: {},
    create: {
      id: receipt2Id,
      tenantId,
      saleId: sale2Id,
      receiptNumber: 'REC-2026-000002',
      saleReference: 'MEM-GOLD-2026',
      issuedAt: now,
      clientSnapshot: {
        clientId: 'cli-seed-john-02',
        referenceNumber: 'CLI-002',
        fullName: 'John Smith',
        email: 'john.smith@example.com',
        phone: '+1-555-0144',
      },
      itemsSnapshot: [
        {
          itemId: item2Id,
          sourceType: 'GYM_MEMBERSHIP',
          sourceId: 'plan-seed-gold-annual',
          description: 'Gold Annual Gym Membership Subscription',
          skuOrCode: 'PLAN-GOLD-YR',
          quantity: 1,
          unitPrice: { amount: 600, cents: 60000, currency: 'USD' },
          subtotal: { amount: 600, cents: 60000, currency: 'USD' },
          total: { amount: 600, cents: 60000, currency: 'USD' },
        },
      ],
      paymentsSnapshot: [
        {
          paymentId: payment2Id,
          method: 'CASH',
          status: 'COMPLETED',
          amount: { amount: 540, cents: 54000, currency: 'USD' },
          reference: 'CASH-REG-01-TNDR',
          paidAt: now.toISOString(),
        },
      ],
      subtotalAmount: new Prisma.Decimal('600.00'),
      discountTotalAmount: new Prisma.Decimal('60.00'),
      totalAmount: new Prisma.Decimal('540.00'),
      currency: 'USD',
      status: ReceiptStatus.ISSUED,
      reprintCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  // --------------------------------------------------------------------------
  // 3. Sale 3: Retail Consumables (Walk-in Cash Customer, Anonymous Receipt)
  // --------------------------------------------------------------------------
  const sale3Id = 'sale-seed-retail-003';
  await prisma.sale.upsert({
    where: { id: sale3Id },
    update: {},
    create: {
      id: sale3Id,
      tenantId,
      clientId: null,
      status: SaleStatus.PAID,
      currency: 'USD',
      sourceType: 'FOOD',
      sourceId: 'inv-seed-bar-protein',
      sourceCode: 'RETAIL-WALKIN-03',
      subtotalAmount: new Prisma.Decimal('14.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('14.00'),
      version: 2,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
  });

  const item3aId = 'item-seed-food-003a';
  await prisma.saleItem.upsert({
    where: { id: item3aId },
    update: {},
    create: {
      id: item3aId,
      saleId: sale3Id,
      sourceType: 'FOOD',
      sourceId: 'inv-seed-bar-protein',
      description: 'Organic Whey Protein Bar 60g',
      skuOrCode: 'BAR-PROT-60',
      quantity: new Prisma.Decimal('2.000'),
      unitPriceAmount: new Prisma.Decimal('5.50'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('11.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('11.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  const item3bId = 'item-seed-drink-003b';
  await prisma.saleItem.upsert({
    where: { id: item3bId },
    update: {},
    create: {
      id: item3bId,
      saleId: sale3Id,
      sourceType: 'DRINK',
      sourceId: 'inv-seed-drink-electrolyte',
      description: 'Electrolyte Hydration Drink 750ml',
      skuOrCode: 'DRK-ELECT-750',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('3.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('3.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('3.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  const payment3Id = 'pay-seed-retail-003';
  await prisma.payment.upsert({
    where: { id: payment3Id },
    update: {},
    create: {
      id: payment3Id,
      tenantId,
      saleId: sale3Id,
      method: PaymentMethod.CASH,
      amount: new Prisma.Decimal('14.00'),
      currency: 'USD',
      status: PaymentStatus.SETTLED,
      reference: 'CASH-DRAWER-WALKIN',
      paidAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  const receipt3Id = 'rcpt-seed-retail-003';
  await prisma.receipt.upsert({
    where: { id: receipt3Id },
    update: {},
    create: {
      id: receipt3Id,
      tenantId,
      saleId: sale3Id,
      receiptNumber: 'REC-2026-000003',
      saleReference: 'RETAIL-WALKIN-03',
      issuedAt: now,
      clientSnapshot: Prisma.DbNull,
      itemsSnapshot: [
        {
          itemId: item3aId,
          sourceType: 'FOOD',
          sourceId: 'inv-seed-bar-protein',
          description: 'Organic Whey Protein Bar 60g',
          skuOrCode: 'BAR-PROT-60',
          quantity: 2,
          unitPrice: { amount: 5.5, cents: 550, currency: 'USD' },
          subtotal: { amount: 11, cents: 1100, currency: 'USD' },
          total: { amount: 11, cents: 1100, currency: 'USD' },
        },
        {
          itemId: item3bId,
          sourceType: 'DRINK',
          sourceId: 'inv-seed-drink-electrolyte',
          description: 'Electrolyte Hydration Drink 750ml',
          skuOrCode: 'DRK-ELECT-750',
          quantity: 1,
          unitPrice: { amount: 3, cents: 300, currency: 'USD' },
          subtotal: { amount: 3, cents: 300, currency: 'USD' },
          total: { amount: 3, cents: 300, currency: 'USD' },
        },
      ],
      paymentsSnapshot: [
        {
          paymentId: payment3Id,
          method: 'CASH',
          status: 'COMPLETED',
          amount: { amount: 14, cents: 1400, currency: 'USD' },
          reference: 'CASH-DRAWER-WALKIN',
          paidAt: now.toISOString(),
        },
      ],
      subtotalAmount: new Prisma.Decimal('14.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('14.00'),
      currency: 'USD',
      status: ReceiptStatus.ISSUED,
      reprintCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  // --------------------------------------------------------------------------
  // 4. Sale 4: Active Open Checkout Agreement (PENDING_PAYMENT, Zero Payments/Receipts)
  // --------------------------------------------------------------------------
  const sale4Id = 'sale-seed-room-004';
  await prisma.sale.upsert({
    where: { id: sale4Id },
    update: {},
    create: {
      id: sale4Id,
      tenantId,
      clientId: 'cli-seed-jane-01',
      status: SaleStatus.PENDING_PAYMENT,
      currency: 'USD',
      sourceType: 'ROOM_RENTAL',
      sourceId: 'studio-b-facility',
      sourceCode: 'RENTAL-STUDIO-B-04',
      subtotalAmount: new Prisma.Decimal('90.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('90.00'),
      version: 2,
      createdAt: now,
      updatedAt: now,
    },
  });

  const item4Id = 'item-seed-room-004';
  await prisma.saleItem.upsert({
    where: { id: item4Id },
    update: {},
    create: {
      id: item4Id,
      saleId: sale4Id,
      sourceType: 'ROOM_RENTAL',
      sourceId: 'studio-b-facility',
      description: 'Studio B Hourly Facility Rental (2 Hours)',
      skuOrCode: 'FAC-ROOM-B',
      quantity: new Prisma.Decimal('2.000'),
      unitPriceAmount: new Prisma.Decimal('45.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('90.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('90.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  // --------------------------------------------------------------------------
  // 5. Sale 5: Cancelled Agreement (CANCELLED, with reason and timestamp)
  // --------------------------------------------------------------------------
  const sale5Id = 'sale-seed-cancel-005';
  await prisma.sale.upsert({
    where: { id: sale5Id },
    update: {},
    create: {
      id: sale5Id,
      tenantId,
      clientId: 'cli-seed-john-02',
      status: SaleStatus.CANCELLED,
      currency: 'USD',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'sess-seed-cancelled-55',
      sourceCode: 'KINESIO-CANCEL-55',
      subtotalAmount: new Prisma.Decimal('65.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('65.00'),
      cancellationReason: 'Client notified clinic of travel conflict 24h in advance',
      cancelledAt: now,
      version: 3,
      createdAt: now,
      updatedAt: now,
    },
  });

  const item5Id = 'item-seed-cancel-005';
  await prisma.saleItem.upsert({
    where: { id: item5Id },
    update: {},
    create: {
      id: item5Id,
      saleId: sale5Id,
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'sess-seed-cancelled-55',
      description: 'Follow-up Clinical Kinesiology Session (30 min)',
      skuOrCode: 'SRV-KINESIO-30',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('65.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('65.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('65.00'),
      createdAt: now,
      updatedAt: now,
    },
  });

  // --------------------------------------------------------------------------
  // 6. Monotonic Receipt Sequence Counter for 2026
  // --------------------------------------------------------------------------
  await prisma.receiptSequence.upsert({
    where: {
      tenantId_year: {
        tenantId,
        year,
      },
    },
    update: {
      currentValue: 3, // Matches highest seeded receipt number (REC-2026-000003)
      updatedAt: now,
    },
    create: {
      tenantId,
      year,
      currentValue: 3,
      updatedAt: now,
    },
  });

  console.log('    ✓ 5 Sales seeded (Clinical, Membership, Retail, Pending, Cancelled)');
  console.log('    ✓ 6 SaleItems seeded with exact line totals and decimal quantities');
  console.log('    ✓ 3 Settled Payments seeded matching paid sales');
  console.log('    ✓ 3 Receipts seeded with complete point-in-time snapshots');
  console.log('    ✓ ReceiptSequence counter synchronized at currentValue = 3');

  return {
    salesCount: 5,
    saleItemsCount: 6,
    paymentsCount: 3,
    receiptsCount: 3,
    receiptSequenceValue: 3,
  };
}
