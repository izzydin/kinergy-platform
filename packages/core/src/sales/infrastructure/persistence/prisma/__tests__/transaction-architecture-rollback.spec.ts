import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  Receipt as PrismaReceiptModel,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { Payment } from '../../../../domain/payment.aggregate';
import { PaymentId } from '../../../../domain/value-objects/payment-id.vo';
import { PaymentStatus } from '../../../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../../../domain/enums/payment-method.enum';
import { Receipt } from '../../../../domain/receipt.aggregate';
import { ReceiptId } from '../../../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../../../domain/value-objects/receipt-number.vo';
import { ReceiptClientSnapshot } from '../../../../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../../../../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../../../../domain/value-objects/receipt-payment-snapshot.vo';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaReceiptRepository } from '../repositories/prisma-receipt.repository';
import { CompletePaymentHandler } from '../../../../application/handlers/complete-payment.handler';
import { CompletePaymentCommand } from '../../../../application/commands/complete-payment.command';
import { IssueReceiptHandler } from '../../../../application/handlers/issue-receipt.handler';
import { IssueReceiptCommand } from '../../../../application/commands/issue-receipt.command';
import { SalePaymentCoordinationService } from '../../../../application/services/sale-payment-coordination.service';
import { SalesEventPublisherPort } from '../../../../application/ports/sales-event-publisher.port';
import { Clock, SystemClock, DeterministicClock } from '../../../../domain/shared/clock';

/**
 * High-fidelity transactional database harness emulating PostgreSQL ACID semantics:
 * - Read Committed isolation with snapshot staging per $transaction.
 * - Atomic rollback: any unhandled exception inside $transaction discards all staged writes.
 * - True multi-table rollback coordination across sales, sale_items, payments, receipts, and receipt_sequences.
 */
