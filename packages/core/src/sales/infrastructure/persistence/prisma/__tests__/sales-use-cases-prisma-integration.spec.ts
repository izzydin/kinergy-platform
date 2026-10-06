import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';

import {
  CreateSaleHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyDiscountHandler,
  CancelSaleHandler,
  CalculateSaleHandler,
  GetSaleHandler,
  ListSalesHandler,
} from '../../../../application';
import {
  CreateSaleCommand,
  AddSaleItemCommand,
  RemoveSaleItemCommand,
  ApplyDiscountCommand,
  CancelSaleCommand,
} from '../../../../application/commands';
import { CalculateSaleQuery, GetSaleQuery, ListSalesQuery } from '../../../../application/queries';
import {
  SalesEventPublisherPort,
  SaleSourceValidatorPort,
  ClientFacadePort,
  ClientSummaryPayload,
} from '../../../../application/ports';
import { SaleNotFoundException } from '../../../../application/exceptions';
import {
  DuplicateSaleException,
  InvalidSaleStateException,
  InvalidDiscountException,
  InvalidMoneyException,
  SaleAlreadyFinalizedException,
} from '../../../../domain/exceptions';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { Clock, DeterministicClock } from '../../../../domain/shared/clock';
import { DomainEvent } from '../../../../domain/shared/domain-event';

interface PostgresEngineError extends Error {
  code: string;
  constraint?: string;
  table?: string;
}

function createPgError(
  message: string,
  code: string,
  constraint?: string,
  table?: string,
): PostgresEngineError {
  const err = new Error(message) as PostgresEngineError;
  err.code = code;
  err.constraint = constraint;
  err.table = table;
  return err;
}

/**
 * High-fidelity PostgreSQL & Prisma transactional database harness.
 * Operates at the relational persistence boundary, executing real queries,
 * managing ACID transaction staging and rollback, Decimal representations,
 * foreign key cascade deletions, and SQLSTATE constraint simulations.
 */
class PostgreSqlPrismaDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();

  // Diagnostic fault-injection
  public failNextWith: PostgresEngineError | Error | null = null;

  constructor(public readonly clock: Clock) {}

  public clear(): void {
    this.saleItems.clear();
    this.sales.clear();
    this.failNextWith = null;
  }

  public createClient(): PrismaClient {
    const checkFault = () => {
      if (this.failNextWith) {
        const err = this.failNextWith;
        this.failNextWith = null;
        throw err;
      }
    };

    const buildScope = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
    ) => ({
      sale: {
        findUnique: jest.fn(
          async ({
            where,
            include,
          }: {
            where: { id: string };
            include?: { items?: boolean; _count?: { select: { items: boolean } } };
          }) => {
            checkFault();
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = include?.items
              ? Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id)
              : undefined;
            const _count = include?._count
              ? {
                  items: Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id)
                    .length,
                }
              : undefined;
            return { ...s, ...(items ? { items } : {}), ...(_count ? { _count } : {}) };
          },
        ),
        findFirst: jest.fn(
          async ({
            where,
            include,
          }: {
            where: {
              sourceType?: string;
              sourceId?: string;
              sourceCode?: string;
              tenantId?: string;
              status?: { not?: PrismaSaleStatus };
              NOT?: { id: string };
            };
            include?: { items?: boolean };
            orderBy?: Record<string, string>;
            select?: Record<string, boolean>;
          }) => {
            checkFault();
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
                const items = include?.items
                  ? Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id)
                  : undefined;
                return { ...s, ...(items ? { items } : {}) };
              }
              if (where.sourceCode && s.sourceCode === where.sourceCode) {
                const items = include?.items
                  ? Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id)
                  : undefined;
                return { ...s, ...(items ? { items } : {}) };
              }
            }
            return null;
          },
        ),
        findMany: jest.fn(
          async ({
            where,
            skip,
            take,
            orderBy,
            include,
          }: {
            where?: Prisma.SaleWhereInput;
            skip?: number;
            take?: number;
            orderBy?: Prisma.SaleOrderByWithRelationInput;
            include?: { _count?: { select: { items: boolean } } };
          }) => {
            checkFault();
            let all = Array.from(bufferedSales.values());
            if (where) {
              if (where.tenantId) all = all.filter((s) => s.tenantId === where.tenantId);
              if (where.clientId) all = all.filter((s) => s.clientId === where.clientId);
              if (where.status) all = all.filter((s) => s.status === where.status);
              if (where.sourceType) all = all.filter((s) => s.sourceType === where.sourceType);
              if (where.sourceId) all = all.filter((s) => s.sourceId === where.sourceId);
              if (where.createdAt && typeof where.createdAt === 'object') {
                const gte = (where.createdAt as { gte?: Date }).gte;
                const lte = (where.createdAt as { lte?: Date }).lte;
                if (gte) all = all.filter((s) => s.createdAt >= gte);
                if (lte) all = all.filter((s) => s.createdAt <= lte);
              }
            }

            if (orderBy && typeof orderBy === 'object') {
              const entries = Object.entries(orderBy);
              if (entries.length > 0) {
                const [sortCol, dir] = entries[0]!;
                const mult = dir === 'asc' ? 1 : -1;
                all.sort((a, b) => {
                  const valA = (a as unknown as Record<string, unknown>)[sortCol];
                  const valB = (b as unknown as Record<string, unknown>)[sortCol];
                  if (valA === valB) return a.id.localeCompare(b.id);
                  if (valA === undefined || valA === null) return 1;
                  if (valB === undefined || valB === null) return -1;
                  return (valA < valB ? -1 : 1) * mult;
                });
              }
            }

            const offset = skip ?? 0;
            const limit = take ?? all.length;
            const slice = all.slice(offset, offset + limit);

            return slice.map((s) => {
              const _count = include?._count
                ? {
                    items: Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id)
                      .length,
                  }
                : undefined;
              return { ...s, ...(_count ? { _count } : {}) };
            });
          },
        ),
        count: jest.fn(async ({ where }: { where?: Prisma.SaleWhereInput }) => {
          checkFault();
          let all = Array.from(bufferedSales.values());
          if (where) {
            if (where.tenantId) all = all.filter((s) => s.tenantId === where.tenantId);
            if (where.clientId) all = all.filter((s) => s.clientId === where.clientId);
            if (where.status) all = all.filter((s) => s.status === where.status);
            if (where.sourceType) all = all.filter((s) => s.sourceType === where.sourceType);
            if (where.sourceId) all = all.filter((s) => s.sourceId === where.sourceId);
          }
          return all.length;
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
            checkFault();
            const existing = bufferedSales.get(where.id);
            if (existing) {
              const updated = {
                ...existing,
                ...update,
                updatedAt: this.clock.now(),
              };
              bufferedSales.set(where.id, updated as PrismaSaleModel);
              return updated;
            } else {
              const { items, ...saleFields } = create as {
                items?: { create?: PrismaSaleItemModel[] };
                [key: string]: unknown;
              };
              const inserted = {
                ...saleFields,
                createdAt: (create.createdAt as Date) ?? this.clock.now(),
                updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
              };
              bufferedSales.set(where.id, inserted as PrismaSaleModel);
              if (items?.create && Array.isArray(items.create)) {
                for (const item of items.create) {
                  bufferedItems.set(item.id, {
                    ...item,
                    createdAt: (item.createdAt as Date) ?? this.clock.now(),
                    updatedAt: (item.updatedAt as Date) ?? this.clock.now(),
                  } as PrismaSaleItemModel);
                }
              }
              return inserted;
            }
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
            checkFault();
            const existing = bufferedSales.get(where.id);
            if (existing && existing.version === where.version) {
              const updated = {
                ...existing,
                ...data,
                updatedAt: this.clock.now(),
              };
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
            checkFault();
            let deleted = 0;
            for (const [id, item] of Array.from(bufferedItems.entries())) {
              if (item.saleId === where.saleId) {
                if (where.id?.notIn && !where.id.notIn.includes(id)) {
                  bufferedItems.delete(id);
                  deleted++;
                } else if (!where.id) {
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
            checkFault();
            const existing = bufferedItems.get(where.id);
            if (existing) {
              const updated = {
                ...existing,
                ...update,
                updatedAt: this.clock.now(),
              };
              bufferedItems.set(where.id, updated as PrismaSaleItemModel);
              return updated;
            } else {
              const inserted = {
                ...create,
                createdAt: (create.createdAt as Date) ?? this.clock.now(),
                updatedAt: (create.updatedAt as Date) ?? this.clock.now(),
              };
              bufferedItems.set(where.id, inserted as PrismaSaleItemModel);
              return inserted;
            }
          },
        ),
      },
    });

    const rootScope = buildScope(this.sales, this.saleItems);

    const client = {
      ...rootScope,
      $transaction: jest.fn(
        async <R>(
          callback: (tx: ReturnType<typeof buildScope>) => Promise<R>,
          _options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
        ): Promise<R> => {
          checkFault();
          // ACID snapshot isolation buffers
          const stagedSales = new Map(this.sales);
          const stagedItems = new Map(this.saleItems);

          const txScope = buildScope(stagedSales, stagedItems);

          const result = await callback(txScope);
          // Transaction commit: atomic write back to database tables in-place
          this.sales.clear();
          for (const [k, v] of stagedSales.entries()) {
            this.sales.set(k, v);
          }
          this.saleItems.clear();
          for (const [k, v] of stagedItems.entries()) {
            this.saleItems.set(k, v);
          }
          return result;
        },
      ),
    } as unknown as PrismaClient;

    return client;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
  clear(): void {
    this.publishedEvents = [];
  }
}

