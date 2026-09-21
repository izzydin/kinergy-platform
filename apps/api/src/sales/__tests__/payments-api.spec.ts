import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  Payment,
  PaymentId,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  RecordPaymentHandler,
  SaleNotFoundException,
  PaymentNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  PaymentCurrencyMismatchException,
  InvalidPaymentMethodException,
  InvalidPaymentTransitionException,
} from '@kinergy-platform/core';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import {
  RecordPaymentRequestDto,
  PaymentResponseDto,
  SettlePaymentRequestDto,
  CancelPaymentRequestDto,
} from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// In-Memory Test Doubles
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public items = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.items.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.items.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public items = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.items.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, sale);
  }
}

describe('Payment HTTP API Architecture & Exception Spec', () => {
  const tenantId = 'tenant_kinergy_wellness';

  const defaultUser: AuthenticatedUserPayload = {
    id: 'user_cashier_01',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read'],
    tenantId,
  };

  let controller: PaymentsController;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let exceptionFilter: SalesExceptionFilter;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_1',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_1',
      }),
      description: 'Annual Wellness Pass',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize();
    saleRepo.items.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    exceptionFilter = new SalesExceptionFilter();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  // 1. Create Payment
  describe('1. Create Payment (POST /api/v1/sales/:saleId/payments)', () => {
    it('records a CASH payment directly in SETTLED status and advances Sale to PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 100.0,
        currency: 'USD',
        reference: 'DRAWER-01-RECEIPT-99',
      };

      const response: PaymentResponseDto = await controller.recordPayment(
        sale.id.value,
        dto,
        defaultUser,
      );

      expect(response.id).toBeDefined();
      expect(response.saleId).toBe(sale.id.value);
      expect(response.method).toBe(PaymentMethod.CASH);
      expect(response.status).toBe(PaymentStatus.SETTLED);
      expect(response.reference).toBe('DRAWER-01-RECEIPT-99');
      expect(response.paidAt).toBeDefined();
      expect(response.createdAt).toBeDefined();
      expect(response.version).toBe(1);

      // Verify exact MoneyResponseDto
      expect(response.amount).toEqual({
        amount: 100.0,
        currency: 'USD',
        formatted: '100.00',
        cents: 10000,
      });
      expect(response.amountValue).toBe(100.0);

      // Verify Sale status is now PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('records a QR payment in PENDING status when tender is asynchronous', async () => {
      const sale = createPayableSale(150.0, 'USD');

      // Emulate QR creation handler call
      const recordHandler = new RecordPaymentHandler(paymentRepo, saleRepo);
      const commandRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 150.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          reference: 'QR-INVOICE-KEY-123',
          tenantId,
          currentUser: defaultUser,
        },
      });

      expect(commandRes.isSuccess).toBe(true);
      const paymentDto = commandRes.getValue();
      expect(paymentDto.status).toBe(PaymentStatus.PENDING);
      expect(paymentDto.paidAt).toBeNull();
    });
  });

  // 2. Retrieve Payment
  describe('2. Retrieve Payment (GET /api/v1/payments/:paymentId)', () => {
    it('retrieves an existing payment by its UUID', async () => {
      const sale = createPayableSale(75.5, 'USD');
      const created = await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 75.5,
          reference: 'REC-75',
        },
        defaultUser,
      );

      const retrieved = await controller.getPaymentById(created.id, defaultUser);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.amount.formatted).toBe('75.50');
      expect(retrieved.amount.cents).toBe(7550);
      expect(retrieved.reference).toBe('REC-75');
    });

    it('throws PaymentNotFoundException when payment ID does not exist', async () => {
      await expect(controller.getPaymentById('non_existent_pay_id', defaultUser)).rejects.toThrow(
        PaymentNotFoundException,
      );
    });
  });

  // 3. List Payments by Sale
  describe('3. List Payments by Sale (GET /api/v1/sales/:saleId/payments)', () => {
    it('retrieves all payments associated with a sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 40.0,
        },
        defaultUser,
      );

      await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.QR,
          amount: 60.0,
        },
        defaultUser,
      );

      const list = await controller.getPaymentsBySaleId(sale.id.value, defaultUser);

      expect(list.length).toBe(2);
      expect(list[0]!.amount.formatted).toBe('40.00');
      expect(list[1]!.amount.formatted).toBe('60.00');
    });
  });

  // 4. Valid and Invalid Method
  describe('4. Payment Method Validation', () => {
    it('accepts valid methods CASH and QR', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const cashRes = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 50.0 },
        defaultUser,
      );
      expect(cashRes.method).toBe(PaymentMethod.CASH);

      const qrRes = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 50.0 },
        defaultUser,
      );
      expect(qrRes.method).toBe(PaymentMethod.QR);
    });

    it('rejects unsupported / future payment methods with InvalidPaymentMethodException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          {
            method: 'CARD' as PaymentMethod,
            amount: 50.0,
          },
          defaultUser,
        ),
      ).rejects.toThrow(InvalidPaymentMethodException);
    });
  });

  // 5. Valid and Invalid Amount
  describe('5. Monetary Amount Validation', () => {
    it('accepts exact 2-decimal major unit numbers', async () => {
      const sale = createPayableSale(99.99, 'USD');

      const res = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 99.99 },
        defaultUser,
      );
      expect(res.amount.formatted).toBe('99.99');
      expect(res.amount.cents).toBe(9999);
    });

    it('rejects overpayment exceeding remaining sale balance with PaymentOverpaymentException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 120.0 },
          defaultUser,
        ),
      ).rejects.toThrow(PaymentOverpaymentException);
    });

    it('rejects payment with mismatched currency with PaymentCurrencyMismatchException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0, currency: 'EUR' },
          defaultUser,
        ),
      ).rejects.toThrow(PaymentCurrencyMismatchException);
    });
  });

  // 6. Missing Sale
  describe('6. Missing Sale Handling', () => {
    it('throws SaleNotFoundException when targeted sale ID does not exist', async () => {
      await expect(
        controller.recordPayment(
          'non_existent_sale_999',
          { method: PaymentMethod.CASH, amount: 50.0 },
          defaultUser,
        ),
      ).rejects.toThrow(SaleNotFoundException);
    });
  });

  // 7. Security: Unauthorized & Forbidden
  describe('7. Security & RBAC Enforcement', () => {
    it('rejects payment recording when user lacks payments.create permission', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_guest',
        email: 'guest@example.com',
        status: 'ACTIVE',
        roles: ['Guest'],
        permissions: ['sales.read'], // Missing payments.create
        tenantId,
      };

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          unauthorizedUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('rejects payment query when user lacks payments.read permission', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const created = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 50.0 },
        defaultUser,
      );

      const unauthorizedUser: AuthenticatedUserPayload = {
        id: 'user_unauth',
        email: 'unauth@example.com',
        status: 'ACTIVE',
        roles: ['Member'],
        permissions: ['inventory.read'], // Missing payments.read
        tenantId,
      };

      await expect(controller.getPaymentById(created.id, unauthorizedUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('rejects cross-tenant payment operation with PaymentUnauthorizedException', async () => {
      const sale = createPayableSale(100.0, 'USD'); // Belongs to 'tenant_kinergy_wellness'

      const crossTenantUser: AuthenticatedUserPayload = {
        id: 'user_other',
        email: 'other@tenant.com',
        status: 'ACTIVE',
        roles: ['Owner'],
        permissions: ['payments.create', 'payments.read'],
        tenantId: 'tenant_competitor_wellness', // Mismatched tenant
      };

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          crossTenantUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });

  // 8. Lifecycle Transitions
  describe('8. Lifecycle Transition Operations', () => {
    it('confirms settlement of a PENDING payment via settlePayment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Create pending QR payment
      const recordHandler = new RecordPaymentHandler(paymentRepo, saleRepo);
      const createRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
          currentUser: defaultUser,
        },
      });
      const pendingDto = createRes.getValue();

      // Settle via controller
      const settleDto: SettlePaymentRequestDto = {
        reference: 'QR-TRACE-SETTLED-888',
      };
      const settled = await controller.settlePayment(pendingDto.id, settleDto, defaultUser);

      expect(settled.status).toBe(PaymentStatus.SETTLED);
      expect(settled.paidAt).toBeDefined();
      expect(settled.reference).toBe('QR-TRACE-SETTLED-888');

      // Verify Sale status is now PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('voids/cancels a PENDING payment via cancelPayment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const recordHandler = new RecordPaymentHandler(paymentRepo, saleRepo);
      const createRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
          currentUser: defaultUser,
        },
      });
      const pendingDto = createRes.getValue();

      const cancelDto: CancelPaymentRequestDto = {
        reason: 'Customer declined mobile wallet tender',
      };
      const cancelled = await controller.cancelPayment(pendingDto.id, cancelDto, defaultUser);

      expect(cancelled.status).toBe(PaymentStatus.CANCELLED);
    });

    it('rejects settling or cancelling an already SETTLED payment with InvalidPaymentTransitionException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const settled = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0 },
        defaultUser,
      );

      // Settle attempt
      await expect(controller.settlePayment(settled.id, {}, defaultUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );

      // Cancel attempt
      await expect(controller.cancelPayment(settled.id, {}, defaultUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );
    });
  });

  // 9. SalesExceptionFilter HTTP Envelope Translation
  describe('9. SalesExceptionFilter Invariant Error Translations', () => {
    let mockResponse: {
      status: jest.Mock;
      json: jest.Mock;
    };
    let mockHost: ArgumentsHost;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse as unknown as Response,
          getRequest: () => ({ url: '/api/v1/payments' }) as unknown,
          getNext: () => jest.fn(),
        }),
        getArgs: () => [],
        getArgByIndex: () => undefined,
        switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
        switchToWs: () => ({ getData: () => undefined, getClient: () => undefined }),
        getType: () => 'http',
      } as unknown as ArgumentsHost;
    });

    it('translates SaleNotFoundException to 404 Not Found', () => {
      const ex = new SaleNotFoundException('sale_123');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
        }),
      );
    });

    it('translates PaymentNotFoundException to 404 Not Found', () => {
      const ex = new PaymentNotFoundException('pay_456');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
        }),
      );
    });

    it('translates PaymentUnauthorizedException to 403 Forbidden', () => {
      const ex = new PaymentUnauthorizedException('Cross-tenant access forbidden');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
        }),
      );
    });

    it('translates PaymentOverpaymentException to 422 Unprocessable Entity', () => {
      const ex = new PaymentOverpaymentException('150.00', '100.00', 'USD');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );
    });

    it('translates SaleNotPayableException to 422 Unprocessable Entity', () => {
      const ex = new SaleNotPayableException('sale_1', 'DRAFT');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );
    });

    it('translates InvalidPaymentTransitionException to 422 Unprocessable Entity', () => {
      const ex = new InvalidPaymentTransitionException(
        PaymentStatus.SETTLED,
        PaymentStatus.CANCELLED,
      );
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
        }),
      );
    });

    it('translates InvalidPaymentMethodException to 400 Bad Request', () => {
      const ex = new InvalidPaymentMethodException('CARD');
      exceptionFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
        }),
      );
    });
  });
});