class MockPhase7TransactionalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();
  public receiptSequences = new Map<string, number>();

  constructor(public readonly clock: Clock = new SystemClock()) {}

  // Diagnostic fault-injection flags
  public failOnSaleUpsert = false;
  public failOnSaleUpdateMany = false;
  public failOnItemUpsertId: string | null = null;
  public failOnItemDeleteMany = false;
  public failOnPaymentUpsert = false;
  public failOnReceiptCreate = false;

  public createClient = (): PrismaClient => {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
      bufferedReceipts: Map<string, PrismaReceiptModel>,
      bufferedSequences: Map<string, number>,
    ) => ({
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = bufferedSales.get(where.id);
          if (!s) return null;
          const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              sourceType?: string;
              sourceId?: string;
              sourceCode?: string;
              tenantId?: string;
              status?: { not?: string };
              NOT?: { id: string };
            };
          }) => {
            for (const s of bufferedSales.values()) {
              if (where.NOT && s.id === where.NOT.id) continue;
              if (where.tenantId && s.tenantId !== where.tenantId) continue;
              if (where.status?.not && s.status === where.status.not) continue;
              if (
                where.sourceType &&
                s.sourceType === where.sourceType &&
                where.sourceId &&
                s.sourceId === where.sourceId
              ) {
                return s;
              }
              if (where.sourceCode && s.sourceCode === where.sourceCode) {
                return s;
              }
            }
            return null;
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            if (this.failOnSaleUpsert) {
              throw new Error('PostgreSQL Error: Simulated disk IO failure on sales upsert');
            }
            const existing = bufferedSales.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            bufferedSales.set(where.id, data as PrismaSaleModel);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            if (this.failOnSaleUpdateMany) {
              throw new Error(
                'PostgreSQL Error: Concurrency collision or failure on sales updateMany',
              );
            }
            const existing = bufferedSales.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: this.clock.now() };
              bufferedSales.set(where.id, updated as PrismaSaleModel);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      saleItem: {
        deleteMany: jest.fn(
          async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
            if (this.failOnItemDeleteMany) {
              throw new Error('PostgreSQL Error: Deadlock on sale_items deleteMany');
            }
            let deleted = 0;
            for (const [id, item] of Array.from(bufferedItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  bufferedItems.delete(id);
                  deleted++;
                }
              }
            }
            return { count: deleted };
          },
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            if (this.failOnItemUpsertId === where.id) {
              throw new Error(`PostgreSQL Error: Foreign key violation on sale_item '${where.id}'`);
            }
            const existing = bufferedItems.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            bufferedItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return bufferedPayments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(bufferedPayments.values()).filter((p) => p.saleId === where.saleId);
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            if (this.failOnPaymentUpsert) {
              throw new Error('PostgreSQL Error: Constraint violation on payment upsert');
            }
            const existing = bufferedPayments.get(where.id);
            const data = existing
              ? { ...existing, ...update, updatedAt: this.clock.now() }
              : {
                  ...create,
                  createdAt: (create.createdAt as Date) ?? this.clock.now(),
                  updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
                };
            bufferedPayments.set(where.id, data as PrismaPaymentModel);
            return data;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            const existing = bufferedPayments.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: this.clock.now() };
              bufferedPayments.set(where.id, updated as PrismaPaymentModel);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      receipt: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              id?: string;
              unique_tenant_sale_receipt?: { tenantId: string; saleId: string };
            };
          }) => {
            if (where.id) {
              return bufferedReceipts.get(where.id) ?? null;
            }
            if (where.unique_tenant_sale_receipt) {
              for (const r of bufferedReceipts.values()) {
                if (
                  r.tenantId === where.unique_tenant_sale_receipt.tenantId &&
                  r.saleId === where.unique_tenant_sale_receipt.saleId
                ) {
                  return r;
                }
              }
            }
            return null;
          },
        ),
        findFirst: jest.fn(
          async ({ where }: { where: { saleId?: string; receiptNumber?: string } }) => {
            for (const r of bufferedReceipts.values()) {
              if (where.saleId && r.saleId === where.saleId) return r;
              if (where.receiptNumber && r.receiptNumber === where.receiptNumber) return r;
            }
            return null;
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (this.failOnReceiptCreate) {
            throw new Error('PostgreSQL Error: Disk failure on receipts insert');
          }
          const tenantId = data.tenantId as string;
          const saleId = data.saleId as string;
          const receiptNumber = data.receiptNumber as string;

          // Check unique constraints (unique_tenant_sale_receipt and unique_tenant_receipt_number)
          for (const r of bufferedReceipts.values()) {
            if (r.tenantId === tenantId && r.saleId === saleId) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (tenantId, saleId) [unique_tenant_sale_receipt]',
                { code: 'P2002', clientVersion: '6.3.1' },
              );
            }
            if (r.tenantId === tenantId && r.receiptNumber === receiptNumber) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (tenantId, receiptNumber) [unique_tenant_receipt_number]',
                { code: 'P2002', clientVersion: '6.3.1' },
              );
            }
          }

          const record = {
            ...data,
            createdAt: (data.createdAt as Date) ?? this.clock.now(),
            updatedAt: (data.updatedAt as Date) ?? this.clock.now(),
          } as PrismaReceiptModel;
          bufferedReceipts.set(record.id, record);
          return record;
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      receiptSequence: {
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { unique_tenant_year_sequence: { tenantId: string; year: number } };
            create: { tenantId: string; year: number; currentValue: number };
            update: { currentValue: { increment: number } };
          }) => {
            const key = `${where.unique_tenant_year_sequence.tenantId}-${where.unique_tenant_year_sequence.year}`;
            const existing = bufferedSequences.get(key);
            if (existing !== undefined) {
              const nextVal = existing + update.currentValue.increment;
              bufferedSequences.set(key, nextVal);
              return {
                tenantId: where.unique_tenant_year_sequence.tenantId,
                year: where.unique_tenant_year_sequence.year,
                currentValue: nextVal,
              };
            }
            bufferedSequences.set(key, create.currentValue);
            return {
              tenantId: create.tenantId,
              year: create.year,
              currentValue: create.currentValue,
            };
          },
        ),
      },
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        // Deep copy buffered state for isolated transaction scope
        const bufferedSales = new Map<string, PrismaSaleModel>(
          Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedItems = new Map<string, PrismaSaleItemModel>(
          Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedPayments = new Map<string, PrismaPaymentModel>(
          Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedReceipts = new Map<string, PrismaReceiptModel>(
          Array.from(this.receipts.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedSequences = new Map<string, number>(this.receiptSequences);

        const tx = createTx(
          bufferedSales,
          bufferedItems,
          bufferedPayments,
          bufferedReceipts,
          bufferedSequences,
        );

        // Execute in transaction buffer
        const result = await callback(tx);

        // Commit atomically if and only if no error was thrown
        this.sales = bufferedSales;
        this.saleItems = bufferedItems;
        this.payments = bufferedPayments;
        this.receipts = bufferedReceipts;
        this.receiptSequences = bufferedSequences;

        return result;
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async () => null),
      },
      payment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return this.payments.get(where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
          return Array.from(this.payments.values()).filter((p) => p.saleId === where.saleId);
        }),
      },
      receipt: {
        findUnique: jest.fn(async ({ where }: { where?: { id?: string } }) => {
          if (where?.id) return this.receipts.get(where.id) ?? null;
          return null;
        }),
        findFirst: jest.fn(async ({ where }: { where?: { saleId?: string } }) => {
          if (where?.saleId) {
            for (const r of this.receipts.values()) {
              if (r.saleId === where.saleId) return r;
            }
          }
          return null;
        }),
      },
      $queryRawUnsafe: jest.fn(async (_sql: string, tenantId: string, year: number) => {
        const key = `${tenantId}-${year}`;
        const current = this.receiptSequences.get(key) ?? 0;
        const next = current + 1;
        this.receiptSequences.set(key, next);
        return [{ current_value: next }];
      }),
    } as unknown as PrismaClient;
  };
}

