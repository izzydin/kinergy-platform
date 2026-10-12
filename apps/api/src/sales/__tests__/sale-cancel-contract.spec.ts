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
  CancelSaleHandler,
  SaleUnauthorizedException,
  InvalidSaleTransitionException,
  SaleOptimisticLockException,
  PaymentRepositoryPort,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
  MoneyMapper,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN } from '../sales.tokens';
import { CancelSaleRequestDto } from '../dto/cancel-sale-request.dto';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../platform/identity/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/decorators/permissions.decorator';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class InMemorySaleRepository implements SaleRepositoryInterface {
  public readonly items = new Map<string, Sale>();
  public saveCallCount = 0;
  public throwOnSave?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
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

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public readonly items = new Map<string, Payment>();
  public saveCallCount = 0;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.items.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.saveCallCount++;
    this.items.set(payment.id.value, payment);
  }

  async findByTenantId(tenantId: string): Promise<Payment[]> {
    return Array.from(this.items.values()).filter((p) => p.tenantId === tenantId);
  }
}

describe('POST /sales/:id/cancel Contract Specification (Milestone 7.14 & ADR-0136)', () => {
  let controller: SalesController;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let cancelSaleHandler: CancelSaleHandler;
  let pipe: GlobalSanitizationValidationPipe;
  let reflector: Reflector;
  let exceptionFilter: SalesExceptionFilter;

  const validManagerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.cancel', 'sales.read'],
    tenantId: 'tenant_main',
  };

  const validManagePrivilegedUser: AuthenticatedUserPayload = {
    id: 'user_owner_01',
    email: 'owner@kinergy.com',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['sales.manage', 'sales.read'],
    tenantId: 'tenant_main',
  };

  const createDraftSale = async (
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
      description: 'Monthly Pass Pack',
      quantity: 1,
      unitPrice: Money.create(subtotalAmount, currency),
    });

    await saleRepo.save(sale);
    return sale;
  };

  beforeEach(async () => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    cancelSaleHandler = new CancelSaleHandler(saleRepo);
    pipe = new GlobalSanitizationValidationPipe();
    reflector = new Reflector();
    exceptionFilter = new SalesExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: CancelSaleHandler,
          useValue: cancelSaleHandler,
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
  // 1. Valid Cancellation
  // =========================================================================
  describe('1. Valid Cancellation (POST /sales/:id/cancel)', () => {
    it('successfully cancels a Sale in DRAFT status and records audit justification', async () => {
      const sale = await createDraftSale('sale_cancel_draft');

      const payload = {
        reason: 'Customer walked out before payment tender',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CancelSaleRequestDto,
      })) as CancelSaleRequestDto;

      const result = await controller.cancelSale(sale.id.value, transformed, validManagerUser);

      expect(result.id).toBe(sale.id.value);
      expect(result.status).toBe('CANCELLED');
      expect(result.cancellationReason).toBe('Customer walked out before payment tender');
      expect(result.cancelledAt).toBeDefined();

      const persisted = await saleRepo.findById(sale.id.value);
      expect(persisted?.status).toBe('CANCELLED');
      expect(persisted?.cancellationReason).toBe('Customer walked out before payment tender');
      expect(persisted?.cancelledAt).toBeDefined();
    });

    it('successfully cancels a Sale in PENDING_PAYMENT status', async () => {
      const sale = await createDraftSale('sale_cancel_pending');
      sale.finalize();
      await saleRepo.save(sale);
      expect(sale.status).toBe('PENDING_PAYMENT');

      const payload = {
        reason: 'Client requested session cancellation after order lock',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CancelSaleRequestDto,
      })) as CancelSaleRequestDto;

      const result = await controller.cancelSale(sale.id.value, transformed, validManagerUser);

      expect(result.status).toBe('CANCELLED');
      expect(result.cancellationReason).toBe(
        'Client requested session cancellation after order lock',
      );
    });

    it('successfully cancels a Sale in PARTIALLY_PAID status', async () => {
      const sale = await createDraftSale('sale_cancel_partial');
      sale.finalize();
      sale.markPartiallyPaid();
      await saleRepo.save(sale);
      expect(sale.status).toBe('PARTIALLY_PAID');

      const payload = {
        reason: 'Client split tender abandoned midway',
      };

      const transformed = (await pipe.transform(payload, {
        type: 'body',
        metatype: CancelSaleRequestDto,
      })) as CancelSaleRequestDto;

      const result = await controller.cancelSale(sale.id.value, transformed, validManagerUser);

      expect(result.status).toBe('CANCELLED');
      expect(result.cancellationReason).toBe('Client split tender abandoned midway');
    });

    it('allows users with sales:manage permission to cancel an active sale', async () => {
      const sale = await createDraftSale('sale_cancel_manage_perm');

      const payload = {
        reason: 'Executive manager override cancellation',
      };

      const result = await controller.cancelSale(
        sale.id.value,
        payload as CancelSaleRequestDto,
        validManagePrivilegedUser,
      );

      expect(result.status).toBe('CANCELLED');
      expect(result.cancellationReason).toBe('Executive manager override cancellation');
    });
  });

  // =========================================================================
  // 2. Unknown Sale and Identifier Validation
  // =========================================================================
  describe('2. Unknown Sale and Identifier Validation', () => {
    it('returns NotFoundException (404) when cancelling non-existent Sale', async () => {
      await expect(
        controller.cancelSale(
          'sale_non_existent_999',
          { reason: 'Cancel order' },
          validManagerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects empty or whitespace sale ID with BadRequestException (400)', async () => {
      await expect(
        controller.cancelSale('   ', { reason: 'Cancel order' }, validManagerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects missing or empty cancellation reason at DTO validation boundary (400)', async () => {
      const invalidPayloads = [{ reason: '' }, { reason: '   ' }, {}];

      for (const payload of invalidPayloads) {
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CancelSaleRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects cancellation reason exceeding 255 characters at DTO validation boundary (400)', async () => {
      await expect(
        pipe.transform(
          { reason: 'A'.repeat(256) },
          {
            type: 'body',
            metatype: CancelSaleRequestDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 3. Unauthorized Cancellation
  // =========================================================================
  describe('3. Unauthorized Cancellation', () => {
    it('declares required roles and permissions metadata on cancelSale endpoint', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        SalesController.prototype.cancelSale,
      );
      expect(permissions).toBeDefined();
      expect(permissions).toContain('sales.cancel');

      const roles = reflector.get<string[]>(ROLES_KEY, SalesController.prototype.cancelSale);
      expect(roles).toBeDefined();
      expect(roles).toEqual(['Owner', 'Manager', 'Receptionist']);
      expect(roles).not.toContain('Kitchen Staff');
      expect(roles).not.toContain('Trainer');
    });

    it('rejects Kitchen Staff user attempting cancellation at application layer', async () => {
      const sale = await createDraftSale('sale_kitchen_deny');

      const kitchenUser: AuthenticatedUserPayload = {
        id: 'user_kitchen_01',
        email: 'kitchen@kinergy.com',
        status: 'ACTIVE',
        roles: ['Kitchen Staff'],
        permissions: ['sales.read', 'sales.create'], // Missing sales.cancel / sales.manage
        tenantId: 'tenant_main',
      };

      await expect(
        controller.cancelSale(sale.id.value, { reason: 'Kitchen attempted void' }, kitchenUser),
      ).rejects.toThrow(SaleUnauthorizedException);
    });

    it('enforces multi-tenant boundary isolation: rejects foreign tenant access without modifying state', async () => {
      const sale = await createDraftSale('sale_cross_tenant_cancel');
      const initialSaveCount = saleRepo.saveCallCount;

      const foreignTenantUser: AuthenticatedUserPayload = {
        id: 'user_foreign_mgr',
        email: 'manager@foreign.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['sales.cancel'],
        tenantId: 'tenant_other_branch',
      };

      await expect(
        controller.cancelSale(sale.id.value, { reason: 'Cross tenant probe' }, foreignTenantUser),
      ).rejects.toThrow();

      expect(saleRepo.saveCallCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 4. Invalid Lifecycle Transition
  // =========================================================================
  describe('4. Invalid Lifecycle Transition', () => {
    it('rejects cancelling a PAID sale with 422 Unprocessable Entity', async () => {
      const sale = await createDraftSale('sale_paid_no_cancel');
      sale.finalize();
      sale.markPaid();
      await saleRepo.save(sale);
      expect(sale.status).toBe('PAID');

      let thrownError: unknown;
      try {
        await controller.cancelSale(
          sale.id.value,
          { reason: 'Customer wants refund after settlement' },
          validManagerUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(InvalidSaleTransitionException);

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
            url: `/sales/${sale.id.value}/cancel`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );
    });
  });

  // =========================================================================
  // 5. Repeated Cancellation (Terminal Immutability)
  // =========================================================================
  describe('5. Repeated Cancellation (Terminal Immutability)', () => {
    it('rejects cancelling an already CANCELLED sale with 422 Unprocessable Entity', async () => {
      const sale = await createDraftSale('sale_already_cancelled');
      sale.cancel('Initial cancellation');
      await saleRepo.save(sale);
      expect(sale.status).toBe('CANCELLED');

      let thrownError: unknown;
      try {
        await controller.cancelSale(
          sale.id.value,
          { reason: 'Repeated cancellation attempt' },
          validManagerUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(InvalidSaleTransitionException);

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
            url: `/sales/${sale.id.value}/cancel`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );

      // Verify initial cancellation reason and timestamp remain unchanged
      const current = await saleRepo.findById(sale.id.value);
      expect(current?.cancellationReason).toBe('Initial cancellation');
    });
  });

  // =========================================================================
  // 6. Cancellation Involving an Existing Payment (BR-PAY-10)
  // =========================================================================
  describe('6. Cancellation Involving an Existing Payment (BR-PAY-10 Non-Corruptive Invariant)', () => {
    it('preserves existing historical Payment records completely intact when Sale is cancelled', async () => {
      const sale = await createDraftSale('sale_with_payment');
      sale.finalize();
      sale.markPartiallyPaid();
      await saleRepo.save(sale);

      // Existing recorded payment against this sale
      const payment = Payment.createCompleted({
        id: PaymentId.create('pay_historical_01'),
        saleId: sale.id,
        tenantId: sale.tenantId,
        amount: Money.create(50.0, 'USD'),
        method: PaymentMethod.CASH,
      });
      await paymentRepo.save(payment);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      // Cancel the Sale
      const res = await controller.cancelSale(
        sale.id.value,
        { reason: 'Customer partial payment cancelled due to registration error' },
        validManagerUser,
      );

      expect(res.status).toBe('CANCELLED');

      // In accordance with BR-PAY-10, ADR-0109, and ADR-0119:
      // Payments are autonomous records and must NOT be deleted, failed, or altered by Sale cancellation.
      const persistedPayment = await paymentRepo.findById('pay_historical_01');
      expect(persistedPayment).not.toBeNull();
      expect(persistedPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayment?.amount.amount).toBe(50.0);
      expect(persistedPayment?.saleId.value).toBe(sale.id.value);
    });
  });

  // =========================================================================
  // 7. Persistence Failure and Concurrency Behavior
  // =========================================================================
  describe('7. Persistence Failure and Concurrency Behavior', () => {
    it('translates concurrency collisions (SaleOptimisticLockException) to 409 Conflict', async () => {
      const sale = await createDraftSale('sale_occ_conflict');

      // Inject concurrency failure
      saleRepo.throwOnSave = new SaleOptimisticLockException('Sale', sale.id.value, 1);

      let thrownError: unknown;
      try {
        await controller.cancelSale(
          sale.id.value,
          { reason: 'Concurrent cancellation collision' },
          validManagerUser,
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(SaleOptimisticLockException);

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
            url: `/sales/${sale.id.value}/cancel`,
          }),
        }),
      } as unknown as ArgumentsHost;

      exceptionFilter.catch(thrownError, mockHost);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'OPTIMISTIC_LOCK_ERROR',
        }),
      );
    });
  });

  // =========================================================================
  // 8. Non-Partial Mutation on Rejection
  // =========================================================================
  describe('8. Non-Partial Mutation on Rejection', () => {
    it('leaves Sale state completely untouched when cancellation fails authorization', async () => {
      const sale = await createDraftSale('sale_untouched_on_fail');
      const initialVersion = sale.version;
      const initialSaveCount = saleRepo.saveCallCount;

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_trainer_deny',
        email: 'trainer@kinergy.com',
        status: 'ACTIVE',
        roles: ['Trainer'],
        permissions: ['sales.read'],
        tenantId: 'tenant_main',
      };

      try {
        await controller.cancelSale(
          sale.id.value,
          { reason: 'Unauthorized void attempt' },
          unauthorizedUser,
        );
      } catch {
        // Expected
      }

      expect(saleRepo.saveCallCount).toBe(initialSaveCount);

      const loaded = await saleRepo.findById(sale.id.value);
      expect(loaded?.status).toBe('DRAFT');
      expect(loaded?.version).toBe(initialVersion);
      expect(loaded?.cancellationReason).toBeFalsy();
      expect(loaded?.cancelledAt).toBeFalsy();
    });

    it('strictly forbids injection of calculated fields or status in cancel request', async () => {
      const forbiddenPayloads = [
        { reason: 'Valid reason', status: 'DRAFT' },
        { reason: 'Valid reason', total: 0 },
        { reason: 'Valid reason', subtotal: 0 },
        { reason: 'Valid reason', cancelledAt: new Date().toISOString() },
      ];

      for (const payload of forbiddenPayloads) {
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CancelSaleRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });
});
