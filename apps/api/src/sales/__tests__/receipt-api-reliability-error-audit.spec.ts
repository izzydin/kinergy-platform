import { Test, TestingModule } from '@nestjs/testing';
import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  ReceiptStatus,
  Payment,
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  GetReceiptBySaleHandler,
  SaleNotFoundException,
  ReceiptNotFoundException,
  ReceiptUnauthorizedException,
  ReceiptPersistenceException,
  InMemoryReceiptSequenceGenerator,
} from '@kinergy-platform/core';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { ReceiptResponseDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// --- Instrumented In-Memory Repositories for Mutation Tracking ---

class SpyReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCallCount = 0;
  public findBySaleIdCallCount = 0;
  public simulatePersistenceError = false;
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    this.findBySaleIdCallCount++;
    if (this.simulatePersistenceError) {
      throw new ReceiptPersistenceException(
        'PrismaClientKnownRequestError: Can not connect to database at postgresql://postgres:secret_pass@127.0.0.1:5432/kinergy_prod',
        { cause: new Error('ECONNREFUSED 127.0.0.1:5432') },
      );
    }
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        if (tenantId && receipt.tenantId !== tenantId) {
          continue;
        }
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.saveCallCount++;
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}

class SpySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public findByIdCallCount = 0;
  public simulatePersistenceError = false;

  async findById(id: SaleId | string): Promise<Sale | null> {
    this.findByIdCallCount++;
    if (this.simulatePersistenceError) {
      throw new Error('Database read deadlock on sale table');
    }
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.store.set(sale.id.value, sale);
  }
}

class SpyPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCallCount = 0;

  async findById(): Promise<Payment | null> {
    return null;
  }

  async findBySaleId(): Promise<Payment[]> {
    return [];
  }

  async save(payment: Payment): Promise<void> {
    this.saveCallCount++;
    this.store.set(payment.id.value, payment);
  }
}

