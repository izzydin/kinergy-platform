import {
  Prisma,
  PrismaClient,
  Receipt as PrismaReceiptModel,
  ReceiptStatus as PrismaReceiptStatus,
  Sale as PrismaSaleModel,
  SaleStatus as PrismaSaleStatus,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
  Client as PrismaClientModel,
} from '@prisma/client';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { ReceiptClientSnapshot } from '../../../../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../../../../domain/enums/receipt-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { DuplicateReceiptException } from '../../../../domain/exceptions/duplicate-receipt.exception';
import { ReceiptOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { PrismaReceiptPersistenceInput } from '../mappers/prisma-receipt.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';

/**
 * High-fidelity stateful relational database harness emulating PostgreSQL / Prisma mechanics
 * for Sales, SaleItems, Clients, Payments, and Receipts (Milestone 7.7 / ADR-0117 / ADR-0122).
 */
class MockReceiptRelationalDatabase {
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
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<PrismaClientModel> }) => {
            const existing = clients.get(where.id);
            if (!existing) {
              throw new Error(`Client ${where.id} not found`);
            }
            const updated = { ...existing, ...data };
            clients.set(where.id, updated as PrismaClientModel);
            return updated;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const existing = clients.get(where.id);
          clients.delete(where.id);
          return existing;
        }),
      },
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return sales.get(where.id) ?? null;
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<PrismaSaleModel> }) => {
            const existing = sales.get(where.id);
            if (!existing) {
              throw new Error(`Sale ${where.id} not found`);
            }
            const updated = { ...existing, ...data };
            sales.set(where.id, updated as PrismaSaleModel);
            return updated;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          // Relational Engine Emulation: onDelete: Restrict on receipts.saleId
          const hasReceipts = Array.from(receipts.values()).some((r) => r.saleId === where.id);
          if (hasReceipts) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: receipts_sale_id_fkey (table: receipts, parent: sales, action: Restrict)',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }
          const existing = sales.get(where.id);
          sales.delete(where.id);
          return existing;
        }),
      },
      saleItem: {
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<PrismaSaleItemModel>;
          }) => {
            const existing = saleItems.get(where.id);
            if (!existing) {
              throw new Error(`SaleItem ${where.id} not found`);
            }
            const updated = { ...existing, ...data };
            saleItems.set(where.id, updated as PrismaSaleItemModel);
            return updated;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const existing = saleItems.get(where.id);
          saleItems.delete(where.id);
          return existing;
        }),
      },
      payment: {
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<PrismaPaymentModel> }) => {
            const existing = payments.get(where.id);
            if (!existing) {
              throw new Error(`Payment ${where.id} not found`);
            }
            const updated = { ...existing, ...data };
            payments.set(where.id, updated as PrismaPaymentModel);
            return updated;
          },
        ),
      },
      receipt: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: {
              id?: string;
              unique_tenant_sale_receipt?: {
                tenantId: string;
                saleId: string;
              };
            };
            select?: { id?: boolean; version?: boolean };
          }) => {
            if (where.id) {
              const r = receipts.get(where.id);
              if (!r) return null;
              if (select) {
                return { id: r.id, version: r.version };
              }
              return r;
            }
            if (where.unique_tenant_sale_receipt) {
              const match = Array.from(receipts.values()).find(
                (r) =>
                  r.tenantId === where.unique_tenant_sale_receipt?.tenantId &&
                  r.saleId === where.unique_tenant_sale_receipt?.saleId,
              );
              if (!match) return null;
              if (select) {
                return { id: match.id, version: match.version };
              }
              return match;
            }
            return null;
          },
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              saleId?: string;
              receiptNumber?: string;
              tenantId?: string;
            };
          }) => {
            return (
              Array.from(receipts.values()).find((r) => {
                if (where.saleId && r.saleId !== where.saleId) return false;
                if (where.receiptNumber && r.receiptNumber !== where.receiptNumber) return false;
                if (where.tenantId && r.tenantId !== where.tenantId) return false;
                return true;
              }) ?? null
            );
          },
        ),
        create: jest.fn(async ({ data }: { data: PrismaReceiptPersistenceInput }) => {
          // Relational Foreign Key verification: saleId must exist in sales table
          if (!sales.has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on the field: receipts_sale_id_fkey',
              { code: 'P2003', clientVersion: '6.3.1' },
            );
          }

          // Uniqueness constraint verification: (tenantId, saleId)
          const duplicateSale = Array.from(receipts.values()).some(
            (r) => r.tenantId === data.tenantId && r.saleId === data.saleId,
          );
          if (duplicateSale) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the constraint: unique_tenant_sale_receipt',
              { code: 'P2002', clientVersion: '6.3.1' },
            );
          }

          // Uniqueness constraint verification: (tenantId, receiptNumber)
          const duplicateNumber = Array.from(receipts.values()).some(
            (r) => r.tenantId === data.tenantId && r.receiptNumber === data.receiptNumber,
          );
          if (duplicateNumber) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the constraint: unique_tenant_receipt_number',
              { code: 'P2002', clientVersion: '6.3.1' },
            );
          }

          const record: PrismaReceiptModel = {
            id: data.id,
            tenantId: data.tenantId,
            saleId: data.saleId,
            receiptNumber: data.receiptNumber,
            saleReference: data.saleReference,
            issuedAt: data.issuedAt,
            clientSnapshot:
              data.clientSnapshot === Prisma.DbNull || !data.clientSnapshot
                ? null
                : (data.clientSnapshot as Prisma.JsonValue),
            itemsSnapshot: data.itemsSnapshot as Prisma.JsonValue,
            paymentsSnapshot: data.paymentsSnapshot as Prisma.JsonValue,
            subtotalAmount: data.subtotalAmount,
            discountTotalAmount: data.discountTotalAmount,
            totalAmount: data.totalAmount,
            currency: data.currency,
            status: data.status,
            reprintCount: data.reprintCount,
            lastReprintedAt: data.lastReprintedAt ?? null,
            version: data.version,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };

          receipts.set(data.id, record);
          return record;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Partial<PrismaReceiptModel>;
          }) => {
            const existing = receipts.get(where.id);
            if (!existing || existing.version !== where.version) {
              return { count: 0 };
            }

            // Emulate explicit repository write-once protection:
            // Only operational reprint fields can be updated!
            const updated: PrismaReceiptModel = {
              ...existing,
              status: data.status ?? existing.status,
              reprintCount: data.reprintCount ?? existing.reprintCount,
              lastReprintedAt: data.lastReprintedAt ?? existing.lastReprintedAt,
              version: data.version ?? existing.version + 1,
              updatedAt: data.updatedAt ?? new Date(),
            };

            receipts.set(where.id, updated);
            return { count: 1 };
          },
        ),
      },
      $queryRawUnsafe: jest.fn(async () => [{ current_value: 1 }]),
    };

    return {
      ...txMethods,
      $transaction: jest.fn(async <T>(cb: (tx: typeof txMethods) => Promise<T>): Promise<T> =>
        cb(txMethods),
      ),
    } as unknown as PrismaClient;
  };
}

