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
  SalesEventPublisherPort,
  RecordPaymentHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  PaymentNotFoundException,
  PaymentUnauthorizedException,
  InvalidPaymentTransitionException,
  PaymentOptimisticLockException,
} from '@kinergy-platform/core';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import {
  CompletePaymentRequestDto,
  FailPaymentRequestDto,
  CancelPaymentRequestDto,
  SettlePaymentRequestDto,
} from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// ============================================================================
// Test Doubles
// ============================================================================

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

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: unknown[] = [];
  async publish(events: ReadonlyArray<unknown>): Promise<void> {
    this.publishedEvents.push(...events);
  }
  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// Master API QA Regression Suite for Lifecycle Endpoints
// ============================================================================

describe('Payment Lifecycle HTTP API QA Regression Spec (ADR-0116 / Phase 7.6)', () => {
  const tenantId = 'tenant_kinergy_api_qa';

  const receptionistUser: AuthenticatedUserPayload = {
    id: 'usr_receptionist_01',
    email: 'receptionist@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read'],
    tenantId,
  };

  const managerUser: AuthenticatedUserPayload = {
    id: 'usr_manager_01',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage', 'sales.read'],
    tenantId,
  };

  const unprivilegedUser: AuthenticatedUserPayload = {
    id: 'usr_member_01',
    email: 'member@kinergy.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['sales.read'],
    tenantId,
  };

  let controller: PaymentsController;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockEventPublisher;
  let exceptionFilter: SalesExceptionFilter;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_plan_qa',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_plan_qa',
      }),
      description: 'Monthly Wellness Membership',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize();
    saleRepo.items.set(sale.id.value, sale);
    return sale;
  };

  const createPendingPayment = async (
    sale: Sale,
    amount: number = 100.0,
    user: AuthenticatedUserPayload = receptionistUser,
  ): Promise<Payment> => {
    const handler = new RecordPaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher);
    const result = await handler.execute({
      input: {
        saleId: sale.id.value,
        amount,
        currency: 'USD',
        method: PaymentMethod.QR,
        status: PaymentStatus.PENDING,
        tenantId,
        currentUser: user,
      },
    });
    const dto = result.getValue();
    const payment = await paymentRepo.findById(dto.id);
    if (!payment) throw new Error('Payment creation failed');
    return payment;
  };

  // Helper simulating NestJS Exception Filter execution
  const executeFilter = (exception: unknown): { status: number; body: Record<string, unknown> } => {
    let capturedStatus = 200;
    let capturedBody: Record<string, unknown> = {};

    const mockResponse: Partial<Response> = {
      status(s: number) {
        capturedStatus = s;
        return this as Response;
      },
      json(b: Record<string, unknown>) {
        capturedBody = b;
        return this as Response;
      },
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
      }),
    } as unknown as ArgumentsHost;

    exceptionFilter.catch(exception, mockHost);
    return { status: capturedStatus, body: capturedBody };
  };

  beforeEach(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockEventPublisher();
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
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher),
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher),
        },
        {
          provide: SettlePaymentHandler,
          useFactory: () =>
            new SettlePaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher),
        },
        {
          provide: FailPaymentHandler,
          useFactory: () =>
            new FailPaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher),
        },
        {
          provide: CancelPaymentHandler,
          useFactory: () =>
            new CancelPaymentHandler(paymentRepo, saleRepo, undefined, eventPublisher),
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(paymentRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
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
  // 1. VALID LIFECYCLE TRANSITIONS
  // ==========================================================================
  describe('1. Valid Lifecycle Transitions', () => {
    it('POST /payments/:id/complete transitions PENDING -> COMPLETED and populates paidAt and response schema', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      const completeDto: CompletePaymentRequestDto = {
        reference: 'POS-QR-OK-999',
      };

      const response = await controller.completePayment(
        pending.id.value,
        completeDto,
        receptionistUser,
      );

      expect(response.id).toBe(pending.id.value);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.paidAt).not.toBeNull();
      expect(response.reference).toBe('POS-QR-OK-999');
      expect(response.amount.cents).toBe(10000);
      expect(response.version).toBe(2);

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('POST /payments/:id/settle acts as authoritative alias for completion', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      const settleDto: SettlePaymentRequestDto = {
        reference: 'SETTLE-TRACE-111',
      };

      const response = await controller.settlePayment(
        pending.id.value,
        settleDto,
        receptionistUser,
      );

      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.paidAt).not.toBeNull();
      expect(response.reference).toBe('SETTLE-TRACE-111');
    });

    it('POST /payments/:id/fail transitions PENDING -> FAILED and maintains null paidAt', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      const failDto: FailPaymentRequestDto = {
        reason: 'Payment processor timeout: Gateway unreachable',
      };

      const response = await controller.failPayment(pending.id.value, failDto, receptionistUser);

      expect(response.status).toBe(PaymentStatus.FAILED);
      expect(response.paidAt).toBeNull();
      expect(response.version).toBe(2);

      const saleAfterFail = await saleRepo.findById(sale.id);
      expect(saleAfterFail?.status).toBe(SaleStatus.PENDING_PAYMENT); // Sale remains unpaid
    });

    it('POST /payments/:id/cancel transitions PENDING -> CANCELLED by authorized Manager', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      const cancelDto: CancelPaymentRequestDto = {
        reason: 'Customer tender cancellation approved by supervisor',
      };

      const response = await controller.cancelPayment(pending.id.value, cancelDto, managerUser);

      expect(response.status).toBe(PaymentStatus.CANCELLED);
      expect(response.paidAt).toBeNull();
      expect(response.version).toBe(2);
    });
  });

  // ==========================================================================
  // 2. INVALID TRANSITIONS & RFC ERROR MAPPING
  // ==========================================================================
  describe('2. Invalid Transitions & Error Mapping (422 Unprocessable Entity)', () => {
    it('rejects completePayment on COMPLETED payment and maps to HTTP 422 with INVALID_PAYMENT_TRANSITION', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.completePayment(pending.id.value, {}, receptionistUser);

      try {
        await controller.completePayment(pending.id.value, {}, receptionistUser);
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(body.error).toBe('Unprocessable Entity');
        expect(body.code).toBe('INVALID_PAYMENT_TRANSITION');
        expect(body.message).toMatch(/Completed payments are permanently immutable/i);
      }
    });

    it('rejects failPayment on COMPLETED payment and maps to HTTP 422', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.completePayment(pending.id.value, {}, receptionistUser);

      try {
        await controller.failPayment(
          pending.id.value,
          { reason: 'Late failure' },
          receptionistUser,
        );
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(body.code).toBe('INVALID_PAYMENT_TRANSITION');
      }
    });

    it('rejects cancelPayment on COMPLETED payment and maps to HTTP 422', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.completePayment(pending.id.value, {}, receptionistUser);

      try {
        await controller.cancelPayment(pending.id.value, { reason: 'Late cancel' }, managerUser);
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(body.code).toBe('INVALID_PAYMENT_TRANSITION');
      }
    });

    it('rejects completePayment on CANCELLED payment and maps to HTTP 422', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.cancelPayment(pending.id.value, { reason: 'Customer aborted' }, managerUser);

      try {
        await controller.completePayment(pending.id.value, {}, receptionistUser);
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(body.code).toBe('INVALID_PAYMENT_TRANSITION');
      }
    });
  });

  // ==========================================================================
  // 3. REPEATED TRANSITIONS (IDEMPOTENCY / REJECTION)
  // ==========================================================================
  describe('3. Repeated Transitions Policy', () => {
    it('repeatedly executing cancel on CANCELLED payment rejects with 422', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.cancelPayment(pending.id.value, { reason: 'First void' }, managerUser);

      try {
        await controller.cancelPayment(pending.id.value, { reason: 'Second void' }, managerUser);
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status } = executeFilter(err);
        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      }
    });

    it('repeatedly executing fail on FAILED payment rejects with 422', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);
      await controller.failPayment(pending.id.value, { reason: 'First fail' }, receptionistUser);

      try {
        await controller.failPayment(pending.id.value, { reason: 'Second fail' }, receptionistUser);
        fail('Should have thrown InvalidPaymentTransitionException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPaymentTransitionException);
        const { status } = executeFilter(err);
        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      }
    });
  });

  // ==========================================================================
  // 4. ENTITY NOT FOUND (404 NOT FOUND)
  // ==========================================================================
  describe('4. Missing Payment Error Mapping (404 Not Found)', () => {
    it('maps completePayment on non-existent payment ID to HTTP 404', async () => {
      try {
        await controller.completePayment('pmt_nonexistent_404', {}, receptionistUser);
        fail('Should have thrown PaymentNotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentNotFoundException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.NOT_FOUND);
        expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
        expect(body.error).toBe('Not Found');
      }
    });

    it('maps failPayment on non-existent payment ID to HTTP 404', async () => {
      try {
        await controller.failPayment('pmt_nonexistent_404', {}, receptionistUser);
        fail('Should have thrown PaymentNotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentNotFoundException);
        const { status } = executeFilter(err);
        expect(status).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('maps cancelPayment on non-existent payment ID to HTTP 404', async () => {
      try {
        await controller.cancelPayment('pmt_nonexistent_404', {}, managerUser);
        fail('Should have thrown PaymentNotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentNotFoundException);
        const { status } = executeFilter(err);
        expect(status).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  // ==========================================================================
  // 5. AUTHORIZATION & LEAST PRIVILEGE (403 FORBIDDEN)
  // ==========================================================================
  describe('5. Authorization & Least Privilege Error Mapping (403 Forbidden)', () => {
    it('rejects unprivileged user lacking payments.create/manage on completePayment with 403', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      try {
        await controller.completePayment(pending.id.value, {}, unprivilegedUser);
        fail('Should have thrown PaymentUnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentUnauthorizedException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.FORBIDDEN);
        expect(body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(body.error).toBe('Forbidden');
      }
    });

    it('rejects Receptionist lacking payments.manage on cancelPayment with 403', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      try {
        await controller.cancelPayment(
          pending.id.value,
          { reason: 'Cashier attempt' },
          receptionistUser,
        );
        fail('Should have thrown PaymentUnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentUnauthorizedException);
        const { status, body } = executeFilter(err);

        expect(status).toBe(HttpStatus.FORBIDDEN);
        expect(body.statusCode).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  // ==========================================================================
  // 6. CONCURRENCY CONFLICT (409 CONFLICT)
  // ==========================================================================
  describe('6. Concurrency Conflict Error Mapping (409 Conflict)', () => {
    it('maps PaymentOptimisticLockException to HTTP 409 Conflict', () => {
      const lockException = new PaymentOptimisticLockException('pmt_race_01', 1);

      const { status, body } = executeFilter(lockException);

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(body.error).toBe('Conflict');
      expect(body.message).toContain('expected version: 1');
    });
  });

  // ==========================================================================
  // 7. CLIENT STATUS BYPASS DEFENSE
  // ==========================================================================
  describe('7. Client Status Bypass Defense', () => {
    it('ignores client attempts to inject status or paidAt in request body', async () => {
      const sale = createPayableSale(100.0);
      const pending = await createPendingPayment(sale);

      // Malicious or misbehaving client attempting to force status
      const spoofedBody: CompletePaymentRequestDto & { status?: string; paidAt?: string } = {
        reference: 'TRACE-SPOOF',
        status: 'PENDING', // Attempting to keep it PENDING or force CANCELLED
        paidAt: '2020-01-01T00:00:00.000Z',
      };

      const result = await controller.completePayment(
        pending.id.value,
        spoofedBody,
        receptionistUser,
      );

      // Domain authority prevails
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.paidAt).not.toEqual(new Date('2020-01-01T00:00:00.000Z'));
      expect(result.reference).toBe('TRACE-SPOOF');
    });
  });
});
