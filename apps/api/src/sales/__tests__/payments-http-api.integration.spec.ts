import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import {
  Payment,
  Sale,
  Money,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  SourceReference,
  SourceType,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  RecordPaymentHandler,
  CreatePaymentHandler,
  CompletePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  ListPaymentsHandler,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';
import {
  RecordPaymentRequestDto,
  PaymentResponseDto,
  CompletePaymentRequestDto,
  FailPaymentRequestDto,
  CancelPaymentRequestDto,
} from '../dto';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

  async findById(id: string | { value: string }): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const payment = this.store.get(key);
    if (!payment) return null;
    return Payment.reconstitute({
      id: payment.id,
      tenantId: payment.tenantId,
      saleId: payment.saleId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      version: payment.version,
    });
  }

  async findBySaleId(saleId: string | { value: string }): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: string | { value: string }): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      source: sale.source,
      status: sale.status,
      orderDiscount: sale.orderDiscount,
      items: [...sale.items],
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      version: sale.version,
    });
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

describe('Payment HTTP API Contract, Dependency Injection & Permissions Suite (Milestone 7.15)', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-10-14T12:00:00.000Z');
  const clock = { now: () => baseTime };
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;
  let controller: PaymentsController;
  let reflector: Reflector;

  const mockCashierUser: AuthenticatedUserPayload = {
    id: 'usr_cashier_01',
    email: 'cashier@kinergy.wellness',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read'],
    tenantId,
  };

  const mockManagerUser: AuthenticatedUserPayload = {
    id: 'usr_manager_01',
    email: 'manager@kinergy.wellness',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage'],
    tenantId,
  };

  const createTestSale = (amount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create(
      {
        tenantId,
        currency,
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold_01',
        }),
      },
      clock,
    );
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_01',
      }),
      description: 'Gold Membership',
      quantity: 1,
      unitPrice: Money.create(amount, currency),
    });
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(async () => {
    paymentRepo = new MockPaymentRepository();
    saleRepo = new MockSaleRepository();
    reflector = new Reflector();

    const mockUnitOfWork = {
      executeInTransaction: jest.fn(async (fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: mockUnitOfWork },
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(paymentRepo, saleRepo, clock, undefined, mockUnitOfWork),
        },
        {
          provide: CreatePaymentHandler,
          useExisting: RecordPaymentHandler,
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetSalePaymentHistoryHandler,
          useFactory: () => new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(paymentRepo, saleRepo, clock, undefined, mockUnitOfWork),
        },
        {
          provide: FailPaymentHandler,
          useFactory: () => new FailPaymentHandler(paymentRepo, saleRepo, clock),
        },
        {
          provide: CancelPaymentHandler,
          useFactory: () => new CancelPaymentHandler(paymentRepo, saleRepo, clock),
        },
        {
          provide: ListPaymentsHandler,
          useFactory: () => new ListPaymentsHandler(paymentRepo),
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

  // 1. Route Registration & Metadata Verification
  describe('1. Route Registration & Approved Path Contracts', () => {
    it('verifies PaymentsController is mounted under /api/v1', () => {
      const path = Reflect.getMetadata('path', PaymentsController);
      expect(path).toBe('api/v1');
    });

    it('verifies POST /sales/:saleId/payments is registered on recordPayment', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.recordPayment);
      const isRegistered = Array.isArray(path)
        ? path.includes('sales/:saleId/payments')
        : path === 'sales/:saleId/payments';
      expect(isRegistered).toBe(true);
    });

    it('verifies GET /sales/:saleId/payments is registered on getPaymentsBySaleId', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.getPaymentsBySaleId);
      const isRegistered = Array.isArray(path)
        ? path.includes('sales/:saleId/payments')
        : path === 'sales/:saleId/payments';
      expect(isRegistered).toBe(true);
    });

    it('verifies GET /payments/:id is registered on getPaymentById', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.getPaymentById);
      const isRegistered = Array.isArray(path)
        ? path.includes('payments/:id')
        : path === 'payments/:id';
      expect(isRegistered).toBe(true);
    });

    it('verifies POST /payments/:id/complete is registered on completePayment', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.completePayment);
      const isRegistered = Array.isArray(path)
        ? path.includes('payments/:id/complete')
        : path === 'payments/:id/complete';
      expect(isRegistered).toBe(true);
    });

    it('verifies POST /payments/:id/fail is registered on failPayment', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.failPayment);
      const isRegistered = Array.isArray(path)
        ? path.includes('payments/:id/fail')
        : path === 'payments/:id/fail';
      expect(isRegistered).toBe(true);
    });

    it('verifies POST /payments/:id/cancel is registered on cancelPayment', () => {
      const path = Reflect.getMetadata('path', PaymentsController.prototype.cancelPayment);
      const isRegistered = Array.isArray(path)
        ? path.includes('payments/:id/cancel')
        : path === 'payments/:id/cancel';
      expect(isRegistered).toBe(true);
    });
  });

  // 2. Permission Metadata Verification (Phase 7.13)
  describe('2. Phase 7.13 Permission Metadata Verification', () => {
    it('verifies recordPayment enforces payments.create permission', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.recordPayment,
      );
      expect(permissions).toContain('payments.create');
    });

    it('verifies getPaymentsBySaleId enforces payments.read permission', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.getPaymentsBySaleId,
      );
      expect(permissions).toContain('payments.read');
    });

    it('verifies getPaymentById enforces payments.read permission', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.getPaymentById,
      );
      expect(permissions).toContain('payments.read');
    });

    it('verifies completePayment enforces payments.create or payments.manage permissions', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.completePayment,
      );
      expect(permissions).toContain('payments.create');
      expect(permissions).toContain('payments.manage');
    });

    it('verifies failPayment enforces payments.create or payments.manage permissions', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.failPayment,
      );
      expect(permissions).toContain('payments.create');
      expect(permissions).toContain('payments.manage');
    });

    it('verifies cancelPayment enforces payments.manage permission exclusively', () => {
      const permissions = reflector.get<string[]>(
        'permissions',
        PaymentsController.prototype.cancelPayment,
      );
      expect(permissions).toEqual(['payments.manage']);
    });
  });

  // 3. Application Use Case Invocation & Parameter Mapping
  describe('3. Application Use Case Invocation & Parameter Mapping', () => {
    it('POST /sales/:saleId/payments invokes CreatePaymentHandler and returns structured PaymentResponseDto', async () => {
      const sale = createTestSale(100.0, 'USD');

      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        currency: 'USD',
        reference: 'DRAWER-01-TX-01',
      };

      const response: PaymentResponseDto = await controller.recordPayment(
        sale.id.value,
        dto,
        mockCashierUser,
      );

      expect(response).toBeDefined();
      expect(response.saleId).toBe(sale.id.value);
      expect(response.method).toBe(PaymentMethod.CASH);
      expect(response.amount.amount).toBe(50.0);
      expect(response.amount.currency).toBe('USD');
      expect(response.amount.cents).toBe(5000);
      expect(response.amount.formatted).toBe('50.00');
      expect(response.amountValue).toBe(50.0);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.paidAt).toBe(baseTime.toISOString());
      expect(response.version).toBe(1);

      // Verify Sale status coordinated via domain method to PARTIALLY_PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('GET /sales/:saleId/payments invokes GetSalePaymentHistoryHandler and returns chronological collection', async () => {
      const sale = createTestSale(100.0, 'USD');

      // Create two payments for this sale
      await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 40.0, currency: 'USD' },
        mockCashierUser,
      );
      await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 60.0, currency: 'USD' },
        mockCashierUser,
      );

      const history = await controller.getPaymentsBySaleId(sale.id.value, mockCashierUser);
      expect(history).toHaveLength(2);
      expect(history[0]!.amount.cents).toBe(4000);
      expect(history[1]!.amount.cents).toBe(6000);

      // Sale should now be in PAID status
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('GET /payments/:id invokes GetPaymentHandler and returns individual payment', async () => {
      const sale = createTestSale(100.0, 'USD');
      const created = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0, currency: 'USD' },
        mockCashierUser,
      );

      const retrieved = await controller.getPaymentById(created.id, mockCashierUser);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.saleId).toBe(sale.id.value);
      expect(retrieved.status).toBe(PaymentStatus.COMPLETED);
    });

    it('POST /payments/:id/complete invokes CompletePaymentHandler on PENDING payment', async () => {
      const sale = createTestSale(100.0, 'USD');

      // Create a PENDING payment
      const payment = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      const completeDto: CompletePaymentRequestDto = {
        reference: 'QR-CONFIRMED-TRACE-999',
      };

      const completed = await controller.completePayment(
        payment.id.value,
        completeDto,
        mockManagerUser,
      );

      expect(completed.id).toBe(payment.id.value);
      expect(completed.status).toBe(PaymentStatus.COMPLETED);
      expect(completed.reference).toBe('QR-CONFIRMED-TRACE-999');
      expect(completed.paidAt).toBe(baseTime.toISOString());

      // Coordinated Sale status is advanced to PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('POST /payments/:id/fail invokes FailPaymentHandler on PENDING payment without mutating Sale', async () => {
      const sale = createTestSale(100.0, 'USD');

      // Create a PENDING payment
      const payment = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      const failDto: FailPaymentRequestDto = {
        reason: 'Bank decline: dynamic QR timed out',
      };

      const failed = await controller.failPayment(payment.id.value, failDto, mockCashierUser);

      expect(failed.id).toBe(payment.id.value);
      expect(failed.status).toBe(PaymentStatus.FAILED);
      expect(failed.paidAt).toBeNull();

      // Parent Sale is untouched and remains PENDING_PAYMENT
      const unmutatedSale = await saleRepo.findById(sale.id);
      expect(unmutatedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('POST /payments/:id/cancel invokes CancelPaymentHandler on PENDING payment without mutating Sale', async () => {
      const sale = createTestSale(100.0, 'USD');

      // Create a PENDING payment
      const payment = Payment.createPending(
        {
          saleId: sale.id,
          tenantId,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      const cancelDto: CancelPaymentRequestDto = {
        reason: 'Customer switched tender to cash',
      };

      const cancelled = await controller.cancelPayment(
        payment.id.value,
        cancelDto,
        mockManagerUser,
      );

      expect(cancelled.id).toBe(payment.id.value);
      expect(cancelled.status).toBe(PaymentStatus.CANCELLED);
      expect(cancelled.paidAt).toBeNull();

      // Parent Sale is untouched and remains PENDING_PAYMENT
      const unmutatedSale = await saleRepo.findById(sale.id);
      expect(unmutatedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 4. Request Validation & Boundary Error Handling
  describe('4. Request Validation & Identifier Guarding', () => {
    it('rejects empty or whitespace saleId on recordPayment', async () => {
      await expect(
        controller.recordPayment(
          '   ',
          { method: PaymentMethod.CASH, amount: 10.0 },
          mockCashierUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty or whitespace saleId on getPaymentsBySaleId', async () => {
      await expect(controller.getPaymentsBySaleId('   ', mockCashierUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on getPaymentById', async () => {
      await expect(controller.getPaymentById('   ', mockCashierUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on completePayment', async () => {
      await expect(controller.completePayment('   ', {}, mockManagerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on failPayment', async () => {
      await expect(controller.failPayment('   ', {}, mockManagerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace id on cancelPayment', async () => {
      await expect(controller.cancelPayment('   ', {}, mockManagerUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
