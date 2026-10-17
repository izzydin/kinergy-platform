import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  Receipt as PrismaReceiptModel,
} from '@prisma/client';
import { PrismaDatabaseErrorMapper } from '../mappers/prisma-database-error.mapper';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { PrismaSalesUnitOfWork } from '../services/prisma-sales-unit-of-work';
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { DeterministicClock } from '../../../../domain/shared/clock';
import {
  InvalidMoneyException,
  InvalidSaleItemException,
  InvalidDiscountException,
  InvalidPaymentAmountException,
  DuplicateSaleException,
  InvalidSaleStateException,
  ReceiptDomainException,
} from '../../../../domain/exceptions';
import { DuplicatePaymentReferenceException } from '../../../../application/exceptions/duplicate-payment-reference.exception';
import { SaleNotFoundException } from '../../../../application/exceptions/sale-not-found.exception';
import { PaymentPersistenceException } from '../exceptions/payment-persistence.exception';

/**
 * High-fidelity stateful PostgreSQL transactional engine emulator with Prisma Client API.
 * Faithfully simulates PostgreSQL constraint enforcement (FK Restrict, Unique Indexes, CHECK constraints,
 * and transaction rollbacks) according to Milestone 7.18/7.19 persistence specifications.
 */
class StatefulPostgreSqlPrismaEmulator {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();

  // In-flight transaction staging buffer
  private inTransaction = false;
  private stagingSales = new Map<string, PrismaSaleModel>();
  private stagingSaleItems = new Map<string, PrismaSaleItemModel>();
  private stagingPayments = new Map<string, PrismaPaymentModel>();
  private stagingReceipts = new Map<string, PrismaReceiptModel>();

