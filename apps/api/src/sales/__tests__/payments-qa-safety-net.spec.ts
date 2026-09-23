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
  SaleNotFoundException,
  PaymentNotFoundException,
  SaleNotPayableException,
  PaymentUnauthorizedException,
  InvalidPaymentMethodException,
  InvalidPaymentTransitionException,
  InvalidPaymentReferenceException,
} from '@kinergy-platform/core';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { RecordPaymentRequestDto, PaymentResponseDto, CancelPaymentRequestDto } from '../dto';
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

describe('Phase 7.5 Payment QA Safety Net: HTTP API & Security Spec (Sections 6 & 7)', () => {
  const tenantA = 'tenant_kinergy_alpha';
  const tenantB = 'tenant_kinergy_beta';

  const receptionistUserTenantA: AuthenticatedUserPayload = {
    id: 'user_receptionist_01',
    email: 'receptionist@alpha.kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read'],
    tenantId: tenantA,
  };

  const managerUserTenantA: AuthenticatedUserPayload = {
    id: 'user_manager_01',
    email: 'manager@alpha.kinergy.com',
    status: 'ACTIVE',
    roles: ['Gym Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage', 'sales.read'],
    tenantId: tenantA,
  };

  const receptionistUserTenantB: AuthenticatedUserPayload = {
    id: 'user_receptionist_02',
    email: 'receptionist@beta.kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read'],
    tenantId: tenantB,
  };

  let controller: PaymentsController;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let exceptionFilter: SalesExceptionFilter;

  const createPayableSale = (
    saleIdStr: string,
    tenant: string = tenantA,
    totalAmount: number = 100.0,
    currency: string = 'USD',
  ): Sale => {
    const sale = Sale.create({
      id: SaleId.create(saleIdStr),
      tenantId: tenant,
      currency,
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
      description: 'Gold Membership Plan',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize();
    sale.clearEvents();
    saleRepo.items.set(sale.id.value, sale);
    return sale;
  };

  const mockResponse = () => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  const mockHost = (res: Response): ArgumentsHost => {
    return {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ url: '/api/v1/sales/sale-1/payments' }),
      }),
    } as unknown as ArgumentsHost;
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

  // ==========================================================================
  // SECTION 6: HTTP API TESTS
  // ==========================================================================
  describe('6. HTTP API Tests (Contracts, Responses, Serialization & Error Mapping)', () => {
    describe('Valid API Operations', () => {
      it('POST /sales/:saleId/payments: records a valid cash payment and returns 201 with exact MoneyResponseDto', async () => {
        const sale = createPayableSale('sale_api_01', tenantA, 100.0, 'USD');

        const requestDto: RecordPaymentRequestDto = {
          amount: 50.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: 'DRAWER-REG-01',
        };

        const result: PaymentResponseDto = await controller.recordPayment(
          sale.id.value,
          requestDto,
          receptionistUserTenantA,
        );

        expect(result.id).toBeDefined();
        expect(result.saleId).toBe(sale.id.value);
        expect(result.method).toBe(PaymentMethod.CASH);
        expect(result.status).toBe(PaymentStatus.COMPLETED);

        // Monetary serialization fidelity
        expect(result.amount.cents).toBe(5000);
        expect(result.amount.formatted).toBe('50.00');
        expect(result.amount.currency).toBe('USD');

        // Reference preservation
        expect(result.reference).toBe('DRAWER-REG-01');
        expect(result.paidAt).toBeDefined();

        // Multi-tenant contextual scoping in persistence store
        const stored = await paymentRepo.findById(result.id);
        expect(stored?.tenantId).toBe(tenantA);
      });

      it('GET /sales/:saleId/payments: lists all payments strictly scoped to the specified sale', async () => {
        const sale = createPayableSale('sale_api_02', tenantA, 100.0, 'USD');

        // Create 2 payments for sale_api_02
        const p1 = Payment.createSettled({
          id: 'pay_1',
          tenantId: tenantA,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(30.0, 'USD'),
          reference: 'REC-1',
        });
        const p2 = Payment.createPending({
          id: 'pay_2',
          tenantId: tenantA,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(40.0, 'USD'),
          reference: 'QR-2',
        });
        paymentRepo.items.set(p1.id.value, p1);
        paymentRepo.items.set(p2.id.value, p2);

        const list = await controller.getPaymentsBySaleId(sale.id.value, receptionistUserTenantA);
        expect(list).toHaveLength(2);
        expect(list.map((p) => p.id)).toEqual(['pay_1', 'pay_2']);
        expect(list[0]!.amount.formatted).toBe('30.00');
        expect(list[1]!.amount.formatted).toBe('40.00');
      });

      it('GET /payments/:id: retrieves payment by ID with formatted monetary amounts', async () => {
        const sale = createPayableSale('sale_api_03', tenantA, 80.0, 'USD');
        const payment = Payment.createSettled({
          id: 'pay_lookup_01',
          tenantId: tenantA,
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(80.0, 'USD'),
        });
        paymentRepo.items.set(payment.id.value, payment);

        const result = await controller.getPaymentById('pay_lookup_01', receptionistUserTenantA);
        expect(result.id).toBe('pay_lookup_01');
        expect(result.amount.cents).toBe(8000);
        expect(result.amount.formatted).toBe('80.00');
        expect(result.status).toBe(PaymentStatus.COMPLETED);
      });

      it('POST /payments/:id/cancel: allows manager with payments.manage to cancel a pending payment', async () => {
        const sale = createPayableSale('sale_api_04', tenantA, 60.0, 'USD');
        const payment = Payment.createPending({
          id: 'pay_pending_cancel',
          tenantId: tenantA,
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(60.0, 'USD'),
        });
        paymentRepo.items.set(payment.id.value, payment);

        const cancelDto: CancelPaymentRequestDto = {
          reason: 'Customer cancelled transaction',
        };

        const result = await controller.cancelPayment(
          'pay_pending_cancel',
          cancelDto,
          managerUserTenantA,
        );
        expect(result.id).toBe('pay_pending_cancel');
        expect(result.status).toBe(PaymentStatus.CANCELLED);
      });
    });

    describe('Invalid API Requests & Error Mapping', () => {
      it('maps non-existent Sale to 404 Not Found via SalesExceptionFilter', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new SaleNotFoundException('non_existent_sale_id');

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: expect.stringContaining('non_existent_sale_id'),
          }),
        );
      });

      it('maps non-existent Payment to 404 Not Found via SalesExceptionFilter', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new PaymentNotFoundException('pay_unknown_999');

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: expect.stringContaining('pay_unknown_999'),
          }),
        );
      });

      it('maps invalid payment method to 400 Bad Request', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new InvalidPaymentMethodException('BITCOIN');

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
          }),
        );
      });

      it('maps malformed reference / PAN rejection to 400 Bad Request', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new InvalidPaymentReferenceException(
          'Reference cannot contain credit card Primary Account Numbers (PAN).',
        );

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: expect.stringContaining('Primary Account Numbers'),
          }),
        );
      });

      it('maps invalid payment state transition to 409 Conflict', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new InvalidPaymentTransitionException(
          PaymentStatus.COMPLETED,
          PaymentStatus.CANCELLED,
          'Cannot cancel an already settled payment.',
        );

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'Unprocessable Entity',
          }),
        );
      });

      it('maps unauthorized payment access to 403 Forbidden', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new PaymentUnauthorizedException('Insufficient permissions.');

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.FORBIDDEN,
            error: 'Forbidden',
          }),
        );
      });

      it('maps unpayable sale state to 422 Unprocessable Entity', async () => {
        const res = mockResponse();
        const host = mockHost(res);
        const exception = new SaleNotPayableException('sale_123', SaleStatus.DRAFT);

        exceptionFilter.catch(exception, host);

        expect(res.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'Unprocessable Entity',
          }),
        );
      });
    });
  });

  // ==========================================================================
  // SECTION 7: SECURITY & AUTHORIZATION TESTS
  // ==========================================================================
  describe('7. Security Tests (Multi-Tenant Isolation & Least-Privilege RBAC)', () => {
    it('User A cannot access User B Payment (Cross-tenant payment retrieval blocked)', async () => {
      // Create payment in Tenant A
      const saleA = createPayableSale('sale_sec_tenantA', tenantA, 50.0, 'USD');
      const paymentA = Payment.createSettled({
        id: 'pay_tenantA_01',
        tenantId: tenantA,
        saleId: saleA.id,
        method: PaymentMethod.CASH,
        amount: Money.create(50.0, 'USD'),
      });
      paymentRepo.items.set(paymentA.id.value, paymentA);

      // User from Tenant B attempts to retrieve Tenant A's payment
      await expect(
        controller.getPaymentById('pay_tenantA_01', receptionistUserTenantB),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('User cannot create Payment against unauthorized Sale (Cross-tenant payment creation blocked)', async () => {
      // Sale belongs to Tenant A
      const saleA = createPayableSale('sale_sec_tenantA_2', tenantA, 100.0, 'USD');

      // User from Tenant B attempts to record payment on Tenant A's sale
      const requestDto: RecordPaymentRequestDto = {
        amount: 50.0,
        currency: 'USD',
        method: PaymentMethod.CASH,
      };

      await expect(
        controller.recordPayment(saleA.id.value, requestDto, receptionistUserTenantB),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('User cannot list payments for another tenant Sale', async () => {
      // Sale belongs to Tenant A
      const saleA = createPayableSale('sale_sec_tenantA_3', tenantA, 100.0, 'USD');

      // User from Tenant B attempts to list payments for Tenant A's sale
      await expect(
        controller.getPaymentsBySaleId(saleA.id.value, receptionistUserTenantB),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('User cannot mutate Payment they cannot manage (Receptionist cannot cancel payment)', async () => {
      const saleA = createPayableSale('sale_sec_tenantA_4', tenantA, 80.0, 'USD');
      const paymentA = Payment.createPending({
        id: 'pay_pending_no_manage',
        tenantId: tenantA,
        saleId: saleA.id,
        method: PaymentMethod.QR,
        amount: Money.create(80.0, 'USD'),
      });
      paymentRepo.items.set(paymentA.id.value, paymentA);

      // Receptionist possesses payments.create and payments.read, but lacks payments.manage
      await expect(
        controller.cancelPayment(
          'pay_pending_no_manage',
          { reason: 'Receptionist attempt' },
          receptionistUserTenantA,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });
});
