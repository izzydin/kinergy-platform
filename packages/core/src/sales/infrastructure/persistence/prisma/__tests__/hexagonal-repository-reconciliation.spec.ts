import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  Receipt as PrismaReceiptModel,
  PaymentStatus as PrismaPaymentStatus,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
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
import { PrismaMoneyMapper } from '../mappers/prisma-money.mapper';
import { PrismaPaymentMapper } from '../mappers/prisma-payment.mapper';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import { PrismaReceiptMapper } from '../mappers/prisma-receipt.mapper';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import {
  SaleOptimisticLockException,
  PaymentOptimisticLockException,
  ReceiptOptimisticLockException,
} from '../../../../domain/exceptions/optimistic-lock.exception';
import { Clock, SystemClock, DeterministicClock } from '../../../../domain/shared/clock';

/**
 * Mock database harness for verifying Hexagonal Repository Adapter contracts.
 */
class MockHexagonalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();
  public receipts = new Map<string, PrismaReceiptModel>();
  public receiptSequences = new Map<string, number>();

  constructor(public readonly clock: Clock = new SystemClock()) {}

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
        findUnique: jest.fn(async ({ where }: { where?: { id?: string } }) => {
          if (where?.id) return bufferedReceipts.get(where.id) ?? null;
          return null;
        }),
        findFirst: jest.fn(
          async ({ where }: { where?: { saleId?: string; receiptNumber?: string } }) => {
            for (const r of bufferedReceipts.values()) {
              if (where?.saleId && r.saleId === where.saleId) return r;
              if (where?.receiptNumber && r.receiptNumber === where.receiptNumber) return r;
            }
            return null;
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const record = {
            ...data,
            createdAt: (data.createdAt as Date) ?? this.clock.now(),
            updatedAt: (data.updatedAt as Date) ?? this.clock.now(),
          } as PrismaReceiptModel;
          bufferedReceipts.set(record.id, record);
          return record;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: Record<string, unknown>;
          }) => {
            const existing = bufferedReceipts.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: this.clock.now() };
              bufferedReceipts.set(where.id, updated as PrismaReceiptModel);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
      $queryRawUnsafe: jest.fn(async (_sql: string, tenantId: string, year: number) => {
        const key = `${tenantId}-${year}`;
        const current = bufferedSequences.get(key) ?? 0;
        const next = current + 1;
        bufferedSequences.set(key, next);
        return [{ current_value: next }];
      }),
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
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

        const result = await callback(tx);

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