describe('Receipt API Reliability & Error Handling Audit Spec (Milestone 7.16)', () => {
  const primaryTenantId = 'tenant_kinergy_hq';
  const rivalTenantId = 'tenant_external_facility';

  const staffUser: AuthenticatedUserPayload = {
    id: 'user_frontdesk_01',
    email: 'frontdesk@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts.read', 'sales.read'],
    tenantId: primaryTenantId,
  };

  const clientUserA: AuthenticatedUserPayload = {
    id: 'user_client_a',
    email: 'client_a@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId: primaryTenantId,
  };

  const clientUserB: AuthenticatedUserPayload = {
    id: 'user_client_b',
    email: 'client_b@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId: primaryTenantId,
  };

  const unprivilegedUser: AuthenticatedUserPayload = {
    id: 'user_visitor_01',
    email: 'visitor@example.com',
    status: 'ACTIVE',
    roles: ['Visitor'],
    permissions: [],
    tenantId: primaryTenantId,
  };

  const rivalTenantUser: AuthenticatedUserPayload = {
    id: 'user_rival_manager',
    email: 'manager@external.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['receipts.read'],
    tenantId: rivalTenantId,
  };

  let controller: ReceiptsController;
  let receiptRepo: SpyReceiptRepository;
  let saleRepo: SpySaleRepository;
  let paymentRepo: SpyPaymentRepository;
  let exceptionFilter: SalesExceptionFilter;

  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };

  let mockRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };

  let mockHost: ArgumentsHost;

  const createSaleWithReceipt = (
    tenantId: string = primaryTenantId,
    clientId?: string,
  ): { sale: Sale; receipt: Receipt } => {
    const sale = Sale.create({
      tenantId,
      clientId,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_basic',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_basic',
      }),
      description: 'Basic Monthly Membership',
      quantity: 1,
      unitPrice: Money.create(50.0, 'USD'),
    });
    sale.finalize();
    sale.markPaid();
    saleRepo.store.set(sale.id.value, sale);

    const payment = Payment.createCompleted({
      saleId: sale.id,
      tenantId,
      amount: Money.create(50.0, 'USD'),
      method: PaymentMethod.CASH,
    });
    paymentRepo.store.set(payment.id.value, payment);

    const receipt = Receipt.fromSettledSale({
      sale,
      payments: [payment],
      receiptNumber: 'REC-2026-000100',
      clientSummary: clientId
        ? {
            id: clientId,
            fullName: 'Test Client',
          }
        : null,
    });
    receiptRepo.store.set(receipt.id.value, receipt);

    return { sale, receipt };
  };

  beforeEach(async () => {
    receiptRepo = new SpyReceiptRepository();
    saleRepo = new SpySaleRepository();
    paymentRepo = new SpyPaymentRepository();
    exceptionFilter = new SalesExceptionFilter();

    mockRequest = {
      url: '/api/v1/sales/sale_test_123/receipt',
      method: 'GET',
      headers: {
        'x-correlation-id': 'corr_audit_999888',
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => mockRequest as unknown as Request,
        getNext: () => jest.fn(),
      }),
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
      switchToWs: () => ({ getData: () => undefined, getClient: () => undefined }),
      getType: () => 'http',
    } as unknown as ArgumentsHost;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [
        {
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: receiptRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: GetReceiptBySaleHandler,
          useFactory: () => new GetReceiptBySaleHandler(receiptRepo, saleRepo),
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReceiptsController>(ReceiptsController);
  });

  describe('1. Route Parameter & Identifier Validation (HTTP 400)', () => {
    it('rejects empty string saleId with BadRequestException and established validation response', async () => {
      let caughtError: unknown;
      try {
        await controller.getReceiptBySale('', staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Sale ID cannot be empty or whitespace.',
        }),
      );

      // Verify zero repository reads or writes
      expect(saleRepo.findByIdCallCount).toBe(0);
      expect(receiptRepo.findBySaleIdCallCount).toBe(0);
      expect(receiptRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects whitespace-only saleId with BadRequestException and established validation response', async () => {
      let caughtError: unknown;
      try {
        await controller.getReceiptBySale('   \t  ', staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Sale ID cannot be empty or whitespace.',
        }),
      );

      expect(receiptRepo.saveCallCount).toBe(0);
    });
  });

  describe('2. Contractual Non-Existent Sale Response (HTTP 404)', () => {
    it('returns SaleNotFoundException mapped to HTTP 404 when target sale does not exist', async () => {
      const nonExistentSaleId = 'sale_does_not_exist_999';

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(nonExistentSaleId, staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(SaleNotFoundException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: `Sale with ID '${nonExistentSaleId}' was not found.`,
      });

      // Assert no receipt search occurred after missing sale check and no writes performed
      expect(saleRepo.findByIdCallCount).toBe(1);
      expect(receiptRepo.findBySaleIdCallCount).toBe(0);
      expect(receiptRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });

  describe('3. Contractual Sale Exists Without Receipt Response (HTTP 404)', () => {
    it('distinguishes missing receipt from missing sale by returning ReceiptNotFoundException (HTTP 404)', async () => {
      // Sale exists, but receipt has NOT been issued
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold',
        }),
        description: 'Gold Membership',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();
      saleRepo.store.set(sale.id.value, sale);

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptNotFoundException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: `Receipt with identifier 'sale:${sale.id.value}' was not found.`,
      });

      // Invariant: Zero silent issuance on missing receipt query
      expect(saleRepo.findByIdCallCount).toBe(1);
      expect(receiptRepo.findBySaleIdCallCount).toBe(1);
      expect(receiptRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
      expect(paymentRepo.saveCallCount).toBe(0);
    });

    it('returns ReceiptNotFoundException for cancelled sale without a receipt without changing sale status', async () => {
      const sale = Sale.create({
        tenantId: primaryTenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancelled',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancelled',
        }),
        description: 'Cancelled Item',
        quantity: 1,
        unitPrice: Money.create(60.0, 'USD'),
      });
      sale.finalize();
      sale.cancel('Customer declined');
      saleRepo.store.set(sale.id.value, sale);

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptNotFoundException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

      // Verify sale remains in CANCELLED status and was not mutated
      const persistedSale = await saleRepo.findById(sale.id.value);
      expect(persistedSale?.status).toBe('CANCELLED');
      expect(saleRepo.saveCallCount).toBe(0);
      expect(receiptRepo.saveCallCount).toBe(0);
    });
  });

  describe('4. Valid Issued Receipt Resolution (HTTP 200 Success)', () => {
    it('returns HTTP 200 with complete ReceiptResponseDto when sale and receipt exist', async () => {
      const { sale, receipt } = createSaleWithReceipt(primaryTenantId, clientUserA.id);

      const result: ReceiptResponseDto = await controller.getReceiptBySale(
        sale.id.value,
        staffUser,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(receipt.id.value);
      expect(result.saleId).toBe(sale.id.value);
      expect(result.receiptNumber).toBe('REC-2026-000100');
      expect(result.status).toBe(ReceiptStatus.ISSUED);
      expect(result.total.cents).toBe(5000);
      expect(result.total.formatted).toBe('50.00');
      expect(result.reprintCount).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.payments).toHaveLength(1);

      // Verify read-only guarantee: zero writes on success
      expect(receiptRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });

  describe('5. IAM Authentication & Authorization (HTTP 401 & 403)', () => {
    it('maps unauthenticated requests to standard 401 Unauthorized envelope', () => {
      const authError = new UnauthorizedException('Authentication token required.');
      exceptionFilter.catch(authError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'Unauthorized',
          message: 'Authentication token required.',
        }),
      );
    });

    it('rejects caller lacking receipts.read permission with ReceiptUnauthorizedException (HTTP 403)', async () => {
      const { sale } = createSaleWithReceipt(primaryTenantId);

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, unprivilegedUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptUnauthorizedException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: expect.stringContaining('not authorized for this receipt action'),
        }),
      );

      expect(receiptRepo.saveCallCount).toBe(0);
    });

    it('rejects cross-tenant access with ReceiptUnauthorizedException (HTTP 403)', async () => {
      const { sale } = createSaleWithReceipt(primaryTenantId);

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, rivalTenantUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptUnauthorizedException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: expect.stringContaining('Cross-tenant access forbidden'),
        }),
      );

      expect(receiptRepo.saveCallCount).toBe(0);
    });

    it('rejects Client A attempting to view Client B receipt (BOLA defense, HTTP 403)', async () => {
      // Sale belongs to Client A
      const { sale } = createSaleWithReceipt(primaryTenantId, clientUserA.id);

      // Client B attempts to fetch it
      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, clientUserB);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptUnauthorizedException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: expect.stringContaining(
            'clients are only authorized to access their own receipts',
          ),
        }),
      );

      expect(receiptRepo.saveCallCount).toBe(0);
    });
  });

  describe('6. Persistence Layer Fault Isolation & Data Masking (HTTP 500)', () => {
    it('isolates unexpected database failure and returns generic 500 without leaking connection string or SQL', async () => {
      const { sale } = createSaleWithReceipt(primaryTenantId);
      receiptRepo.simulatePersistenceError = true;

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale(sale.id.value, staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ReceiptPersistenceException);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = mockResponse.json.mock.calls[0][0];

      expect(resPayload).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });

      // Strictly verify absence of raw technical database details
      const payloadString = JSON.stringify(resPayload);
      expect(payloadString).not.toContain('PrismaClientKnownRequestError');
      expect(payloadString).not.toContain('postgresql://');
      expect(payloadString).not.toContain('secret_pass');
      expect(payloadString).not.toContain('5432');
      expect(payloadString).not.toContain('kinergy_prod');
      expect(resPayload.stack).toBeUndefined();

      // Verify correlation ID preservation
      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr_audit_999888');

      // Verify zero writes occurred during failure
      expect(receiptRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('isolates unexpected sale read deadlock and returns generic 500 without leaking details', async () => {
      saleRepo.simulatePersistenceError = true;

      let caughtError: unknown;
      try {
        await controller.getReceiptBySale('sale_deadlock_test', staffUser);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      exceptionFilter.catch(caughtError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(resPayload.message).toBe('An unexpected internal server error occurred.');
      expect(JSON.stringify(resPayload)).not.toContain('deadlock');
      expect(receiptRepo.saveCallCount).toBe(0);
    });
  });

  describe('7. Absence of Sensitive Data in Error Responses & Redaction', () => {
    it('masks payment PAN, bearer tokens, or client details if present in validation exceptions', () => {
      const sensitiveException = new BadRequestException(
        'Invalid receipt query parameter: client card 4111222233334444 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token.sig',
      );
      exceptionFilter.catch(sensitiveException, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const payload = mockResponse.json.mock.calls[0][0];
      const payloadStr = JSON.stringify(payload);

      expect(payloadStr).toContain('****-****-****-[MASKED]');
      expect(payloadStr).not.toContain('4111222233334444');
      expect(payloadStr).toContain('[REDACTED');
      expect(payloadStr).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });
});