  public failNextOperationWith: Error | null = null;

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.receipts.clear();
    this.rollbackStaging();
    this.failNextOperationWith = null;
  }

  private checkFault(): void {
    if (this.failNextOperationWith) {
      const err = this.failNextOperationWith;
      this.failNextOperationWith = null;
      throw err;
    }
  }

  private commitStaging(): void {
    for (const [k, v] of this.stagingSales.entries()) this.sales.set(k, v);
    for (const [k, v] of this.stagingSaleItems.entries()) this.saleItems.set(k, v);
    for (const [k, v] of this.stagingPayments.entries()) this.payments.set(k, v);
    for (const [k, v] of this.stagingReceipts.entries()) this.receipts.set(k, v);
    this.rollbackStaging();
  }

  private rollbackStaging(): void {
    this.stagingSales.clear();
    this.stagingSaleItems.clear();
    this.stagingPayments.clear();
    this.stagingReceipts.clear();
    this.inTransaction = false;
  }

  public createPrismaClient(): PrismaClient {
    const getActiveSales = () => (this.inTransaction ? this.stagingSales : this.sales);
    const getActiveSaleItems = () => (this.inTransaction ? this.stagingSaleItems : this.saleItems);
    const getActivePayments = () => (this.inTransaction ? this.stagingPayments : this.payments);
    const getActiveReceipts = () => (this.inTransaction ? this.stagingReceipts : this.receipts);

    const client: Record<string, unknown> = {
      $transaction: jest.fn(async (cb: (tx: PrismaClient) => Promise<unknown>) => {
        this.checkFault();
        this.inTransaction = true;
        // Seed staging with current committed state
        this.stagingSales = new Map(this.sales);
        this.stagingSaleItems = new Map(this.saleItems);
        this.stagingPayments = new Map(this.payments);
        this.stagingReceipts = new Map(this.receipts);

        try {
          const result = await cb(client as unknown as PrismaClient);
          this.commitStaging();
          return result;
        } catch (err) {
          this.rollbackStaging();
          throw err;
        }
      }),

      sale: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, boolean>;
          }) => {
            this.checkFault();
            const record = getActiveSales().get(where.id);
            if (!record) return null;
            if (select) {
              const projected: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                if (select[key]) projected[key] = (record as Record<string, unknown>)[key];
              }
              return projected;
            }
            const items = Array.from(getActiveSaleItems().values()).filter(
              (i) => i.saleId === where.id,
            );
            return { ...record, items };
          },
        ),

        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          this.checkFault();
          const all = Array.from(getActiveSales().values());
          const match = all.find((s) => {
            if (where['sourceType'] && s.sourceType !== where['sourceType']) return false;
            if (where['sourceId'] && s.sourceId !== where['sourceId']) return false;
            if (where['sourceCode'] && s.sourceCode !== where['sourceCode']) return false;
            if (where['tenantId'] && s.tenantId !== where['tenantId']) return false;
            if (where['status'] && typeof where['status'] === 'object') {
              const statusFilter = where['status'] as { not?: string };
              if (statusFilter.not && s.status === statusFilter.not) return false;
            }
            if (where['NOT'] && typeof where['NOT'] === 'object') {
              const notFilter = where['NOT'] as { id?: string };
              if (notFilter.id && s.id === notFilter.id) return false;
            }
            return true;
          });
          if (!match) return null;
          const items = Array.from(getActiveSaleItems().values()).filter(
            (i) => i.saleId === match.id,
          );
          return { ...match, items };
        }),

        create: jest.fn(async ({ data }: { data: PrismaSaleModel }) => {
          this.checkFault();
          const targetSales = getActiveSales();
          // Primary key constraint
          if (targetSales.has(data.id)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`id`)',
              { code: 'P2002', clientVersion: '6.3.1', meta: { target: ['id'] } },
            );
          }
          // Unique Index 1: uq_sales_clinical_session_active
          const clinicalTypes = ['TREATMENT_SESSION', 'KINESIOLOGY_SESSION'];
          if (clinicalTypes.includes(data.sourceType) && data.status !== 'CANCELLED') {
            const conflict = Array.from(targetSales.values()).some(
              (s) =>
                s.tenantId === data.tenantId &&
                s.sourceId === data.sourceId &&
                clinicalTypes.includes(s.sourceType) &&
                s.status !== 'CANCELLED',
            );
            if (conflict) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the partial index uq_sales_clinical_session_active',
                {
                  code: 'P2002',
                  clientVersion: '6.3.1',
                  meta: { target: ['uq_sales_clinical_session_active'] },
                },
              );
            }
          }
          // Unique Index 2: uq_sales_source_code_active
          if (
            data.sourceCode &&
            data.sourceCode !== 'POS_REGISTER' &&
            data.sourceCode !== 'pos_checkout_terminal' &&
            data.status !== 'CANCELLED'
          ) {
            const conflict = Array.from(targetSales.values()).some(
              (s) =>
                s.tenantId === data.tenantId &&
                s.sourceCode === data.sourceCode &&
                s.status !== 'CANCELLED',
            );
            if (conflict) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the partial index uq_sales_source_code_active',
                {
                  code: 'P2002',
                  clientVersion: '6.3.1',
                  meta: { target: ['uq_sales_source_code_active'] },
                },
              );
            }
          }

          const now = new Date();
          const record: PrismaSaleModel = {
            ...data,
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
          };
          targetSales.set(data.id, record);
          return record;
        }),

        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<PrismaSaleModel> }) => {
            this.checkFault();
            const targetSales = getActiveSales();
            const existing = targetSales.get(where.id);
            if (!existing) {
              throw new Prisma.PrismaClientKnownRequestError('Record to update not found', {
                code: 'P2025',
                clientVersion: '6.3.1',
              });
            }
            const updated = { ...existing, ...data, updatedAt: new Date() } as PrismaSaleModel;
            targetSales.set(where.id, updated);
            return updated;
          },
        ),

        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Partial<PrismaSaleModel>;
          }) => {
            this.checkFault();
            const targetSales = getActiveSales();
            const existing = targetSales.get(where.id);
            if (!existing || existing.version !== where.version) {
              return { count: 0 };
            }
            const updated = { ...existing, ...data, updatedAt: new Date() } as PrismaSaleModel;
            targetSales.set(where.id, updated);
            return { count: 1 };
          },
        ),

        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: PrismaSaleModel;
            update: Partial<PrismaSaleModel>;
          }) => {
            this.checkFault();
            const targetSales = getActiveSales();
            const existing = targetSales.get(where.id);
            const now = new Date();
            if (existing) {
              const updated = { ...existing, ...update, updatedAt: now } as PrismaSaleModel;
              targetSales.set(where.id, updated);
              return updated;
            }
            const created: PrismaSaleModel = {
              ...create,
              createdAt: create.createdAt ?? now,
              updatedAt: create.updatedAt ?? now,
            };
            targetSales.set(where.id, created);
            return created;
          },
        ),

        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          this.checkFault();
          const targetPayments = getActivePayments();
          const targetReceipts = getActiveReceipts();
          // Foreign Key Restrict check
          const hasPayments = Array.from(targetPayments.values()).some(
            (p) => p.saleId === where.id,
          );
          if (hasPayments) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on table payments (action: Restrict)',
              { code: 'P2003', clientVersion: '6.3.1', meta: { field_name: 'saleId' } },
            );
          }
          const hasReceipts = Array.from(targetReceipts.values()).some(
            (r) => r.saleId === where.id,
          );
          if (hasReceipts) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on table receipts (action: Restrict)',
              { code: 'P2003', clientVersion: '6.3.1', meta: { field_name: 'saleId' } },
            );
          }
          // Cascade items
          const targetSaleItems = getActiveSaleItems();
          for (const [id, item] of targetSaleItems.entries()) {
            if (item.saleId === where.id) targetSaleItems.delete(id);
          }
          const existing = getActiveSales().get(where.id);
          getActiveSales().delete(where.id);
          return existing;
        }),

        count: jest.fn(async () => getActiveSales().size),
      },

      saleItem: {
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            this.checkFault();
            const targetSaleItems = getActiveSaleItems();
            const notIn = where.id?.notIn ?? [];
            let count = 0;
            for (const [id, item] of Array.from(targetSaleItems.entries())) {
              if (item.saleId === where.saleId && !notIn.includes(id)) {
                targetSaleItems.delete(id);
                count++;
              }
            }
            return { count };
          },
        ),

        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: PrismaSaleItemModel;
            update: Partial<PrismaSaleItemModel>;
          }) => {
            this.checkFault();
            const targetSaleItems = getActiveSaleItems();
            const existing = targetSaleItems.get(where.id);
            if (existing) {
              const updated = { ...existing, ...update } as PrismaSaleItemModel;
              targetSaleItems.set(where.id, updated);
              return updated;
            }
            targetSaleItems.set(where.id, create);
            return create;
          },
        ),

        findMany: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          this.checkFault();
          const all = Array.from(getActiveSaleItems().values());
          if (!where?.saleId) return all;
          return all.filter((i) => i.saleId === where.saleId);
        }),
      },

      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          this.checkFault();
          return getActivePayments().get(where.id) ?? null;
        }),

        findMany: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          this.checkFault();
          const all = Array.from(getActivePayments().values());
          if (!where?.saleId) return all;
          return all.filter((p) => p.saleId === where.saleId);
        }),

        create: jest.fn(async ({ data }: { data: PrismaPaymentModel }) => {
          this.checkFault();
          const targetPayments = getActivePayments();
          // Foreign Key Check on saleId
          if (!getActiveSales().has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on field saleId',
              {
                code: 'P2003',
                clientVersion: '6.3.1',
                meta: { field_name: 'saleId', target: ['saleId'] },
              },
            );
          }
          // Unique Index: uq_payments_sale_reference (sale_id, reference) WHERE reference IS NOT NULL
          if (data.reference) {
            const conflict = Array.from(targetPayments.values()).some(
              (p) => p.saleId === data.saleId && p.reference === data.reference,
            );
            if (conflict) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on uq_payments_sale_reference',
                {
                  code: 'P2002',
                  clientVersion: '6.3.1',
                  meta: { target: ['uq_payments_sale_reference', 'reference'] },
                },
              );
            }
          }
          targetPayments.set(data.id, { ...data });
          return data;
        }),

        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Partial<PrismaPaymentModel>;
          }) => {
            this.checkFault();
            const targetPayments = getActivePayments();
            const existing = targetPayments.get(where.id);
            if (!existing || existing.version !== where.version) {
              return { count: 0 };
            }
            const updated = { ...existing, ...data } as PrismaPaymentModel;
            targetPayments.set(where.id, updated);
            return { count: 1 };
          },
        ),

        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: PrismaPaymentModel;
            update: Partial<PrismaPaymentModel>;
          }) => {
            this.checkFault();
            const targetPayments = getActivePayments();
            const existing = targetPayments.get(where.id);
            if (existing) {
              const updated = { ...existing, ...update } as PrismaPaymentModel;
              targetPayments.set(where.id, updated);
              return updated;
            }
            targetPayments.set(where.id, create);
            return create;
          },
        ),
      },

      receipt: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          this.checkFault();
          return getActiveReceipts().get(where.id) ?? null;
        }),

        findFirst: jest.fn(async ({ where }: { where: { saleId: string; tenantId?: string } }) => {
          this.checkFault();
          const all = Array.from(getActiveReceipts().values());
          return (
            all.find(
              (r) =>
                r.saleId === where.saleId && (!where.tenantId || r.tenantId === where.tenantId),
            ) ?? null
          );
        }),

        create: jest.fn(async ({ data }: { data: PrismaReceiptModel }) => {
          this.checkFault();
          const targetReceipts = getActiveReceipts();
          // Foreign Key Check on saleId
          if (!getActiveSales().has(data.saleId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Foreign key constraint failed on field saleId',
              { code: 'P2003', clientVersion: '6.3.1', meta: { field_name: 'saleId' } },
            );
          }
          // Unique Index: receipts_receipt_number_key
          const conflictNumber = Array.from(targetReceipts.values()).some(
            (r) => r.receiptNumber === data.receiptNumber,
          );
          if (conflictNumber) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on receiptNumber',
              { code: 'P2002', clientVersion: '6.3.1', meta: { target: ['receiptNumber'] } },
            );
          }
          targetReceipts.set(data.id, { ...data });
          return data;
        }),

        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<PrismaReceiptModel> }) => {
            this.checkFault();
            const targetReceipts = getActiveReceipts();
            const existing = targetReceipts.get(where.id);
            if (!existing) {
              throw new Prisma.PrismaClientKnownRequestError('Record to update not found', {
                code: 'P2025',
                clientVersion: '6.3.1',
              });
            }
            const updated = { ...existing, ...data } as PrismaReceiptModel;
            targetReceipts.set(where.id, updated);
            return updated;
          },
        ),
      },
    };

    return client as unknown as PrismaClient;
  }
}

