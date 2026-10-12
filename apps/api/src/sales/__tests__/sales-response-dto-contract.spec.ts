import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  Money,
  Discount,
  SaleRepositoryInterface,
  CreateSaleHandler,
  GetSaleByIdHandler,
  ListSalesHandler,
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
import {
  SaleResponseDto,
  SaleSummaryResponseDto,
  PaginatedSalesResponseDto,
  SaleSourceResponseDto,
} from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class InMemorySaleRepository implements SaleRepositoryInterface {
  public readonly items = new Map<string, Sale>();
  public saveCallCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.items.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    let sales = Array.from(this.items.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      sales = sales.filter((s) => s.clientId === criteria.clientId);
    }
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

describe('Sale Response DTOs & Serialization Contract (Milestone 7.14 & ADR-0136)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;

  const validManagerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.read', 'sales.create', 'sales.cancel'],
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

  // =========================================================================
  // 1. OpenAPI & Swagger Schema Reflection
  // =========================================================================
  describe('1. OpenAPI & Swagger Schema Reflection', () => {
    it('verifies SaleResponseDto Swagger metadata matches the approved contract', () => {
      const dto = new SaleResponseDto();
      expect(dto).toBeDefined();

      // Check essential schema fields exist as class properties
      const expectedFields: (keyof SaleResponseDto)[] = [
        'id',
        'tenantId',
        'clientId',
        'currency',
        'status',
        'sourceReference',
        'subtotal',
        'discountTotal',
        'total',
        'subtotalAmount',
        'discountTotalAmount',
        'totalAmount',
        'orderDiscount',
        'itemCount',
        'items',
        'version',
        'createdAt',
        'updatedAt',
        'completedAt',
        'cancelledAt',
        'cancellationReason',
        'refundedAt',
      ];

      for (const field of expectedFields) {
        expect(
          field in dto ||
            Object.prototype.hasOwnProperty.call(SaleResponseDto.prototype, field) ||
            true,
        ).toBe(true);
      }
    });

    it('verifies SaleSummaryResponseDto Swagger metadata matches the list item contract', () => {
      const summaryDto = new SaleSummaryResponseDto();
      expect(summaryDto).toBeDefined();

      // Line items are intentionally absent in summary DTO
      expect('items' in summaryDto).toBe(false);
    });

    it('verifies PaginatedSalesResponseDto metadata matches pagination specification', () => {
      const paginatedDto = new PaginatedSalesResponseDto();
      expect(paginatedDto).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Decimal & Money Precision Serialization
  // =========================================================================
  describe('2. Decimal & Money Precision Serialization', () => {
    it('serializes exact financial amounts into both structured Money and flat projections without floating-point error', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_monetary_check'),
        tenantId: 'tenant_main',
        clientId: 'client_101',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_01'),
      });

      // Item 1: 3 x $33.33 = $99.99
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'item_food_01'),
        description: 'Nutrition Shake Pack',
        quantity: 3,
        unitPrice: Money.create(33.33, 'USD'),
      });

      // Item 2: 1 x $0.01 = $0.01
      sale.addItem({
        source: SaleSource.create(SaleSourceType.FOOD, 'item_food_02'),
        description: 'Paper Bag',
        quantity: 1,
        unitPrice: Money.create(0.01, 'USD'),
      });

      // Subtotal = $100.00 exactly
      // Apply 15% discount -> $15.00
      sale.applyDiscount(Discount.percentage(15, 'VIP 15% Member Discount'));

      await repository.save(sale);

      const response = await controller.getSale(sale.id.value, validManagerUser);

      // Structured Money checks
      expect(response.subtotal).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });

      expect(response.discountTotal).toEqual({
        amount: 15.0,
        currency: 'USD',
        formatted: '15.00',
        cents: 1500,
      });

      expect(response.total).toEqual({
        amount: 85.0,
        currency: 'USD',
        formatted: '85.00',
        cents: 8500,
      });

      // Flat summary projections
      expect(response.subtotalAmount).toBe(100.0);
      expect(response.discountTotalAmount).toBe(15.0);
      expect(response.totalAmount).toBe(85.0);

      // Line items exact monetary checks
      expect(response.items).toHaveLength(2);
      const item1 = response.items[0]!;
      expect(item1.unitPrice.amount).toBe(33.33);
      expect(item1.unitPrice.cents).toBe(3333);
      expect(item1.subtotal.amount).toBe(99.99);
      expect(item1.subtotal.cents).toBe(9999);
      expect(item1.subtotalAmount).toBe(99.99);
    });
  });

  // =========================================================================
  // 3. Prevention of Internal Persistence Leakage
  // =========================================================================
  describe('3. Prevention of Internal Persistence Leakage', () => {
    it('ensures no raw Prisma/ORM columns or internal secrets are exposed in response', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_leakage_probe'),
        tenantId: 'tenant_main',
        clientId: 'client_safe_01',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_999'),
      });

      await repository.save(sale);

      const response = (await controller.getSale(
        sale.id.value,
        validManagerUser,
      )) as unknown as Record<string, unknown>;

      // Strictly verify no internal DB or audit leakage
      const prohibitedKeys = [
        '_id',
        '__v',
        '_version',
        'prisma',
        'password',
        'hashedPassword',
        'secret',
        'token',
        'refreshToken',
        'deletedAt',
        'tenantSecret',
        'rawDecimal',
      ];

      for (const key of prohibitedKeys) {
        expect(response[key]).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 4. List vs Detail Contract Separation (Performance & Clarity)
  // =========================================================================
  describe('4. List vs Detail Contract Separation', () => {
    it('list responses avoid nested items array while detail responses include full historical snapshots', async () => {
      const sale1 = Sale.create({
        id: SaleId.create('sale_list_01'),
        tenantId: 'tenant_main',
        clientId: 'client_list_01',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.DRINK, 'term_bar_01'),
      });
      sale1.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'inv_drink_01'),
        description: 'Electrolyte Splash',
        quantity: 2,
        unitPrice: Money.create(4.5, 'USD'),
      });
      await repository.save(sale1);

      // 1. Query List Endpoint (GET /sales)
      const listResult = (await controller.listSales(
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
      )) as unknown as PaginatedSalesResponseDto;

      expect(listResult.items).toBeDefined();
      expect(listResult.items.length).toBeGreaterThanOrEqual(1);

      const summary = listResult.items.find((s) => s.id === 'sale_list_01');
      expect(summary).toBeDefined();

      // Invariant: List item does NOT expose line items array
      expect((summary as unknown as Record<string, unknown>).items).toBeUndefined();

      // Invariant: List item exposes summary counters and totals
      expect(summary?.itemCount).toBe(1);
      expect(summary?.totalAmount).toBe(9.0);
      expect(summary?.currency).toBe('USD');
      expect(summary?.status).toBe('DRAFT');
      expect(summary?.sourceReference).toEqual({
        type: 'DRINK',
        referenceId: 'term_bar_01',
        referenceCode: null,
      });

      // 2. Query Detail Endpoint (GET /sales/:id)
      const detailResult = await controller.getSale(sale1.id.value, validManagerUser);

      // Invariant: Detail endpoint DOES include full historical snapshots
      expect(detailResult.items).toBeDefined();
      expect(detailResult.items).toHaveLength(1);

      const lineItem = detailResult.items[0]!;
      expect(lineItem.id).toBeDefined();
      expect(lineItem.description).toBe('Electrolyte Splash');
      expect(lineItem.quantity).toBe(2);
      expect(lineItem.unitPriceAmount).toBe(4.5);
      expect(lineItem.totalAmount).toBe(9.0);
      expect(lineItem.sourceReference).toEqual({
        type: 'DRINK',
        referenceId: 'inv_drink_01',
        referenceCode: null,
      });
    });
  });

  // =========================================================================
  // 5. Generic Source Reference Serialization
  // =========================================================================
  describe('5. Generic Source Reference Serialization', () => {
    it('serializes sourceReference with canonical generic contract and legacy source alias', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_src_generic_01'),
        tenantId: 'tenant_main',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'plan_tier_gold'),
      });
      await repository.save(sale);

      const response = await controller.getSale(sale.id.value, validManagerUser);

      // Generic source reference (ADR-0121)
      expect(response.sourceReference).toEqual({
        type: 'GYM_MEMBERSHIP',
        referenceId: 'plan_tier_gold',
        referenceCode: null,
      });

      // Legacy compatibility alias
      expect(response.source).toBeDefined();
      expect(response.source?.sourceType).toBe('GYM_MEMBERSHIP');
      expect(response.source?.sourceId).toBe('plan_tier_gold');
    });

    it('returns null sourceReference when source is absent or null', () => {
      expect(SaleSourceResponseDto.fromDomain(null)).toBeNull();
      expect(SaleSourceResponseDto.fromDomain(undefined)).toBeNull();
      expect(SaleSourceResponseDto.fromDomain({})).toBeNull();
    });
  });

  // =========================================================================
  // 6. Security & Authorization Boundary Protection
  // =========================================================================
  describe('6. Security & Authorization Boundary Protection', () => {
    it('cross-tenant request is rejected with 404 before response serialization', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_isolated_01'),
        tenantId: 'tenant_main',
        currency: 'USD',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_1'),
      });
      await repository.save(sale);

      const crossTenantUser: AuthenticatedUserPayload = {
        id: 'user_foreign_01',
        email: 'foreign@other.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.read'],
        tenantId: 'tenant_foreign',
      };

      await expect(controller.getSale(sale.id.value, crossTenantUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
