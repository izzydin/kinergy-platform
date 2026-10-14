import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
  CreatePaymentHandler,
  RecordPaymentHandler,
  SaleNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  PaymentCurrencyMismatchException,
  InvalidPaymentMethodException,
  InvalidPaymentAmountException,
  DuplicatePaymentReferenceException,
  IUnitOfWork,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';
import { RecordPaymentRequestDto, PaymentResponseDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveThrows: Error | null = null;

  async findById(id: PaymentId | string): Promise<Payment | null> {
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

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values())
      .filter((p) => p.saleId.value === key)
      .map((p) =>
        Payment.reconstitute({
          id: p.id,
          tenantId: p.tenantId,
          saleId: p.saleId,
          method: p.method,
          amount: p.amount,
          status: p.status,
          reference: p.reference,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          version: p.version,
        }),
      );
  }

  async save(payment: Payment): Promise<void> {
    if (this.saveThrows) {
      throw this.saveThrows;
    }
    this.store.set(payment.id.value, payment);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveThrows: Error | null = null;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      status: sale.status,
      currency: sale.currency,
      source: sale.source,
      items: [...sale.items],
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      cancellationReason: sale.cancellationReason,
      cancelledAt: sale.cancelledAt,
      version: sale.version,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    });
  }

  async save(sale: Sale): Promise<void> {
    if (this.saveThrows) {
      throw this.saveThrows;
    }
    this.store.set(sale.id.value, sale);
  }
}

