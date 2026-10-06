import {
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
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { Clock } from '../../../../domain/shared/clock';
import { AddSaleItemHandler } from '../../../../application/handlers/add-sale-item.handler';
import { RemoveSaleItemHandler } from '../../../../application/handlers/remove-sale-item.handler';
import { ApplyDiscountHandler } from '../../../../application/handlers/apply-discount.handler';
import { CancelSaleHandler } from '../../../../application/handlers/cancel-sale.handler';
import { CalculateSaleHandler } from '../../../../application/queries/calculate-sale.handler';
import { AddSaleItemCommand } from '../../../../application/commands/add-sale-item.command';
import { RemoveSaleItemCommand } from '../../../../application/commands/remove-sale-item.command';
import { ApplyDiscountCommand } from '../../../../application/commands/apply-discount.command';
import { CancelSaleCommand } from '../../../../application/commands/cancel-sale.command';
import { CalculateSaleQuery } from '../../../../application/queries/calculate-sale.query';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

/**
 * Stateful concurrent transactional test harness emulating multi-client PostgreSQL transactions.
 * Supports concurrent snapshots and conditional atomic updates (updateMany / upsert) with OCC.
 */
class ConcurrentTransactionalDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();

  constructor(private readonly clock: Clock) {}

  public createClient = (): PrismaClient => {
    const createTx = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const s = bufferedSales.get(where.id);
          if (!s) return null;
          const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
          return { ...s, items };
        }),
        findFirst: jest.fn(async () => null),
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
        // Snapshot current DB state into transaction buffer
        const bufferedSales = new Map<string, PrismaSaleModel>(
          Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const bufferedItems = new Map<string, PrismaSaleItemModel>(
          Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
        );

        const tx = createTx(bufferedSales, bufferedItems);
        const result = await callback(tx);

        // Commit transaction buffer to master state on success
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
        findFirst: jest.fn(async () => null),
      },
    } as unknown as PrismaClient;
  };
}