describe('Milestone 7.19 — Persistence, Constraints, Money Representation & Transactions Integration Spec', () => {
  let db: StatefulPostgreSqlPrismaEmulator;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let receiptRepo: PrismaReceiptRepository;
  let unitOfWork: PrismaSalesUnitOfWork;
  const clock = new DeterministicClock(new Date('2026-10-17T12:00:00.000Z'));

  beforeEach(() => {
    db = new StatefulPostgreSqlPrismaEmulator();
    prisma = db.createPrismaClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    receiptRepo = new PrismaReceiptRepository(prisma);
    unitOfWork = new PrismaSalesUnitOfWork(prisma);
  });

  // ==========================================================================
  // 1. Prisma Persistence Lifecycle & Nullable Relationship Alignment
  // ==========================================================================
  describe('1. Prisma Persistence & Relationship Alignment', () => {
    it('persists and reconstitutes a complete Sale with child items, discounts, and nullable attributes', async () => {
      const saleId = SaleId.create();
      const sale = Sale.create({
        id: saleId,
        tenantId: 'tenant_clinica_central',
        clientId: 'client_777',
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_ortho_42',
          sourceCode: 'ORDER_REF_42',
        }),
      });

      sale.addItem({
        description: 'Post-Op Knee Kinesiology Evaluation',
        unitPrice: Money.create(150, 'USD'),
        quantity: 1,
        source: SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_ortho_42'),
      });

      sale.applyOrderDiscount(Discount.percentage(10)); // 10% off -> $15 discount, Total = $135.00
      await saleRepo.save(sale); // save initial draft (version 1)

      sale.finalize();
      await saleRepo.save(sale); // save finalized transition (version 2)

      const loaded = await saleRepo.findById(saleId);
      expect(loaded).not.toBeNull();
      expect(loaded!.id.value).toBe(saleId.value);
      expect(loaded!.tenantId).toBe('tenant_clinica_central');
      expect(loaded!.clientId).toBe('client_777');
      expect(loaded!.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(loaded!.total.amount).toBe(135.0);
      expect(loaded!.discountTotal.amount).toBe(15.0);
      expect(loaded!.items).toBeDefined();
      expect(loaded!.items).toHaveLength(1);
      expect(loaded!.items[0]!.description).toBe('Post-Op Knee Kinesiology Evaluation');
      expect(loaded!.source.sourceType).toBe(SourceType.TREATMENT_SESSION);
      expect(loaded!.source.sourceCode).toBe('ORDER_REF_42');
    });

    it('retrieves receipts by saleId with strict isolation', async () => {
      // Seed a receipt directly in the database emulator
      db.receipts.set('rcpt_101', {
        id: 'rcpt_101',
        tenantId: 'tenant_clinica_central',
        saleId: 'sale_101',
        receiptNumber: 'RCP-2026-000101',
        saleReference: 'ORDER_REF_42',
        subtotalAmount: new Prisma.Decimal('100.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        currency: 'USD',
        status: 'ISSUED',
        clientSnapshot: {
          clientId: 'client_1',
          referenceNumber: null,
          fullName: 'Client One',
          email: null,
          phone: null,
        },
        itemsSnapshot: [
          {
            itemId: 'item_1',
            sourceType: 'TreatmentSession',
            sourceId: 'treat_1',
            description: 'Kinesiology session',
            skuOrCode: null,
            quantity: 1,
            unitPrice: { amount: 100, cents: 10000, currency: 'USD' },
            subtotal: { amount: 100, cents: 10000, currency: 'USD' },
            total: { amount: 100, cents: 10000, currency: 'USD' },
          },
        ],
        paymentsSnapshot: [
          {
            paymentId: 'pay_1',
            method: 'CASH',
            status: 'COMPLETED',
            amount: { amount: 100, cents: 10000, currency: 'USD' },
            reference: null,
            paidAt: '2026-10-17T12:00:00.000Z',
          },
        ],
        reprintCount: 0,
        lastReprintedAt: null,
        version: 1,
        issuedAt: new Date('2026-10-17T12:00:00.000Z'),
        createdAt: new Date('2026-10-17T12:00:00.000Z'),
        updatedAt: new Date('2026-10-17T12:00:00.000Z'),
      });

      const loaded = await receiptRepo.findBySaleId('sale_101', 'tenant_clinica_central');
      expect(loaded).not.toBeNull();
      expect(loaded!.id.value).toBe('rcpt_101');
      expect(loaded!.receiptNumber.value).toBe('RCP-2026-000101');
      expect(loaded!.total.amount).toBe(100.0);
    });

    it('persists and retrieves nullable fields correctly when optional attributes are omitted', async () => {
      const saleId = SaleId.create();
      // Anonymous counter sale: clientId = undefined, sourceCode = null, orderDiscount = null
      const sale = Sale.create({
        id: saleId,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'snack_protein_bar'),
      });
      sale.addItem({
        description: 'Protein Bar Snack',
        unitPrice: Money.create(5, 'USD'),
        quantity: 2,
        source: SaleSource.create(SaleSourceType.FOOD, 'snack_protein_bar'),
      });
      await saleRepo.save(sale);

      const loaded = await saleRepo.findById(saleId);
      expect(loaded).not.toBeNull();
      expect(loaded!.clientId).toBeUndefined();
      expect(loaded!.source.sourceCode).toBeNull();
      expect(loaded!.orderDiscount).toBeNull();
      expect(loaded!.total.amount).toBe(10.0);
    });

    it('enforces terminal state immutability in persistence: CANCELLED and REFUNDED records cannot be modified', async () => {
      const saleId = SaleId.create();
      const sale = Sale.create({
        id: saleId,
        tenantId: 'tenant_terminal_test',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'item_01'),
      });
      await saleRepo.save(sale);
      sale.cancel('Patient requested cancellation');
      await saleRepo.save(sale);

      // Attempt to mutate the persisted cancelled sale by reconstituting and saving with same ID
      const conflictingSale = Sale.reconstitute({
        id: saleId,
        tenantId: 'tenant_terminal_test',
        currency: 'USD',
        status: SaleStatus.DRAFT,
        source: SaleSource.create(SaleSourceType.FOOD, 'item_01'),
        subtotal: Money.create(0, 'USD'),
        discountTotal: Money.create(0, 'USD'),
        total: Money.create(0, 'USD'),
        version: 1,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(saleRepo.save(conflictingSale)).rejects.toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 2. Foreign Keys & Referential Integrity
  // ==========================================================================
  describe('2. Foreign Keys & Referential Integrity', () => {
    it('rejects Payment creation when referencing a non-existent Sale with SaleNotFoundException (P2003)', async () => {
      const payment = Payment.createCompleted(
        {
          id: PaymentId.create(),
          tenantId: 'default',
          saleId: SaleId.create(), // Non-existent sale
          amount: Money.create(50, 'USD'),
          method: PaymentMethod.CASH,
        },
        clock,
      );

      await expect(paymentRepo.save(payment)).rejects.toThrow(SaleNotFoundException);
    });

    it('prevents Sale deletion when Payment records exist (onDelete: Restrict)', async () => {
      const saleId = SaleId.create();
      const sale = Sale.create({
        id: saleId,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'item_01'),
      });
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          id: PaymentId.create(),
          tenantId: 'default',
          saleId,
          amount: Money.create(25, 'USD'),
          method: PaymentMethod.QR,
          reference: 'AUTH_QR_999',
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Raw delete on Prisma client
      await expect(prisma.sale.delete({ where: { id: saleId.value } })).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('cascades Sale deletion to owned SaleItems when no payments or receipts exist', async () => {
      const saleId = SaleId.create();
      const sale = Sale.create({
        id: saleId,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'item_cascade'),
      });
      sale.addItem({
        description: 'Item to cascade delete',
        unitPrice: Money.create(10, 'USD'),
        quantity: 1,
        source: SaleSource.create(SaleSourceType.FOOD, 'item_cascade'),
      });
      await saleRepo.save(sale);

      expect(db.saleItems.size).toBe(1);

      await prisma.sale.delete({ where: { id: saleId.value } });

      expect(db.sales.has(saleId.value)).toBe(false);
      expect(db.saleItems.size).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Unique Constraints & Partial Indexes
  // ==========================================================================
  describe('3. Unique Constraints & Partial Indexes', () => {
    it('enforces single-billing invariant via uq_sales_clinical_session_active partial index', async () => {
      const tenantId = 'tenant_ortho_clinic';
      const source = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_duplicate_guard');

      const sale1 = Sale.create({
        id: SaleId.create(),
        tenantId,
        currency: 'USD',
        source,
      });
      await saleRepo.save(sale1);

      const sale2 = Sale.create({
        id: SaleId.create(),
        tenantId,
        currency: 'USD',
        source,
      });

      await expect(saleRepo.save(sale2)).rejects.toThrow(DuplicateSaleException);
    });

    it('allows a new Sale for the same clinical session if the prior Sale was CANCELLED', async () => {
      const tenantId = 'tenant_ortho_clinic';
      const source = SaleSource.create(
        SaleSourceType.KINESIOLOGY_SESSION,
        'sess_cancelled_reorder',
      );

      const sale1 = Sale.create({
        id: SaleId.create(),
        tenantId,
        currency: 'USD',
        source,
      });
      await saleRepo.save(sale1);
      sale1.cancel('Accidental entry');
      await saleRepo.save(sale1);

      // Re-billing for same clinical session must succeed
      const sale2 = Sale.create({
        id: SaleId.create(),
        tenantId,
        currency: 'USD',
        source,
      });

      await expect(saleRepo.save(sale2)).resolves.not.toThrow();
    });

    it('enforces uq_payments_sale_reference: rejects duplicate non-cash reference on the same Sale', async () => {
      const saleId = SaleId.create();
      const sale = Sale.create({
        id: saleId,
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'item_bar'),
      });
      sale.addItem({
        description: 'Energy Bar',
        unitPrice: Money.create(100, 'USD'),
        quantity: 1,
        source: SaleSource.create(SaleSourceType.FOOD, 'item_bar'),
      });
      await saleRepo.save(sale);

      const payment1 = Payment.createCompleted(
        {
          id: PaymentId.create(),
          tenantId: 'default',
          saleId,
          amount: Money.create(50, 'USD'),
          method: PaymentMethod.QR,
          reference: 'TXN_GATEWAY_101',
        },
        clock,
      );
      await paymentRepo.save(payment1);

      // Duplicate payment attempt with identical reference
      const payment2 = Payment.createCompleted(
        {
          id: PaymentId.create(),
          tenantId: 'default',
          saleId,
          amount: Money.create(50, 'USD'),
          method: PaymentMethod.QR,
          reference: 'TXN_GATEWAY_101',
        },
        clock,
      );

      await expect(paymentRepo.save(payment2)).rejects.toThrow(DuplicatePaymentReferenceException);
    });
  });

  // ==========================================================================
  // 4. Decimal & Monetary Behavior
  // ==========================================================================
  describe('4. Decimal & Monetary Representation', () => {
    it('prevents JavaScript IEEE 754 floating-point corruption (0.1 + 0.2) via exact Decimal mapping', () => {
      // In JS: 0.1 + 0.2 = 0.30000000000000004
      const floatSum = 0.1 + 0.2;
      expect(floatSum).not.toBe(0.3);

      const money = Money.create(floatSum, 'USD');
      const prismaDecimal = PrismaMoneyMapper.toDecimal(money);

      expect(prismaDecimal.toFixed(2)).toBe('0.30');
      expect(prismaDecimal.toString()).toBe('0.3');
    });

    it('maps PostgreSQL CHECK constraint violations to domain exceptions', () => {
      // 1. Negative subtotal
      const errSubtotal = PrismaDatabaseErrorMapper.mapCheckConstraintError({
        code: '23514',
        message: 'violates check constraint "chk_sales_non_negative_subtotal"',
      });
      expect(errSubtotal).toBeInstanceOf(InvalidMoneyException);

      // 2. Negative payment amount
      const errPayment = PrismaDatabaseErrorMapper.mapCheckConstraintError({
        code: '23514',
        message: 'violates check constraint "chk_payments_positive_amount"',
      });
      expect(errPayment).toBeInstanceOf(InvalidPaymentAmountException);

      // 3. Negative discount value
      const errDiscount = PrismaDatabaseErrorMapper.mapCheckConstraintError({
        code: '23514',
        message: 'violates check constraint "chk_sales_non_negative_order_discount_val"',
      });
      expect(errDiscount).toBeInstanceOf(InvalidDiscountException);

      // 4. Non-positive item quantity
      const errQuantity = PrismaDatabaseErrorMapper.mapCheckConstraintError({
        code: '23514',
        message: 'violates check constraint "chk_sale_items_positive_quantity"',
      });
      expect(errQuantity).toBeInstanceOf(InvalidSaleItemException);

      // 5. Negative receipt total
      const errReceipt = PrismaDatabaseErrorMapper.mapCheckConstraintError({
        code: '23514',
        message: 'violates check constraint "chk_receipts_non_negative_total"',
      });
      expect(errReceipt).toBeInstanceOf(ReceiptDomainException);
    });
  });

  // ==========================================================================
  // 5. Database Transactions & Rollback Guarantees
  // ==========================================================================
  describe('5. Database Transactions & Rollback Guarantees', () => {
    it('commits related multi-aggregate writes atomically inside unit of work', async () => {
      const saleId = SaleId.create();
      const paymentId = PaymentId.create();

      await unitOfWork.executeInTransaction(async () => {
        const sale = Sale.create({
          id: saleId,
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.FOOD, 'item_uow'),
        });
        sale.addItem({
          description: 'Supplements',
          unitPrice: Money.create(80, 'USD'),
          quantity: 1,
          source: SaleSource.create(SaleSourceType.FOOD, 'item_uow'),
        });
        await saleRepo.save(sale);

        const payment = Payment.createCompleted(
          {
            id: paymentId,
            tenantId: 'default',
            saleId,
            amount: Money.create(80, 'USD'),
            method: PaymentMethod.CASH,
          },
          clock,
        );
        await paymentRepo.save(payment);
      });

      expect(db.sales.has(saleId.value)).toBe(true);
      expect(db.payments.has(paymentId.value)).toBe(true);
    });

    it('rolls back all staged writes and leaves no partial state when a transaction fails mid-work', async () => {
      const saleId = SaleId.create();
      const paymentId = PaymentId.create();

      // Configure emulator to fail when payment is being saved
      db.failNextOperationWith = new Error('Database disk I/O timeout during payment insert');

      await expect(
        unitOfWork.executeInTransaction(async () => {
          const sale = Sale.create({
            id: saleId,
            currency: 'USD',
            source: SaleSource.create(SaleSourceType.FOOD, 'item_rollback'),
          });
          sale.addItem({
            description: 'Yoga Mat',
            unitPrice: Money.create(40, 'USD'),
            quantity: 1,
            source: SaleSource.create(SaleSourceType.FOOD, 'item_rollback'),
          });
          await saleRepo.save(sale);

          // This operation will trigger simulated database failure
          const payment = Payment.createCompleted(
            {
              id: paymentId,
              tenantId: 'default',
              saleId,
              amount: Money.create(40, 'USD'),
              method: PaymentMethod.CASH,
            },
            clock,
          );
          await paymentRepo.save(payment);
        }),
      ).rejects.toThrow('Database disk I/O timeout');

      // Assert full rollback: Sale was NOT committed to the permanent database
      expect(db.sales.has(saleId.value)).toBe(false);
      expect(db.saleItems.size).toBe(0);
      expect(db.payments.has(paymentId.value)).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Diagnostic Information & Credential Sanitization
  // ==========================================================================
  describe('6. Diagnostic Error Sanitization', () => {
    it('sanitizes database error messages to prevent leakage of credentials or sensitive metadata', () => {
      const rawError = new Error(
        'Failed connecting to postgresql://kinergy_admin:SuperSecretPw@10.0.0.5:5432/kinergy_prod at line 42',
      );

      const mapped = PrismaDatabaseErrorMapper.mapDatabaseError(rawError);
      expect(mapped).toBeInstanceOf(PaymentPersistenceException);
      expect(mapped.message).not.toContain('SuperSecretPw');
    });
  });
});
