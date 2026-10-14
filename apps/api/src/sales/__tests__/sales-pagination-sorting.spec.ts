import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Sale,
  SaleId,
  SourceReference,
  SourceType,
  SaleSource,
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
  ApplyDiscountHandler,
  CancelSaleHandler,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { ListSalesQueryDto, PaginatedSalesResponseDto } from '../dto';

class InMemorySaleRepository implements SaleRepositoryInterface {
  public readonly items = new Map<string, Sale>();
  public lastPagination?: FindSalesPagination;
  public lastSort?: FindSalesSort;
  public lastCriteria?: FindSalesCriteria;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const saleIdStr = typeof id === 'string' ? id : id.value;
    return this.items.get(saleIdStr) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
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

    // Apply primary sorting with deterministic secondary tie-breaker (id ASC)
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
      // Fixed secondary tie-breaker: id ASC
      return a.id.value.localeCompare(b.id.value);
    });

    const total = sales.length;

    let startIndex = (pagination.page - 1) * pagination.limit;
    if (pagination.cursor) {
      const cursorIndex = sales.findIndex((s) => s.id.value === pagination.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

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

describe('GET /sales Pagination & Sorting Architecture Contract Spec', () => {
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

  const createSaleWithAttributes = (props: {
    id: string;
    tenantId?: string;
    clientId?: string;
    unitPrice?: number;
    status?: string;
    createdAt?: Date;
    sourceType?: SourceType;
    sourceCode?: string;
  }): Sale => {
    const sale = Sale.create({
      id: SaleId.create(props.id),
      tenantId: props.tenantId ?? 'tenant_main',
      clientId: props.clientId ?? 'client_01',
      currency: 'USD',
      source: SourceReference.create({
        sourceType: props.sourceType ?? SourceType.INVENTORY_ITEM,
        sourceId: `item_${props.id}`,
        sourceCode: props.sourceCode ?? `CODE_${props.id}`,
      }),
    });

    if (props.unitPrice !== undefined && props.unitPrice > 0) {
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, `src_${props.id}`),
        description: `Line item for ${props.id}`,
        quantity: 1,
        unitPrice: Money.create(props.unitPrice, 'USD'),
      });
    }

    if (props.status === 'COMPLETED') {
      sale.finalize();
      sale.markPaid();
      sale.markCompleted();
    } else if (props.status === 'CANCELLED') {
      sale.cancel('Cancelled for test');
    }

    if (props.createdAt) {
      (sale as unknown as { _createdAt: Date })._createdAt = props.createdAt;
    }

    return sale;
  };

  // =========================================================================
  // 1. Default Pagination
  // =========================================================================
  describe('1. Default Pagination', () => {
    it('applies default pagination: page 1 and limit 20 when parameters are omitted', async () => {
      // Seed 25 sales
      for (let i = 1; i <= 25; i++) {
        const id = `sale_${String(i).padStart(3, '0')}`;
        await repository.save(createSaleWithAttributes({ id, unitPrice: i * 5 }));
      }

      const res = (await controller.listSales(
        {},
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
      )) as PaginatedSalesResponseDto;

      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.total).toBe(25);
      expect(res.totalPages).toBe(2);
      expect(res.items).toHaveLength(20);
      expect(res.hasNextPage).toBe(true);
      expect(res.hasPreviousPage).toBe(false);
      expect(repository.lastPagination).toEqual({ page: 1, limit: 20, cursor: undefined });
    });

    it('applies default pagination when undefined query object is passed', async () => {
      await repository.save(createSaleWithAttributes({ id: 'sale_single' }));

      const res = (await controller.listSales(
        undefined,
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
      )) as PaginatedSalesResponseDto;

      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(false);
    });
  });

  // =========================================================================
  // 2. Custom Page Size and Maximum Limit
  // =========================================================================
  describe('2. Custom Page Size and Maximum Limit', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) {
        const id = `sale_${String(i).padStart(3, '0')}`;
        await repository.save(createSaleWithAttributes({ id, unitPrice: i * 10 }));
      }
    });

    it('navigates to page 2 with custom limit 5', async () => {
      const queryDto: ListSalesQueryDto = { page: 2, limit: 5 };

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
      )) as PaginatedSalesResponseDto;

      expect(res.page).toBe(2);
      expect(res.limit).toBe(5);
      expect(res.total).toBe(15);
      expect(res.totalPages).toBe(3);
      expect(res.items).toHaveLength(5);
      expect(res.hasNextPage).toBe(true);
      expect(res.hasPreviousPage).toBe(true);
    });

    it('navigates to the final page with remaining items', async () => {
      const queryDto: ListSalesQueryDto = { page: 3, limit: 6 };

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
      )) as PaginatedSalesResponseDto;

      expect(res.page).toBe(3);
      expect(res.limit).toBe(6);
      expect(res.total).toBe(15);
      expect(res.totalPages).toBe(3);
      expect(res.items).toHaveLength(3); // 15 - (2 * 6) = 3 remaining
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(true);
    });

    it('rejects page size limit exceeding maximum allowed bound of 100 with 400 Bad Request', async () => {
      const queryDto: ListSalesQueryDto = { limit: 150 };

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

    it('accepts maximum valid page size limit of 100', async () => {
      const queryDto: ListSalesQueryDto = { limit: 100 };

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
      )) as PaginatedSalesResponseDto;

      expect(res.limit).toBe(100);
      expect(repository.lastPagination?.limit).toBe(100);
    });
  });

  // =========================================================================
  // 3. Invalid Pagination Values
  // =========================================================================
  describe('3. Invalid Pagination Values', () => {
    it('rejects page 0 with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { page: 0 },
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

    it('rejects negative page number with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { page: -3 },
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

    it('rejects non-integer floating-point page number with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { page: 2.7 },
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

    it('rejects non-numeric page string with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { page: 'invalid_page' as unknown as number },
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

    it('rejects limit 0 with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { limit: 0 },
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

    it('rejects negative limit with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { limit: -10 },
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

    it('rejects non-integer floating-point limit with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { limit: 12.5 },
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

    it('rejects non-numeric limit string with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { limit: 'NaN' as unknown as number },
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

    it('rejects whitespace-only cursor string with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { cursor: '    ' },
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

    it('rejects empty cursor string with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { cursor: '' },
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
  // 4. Every Approved Sortable Field
  // =========================================================================
  describe('4. Every Approved Sortable Field', () => {
    beforeEach(async () => {
      // Sale 1: $10, DRAFT, 2026-10-01
      await repository.save(
        createSaleWithAttributes({
          id: 'sale_01',
          unitPrice: 10,
          status: 'DRAFT',
          createdAt: new Date('2026-10-01T10:00:00.000Z'),
        }),
      );
      // Sale 2: $50, COMPLETED, 2026-10-03
      await repository.save(
        createSaleWithAttributes({
          id: 'sale_02',
          unitPrice: 50,
          status: 'COMPLETED',
          createdAt: new Date('2026-10-03T10:00:00.000Z'),
        }),
      );
      // Sale 3: $30, CANCELLED, 2026-10-02
      await repository.save(
        createSaleWithAttributes({
          id: 'sale_03',
          unitPrice: 30,
          status: 'CANCELLED',
          createdAt: new Date('2026-10-02T10:00:00.000Z'),
        }),
      );
    });

    it('sorts by createdAt DESC by default when sort parameters are omitted', async () => {
      const res = (await controller.listSales(
        {},
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
      )) as PaginatedSalesResponseDto;

      expect(res.items.map((i) => i.id)).toEqual(['sale_02', 'sale_03', 'sale_01']);
    });

    it('sorts by createdAt ASC when requested via sortField and sortDirection', async () => {
      const res = (await controller.listSales(
        { sortField: 'createdAt', sortDirection: 'asc' },
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
      )) as PaginatedSalesResponseDto;

      expect(res.items.map((i) => i.id)).toEqual(['sale_01', 'sale_03', 'sale_02']);
    });

    it('sorts by total DESC when requested via compound format sort=total.desc', async () => {
      const res = (await controller.listSales(
        { sort: 'total.desc' },
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
      )) as PaginatedSalesResponseDto;

      expect(res.items.map((i) => i.id)).toEqual([
        'sale_02', // $50
        'sale_03', // $30
        'sale_01', // $10
      ]);
    });

    it('sorts by total ASC when requested via compound format sort=total.asc', async () => {
      const res = (await controller.listSales(
        { sort: 'total.asc' },
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
      )) as PaginatedSalesResponseDto;

      expect(res.items.map((i) => i.id)).toEqual([
        'sale_01', // $10
        'sale_03', // $30
        'sale_02', // $50
      ]);
    });

    it('sorts by status ASC when requested via sort=status.asc', async () => {
      const res = (await controller.listSales(
        { sort: 'status.asc' },
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
      )) as PaginatedSalesResponseDto;

      // CANCELLED < COMPLETED < DRAFT
      expect(res.items.map((i) => i.id)).toEqual(['sale_03', 'sale_02', 'sale_01']);
    });

    it('sorts by status DESC when requested via sort=status.desc', async () => {
      const res = (await controller.listSales(
        { sort: 'status.desc' },
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
      )) as PaginatedSalesResponseDto;

      // DRAFT > COMPLETED > CANCELLED
      expect(res.items.map((i) => i.id)).toEqual(['sale_01', 'sale_02', 'sale_03']);
    });
  });

  // =========================================================================
  // 5. Unsupported Sort Fields and Directions
  // =========================================================================
  describe('5. Unsupported Sort Fields and Directions', () => {
    it('rejects un-allowlisted sortField with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { sortField: 'internalPasswordHash' },
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

    it('rejects compound sort with unknown field with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { sort: 'arbitrary_column.asc' },
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

    it('rejects invalid sortDirection with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { sortField: 'createdAt', sortDirection: 'sideways' },
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

    it('rejects compound sort with invalid direction with 400 Bad Request', async () => {
      await expect(
        controller.listSales(
          { sort: 'total.diagonal' },
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
  // 6. Equal Sort Values with Deterministic Ordering (Tie-Breaker)
  // =========================================================================
  describe('6. Equal Sort Values with Deterministic Ordering', () => {
    it('guarantees deterministic ordering via secondary sort id ASC when primary sort keys are equal', async () => {
      const fixedTime = new Date('2026-10-10T12:00:00.000Z');
      const fixedAmount = 45;

      // Seed 6 sales with identical timestamp and identical total amount in random ID order
      const ids = [
        'sale_zebra',
        'sale_alpha',
        'sale_charlie',
        'sale_bravo',
        'sale_echo',
        'sale_delta',
      ];
      for (const id of ids) {
        await repository.save(
          createSaleWithAttributes({
            id,
            unitPrice: fixedAmount,
            createdAt: fixedTime,
          }),
        );
      }

      // Page 1: limit 3
      const page1 = (await controller.listSales(
        { page: 1, limit: 3, sort: 'createdAt.desc' },
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
      )) as PaginatedSalesResponseDto;

      // Page 2: limit 3
      const page2 = (await controller.listSales(
        { page: 2, limit: 3, sort: 'createdAt.desc' },
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
      )) as PaginatedSalesResponseDto;

      const p1Ids = page1.items.map((i) => i.id);
      const p2Ids = page2.items.map((i) => i.id);

      // Deterministic tie-breaker id ASC produces exact alphabetical ordering
      expect(p1Ids).toEqual(['sale_alpha', 'sale_bravo', 'sale_charlie']);
      expect(p2Ids).toEqual(['sale_delta', 'sale_echo', 'sale_zebra']);

      // Guarantees zero duplicate IDs across pages
      const duplicates = p1Ids.filter((id) => p2Ids.includes(id));
      expect(duplicates).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. Empty Results and Out-of-Range Pages
  // =========================================================================
  describe('7. Empty Results and Out-of-Range Pages', () => {
    it('returns empty items array and zeroed pagination metadata when dataset is empty', async () => {
      const res = (await controller.listSales(
        {},
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
      )) as PaginatedSalesResponseDto;

      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.totalPages).toBe(0);
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(false);
    });

    it('returns empty items array and zeroed totalPages when filter matches zero records', async () => {
      await repository.save(createSaleWithAttributes({ id: 'sale_exists', clientId: 'client_A' }));

      const res = (await controller.listSales(
        { clientId: 'client_non_existent' },
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
      )) as PaginatedSalesResponseDto;

      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(false);
    });

    it('handles out-of-range page request (page > totalPages) gracefully by preserving metadata', async () => {
      // 5 total records seeded
      for (let i = 1; i <= 5; i++) {
        await repository.save(createSaleWithAttributes({ id: `sale_oor_${i}` }));
      }

      // Request page 10 with limit 5 (totalPages = 1)
      const res = (await controller.listSales(
        { page: 10, limit: 5 },
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
      )) as PaginatedSalesResponseDto;

      expect(res.items).toEqual([]);
      expect(res.total).toBe(5);
      expect(res.totalPages).toBe(1);
      expect(res.page).toBe(10);
      expect(res.limit).toBe(5);
      expect(res.hasNextPage).toBe(false);
      expect(res.hasPreviousPage).toBe(true);
    });
  });

  // =========================================================================
  // 8. Combined Filters, Sorting, and Pagination
  // =========================================================================
  describe('8. Combined Filters, Sorting, and Pagination', () => {
    beforeEach(async () => {
      // Seed 10 sales with various attributes
      for (let i = 1; i <= 10; i++) {
        const isClientTarget = i <= 6;
        await repository.save(
          createSaleWithAttributes({
            id: `sale_combo_${String(i).padStart(2, '0')}`,
            clientId: isClientTarget ? 'client_target' : 'client_other',
            unitPrice: i * 15,
            status: i % 2 === 0 ? 'COMPLETED' : 'DRAFT',
            sourceType: SourceType.INVENTORY_ITEM,
            sourceCode: `POS_REG_${i}`,
            createdAt: new Date(`2026-10-0${i}T12:00:00.000Z`),
          }),
        );
      }
    });

    it('preserves all search and filter parameters while paginating and sorting', async () => {
      // Filter: clientId = client_target, status = COMPLETED (items 2, 4, 6)
      // Sort: total DESC (item 6: $90, item 4: $60, item 2: $30)
      // Pagination: page 1, limit 2 -> items [item 6, item 4]
      const queryDto: ListSalesQueryDto = {
        clientId: 'client_target',
        status: 'COMPLETED',
        sort: 'total.desc',
        page: 1,
        limit: 2,
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
      )) as PaginatedSalesResponseDto;

      expect(res.total).toBe(3); // 3 items matched: sale_combo_02, 04, 06
      expect(res.totalPages).toBe(2);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(2);
      expect(res.hasNextPage).toBe(true);
      expect(res.hasPreviousPage).toBe(false);
      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.id).toBe('sale_combo_06'); // $90
      expect(res.items[1]!.id).toBe('sale_combo_04'); // $60

      // Page 2: should retrieve the last remaining matching item
      const page2 = (await controller.listSales(
        { ...queryDto, page: 2 },
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
      )) as PaginatedSalesResponseDto;

      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]!.id).toBe('sale_combo_02'); // $30
      expect(page2.hasNextPage).toBe(false);
      expect(page2.hasPreviousPage).toBe(true);
    });
  });

  // =========================================================================
  // 9. Stable Response Metadata & Zero Raw Prisma Exposure
  // =========================================================================
  describe('9. Stable Response Metadata & Clean DTOs', () => {
    it('returns consistent pagination metadata and avoids exposing raw Prisma or domain aggregate internals', async () => {
      await repository.save(
        createSaleWithAttributes({
          id: 'sale_meta_01',
          unitPrice: 25.5,
          sourceCode: 'TERM_POS_1',
        }),
      );

      const res = (await controller.listSales(
        {},
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
      )) as PaginatedSalesResponseDto;

      // Metadata envelope verification
      expect(res).toHaveProperty('items');
      expect(res).toHaveProperty('total', 1);
      expect(res).toHaveProperty('page', 1);
      expect(res).toHaveProperty('limit', 20);
      expect(res).toHaveProperty('totalPages', 1);
      expect(res).toHaveProperty('hasNextPage', false);
      expect(res).toHaveProperty('hasPreviousPage', false);

      // Summary item cleanliness verification
      const item = res.items[0]!;
      expect(item.id).toBe('sale_meta_01');
      expect(item.totalAmount).toBe(25.5);
      expect(item.total).toEqual({
        amount: 25.5,
        currency: 'USD',
        formatted: '25.50',
        cents: 2550,
      });
      expect(item.sourceReference).toBeDefined();

      // Ensure no raw items array or internal entity fields leaked
      expect((item as unknown as Record<string, unknown>)._items).toBeUndefined();
      expect((item as unknown as Record<string, unknown>)._events).toBeUndefined();
      expect((item as unknown as Record<string, unknown>).items).toBeUndefined();
    });
  });

  // =========================================================================
  // 10. Authorization & Access Restrictions
  // =========================================================================
  describe('10. Authorization & Access Restrictions', () => {
    it('automatically scopes queries to authenticated client ID for Client role', async () => {
      await repository.save(
        createSaleWithAttributes({ id: 'sale_client_own', clientId: 'client_current' }),
      );
      await repository.save(
        createSaleWithAttributes({ id: 'sale_client_other', clientId: 'client_other' }),
      );

      const clientUser: AuthenticatedUserPayload = {
        id: 'client_current',
        email: 'client@kinergy.com',
        status: 'ACTIVE',
        roles: ['Client'],
        permissions: ['sales.read'],
        tenantId: 'tenant_main',
      };

      const res = (await controller.listSales(
        { clientId: 'client_other' }, // Attempts to query another client's sales
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        clientUser,
      )) as PaginatedSalesResponseDto;

      // Clamped to caller's own client ID
      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_client_own');
      expect(repository.lastCriteria?.clientId).toBe('client_current');
    });

    it('enforces tenant isolation preventing cross-tenant sales leakage', async () => {
      await repository.save(
        createSaleWithAttributes({ id: 'sale_tenant_A', tenantId: 'tenant_main' }),
      );
      await repository.save(
        createSaleWithAttributes({ id: 'sale_tenant_B', tenantId: 'tenant_foreign' }),
      );

      const res = (await controller.listSales(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        validManagerUser, // belongs to tenant_main
      )) as PaginatedSalesResponseDto;

      expect(res.total).toBe(1);
      expect(res.items[0]!.id).toBe('sale_tenant_A');
    });
  });
});
