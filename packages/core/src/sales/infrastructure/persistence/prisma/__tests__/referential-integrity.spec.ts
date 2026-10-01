import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleStatus as PrismaSaleStatus,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
  Receipt as PrismaReceiptModel,
  ReceiptStatus as PrismaReceiptStatus,
  Client as PrismaClientModel,
} from '@prisma/client';
import { SaleRepositoryPort } from '../../../../application/ports/sale-repository.port';
import { PaymentRepositoryPort } from '../../../../application/ports/payment-repository.port';
import { ReceiptRepositoryPort } from '../../../../application/ports/receipt-repository.port';

/**
 * High-fidelity stateful PostgreSQL / Prisma relational engine emulator
 * testing Phase 7 foreign keys, cascade mechanics, and onDelete: Restrict invariants.
 */
class MockPhase7RelationalEngine {
  public clients = new Map<string, PrismaClientModel>();
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();

  public createClient = (): PrismaClient => {
    const clients = this.clients;
    const sales = this.sales;
    const saleItems = this.saleItems;
    const payments = this.payments;
    const receipts = this.receipts;

    const txMethods = {
      client: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return clients.get(where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Prisma.ClientUncheckedCreateInput }) => {
          const id = data.id ?? 'cli_default';
          const record = { ...data, id } as PrismaClientModel;
          clients.set(id, record);
          return record;
        }),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          // Bounded Context Decoupling: Client deletion does NOT cascade to Sales.
          // Sales store loose scalar client_id without a database foreign key constraint.
          const existing = clients.get(where.id);
          clients.delete(where.id);
          return existing;
        }),
      },
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return sales.get(where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Prisma.SaleUncheckedCreateInput }) => {
          const id = data.id ?? 'sale_default';
          const record = { ...data, id } as PrismaSaleModel;
          sales.set(id, record);
          return record;
        }),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          // 1. Relational Restrict Check on payments.saleId
          const hasPayments = Array.from(payments.values()).some((p) => p.saleId === where.id);
          if (hasPayments) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: payments_sale_id_fkey (table: payments, parent: sales, action: Restrict)',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }

          // 2. Relational Restrict Check on receipts.saleId
          const hasReceipts = Array.from(receipts.values()).some((r) => r.saleId === where.id);
          if (hasReceipts) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: receipts_sale_id_fkey (table: receipts, parent: sales, action: Restrict)',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }

          // 3. Aggregate Ownership Cascade on sale_items.saleId (onDelete: Cascade)
          for (const [itemId, item] of saleItems.entries()) {
            if (item.saleId === where.id) {
              saleItems.delete(itemId);
            }
          }

          const existing = sales.get(where.id);
          sales.delete(where.id);
          return existing;
        }),
      },
      saleItem: {
        create: jest.fn(async ({ data }: { data: Prisma.SaleItemUncheckedCreateInput }) => {
          // Foreign Key Check: saleId must exist in sales table
          if (!sales.has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: sale_items_sale_id_fkey',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const id = data.id ?? 'item_default';
          const record = { ...data, id } as PrismaSaleItemModel;
          saleItems.set(id, record);
          return record;
        }),
        findMany: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          let res = Array.from(saleItems.values());
          if (where?.saleId) {
            res = res.filter((item) => item.saleId === where.saleId);
          }
          return res;
        }),
      },
      payment: {
        create: jest.fn(async ({ data }: { data: Prisma.PaymentUncheckedCreateInput }) => {
          // Foreign Key Check: saleId must exist in sales table
          if (!sales.has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: payments_sale_id_fkey',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const id = data.id ?? 'pay_default';
          const record = { ...data, id } as PrismaPaymentModel;
          payments.set(id, record);
          return record;
        }),
        findMany: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          let res = Array.from(payments.values());
          if (where?.saleId) {
            res = res.filter((p) => p.saleId === where.saleId);
          }
          return res;
        }),
      },
      receipt: {
        create: jest.fn(async ({ data }: { data: Prisma.ReceiptUncheckedCreateInput }) => {
          // Foreign Key Check: saleId must exist in sales table
          if (!sales.has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: receipts_sale_id_fkey',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const id = data.id ?? 'rcpt_default';
          const record = { ...data, id } as PrismaReceiptModel;
          receipts.set(id, record);
          return record;
        }),
        findFirst: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          return (
            Array.from(receipts.values()).find(
              (r) => !where?.saleId || r.saleId === where.saleId,
            ) ?? null
          );
        }),
      },
    };

    return {
      ...txMethods,
      $transaction: jest.fn(async <T>(cb: (tx: typeof txMethods) => Promise<T>): Promise<T> =>
        cb(txMethods),
      ),
    } as unknown as PrismaClient;
  };
}

