import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  SaleRepositoryInterface,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  CancelSaleHandler,
  ListSalesHandler,
  MoneyMapper,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import {
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  ApplySaleDiscountRequestDto,
  CancelSaleRequestDto,
  ListSalesQueryDto,
} from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../platform/identity/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/decorators/permissions.decorator';
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

describe('Sales API Endpoints Specification (Milestone 7.14)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;
  let reflector: Reflector;

  const mockStaffUser: AuthenticatedUserPayload = {
    id: 'user_staff_01',
    email: 'staff@kinergy.test',
    status: 'ACTIVE',
    tenantId: 'tenant_kinergy_main',
    roles: ['Manager'],
    permissions: ['sales.create', 'sales.read', 'sales.cancel'],
  };

  beforeEach(async () => {
    repository = new InMemorySaleRepository();
    reflector = new Reflector();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: repository,
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
          provide: ApplyOrderDiscountHandler,
          useFactory: (repo: InMemorySaleRepository) => new ApplyOrderDiscountHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: CancelSaleHandler,
          useFactory: (repo: InMemorySaleRepository) => new CancelSaleHandler(repo),
          inject: [SALE_REPOSITORY_TOKEN],
        },
        {
          provide: ListSalesHandler,
          useFactory: (repo: InMemorySaleRepository) => new ListSalesHandler(repo),
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
  // 1. Route Wiring & Authorization Metadata Spec (Milestone 7.13 / ADR-0136)
  // =========================================================================
  describe('1. Route Wiring & Authorization Metadata Spec', () => {
    it('verifies POST /sales has correct permission, roles, and HTTP 201 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.createSale);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.createSale);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.createSale);

      expect(perms).toEqual(['sales.create']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.CREATED);
    });

    it('verifies GET /sales has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.listSales);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.listSales);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.listSales);

      expect(perms).toEqual(['sales.read']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.OK);
    });

    it('verifies GET /sales/:id has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.getSale);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getSale);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.getSale);

      expect(perms).toEqual(['sales.read']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.OK);
    });

    it('verifies POST /sales/:id/items has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.addItem);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.addItem);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.addItem);

      expect(perms).toEqual(['sales.create']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.OK);
    });

    it('verifies DELETE /sales/:id/items/:itemId has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.removeItem);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.removeItem);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.removeItem);

      expect(perms).toEqual(['sales.create']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.OK);
    });

    it('verifies POST /sales/:id/discount has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.applyDiscount);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.applyDiscount);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.applyDiscount);

      expect(perms).toEqual(['sales.create']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist', 'Kitchen Staff']);
      expect(httpCode).toBe(HttpStatus.OK);
    });

    it('verifies POST /sales/:id/cancel has correct permission, roles, and HTTP 200 status', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.cancelSale);
      const roles = reflector.get<string[]>(ROLES_KEY, controller.cancelSale);
      const httpCode = Reflect.getMetadata('__httpCode__', controller.cancelSale);

      expect(perms).toEqual(['sales.cancel']);
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
      expect(httpCode).toBe(HttpStatus.OK);
    });
  });

  // =========================================================================
  // 2. DTO Validation & Transformation Pipeline Spec
  // =========================================================================
  describe('2. DTO Validation Pipeline Spec', () => {
    it('validates ListSalesQueryDto pagination and sort bounds', async () => {
      // Valid query
      const validQuery = plainToInstance(ListSalesQueryDto, {
        page: '2',
        limit: '50',
        sortField: 'total',
        sortDirection: 'asc',
      });
      const validErrors = await validate(validQuery);
      expect(validErrors).toHaveLength(0);

      // Invalid query: out of bounds limit and invalid sort
      const invalidQuery = plainToInstance(ListSalesQueryDto, {
        page: '-1',
        limit: '150',
        sortField: 'arbitrary_column_sql_injection',
        sortDirection: 'sideways',
      });
      const invalidErrors = await validate(invalidQuery);
      expect(invalidErrors.length).toBeGreaterThanOrEqual(3);
      expect(invalidErrors.some((e) => e.property === 'page')).toBe(true);
      expect(invalidErrors.some((e) => e.property === 'limit')).toBe(true);
      expect(invalidErrors.some((e) => e.property === 'sortField')).toBe(true);
    });

    it('validates CancelSaleRequestDto rejects empty reason', async () => {
      const emptyDto = plainToInstance(CancelSaleRequestDto, { reason: '' });
      const errors = await validate(emptyDto);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('reason');

      const validDto = plainToInstance(CancelSaleRequestDto, {
        reason: 'Customer abandoned register',
      });
      const validErrors = await validate(validDto);
      expect(validErrors).toHaveLength(0);
    });

    it('validates CreateSaleRequestDto rejects non-ISO currency', async () => {
      const invalidCurrency = plainToInstance(CreateSaleRequestDto, { currency: 'invalid_code' });
      const errors = await validate(invalidCurrency);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'currency')).toBe(true);
    });

    it('validates AddSaleItemRequestDto rejects negative price or non-positive quantity', async () => {
      const invalidItem = plainToInstance(AddSaleItemRequestDto, {
        description: '',
        quantity: 0,
        unitPriceAmount: -10,
      });
      const errors = await validate(invalidItem);
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors.some((e) => e.property === 'description')).toBe(true);
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
      expect(errors.some((e) => e.property === 'unitPriceAmount')).toBe(true);
    });

    it('validates ApplySaleDiscountRequestDto rejects negative value', async () => {
      const invalidDiscount = plainToInstance(ApplySaleDiscountRequestDto, {
        type: 'PERCENTAGE',
        value: -5,
      });
      const errors = await validate(invalidDiscount);
      expect(errors.some((e) => e.property === 'value')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Application Use Case Invocation & Response Serialization
  // =========================================================================
  describe('3. Application Use Case Invocation & Response Serialization', () => {
    it('executes POST /sales and creates draft sale with deterministic zero totals', async () => {
      const createDto: CreateSaleRequestDto = {
        currency: 'USD',
        clientId: 'client_alpha_1',
      };

      const response = await controller.createSale(createDto, undefined, mockStaffUser);

      expect(response).toBeInstanceOf(Object);
      expect(response.id).toMatch(/^sale_/);
      expect(response.status).toBe('DRAFT');
      expect(response.clientId).toBe('client_alpha_1');
      expect(response.subtotalAmount).toBe(0);
      expect(response.discountTotalAmount).toBe(0);
      expect(response.totalAmount).toBe(0);
      expect(response.subtotal.cents).toBe(0);
      expect(response.total.cents).toBe(0);
      expect(response.items).toHaveLength(0);
    });

    it('executes POST /sales/:id/items, snapshots price and recalculates totals', async () => {
      const created = await controller.createSale(
        { currency: 'USD', clientId: 'client_alpha_2' },
        undefined,
        mockStaffUser,
      );

      const addItemDto: AddSaleItemRequestDto = {
        description: 'Monthly Gym Access Pass',
        quantity: 2,
        unitPriceAmount: 49.99,
        skuOrCode: 'GYM-PASS-01',
        sourceReference: {
          type: SaleSourceType.GYM_MEMBERSHIP,
          referenceId: 'plan_gym_01',
        },
      };

      const response = await controller.addItem(created.id, addItemDto, mockStaffUser);

      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.description).toBe('Monthly Gym Access Pass');
      expect(response.items[0]?.quantity).toBe(2);
      expect(response.items[0]?.unitPriceAmount).toBe(49.99);
      expect(response.subtotalAmount).toBe(99.98);
      expect(response.totalAmount).toBe(99.98);
      expect(response.total.cents).toBe(9998);
    });

    it('executes POST /sales/:id/discount and applies percentage order discount', async () => {
      const created = await controller.createSale(
        { currency: 'USD', clientId: 'client_alpha_3' },
        undefined,
        mockStaffUser,
      );

      await controller.addItem(
        created.id,
        {
          description: 'Whey Protein',
          quantity: 1,
          unitPriceAmount: 100.0,
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'inv_protein_1',
          },
        },
        mockStaffUser,
      );

      const discountDto: ApplySaleDiscountRequestDto = {
        type: 'PERCENTAGE',
        value: 15,
        reason: 'VIP Member Discount',
      };

      const response = await controller.applyDiscount(created.id, discountDto, mockStaffUser);

      expect(response.subtotalAmount).toBe(100.0);
      expect(response.discountTotalAmount).toBe(15.0);
      expect(response.totalAmount).toBe(85.0);
      expect(response.total.cents).toBe(8500);
    });

    it('executes DELETE /sales/:id/items/:itemId and removes line item with recalculated totals', async () => {
      const created = await controller.createSale(
        { currency: 'USD', clientId: 'client_alpha_4' },
        undefined,
        mockStaffUser,
      );

      const withItem = await controller.addItem(
        created.id,
        {
          description: 'Energy Bar',
          quantity: 3,
          unitPriceAmount: 5.0,
          sourceReference: {
            type: SaleSourceType.FOOD,
            referenceId: 'inv_energy_bar_1',
          },
        },
        mockStaffUser,
      );

      const itemId = withItem.items[0]?.id;
      expect(itemId).toBeDefined();

      const response = await controller.removeItem(created.id, itemId!, mockStaffUser);

      expect(response.items).toHaveLength(0);
      expect(response.subtotalAmount).toBe(0);
      expect(response.totalAmount).toBe(0);
    });

    it('executes POST /sales/:id/cancel and transitions sale to CANCELLED status with audit reason', async () => {
      const created = await controller.createSale(
        { currency: 'USD', clientId: 'client_alpha_5' },
        undefined,
        mockStaffUser,
      );

      const cancelDto: CancelSaleRequestDto = {
        reason: 'Customer payment method declined and abandoned register',
      };

      const response = await controller.cancelSale(created.id, cancelDto, mockStaffUser);

      expect(response.status).toBe('CANCELLED');
      expect(response.cancellationReason).toBe(
        'Customer payment method declined and abandoned register',
      );
      expect(response.cancelledAt).toBeDefined();
    });

    it('executes GET /sales/:id and retrieves full authoritative commercial details', async () => {
      const created = await controller.createSale(
        { currency: 'USD', clientId: 'client_alpha_6' },
        undefined,
        mockStaffUser,
      );

      await controller.addItem(
        created.id,
        {
          description: 'Kinesiology Consultation',
          quantity: 1,
          unitPriceAmount: 120.0,
          sourceReference: {
            type: SaleSourceType.KINESIOLOGY_SESSION,
            referenceId: 'sess_kinesio_1',
          },
        },
        mockStaffUser,
      );

      const response = await controller.getSale(created.id, mockStaffUser);

      expect(response.id).toBe(created.id);
      expect(response.clientId).toBe('client_alpha_6');
      expect(response.items).toHaveLength(1);
      expect(response.totalAmount).toBe(120.0);
      expect(response.sourceReference).toBeDefined();
    });

    it('throws NotFoundException when GET /sales/:id targets non-existent sale ID', async () => {
      await expect(controller.getSale('sale_non_existent_999', mockStaffUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // 4. List Sales Query Parsing & Compound Sort Spec
  // =========================================================================
  describe('4. List Sales Query Parsing & Compound Sort Spec', () => {
    beforeEach(async () => {
      // Seed sample sales
      for (let i = 1; i <= 6; i++) {
        const sale = Sale.create({
          id: SaleId.create(`sale_batch_${i}`),
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.FOOD, `order_${i}`),
          tenantId: 'tenant_kinergy_main',
          clientId: `client_${i % 2 === 0 ? 'even' : 'odd'}`,
        });
        await repository.save(sale);
      }
    });

    it('executes GET /sales with ListSalesQueryDto object including compound sort unpacking', async () => {
      const queryDto: ListSalesQueryDto = {
        page: 1,
        limit: 4,
        sort: 'createdAt.desc',
      };

      const response = await controller.listSales(
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
        mockStaffUser,
      );

      expect(response.items).toHaveLength(4);
      expect(response.total).toBe(6);
      expect(response.page).toBe(1);
      expect(response.limit).toBe(4);
      expect(response.totalPages).toBe(2);
      expect(response.hasNextPage).toBe(true);
      expect(response.hasPreviousPage).toBe(false);
    });

    it('filters sales by clientId using ListSalesQueryDto', async () => {
      const queryDto: ListSalesQueryDto = {
        clientId: 'client_even',
      };

      const response = await controller.listSales(
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
        mockStaffUser,
      );

      expect(response.items).toHaveLength(3);
      expect(response.items.every((s) => s.clientId === 'client_even')).toBe(true);
    });

    it('preserves backwards-compatibility with positional unit test calls', async () => {
      const response = await controller.listSales(
        '1',
        '2',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'createdAt',
        'desc',
        mockStaffUser,
      );

      expect(response.items).toHaveLength(2);
      expect(response.total).toBe(6);
      expect(response.totalPages).toBe(3);
    });
  });
});
