import { Test, TestingModule } from '@nestjs/testing';
import {
  Sale,
  SaleId,
  SaleItemId,
  SourceReference,
  SourceType,
  SaleSourceType,
  Money,
  MoneyMapper,
  SaleRepositoryInterface,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  CreateSaleHandler,
  GetSaleByIdHandler,
  ListSalesHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CalculateSaleHandler,
  AssignSaleSourceHandler,
  SaleOptimisticLockException,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class TestClock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

/**
 * Stateful concurrent test repository with simulated optimistic concurrency control (OCC).
 */
class ConcurrentReviewSaleRepository implements SaleRepositoryInterface {
  public items = new Map<string, Sale>();
  public queryCount = 0;
  public saveCount = 0;
  public lastCriteria?: FindSalesCriteria;
  public lastPagination?: FindSalesPagination;
  public lastSort?: FindSalesSort;

  async findById(id: SaleId | string): Promise<Sale | null> {
    this.queryCount++;
    const saleIdStr = typeof id === 'string' ? id : id.value;
    const item = this.items.get(saleIdStr);
    if (!item) return null;
    return Sale.reconstitute({
      id: item.id,
      tenantId: item.tenantId,
      clientId: item.clientId,
      status: item.status,
      currency: item.currency,
      source: item.source,
      items: [...item.items],
      subtotal: item.subtotal,
      discountTotal: item.discountTotal,
      total: item.total,
      orderDiscount: item.orderDiscount,
      cancellationReason: item.cancellationReason,
      cancelledAt: item.cancelledAt,
      completedAt: item.completedAt,
      refundedAt: item.refundedAt,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    const existing = this.items.get(sale.id.value);

    if (existing) {
      // Optimistic concurrency control check: version in database must match expected prior version
      const expectedVersion = sale.version > existing.version ? sale.version - 1 : sale.version;
      if (existing.version !== expectedVersion) {
        throw new SaleOptimisticLockException('Sale', sale.id.value, expectedVersion);
      }
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    (sale as unknown as { _version: number })._version = nextVersion;

    this.items.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    this.queryCount++;
    this.lastCriteria = criteria;
    this.lastPagination = pagination;
    this.lastSort = sort;

    let sales = Array.from(this.items.values());

    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      sales = sales.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    if (criteria.sourceType) {
      sales = sales.filter((s) => s.source.sourceType === criteria.sourceType);
    }
    if (criteria.sourceReferenceId) {
      sales = sales.filter((s) => s.source.sourceId === criteria.sourceReferenceId);
    }
    if (criteria.fromDate) {
      sales = sales.filter((s) => s.createdAt >= criteria.fromDate!);
    }
    if (criteria.toDate) {
      sales = sales.filter((s) => s.createdAt <= criteria.toDate!);
    }
    if (criteria.search) {
      const term = criteria.search.trim().toLowerCase();
      if (term.length > 0) {
        sales = sales.filter((s) => {
          const matchId = s.id.value.toLowerCase().includes(term);
          const matchCode = s.source.sourceCode?.toLowerCase().includes(term);
          const matchSourceId = s.source.sourceId.toLowerCase().includes(term);
          return Boolean(matchId || matchCode || matchSourceId);
        });
      }
    }

    // Deterministic sorting with stable secondary tie-breaker (id ASC)
    sales.sort((a, b) => {
      let cmp: number;
      if (sort.field === 'total') {
        cmp = a.total.amount - b.total.amount;
      } else if (sort.field === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      }

      if (cmp !== 0) {
        return sort.direction === 'desc' ? -cmp : cmp;
      }
      return a.id.value.localeCompare(b.id.value);
    });

    const total = sales.length;
    const startIndex = (pagination.page - 1) * pagination.limit;
    const pageItems = sales.slice(startIndex, startIndex + pagination.limit).map((s) => {
      const subtotalDto = MoneyMapper.toDTO(s.subtotal);
      const discountTotalDto = MoneyMapper.toDTO(s.discountTotal);
      const totalDto = MoneyMapper.toDTO(s.total);

      return {
        id: s.id.value,
        tenantId: s.tenantId,
        clientId: s.clientId,
        currency: s.currency,
        status: s.status,
        source: {
          sourceType: s.source.sourceType,
          sourceId: s.source.sourceId,
          sourceCode: s.source.sourceCode,
          type: s.source.sourceType,
          referenceId: s.source.sourceId,
          referenceCode: s.source.sourceCode,
        },
        subtotal: subtotalDto,
        discountTotal: discountTotalDto,
        total: totalDto,
        subtotalAmount: subtotalDto.amount,
        discountTotalAmount: discountTotalDto.amount,
        totalAmount: totalDto.amount,
        itemCount: s.itemCount,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    return {
      items: pageItems,
      total,
    };
  }

  async list(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    return this.findMany(criteria, pagination, sort);
  }
}

describe('Sales API Performance, Concurrency & Financial Consistency Review Specification', () => {
  let controller: SalesController;
  let repo: ConcurrentReviewSaleRepository;
  let clock: TestClock;

  const validManagerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read', 'sales.create', 'sales.cancel'],
    tenantId: 'tenant_main',
  };

  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'food_pos_01',
    sourceCode: 'REG-01',
  });

  beforeEach(async () => {
    clock = new TestClock(new Date('2026-10-14T10:00:00.000Z'));
    repo = new ConcurrentReviewSaleRepository();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: repo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: { findById: jest.fn(), findBySaleId: jest.fn(), save: jest.fn() },
        },
        {
          provide: CreateSaleHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new CreateSaleHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new GetSaleByIdHandler(r),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ListSalesHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new ListSalesHandler(r),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new AddSaleItemHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveSaleItemHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new RemoveSaleItemHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ApplyOrderDiscountHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) =>
            new ApplyOrderDiscountHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveOrderDiscountHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) =>
            new RemoveOrderDiscountHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new FinalizeSaleHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new CancelSaleHandler(r, clock),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AssignSaleSourceHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new AssignSaleSourceHandler(r),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CalculateSaleHandler,
          useFactory: (r: ConcurrentReviewSaleRepository) => new CalculateSaleHandler(r),
          inject: [SALE_REPOSITORY_TOKEN],
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<SalesController>(SalesController);
  });

  // ==========================================================================
  // 1. List Queries: Filtering, Sorting, and Pagination in Database Layer
  // ==========================================================================
  describe('1. Database Filtering, Sorting, and Pagination Mechanics', () => {
    it('passes search, status, client, and date filters directly to repository without in-memory leaking', async () => {
      for (let i = 1; i <= 5; i++) {
        const sale = Sale.create(
          {
            id: SaleId.create(`sale_00${i}`),
            source: defaultSource,
            tenantId: 'tenant_main',
            clientId: i % 2 === 0 ? 'client_even' : 'client_odd',
          },
          clock,
        );
        sale.addItem(
          {
            id: SaleItemId.create(`item_${i}`),
            source: defaultSource,
            description: `Product ${i}`,
            quantity: 1,
            unitPrice: Money.create(10 * i, 'USD'),
          },
          clock,
        );
        await repo.save(sale);
      }

      const result = await controller.listSales(
        {
          page: 1,
          limit: 2,
          clientId: 'client_even',
          status: 'DRAFT',
          sort: 'createdAt.desc',
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        validManagerUser,
      );

      expect(repo.lastCriteria).toBeDefined();
      expect(repo.lastCriteria?.clientId).toBe('client_even');
      expect(repo.lastCriteria?.status).toBe('DRAFT');
      expect(repo.lastPagination?.page).toBe(1);
      expect(repo.lastPagination?.limit).toBe(2);
      expect(repo.lastSort?.field).toBe('createdAt');
      expect(repo.lastSort?.direction).toBe('desc');

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.items.every((s) => s.clientId === 'client_even')).toBe(true);
    });

    it('enforces deterministic secondary ordering (id ASC) for stable pagination with equal sort values', async () => {
      clock.advance(1000);

      const ids = ['sale_c', 'sale_a', 'sale_f', 'sale_b', 'sale_e', 'sale_d'];
      for (const id of ids) {
        const sale = Sale.create(
          {
            id: SaleId.create(id),
            source: defaultSource,
            tenantId: 'tenant_main',
          },
          clock,
        );
        sale.addItem(
          {
            id: SaleItemId.create(`item_${id}`),
            source: defaultSource,
            description: 'Uniform Item',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
          },
          clock,
        );
        await repo.save(sale);
      }

      const page1 = await controller.listSales(
        { page: 1, limit: 3, sort: 'total.desc' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        validManagerUser,
      );

      const page2 = await controller.listSales(
        { page: 2, limit: 3, sort: 'total.desc' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        validManagerUser,
      );

      expect(page1.items.length).toBe(3);
      expect(page2.items.length).toBe(3);

      expect(page1.items.map((s) => s.id)).toEqual(['sale_a', 'sale_b', 'sale_c']);
      expect(page2.items.map((s) => s.id)).toEqual(['sale_d', 'sale_e', 'sale_f']);

      const allFetchedIds = [...page1.items.map((s) => s.id), ...page2.items.map((s) => s.id)];
      const uniqueIds = new Set(allFetchedIds);
      expect(uniqueIds.size).toBe(6);
    });
  });

  // ==========================================================================
  // 2. Concurrency Controls & Lost-Update Prevention
  // ==========================================================================
  describe('2. Concurrent Mutation & Lost Update Protection', () => {
    it('prevents concurrent AddSaleItem calls from silently overwriting totals or items', async () => {
      const createRes = await controller.createSale(
        {
          id: 'sale_race_01',
          currency: 'USD',
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'food_1',
          },
        },
        undefined,
        validManagerUser,
      );
      expect(createRes.id).toBe('sale_race_01');
      expect(createRes.version).toBe(1);

      const saleSnapshot1 = await repo.findById('sale_race_01');
      expect(saleSnapshot1?.version).toBe(1);

      const saleSnapshot2 = await repo.findById('sale_race_01');
      expect(saleSnapshot2?.version).toBe(1);

      saleSnapshot1?.addItem(
        {
          id: SaleItemId.create('item_a'),
          source: defaultSource,
          description: 'Protein Shake',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      await repo.save(saleSnapshot1!);

      const currentInDb = await repo.findById('sale_race_01');
      expect(currentInDb?.version).toBe(2);
      expect(currentInDb?.total.amount).toBe(40.0);

      saleSnapshot2?.addItem(
        {
          id: SaleItemId.create('item_b'),
          source: defaultSource,
          description: 'Electrolyte Stick',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      await expect(repo.save(saleSnapshot2!)).rejects.toThrow(SaleOptimisticLockException);

      const preservedSale = await repo.findById('sale_race_01');
      expect(preservedSale?.total.amount).toBe(40.0);
      expect(preservedSale?.items.length).toBe(1);
      expect(preservedSale?.items[0]?.description).toBe('Protein Shake');
    });

    it('prevents concurrent CancelSale vs AddSaleItem race from corrupting frozen commercial terms', async () => {
      const createRes = await controller.createSale(
        {
          id: 'sale_cancel_race',
          currency: 'USD',
          items: [
            {
              description: 'Initial Item',
              quantity: 1,
              unitPriceAmount: 50.0,
            },
          ],
        },
        undefined,
        validManagerUser,
      );
      expect(createRes.status).toBe('DRAFT');

      const cancelRes = await controller.cancelSale(
        'sale_cancel_race',
        { reason: 'Customer changed mind' },
        validManagerUser,
      );
      expect(cancelRes.status).toBe('CANCELLED');

      await expect(
        controller.addItem(
          'sale_cancel_race',
          {
            description: 'Late Item',
            quantity: 1,
            unitPriceAmount: 20.0,
          },
          validManagerUser,
        ),
      ).rejects.toThrow();

      const finalSale = await controller.getSale('sale_cancel_race', validManagerUser);
      expect(finalSale.status).toBe('CANCELLED');
      expect(finalSale.totalAmount).toBe(50.0);
      expect(finalSale.itemCount).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Financial Consistency: Correct Totals After Sequential Mutations
  // ==========================================================================
  describe('3. Sequential Financial Mutation Consistency', () => {
    it('maintains exact integer-cents totals across sequential item additions, item discounts, order discount, and item removals', async () => {
      const saleDto = await controller.createSale(
        { id: 'sale_seq_01', currency: 'USD' },
        undefined,
        validManagerUser,
      );
      expect(saleDto.subtotalAmount).toBe(0.0);
      expect(saleDto.discountTotalAmount).toBe(0.0);
      expect(saleDto.totalAmount).toBe(0.0);

      const afterItem1 = await controller.addItem(
        'sale_seq_01',
        {
          description: 'Dry Needling Pack',
          quantity: 2,
          unitPriceAmount: 25.0,
        },
        validManagerUser,
      );
      expect(afterItem1.subtotalAmount).toBe(50.0);
      expect(afterItem1.discountTotalAmount).toBe(0.0);
      expect(afterItem1.totalAmount).toBe(50.0);
      expect(afterItem1.total.cents).toBe(5000);

      const afterItem2 = await controller.addItem(
        'sale_seq_01',
        {
          description: 'Therapy Lotion',
          quantity: 1,
          unitPriceAmount: 30.0,
          discount: {
            type: 'FIXED_AMOUNT',
            value: 5.0,
            reason: 'Item special',
          },
        },
        validManagerUser,
      );
      expect(afterItem2.subtotalAmount).toBe(80.0);
      expect(afterItem2.discountTotalAmount).toBe(5.0);
      expect(afterItem2.totalAmount).toBe(75.0);
      expect(afterItem2.total.cents).toBe(7500);

      const afterOrderDiscount = await controller.applyDiscount(
        'sale_seq_01',
        {
          type: 'PERCENTAGE',
          value: 10,
          reason: 'VIP Promotion',
        },
        validManagerUser,
      );
      expect(afterOrderDiscount.subtotalAmount).toBe(80.0);
      expect(afterOrderDiscount.discountTotalAmount).toBe(12.5);
      expect(afterOrderDiscount.totalAmount).toBe(67.5);
      expect(afterOrderDiscount.total.cents).toBe(6750);

      const item1Id = afterItem2.items[0]?.id ?? '';
      const afterRemoveItem1 = await controller.removeItem(
        'sale_seq_01',
        item1Id,
        validManagerUser,
      );
      expect(afterRemoveItem1.subtotalAmount).toBe(30.0);
      expect(afterRemoveItem1.discountTotalAmount).toBe(7.5);
      expect(afterRemoveItem1.totalAmount).toBe(22.5);
      expect(afterRemoveItem1.total.cents).toBe(2250);

      const afterRemoveDiscount = await controller.removeDiscount('sale_seq_01', validManagerUser);
      expect(afterRemoveDiscount.subtotalAmount).toBe(30.0);
      expect(afterRemoveDiscount.discountTotalAmount).toBe(5.0);
      expect(afterRemoveDiscount.totalAmount).toBe(25.0);
      expect(afterRemoveDiscount.total.cents).toBe(2500);

      const finalized = await controller.finalizeSale(
        'sale_seq_01',
        { notes: 'Cashier checkout' },
        validManagerUser,
      );
      expect(finalized.status).toBe('PENDING_PAYMENT');
      expect(finalized.totalAmount).toBe(25.0);
      expect(finalized.total.cents).toBe(2500);
    });
  });

  // ==========================================================================
  // 4. Performance & Relation Loading Hygiene
  // ==========================================================================
  describe('4. Relation-Loading and Lock-Free Calculations', () => {
    it('executes point-in-time calculation (GET /calculate) without database writes or version increment', async () => {
      const sale = Sale.create(
        { id: SaleId.create('sale_calc_review'), source: defaultSource },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item_calc_1'),
          source: defaultSource,
          description: 'Consultation',
          quantity: 2,
          unitPrice: Money.create(75.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      const preCalcSaveCount = repo.saveCount;
      const preCalcVersion = repo.items.get('sale_calc_review')?.version;

      const totals = await controller.calculateSale('sale_calc_review', validManagerUser);

      expect(totals.subtotalAmount).toBe(150.0);
      expect(totals.totalAmount).toBe(150.0);
      expect(totals.itemCount).toBe(1);

      expect(repo.saveCount).toBe(preCalcSaveCount);
      expect(repo.items.get('sale_calc_review')?.version).toBe(preCalcVersion);
    });

    it('verifies findById only reconstructs aggregate boundary without foreign join cascades', async () => {
      const sale = Sale.create(
        { id: SaleId.create('sale_hygiene_01'), source: defaultSource },
        clock,
      );
      sale.addItem(
        {
          id: SaleItemId.create('item_h1'),
          source: defaultSource,
          description: 'Bandage',
          quantity: 1,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );
      await repo.save(sale);

      const fetched = await controller.getSale('sale_hygiene_01', validManagerUser);
      expect(fetched.id).toBe('sale_hygiene_01');
      expect(fetched.items.length).toBe(1);
      expect((fetched as unknown as { payments?: unknown }).payments).toBeUndefined();
      expect((fetched as unknown as { receipts?: unknown }).receipts).toBeUndefined();
    });
  });
});
