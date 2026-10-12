import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException, NotFoundException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import {
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  Money,
  SaleRepositoryInterface,
  ApplyDiscountHandler,
  ApplyOrderDiscountHandler,
  SaleUnauthorizedException,
  SaleAlreadyFinalizedException,
  InvalidDiscountException,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  MoneyMapper,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { ApplySaleDiscountRequestDto } from '../dto/apply-sale-discount-request.dto';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../platform/identity/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/decorators/permissions.decorator';
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

describe('POST /sales/:id/discount Contract Specification (Milestone 7.14 & ADR-0136)', () => {
  let controller: SalesController;
  let repository: InMemorySaleRepository;
  let applyDiscountHandler: ApplyDiscountHandler;
  let pipe: GlobalSanitizationValidationPipe;
  let reflector: Reflector;
  let exceptionFilter: SalesExceptionFilter;

  const validCashierUser: AuthenticatedUserPayload = {
    id: 'user_cashier_01',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['sales.create', 'sales.read'],
    tenantId: 'tenant_main',
  };

  const createDraftSaleWithItems = async (
    id: string,
    subtotalAmount = 100.0,
    currency = 'USD',
  ): Promise<Sale> => {
    const sale = Sale.create({
      id: SaleId.create(id),
      tenantId: 'tenant_main',
      clientId: 'client_123',
      currency,
      source: SaleSource.create(SaleSourceType.FOOD, 'terminal_101'),
    });

    sale.addItem({
      source: SaleSource.create(SaleSourceType.FOOD, 'inv_food_01'),
      description: 'Fitness Session Pack',
      quantity: 1,
      unitPrice: Money.create(subtotalAmount, currency),
    });

    await repository.save(sale);
    return sale;
  };

  beforeEach(async () => {
    repository = new InMemorySaleRepository();
    applyDiscountHandler = new ApplyDiscountHandler(repository);
    pipe = new GlobalSanitizationValidationPipe();
    reflector = new Reflector();
    exceptionFilter = new SalesExceptionFilter();

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
          provide: ApplyOrderDiscountHandler,
          useValue: applyDiscountHandler,
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
  // 1. Valid Fixed Discount
  // =========================================================================
  describe('1. Valid Fixed Discount (POST /sales/:id/discount)', () => {
    it('successfully applies a whole-dollar fixed discount and recalculates totals', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_fixed_01', 100.0);

      const payload = {
        type: 'FIXED',
        value: 20.0,
        reason: '$20 Member Welcome Coupon',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.id).toBe(sale.id.value);
      expect(result.status).toBe('DRAFT');
      expect(result.subtotalAmount).toBe(100.0);
      expect(result.discountTotalAmount).toBe(20.0);
      expect(result.totalAmount).toBe(80.0);

      expect(result.subtotal).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });
      expect(result.discountTotal).toEqual({
        amount: 20.0,
        currency: 'USD',
        formatted: '20.00',
        cents: 2000,
      });
      expect(result.total).toEqual({
        amount: 80.0,
        currency: 'USD',
        formatted: '80.00',
        cents: 8000,
      });
    });

    it('successfully applies a cents-precise fixed discount without floating-point inaccuracies', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_fixed_cents', 50.0);

      const payload = {
        type: 'FIXED',
        value: 12.34,
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(50.0);
      expect(result.discountTotalAmount).toBe(12.34);
      expect(result.totalAmount).toBe(37.66);
      expect(result.total.cents).toBe(3766);
    });

    it('supports FIXED_AMOUNT type equivalently to FIXED', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_fixed_amount', 80.0);

      const payload = {
        type: 'FIXED_AMOUNT',
        value: 15.0,
        reason: 'Manager override voucher',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(80.0);
      expect(result.discountTotalAmount).toBe(15.0);
      expect(result.totalAmount).toBe(65.0);
    });
  });

  // =========================================================================
  // 2. Valid Percentage Discount
  // =========================================================================
  describe('2. Valid Percentage Discount (POST /sales/:id/discount)', () => {
    it('successfully applies standard percentage discount and calculates integer reduction', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_pct_01', 100.0);

      const payload = {
        type: 'PERCENTAGE',
        value: 15,
        reason: '15% Summer Promo',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(100.0);
      expect(result.discountTotalAmount).toBe(15.0);
      expect(result.totalAmount).toBe(85.0);
      expect(result.total.cents).toBe(8500);
    });

    it('successfully applies 100% percentage discount resulting in exactly 0.00 total', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_pct_100', 120.0);

      const payload = {
        type: 'PERCENTAGE',
        value: 100,
        reason: 'Full Scholarship Promo',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(120.0);
      expect(result.discountTotalAmount).toBe(120.0);
      expect(result.totalAmount).toBe(0.0);
      expect(result.total.cents).toBe(0);
    });

    it('successfully applies 0% percentage discount leaving subtotal unaltered', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_pct_0', 75.0);

      const payload = {
        type: 'PERCENTAGE',
        value: 0,
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(75.0);
      expect(result.discountTotalAmount).toBe(0.0);
      expect(result.totalAmount).toBe(75.0);
    });

    it('executes Commercial Half-Up rounding in integer cents (e.g. 15% on $33.33)', async () => {
      // $33.33 subtotal = 3333 cents. 3333 * 0.15 = 499.95 -> rounds to 500 cents ($5.00). Total = 2833 cents ($28.33).
      const sale = await createDraftSaleWithItems('sale_disc_half_up', 33.33);

      const payload = {
        type: 'PERCENTAGE',
        value: 15,
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: ApplySaleDiscountRequestDto,
      })) as ApplySaleDiscountRequestDto;

      const result = await controller.applyDiscount(sale.id.value, transformed, validCashierUser);

      expect(result.subtotalAmount).toBe(33.33);
      expect(result.discountTotalAmount).toBe(5.0);
      expect(result.totalAmount).toBe(28.33);
      expect(result.total.cents).toBe(2833);
    });
  });

  // =========================================================================
  // 3. Invalid or Unsupported Discount Type
  // =========================================================================
  describe('3. Invalid or Unsupported Discount Type', () => {
    it.each([
      'INVALID_TYPE',
      'CUSTOM',
      'VOUCHER',
      'PROMO_CODE',
      'TIER_DISCOUNT',
      'ARBITRARY_STRING',
    ])('rejects unsupported discount type "%s" at DTO validation boundary', async (invalidType) => {
      const payload = {
        type: invalidType,
        value: 10,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: ApplySaleDiscountRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([123, true, {}, []])('rejects non-string discount type %p', async (invalidType) => {
      const payload = {
        type: invalidType,
        value: 10,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: ApplySaleDiscountRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 4. Invalid Numeric Precision
  // =========================================================================
  describe('4. Invalid Numeric Precision', () => {
    it('rejects discount value with more than 2 decimal places (e.g. 10.123)', async () => {
      const payload = {
        type: 'FIXED',
        value: 10.123,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: ApplySaleDiscountRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects percentage value with more than 2 decimal places (e.g. 15.999)', async () => {
      const payload = {
        type: 'PERCENTAGE',
        value: 15.999,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: ApplySaleDiscountRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-numeric discount values (strings, NaN, null)', async () => {
      const invalidValues = ['ten_dollars', 'NaN', null];

      for (const val of invalidValues) {
        await expect(
          pipe.transform(
            {
              type: 'FIXED',
              value: val,
            },
            {
              type: 'body',
              metatype: ApplySaleDiscountRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // =========================================================================
  // 5. Negative or Excessive Discount
  // =========================================================================
  describe('5. Negative or Excessive Discount', () => {
    it('rejects negative discount value at DTO validation boundary', async () => {
      const invalidValues = [-1, -0.01, -50];

      for (const val of invalidValues) {
        await expect(
          pipe.transform(
            {
              type: 'FIXED',
              value: val,
            },
            {
              type: 'body',
              metatype: ApplySaleDiscountRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects percentage discount exceeding 100% via domain InvalidDiscountException', async () => {
      const sale = await createDraftSaleWithItems('sale_excess_pct', 100.0);

      const payload = {
        type: 'PERCENTAGE',
        value: 100.01,
      };

      let thrownError: unknown;
      try {
        await controller.applyDiscount(
          sale.id.value,
          payload as ApplySaleDiscountRequestDto,
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(InvalidDiscountException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({
            headers: {},
            method: 'POST',
            url: `/sales/${sale.id.value}/discount`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_DISCOUNT',
        }),
      );
    });

    it('enforces non-negative total invariant when fixed discount exceeds eligible subtotal', async () => {
      // Subtotal is $50.00, fixed voucher is $100.00
      // Domain guarantees non-negative total: reduction is capped at $50.00, net total is $0.00
      const sale = await createDraftSaleWithItems('sale_excess_fixed', 50.0);

      const payload = {
        type: 'FIXED',
        value: 100.0,
        reason: 'Large loyalty voucher',
      };

      const result = await controller.applyDiscount(
        sale.id.value,
        payload as ApplySaleDiscountRequestDto,
        validCashierUser,
      );

      expect(result.subtotalAmount).toBe(50.0);
      expect(result.discountTotalAmount).toBe(50.0);
      expect(result.totalAmount).toBe(0.0);
      expect(result.total.cents).toBe(0);
    });
  });

  // =========================================================================
  // 6. Discount on an Ineligible or Immutable Sale
  // =========================================================================
  describe('6. Discount on an Ineligible or Immutable Sale', () => {
    it('rejects applying discount to a CANCELLED sale with 409 Conflict', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_cancelled', 100.0);
      sale.cancel('Customer abandoned transaction');
      await repository.save(sale);

      let thrownError: unknown;
      try {
        await controller.applyDiscount(
          sale.id.value,
          { type: 'FIXED', value: 10 },
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleAlreadyFinalizedException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({
            headers: {},
            method: 'POST',
            url: `/sales/${sale.id.value}/discount`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });

    it('rejects applying discount to a finalized sale in PENDING_PAYMENT status with 409 Conflict', async () => {
      const sale = await createDraftSaleWithItems('sale_disc_finalized', 100.0);
      sale.finalize();
      await repository.save(sale);

      let thrownError: unknown;
      try {
        await controller.applyDiscount(
          sale.id.value,
          { type: 'PERCENTAGE', value: 10 },
          validCashierUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleAlreadyFinalizedException);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({
            headers: {},
            method: 'POST',
            url: `/sales/${sale.id.value}/discount`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'SALE_ALREADY_FINALIZED',
        }),
      );
    });

    it('returns NotFoundException (404) when applying discount to non-existent Sale', async () => {
      await expect(
        controller.applyDiscount(
          'sale_non_existent_404',
          { type: 'FIXED', value: 10 },
          validCashierUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects empty or whitespace sale ID with BadRequestException (400)', async () => {
      await expect(
        controller.applyDiscount('   ', { type: 'FIXED', value: 10 }, validCashierUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 7. Authorization and Tenant Isolation Enforcement
  // =========================================================================
  describe('7. Authorization and Tenant Isolation Enforcement', () => {
    it('declares required roles and permissions metadata on applyDiscount endpoint', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        SalesController.prototype.applyDiscount,
      );
      expect(permissions).toBeDefined();
      expect(permissions).toContain('sales.create');

      const roles = reflector.get<string[]>(ROLES_KEY, SalesController.prototype.applyDiscount);
      expect(roles).toBeDefined();
      expect(roles).toContain('Owner');
      expect(roles).toContain('Manager');
      expect(roles).toContain('Receptionist');
      expect(roles).toContain('Kitchen Staff');
    });

    it('rejects applyDiscount when user lacks sales.create permission at application layer', async () => {
      const sale = await createDraftSaleWithItems('sale_unauth_discount', 100.0);

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_trainer_01',
        email: 'trainer@kinergy.com',
        status: 'ACTIVE',
        roles: ['Trainer'],
        permissions: ['sales.read'], // Missing sales.create
        tenantId: 'tenant_main',
      };

      await expect(
        controller.applyDiscount(sale.id.value, { type: 'FIXED', value: 10 }, unauthorizedUser),
      ).rejects.toThrow(SaleUnauthorizedException);
    });

    it('enforces multi-tenant boundary isolation: returns 404 on cross-tenant access', async () => {
      const sale = await createDraftSaleWithItems('sale_cross_tenant_disc', 100.0);

      const foreignTenantUser: AuthenticatedUserPayload = {
        id: 'user_foreign_01',
        email: 'manager@foreign.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.create'],
        tenantId: 'tenant_other_branch',
      };

      await expect(
        controller.applyDiscount(sale.id.value, { type: 'FIXED', value: 10 }, foreignTenantUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // 8. Calculated Financial Fields Injection Prevention
  // =========================================================================
  describe('8. Calculated Financial Fields Injection Prevention', () => {
    it('strictly forbids injection of calculated financial totals in discount request', async () => {
      const forbiddenFields = [
        { subtotal: 100 },
        { subtotalAmount: 100 },
        { discountTotal: 20 },
        { discountTotalAmount: 20 },
        { total: 80 },
        { totalAmount: 80 },
        { status: 'PAID' },
      ];

      for (const field of forbiddenFields) {
        await expect(
          pipe.transform(
            {
              type: 'FIXED',
              value: 10,
              ...field,
            },
            {
              type: 'body',
              metatype: ApplySaleDiscountRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // =========================================================================
  // 9. Atomicity and No Partial Persistence on Failure
  // =========================================================================
  describe('9. Atomicity and No Partial Persistence on Failure', () => {
    it('does not mutate or persist aggregate when discount fails domain validation', async () => {
      const sale = await createDraftSaleWithItems('sale_atomicity_disc', 100.0);
      const initialSaveCount = repository.saveCallCount;

      // Attempt to apply invalid percentage > 100%
      try {
        await controller.applyDiscount(
          sale.id.value,
          { type: 'PERCENTAGE', value: 150 },
          validCashierUser,
        );
      } catch {
        // Expected domain error
      }

      // Verify repository was not updated
      expect(repository.saveCallCount).toBe(initialSaveCount);

      const unchanged = await repository.findById(sale.id.value);
      expect(unchanged?.discountTotal.amount).toBe(0.0);
      expect(unchanged?.total.amount).toBe(100.0);
      expect(unchanged?.orderDiscount).toBeNull();
    });
  });
});