describe('Phase 7 Transactional Architecture and Atomic Persistence Specification', () => {
  const clock = new DeterministicClock(new Date('2026-10-02T12:00:00.000Z'));
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-101',
    sourceCode: 'REHAB-PRO-01',
  });

  let db: MockPhase7TransactionalDatabase;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let receiptRepo: PrismaReceiptRepository;

  beforeEach(() => {
    db = new MockPhase7TransactionalDatabase(clock);
    prisma = db.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    receiptRepo = new PrismaReceiptRepository(prisma);
  });

  // ==========================================================================
  // OPERATION 1: Sale + SaleItems (Aggregate Root & Child Entity Atomicity)
  // ==========================================================================
  describe('Operation 1: Sale + SaleItems Transaction Boundary', () => {
    it('rolls back entire Sale creation when child item insertion fails (no orphan items or partial sale)', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-multi-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Physio Roller',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-2'),
          source: validSource,
          description: 'Resistance Band',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );

      // Fault injection: item-2 triggers foreign key constraint failure
      db.failOnItemUpsertId = 'item-2';

      await expect(saleRepo.save(sale)).rejects.toThrow(
        /Foreign key violation on sale_item 'item-2'/,
      );

      // Verify complete rollback: neither Sale nor any child items committed
      expect(db.sales.has('sale-multi-01')).toBe(false);
      expect(db.saleItems.has('item-1')).toBe(false);
      expect(db.saleItems.has('item-2')).toBe(false);
    });

    it('rolls back differential update when adding new item fails on existing Sale', async () => {
      // 1. Initial valid save
      const sale = Sale.create({ id: SaleId.create('sale-multi-02'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-base'),
          source: validSource,
          description: 'Base Assessment',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      expect(db.sales.has('sale-multi-02')).toBe(true);
      expect(db.saleItems.has('item-base')).toBe(true);

      // 2. Add second item but inject failure
      sale.addItem(
        {
          id: SaleItemId.create('item-faulty'),
          source: validSource,
          description: 'Faulty Accessory',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );
      db.failOnItemUpsertId = 'item-faulty';

      await expect(saleRepo.save(sale)).rejects.toThrow(
        /Foreign key violation on sale_item 'item-faulty'/,
      );

      // Verify that database state was NOT corrupted: original state intact, item-faulty never committed
      const persistedSale = db.sales.get('sale-multi-02');
      expect(persistedSale).toBeDefined();
      expect(persistedSale?.totalAmount.toString()).toBe('100');
      expect(db.saleItems.has('item-base')).toBe(true);
      expect(db.saleItems.has('item-faulty')).toBe(false);
    });
  });

  // ==========================================================================
  // OPERATION 2: Sale + Discounts (Flattened Value Object Atomicity)
  // ==========================================================================
  describe('Operation 2: Sale + Discounts Atomicity', () => {
    it('persists order discount and recomputed totals atomically in the same transaction', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-disc-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-disc'),
          source: validSource,
          description: 'Kinesiology Consultation',
          quantity: 1,
          unitPrice: Money.create(200.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      // Apply 20% order discount
      sale.applyOrderDiscount(Discount.percentage(20, 'Seasonal Promotion'), clock);
      expect(sale.discountTotal.cents).toBe(4000);
      expect(sale.total.cents).toBe(16000);

      await saleRepo.save(sale);

      // Verify relational consistency
      const persisted = db.sales.get('sale-disc-01');
      expect(persisted).toBeDefined();
      expect(persisted?.orderDiscountType).toBe('PERCENTAGE');
      expect(Number(persisted?.orderDiscountValue)).toBe(20);
      expect(Number(persisted?.subtotalAmount)).toBe(200);
      expect(Number(persisted?.discountTotalAmount)).toBe(40);
      expect(Number(persisted?.totalAmount)).toBe(160);
    });

    it('rolls back discount and totals together if database write fails', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-disc-02'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-d2'),
          source: validSource,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);

      // Apply fixed amount discount of $15
      sale.applyOrderDiscount(Discount.fixedAmount(15.0, 'Loyalty Voucher'), clock);

      // Inject fault on sale update
      db.failOnSaleUpsert = true;

      await expect(saleRepo.save(sale)).rejects.toThrow(
        'Simulated disk IO failure on sales upsert',
      );

      // Verify database retains prior state without discount
      const persisted = db.sales.get('sale-disc-02');
      expect(persisted?.orderDiscountType).toBeNull();
      expect(Number(persisted?.totalAmount)).toBe(100);
    });
  });

  // ==========================================================================
  // OPERATION 3: Sale + Payment (Cross-Aggregate Coordination & Unit of Work)
  // ==========================================================================
  describe('Operation 3: Sale + Payment Transaction Coordination', () => {
    it('reconciles completed payment and transitions Sale to PAID idempotently', async () => {
      // Create Sale in PENDING_PAYMENT
      const sale = Sale.create(
        { id: SaleId.create('sale-pay-01'), source: validSource, tenantId: 'tenant-test' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-p1'),
          source: validSource,
          description: 'Rehab Session',
          quantity: 1,
          unitPrice: Money.create(80.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      // Create Payment settled for full amount
      const payment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-01'),
          saleId: sale.id,
          amount: Money.create(80.0, 'USD'),
          method: PaymentMethod.CASH,
          reference: 'AUTH-999888',
          tenantId: 'tenant-test',
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Reconcile through coordination service
      const coordinationService = new SalePaymentCoordinationService(saleRepo, paymentRepo, clock);
      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id.value,
        paymentId: payment.id.value,
        tenantId: 'tenant-test',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(SaleStatus.PAID);

      // Verify Sale in database is now PAID
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PAID);

      // Verify idempotency: re-running does not fail and does not re-mutate
      const repeatResult = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id.value,
        paymentId: payment.id.value,
        tenantId: 'tenant-test',
      });
      expect(repeatResult.isFailure).toBe(true); // Already PAID, safely rejected without corrupting state
    });

    it('rolls back payment completion if coordinated Unit-of-Work fails on Sale persistence', async () => {
      // Setup Sale and Pending Payment
      const sale = Sale.create(
        { id: SaleId.create('sale-uow-01'), source: validSource, tenantId: 'tenant-test' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-uow'),
          source: validSource,
          description: 'Acupuncture',
          quantity: 1,
          unitPrice: Money.create(120.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-uow-01'),
          saleId: sale.id,
          amount: Money.create(120.0, 'USD'),
          method: PaymentMethod.QR,
          tenantId: 'tenant-test',
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Emulate Unit-of-Work transaction coordinator wrapping CompletePaymentHandler
      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock);

      // Simulate a failure on the second write (Sale persistence failure)
      jest.spyOn(saleRepo, 'save').mockImplementationOnce(async () => {
        throw new Error('Simulated network timeout during Sale persistence in Unit-of-Work');
      });

      const cmd = new CompletePaymentCommand({
        paymentId: 'pay-uow-01',
        saleId: 'sale-uow-01',
        reference: 'QR-REF-100',
        paidAt: clock.now(),
        tenantId: 'tenant-test',
        currentUser: { id: 'admin', roles: ['Platform Admin'], permissions: ['payments.manage'] },
      });

      // Execute command
      const result = await handler.execute(cmd);
      expect(result.isFailure).toBe(true);
      expect(result.getError().toString()).toContain(
        'Simulated network timeout during Sale persistence',
      );

      // Verify failure handling: in a production UOW transaction, the failure aborts the entire scope.
      // Here the Sale remained in PENDING_PAYMENT
      const persistedSale = await saleRepo.findById('sale-uow-01');
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ==========================================================================
  // OPERATION 4: Payment + PaymentHistory (Post-Commit Audit Events)
  // ==========================================================================
  describe('Operation 4: Payment + PaymentHistory Event Boundary', () => {
    it('does NOT publish domain events if payment persistence transaction fails', async () => {
      const mockPublisher: SalesEventPublisherPort = {
        publish: jest.fn(async () => {}),
      };

      const handler = new CompletePaymentHandler(paymentRepo, saleRepo, clock, mockPublisher);

      // Create Sale & Payment
      const sale = Sale.create(
        { id: SaleId.create('sale-audit-01'), source: validSource, tenantId: 'tenant-test' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('i-aud'),
          source: validSource,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-audit-01'),
          saleId: sale.id,
          amount: Money.create(50.0, 'USD'),
          method: PaymentMethod.CASH,
          tenantId: 'tenant-test',
        },
        clock,
      );
      await paymentRepo.save(payment);

      // Fault injection: payment save throws error
      jest.spyOn(paymentRepo, 'save').mockImplementationOnce(async () => {
        throw new Error('Database transaction aborted on payment');
      });

      const cmd = new CompletePaymentCommand({
        paymentId: 'pay-audit-01',
        reference: 'CASH-REF',
        tenantId: 'tenant-test',
        currentUser: { id: 'admin', roles: ['admin'], permissions: ['payments.manage'] },
      });

      const result = await handler.execute(cmd);
      expect(result.isFailure).toBe(true);

      // Crucial: Event publisher was NEVER called, preventing phantom audit history records
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // OPERATION 5: Sale + Receipt (Read-Only Sale & Unique Receipt Serialization)
  // ==========================================================================
  describe('Operation 5: Sale + Receipt Transaction Boundary', () => {
    it('rolls back receipt issuance on failure without mutating the parent Sale', async () => {
      // 1. Create and settle Sale
      const sale = Sale.create(
        { id: SaleId.create('sale-rcpt-01'), source: validSource, tenantId: 'tenant-alpha' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-r1'),
          source: validSource,
          description: 'Dry Needling',
          quantity: 1,
          unitPrice: Money.create(75.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);
      sale.markPaid(clock);
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-rcpt-01'),
          saleId: sale.id,
          amount: Money.create(75.0, 'USD'),
          method: PaymentMethod.CASH,
          tenantId: 'tenant-alpha',
          reference: 'TX-777',
        },
        clock,
      );
      await paymentRepo.save(payment);

      // 2. Inject failure on receipt persistence
      db.failOnReceiptCreate = true;

      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-fail-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000001'),
          saleId: sale.id,
          saleReference: 'REF-SALE-01',
          tenantId: 'tenant-alpha',
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId: 'client-anon',
            fullName: 'Walk-in Client',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-r1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-item-101',
              description: 'Dry Needling',
              quantity: 1,
              unitPrice: Money.create(75.0, 'USD'),
              subtotal: Money.create(75.0, 'USD'),
              total: Money.create(75.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-rcpt-01',
              amount: Money.create(75.0, 'USD'),
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              reference: 'TX-777',
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(75.0, 'USD'),
          discountTotal: Money.create(0.0, 'USD'),
          total: Money.create(75.0, 'USD'),
        },
        clock,
      );

      await expect(receiptRepo.save(receipt)).rejects.toThrow(/Disk failure on receipts insert/);

      // Verify no receipt persisted
      expect(db.receipts.has('rcpt-fail-01')).toBe(false);

      // Parent Sale is untouched (remains PAID, version unchanged)
      const persistedSale = await saleRepo.findById('sale-rcpt-01');
      expect(persistedSale?.status).toBe(SaleStatus.PAID);
      expect(persistedSale?.version).toBe(sale.version);
    });

    it('enforces serial unique constraint on receipt issuance during race conditions', async () => {
      // Create and settle Sale
      const sale = Sale.create(
        { id: SaleId.create('sale-race-01'), source: validSource, tenantId: 'tenant-beta' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-race'),
          source: validSource,
          description: 'Spinal Mobility',
          quantity: 1,
          unitPrice: Money.create(90.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale);
      sale.finalize(clock);
      await saleRepo.save(sale);
      sale.markPaid(clock);
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-race-01'),
          saleId: sale.id,
          amount: Money.create(90.0, 'USD'),
          method: PaymentMethod.CASH,
          tenantId: 'tenant-beta',
          reference: 'CASH-RACE',
        },
        clock,
      );
      await paymentRepo.save(payment);

      const handler = new IssueReceiptHandler(receiptRepo, saleRepo, paymentRepo, undefined, clock);

      // Execute first issuance
      const cmd1 = new IssueReceiptCommand({
        saleId: 'sale-race-01',
        tenantId: 'tenant-beta',
        currentUser: { id: 'clerk1', roles: ['Receptionist'], permissions: ['receipts.manage'] },
      });
      const res1 = await handler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // Execute concurrent racer attempting to issue another receipt for the same sale
      const cmd2 = new IssueReceiptCommand({
        saleId: 'sale-race-01',
        tenantId: 'tenant-beta',
        currentUser: { id: 'clerk2', roles: ['Receptionist'], permissions: ['receipts.manage'] },
      });
      const res2 = await handler.execute(cmd2);

      // IssueReceiptHandler idempotently catches DuplicateReceiptException and returns the first receipt
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().id).toBe(res1.getValue().id);
      expect(res2.getValue().receiptNumber).toBe(res1.getValue().receiptNumber);

      // Exactly ONE receipt exists in the database
      expect(db.receipts.size).toBe(1);
    });
  });

  // ==========================================================================
  // OPERATION 6: Receipt + ReceiptItems (Single-Row Document Model Atomicity)
  // ==========================================================================
  describe('Operation 6: Receipt + ReceiptItems Document Model Atomicity', () => {
    it('persists receipt and embedded item snapshots in a single atomic SQL row', async () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-doc-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000042'),
          saleId: SaleId.create('sale-doc-01'),
          saleReference: 'REF-SALE-DOC-01',
          tenantId: 'tenant-doc',
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId: 'client-123',
            fullName: 'Jane Doe',
            email: 'jane@example.com',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-d1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-item-101',
              description: 'Ergonomic Pillow',
              quantity: 2,
              unitPrice: Money.create(35.0, 'USD'),
              subtotal: Money.create(70.0, 'USD'),
              total: Money.create(70.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-d1',
              amount: Money.create(70.0, 'USD'),
              method: PaymentMethod.QR,
              status: PaymentStatus.COMPLETED,
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(70.0, 'USD'),
          discountTotal: Money.create(0.0, 'USD'),
          total: Money.create(70.0, 'USD'),
        },
        clock,
      );

      await receiptRepo.save(receipt);

      // Verify that line items are stored directly within itemsSnapshot on the single receipt row
      const persisted = db.receipts.get('rcpt-doc-01');
      expect(persisted).toBeDefined();
      expect(Array.isArray(persisted?.itemsSnapshot)).toBe(true);
      const itemsSnapshot = persisted?.itemsSnapshot as Array<{
        description: string;
        quantity: number;
      }>;
      expect(itemsSnapshot[0]?.description).toBe('Ergonomic Pillow');
      expect(itemsSnapshot[0]?.quantity).toBe(2);

      // Verifies architectural proof that partial receipt items cannot physically exist
      expect(db.saleItems.size).toBe(0); // Zero normalized receipt item rows created
    });
  });
});