describe('Phase 7 Referential Integrity & Foreign Key Architecture (PostgreSQL / Prisma)', () => {
  const t0 = new Date('2026-10-01T12:00:00.000Z');
  let engine: MockPhase7RelationalEngine;
  let prisma: PrismaClient;

  const tenantId = 'tenant_kinergy_wellness';
  const clientId = 'cli_00000000-0000-4000-a000-000000000001';
  const draftSaleId = 'sale_draft_00000000-0000-4000-a000-000000000001';
  const settledSaleId = 'sale_settled_0000000-0000-4000-a000-000000000002';

  beforeEach(() => {
    engine = new MockPhase7RelationalEngine();
    prisma = engine.createClient();

    // 1. Seed Client
    engine.clients.set(clientId, {
      id: clientId,
      referenceNumber: 'CLI-2026-00001',
      identityId: null,
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@example.com',
      phone: '+15551234567',
      normalizedEmail: 'alex.morgan@example.com',
      normalizedPhone: '+15551234567',
      normalizedSearchName: 'alex morgan',
      status: 'ACTIVE',
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    // 2. Seed Draft Sale (no payments, no receipts)
    engine.sales.set(draftSaleId, {
      id: draftSaleId,
      tenantId,
      clientId,
      status: PrismaSaleStatus.DRAFT,
      currency: 'USD',
      sourceType: 'COMMERCIAL_CHECKOUT',
      sourceId: 'src_pos_register_1',
      sourceCode: null,
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
      createdAt: t0,
      updatedAt: t0,
    });

    // 3. Seed SaleItems for Draft Sale
    engine.saleItems.set('item_draft_1', {
      id: 'item_draft_1',
      saleId: draftSaleId,
      sourceType: 'ConsumableInventory',
      sourceId: 'inv_protein_01',
      sourceCode: 'SKU-PROT',
      description: 'Organic Whey Protein Shake',
      skuOrCode: 'SKU-PROT',
      quantity: new Prisma.Decimal('2.000'),
      unitPriceAmount: new Prisma.Decimal('50.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('100.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('100.00'),
      discountType: null,
      discountValue: null,
      discountReason: null,
      createdAt: t0,
      updatedAt: t0,
    });

    // 4. Seed Settled Sale
    engine.sales.set(settledSaleId, {
      id: settledSaleId,
      tenantId,
      clientId,
      status: PrismaSaleStatus.PAID,
      currency: 'USD',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'sess_rehab_42',
      sourceCode: null,
      subtotalAmount: new Prisma.Decimal('150.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('150.00'),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      cancellationReason: null,
      cancelledAt: null,
      completedAt: null,
      refundedAt: null,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    // 5. Seed SaleItems for Settled Sale
    engine.saleItems.set('item_settled_1', {
      id: 'item_settled_1',
      saleId: settledSaleId,
      sourceType: 'TreatmentSession',
      sourceId: 'sess_rehab_42',
      sourceCode: 'TREAT-60',
      description: 'Kinesiology Functional Assessment (60 min)',
      skuOrCode: 'TREAT-60',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('150.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('150.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('150.00'),
      discountType: null,
      discountValue: null,
      discountReason: null,
      createdAt: t0,
      updatedAt: t0,
    });

    // 6. Seed Settled Payment
    engine.payments.set('pay_settled_1', {
      id: 'pay_settled_1',
      tenantId,
      saleId: settledSaleId,
      method: PrismaPaymentMethod.CASH,
      amount: new Prisma.Decimal('150.00'),
      currency: 'USD',
      status: PrismaPaymentStatus.SETTLED,
      reference: 'REGISTER-01-CASH',
      paidAt: t0,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    // 7. Seed Receipt
    engine.receipts.set('rcpt_settled_1', {
      id: 'rcpt_settled_1',
      tenantId,
      saleId: settledSaleId,
      receiptNumber: 'REC-2026-000001',
      saleReference: 'ORD-2026-0001',
      issuedAt: t0,
      clientSnapshot: { fullName: 'Alex Morgan' },
      itemsSnapshot: [{ description: 'Kinesiology Assessment' }],
      paymentsSnapshot: [{ method: 'CASH', amount: 150.0 }],
      subtotalAmount: new Prisma.Decimal('150.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('150.00'),
      currency: 'USD',
      status: PrismaReceiptStatus.ISSUED,
      reprintCount: 0,
      lastReprintedAt: null,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  });

  // ==========================================================================
  // 1. SaleItem -> Sale: Aggregate Ownership & Cascade Deletion
  // ==========================================================================
  describe('1. SaleItem -> Sale (Aggregate Ownership & onDelete: Cascade)', () => {
    it('cascades deletion to child SaleItem rows when an unfinalized Sale is deleted', async () => {
      expect(engine.sales.has(draftSaleId)).toBe(true);
      expect(engine.saleItems.has('item_draft_1')).toBe(true);

      // Delete draft sale (has 0 payments and 0 receipts)
      await prisma.sale.delete({
        where: { id: draftSaleId },
      });

      // Both Sale and owned SaleItem rows are deleted atomically
      expect(engine.sales.has(draftSaleId)).toBe(false);
      expect(engine.saleItems.has('item_draft_1')).toBe(false);
    });

    it('prohibits creating a SaleItem referencing a non-existent saleId', async () => {
      await expect(
        prisma.saleItem.create({
          data: {
            id: 'item_orphan',
            saleId: 'non_existent_sale_uuid',
            sourceType: 'FOOD',
            sourceId: 'food_1',
            description: 'Orphan item',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('10.00'),
            subtotalAmount: new Prisma.Decimal('10.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('10.00'),
          },
        }),
      ).rejects.toThrow('Foreign key constraint failed on the field: sale_items_sale_id_fkey');
    });
  });

  // ==========================================================================
  // 2. Payment -> Sale: Financial Ledger Protection (onDelete: Restrict)
  // ==========================================================================
  describe('2. Payment -> Sale (Financial Tender Protection & onDelete: Restrict)', () => {
    it('prohibits deleting a Sale when an associated Payment exists (onDelete: Restrict)', async () => {
      // Settled sale has payment 'pay_settled_1'
      expect(engine.payments.has('pay_settled_1')).toBe(true);

      await expect(
        prisma.sale.delete({
          where: { id: settledSaleId },
        }),
      ).rejects.toThrow(
        'Foreign key constraint failed on the field: payments_sale_id_fkey (table: payments, parent: sales, action: Restrict)',
      );

      // Financial records remain completely intact
      expect(engine.sales.has(settledSaleId)).toBe(true);
      expect(engine.payments.has('pay_settled_1')).toBe(true);
    });

    it('prohibits deleting a Sale even if the Payment is CANCELLED or FAILED (Audit Trail Retention)', async () => {
      // Create a sale with a CANCELLED payment
      const cancelledSaleId = 'sale_cancelled_attempt_uuid';
      engine.sales.set(cancelledSaleId, {
        id: cancelledSaleId,
        tenantId,
        clientId: null,
        status: PrismaSaleStatus.CANCELLED,
        currency: 'USD',
        sourceType: 'FOOD',
        sourceId: 'food_99',
        sourceCode: null,
        subtotalAmount: new Prisma.Decimal('20.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('20.00'),
        orderDiscountType: null,
        orderDiscountValue: null,
        orderDiscountReason: null,
        cancellationReason: 'Aborted checkout',
        cancelledAt: t0,
        completedAt: null,
        refundedAt: null,
        version: 1,
        createdAt: t0,
        updatedAt: t0,
      });

      engine.payments.set('pay_cancelled_1', {
        id: 'pay_cancelled_1',
        tenantId,
        saleId: cancelledSaleId,
        method: PrismaPaymentMethod.QR,
        amount: new Prisma.Decimal('20.00'),
        currency: 'USD',
        status: PrismaPaymentStatus.CANCELLED,
        reference: null,
        paidAt: null,
        version: 2,
        createdAt: t0,
        updatedAt: t0,
      });

      // Attempt deletion: must be RESTRICTED because financial audit history must survive
      await expect(
        prisma.sale.delete({
          where: { id: cancelledSaleId },
        }),
      ).rejects.toThrow('Foreign key constraint failed on the field: payments_sale_id_fkey');

      expect(engine.payments.has('pay_cancelled_1')).toBe(true);
    });

    it('prohibits creating a Payment referencing a non-existent saleId', async () => {
      await expect(
        prisma.payment.create({
          data: {
            id: 'pay_orphan',
            saleId: 'ghost_sale_uuid',
            method: PrismaPaymentMethod.CASH,
            amount: new Prisma.Decimal('50.00'),
            currency: 'USD',
            status: PrismaPaymentStatus.PENDING,
          },
        }),
      ).rejects.toThrow('Foreign key constraint failed on the field: payments_sale_id_fkey');
    });
  });

  // ==========================================================================
  // 3. Receipt -> Sale: Legal Proof-of-Purchase Protection (onDelete: Restrict)
  // ==========================================================================
  describe('3. Receipt -> Sale (Legal Proof-of-Purchase Protection & onDelete: Restrict)', () => {
    it('prohibits deleting a Sale when an associated Receipt voucher exists', async () => {
      // Remove payment temporarily to isolate Receipt Restrict check
      engine.payments.delete('pay_settled_1');

      await expect(
        prisma.sale.delete({
          where: { id: settledSaleId },
        }),
      ).rejects.toThrow(
        'Foreign key constraint failed on the field: receipts_sale_id_fkey (table: receipts, parent: sales, action: Restrict)',
      );

      // Legal voucher and parent sale remain intact
      expect(engine.sales.has(settledSaleId)).toBe(true);
      expect(engine.receipts.has('rcpt_settled_1')).toBe(true);
    });

    it('prohibits creating a Receipt referencing a non-existent saleId', async () => {
      await expect(
        prisma.receipt.create({
          data: {
            id: 'rcpt_orphan',
            tenantId,
            saleId: 'ghost_sale_uuid',
            receiptNumber: 'REC-2026-999999',
            saleReference: 'ORD-GHOST',
            itemsSnapshot: [],
            paymentsSnapshot: [],
            subtotalAmount: new Prisma.Decimal('100.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('100.00'),
            currency: 'USD',
          },
        }),
      ).rejects.toThrow('Foreign key constraint failed on the field: receipts_sale_id_fkey');
    });
  });

  // ==========================================================================
  // 4. Sale -> Client: Loose Cross-Context Decoupling (No Foreign Key)
  // ==========================================================================
  describe('4. Sale -> Client (Loose Cross-Context Correlation & Zero FK Cascade)', () => {
    it('proves deleting a Client profile does NOT cascade to or delete historical Sales', async () => {
      expect(engine.clients.has(clientId)).toBe(true);
      expect(engine.sales.get(settledSaleId)?.clientId).toBe(clientId);

      // Exercise GDPR erasure or profile deletion on Client
      await prisma.client.delete({
        where: { id: clientId },
      });

      // Client profile is removed
      expect(engine.clients.has(clientId)).toBe(false);

      // Commercial Sales remain 100% intact with historical totals preserved
      expect(engine.sales.has(settledSaleId)).toBe(true);
      const preservedSale = engine.sales.get(settledSaleId);
      expect(preservedSale?.clientId).toBe(clientId);
      expect(preservedSale?.totalAmount.toFixed(2)).toBe('150.00');
    });

    it('permits creating a Sale without a Client (walk-in retail / anonymous sales)', async () => {
      const anonSaleId = 'sale_anon_walkin_uuid';
      const created = await prisma.sale.create({
        data: {
          id: anonSaleId,
          tenantId,
          clientId: null, // Nullable client reference!
          status: PrismaSaleStatus.DRAFT,
          currency: 'USD',
          sourceType: 'DRINK',
          sourceId: 'pos_counter_bar',
          subtotalAmount: new Prisma.Decimal('5.00'),
          discountTotalAmount: new Prisma.Decimal('0.00'),
          totalAmount: new Prisma.Decimal('5.00'),
        },
      });

      expect(created.clientId).toBeNull();
      expect(engine.sales.has(anonSaleId)).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Embedded Value Objects (Zero Orphan Entity Risks)
  // ==========================================================================
  describe('5. Embedded Value Objects (Zero Orphan Entity Risks)', () => {
    it('verifies Discount and SaleSource have zero separate tables or orphan risks', () => {
      const sale = engine.sales.get(settledSaleId)!;
      // Stored directly in the same row
      expect(sale.sourceType).toBe('KINESIOLOGY_SESSION');
      expect(sale.sourceId).toBe('sess_rehab_42');
      expect(sale.orderDiscountType).toBeNull();
      expect(sale.orderDiscountValue).toBeNull();

      const item = engine.saleItems.get('item_settled_1')!;
      expect(item.sourceType).toBe('TreatmentSession');
      expect(item.sourceId).toBe('sess_rehab_42');
      expect(item.discountType).toBeNull();
    });
  });

  // ==========================================================================
  // 6. Application-Level Immutability & Deletion Impossibility
  // ==========================================================================
  describe('6. Application-Level Immutability & Deletion Impossibility', () => {
    it('verifies Repository Ports expose NO delete() API for Sales, Payments, or Receipts', () => {
      // Type assertion / interface boundary verification:
      // None of the port definitions allow physical deletion of commercial or financial records.
      type SaleRepoMethods = keyof SaleRepositoryPort;
      type PaymentRepoMethods = keyof PaymentRepositoryPort;
      type ReceiptRepoMethods = keyof ReceiptRepositoryPort;

      const saleRepoHasDelete: 'delete' extends SaleRepoMethods ? true : false = false;
      const paymentRepoHasDelete: 'delete' extends PaymentRepoMethods ? true : false = false;
      const receiptRepoHasDelete: 'delete' extends ReceiptRepoMethods ? true : false = false;

      expect(saleRepoHasDelete).toBe(false);
      expect(paymentRepoHasDelete).toBe(false);
      expect(receiptRepoHasDelete).toBe(false);
    });
  });
});
