import { HttpStatus, BadRequestException, ArgumentsHost } from '@nestjs/common';
import { Response, Request } from 'express';
import {
  Sale,
  SaleId,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Money,
  SourceReference,
  SourceType,
  PaymentId,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  ListPaymentsHandler,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  PaymentNotFoundException,
  SaleNotFoundException,
  PaymentUnauthorizedException,
  PaymentOptimisticLockException,
  SaleOptimisticLockException,
  DuplicatePaymentReferenceException,
  InvalidPaymentTransitionException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  InvalidPaymentMethodException,
  InvalidMoneyException,
  PaymentCurrencyMismatchException,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  SaleSummaryDTO,
  SystemClock,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import {
  RecordPaymentRequestDto,
  CompletePaymentRequestDto,
  FailPaymentRequestDto,
  CancelPaymentRequestDto,
} from '../dto';

// --- In-Memory Repository Fakes ---

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.store.set(sale.id.value, sale);
  }

  async findById(id: string | SaleId): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }

  async findByIdAndTenantId(id: string, tenantId?: string): Promise<Sale | null> {
    const sale = this.store.get(id);
    if (!sale) return null;
    if (tenantId && sale.tenantId && sale.tenantId !== tenantId) return null;
    return sale;
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<{ items: SaleSummaryDTO[]; total: number }> {
    let sales = Array.from(this.store.values());
    if (criteria.tenantId) {
      sales = sales.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      sales = sales.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      sales = sales.filter((s) => s.status === criteria.status);
    }
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const start = (page - 1) * limit;
    const toDto = (m: { amount: number; cents: number; currency: string }) => ({
      amount: m.amount,
      cents: m.cents,
      currency: m.currency,
      formatted: m.amount.toFixed(2),
    });
    const items: SaleSummaryDTO[] = sales.slice(start, start + limit).map((s) => ({
      id: s.id.value,
      tenantId: s.tenantId,
      clientId: s.clientId,
      currency: s.currency,
      status: s.status,
      subtotal: toDto(s.subtotal),
      discountTotal: toDto(s.discountTotal),
      total: toDto(s.total),
      subtotalAmount: s.subtotal.amount,
      discountTotalAmount: s.discountTotal.amount,
      totalAmount: s.total.amount,
      itemCount: s.items.length,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
    return { items, total: sales.length };
  }
}

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCallCount = 0;

  async save(payment: Payment): Promise<void> {
    this.saveCallCount++;
    this.store.set(payment.id.value, payment);
  }

  async findById(id: string | PaymentId): Promise<Payment | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: string): Promise<Payment[]> {
    return Array.from(this.store.values()).filter((p) => p.saleId.value === saleId);
  }

  async findMany(): Promise<{ items: Payment[]; total: number }> {
    return { items: Array.from(this.store.values()), total: this.store.size };
  }
}

describe('Milestone 7.15 — Standardized Payment API Reliability & Error Mapping Specification', () => {
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let controller: PaymentsController;
  let validationPipe: GlobalSanitizationValidationPipe;
  let exceptionFilter: SalesExceptionFilter;

  const validTenantId = 'tenant_prod_1';
  const managerUser: AuthenticatedUserPayload = {
    id: 'user_mgr_1',
    email: 'manager@kinergy.test',
    status: 'ACTIVE',
    tenantId: validTenantId,
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage'],
  };

  const otherTenantUser: AuthenticatedUserPayload = {
    id: 'user_other_tenant',
    email: 'other@tenant.test',
    status: 'ACTIVE',
    tenantId: 'tenant_other_999',
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage'],
  };

  const fixedClock = new (class extends SystemClock {
    override now(): Date {
      return new Date('2026-10-15T12:00:00.000Z');
    }
  })();

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();

    controller = new PaymentsController(
      paymentRepo,
      saleRepo,
      new RecordPaymentHandler(paymentRepo, saleRepo),
      new GetPaymentByIdHandler(paymentRepo, saleRepo),
      new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
      new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
      new CompletePaymentHandler(paymentRepo, saleRepo),
      new SettlePaymentHandler(paymentRepo, saleRepo),
      new FailPaymentHandler(paymentRepo, saleRepo),
      new CancelPaymentHandler(paymentRepo, saleRepo),
      new ListPaymentsHandler(paymentRepo),
    );

    validationPipe = new GlobalSanitizationValidationPipe();
    exceptionFilter = new SalesExceptionFilter();
  });

  // =========================================================================
  // 1. MALFORMED SALE AND PAYMENT IDENTIFIERS
  // =========================================================================
  describe('1. Malformed Sale and Payment Identifiers', () => {
    it('rejects empty, whitespace, and non-string saleId on POST /sales/:saleId/payments', async () => {
      const validDto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 25.0,
      };

      await expect(controller.recordPayment('', validDto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.recordPayment('   ', validDto, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.recordPayment(null as unknown as string, validDto, managerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty and whitespace saleId on GET /sales/:saleId/payments', async () => {
      await expect(controller.getPaymentsBySaleId('', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getPaymentsBySaleId('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.getPaymentsBySaleId(undefined as unknown as string, managerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty and whitespace paymentId on GET /payments/:id', async () => {
      await expect(controller.getPaymentById('', managerUser)).rejects.toThrow(BadRequestException);
      await expect(controller.getPaymentById('   ', managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.getPaymentById(undefined as unknown as string, managerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty and whitespace paymentId on complete, settle, fail, and cancel endpoints', async () => {
      await expect(controller.completePayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.completePayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.settlePayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.settlePayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.failPayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.failPayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.cancelPayment('', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.cancelPayment('   ', {}, managerUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // 2. INVALID REQUEST BODIES & NON-WHITELISTED FIELD REJECTION
  // =========================================================================
  describe('2. Invalid Request Bodies & Whitelist Enforcement', () => {
    it('rejects payload missing required method via ValidationPipe', async () => {
      const payload = { amount: 50.0 };
      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: RecordPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unwhitelisted properties injected into RecordPaymentRequestDto (e.g. total, subtotal, paidAt)', async () => {
      const payload = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        injectedTotal: 0.0,
        injectedStatus: 'PAID',
        paidAt: new Date().toISOString(),
      };

      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: RecordPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted lifecycle fields injected into CompletePaymentRequestDto', async () => {
      const payload = {
        reference: 'TRACE-1234',
        status: PaymentStatus.COMPLETED,
        paidAt: new Date().toISOString(),
      };

      await expect(
        validationPipe.transform(payload, { type: 'body', metatype: CompletePaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted fields injected into FailPaymentRequestDto or CancelPaymentRequestDto', async () => {
      const failPayload = { reason: 'Decline', newStatus: 'FAILED', amount: 100 };
      await expect(
        validationPipe.transform(failPayload, { type: 'body', metatype: FailPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);

      const cancelPayload = { reason: 'Void', status: 'CANCELLED', refund: true };
      await expect(
        validationPipe.transform(cancelPayload, {
          type: 'body',
          metatype: CancelPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects references containing prohibited characters or excessive length', async () => {
      const injectionPayload = {
        method: PaymentMethod.CASH,
        amount: 25.0,
        reference: '<script>alert("xss")</script>',
      };

      await expect(
        validationPipe.transform(injectionPayload, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 3. UNSUPPORTED PAYMENT METHODS
  // =========================================================================
  describe('3. Unsupported Payment Methods', () => {
    it('rejects unsupported methods (BITCOIN, CRYPTO, CREDIT_CARD) with 400 Bad Request', async () => {
      const unsupported = ['BITCOIN', 'CRYPTO', 'CREDIT_CARD', 'STRIPE', 'PAYPAL'];
      for (const method of unsupported) {
        const payload = {
          method,
          amount: 50.0,
        };
        await expect(
          validationPipe.transform(payload, { type: 'body', metatype: RecordPaymentRequestDto }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('maps domain InvalidPaymentMethodException to HTTP 400 Bad Request with code BAD_REQUEST', () => {
      const host = createMockHost();
      const ex = new InvalidPaymentMethodException('BITCOIN');

      exceptionFilter.catch(ex, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(host.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
        }),
      );
    });
  });

  // =========================================================================
  // 4. INVALID MONETARY VALUES & CURRENCY RULES
  // =========================================================================
  describe('4. Invalid Monetary Values & Currency Validation', () => {
    it('rejects non-positive payment amounts (0 and negative) via ValidationPipe', async () => {
      const zeroPayload = { method: PaymentMethod.CASH, amount: 0 };
      await expect(
        validationPipe.transform(zeroPayload, { type: 'body', metatype: RecordPaymentRequestDto }),
      ).rejects.toThrow(BadRequestException);

      const negativePayload = { method: PaymentMethod.CASH, amount: -15.5 };
      await expect(
        validationPipe.transform(negativePayload, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects amounts exceeding 2 decimal places (fractional cents) via ValidationPipe', async () => {
      const excessiveDecimals = { method: PaymentMethod.CASH, amount: 19.999 };
      await expect(
        validationPipe.transform(excessiveDecimals, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed ISO-4217 currency strings', async () => {
      const malformedCurrencies = ['US', 'USDD', 'usd', '123', 'U$D'];
      for (const curr of malformedCurrencies) {
        const payload = { method: PaymentMethod.CASH, amount: 10.0, currency: curr };
        await expect(
          validationPipe.transform(payload, { type: 'body', metatype: RecordPaymentRequestDto }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('maps domain InvalidMoneyException and PaymentCurrencyMismatchException to HTTP 400', () => {
      const host = createMockHost();
      const moneyEx = new InvalidMoneyException('Negative cents not permitted');
      exceptionFilter.catch(moneyEx, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      const currMismatchEx = new PaymentCurrencyMismatchException('EUR', 'USD');
      exceptionFilter.catch(currMismatchEx, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  // =========================================================================
  // 5. MISSING SALE OR PAYMENT (NOT FOUND VS FORBIDDEN POLICY)
  // =========================================================================
  describe('5. Missing Sale or Payment (Not Found vs. Forbidden Policy)', () => {
    it('throws PaymentNotFoundException (HTTP 404) when target payment does not exist', async () => {
      await expect(controller.getPaymentById('pmt_non_existent_999', managerUser)).rejects.toThrow(
        PaymentNotFoundException,
      );
    });

    it('throws SaleNotFoundException (HTTP 404) when target sale does not exist for payment lookup', async () => {
      await expect(
        controller.getPaymentsBySaleId('sale_non_existent_999', managerUser),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('enforces tenant isolation policy: cross-tenant payment lookups throw PaymentUnauthorizedException (HTTP 403 Forbidden)', async () => {
      const sale = createActiveSale({ tenantId: validTenantId });
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      await paymentRepo.save(payment);

      // Caller from Tenant B querying Tenant A payment
      await expect(controller.getPaymentById(payment.id.value, otherTenantUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('maps domain UnauthorizedExceptions to HTTP 403 Forbidden', () => {
      const host = createMockHost();
      const pmtAuthEx = new PaymentUnauthorizedException('Insufficient permissions');
      exceptionFilter.catch(pmtAuthEx, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(host.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
        }),
      );
    });
  });

  // =========================================================================
  // 6. INVALID STATE TRANSITIONS (422 UNPROCESSABLE ENTITY)
  // =========================================================================
  describe('6. Invalid State Transitions (Distinguished from 400 Bad Request)', () => {
    it('rejects completion of an already COMPLETED payment with 422 Unprocessable Entity', async () => {
      const sale = createActiveSale();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      await paymentRepo.save(payment);

      await expect(controller.completePayment(payment.id.value, {}, managerUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );
    });

    it('rejects cancellation of an already COMPLETED payment with 422 Unprocessable Entity', async () => {
      const sale = createActiveSale();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      await paymentRepo.save(payment);

      await expect(
        controller.cancelPayment(payment.id.value, { reason: 'Mistake' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);
    });

    it('rejects failure of an already CANCELLED payment with 422 Unprocessable Entity', async () => {
      const sale = createActiveSale();
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      payment.cancel({ reason: 'Void', clock: fixedClock });
      await paymentRepo.save(payment);

      await expect(
        controller.failPayment(payment.id.value, { reason: 'Decline' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);
    });

    it('maps domain InvalidPaymentTransitionException, SaleNotPayableException, and PaymentOverpaymentException to 422', () => {
      const host = createMockHost();

      const transitionEx = new InvalidPaymentTransitionException(
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        'Cannot fail completed payment',
      );
      exceptionFilter.catch(transitionEx, host.mockHost);
      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);

      const notPayableEx = new SaleNotPayableException('sale_1', 'CANCELLED');
      exceptionFilter.catch(notPayableEx, host.mockHost);
      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);

      const overpayEx = new PaymentOverpaymentException('150.00', '100.00', 'USD');
      exceptionFilter.catch(overpayEx, host.mockHost);
      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  // =========================================================================
  // 7. TRANSACTION AND CONCURRENCY CONFLICTS (409 CONFLICT)
  // =========================================================================
  describe('7. Transaction Conflicts & Concurrency Guarantees (HTTP 409 Conflict)', () => {
    it('maps PaymentOptimisticLockException and SaleOptimisticLockException to HTTP 409 Conflict', () => {
      const host = createMockHost();

      const paymentLockEx = new PaymentOptimisticLockException('pmt_123', 1);
      exceptionFilter.catch(paymentLockEx, host.mockHost);
      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);

      const saleLockEx = new SaleOptimisticLockException('Sale', 'sale_123', 1);
      exceptionFilter.catch(saleLockEx, host.mockHost);
      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    });

    it('maps DuplicatePaymentReferenceException to HTTP 409 Conflict', () => {
      const host = createMockHost();
      const dupRefEx = new DuplicatePaymentReferenceException('QR-TRACE-999', 'sale_123');
      exceptionFilter.catch(dupRefEx, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(host.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
        }),
      );
    });

    it('maps database unique constraint error code P2002 to HTTP 409 Conflict without leaking SQL', () => {
      const host = createMockHost();
      const prismaP2002 = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        clientVersion: '6.3.1',
        message: 'Unique constraint failed on the fields: (`tenant_id`, `reference`)',
      };

      exceptionFilter.catch(prismaP2002, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      const resPayload = host.mockResponse.json.mock.calls[0][0];
      expect(resPayload.statusCode).toBe(HttpStatus.CONFLICT);
      expect(resPayload.error).toBe('Conflict');
      expect(JSON.stringify(resPayload)).not.toContain('Unique constraint failed');
    });
  });

  // =========================================================================
  // 8. PERSISTENCE FAILURES & INFORMATION LEAKAGE PREVENTION (HTTP 500)
  // =========================================================================
  describe('8. Persistence Failures & Information Leakage Prevention', () => {
    it('masks raw database and connection exceptions as generic 500 without leaking SQL or passwords', () => {
      const host = createMockHost();
      const rawDbError = new Error(
        'ERROR: relation "payments" does not exist at character 42\nSELECT * FROM "payments" WHERE id = $1\nconnection to postgresql://kinergy_admin:SuperSecretPw@127.0.0.1:5432 failed',
      );

      exceptionFilter.catch(rawDbError, host.mockHost);

      expect(host.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = host.mockResponse.json.mock.calls[0][0];
      expect(resPayload).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });

      // Confirm zero leakage of technical details, stack traces, or credentials
      expect(resPayload.stack).toBeUndefined();
      expect(JSON.stringify(resPayload)).not.toContain('SuperSecretPw');
      expect(JSON.stringify(resPayload)).not.toContain('SELECT * FROM');
    });

    it('preserves x-correlation-id and x-request-id on error responses', () => {
      const host = createMockHost();
      host.mockRequest.headers['x-correlation-id'] = 'corr_payments_rel_001';
      host.mockRequest.headers['x-request-id'] = 'req_payments_rel_001';

      const ex = new PaymentNotFoundException('pmt_404');
      exceptionFilter.catch(ex, host.mockHost);

      expect(host.mockResponse.setHeader).toHaveBeenCalledWith(
        'x-correlation-id',
        'corr_payments_rel_001',
      );
      expect(host.mockResponse.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        'req_payments_rel_001',
      );
    });
  });

  // =========================================================================
  // 9. MUTATION REJECTION & PERSISTENCE IMMUTABILITY
  // =========================================================================
  describe('9. Mutation Rejection & Persistence Immutability', () => {
    it('does not persist any changes when payment tender creation is rejected due to currency mismatch', async () => {
      const sale = createActiveSale({ currency: 'USD' });
      await saleRepo.save(sale);
      const initialPaymentSaveCount = paymentRepo.saveCallCount;

      const mismatchedDto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        currency: 'EUR', // Mismatched currency
      };

      await expect(
        controller.recordPayment(sale.id.value, mismatchedDto, managerUser),
      ).rejects.toThrow();

      // Ensure zero mutations persisted to database
      expect(paymentRepo.saveCallCount).toBe(initialPaymentSaveCount);
      expect(paymentRepo.store.size).toBe(0);
    });

    it('does not mutate payment state when completion is rejected due to invalid lifecycle state', async () => {
      const sale = createActiveSale();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      await paymentRepo.save(payment);
      const initialSaveCount = paymentRepo.saveCallCount;
      const initialVersion = payment.version;

      await expect(controller.completePayment(payment.id.value, {}, managerUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );

      // Verify payment remains unchanged
      expect(paymentRepo.saveCallCount).toBe(initialSaveCount);
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.version).toBe(initialVersion);
      expect(stored!.status).toBe(PaymentStatus.COMPLETED);
    });

    it('does not mutate payment state when cancellation is rejected due to invalid lifecycle state', async () => {
      const sale = createActiveSale();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          saleId: sale.id.value,
          tenantId: validTenantId,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        fixedClock,
      );
      await paymentRepo.save(payment);
      const initialSaveCount = paymentRepo.saveCallCount;

      await expect(
        controller.cancelPayment(payment.id.value, { reason: 'Void attempt' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);

      expect(paymentRepo.saveCallCount).toBe(initialSaveCount);
      const stored = await paymentRepo.findById(payment.id.value);
      expect(stored!.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // --- Helper Functions ---

  function createActiveSale(
    overrides: { tenantId?: string; currency?: string; total?: number } = {},
  ): Sale {
    const sale = Sale.create({
      tenantId: overrides.tenantId ?? validTenantId,
      currency: overrides.currency ?? 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_item_001',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_item_001',
      }),
      description: 'Protein Shake',
      quantity: 1,
      unitPrice: Money.create(overrides.total ?? 100.0, overrides.currency ?? 'USD'),
    });
    sale.finalize(fixedClock);
    return sale;
  }

  function createMockHost() {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    const mockRequest = {
      url: '/api/v1/payments',
      method: 'POST',
      headers: {
        'x-correlation-id': 'corr_test_mock',
      } as Record<string, string>,
    };
    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => mockRequest as unknown as Request,
        getNext: () => jest.fn(),
      }),
    } as unknown as ArgumentsHost;

    return { mockResponse, mockRequest, mockHost };
  }
});
