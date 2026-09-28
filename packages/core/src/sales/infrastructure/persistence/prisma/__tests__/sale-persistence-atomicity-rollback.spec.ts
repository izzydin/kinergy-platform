import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { Discount } from '../../../../domain/value-objects/discount.vo';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Clock } from '../../../../domain/shared/clock';

class TestClock implements Clock {
  constructor(private readonly currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

/**
 * Stateful transactional test harness emulating PostgreSQL / Prisma ACID transactions.
 * Mirrors true rollback semantics: any unhandled error inside $transaction discards all staged writes.
 */
class MockTransactionalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();

  // Failure hooks to simulate database faults at exact stages of the transaction
  public failOnSaleUpsert = false;
  public failOnSaleUpdateMany = false;
  public failOnItemUpsertId: string | null = null;
  public failOnItemDeleteMany = false;

  public createClient = (): PrismaClient => {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return bufferedSales.get(where.id) ?? null;
        }),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              sourceType?: string;
              sourceId?: string;
              sourceCode?: string;
              NOT?: { id: string };
            };
          }) => {
            for (const s of bufferedSales.values()) {
              if (where.NOT && s.id === where.NOT.id) continue;
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
              throw new Error('PostgreSQL Error: Disk I/O or Constraint Failure on sales upsert');
            }
            const existing = bufferedSales.get(where.id);
            const data = existing
              ? { ...existing, ...update }
              : { ...create, createdAt: new Date(), updatedAt: new Date() };
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
              throw new Error('PostgreSQL Error: Write conflict on sales updateMany');
            }
            const existing = bufferedSales.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = { ...existing, ...data, updatedAt: new Date() };
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
              throw new Error('PostgreSQL Error: Lock timeout on sale_items deleteMany');
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
              ? { ...existing, ...update }
              : { ...create, createdAt: new Date(), updatedAt: new Date() };
            bufferedItems.set(where.id, data as PrismaSaleItemModel);
            return data;
          },
        ),
      },
    });

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        // 1. Snapshot current DB state into transactional isolation buffer
        const bufferedSales = new Map<string, PrismaSaleModel>(
          Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedItems = new Map<string, PrismaSaleItemModel>(
          Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
        );

        const tx = createTx(bufferedSales, bufferedItems);

        // 2. Execute transactional commands in isolated buffer
        const result = await callback(tx);

        // 3. Atomically commit buffer to master state upon success
        this.sales = bufferedSales;
        this.saleItems = bufferedItems;

        return result;
      }),
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = this.sales.get(where.id);
          if (!s) return null;
          const items = Array.from(this.saleItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
      },
    } as unknown as PrismaClient;
  };
}

