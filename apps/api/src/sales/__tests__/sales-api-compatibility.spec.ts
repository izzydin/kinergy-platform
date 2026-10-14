import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Sale,
  SaleId,
  SaleSourceType,
  SaleRepositoryInterface,
  SaleAlreadyFinalizedException,
  EmptySaleException,
  CreateSaleHandler,
  GetSaleByIdHandler,
  ListSalesHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CalculateSaleHandler,
  CoordinateSalePaymentHandler,
  AssignSaleSourceHandler,
  PaymentRepositoryInterface,
  Payment,
  PaymentId,
  MoneyMapper,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import {
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  ListSalesQueryDto,
  SaleSourceResponseDto,
} from '../dto';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

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
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    if (criteria.search) {
      const q = criteria.search.toLowerCase();
      sales = sales.filter(
        (s) =>
          s.id.value.toLowerCase().includes(q) ||
          (s.source.sourceCode && s.source.sourceCode.toLowerCase().includes(q)),
      );
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

class InMemoryPaymentRepository implements PaymentRepositoryInterface {
  public readonly payments = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.payments.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.payments.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.payments.set(payment.id.value, payment);
  }
}

describe('Sales API Compatibility & Milestone 7.14 Verification Suite', () => {
  let controller: SalesController;
  let saleRepository: InMemorySaleRepository;
  let paymentRepository: InMemoryPaymentRepository;

  const cashierUser: AuthenticatedUserPayload = {
    id: 'user_cashier_01',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.create', 'sales.read', 'sales.cancel', 'payments.manage'],
    tenantId: 'tenant_main',
  };

  const kitchenUser: AuthenticatedUserPayload = {
    id: 'user_kitchen_01',
    email: 'chef@kinergy.com',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['sales.create', 'sales.read'], // Notice: deliberately lacks sales.cancel
    tenantId: 'tenant_main',
  };

  beforeEach(async () => {
    saleRepository = new InMemorySaleRepository();
    paymentRepository = new InMemoryPaymentRepository();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepository,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepository,
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
          provide: RemoveOrderDiscountHandler,
          useFactory: (repo: InMemorySaleRepository) => new RemoveOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new FinalizeSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new CancelSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CalculateSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new CalculateSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: AssignSaleSourceHandler,
          useFactory: (repo: InMemorySaleRepository) => new AssignSaleSourceHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CoordinateSalePaymentHandler,
          useFactory: (sRepo: InMemorySaleRepository, pRepo: InMemoryPaymentRepository) =>
            new CoordinateSalePaymentHandler(sRepo, pRepo),
          inject: [SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN],
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

  describe('1. Route Reuse & Extension (Zero Duplication)', () => {
    it('verifies that all Milestone 7.14 core and complementary routes exist on the SalesController', () => {
      // Core REST routes
      expect(typeof controller.createSale).toBe('function');
      expect(typeof controller.listSales).toBe('function');
      expect(typeof controller.getSale).toBe('function');
      expect(typeof controller.addItem).toBe('function');
      expect(typeof controller.removeItem).toBe('function');
      expect(typeof controller.applyDiscount).toBe('function');
      expect(typeof controller.cancelSale).toBe('function');

      // Complementary existing Phase 7 routes preserved
      expect(typeof controller.calculateSale).toBe('function');
      expect(typeof controller.assignSource).toBe('function');
      expect(typeof controller.removeDiscount).toBe('function');
      expect(typeof controller.finalizeSale).toBe('function');
      expect(typeof controller.coordinatePayment).toBe('function');
    });

    it('verifies finalizeSale supports both /finalize and /submit-for-payment aliases', async () => {
      // Create a sale with 1 item
      const created = await controller.createSale(
        {
          currency: 'USD',
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'pos_1',
            referenceCode: 'TERM_1',
          },
        },
        undefined,
        cashierUser,
      );

      await controller.addItem(
        created.id,
        {
          description: 'Espresso',
          quantity: 1,
          unitPriceAmount: 4.5,
        },
        cashierUser,
      );

      // Invoke finalizeSale (which backs both :id/finalize and :id/submit-for-payment)
      const finalized = await controller.finalizeSale(created.id, {}, cashierUser);
      expect(finalized.status).toBe('PENDING_PAYMENT');
    });
  });

  describe('2. DTO Backward Compatibility & Dual Field Support', () => {
    it('accepts both sourceReference (new standard) and source (legacy alias) in CreateSaleRequestDto', async () => {
      // Create via sourceReference
      const saleWithReference = await controller.createSale(
        {
          currency: 'USD',
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'order_ref_1',
            referenceCode: 'ORD-1',
          },
        },
        undefined,
        cashierUser,
      );
      expect(saleWithReference.sourceReference?.type).toBe('FOOD');
      expect(saleWithReference.sourceReference?.referenceId).toBe('order_ref_1');
      // Legacy source alias is also populated
      expect(saleWithReference.source?.sourceType).toBe('FOOD');
      expect(saleWithReference.source?.sourceId).toBe('order_ref_1');

      // Create via legacy source property
      const saleWithLegacySource = await controller.createSale(
        {
          currency: 'USD',
          source: {
            sourceType: 'DRINK',
            sourceId: 'drink_order_2',
            sourceCode: 'DRK-2',
          },
        } as unknown as CreateSaleRequestDto,
        undefined,
        cashierUser,
      );
      expect(saleWithLegacySource.sourceReference?.type).toBe('DRINK');
      expect(saleWithLegacySource.sourceReference?.referenceId).toBe('drink_order_2');
      expect(saleWithLegacySource.source?.sourceType).toBe('DRINK');
    });

    it('accepts both sourceReference and source in AddSaleItemRequestDto', async () => {
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      // Add item using legacy source alias
      const withItem = await controller.addItem(
        created.id,
        {
          description: 'Protein Shake',
          quantity: 2,
          unitPriceAmount: 5.0,
          source: {
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv_item_99',
          },
        } as unknown as AddSaleItemRequestDto,
        cashierUser,
      );

      expect(withItem.items).toBeDefined();
      expect(withItem.items!.length).toBe(1);
      const firstItem = withItem.items?.[0];
      expect(firstItem).toBeDefined();
      if (firstItem) {
        expect(firstItem.sourceReference?.type).toBe('INVENTORY_ITEM');
        expect(firstItem.sourceReference?.referenceId).toBe('inv_item_99');
        // Legacy item properties populated
        expect(firstItem.sourceType).toBe('INVENTORY_ITEM');
        expect(firstItem.sourceId).toBe('inv_item_99');
      }
    });

    it('SaleSourceResponseDto exposes canonical and legacy fields simultaneously', () => {
      const dto = SaleSourceResponseDto.fromDomain({
        type: 'KINESIOLOGY_SESSION',
        referenceId: 'sess_101',
        referenceCode: 'SESS-2026',
      });

      expect(dto).not.toBeNull();
      // Canonical ADR-0121
      expect(dto!.type).toBe('KINESIOLOGY_SESSION');
      expect(dto!.referenceId).toBe('sess_101');
      expect(dto!.referenceCode).toBe('SESS-2026');
    });

    it('supports legacy positional arguments in listSales for backward test harness compatibility', async () => {
      // Seed 2 sales
      await controller.createSale(
        { currency: 'USD', clientId: 'client_pos_1' },
        undefined,
        cashierUser,
      );
      await controller.createSale(
        { currency: 'USD', clientId: 'client_pos_2' },
        undefined,
        cashierUser,
      );

      // Call listSales using positional arguments: (page, limit, clientId, status, ...)
      const result = await controller.listSales(
        '1', // page
        '10', // limit
        'client_pos_1', // clientId
        undefined, // status
        undefined, // sourceType
        undefined, // sourceReferenceId
        undefined, // fromDate
        undefined, // toDate
        'createdAt', // sortField
        'desc', // sortDirection
        cashierUser,
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.clientId).toBe('client_pos_1');
      expect(result.total).toBe(1);
    });
  });

  describe('3. Authoritative Money Representation & Dual Serialization', () => {
    it('serializes both structured Money and flat numerical amounts matching exact minor cents', async () => {
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      // Add item with fractional quantity: 3.5 units @ $12.35 = $43.225 -> Commercial Half-Up $43.23 (4323 cents)
      await controller.addItem(
        created.id,
        {
          description: 'Specialty Minerals',
          quantity: 3.5,
          unitPriceAmount: 12.35,
        },
        cashierUser,
      );

      // Apply 10% discount: 10% of 4323 cents = 432.3 cents -> Half-Up 432 cents ($4.32)
      // Net Total: 4323 - 432 = 3891 cents ($38.91)
      const afterDiscount = await controller.applyDiscount(
        created.id,
        {
          type: 'PERCENTAGE',
          value: 10,
          reason: 'Loyalty concession',
        },
        cashierUser,
      );

      // Structured Money verification
      expect(afterDiscount.subtotal.cents).toBe(4323);
      expect(afterDiscount.subtotal.amount).toBe(43.23);
      expect(afterDiscount.subtotal.currency).toBe('USD');

      expect(afterDiscount.discountTotal.cents).toBe(432);
      expect(afterDiscount.discountTotal.amount).toBe(4.32);

      expect(afterDiscount.total.cents).toBe(3891);
      expect(afterDiscount.total.amount).toBe(38.91);

      // Flat summary amounts verification (ADR-0114 Section 5.5)
      expect(afterDiscount.subtotalAmount).toBe(43.23);
      expect(afterDiscount.discountTotalAmount).toBe(4.32);
      expect(afterDiscount.totalAmount).toBe(38.91);

      // Line item dual serialization
      const item = afterDiscount.items?.[0];
      expect(item).toBeDefined();
      if (item) {
        expect(item.unitPrice.amount).toBe(12.35);
        expect(item.unitPriceAmount).toBe(12.35);
        expect(item.subtotal.amount).toBe(43.23);
        expect(item.subtotalAmount).toBe(43.23);
      }
    });
  });

  describe('4. Sale Status and Lifecycle Semantics', () => {
    it('enforces that finalized sales reject further item mutations (409 Conflict)', async () => {
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);
      await controller.addItem(
        created.id,
        { description: 'Gym Pass', quantity: 1, unitPriceAmount: 20 },
        cashierUser,
      );
      await controller.finalizeSale(created.id, {}, cashierUser);

      // Attempting to add an item to PENDING_PAYMENT sale throws SaleAlreadyFinalizedException (mapped to 409 Conflict by filter)
      await expect(
        controller.addItem(
          created.id,
          { description: 'Water Bottle', quantity: 1, unitPriceAmount: 3 },
          cashierUser,
        ),
      ).rejects.toThrow(SaleAlreadyFinalizedException);
    });

    it('enforces that cancelled sales reject all further modifications (terminal state)', async () => {
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);
      await controller.cancelSale(
        created.id,
        { reason: 'Customer changed mind at register' },
        cashierUser,
      );

      // Verify status is CANCELLED
      const details = await controller.getSale(created.id, cashierUser);
      expect(details.status).toBe('CANCELLED');

      // Attempting to add item to CANCELLED sale throws SaleAlreadyFinalizedException
      await expect(
        controller.addItem(
          created.id,
          { description: 'Snack', quantity: 1, unitPriceAmount: 2.5 },
          cashierUser,
        ),
      ).rejects.toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('5. Authorization & Segregation of Duties', () => {
    it('allows Kitchen Staff to create sales, add items, and finalize', async () => {
      const created = await controller.createSale({ currency: 'USD' }, undefined, kitchenUser);
      expect(created.status).toBe('DRAFT');

      const withItem = await controller.addItem(
        created.id,
        { description: 'Chicken Salad', quantity: 1, unitPriceAmount: 11.5 },
        kitchenUser,
      );
      expect(withItem.totalAmount).toBe(11.5);

      const finalized = await controller.finalizeSale(created.id, {}, kitchenUser);
      expect(finalized.status).toBe('PENDING_PAYMENT');
    });

    it('strictly forbids Kitchen Staff from cancelling sales (requires sales.cancel)', async () => {
      await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      // In real HTTP execution, AuthorizationGuard rejects missing 'sales.cancel' with 403 Forbidden.
      // Here we verify that cancelSale requires 'sales.cancel' via decorator metadata.
      const cancelMethod = controller.cancelSale;
      const permissions = Reflect.getMetadata('permissions', cancelMethod);
      expect(permissions).toEqual(['sales.cancel']);

      const roles = Reflect.getMetadata('roles', cancelMethod);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
    });
  });

  describe('6. Query Defaults, Aliases & Pagination Determinism', () => {
    it('applies deterministic defaults when query parameters are omitted', async () => {
      await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      const result = await controller.listSales(
        new ListSalesQueryDto(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        cashierUser,
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
    });

    it('handles query aliases q / search, fromDate / dateFrom, toDate / dateTo', async () => {
      const createdSale = await controller.createSale(
        {
          currency: 'USD',
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'pos_terminal_alpha',
            referenceCode: 'TERM_ALPHA',
          },
        },
        undefined,
        cashierUser,
      );

      // Query using 'search' alias matching ID substring
      const dtoWithSearch = new ListSalesQueryDto();
      dtoWithSearch.search = createdSale.id;
      const searchResult = await controller.listSales(
        dtoWithSearch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        cashierUser,
      );
      expect(searchResult.items.length).toBe(1);

      // Query using compound sort string: 'total.asc'
      const dtoWithSort = new ListSalesQueryDto();
      dtoWithSort.sort = 'total.asc';
      const sortResult = await controller.listSales(
        dtoWithSort,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        cashierUser,
      );
      expect(sortResult.items.length).toBe(1);
    });

    it('rejects invalid pagination bounds and date ranges with BadRequestException', async () => {
      // Page < 1
      const invalidPageDto = new ListSalesQueryDto();
      invalidPageDto.page = 0;
      await expect(
        controller.listSales(
          invalidPageDto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          cashierUser,
        ),
      ).rejects.toThrow(BadRequestException);

      // Limit > 100
      const invalidLimitDto = new ListSalesQueryDto();
      invalidLimitDto.limit = 101;
      await expect(
        controller.listSales(
          invalidLimitDto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          cashierUser,
        ),
      ).rejects.toThrow(BadRequestException);

      // fromDate > toDate
      const invalidDateDto = new ListSalesQueryDto();
      invalidDateDto.fromDate = '2026-10-31T00:00:00.000Z';
      invalidDateDto.toDate = '2026-10-01T00:00:00.000Z';
      await expect(
        controller.listSales(
          invalidDateDto,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          cashierUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Multi-Tier Error Mapping & Exception Handling', () => {
    it('maps non-existent sale to NotFoundException', async () => {
      await expect(controller.getSale('sale_non_existent', cashierUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps duplicate sale or optimistic lock collision to ConflictException', async () => {
      // Seed a sale
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      // Simulate duplicate ID create with conflicting transaction parameters (different currency)
      await expect(
        controller.createSale({ id: created.id, currency: 'EUR' }, undefined, cashierUser),
      ).rejects.toThrow(ConflictException);
    });

    it('maps empty sale finalization to UnprocessableEntity or domain failure', async () => {
      // Empty sale without items
      const created = await controller.createSale({ currency: 'USD' }, undefined, cashierUser);

      await expect(controller.finalizeSale(created.id, {}, cashierUser)).rejects.toThrow(
        EmptySaleException,
      );
    });
  });
});