describe('POST /sales/:saleId/payments Endpoint Specification (Milestone 7.15)', () => {
  const tenantId = 'tenant_kinergy_main';

  const cashierUser: AuthenticatedUserPayload = {
    id: 'usr_cashier_01',
    email: 'cashier@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read'],
    tenantId,
  };

  let controller: PaymentsController;
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;

  const createPayableSale = (
    total: number = 100.0,
    currency: string = 'USD',
    status: 'PENDING_PAYMENT' | 'DRAFT' | 'CANCELLED' = 'PENDING_PAYMENT',
  ): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_01',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_01',
      }),
      description: 'Monthly Pass',
      quantity: 1,
      unitPrice: Money.create(total, currency),
    });

    if (status === 'PENDING_PAYMENT') {
      sale.finalize();
    } else if (status === 'CANCELLED') {
      sale.finalize();
      sale.cancel('Order abandoned');
    }
    // DRAFT remains unfinalized

    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(async () => {
    paymentRepo = new MockPaymentRepository();
    saleRepo = new MockSaleRepository();

    const mockUnitOfWork: IUnitOfWork = {
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
            new RecordPaymentHandler(paymentRepo, saleRepo, undefined, undefined, mockUnitOfWork),
        },
        {
          provide: CreatePaymentHandler,
          useExisting: RecordPaymentHandler,
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

  // 1. Valid Creation
  describe('1. Valid Payment Creation', () => {
    it('creates a full CASH payment in COMPLETED status and transitions Sale to PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 100.0,
        currency: 'USD',
        reference: 'DRAWER-01-TX-001',
      };

      const response: PaymentResponseDto = await controller.recordPayment(
        sale.id.value,
        dto,
        cashierUser,
      );

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
      expect(response.saleId).toBe(sale.id.value);
      expect(response.method).toBe(PaymentMethod.CASH);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.reference).toBe('DRAWER-01-TX-001');
      expect(response.paidAt).toBeDefined();
      expect(response.version).toBe(1);
      expect(response.amount).toEqual({
        amount: 100.0,
        cents: 10000,
        currency: 'USD',
        formatted: '100.00',
      });

      // Verify Sale aggregate was updated to PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('creates a partial payment and transitions Sale to PARTIALLY_PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 40.0,
        currency: 'USD',
      };

      const response = await controller.recordPayment(sale.id.value, dto, cashierUser);

      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.amount.formatted).toBe('40.00');

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('supports multiple sequential split-tenders to clear remaining balance', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Tender 1: 40.00 CASH
      const tender1 = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 40.0 },
        cashierUser,
      );
      expect(tender1.status).toBe(PaymentStatus.COMPLETED);

      let saleCheck = await saleRepo.findById(sale.id);
      expect(saleCheck?.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Tender 2: 60.00 QR
      const tender2 = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 60.0 },
        cashierUser,
      );
      expect(tender2.status).toBe(PaymentStatus.COMPLETED);

      saleCheck = await saleRepo.findById(sale.id);
      expect(saleCheck?.status).toBe(SaleStatus.PAID);
    });

    it('creates an asynchronous QR tender in PENDING status without advancing Sale status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.QR,
        amount: 100.0,
        currency: 'USD',
        status: PaymentStatus.PENDING,
        reference: 'QR-INVOICE-KEY-001',
      };

      const response = await controller.recordPayment(sale.id.value, dto, cashierUser);

      expect(response.status).toBe(PaymentStatus.PENDING);
      expect(response.paidAt).toBeNull();
      expect(response.version).toBe(1);

      // Sale remains in PENDING_PAYMENT since tender is not settled
      const saleCheck = await saleRepo.findById(sale.id);
      expect(saleCheck?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 2. Missing Sale
  describe('2. Missing or Nonexistent Sale Association', () => {
    it('throws SaleNotFoundException when targeted Sale does not exist', async () => {
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
      };

      await expect(
        controller.recordPayment('non_existent_sale_uuid', dto, cashierUser),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('rejects empty or whitespace saleId in route parameter', async () => {
      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
      };

      await expect(controller.recordPayment('   ', dto, cashierUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // 3. Invalid Amount, Currency, or Method
  describe('3. Validation of Amount, Currency, and Method', () => {
    it('rejects zero or negative payment amounts', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 0 },
          cashierUser,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: -10.0 },
          cashierUser,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it('rejects currency mismatch between payment and targeted Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0, currency: 'EUR' },
          cashierUser,
        ),
      ).rejects.toThrow(PaymentCurrencyMismatchException);
    });

    it('rejects unsupported payment methods', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: 'BITCOIN' as PaymentMethod, amount: 50.0 },
          cashierUser,
        ),
      ).rejects.toThrow(InvalidPaymentMethodException);
    });
  });

  // 4. Unsupported Request Fields & Anti-Tampering
  describe('4. Unsupported Request Fields & Anti-Tampering', () => {
    it('ignores client-provided paidAt, id, version, and createdAt and applies domain-authoritative fields', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Malicious payload attempting to backdate and forge ID/version
      const tamperedDto: RecordPaymentRequestDto & Record<string, unknown> = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        paidAt: '2020-01-01T00:00:00.000Z',
        id: 'forged_payment_uuid',
        version: 99,
        createdAt: '2020-01-01T00:00:00.000Z',
        saleTotal: 10.0,
        saleStatus: 'PAID',
        receipt: { id: 'rec_fake' },
      };

      const response = await controller.recordPayment(sale.id.value, tamperedDto, cashierUser);

      // Server generated authentic ID and version 1
      expect(response.id).not.toBe('forged_payment_uuid');
      expect(response.version).toBe(1);
      expect(new Date(response.createdAt).getFullYear()).toBeGreaterThanOrEqual(2026);
      expect(new Date(response.paidAt!).getFullYear()).toBeGreaterThanOrEqual(2026);
    });

    it('sanitizes client spoofed status (e.g. FAILED, CANCELLED) to prevent creating arbitrary initial states', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const spoofedDto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        status: 'FAILED' as PaymentStatus,
      };

      const response = await controller.recordPayment(sale.id.value, spoofedDto, cashierUser);

      // Sanitized: Cannot be instantiated as FAILED; defaults safely to COMPLETED
      expect(response.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // 5. Unauthorized Requests
  describe('5. Authorization & Multi-Tenant Boundary Enforcement', () => {
    it('rejects caller lacking payments.create permission with PaymentUnauthorizedException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const guestUser: AuthenticatedUserPayload = {
        id: 'usr_guest',
        email: 'guest@kinergy.platform',
        status: 'ACTIVE',
        roles: ['Guest'],
        permissions: ['sales.read'], // Missing payments.create
        tenantId,
      };

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          guestUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('rejects cross-tenant payment creation attempt', async () => {
      const sale = createPayableSale(100.0, 'USD'); // belongs to tenant_kinergy_main

      const competitorUser: AuthenticatedUserPayload = {
        id: 'usr_competitor',
        email: 'competitor@other.com',
        status: 'ACTIVE',
        roles: ['Manager'],
        permissions: ['payments.create', 'payments.read'],
        tenantId: 'tenant_rival_facility', // Different tenant
      };

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          competitorUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });

  // 6. Invalid Payment Policy Scenarios
  describe('6. Payment Policy Invariants (Overpayment & Duplicate Reference)', () => {
    it('rejects overpayment exceeding remaining sale balance with PaymentOverpaymentException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 150.0 },
          cashierUser,
        ),
      ).rejects.toThrow(PaymentOverpaymentException);
    });

    it('rejects duplicate external reference on the same Sale with DuplicatePaymentReferenceException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 50.0,
          reference: 'UNIQUE-REF-001',
        },
        cashierUser,
      );

      // Attempt second payment with identical reference
      await expect(
        controller.recordPayment(
          sale.id.value,
          {
            method: PaymentMethod.CASH,
            amount: 50.0,
            reference: 'UNIQUE-REF-001',
          },
          cashierUser,
        ),
      ).rejects.toThrow(DuplicatePaymentReferenceException);
    });
  });

  // 7. Existing Sale Lifecycle Restrictions
  describe('7. Existing Sale Lifecycle Restrictions', () => {
    it('rejects payment on unfinalized DRAFT sale with SaleNotPayableException', async () => {
      const draftSale = createPayableSale(100.0, 'USD', 'DRAFT');

      await expect(
        controller.recordPayment(
          draftSale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          cashierUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });

    it('rejects payment on CANCELLED sale with SaleNotPayableException', async () => {
      const cancelledSale = createPayableSale(100.0, 'USD', 'CANCELLED');

      await expect(
        controller.recordPayment(
          cancelledSale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          cashierUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });

    it('rejects payment on already fully PAID sale with SaleNotPayableException', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // First pay full amount
      await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0 },
        cashierUser,
      );

      // Attempt additional payment on now PAID sale
      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 10.0 },
          cashierUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });
  });

  // 8. Persistence Failure Handling
  describe('8. Persistence Failure Handling', () => {
    it('propagates error when repository save fails and prevents state corruption', async () => {
      const sale = createPayableSale(100.0, 'USD');
      paymentRepo.saveThrows = new Error('Database connection terminated unexpectedly');

      await expect(
        controller.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          cashierUser,
        ),
      ).rejects.toThrow('Database connection terminated unexpectedly');

      // Verify Sale status was not updated to PAID because persistence aborted
      const untouchedSale = await saleRepo.findById(sale.id);
      expect(untouchedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 9. Correct Initial State & Response Serialization
  describe('9. Initial State & Serialization Contract', () => {
    it('returns exact structured MoneyResponseDto and conforms to PaymentResponseDto', async () => {
      const sale = createPayableSale(55.25, 'USD');

      const response = await controller.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 55.25,
          reference: 'DRAWER-TAG-5525',
        },
        cashierUser,
      );

      expect(response).toMatchObject({
        id: expect.any(String),
        saleId: sale.id.value,
        method: PaymentMethod.CASH,
        amount: {
          amount: 55.25,
          currency: 'USD',
          formatted: '55.25',
          cents: 5525,
        },
        amountValue: 55.25,
        currency: 'USD',
        cents: 5525,
        formattedAmount: '55.25',
        status: PaymentStatus.COMPLETED,
        reference: 'DRAWER-TAG-5525',
        version: 1,
      });
      expect(typeof response.createdAt).toBe('string');
      expect(typeof response.paidAt).toBe('string');
    });
  });
});
