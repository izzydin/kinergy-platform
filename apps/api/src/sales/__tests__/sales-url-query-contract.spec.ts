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
import { ListSalesQueryDto } from '../dto/list-sales-query.dto';
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
      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
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
}

describe('Sales API Query Contract Verification (Frontend URL-driven DataTable standard)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;

  const mockStaffUser: AuthenticatedUserPayload = {
    id: 'user_manager_1',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read', 'sales.create', 'sales.manage'],
    tenantId: 'tenant_contract_test',
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

    // Populate test sales
    const baseDate = new Date('2026-10-10T12:00:00.000Z');

    const sale1 = Sale.create({
      id: SaleId.create('sale_001'),
      tenantId: 'tenant_contract_test',
      clientId: 'client_alpha',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'pos_term_1',
        sourceCode: 'REGISTER_FRONT',
      }),
    });
    sale1.addItem({
      source: SaleSource.create(SaleSourceType.DRINK, 'item_shake'),
      description: 'Protein Shake',
      quantity: 1,
      unitPrice: Money.create(15, 'USD'),
    });
    (sale1 as unknown as { _createdAt: Date })._createdAt = new Date(
      baseDate.getTime() - 86400000 * 2,
    ); // Oct 8

    const sale2 = Sale.create({
      id: SaleId.create('sale_002'),
      tenantId: 'tenant_contract_test',
      clientId: 'client_beta',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_gold_1',
        sourceCode: 'MEM_GOLD_2026',
      }),
    });
    sale2.addItem({
      source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'item_gold'),
      description: 'Gold Membership',
      quantity: 1,
      unitPrice: Money.create(120, 'USD'),
    });
    sale2.finalize(); // PENDING_PAYMENT
    (sale2 as unknown as { _createdAt: Date })._createdAt = new Date(
      baseDate.getTime() - 86400000 * 1,
    ); // Oct 9

    const sale3 = Sale.create({
      id: SaleId.create('sale_003'),
      tenantId: 'tenant_contract_test',
      clientId: 'client_alpha',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'kitchen_pos_2',
        sourceCode: 'REGISTER_KITCHEN',
      }),
    });
    sale3.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'item_bowl'),
      description: 'Acai Bowl',
      quantity: 1,
      unitPrice: Money.create(25, 'USD'),
    });
    sale3.finalize();
    sale3.markPaid(); // PAID
    (sale3 as unknown as { _createdAt: Date })._createdAt = baseDate; // Oct 10

    await repository.save(sale1);
    await repository.save(sale2);
    await repository.save(sale3);
  });

  describe('1. Search Filter Contract (q / search)', () => {
    it('matches sourceCode substring via standard frontend "q" parameter', async () => {
      const dto: ListSalesQueryDto = { q: 'REGISTER_FRONT' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(1);
      expect(res.items?.[0]?.id).toBe('sale_001');
    });

    it('matches sourceCode substring via alias "search" parameter', async () => {
      const dto: ListSalesQueryDto = { search: 'REGISTER_KITCHEN' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(1);
      expect(res.items?.[0]?.id).toBe('sale_003');
    });
  });

  describe('2. Client Filter Contract (clientId)', () => {
    it('filters sales strictly matching clientId', async () => {
      const dto: ListSalesQueryDto = { clientId: 'client_alpha' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(2);
      expect(res.items?.map((i) => i.id)).toEqual(expect.arrayContaining(['sale_001', 'sale_003']));
    });
  });

  describe('3. Source Type and Source Reference Contract (sourceType, sourceReferenceId)', () => {
    it('filters sales by sourceType and normalizes casing', async () => {
      const dto: ListSalesQueryDto = { sourceType: 'inventory_item' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(2);
      expect(res.items?.map((i) => i.id)).toEqual(expect.arrayContaining(['sale_001', 'sale_003']));
    });

    it('filters sales by sourceReferenceId', async () => {
      const dto: ListSalesQueryDto = { sourceReferenceId: 'mem_gold_1' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(1);
      expect(res.items?.[0]?.id).toBe('sale_002');
    });

    it('rejects unsupported sourceType with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = { sourceType: 'TOTALLY_UNKNOWN_SOURCE' };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Sale Status Filter Contract (status)', () => {
    it('filters sales by status and handles case-insensitivity', async () => {
      const dto: ListSalesQueryDto = { status: 'paid' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(1);
      expect(res.items?.[0]?.id).toBe('sale_003');
      expect(res.items?.[0]?.status).toBe('PAID');
    });

    it('rejects invalid status with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = { status: 'BOGUS_STATUS' };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. Date Range Contract (fromDate, toDate, and dateFrom, dateTo aliases)', () => {
    it('filters sales with fromDate and toDate bounds', async () => {
      const dto: ListSalesQueryDto = {
        fromDate: '2026-10-09T00:00:00.000Z',
        toDate: '2026-10-10T23:59:59.999Z',
      };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(2);
      expect(res.items?.map((i) => i.id)).toEqual(['sale_003', 'sale_002']);
    });

    it('supports dateFrom and dateTo aliases identically', async () => {
      const dto: ListSalesQueryDto = {
        dateFrom: '2026-10-09T00:00:00.000Z',
        dateTo: '2026-10-10T23:59:59.999Z',
      };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.total).toBe(2);
      expect(res.items?.map((i) => i.id)).toEqual(['sale_003', 'sale_002']);
    });

    it('rejects inverted date range (fromDate > toDate) with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = {
        fromDate: '2026-10-15T00:00:00.000Z',
        toDate: '2026-10-01T00:00:00.000Z',
      };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Pagination Contract (page, limit)', () => {
    it('applies default page=1 and limit=20 when omitted', async () => {
      const dto: ListSalesQueryDto = {};
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.total).toBe(3);
      expect(res.items?.length).toBe(3);
    });

    it('slices items correctly for custom page and limit', async () => {
      const dto: ListSalesQueryDto = { page: 2, limit: 1 };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.page).toBe(2);
      expect(res.limit).toBe(1);
      expect(res.total).toBe(3);
      expect(res.totalPages).toBe(3);
      expect(res.items?.length).toBe(1);
      expect(res.hasNextPage).toBe(true);
      expect(res.hasPreviousPage).toBe(true);
    });

    it('rejects limit exceeding maximum cap of 100 with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = { limit: 101 };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns empty items array for page beyond total count without error', async () => {
      const dto: ListSalesQueryDto = { page: 99, limit: 20 };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.page).toBe(99);
      expect(res.items).toEqual([]);
      expect(res.total).toBe(3);
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(true);
    });
  });

  describe('7. Sorting Contract (compound sort & discrete sortField/sortDirection)', () => {
    it('parses frontend compound sort format "total.asc"', async () => {
      const dto: ListSalesQueryDto = { sort: 'total.asc' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.items?.[0]?.id).toBe('sale_001'); // $15
      expect(res.items?.[1]?.id).toBe('sale_003'); // $25
      expect(res.items?.[2]?.id).toBe('sale_002'); // $120
    });

    it('parses frontend compound sort format "totalAmount.desc"', async () => {
      const dto: ListSalesQueryDto = { sort: 'totalAmount.desc' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.items?.[0]?.id).toBe('sale_002'); // $120
      expect(res.items?.[1]?.id).toBe('sale_003'); // $25
      expect(res.items?.[2]?.id).toBe('sale_001'); // $15
    });

    it('parses discrete sortField="totalAmount" and sortDirection="desc"', async () => {
      const dto: ListSalesQueryDto = { sortField: 'totalAmount', sortDirection: 'desc' };
      const res = await controller.listSales(
        dto,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockStaffUser,
      );

      expect(res.items?.[0]?.id).toBe('sale_002');
      expect(res.items?.[1]?.id).toBe('sale_003');
      expect(res.items?.[2]?.id).toBe('sale_001');
    });

    it('rejects unwhitelisted sortField with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = { sort: 'password_hash.asc' };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid sortDirection with 400 Bad Request', async () => {
      const dto: ListSalesQueryDto = { sort: 'createdAt.sideways' };
      await expect(
        controller.listSales(
          dto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
