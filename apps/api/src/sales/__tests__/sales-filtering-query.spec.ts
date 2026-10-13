import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  SourceReference,
  SourceType,
  Money,
  SaleRepositoryInterface,
  ListSalesHandler,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyDiscountHandler,
  CancelSaleHandler,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  MoneyMapper,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { PaginatedSalesResponseDto, ListSalesQueryDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class InMemorySaleRepository implements SaleRepositoryInterface {
  public readonly items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
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

    // Apply sorting
    sales.sort((a, b) => {
      let comparison: number;
      if (sort.field === 'total') {
        comparison = a.total.amount - b.total.amount;
      } else if (sort.field === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      }
      return sort.direction === 'desc' ? -comparison : comparison;
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
}

describe('GET /sales Filtering and Search Capabilities Contract Spec', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;

  const validManagerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read', 'sales.create'],
    tenantId: 'tenant_main',
  };

  beforeEach(async () => {
    repository = new InMemorySaleRepository();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: repository,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: { findById: jest.fn(), findBySaleId: jest.fn(), save: jest.fn() },
        },
        {
          provide: CreateSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new CreateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: (repo: InMemorySaleRepository) => new GetSaleByIdHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ListSalesHandler,
          useFactory: (repo: InMemorySaleRepository) => new ListSalesHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AddSaleItemHandler,
          useFactory: (repo: InMemorySaleRepository) => new AddSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: RemoveSaleItemHandler,
          useFactory: (repo: InMemorySaleRepository) => new RemoveSaleItemHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ApplyDiscountHandler,
          useFactory: (repo: InMemorySaleRepository) => new ApplyDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new CancelSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SalesController>(SalesController);
  });

  // Helper to populate test sales dataset
  async function seedTestSales() {
    // Sale 1: Client A, Food, Completed, created 2026-10-05
    const sale1 = Sale.create({
      id: SaleId.create('sale_001'),
      tenantId: 'tenant_main',
      clientId: 'client_A',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_snack_01',
        sourceCode: 'POS_REGISTER_1',
      }),
    });
    sale1.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'food_01'),
      description: 'Protein Bar',
      quantity: 1,
      unitPrice: Money.create(5, 'USD'),
    });
    sale1.finalize();
    sale1.markPaid();
    sale1.markCompleted();
    (sale1 as unknown as { _createdAt: Date })._createdAt = new Date('2026-10-05T12:00:00.000Z');
    await repository.save(sale1);

    // Sale 2: Client A, Gym Membership, Draft, created 2026-10-10
    const sale2 = Sale.create({
      id: SaleId.create('sale_002'),
      tenantId: 'tenant_main',
      clientId: 'client_A',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_plan_gold',
        sourceCode: 'MEM_GOLD_2026',
      }),
    });
    sale2.addItem({
      source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'plan_gold'),
      description: 'Gold Membership',
      quantity: 1,
      unitPrice: Money.create(100, 'USD'),
    });
    (sale2 as unknown as { _createdAt: Date })._createdAt = new Date('2026-10-10T14:00:00.000Z');
    await repository.save(sale2);

    // Sale 3: Client B, Drink, Cancelled, created 2026-10-15
    const sale3 = Sale.create({
      id: SaleId.create('sale_003'),
      tenantId: 'tenant_main',
      clientId: 'client_B',
      currency: 'USD',
      source: SaleSource.create(SaleSourceType.DRINK, 'term_bar_02'),
    });
    sale3.addItem({
      source: SaleSource.create(SaleSourceType.DRINK, 'inv_drink_02'),
      description: 'Isotonic Drink',
      quantity: 2,
      unitPrice: Money.create(3, 'USD'),
    });
    sale3.cancel('Customer walked away');
    (sale3 as unknown as { _createdAt: Date })._createdAt = new Date('2026-10-15T16:00:00.000Z');
    await repository.save(sale3);

    // Sale 4: Foreign Tenant, Client A, Food, Draft
    const sale4 = Sale.create({
      id: SaleId.create('sale_004'),
      tenantId: 'tenant_foreign',
      clientId: 'client_A',
      currency: 'USD',
      source: SaleSource.create(SaleSourceType.FOOD, 'foreign_pos'),
    });
    await repository.save(sale4);
  }

  // =========================================================================
  // 1. Independent Filter Testing
  // =========================================================================
  describe('1. Independent Filters', () => {
    beforeEach(async () => {
      await seedTestSales();
    });

    it('filters sales independently by search text matching Sale ID', async () => {
      const queryDto: ListSalesQueryDto = { q: 'sale_002' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_002');
    });

    it('filters sales independently by search text matching sourceCode substring (case-insensitive)', async () => {
      const queryDto: ListSalesQueryDto = { search: 'gold_2026' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_002');
    });

    it('filters sales independently by search text matching sourceId', async () => {
      const queryDto: ListSalesQueryDto = { search: 'term_bar_02' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_003');
    });

    it('filters sales independently by clientId', async () => {
      const queryDto: ListSalesQueryDto = { clientId: 'client_A' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(2);
      expect(res.items.every((i) => i.clientId === 'client_A')).toBe(true);
    });

    it('filters sales independently by status', async () => {
      const queryDto: ListSalesQueryDto = { status: 'COMPLETED' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.status).toBe('COMPLETED');
      expect(res.items[0]!.id).toBe('sale_001');
    });

    it('filters sales independently by sourceType', async () => {
      const queryDto: ListSalesQueryDto = { sourceType: 'DRINK' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_003');
    });

    it('filters sales independently by sourceReferenceId', async () => {
      const queryDto: ListSalesQueryDto = { sourceReferenceId: 'mem_plan_gold' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_002');
    });

    it('filters sales independently by fromDate', async () => {
      const queryDto: ListSalesQueryDto = { fromDate: '2026-10-12T00:00:00.000Z' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_003');
    });

    it('filters sales independently by toDate', async () => {
      const queryDto: ListSalesQueryDto = { toDate: '2026-10-06T00:00:00.000Z' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_001');
    });
  });

  // =========================================================================
  // 2. Combinations of Multiple Filters
  // =========================================================================
  describe('2. Combinations of Multiple Filters', () => {
    beforeEach(async () => {
      await seedTestSales();
    });

    it('correctly intersects multiple filters simultaneously without unintended matches', async () => {
      const queryDto: ListSalesQueryDto = {
        clientId: 'client_A',
        status: 'DRAFT',
        sourceType: 'MEMBERSHIP_PLAN',
        search: 'gold',
      };

      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_002');
    });

    it('returns empty result when combined filters produce zero intersection', async () => {
      const queryDto: ListSalesQueryDto = {
        clientId: 'client_A',
        status: 'CANCELLED', // Client A has no cancelled sales
      };

      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(0);
      expect(res.items).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. Search Edge Cases (Empty, Whitespace)
  // =========================================================================
  describe('3. Empty & Whitespace Search Values', () => {
    beforeEach(async () => {
      await seedTestSales();
    });

    it('treats empty search string as no-op and returns all tenant sales', async () => {
      const queryDto: ListSalesQueryDto = { q: '' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(3);
    });

    it('treats whitespace-only search string as no-op and returns all tenant sales', async () => {
      const queryDto: ListSalesQueryDto = { search: '     ' };
      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(3);
    });
  });

  // =========================================================================
  // 4. Invalid Filters & Validation Rejection
  // =========================================================================
  describe('4. Invalid Filters Validation', () => {
    it('rejects invalid sourceType with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = { sourceType: 'UNSUPPORTED_TYPE_XYZ' };

      await expect(
        controller.listSales(
          queryDto,
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
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid status with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = { status: 'BOGUS_STATUS' };

      await expect(
        controller.listSales(
          queryDto,
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
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed fromDate with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = { fromDate: 'not-a-real-date' };

      await expect(
        controller.listSales(
          queryDto,
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
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed toDate with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = { toDate: 'not-a-real-date' };

      await expect(
        controller.listSales(
          queryDto,
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
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when fromDate is after toDate with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = {
        fromDate: '2026-10-31T00:00:00.000Z',
        toDate: '2026-10-01T00:00:00.000Z',
      };

      await expect(
        controller.listSales(
          queryDto,
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
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 5. Date Boundary Behavior (Inclusivity)
  // =========================================================================
  describe('5. Date Boundary Behavior', () => {
    beforeEach(async () => {
      await seedTestSales();
    });

    it('includes records exactly matching the boundary timestamps (inclusive boundary)', async () => {
      // Sale 2 was created at exactly 2026-10-10T14:00:00.000Z
      const queryDto: ListSalesQueryDto = {
        fromDate: '2026-10-10T14:00:00.000Z',
        toDate: '2026-10-10T14:00:00.000Z',
      };

      const res = (await controller.listSales(
        queryDto,
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_002');
    });
  });

  // =========================================================================
  // 6. Multi-Tenant Isolation
  // =========================================================================
  describe('6. Multi-Tenant Isolation Protection', () => {
    beforeEach(async () => {
      await seedTestSales();
    });

    it('never returns sales belonging to another tenant even when search matches', async () => {
      // sale_004 is in tenant_foreign and has 'foreign_pos'
      const queryDto: ListSalesQueryDto = { search: 'foreign' };

      const res = (await controller.listSales(
        queryDto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        validManagerUser, // caller belongs to tenant_main
      )) as unknown as PaginatedSalesResponseDto;

      expect(res.total).toBe(0);
      expect(res.items).toHaveLength(0);
    });
  });
});