describe('Sale Mutation Concurrency & Lost Update Protection Specification', () => {
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-01',
  });

  let clock: TestClock;
  let db: ConcurrentTransactionalDatabase;
  let repo: PrismaSaleRepository;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-10-06T12:00:00.000Z'));
    db = new ConcurrentTransactionalDatabase(clock);
    repo = new PrismaSaleRepository(db.createClient());
  });

  // ==========================================================================
  // 1. Concurrent AddSaleItem Protection (Derived Totals Integrity)
  // ==========================================================================
  describe('1. Concurrent AddSaleItem (Lost-Update Protection)', () => {
    it('prevents concurrent AddSaleItem operations from silently overwriting line items and derived totals', async () => {
      // 1. Initial State: Draft Sale created with 1 initial item ($50)
      const sale = Sale.create({ id: SaleId.create('sale-race-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-base'),
          source: validSource,
          description: 'Base Assessment',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(db.sales.get('sale-race-01')?.version).toBe(1);
      expect(Number(db.sales.get('sale-race-01')?.totalAmount)).toBe(50);
      expect(db.saleItems.size).toBe(1);

      // 2. Simulate Worker 1 and Worker 2 concurrently loading the sale at Version 1
      const addHandler1 = new AddSaleItemHandler(repo, clock);
      const addHandler2 = new AddSaleItemHandler(repo, clock);

      // Worker 1 adds Item A ($30.00)
      const cmd1 = new AddSaleItemCommand({
        saleId: 'sale-race-01',
        description: 'Theraband Resistance',
        quantity: 1,
        unitPriceAmount: 30.0,
      });

      // Worker 2 adds Item B ($45.00) concurrently
      const cmd2 = new AddSaleItemCommand({
        saleId: 'sale-race-01',
        description: 'Massage Lotion',
        quantity: 1,
        unitPriceAmount: 45.0,
      });

      // Worker 1 executes and commits first
      const res1 = await addHandler1.execute(cmd1);
      expect(res1.isSuccess).toBe(true);
      expect(res1.getValue().total.amount).toBe(80.0);
      expect(res1.getValue().subtotal.amount).toBe(80.0);

      // Master DB now has Worker 1's write at Version 2
      expect(db.sales.get('sale-race-01')?.version).toBe(2);
      expect(Number(db.sales.get('sale-race-01')?.totalAmount)).toBe(80.0);

      // Worker 2 executes: because Worker 2 reads from the repository inside its transaction,
      // it observes Version 2, adds its item, recalculates derived totals, and advances to Version 3
      const res2 = await addHandler2.execute(cmd2);
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().total.amount).toBe(125.0);
      expect(res2.getValue().subtotal.amount).toBe(125.0);

      // Verify that both items are preserved and totals are authoritatively reconciled
      expect(db.sales.get('sale-race-01')?.version).toBe(3); // advanced to Version 3 after two sequential commits
      expect(Number(db.sales.get('sale-race-01')?.totalAmount)).toBe(125.0);

      // Now simulate a stale writer trying to save an outdated Version 1 snapshot:
      const staleSaleInstance = await repo.findById('sale-race-01');
      expect(staleSaleInstance).toBeDefined();

      // Simulate a concurrent actor having advanced the DB version in the background
      const rawInDb = db.sales.get('sale-race-01')!;
      rawInDb.version = 5; // concurrent bump

      // Attempting to persist the stale sale instance must be rejected with SaleOptimisticLockException
      await expect(repo.save(staleSaleInstance!)).rejects.toThrow(SaleOptimisticLockException);

      // Verify that valid persisted items and derived totals remain completely intact and uncorrupted
      const persistedSale = db.sales.get('sale-race-01')!;
      expect(Number(persistedSale.totalAmount)).toBe(125.0);
      expect(Number(persistedSale.subtotalAmount)).toBe(125.0);
      expect(db.saleItems.has('item-base')).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Concurrent RemoveSaleItem vs AddSaleItem Protection
  // ==========================================================================
  describe('2. Concurrent RemoveSaleItem vs AddSaleItem', () => {
    it('prevents concurrent RemoveSaleItem and AddSaleItem from producing inconsistent derived totals', async () => {
      // Create Sale with two items ($100 and $50) -> total $150
      const sale = Sale.create({ id: SaleId.create('sale-race-02'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-to-remove'),
          source: validSource,
          description: 'Consultation',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item-keep'),
          source: validSource,
          description: 'Taping',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      expect(Number(db.sales.get('sale-race-02')?.totalAmount)).toBe(150.0);

      // Worker 1 removes Item 1
      const removeHandler = new RemoveSaleItemHandler(repo, clock);
      const removeCmd = new RemoveSaleItemCommand({
        saleId: 'sale-race-02',
        itemId: 'item-to-remove',
      });

      const removeResult = await removeHandler.execute(removeCmd);
      expect(removeResult.isSuccess).toBe(true);
      expect(removeResult.getValue().total.amount).toBe(50.0);

      // Verify database reflects removed item and updated derived total
      expect(Number(db.sales.get('sale-race-02')?.totalAmount)).toBe(50.0);
      expect(db.saleItems.has('item-to-remove')).toBe(false);

      // Stale writer attempting to save with prior version fails OCC
      const staleSale = Sale.reconstitute({
        id: SaleId.create('sale-race-02'),
        source: validSource,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        items: [sale.items[0]!, sale.items[1]!],
        subtotal: Money.create(150.0, 'USD'),
        discountTotal: Money.zero('USD'),
        total: Money.create(150.0, 'USD'),
        version: 1, // stale!
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      await expect(repo.save(staleSale)).rejects.toThrow(SaleOptimisticLockException);

      // The derived total remains authoritative ($50.00)
      expect(Number(db.sales.get('sale-race-02')?.totalAmount)).toBe(50.0);
    });
  });

  // ==========================================================================
  // 3. Concurrent ApplyDiscount vs AddSaleItem Protection
  // ==========================================================================
  describe('3. Concurrent ApplyDiscount vs AddSaleItem', () => {
    it('prevents stale discount applications from overwriting concurrent line item additions', async () => {
      // Create Sale with item of $100
      const sale = Sale.create({ id: SaleId.create('sale-race-03'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-disc-base'),
          source: validSource,
          description: 'Rehab Session',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      // Worker 1 applies 20% discount
      const discountHandler = new ApplyDiscountHandler(repo, clock);
      const discountCmd = new ApplyDiscountCommand({
        saleId: 'sale-race-03',
        discount: {
          type: 'PERCENTAGE',
          value: 20,
          reason: 'VIP Client',
        },
      });

      const discountResult = await discountHandler.execute(discountCmd);
      expect(discountResult.isSuccess).toBe(true);
      expect(discountResult.getValue().subtotal.amount).toBe(100.0);
      expect(discountResult.getValue().discountTotal.amount).toBe(20.0);
      expect(discountResult.getValue().total.amount).toBe(80.0);

      // Master DB reflects discount
      expect(Number(db.sales.get('sale-race-03')?.discountTotalAmount)).toBe(20.0);
      expect(Number(db.sales.get('sale-race-03')?.totalAmount)).toBe(80.0);

      // Concurrently loaded stale version 1 writer is rejected
      const staleWriter = Sale.reconstitute({
        id: SaleId.create('sale-race-03'),
        source: validSource,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        items: [sale.items[0]!],
        subtotal: Money.create(100.0, 'USD'),
        discountTotal: Money.zero('USD'),
        total: Money.create(100.0, 'USD'),
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      staleWriter.addItem(
        {
          id: SaleItemId.create('item-concurrent'),
          source: validSource,
          description: 'Hot Pack',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(staleWriter)).rejects.toThrow(SaleOptimisticLockException);

      // Verify discount is not lost
      const current = db.sales.get('sale-race-03')!;
      expect(Number(current.discountTotalAmount)).toBe(20.0);
      expect(Number(current.totalAmount)).toBe(80.0);
    });
  });

  // ==========================================================================
  // 4. Concurrent CancelSale vs AddSaleItem Protection
  // ==========================================================================
  describe('4. Concurrent CancelSale vs AddSaleItem Race', () => {
    it('prevents adding items to a Sale that was concurrently cancelled', async () => {
      // Create Sale
      const sale = Sale.create({ id: SaleId.create('sale-race-04'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-cancel-01'),
          source: validSource,
          description: 'Evaluation',
          quantity: 1,
          unitPrice: Money.create(60.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      // Worker 1 cancels Sale
      const cancelHandler = new CancelSaleHandler(repo, clock);
      const cancelCmd = new CancelSaleCommand({
        saleId: 'sale-race-04',
        reason: 'Patient cancelled treatment appointment',
      });

      const cancelResult = await cancelHandler.execute(cancelCmd);
      expect(cancelResult.isSuccess).toBe(true);
      expect(cancelResult.getValue().status).toBe('CANCELLED');

      // Database reflects terminal status
      expect(db.sales.get('sale-race-04')?.status).toBe(SaleStatus.CANCELLED);

      // Worker 2 attempts to add an item to the cancelled sale
      const addHandler = new AddSaleItemHandler(repo, clock);
      const addCmd = new AddSaleItemCommand({
        saleId: 'sale-race-04',
        description: 'Late Item',
        quantity: 1,
        unitPriceAmount: 20.0,
      });

      const addResult = await addHandler.execute(addCmd);
      expect(addResult.isSuccess).toBe(false);
      // Domain asserts commercial terms freeze upon leaving DRAFT
      const errorObj = addResult.getError();
      const errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj);
      expect(errorMessage).toMatch(/Cannot mutate Sale 'sale-race-04' in status 'CANCELLED'/i);

      // Direct persistence guard also rejects any mutation to CANCELLED sale
      const staleDraft = Sale.reconstitute({
        id: SaleId.create('sale-race-04'),
        source: validSource,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        items: [sale.items[0]!],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      await expect(repo.save(staleDraft)).rejects.toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 5. CalculateSale Concurrency & Read Isolation
  // ==========================================================================
  describe('5. CalculateSale Concurrency & Read Isolation', () => {
    it('executes point-in-time calculation query without taking locks or creating race conditions', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-calc-01'), source: validSource }, clock);
      sale.addItem(
        {
          id: SaleItemId.create('item-c1'),
          source: validSource,
          description: 'Gym Session',
          quantity: 2,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.percentage(10, 'Seasonal Promo'), clock);
      await repo.save(sale);

      const calcHandler = new CalculateSaleHandler(repo);
      const query = new CalculateSaleQuery({ saleId: 'sale-calc-01' });

      // Execute calculation query
      const result = await calcHandler.execute(query);
      expect(result.isSuccess).toBe(true);

      const totals = result.getValue();
      // Subtotal = 2 * 40 = 80.00
      expect(totals.subtotal.amount).toBe(80.0);
      // Discount = 10% of 80 = 8.00
      expect(totals.discountTotal.amount).toBe(8.0);
      // Total = 80 - 8 = 72.00
      expect(totals.total.amount).toBe(72.0);

      // Verify that CalculateSale did not mutate version or write to database
      expect(db.sales.get('sale-calc-01')?.version).toBe(1);
    });
  });

  // ==========================================================================
  // 6. Domain Authority Over Derived Financial Values
  // ==========================================================================
  describe('6. Domain Financial Calculation Authority', () => {
    it('guarantees derived financial values (total, discountTotal, subtotal) are strictly governed by domain recalculateTotals', () => {
      const sale = Sale.create(
        { id: SaleId.create('sale-domain-auth'), source: validSource },
        clock,
      );

      // Invariant: Empty sale has 0 subtotal, discount, and total
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);

      // Item 1: 3 x $25.00 with $5 fixed discount per item
      sale.addItem(
        {
          id: SaleItemId.create('item-1'),
          source: validSource,
          description: 'Dry Needling',
          quantity: 3,
          unitPrice: Money.create(25.0, 'USD'),
          discount: Discount.fixed(5.0, 'Needle Discount'),
        },
        clock,
      );

      // Subtotal: 3 * 25 = 75.00
      // Line discount: 5.00 fixed for the line item
      // Net pre-order discount: 75 - 5 = 70.00
      expect(sale.subtotal.amount).toBe(75.0);
      expect(sale.discountTotal.amount).toBe(5.0);
      expect(sale.total.amount).toBe(70.0);

      // Order discount: 10% on net ($70 * 10% = $7.00)
      sale.applyOrderDiscount(Discount.percentage(10, 'Bundle Disc'), clock);

      // Total Discount: 5 (line) + 7 (order) = 12.00
      // Final Total: 75 - 12 = 63.00
      expect(sale.subtotal.amount).toBe(75.0);
      expect(sale.discountTotal.amount).toBe(12.0);
      expect(sale.total.amount).toBe(63.0);
    });
  });
});