describe('Sale Persistence Transactional Atomicity & Rollback Guarantees', () => {
  const clock = new TestClock(new Date('2026-09-28T12:00:00.000Z'));

  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SKU-REHAB-01',
  });

  let db: MockTransactionalDatabase;
  let prisma: PrismaClient;
  let repo: PrismaSaleRepository;

  beforeEach(() => {
    db = new MockTransactionalDatabase();
    prisma = db.createClient();
    repo = new PrismaSaleRepository(prisma);
  });

  // ==========================================================================
  // 1. Creating Sale — Complete Rollback on Partial Item Failure
  // ==========================================================================
  describe('1. Creating Sale Atomicity', () => {
    it('aborts and rolls back entire Sale creation if child item persistence fails', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-create-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-2'),
          source: validSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      // Simulate failure on second item insertion
      db.failOnItemUpsertId = 'item-2';

      await expect(repo.save(sale)).rejects.toThrow(/Foreign key violation on sale_item 'item-2'/);

      // Verify PostgreSQL transaction rollback: NO partial records exist in master tables
      expect(db.sales.has('sale-create-01')).toBe(false);
      expect(db.saleItems.has('item-1')).toBe(false);
      expect(db.saleItems.has('item-2')).toBe(false);
    });

    it('persists all records atomically when creation succeeds', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-create-02'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      await repo.save(sale);

      expect(db.sales.has('sale-create-02')).toBe(true);
      expect(db.saleItems.has('item-1')).toBe(true);
      expect(db.sales.get('sale-create-02')?.totalAmount).toEqual(new Prisma.Decimal('50.00'));
    });
  });

  // ==========================================================================
  // 2. Adding an Item — Totals and Item Rollback Together
  // ==========================================================================
  describe('2. Adding an Item Atomicity', () => {
    it('rolls back updated totals if newly added item fails to persist', async () => {
      // Seed existing Sale with Item 1 (Total: $50.00)
      const sale = Sale.create(
        { id: SaleId.create('sale-add-item-01'), source: validSource },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(db.sales.get('sale-add-item-01')?.totalAmount).toEqual(new Prisma.Decimal('50.00'));
      expect(db.saleItems.size).toBe(1);

      // Now add Item 2 in memory ($30.00 -> New Total: $80.00)
      sale.addItem(
        {
          id: SaleItemId.create('item-2'),
          source: validSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );
      expect(sale.total.amount).toBe(80.0);

      // Simulate failure when persisting Item 2
      db.failOnItemUpsertId = 'item-2';

      await expect(repo.save(sale)).rejects.toThrow(/Foreign key violation on sale_item 'item-2'/);

      // Verify that database state was NOT modified: total remains $50.00, only Item 1 exists
      const persistedSale = db.sales.get('sale-add-item-01')!;
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('50.00'));
      expect(persistedSale.subtotalAmount).toEqual(new Prisma.Decimal('50.00'));
      expect(db.saleItems.has('item-1')).toBe(true);
      expect(db.saleItems.has('item-2')).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Removing an Item — Rollback on Deletion Failure
  // ==========================================================================
  describe('3. Removing an Item Atomicity', () => {
    it('rolls back recalculated totals if orphan item deletion fails', async () => {
      // Seed existing Sale with Item 1 ($50.00) and Item 2 ($30.00), Total $80.00
      const sale = Sale.create(
        { id: SaleId.create('sale-rm-item-01'), source: validSource },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-2'),
          source: validSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(db.sales.get('sale-rm-item-01')?.totalAmount).toEqual(new Prisma.Decimal('80.00'));
      expect(db.saleItems.size).toBe(2);

      // Remove Item 2 in memory (New Total: $50.00)
      sale.removeItem('item-2', clock);
      expect(sale.total.amount).toBe(50.0);

      // Simulate failure during deleteMany
      db.failOnItemDeleteMany = true;

      await expect(repo.save(sale)).rejects.toThrow(/Lock timeout on sale_items deleteMany/);

      // Verify database rollback: total remains $80.00, both items remain in DB
      const persistedSale = db.sales.get('sale-rm-item-01')!;
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('80.00'));
      expect(db.saleItems.has('item-1')).toBe(true);
      expect(db.saleItems.has('item-2')).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Applying Discount — Totals and Discount Persisted Atomically
  // ==========================================================================
  describe('4. Applying Discount Atomicity', () => {
    it('does not mutate financial totals independently if discount persistence fails', async () => {
      // Seed existing Sale: Item 1 = $100.00, Total = $100.00
      const sale = Sale.create({ id: SaleId.create('sale-disc-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(db.sales.get('sale-disc-01')?.totalAmount).toEqual(new Prisma.Decimal('100.00'));
      expect(db.sales.get('sale-disc-01')?.orderDiscountType).toBeNull();

      // Apply $20 fixed discount in memory -> New Total: $80.00
      sale.applyDiscount(Discount.fixed(20.0, 'Loyalty Voucher'), clock);
      expect(sale.total.amount).toBe(80.0);
      expect(sale.discountTotal.amount).toBe(20.0);

      // Simulate failure during child items update
      db.failOnItemUpsertId = 'item-1';

      await expect(repo.save(sale)).rejects.toThrow(/Foreign key violation on sale_item 'item-1'/);

      // Verify database rollback: discount fields and totals are NOT partially persisted
      const persistedSale = db.sales.get('sale-disc-01')!;
      expect(persistedSale.totalAmount).toEqual(new Prisma.Decimal('100.00'));
      expect(persistedSale.discountTotalAmount).toEqual(new Prisma.Decimal('0.00'));
      expect(persistedSale.orderDiscountType).toBeNull();
      expect(persistedSale.orderDiscountValue).toBeNull();
    });
  });

  // ==========================================================================
  // 5. Changing Lifecycle State (Finalize) — Rollback on Concurrency Collision
  // ==========================================================================
  describe('5. Finalizing Sale Atomicity', () => {
    it('does not leave Sale partially in PENDING_PAYMENT if optimistic lock fails', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-fin-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(db.sales.get('sale-fin-01')?.status).toBe(SaleStatus.DRAFT);
      expect(db.sales.get('sale-fin-01')?.version).toBe(1);

      // Finalize advances aggregate to PENDING_PAYMENT at Version 2
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.version).toBe(2);

      // Simulate a concurrent writer having bumped the version in DB from 1 to 2
      const rawInDb = db.sales.get('sale-fin-01')!;
      rawInDb.version = 2; // conflict!

      await expect(repo.save(sale)).rejects.toThrow(SaleOptimisticLockException);

      // Verify that database record was not corrupted
      expect(db.sales.get('sale-fin-01')?.version).toBe(2);
      expect(db.sales.get('sale-fin-01')?.status).toBe(SaleStatus.DRAFT);
    });
  });

  // ==========================================================================
  // 6. Marking Sale PAID — Rollback on Failure
  // ==========================================================================
  describe('6. Marking Sale PAID Atomicity', () => {
    it('rolls back PAID status transition if persistence transaction encounters failure', async () => {
      // Prepare finalized Sale in PENDING_PAYMENT status at Version 2
      const sale = Sale.create({ id: SaleId.create('sale-paid-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale); // Version 1 (DRAFT)

      sale.finalize(clock); // Version 2 (PENDING_PAYMENT)
      await repo.save(sale);

      expect(db.sales.get('sale-paid-01')?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(db.sales.get('sale-paid-01')?.version).toBe(2);

      // Transition to PAID (Version 3)
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
      expect(sale.version).toBe(3);

      // Simulate failure during item synchronization
      db.failOnItemUpsertId = 'item-1';

      await expect(repo.save(sale)).rejects.toThrow(/Foreign key violation on sale_item 'item-1'/);

      // Verify database rollback: status remains PENDING_PAYMENT, version remains 2
      const persistedSale = db.sales.get('sale-paid-01')!;
      expect(persistedSale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(persistedSale.version).toBe(2);
    });
  });

  // ==========================================================================
  // 7. Cancelling Sale — Rollback on Failure
  // ==========================================================================
  describe('7. Cancelling Sale Atomicity', () => {
    it('rolls back CANCELLED transition and reason if persistence transaction fails', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-cancel-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(60.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale); // Version 1 (DRAFT)

      sale.finalize(clock); // Version 2 (PENDING_PAYMENT)
      await repo.save(sale);

      expect(db.sales.get('sale-cancel-01')?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(db.sales.get('sale-cancel-01')?.cancellationReason).toBeNull();
      expect(db.sales.get('sale-cancel-01')?.cancelledAt).toBeNull();

      // Cancel in domain
      sale.cancel('Customer declined treatment', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.version).toBe(3);

      // Simulate database update failure
      db.failOnSaleUpdateMany = true;

      await expect(repo.save(sale)).rejects.toThrow(/Write conflict on sales updateMany/);

      // Verify database rollback: status remains PENDING_PAYMENT, cancellation fields remain null
      const persistedSale = db.sales.get('sale-cancel-01')!;
      expect(persistedSale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(persistedSale.version).toBe(2);
      expect(persistedSale.cancellationReason).toBeNull();
      expect(persistedSale.cancelledAt).toBeNull();
    });
  });

  // ==========================================================================
  // 8. Architectural Purity — Pure Domain Isolation from Prisma & Transactions
  // ==========================================================================
  describe('8. Pure Domain Isolation from Prisma Transactions', () => {
    it('guarantees that Sale aggregate and value objects have no Prisma/database transaction coupling', () => {
      const sale = Sale.create({ source: validSource }, clock);

      // Assert that pure domain entities do not expose transaction methods
      const domainAny = sale as unknown as Record<string, unknown>;
      expect(domainAny.$transaction).toBeUndefined();
      expect(domainAny.commit).toBeUndefined();
      expect(domainAny.rollback).toBeUndefined();
      expect(domainAny.prisma).toBeUndefined();
      expect(domainAny.tx).toBeUndefined();

      // Assert that transaction orchestration belongs strictly to PrismaSaleRepository
      expect(typeof repo.save).toBe('function');
    });
  });
});