describe('Hexagonal Architecture Repository Reconciliation & Persistence Verification', () => {
  const clock = new DeterministicClock(new Date('2026-10-02T12:00:00.000Z'));
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-500',
    sourceCode: 'REHAB-FOAM-01',
  });

  let db: MockHexagonalDatabase;
  let prisma: PrismaClient;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let receiptRepo: PrismaReceiptRepository;

  beforeEach(() => {
    db = new MockHexagonalDatabase(clock);
    prisma = db.createClient();
    saleRepo = new PrismaSaleRepository(prisma);
    paymentRepo = new PrismaPaymentRepository(prisma);
    receiptRepo = new PrismaReceiptRepository(prisma);
  });

  // ==========================================================================
  // 1. Hexagonal Boundary: Framework Independence & Port Purity
  // ==========================================================================
  describe('1. Hexagonal Port and Adapter Boundary Rules', () => {
    it('guarantees repository adapters implement pure ports and do not expose generic updates', () => {
      // Repositories must NOT expose generic update, updateMany, or partial column patchers
      expect((saleRepo as unknown as Record<string, unknown>).update).toBeUndefined();
      expect((saleRepo as unknown as Record<string, unknown>).updateStatus).toBeUndefined();
      expect((saleRepo as unknown as Record<string, unknown>).patchTotals).toBeUndefined();

      expect((paymentRepo as unknown as Record<string, unknown>).update).toBeUndefined();
      expect((paymentRepo as unknown as Record<string, unknown>).updateStatus).toBeUndefined();

      expect((receiptRepo as unknown as Record<string, unknown>).update).toBeUndefined();
      expect((receiptRepo as unknown as Record<string, unknown>).patchSnapshot).toBeUndefined();

      // Only authoritative aggregate save() methods exist
      expect(typeof saleRepo.save).toBe('function');
      expect(typeof paymentRepo.save).toBe('function');
      expect(typeof receiptRepo.save).toBe('function');
    });

    it('rejects persisting a detached SaleItem without parent saleId via mapper', () => {
      const detachedItem = SaleItem.create({
        id: SaleItemId.create('item-detached-1'),
        source: validSource,
        description: 'Detached Roller',
        quantity: 1,
        unitPrice: Money.create(30.0, 'USD'),
      });

      // Attempting to map to persistence without a parent saleId must throw
      expect(() => PrismaSaleItemMapper.toPersistence(detachedItem)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('rejects persisting a SaleItem assigned to a foreign parent saleId via mapper', () => {
      const itemWithSale = SaleItem.reconstitute({
        id: SaleItemId.create('item-cross-1'),
        saleId: SaleId.create('sale-original-id'),
        source: validSource,
        description: 'Cross Item',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        subtotal: Money.create(50.0, 'USD'),
        total: Money.create(50.0, 'USD'),
      });

      // Attempting to persist under a different parentSaleId must throw CROSS_SALE_PERSISTENCE_PROHIBITED
      expect(() =>
        PrismaSaleItemMapper.toPersistence(itemWithSale, 'sale-different-id', 'USD'),
      ).toThrow(/Cross-Sale persistence is strictly prohibited/);
    });
  });

  // ==========================================================================
  // 2. Decimal Mapping Determinism (Zero IEEE-754 Floating-Point Drift)
  // ==========================================================================
  describe('2. Deterministic Money & Decimal Mapping', () => {
    it('maps Money to Prisma.Decimal with exact fixed 2-decimal serialization', () => {
      const m1 = Money.create(19.99, 'USD');
      const d1 = PrismaMoneyMapper.toDecimal(m1);
      expect(d1 instanceof Prisma.Decimal).toBe(true);
      expect(d1.toFixed(2)).toBe('19.99');

      const mZero = Money.zero('USD');
      const dZero = PrismaMoneyMapper.toDecimal(mZero);
      expect(dZero.toFixed(2)).toBe('0.00');

      const mLarge = Money.create('1234567.89', 'USD');
      const dLarge = PrismaMoneyMapper.toDecimal(mLarge);
      expect(dLarge.toFixed(2)).toBe('1234567.89');
    });

    it('maps Prisma.Decimal to pure domain Money Value Object deterministically', () => {
      const decimal = new Prisma.Decimal('49.95');
      const money = PrismaMoneyMapper.toMoney(decimal, 'USD');

      expect(money instanceof Money).toBe(true);
      expect(money.cents).toBe(4995);
      expect(money.amount).toBe(49.95);
      expect(money.currency).toBe('USD');
    });
  });

  // ==========================================================================
  // 3. Enum & State Mapping Fidelity
  // ==========================================================================
  describe('3. Enum and Value Object Mapping Fidelity', () => {
    it('maps PaymentStatus bidirectionally between Domain COMPLETED and Prisma SETTLED', () => {
      // Domain COMPLETED -> Prisma SETTLED
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.COMPLETED)).toBe(
        PrismaPaymentStatus.SETTLED,
      );

      // Prisma SETTLED -> Domain COMPLETED
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.SETTLED)).toBe(
        PaymentStatus.COMPLETED,
      );

      // PENDING, FAILED, CANCELLED match 1-to-1
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.PENDING)).toBe(
        PrismaPaymentStatus.PENDING,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.PENDING)).toBe(
        PaymentStatus.PENDING,
      );

      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.FAILED)).toBe(
        PrismaPaymentStatus.FAILED,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.FAILED)).toBe(
        PaymentStatus.FAILED,
      );

      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.CANCELLED)).toBe(
        PrismaPaymentStatus.CANCELLED,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.CANCELLED)).toBe(
        PaymentStatus.CANCELLED,
      );
    });

    it('maps SaleSourceType and SourceReference correctly via PrismaSaleMapper', () => {
      // 1. Clinical treatment session source
      const clinicalSource = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess-888');
      const saleClinical = Sale.create(
        { id: SaleId.create('sale-clin-01'), source: clinicalSource, tenantId: 't-1' },
        clock,
      );
      const persistence = PrismaSaleMapper.toPersistence(saleClinical);
      expect(persistence.sale.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(persistence.sale.sourceId).toBe('sess-888');

      // 2. Reconstitute back to domain
      const rawSale: PrismaSaleModel = {
        ...persistence.sale,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      } as PrismaSaleModel;
      const reconstituted = PrismaSaleMapper.toDomain(rawSale);
      expect(reconstituted.source.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(reconstituted.source.sourceId).toBe('sess-888');
    });
  });

  // ==========================================================================
  // 4. Aggregate Behavior Protection & Terminal Immutability
  // ==========================================================================
  describe('4. Aggregate Invariant Protection at Persistence Layer', () => {
    it('prevents modifying a CANCELLED Sale in persistence', async () => {
      // 1. Create and cancel Sale
      const sale = Sale.create(
        { id: SaleId.create('sale-term-01'), source: validSource, tenantId: 't-term' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-term'),
          source: validSource,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale); // Save v1
      sale.finalize(clock);
      await saleRepo.save(sale); // Save v2
      sale.cancel('Client request', clock);
      await saleRepo.save(sale); // Save v3 (CANCELLED)

      // 2. Artificially construct a mutation attempt on the cancelled sale
      const cancelledPersisted = await saleRepo.findById('sale-term-01');
      expect(cancelledPersisted?.status).toBe(SaleStatus.CANCELLED);

      // Attempting to save any mutation to a CANCELLED record must throw TERMINAL_SALE_IMMUTABLE
      const tamperedSale = Sale.reconstitute({
        id: SaleId.create('sale-term-01'),
        tenantId: 't-term',
        source: validSource,
        status: SaleStatus.CANCELLED,
        cancellationReason: 'Client request',
        cancelledAt: clock.now(),
        currency: 'USD',
        items: [],
        subtotal: Money.zero('USD'),
        discountTotal: Money.zero('USD'),
        total: Money.zero('USD'),
        version: 3,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      await expect(saleRepo.save(tamperedSale)).rejects.toThrow(
        /Cannot update Sale 'sale-term-01': Sale is already in terminal CANCELLED status/,
      );
    });

    it('rejects status regression from PENDING_PAYMENT back to DRAFT', async () => {
      // 1. Create and finalize Sale
      const sale = Sale.create(
        { id: SaleId.create('sale-reg-01'), source: validSource, tenantId: 't-reg' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-reg'),
          source: validSource,
          description: 'Assessment',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale); // Save v1
      sale.finalize(clock);
      await saleRepo.save(sale); // Save v2 (PENDING_PAYMENT)

      // 2. Construct regression attempt back to DRAFT with stale version 1
      const regressedSale = Sale.reconstitute({
        id: SaleId.create('sale-reg-01'),
        tenantId: 't-reg',
        source: validSource,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        items: [],
        subtotal: Money.zero('USD'),
        discountTotal: Money.zero('USD'),
        total: Money.zero('USD'),
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      await expect(saleRepo.save(regressedSale)).rejects.toThrow(SaleOptimisticLockException);
    });

    it('enforces Optimistic Concurrency Control (OCC) against version collisions', async () => {
      const sale = Sale.create(
        { id: SaleId.create('sale-occ-01'), source: validSource, tenantId: 't-occ' },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-occ'),
          source: validSource,
          description: 'Rehab Roller',
          quantity: 1,
          unitPrice: Money.create(45.0, 'USD'),
        },
        clock,
      );
      await saleRepo.save(sale); // v1
      sale.finalize(clock);
      await saleRepo.save(sale); // v2

      // Simulate a concurrent modification where an actor tries to save version 2 again
      const staleConcurrentSale = Sale.reconstitute({
        id: SaleId.create('sale-occ-01'),
        tenantId: 't-occ',
        source: validSource,
        status: SaleStatus.PENDING_PAYMENT,
        currency: 'USD',
        items: [...sale.items],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: 2, // version in DB is already 2; priorVersion 1 will fail updateMany
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      await expect(saleRepo.save(staleConcurrentSale)).rejects.toThrow(SaleOptimisticLockException);
    });

    it('enforces Optimistic Concurrency Control on Payment updates', async () => {
      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-occ-01'),
          saleId: SaleId.create('sale-occ-01'),
          amount: Money.create(45.0, 'USD'),
          method: PaymentMethod.CASH,
          tenantId: 't-occ',
        },
        clock,
      );
      await paymentRepo.save(payment); // v1

      payment.complete({ reference: 'REF-OCC-1', paidAt: clock.now(), clock });
      await paymentRepo.save(payment); // v2

      // Simulate concurrent attempt saving with stale version 2
      const stalePayment = Payment.reconstitute({
        id: PaymentId.create('pay-occ-01'),
        saleId: SaleId.create('sale-occ-01'),
        tenantId: 't-occ',
        amount: Money.create(45.0, 'USD'),
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: clock.now(),
        createdAt: clock.now(),
        updatedAt: clock.now(),
        version: 2, // Prior version 1 will find 0 rows because DB version is already 2
      });

      await expect(paymentRepo.save(stalePayment)).rejects.toThrow(PaymentOptimisticLockException);
    });

    it('enforces Optimistic Concurrency Control on Receipt reprints', async () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-occ-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000099'),
          saleId: SaleId.create('sale-occ-01'),
          saleReference: 'REF-OCC-01',
          tenantId: 't-occ',
          clientSnapshot: ReceiptClientSnapshot.create({ clientId: 'c-1', fullName: 'Alice' }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-1',
              description: 'Item 1',
              quantity: 1,
              unitPrice: Money.create(45.0, 'USD'),
              subtotal: Money.create(45.0, 'USD'),
              total: Money.create(45.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-1',
              amount: Money.create(45.0, 'USD'),
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(45.0, 'USD'),
          total: Money.create(45.0, 'USD'),
        },
        clock,
      );
      await receiptRepo.save(receipt); // v1

      receipt.recordReprint(clock);
      await receiptRepo.save(receipt); // v2

      // Stale reprint mutation with old version
      const staleReceipt = Receipt.reconstitute({
        id: ReceiptId.create('rcpt-occ-01'),
        receiptNumber: ReceiptNumber.create('REC-2026-000099'),
        saleId: SaleId.create('sale-occ-01'),
        saleReference: 'REF-OCC-01',
        tenantId: 't-occ',
        clientSnapshot: receipt.clientSnapshot,
        items: [...receipt.items],
        payments: [...receipt.payments],
        subtotal: receipt.subtotal,
        discountTotal: receipt.discountTotal,
        total: receipt.total,
        status: receipt.status,
        reprintCount: 1,
        lastReprintedAt: clock.now(),
        issuedAt: receipt.issuedAt,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
        version: 2, // Prior version 1 will find 0 rows because DB version is already 2
      });

      await expect(receiptRepo.save(staleReceipt)).rejects.toThrow(ReceiptOptimisticLockException);
    });
  });

  // ==========================================================================
  // 5. Embedded Document Snapshot Immutability (Receipt + Items)
  // ==========================================================================
  describe('5. Receipt Document Model & Snapshot Fidelity', () => {
    it('preserves complete point-in-time snapshots without normalized child table dependencies', async () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-snap-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000500'),
          saleId: SaleId.create('sale-snap-01'),
          saleReference: 'ORD-SNAP-500',
          tenantId: 't-snap',
          clientSnapshot: ReceiptClientSnapshot.create({
            clientId: 'client-500',
            fullName: 'Marcus Aurelius',
            email: 'marcus@philosophy.org',
          }),
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-snap-1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-snap-1',
              description: 'Meditations Foam Roller',
              quantity: 1,
              unitPrice: Money.create(60.0, 'USD'),
              subtotal: Money.create(60.0, 'USD'),
              total: Money.create(60.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-snap-1',
              amount: Money.create(60.0, 'USD'),
              method: PaymentMethod.QR,
              status: PaymentStatus.COMPLETED,
              reference: 'QR-SNAP-999',
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(60.0, 'USD'),
          total: Money.create(60.0, 'USD'),
        },
        clock,
      );

      await receiptRepo.save(receipt);

      const retrieved = await receiptRepo.findById('rcpt-snap-01');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.receiptNumber.value).toBe('REC-2026-000500');
      expect(retrieved?.clientSnapshot?.fullName).toBe('Marcus Aurelius');
      expect(retrieved?.clientSnapshot?.email).toBe('marcus@philosophy.org');
      expect(retrieved?.items.length).toBe(1);
      expect(retrieved?.items[0]?.description).toBe('Meditations Foam Roller');
      expect(retrieved?.payments.length).toBe(1);
      expect(retrieved?.payments[0]?.reference).toBe('QR-SNAP-999');
    });

    it('serializes input json values deterministically in PrismaReceiptMapper', () => {
      const receipt = Receipt.create(
        {
          id: ReceiptId.create('rcpt-map-01'),
          receiptNumber: ReceiptNumber.create('REC-2026-000501'),
          saleId: SaleId.create('sale-map-01'),
          saleReference: 'ORD-MAP-01',
          tenantId: 't-map',
          clientSnapshot: null,
          items: [
            ReceiptItemSnapshot.create({
              itemId: 'item-map-1',
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-map-1',
              description: 'Standard Item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'USD'),
              subtotal: Money.create(10.0, 'USD'),
              total: Money.create(10.0, 'USD'),
            }),
          ],
          payments: [
            ReceiptPaymentSnapshot.create({
              paymentId: 'pay-map-1',
              amount: Money.create(10.0, 'USD'),
              method: PaymentMethod.CASH,
              status: PaymentStatus.COMPLETED,
              paidAt: clock.now(),
            }),
          ],
          subtotal: Money.create(10.0, 'USD'),
          total: Money.create(10.0, 'USD'),
        },
        clock,
      );

      const persistence = PrismaReceiptMapper.toPersistence(receipt);
      expect(persistence.clientSnapshot).toBe(Prisma.DbNull);
      expect(persistence.subtotalAmount.toFixed(2)).toBe('10.00');
      expect(persistence.totalAmount.toFixed(2)).toBe('10.00');
    });
  });
});
