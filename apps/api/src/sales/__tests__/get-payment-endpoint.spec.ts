import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  Payment,
  PaymentId,
  PaymentReference,
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
  GetPaymentHandler,
  PaymentNotFoundException,
  PaymentUnauthorizedException,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public findByIdCallCount = 0;
  public saveCallCount = 0;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    this.findByIdCallCount++;
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
    this.saveCallCount++;
    this.store.set(payment.id.value, payment);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public findByIdCallCount = 0;
  public saveCallCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    this.findByIdCallCount++;
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.store.set(sale.id.value, sale);
  }
}

describe('GET /payments/:id - API Contract & Security Specification', () => {
  let controller: PaymentsController;
  let paymentRepo: MockPaymentRepository;
  let saleRepo: MockSaleRepository;

  const tenantA = 'tenant_kinergy_alpha';
  const tenantB = 'tenant_kinergy_beta';

  const ownerUser: AuthenticatedUserPayload = {
    id: 'user-owner-001',
    email: 'owner@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Owner'],
    permissions: ['payments.read', 'payments.create', 'sales.read'],
  };

  const managerUser: AuthenticatedUserPayload = {
    id: 'user-manager-002',
    email: 'manager@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Manager'],
    permissions: ['payments.read', 'payments.create', 'sales.read'],
  };

  const receptionistUser: AuthenticatedUserPayload = {
    id: 'user-reception-003',
    email: 'reception@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Receptionist'],
    permissions: ['payments.read', 'payments.create', 'sales.read'],
  };

  const kitchenStaffUser: AuthenticatedUserPayload = {
    id: 'user-kitchen-004',
    email: 'kitchen@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Kitchen Staff'],
    permissions: ['payments.read', 'sales.read'],
  };

  const unprivilegedUser: AuthenticatedUserPayload = {
    id: 'user-unprivileged-005',
    email: 'unprivileged@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Trainer'],
    permissions: ['trainer.schedule'],
  };

  const clientUserA: AuthenticatedUserPayload = {
    id: 'client-user-aaa',
    email: 'client.a@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Client'],
    permissions: ['payments.read', 'sales.read'],
  };

  const clientUserB: AuthenticatedUserPayload = {
    id: 'client-user-bbb',
    email: 'client.b@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantA,
    roles: ['Client'],
    permissions: ['payments.read', 'sales.read'],
  };

  const crossTenantManagerUser: AuthenticatedUserPayload = {
    id: 'user-cross-tenant-009',
    email: 'manager.beta@kinergy.test',
    status: 'ACTIVE',
    tenantId: tenantB,
    roles: ['Manager'],
    permissions: ['payments.read', 'payments.create', 'sales.read'],
  };

  function createSale(opts: {
    id?: string;
    tenantId?: string;
    clientId?: string;
    status?: SaleStatus;
    total?: number;
    currency?: string;
  }): Sale {
    const sale = Sale.create({
      id: opts.id ? SaleId.create(opts.id) : undefined,
      tenantId: opts.tenantId ?? tenantA,
      currency: opts.currency ?? 'USD',
      clientId: opts.clientId,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'REG-01',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'REG-01',
      }),
      description: 'Test Item',
      quantity: 1,
      unitPrice: Money.create(opts.total ?? 100.0, opts.currency ?? 'USD'),
    });
    sale.finalize();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  }

  function createPayment(opts: {
    id?: string;
    saleId: string;
    tenantId?: string;
    amount?: number;
    currency?: string;
    method?: PaymentMethod;
    status?: PaymentStatus;
    reference?: string | null;
    createdAt?: Date;
    paidAt?: Date | null;
  }): Payment {
    const payment = Payment.reconstitute({
      id: PaymentId.create(opts.id ?? '11111111-1111-4111-a111-111111111111'),
      tenantId: opts.tenantId ?? tenantA,
      saleId: SaleId.create(opts.saleId),
      method: opts.method ?? PaymentMethod.CASH,
      amount: Money.create(opts.amount ?? 50.0, opts.currency ?? 'USD'),
      status: opts.status ?? PaymentStatus.COMPLETED,
      reference: opts.reference ? PaymentReference.create(opts.reference) : null,
      paidAt:
        opts.paidAt !== undefined
          ? opts.paidAt
          : (opts.status ?? PaymentStatus.COMPLETED) === PaymentStatus.COMPLETED
            ? new Date('2026-10-01T10:05:00.000Z')
            : null,
      createdAt: opts.createdAt ?? new Date('2026-10-01T10:05:00.000Z'),
      updatedAt: opts.createdAt ?? new Date('2026-10-01T10:05:00.000Z'),
      version: 1,
    });
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  }

  beforeEach(async () => {
    paymentRepo = new MockPaymentRepository();
    saleRepo = new MockSaleRepository();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        {
          provide: GetPaymentHandler,
          useFactory: () => new GetPaymentHandler(paymentRepo, saleRepo),
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

  // ===========================================================================
  // 1. Valid Payment Retrieval
  // ===========================================================================
  describe('1. Valid Payment Retrieval', () => {
    it('successfully retrieves an individual payment by ID for authorized receptionist', async () => {
      const sale = createSale({ id: 'sale-valid-get' });
      const payment = createPayment({
        id: 'pmt-get-100',
        saleId: sale.id.value,
        amount: 45.5,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        reference: 'DRAWER-01-TX-100',
      });

      const response = await controller.getPaymentById(payment.id.value, receptionistUser);

      expect(response).toBeDefined();
      expect(response.id).toBe('pmt-get-100');
      expect(response.saleId).toBe(sale.id.value);
      expect(response.method).toBe(PaymentMethod.CASH);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.reference).toBe('DRAWER-01-TX-100');
      expect(response.amountValue).toBe(45.5);
      expect(response.amount.cents).toBe(4550);
      expect(response.amount.formatted).toBe('45.50');
      expect(response.amount.currency).toBe('USD');
    });

    it('successfully resolves payment via route alias param paymentId', async () => {
      const sale = createSale({ id: 'sale-valid-alias' });
      const payment = createPayment({
        id: 'pmt-get-alias',
        saleId: sale.id.value,
        amount: 20.0,
      });

      // Calling with idParam undefined, paymentIdParam populated
      const response = await controller.getPaymentById(
        undefined,
        receptionistUser,
        payment.id.value,
      );

      expect(response.id).toBe('pmt-get-alias');
    });
  });

  // ===========================================================================
  // 2. Unknown Payment & Identifier Validation
  // ===========================================================================
  describe('2. Unknown Payment & Identifier Validation', () => {
    it('throws PaymentNotFoundException when payment ID does not exist', async () => {
      await expect(
        controller.getPaymentById('pmt-nonexistent-uuid', receptionistUser),
      ).rejects.toThrow(PaymentNotFoundException);
    });

    it('rejects empty or whitespace identifier with BadRequestException', async () => {
      await expect(controller.getPaymentById('', receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getPaymentById('   ', receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================================================
  // 3. Unauthorized Requests & Permissions
  // ===========================================================================
  describe('3. Unauthorized Requests & Permissions', () => {
    it('authorizes Owner, Manager, Receptionist, and Kitchen Staff with payments.read', async () => {
      const sale = createSale({ id: 'sale-auth-roles' });
      const payment = createPayment({ id: 'pmt-auth-role', saleId: sale.id.value });

      await expect(controller.getPaymentById(payment.id.value, ownerUser)).resolves.toBeDefined();
      await expect(controller.getPaymentById(payment.id.value, managerUser)).resolves.toBeDefined();
      await expect(
        controller.getPaymentById(payment.id.value, receptionistUser),
      ).resolves.toBeDefined();
      await expect(
        controller.getPaymentById(payment.id.value, kitchenStaffUser),
      ).resolves.toBeDefined();
    });

    it('rejects unprivileged caller lacking payments.read with PaymentUnauthorizedException', async () => {
      const sale = createSale({ id: 'sale-unprivileged-get' });
      const payment = createPayment({ id: 'pmt-unprivileged', saleId: sale.id.value });

      await expect(controller.getPaymentById(payment.id.value, unprivilegedUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('prevents cross-tenant access: user in Tenant B cannot retrieve Tenant A payment', async () => {
      const sale = createSale({ id: 'sale-tenant-a', tenantId: tenantA });
      const payment = createPayment({
        id: 'pmt-tenant-a',
        saleId: sale.id.value,
        tenantId: tenantA,
      });

      await expect(
        controller.getPaymentById(payment.id.value, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('enforces Client object-level ownership boundary: client cannot view another client payment', async () => {
      const saleClientA = createSale({
        id: 'sale-client-a',
        tenantId: tenantA,
        clientId: clientUserA.id,
      });
      const payment = createPayment({
        id: 'pmt-client-a',
        saleId: saleClientA.id.value,
        tenantId: tenantA,
      });

      // Owner client can view
      const result = await controller.getPaymentById(payment.id.value, clientUserA);
      expect(result.id).toBe(payment.id.value);

      // Other client cannot view -> rejects with PaymentNotFoundException (zero existence disclosure)
      await expect(controller.getPaymentById(payment.id.value, clientUserB)).rejects.toThrow(
        PaymentNotFoundException,
      );
    });
  });

  // ===========================================================================
  // 4. Correct Payment Response Shape & Serialization
  // ===========================================================================
  describe('4. Correct Payment Response Shape & Serialization', () => {
    it('returns exact approved DTO fields without internal persistence or client leakages', async () => {
      const sale = createSale({
        id: 'sale-dto-test',
        clientId: 'client-secret-999',
      });
      const payment = createPayment({
        id: 'pmt-dto-shape-01',
        saleId: sale.id.value,
        amount: 99.95,
        currency: 'USD',
        method: PaymentMethod.QR,
        status: PaymentStatus.COMPLETED,
        reference: 'QR-TX-99999',
        createdAt: new Date('2026-10-01T15:00:00.000Z'),
        paidAt: new Date('2026-10-01T15:00:02.000Z'),
      });

      const response = await controller.getPaymentById(payment.id.value, receptionistUser);

      // Explicit approved fields
      expect(response.id).toBe('pmt-dto-shape-01');
      expect(response.saleId).toBe(sale.id.value);
      expect(response.method).toBe(PaymentMethod.QR);
      expect(response.status).toBe(PaymentStatus.COMPLETED);
      expect(response.reference).toBe('QR-TX-99999');
      expect(response.paidAt).toBe('2026-10-01T15:00:02.000Z');
      expect(response.createdAt).toBe('2026-10-01T15:00:00.000Z');
      expect(response.version).toBe(1);

      // Structured monetary fields
      expect(response.amount).toEqual({
        amount: 99.95,
        currency: 'USD',
        formatted: '99.95',
        cents: 9995,
      });
      expect(response.amountValue).toBe(99.95);

      // Zero leakage of persistence or client details
      const raw = response as unknown as Record<string, unknown>;
      expect(raw['tenantId']).toBeUndefined();
      expect(raw['updatedAt']).toBeUndefined();
      expect(raw['clientId']).toBeUndefined();
      expect(raw['client']).toBeUndefined();
      expect(raw['customer']).toBeUndefined();
    });

    it('correctly serializes pending payment with null paidAt and null reference', async () => {
      const sale = createSale({ id: 'sale-pending-shape' });
      const payment = createPayment({
        id: 'pmt-pending-shape',
        saleId: sale.id.value,
        amount: 15.0,
        status: PaymentStatus.PENDING,
        reference: null,
        paidAt: null,
      });

      const response = await controller.getPaymentById(payment.id.value, receptionistUser);

      expect(response.status).toBe(PaymentStatus.PENDING);
      expect(response.reference).toBeNull();
      expect(response.paidAt).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Read-Only Invariant: No State Mutations or Lifecycle Changes
  // ===========================================================================
  describe('5. Read-Only Invariant: No State Mutations or Lifecycle Changes', () => {
    it('does not trigger state transitions, events, or repository saves during query', async () => {
      const sale = createSale({ id: 'sale-readonly' });
      const payment = createPayment({
        id: 'pmt-readonly',
        saleId: sale.id.value,
        status: PaymentStatus.PENDING,
      });

      paymentRepo.saveCallCount = 0;
      saleRepo.saveCallCount = 0;

      const response = await controller.getPaymentById(payment.id.value, receptionistUser);

      // Still in PENDING status
      expect(response.status).toBe(PaymentStatus.PENDING);

      // Zero repository writes occurred
      expect(paymentRepo.saveCallCount).toBe(0);
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });
});