describe('Receipt Persistence & Historical Integrity (Milestone 7.7 / ADR-0117 / ADR-0122)', () => {
  const t0 = new Date('2026-09-24T12:00:00.000Z');
  let clock: DeterministicClock;
  let db: MockReceiptRelationalDatabase;
  let prisma: PrismaClient;
  let repository: PrismaReceiptRepository;

  const tenantId = 'tenant_kinergy_wellness';
  const clientId = 'cli_00000000-0000-4000-a000-000000000001';
  const saleId = SaleId.create('33333333-3333-4333-a333-333333333333');
  const receiptId = ReceiptId.create('rcpt_12345678-1234-4234-a234-123456789012');
  const receiptNumber = ReceiptNumber.create('REC-2026-000042');
  const saleReference = 'ORD-2026-0924-001';

  beforeEach(() => {
    clock = new DeterministicClock(t0);
    db = new MockReceiptRelationalDatabase();
    prisma = db.createClient();
    repository = new PrismaReceiptRepository(prisma);

    // Seed initial relational records (Client, Sale, SaleItems, Payment)
    db.clients.set(clientId, {
      id: clientId,
      referenceNumber: 'CLI-2026-00042',
      identityId: null,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+15551234567',
      normalizedEmail: 'jane.doe@example.com',
      normalizedPhone: '+15551234567',
      normalizedSearchName: 'jane doe',
      status: 'ACTIVE',
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    db.sales.set(saleId.value, {
      id: saleId.value,
      tenantId,
      clientId,
      status: PrismaSaleStatus.PAID,
      currency: 'USD',
      subtotalAmount: new Prisma.Decimal('170.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('170.00'),
      orderDiscountType: null,
      orderDiscountValue: null,
      orderDiscountReason: null,
      sourceType: 'COMMERCIAL_CHECKOUT',
      sourceId: 'src_pos_register_1',
      sourceCode: null,
      completedAt: null,
      cancelledAt: null,
      refundedAt: null,
      cancellationReason: null,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    db.saleItems.set('sitem_001', {
      id: 'sitem_001',
      saleId: saleId.value,
      description: 'Deep Tissue Kinesiology Therapy (60 min)',
      skuOrCode: 'TREAT-60',
      quantity: new Prisma.Decimal('1.000'),
      unitPriceAmount: new Prisma.Decimal('120.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('120.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('120.00'),
      discountType: null,
      discountValue: null,
      discountReason: null,
      sourceType: 'TreatmentSession',
      sourceId: 'treat_77',
      sourceCode: 'TREAT-60',
      createdAt: t0,
      updatedAt: t0,
    });

    db.saleItems.set('sitem_002', {
      id: 'sitem_002',
      saleId: saleId.value,
      description: 'Recovery Magnesium Spray (250ml)',
      skuOrCode: 'INV-MAG-250',
      quantity: new Prisma.Decimal('2.000'),
      unitPriceAmount: new Prisma.Decimal('25.00'),
      unitPriceCurrency: 'USD',
      subtotalAmount: new Prisma.Decimal('50.00'),
      discountTotalAmount: new Prisma.Decimal('0.00'),
      totalAmount: new Prisma.Decimal('50.00'),
      discountType: null,
      discountValue: null,
      discountReason: null,
      sourceType: 'ConsumableInventory',
      sourceId: 'inv_mag_01',
      sourceCode: 'INV-MAG-250',
      createdAt: t0,
      updatedAt: t0,
    });

    db.payments.set('pay_001', {
      id: 'pay_001',
      tenantId,
      saleId: saleId.value,
      method: PrismaPaymentMethod.CASH,
      amount: new Prisma.Decimal('170.00'),
      currency: 'USD',
      status: PrismaPaymentStatus.SETTLED,
      reference: 'DRAWER-REGISTER-1',
      paidAt: t0,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  });

  const createDomainReceipt = (clientSnap?: ReceiptClientSnapshot | null): Receipt => {
    const client =
      clientSnap !== undefined
        ? clientSnap
        : ReceiptClientSnapshot.create({
            clientId,
            referenceNumber: 'CLI-2026-00042',
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            phone: '+15551234567',
          });

    const item1 = ReceiptItemSnapshot.create({
      itemId: 'sitem_001',
      sourceType: 'TreatmentSession',
      sourceId: 'treat_77',
      description: 'Deep Tissue Kinesiology Therapy (60 min)',
      skuOrCode: 'TREAT-60',
      quantity: 1,
      unitPrice: Money.create(120.0, 'USD'),
      subtotal: Money.create(120.0, 'USD'),
      total: Money.create(120.0, 'USD'),
    });

    const item2 = ReceiptItemSnapshot.create({
      itemId: 'sitem_002',
      sourceType: 'ConsumableInventory',
      sourceId: 'inv_mag_01',
      description: 'Recovery Magnesium Spray (250ml)',
      skuOrCode: 'INV-MAG-250',
      quantity: 2,
      unitPrice: Money.create(25.0, 'USD'),
      subtotal: Money.create(50.0, 'USD'),
      total: Money.create(50.0, 'USD'),
    });

    const payment = ReceiptPaymentSnapshot.create({
      paymentId: 'pay_001',
      method: PaymentMethod.CASH,
      status: PaymentStatus.COMPLETED,
      amount: Money.create(170.0, 'USD'),
      reference: 'DRAWER-REGISTER-1',
      paidAt: t0,
    });

    return Receipt.create(
      {
        id: receiptId,
        tenantId,
        saleId,
        receiptNumber,
        saleReference,
        issuedAt: t0,
        clientSnapshot: client,
        items: [item1, item2],
        subtotal: Money.create(170.0, 'USD'),
        discountTotal: Money.create(0.0, 'USD'),
        total: Money.create(170.0, 'USD'),
        payments: [payment],
      },
      clock,
    );
  };

  // ==========================================================================
  // 1. Identity, Structural Fidelity & Exact Decimal Precision
  // ==========================================================================
  describe('1. Identity, Structural Fidelity & Exact Decimal Precision', () => {
    it('persists and reconstitutes Receipt with exact DECIMAL(12, 2) amounts and domain identifiers', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      const found = await repository.findById(receiptId);
      expect(found).not.toBeNull();
      expect(found?.id.value).toBe(receiptId.value);
      expect(found?.tenantId).toBe(tenantId);
      expect(found?.saleId.value).toBe(saleId.value);
      expect(found?.receiptNumber.value).toBe('REC-2026-000042');
      expect(found?.saleReference).toBe('ORD-2026-0924-001');

      // Exact Decimal Verification
      expect(found?.subtotal.amount).toBe(170.0);
      expect(found?.subtotal.cents).toBe(17000);
      expect(found?.discountTotal.amount).toBe(0.0);
      expect(found?.discountTotal.cents).toBe(0);
      expect(found?.total.amount).toBe(170.0);
      expect(found?.total.cents).toBe(17000);
      expect(found?.currency).toBe('USD');

      // Persistence Model in DB check
      const rawInDb = db.receipts.get(receiptId.value);
      expect(rawInDb?.subtotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(rawInDb?.subtotalAmount.toFixed(2)).toBe('170.00');
      expect(rawInDb?.totalAmount.toFixed(2)).toBe('170.00');
    });

    it('faithfully handles anonymous cash sales with null clientSnapshot', async () => {
      const anonReceipt = createDomainReceipt(null);
      await repository.save(anonReceipt);

      const found = await repository.findById(receiptId);
      expect(found).not.toBeNull();
      expect(found?.clientSnapshot).toBeNull();

      const rawInDb = db.receipts.get(receiptId.value);
      expect(rawInDb?.clientSnapshot).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Foreign Key Protection & Relational Deletion Semantics (onDelete: Restrict)
  // ==========================================================================
  describe('2. Foreign Key Protection & Relational Deletion Semantics (onDelete: Restrict)', () => {
    it('prohibits deleting a Sale when an associated Receipt exists (onDelete: Restrict)', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Attempt to physically delete the parent sale in the database
      await expect(
        prisma.sale.delete({
          where: { id: saleId.value },
        }),
      ).rejects.toThrow('Foreign key constraint failed on the field: receipts_sale_id_fkey');

      // Sale remains intact
      expect(db.sales.has(saleId.value)).toBe(true);
    });

    it('rejects creating a Receipt referencing a non-existent saleId', async () => {
      const ghostSaleId = SaleId.create('99999999-9999-4999-a999-999999999999');
      const invalidReceipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt_ghost_11111111-1111-4111-a111-111111111111'),
          tenantId,
          saleId: ghostSaleId,
          receiptNumber: ReceiptNumber.create('REC-2026-000099'),
          saleReference: 'ORD-GHOST',
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item_x',
              sourceType: 'Inventory',
              sourceId: 'inv_x',
              description: 'Ghost Item',
              quantity: 1,
              unitPrice: Money.create(10, 'USD'),
              subtotal: Money.create(10, 'USD'),
              total: Money.create(10, 'USD'),
            }),
          ],
          subtotal: Money.create(10, 'USD'),
          total: Money.create(10, 'USD'),
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay_x',
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              amount: Money.create(10, 'USD'),
              paidAt: t0,
            }),
          ],
        },
        clock,
      );

      await expect(repository.save(invalidReceipt)).rejects.toThrow(
        'Foreign key constraint failed on the field: receipts_sale_id_fkey',
      );
    });
  });

  // ==========================================================================
  // 3. Uniqueness Enforcement (Milestone 7.7)
  // ==========================================================================
  describe('3. Uniqueness Enforcement (Milestone 7.7)', () => {
    it('enforces exactly one primary Receipt per (tenantId, saleId)', async () => {
      const receipt1 = createDomainReceipt();
      await repository.save(receipt1);

      // Attempt to issue a second distinct receipt for the same sale
      const receipt2 = Receipt.create(
        {
          id: ReceiptId.create('rcpt_second_22222222-2222-4222-a222-222222222222'),
          tenantId,
          saleId, // SAME saleId!
          receiptNumber: ReceiptNumber.create('REC-2026-000043'), // Different receipt number
          saleReference,
          items: [...receipt1.items],
          subtotal: receipt1.subtotal,
          total: receipt1.total,
          payments: [...receipt1.payments],
        },
        clock,
      );

      await expect(repository.save(receipt2)).rejects.toThrow(DuplicateReceiptException);
    });

    it('enforces unique alphanumeric receiptNumber per tenant', async () => {
      const receipt1 = createDomainReceipt();
      await repository.save(receipt1);

      // Create another sale
      const otherSaleId = SaleId.create('44444444-4444-4444-a444-444444444444');
      db.sales.set(otherSaleId.value, {
        id: otherSaleId.value,
        tenantId,
        clientId: null,
        status: PrismaSaleStatus.PAID,
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('50.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('50.00'),
        orderDiscountType: null,
        orderDiscountValue: null,
        orderDiscountReason: null,
        sourceType: 'COMMERCIAL_CHECKOUT',
        sourceId: 'src_pos_2',
        sourceCode: null,
        completedAt: null,
        cancelledAt: null,
        refundedAt: null,
        cancellationReason: null,
        version: 1,
        createdAt: t0,
        updatedAt: t0,
      });

      // Attempt to issue a receipt for otherSale with the DUPLICATE receiptNumber 'REC-2026-000042'
      const duplicateNumReceipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt_duplicate_num_33333333-3333-4333-a333-333333333333'),
          tenantId,
          saleId: otherSaleId,
          receiptNumber, // DUPLICATE number!
          saleReference: 'ORD-OTHER-001',
          items: [...receipt1.items],
          subtotal: receipt1.subtotal,
          total: receipt1.total,
          payments: [...receipt1.payments],
        },
        clock,
      );

      await expect(repository.save(duplicateNumReceipt)).rejects.toThrow(DuplicateReceiptException);
    });
  });

  // ==========================================================================
  // 4. Historical Snapshots Survive Upstream Changes (Core ADR-0117 Invariant)
  // ==========================================================================
  describe('4. Historical Snapshots Survive Upstream Entity Changes', () => {
    it('proves historical values survive subsequent modifications to Sale', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Later: Sale is refunded or cancelled in the sales table
      await prisma.sale.update({
        where: { id: saleId.value },
        data: {
          status: PrismaSaleStatus.REFUNDED,
          subtotalAmount: new Prisma.Decimal('0.00'),
          totalAmount: new Prisma.Decimal('0.00'),
          refundedAt: new Date('2026-09-25T10:00:00.000Z'),
          updatedAt: new Date('2026-09-25T10:00:00.000Z'),
        },
      });

      // Verify Sale in DB changed
      const updatedSale = db.sales.get(saleId.value);
      expect(updatedSale?.status).toBe(PrismaSaleStatus.REFUNDED);
      expect(updatedSale?.totalAmount.toFixed(2)).toBe('0.00');

      // Historical Receipt loaded from repository is COMPLETELY UNTOUCHED
      const foundReceipt = await repository.findById(receiptId);
      expect(foundReceipt).not.toBeNull();
      expect(foundReceipt?.subtotal.amount).toBe(170.0);
      expect(foundReceipt?.total.amount).toBe(170.0);
      expect(foundReceipt?.saleReference).toBe('ORD-2026-0924-001');
      expect(foundReceipt?.status).toBe(ReceiptStatus.ISSUED);
    });

    it('proves historical values survive price edits, quantity changes, or deletions of SaleItems', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Downstream catalog / cart update: SaleItem prices change or lines are removed
      await prisma.saleItem.update({
        where: { id: 'sitem_001' },
        data: {
          description: 'MODIFIED Therapy Name',
          unitPriceAmount: new Prisma.Decimal('200.00'), // Increased price!
          totalAmount: new Prisma.Decimal('200.00'),
        },
      });

      // Another line item is deleted from the sale cart
      await prisma.saleItem.delete({
        where: { id: 'sitem_002' },
      });

      expect(db.saleItems.get('sitem_001')?.unitPriceAmount.toFixed(2)).toBe('200.00');
      expect(db.saleItems.has('sitem_002')).toBe(false);

      // Historical Receipt loaded from repository still contains BOTH original frozen line items
      const foundReceipt = await repository.findBySaleId(saleId);
      expect(foundReceipt).not.toBeNull();
      expect(foundReceipt?.items.length).toBe(2);

      const [firstItem, secondItem] = foundReceipt!.items;
      expect(firstItem?.description).toBe('Deep Tissue Kinesiology Therapy (60 min)');
      expect(firstItem?.unitPrice.amount).toBe(120.0);
      expect(firstItem?.total.amount).toBe(120.0);

      expect(secondItem?.description).toBe('Recovery Magnesium Spray (250ml)');
      expect(secondItem?.quantity).toBe(2);
      expect(secondItem?.unitPrice.amount).toBe(25.0);
      expect(secondItem?.total.amount).toBe(50.0);
    });

    it('proves historical values survive modifications or deletion of Client profiles', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Later: Client modifies legal name, email, or exercises GDPR anonymization / deletion
      await prisma.client.update({
        where: { id: clientId },
        data: {
          firstName: 'Jane-Updated',
          lastName: 'Smith-Updated',
          email: 'jane.smith.new@example.com',
          phone: '+15559998888',
        },
      });

      // Verify client in database was modified
      const clientInDb = db.clients.get(clientId);
      expect(clientInDb?.firstName).toBe('Jane-Updated');

      // Historical Receipt client snapshot remains 100% frozen as issued
      const foundReceipt = await repository.findById(receiptId);
      expect(foundReceipt).not.toBeNull();
      expect(foundReceipt?.clientSnapshot).not.toBeNull();
      expect(foundReceipt?.clientSnapshot?.fullName).toBe('Jane Doe'); // Original name preserved!
      expect(foundReceipt?.clientSnapshot?.email).toBe('jane.doe@example.com'); // Original email preserved!
      expect(foundReceipt?.clientSnapshot?.phone).toBe('+15551234567');
      expect(foundReceipt?.clientSnapshot?.referenceNumber).toBe('CLI-2026-00042');

      // Now physically delete client record under GDPR right to be forgotten
      await prisma.client.delete({ where: { id: clientId } });
      expect(db.clients.has(clientId)).toBe(false);

      // Receipt can still be loaded and inspected as a self-contained tax/legal document
      const loadedAfterClientDelete = await repository.findById(receiptId);
      expect(loadedAfterClientDelete).not.toBeNull();
      expect(loadedAfterClientDelete?.clientSnapshot?.fullName).toBe('Jane Doe');
    });

    it('proves historical values survive modifications to Payment records', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Payment record is updated (e.g. gateway marks dispute or adds metadata)
      await prisma.payment.update({
        where: { id: 'pay_001' },
        data: {
          status: PrismaPaymentStatus.CANCELLED,
          amount: new Prisma.Decimal('0.00'),
          reference: 'DISPUTED_AND_REVERSED',
        },
      });

      // Verify payment in database was altered
      const alteredPayment = db.payments.get('pay_001');
      expect(alteredPayment?.status).toBe(PrismaPaymentStatus.CANCELLED);

      // Historical Receipt payment snapshot retains exact tender as settled at issuance
      const foundReceipt = await repository.findById(receiptId);
      expect(foundReceipt).not.toBeNull();
      expect(foundReceipt?.payments.length).toBe(1);

      const paymentSnapshot = foundReceipt!.payments[0];
      expect(paymentSnapshot?.method).toBe(PaymentMethod.CASH);
      expect(paymentSnapshot?.status).toBe(PaymentStatus.COMPLETED);
      expect(paymentSnapshot?.amount.amount).toBe(170.0);
      expect(paymentSnapshot?.reference).toBe('DRAWER-REGISTER-1');
      expect(paymentSnapshot?.paidAt?.toISOString()).toBe(t0.toISOString());
    });
  });

  // ==========================================================================
  // 5. Zero Dynamic Read Joins & Application/Repository Boundary Immutability
  // ==========================================================================
  describe('5. Zero Dynamic Read Joins & Boundary Immutability', () => {
    it('proves query methods retrieve self-contained document without touching live sales, items, or clients', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Clear spy call history to monitor read queries strictly
      jest.clearAllMocks();

      // Read via findById
      const retrieved = await repository.findById(receiptId);
      expect(retrieved).not.toBeNull();

      // Ensure findUnique was called ONLY on receipt table
      expect(prisma.receipt.findUnique).toHaveBeenCalledWith({
        where: { id: receiptId.value },
      });
      // Ensure zero joins or secondary queries to live tables
      expect(prisma.sale.findUnique).not.toHaveBeenCalled();
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    it('enforces that repo.save on reprints updates ONLY reprint metadata, never financial snapshots', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Advance clock and record duplicate reprint
      clock.advance(3600 * 1000);
      const reprintTime = clock.now();
      receipt.recordReprint(clock);

      expect(receipt.version).toBe(2);
      expect(receipt.status).toBe(ReceiptStatus.REPRINTED);
      expect(receipt.reprintCount).toBe(1);

      await repository.save(receipt);

      const rawInDb = db.receipts.get(receiptId.value);
      expect(rawInDb?.version).toBe(2);
      expect(rawInDb?.status).toBe(PrismaReceiptStatus.REPRINTED);
      expect(rawInDb?.reprintCount).toBe(1);
      expect(rawInDb?.lastReprintedAt?.toISOString()).toBe(reprintTime.toISOString());

      // Financial snapshots remain strictly unaltered
      expect(rawInDb?.subtotalAmount.toFixed(2)).toBe('170.00');
      expect(rawInDb?.totalAmount.toFixed(2)).toBe('170.00');
      expect(rawInDb?.saleReference).toBe('ORD-2026-0924-001');
    });

    it('throws ReceiptOptimisticLockException when concurrent reprint collision occurs', async () => {
      const receipt = createDomainReceipt();
      await repository.save(receipt);

      // Simulate concurrent reprint having already incremented DB version to 2
      const rawInDb = db.receipts.get(receiptId.value)!;
      rawInDb.version = 2;
      db.receipts.set(receiptId.value, rawInDb);

      // Attempting to save aggregate that thinks priorVersion is 1
      receipt.recordReprint(clock); // aggregate sets version = 2, expects priorVersion = 1

      await expect(repository.save(receipt)).rejects.toThrow(ReceiptOptimisticLockException);
    });
  });
});