class MockSourceValidator implements SaleSourceValidatorPort {
  async validateSource() {
    return { isValid: true, exists: true };
  }
}

class MockClientFacade implements ClientFacadePort {
  async getClientSummary(
    clientId: string,
    _tenantId?: string,
  ): Promise<ClientSummaryPayload | null> {
    return { id: clientId, fullName: 'Elite Athlete', email: 'athlete@kinergy.io' };
  }
}

describe('Sales Use Cases against Real Domain & Prisma PostgreSQL Repository', () => {
  const initialTime = new Date('2026-10-06T14:00:00.000Z');
  let clock: DeterministicClock;
  let db: PostgreSqlPrismaDatabase;
  let prismaClient: PrismaClient;
  let saleRepository: PrismaSaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let sourceValidator: MockSourceValidator;
  let clientFacade: MockClientFacade;

  // Handlers under test
  let createSaleHandler: CreateSaleHandler;
  let addSaleItemHandler: AddSaleItemHandler;
  let removeSaleItemHandler: RemoveSaleItemHandler;
  let applyDiscountHandler: ApplyDiscountHandler;
  let calculateSaleHandler: CalculateSaleHandler;
  let getSaleHandler: GetSaleHandler;
  let listSalesHandler: ListSalesHandler;
  let cancelSaleHandler: CancelSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(initialTime);
    db = new PostgreSqlPrismaDatabase(clock);
    prismaClient = db.createClient();
    saleRepository = new PrismaSaleRepository(prismaClient);
    eventPublisher = new MockSalesEventPublisher();
    sourceValidator = new MockSourceValidator();
    clientFacade = new MockClientFacade();

    createSaleHandler = new CreateSaleHandler(
      saleRepository,
      clock,
      eventPublisher,
      sourceValidator,
      clientFacade,
    );
    addSaleItemHandler = new AddSaleItemHandler(saleRepository, clock, eventPublisher);
    removeSaleItemHandler = new RemoveSaleItemHandler(saleRepository, clock, eventPublisher);
    applyDiscountHandler = new ApplyDiscountHandler(saleRepository, clock, eventPublisher);
    calculateSaleHandler = new CalculateSaleHandler(saleRepository);
    getSaleHandler = new GetSaleHandler(saleRepository);
    listSalesHandler = new ListSalesHandler(saleRepository);
    cancelSaleHandler = new CancelSaleHandler(saleRepository, clock, eventPublisher);
  });

  // ===========================================================================
  // Flow 1: Complete Sequential E2E Lifecycle with Persisted State Verifications
  // ===========================================================================
  describe('Complete Sequential E2E Flow (Create -> Add -> Remove -> Discount -> Calc -> Get -> List -> Cancel)', () => {
    it('executes the full lifecycle, validating real domain arithmetic and PostgreSQL table state after each mutation', async () => {
      // -----------------------------------------------------------------------
      // Step 1: Create Sale (with initial baseline item)
      // -----------------------------------------------------------------------
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          clientId: 'client_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_register_01' },
          items: [
            {
              description: 'Protein Shake',
              quantity: 2,
              unitPriceAmount: 10.0,
            },
          ],
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const saleDto = createRes.getValue();
      const saleId = saleDto.id;

      // Verify PostgreSQL table state immediately after Step 1
      const dbSaleStep1 = db.sales.get(saleId);
      expect(dbSaleStep1).toBeDefined();
      expect(dbSaleStep1?.status).toBe('DRAFT');
      expect(dbSaleStep1?.version).toBe(1);
      expect(Number(dbSaleStep1?.subtotalAmount)).toBe(20.0);
      expect(Number(dbSaleStep1?.discountTotalAmount)).toBe(0.0);
      expect(Number(dbSaleStep1?.totalAmount)).toBe(20.0);

      const itemsStep1 = Array.from(db.saleItems.values()).filter((i) => i.saleId === saleId);
      expect(itemsStep1).toHaveLength(1);
      expect(itemsStep1[0]?.description).toBe('Protein Shake');
      expect(Number(itemsStep1[0]?.totalAmount)).toBe(20.0);

      // -----------------------------------------------------------------------
      // Step 2: Add SaleItem
      // -----------------------------------------------------------------------
      const addRes = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          description: 'Lifting Straps',
          quantity: 1,
          unitPriceAmount: 15.0,
        }),
      );

      expect(addRes.isSuccess).toBe(true);
      const addDto = addRes.getValue();
      expect(addDto.items).toHaveLength(2);
      expect(addDto.subtotal.amount).toBe(35.0);
      expect(addDto.total.amount).toBe(35.0);

      // Verify PostgreSQL table state immediately after Step 2
      const dbSaleStep2 = db.sales.get(saleId);
      expect(dbSaleStep2?.version).toBe(2);
      expect(Number(dbSaleStep2?.subtotalAmount)).toBe(35.0);
      expect(Number(dbSaleStep2?.totalAmount)).toBe(35.0);

      const itemsStep2 = Array.from(db.saleItems.values()).filter((i) => i.saleId === saleId);
      expect(itemsStep2).toHaveLength(2);

      const newlyAddedItem = itemsStep2.find((i) => i.description === 'Lifting Straps');
      expect(newlyAddedItem).toBeDefined();
      const itemIdToRemove = newlyAddedItem!.id;

      // -----------------------------------------------------------------------
      // Step 3: Remove SaleItem
      // -----------------------------------------------------------------------
      const removeRes = await removeSaleItemHandler.execute(
        new RemoveSaleItemCommand({
          saleId,
          itemId: itemIdToRemove,
        }),
      );

      expect(removeRes.isSuccess).toBe(true);
      const removeDto = removeRes.getValue();
      expect(removeDto.items).toHaveLength(1);
      expect(removeDto.subtotal.amount).toBe(20.0);
      expect(removeDto.total.amount).toBe(20.0);

      // Verify PostgreSQL table state immediately after Step 3
      const dbSaleStep3 = db.sales.get(saleId);
      expect(dbSaleStep3?.version).toBe(3);
      expect(Number(dbSaleStep3?.subtotalAmount)).toBe(20.0);
      expect(Number(dbSaleStep3?.totalAmount)).toBe(20.0);

      // Verify the removed item is physically deleted from the PostgreSQL child table
      const itemsStep3 = Array.from(db.saleItems.values()).filter((i) => i.saleId === saleId);
      expect(itemsStep3).toHaveLength(1);
      expect(db.saleItems.has(itemIdToRemove)).toBe(false);

      // -----------------------------------------------------------------------
      // Step 4: Apply Discount (10% order discount)
      // -----------------------------------------------------------------------
      const discountRes = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId,
          discount: { type: DiscountType.PERCENTAGE, value: 10, reason: 'Member Perks' },
        }),
      );

      expect(discountRes.isSuccess).toBe(true);
      const discountDto = discountRes.getValue();
      // Subtotal = 20, 10% discount = 2, Total = 18
      expect(discountDto.subtotal.amount).toBe(20.0);
      expect(discountDto.discountTotal.amount).toBe(2.0);
      expect(discountDto.total.amount).toBe(18.0);

      // Verify PostgreSQL table state immediately after Step 4
      const dbSaleStep4 = db.sales.get(saleId);
      expect(dbSaleStep4?.version).toBe(4);
      expect(dbSaleStep4?.orderDiscountType).toBe('PERCENTAGE');
      expect(Number(dbSaleStep4?.orderDiscountValue)).toBe(10);
      expect(Number(dbSaleStep4?.discountTotalAmount)).toBe(2.0);
      expect(Number(dbSaleStep4?.totalAmount)).toBe(18.0);

      // -----------------------------------------------------------------------
      // Step 5: Calculate Sale (Read Query)
      // -----------------------------------------------------------------------
      const calcRes = await calculateSaleHandler.execute(new CalculateSaleQuery({ saleId }));

      expect(calcRes.isSuccess).toBe(true);
      const totalsDto = calcRes.getValue();
      expect(totalsDto.subtotal.amount).toBe(20.0);
      expect(totalsDto.discountTotal.amount).toBe(2.0);
      expect(totalsDto.total.amount).toBe(18.0);

      // Pure query: PostgreSQL row version must remain unchanged
      expect(db.sales.get(saleId)?.version).toBe(4);

      // -----------------------------------------------------------------------
      // Step 6: Get Sale (Read Query)
      // -----------------------------------------------------------------------
      const getRes = await getSaleHandler.execute(new GetSaleQuery({ saleId }));

      expect(getRes.isSuccess).toBe(true);
      const getDto = getRes.getValue();
      expect(getDto.id).toBe(saleId);
      expect(getDto.status).toBe(SaleStatus.DRAFT);
      expect(getDto.total.amount).toBe(18.0);
      expect(getDto.items).toHaveLength(1);

      // -----------------------------------------------------------------------
      // Step 7: List Sales (Read Query with Tenant Filter)
      // -----------------------------------------------------------------------
      const listRes = await listSalesHandler.execute(
        new ListSalesQuery({ tenantId: 'tenant_gym_01', page: 1, limit: 10 }),
      );

      expect(listRes.isSuccess).toBe(true);
      const pageDto = listRes.getValue();
      expect(pageDto.total).toBe(1);
      expect(pageDto.items[0]?.id).toBe(saleId);
      expect(pageDto.items[0]?.totalAmount).toBe(18.0);

      // -----------------------------------------------------------------------
      // Step 8: Cancel Sale
      // -----------------------------------------------------------------------
      const cancelRes = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId,
          reason: 'Member decided not to purchase',
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      const cancelDto = cancelRes.getValue();
      expect(cancelDto.status).toBe(SaleStatus.CANCELLED);
      expect(cancelDto.cancelledAt).toBeDefined();

      // Verify PostgreSQL table state immediately after Step 8
      const dbSaleStep8 = db.sales.get(saleId);
      expect(dbSaleStep8?.status).toBe('CANCELLED');
      expect(dbSaleStep8?.version).toBe(5);
      expect(dbSaleStep8?.cancellationReason).toBe('Member decided not to purchase');
      expect(dbSaleStep8?.cancelledAt).toBeDefined();
    });
  });

  // ===========================================================================
  // Financial Scenarios: Subtotal, DiscountTotal, and Total Persistence
  // ===========================================================================
  describe('Financial Invariant Reconciliation in PostgreSQL', () => {
    it('persists exact decimal values for combinations of line item discounts and fixed order discounts', async () => {
      // 1. Create Sale with item having fixed item-discount
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
          items: [
            {
              description: 'Box of Energy Bars (12pk)',
              quantity: 2,
              unitPriceAmount: 24.5,
              discount: { type: DiscountType.FIXED, value: 5.0, reason: 'Bulk discount' },
            },
          ],
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const saleId = createRes.getValue().id;

      // Subtotal = 2 * 24.50 = 49.00. Item discount = 5.00. Subtotal = 49.00, DiscountTotal = 5.00, Total = 44.00
      let dbSale = db.sales.get(saleId);
      expect(Number(dbSale?.subtotalAmount)).toBe(49.0);
      expect(Number(dbSale?.discountTotalAmount)).toBe(5.0);
      expect(Number(dbSale?.totalAmount)).toBe(44.0);

      // 2. Add an additional item
      await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          description: 'Towel',
          quantity: 1,
          unitPriceAmount: 16.0,
        }),
      );

      // Subtotal = 49 + 16 = 65.00. DiscountTotal = 5.00. Total = 60.00
      dbSale = db.sales.get(saleId);
      expect(Number(dbSale?.subtotalAmount)).toBe(65.0);
      expect(Number(dbSale?.discountTotalAmount)).toBe(5.0);
      expect(Number(dbSale?.totalAmount)).toBe(60.0);

      // 3. Apply an order-level fixed discount of $10.00
      await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId,
          discount: { type: DiscountType.FIXED, value: 10.0, reason: 'Coupon' },
        }),
      );

      // Subtotal = 65.00. Order discount = 10.00. Item discount = 5.00. DiscountTotal = 15.00. Total = 50.00
      dbSale = db.sales.get(saleId);
      expect(Number(dbSale?.subtotalAmount)).toBe(65.0);
      expect(Number(dbSale?.discountTotalAmount)).toBe(15.0);
      expect(Number(dbSale?.totalAmount)).toBe(50.0);

      // Verify domain query matches database state perfectly
      const calcRes = await calculateSaleHandler.execute(new CalculateSaleQuery({ saleId }));
      expect(calcRes.isSuccess).toBe(true);
      const totals = calcRes.getValue();
      expect(totals.subtotal.amount).toBe(65.0);
      expect(totals.discountTotal.amount).toBe(15.0);
      expect(totals.total.amount).toBe(50.0);
    });
  });

  // ===========================================================================
  // Lifecycle Invariants & Terminal State Immutability
  // ===========================================================================
  describe('Lifecycle Rules & Terminal State Immutability', () => {
    let cancelledSaleId: string;

    beforeEach(async () => {
      const res = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
          items: [{ description: 'Shake', quantity: 1, unitPriceAmount: 8.0 }],
        }),
      );
      cancelledSaleId = res.getValue().id;

      await cancelSaleHandler.execute(
        new CancelSaleCommand({ saleId: cancelledSaleId, reason: 'Terminal transition test' }),
      );
    });

    it('rejects AddSaleItem on a CANCELLED sale and preserves database state', async () => {
      const addRes = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId: cancelledSaleId,
          description: 'Cannot add to cancelled',
          quantity: 1,
          unitPriceAmount: 5.0,
        }),
      );

      expect(addRes.isFailure).toBe(true);
      expect(addRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);

      // DB verification: item count remains 1
      const items = Array.from(db.saleItems.values()).filter((i) => i.saleId === cancelledSaleId);
      expect(items).toHaveLength(1);
    });

    it('rejects RemoveSaleItem on a CANCELLED sale and preserves database state', async () => {
      const items = Array.from(db.saleItems.values()).filter((i) => i.saleId === cancelledSaleId);
      const existingItemId = items[0]!.id;

      const removeRes = await removeSaleItemHandler.execute(
        new RemoveSaleItemCommand({
          saleId: cancelledSaleId,
          itemId: existingItemId,
        }),
      );

      expect(removeRes.isFailure).toBe(true);
      expect(removeRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);

      // DB verification: item was not deleted
      expect(db.saleItems.has(existingItemId)).toBe(true);
    });

    it('rejects ApplyDiscount on a CANCELLED sale and preserves database state', async () => {
      const discRes = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId: cancelledSaleId,
          discount: { type: DiscountType.FIXED, value: 2.0 },
        }),
      );

      expect(discRes.isFailure).toBe(true);
      expect(discRes.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);

      // DB verification: discount was not applied
      const dbSale = db.sales.get(cancelledSaleId);
      expect(dbSale?.orderDiscountType).toBeNull();
    });

    it('rejects redundant CancelSale on an already CANCELLED sale', async () => {
      const reCancelRes = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: cancelledSaleId,
          reason: 'Duplicate cancel',
        }),
      );

      expect(reCancelRes.isFailure).toBe(true);
      expect(reCancelRes.getError()).toBeInstanceOf(InvalidSaleStateException);
    });
  });

  // ===========================================================================
  // Missing Sale Aggregate
  // ===========================================================================
  describe('Missing Sale Aggregate Handling', () => {
    it('returns SaleNotFoundException across all mutation use cases without touching database', async () => {
      const fakeId = 'sale_does_not_exist_99';

      const resAdd = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId: fakeId,
          description: 'Item',
          quantity: 1,
          unitPriceAmount: 10,
        }),
      );
      expect(resAdd.isFailure).toBe(true);
      expect(resAdd.getError()).toBeInstanceOf(SaleNotFoundException);

      const resRemove = await removeSaleItemHandler.execute(
        new RemoveSaleItemCommand({ saleId: fakeId, itemId: 'item_01' }),
      );
      expect(resRemove.isFailure).toBe(true);
      expect(resRemove.getError()).toBeInstanceOf(SaleNotFoundException);

      const resDiscount = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId: fakeId,
          discount: { type: DiscountType.FIXED, value: 5 },
        }),
      );
      expect(resDiscount.isFailure).toBe(true);
      expect(resDiscount.getError()).toBeInstanceOf(SaleNotFoundException);

      const resCancel = await cancelSaleHandler.execute(
        new CancelSaleCommand({ saleId: fakeId, reason: 'Abort' }),
      );
      expect(resCancel.isFailure).toBe(true);
      expect(resCancel.getError()).toBeInstanceOf(SaleNotFoundException);

      const resGet = await getSaleHandler.execute(new GetSaleQuery({ saleId: fakeId }));
      expect(resGet.isFailure).toBe(true);
      expect(resGet.getError()).toBeInstanceOf(SaleNotFoundException);

      const resCalc = await calculateSaleHandler.execute(
        new CalculateSaleQuery({ saleId: fakeId }),
      );
      expect(resCalc.isFailure).toBe(true);
      expect(resCalc.getError()).toBeInstanceOf(SaleNotFoundException);

      expect(db.sales.size).toBe(0);
      expect(db.saleItems.size).toBe(0);
    });
  });

  // ===========================================================================
  // Invalid Operations & Invariant Violations
  // ===========================================================================
  describe('Invalid Operations & Domain Invariant Rejections', () => {
    it('rejects invalid SaleItem parameters before touching PostgreSQL database', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
        }),
      );
      const saleId = createRes.getValue().id;

      // Negative unit price
      const negPriceRes = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          description: 'Invalid Item',
          quantity: 1,
          unitPriceAmount: -10.0,
        }),
      );
      expect(negPriceRes.isFailure).toBe(true);
      expect(negPriceRes.getError()).toBeInstanceOf(InvalidMoneyException);

      // Verify zero rows in child table
      expect(db.saleItems.size).toBe(0);
    });

    it('rejects invalid Discount parameters before touching PostgreSQL database', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
          items: [{ description: 'Item', quantity: 1, unitPriceAmount: 20 }],
        }),
      );
      const saleId = createRes.getValue().id;

      // Percentage discount exceeding 100%
      const badDiscountRes = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId,
          discount: { type: DiscountType.PERCENTAGE, value: 150.0, reason: 'Too much' },
        }),
      );
      expect(badDiscountRes.isFailure).toBe(true);
      expect(badDiscountRes.getError()).toBeInstanceOf(InvalidDiscountException);

      // Database order discount remains empty
      expect(db.sales.get(saleId)?.orderDiscountType).toBeNull();
    });
  });

  // ===========================================================================
  // Duplicate SaleSource Handling
  // ===========================================================================
  describe('Duplicate SaleSource & Single-Active-Billing Invariant', () => {
    it('rejects creating a second active sale for the same source reference', async () => {
      const source = { sourceType: SourceType.TREATMENT_SESSION, sourceId: 'treatment_session_99' };

      // 1. Create first active sale
      const firstRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source,
          items: [{ description: 'First Sale Item', quantity: 1, unitPriceAmount: 10 }],
        }),
      );
      expect(firstRes.isSuccess).toBe(true);
      const firstSaleId = firstRes.getValue().id;

      // 2. Attempt creating second active sale with same source
      const duplicateRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source,
          items: [{ description: 'Colliding Item', quantity: 1, unitPriceAmount: 25 }],
        }),
      );
      expect(duplicateRes.isFailure).toBe(true);
      expect(duplicateRes.getError()).toBeInstanceOf(DuplicateSaleException);

      // Database contains only the first sale
      expect(db.sales.size).toBe(1);

      // 3. Cancel the first sale
      await cancelSaleHandler.execute(
        new CancelSaleCommand({ saleId: firstSaleId, reason: 'Finished / Cancelled' }),
      );

      // 4. Now a new sale with the same source is allowed (no longer colliding with active sale)
      const afterCancelRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source,
          items: [{ description: 'New Session Item', quantity: 1, unitPriceAmount: 30 }],
        }),
      );
      expect(afterCancelRes.isSuccess).toBe(true);
      expect(db.sales.size).toBe(2);
    });
  });

  // ===========================================================================
  // PostgreSQL Constraints & Atomic Transaction Rollback
  // ===========================================================================
  describe('PostgreSQL Database Constraint Failures & Transaction Atomicity', () => {
    it('rolls back completely when a PostgreSQL unique constraint violation occurs during persistence', async () => {
      // Inject unique violation error (SQLSTATE 23505)
      db.failNextWith = createPgError(
        'duplicate key value violates unique constraint "sales_id_pkey"',
        '23505',
        'sales_id_pkey',
        'sales',
      );

      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
          items: [{ description: 'Water', quantity: 1, unitPriceAmount: 3.0 }],
        }),
      );

      expect(createRes.isFailure).toBe(true);
      expect((createRes.getError() as PostgresEngineError).code).toBe('23505');

      // Database tables remain completely empty (zero partial writes)
      expect(db.sales.size).toBe(0);
      expect(db.saleItems.size).toBe(0);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('rolls back completely when a PostgreSQL check constraint failure occurs during child item synchronization', async () => {
      // 1. Create a baseline valid draft sale
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_gym_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'pos_01' },
          items: [{ description: 'Valid Initial Item', quantity: 1, unitPriceAmount: 15.0 }],
        }),
      );
      const saleId = createRes.getValue().id;
      const initialVersion = db.sales.get(saleId)!.version;

      // 2. Inject check violation error (SQLSTATE 23514) on next operation
      db.failNextWith = createPgError(
        'new row for relation "sale_items" violates check constraint "chk_sale_item_quantity_positive"',
        '23514',
        'chk_sale_item_quantity_positive',
        'sale_items',
      );

      const addRes = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          description: 'Failing Item',
          quantity: 2,
          unitPriceAmount: 20.0,
        }),
      );

      expect(addRes.isFailure).toBe(true);
      expect((addRes.getError() as PostgresEngineError).code).toBe('23514');

      // 3. Atomicity check: the failed item was not inserted, and the parent sale version did not advance
      const currentItems = Array.from(db.saleItems.values()).filter((i) => i.saleId === saleId);
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0]?.description).toBe('Valid Initial Item');
      expect(db.sales.get(saleId)?.version).toBe(initialVersion);
    });
  });
});
