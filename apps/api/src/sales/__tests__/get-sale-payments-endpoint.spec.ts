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
  GetSalePaymentHistoryHandler,
  SaleNotFoundException,
  PaymentUnauthorizedException,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public findBySaleIdCallCount = 0;
  public findAllCallCount = 0;

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
    this.findBySaleIdCallCount++;
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

  async findAll(): Promise<Payment[]> {
    this.findAllCallCount++;
    return Array.from(this.store.values());
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public findByIdCallCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    this.findByIdCallCount++;
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

describe('GET /sales/:saleId/payments - Query Architecture & Security Acceptance Spec', () => {
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
      paidAt: opts.paidAt !== undefined ? opts.paidAt : new Date('2026-10-01T10:05:00.000Z'),
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
          provide: GetSalePaymentHistoryHandler,
          useFactory: () => new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
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
  // 1. Valid Sale with multiple Payments
  // ===========================================================================
  describe('1. Valid Sale with multiple Payments', () => {
    it('returns all payments associated with the target sale with proper structure', async () => {
      const sale = createSale({ id: 'sale-valid-multi' });

      createPayment({
        id: 'pmt-001',
        saleId: sale.id.value,
        amount: 30.0,
        method: PaymentMethod.CASH,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      createPayment({
        id: 'pmt-002',
        saleId: sale.id.value,
        amount: 70.0,
        method: PaymentMethod.QR,
        createdAt: new Date('2026-10-01T10:15:00.000Z'),
      });

      const result = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('pmt-001');
      expect(result[0]!.saleId).toBe(sale.id.value);
      expect(result[0]!.method).toBe(PaymentMethod.CASH);
      expect(result[0]!.amount.amount).toBe(30.0);
      expect(result[0]!.amount.cents).toBe(3000);

      expect(result[1]!.id).toBe('pmt-002');
      expect(result[1]!.saleId).toBe(sale.id.value);
      expect(result[1]!.method).toBe(PaymentMethod.QR);
      expect(result[1]!.amount.amount).toBe(70.0);
      expect(result[1]!.amount.cents).toBe(7000);
    });
  });

  // ===========================================================================
  // 2. Sale with no Payments
  // ===========================================================================
  describe('2. Sale with no Payments', () => {
    it('returns an empty array when the sale exists but has zero payment attempts', async () => {
      const sale = createSale({ id: 'sale-zero-payments' });

      const result = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 3. Unknown Sale & Identifier Validation
  // ===========================================================================
  describe('3. Unknown Sale & Identifier Validation', () => {
    it('throws SaleNotFoundException when the requested saleId does not exist', async () => {
      await expect(
        controller.getPaymentsBySaleId('non-existent-sale-uuid', receptionistUser),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('rejects empty or whitespace saleId with BadRequestException', async () => {
      await expect(controller.getPaymentsBySaleId('', receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getPaymentsBySaleId('   ', receptionistUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================================================
  // 4. Unauthorized Access & Resource-Level Permissions
  // ===========================================================================
  describe('4. Unauthorized Access & Resource-Level Permissions', () => {
    it('authorizes Owner, Manager, Receptionist, and Kitchen Staff with payments.read', async () => {
      const sale = createSale({ id: 'sale-roles-test' });
      createPayment({ id: 'pmt-role-1', saleId: sale.id.value });

      await expect(controller.getPaymentsBySaleId(sale.id.value, ownerUser)).resolves.toHaveLength(
        1,
      );
      await expect(
        controller.getPaymentsBySaleId(sale.id.value, managerUser),
      ).resolves.toHaveLength(1);
      await expect(
        controller.getPaymentsBySaleId(sale.id.value, receptionistUser),
      ).resolves.toHaveLength(1);
      await expect(
        controller.getPaymentsBySaleId(sale.id.value, kitchenStaffUser),
      ).resolves.toHaveLength(1);
    });

    it('rejects unprivileged user lacking payments.read with PaymentUnauthorizedException', async () => {
      const sale = createSale({ id: 'sale-unprivileged' });

      await expect(controller.getPaymentsBySaleId(sale.id.value, unprivilegedUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('prevents cross-tenant access: user in Tenant B cannot view Tenant A sale payments', async () => {
      const saleTenantA = createSale({ id: 'sale-tenant-a', tenantId: tenantA });
      createPayment({ id: 'pmt-tenant-a', saleId: saleTenantA.id.value, tenantId: tenantA });

      await expect(
        controller.getPaymentsBySaleId(saleTenantA.id.value, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('enforces Client object-level ownership boundary: client cannot view another client sale payments', async () => {
      const clientSale = createSale({
        id: 'sale-client-a',
        tenantId: tenantA,
        clientId: clientUserA.id,
      });
      createPayment({ id: 'pmt-client-a', saleId: clientSale.id.value, tenantId: tenantA });

      // Owner client can view
      const allowed = await controller.getPaymentsBySaleId(clientSale.id.value, clientUserA);
      expect(allowed).toHaveLength(1);

      // Other client cannot view -> rejects with SaleNotFoundException (zero existence leakage)
      await expect(
        controller.getPaymentsBySaleId(clientSale.id.value, clientUserB),
      ).rejects.toThrow(SaleNotFoundException);
    });
  });

  // ===========================================================================
  // 5. No Cross-Sale Payment Leakage & Repository-Level Filtering
  // ===========================================================================
  describe('5. No Cross-Sale Payment Leakage & Repository-Level Filtering', () => {
    it('strictly isolates payments to requested Sale using repository-level filtering', async () => {
      const saleA = createSale({ id: 'sale-alpha' });
      const saleB = createSale({ id: 'sale-beta' });

      createPayment({ id: 'pmt-a1', saleId: saleA.id.value, amount: 25.0 });
      createPayment({ id: 'pmt-a2', saleId: saleA.id.value, amount: 35.0 });
      createPayment({ id: 'pmt-b1', saleId: saleB.id.value, amount: 99.0 });

      // Reset repo counters
      paymentRepo.findBySaleIdCallCount = 0;
      paymentRepo.findAllCallCount = 0;

      const paymentsA = await controller.getPaymentsBySaleId(saleA.id.value, receptionistUser);
      expect(paymentsA).toHaveLength(2);
      expect(paymentsA.map((p) => p.id)).toEqual(['pmt-a1', 'pmt-a2']);
      expect(paymentsA.every((p) => p.saleId === saleA.id.value)).toBe(true);

      const paymentsB = await controller.getPaymentsBySaleId(saleB.id.value, receptionistUser);
      expect(paymentsB).toHaveLength(1);
      expect(paymentsB[0]!.id).toBe('pmt-b1');
      expect(paymentsB[0]!.saleId).toBe(saleB.id.value);

      // Verify repository-level filtering was used (never loading all payments into memory)
      expect(paymentRepo.findBySaleIdCallCount).toBe(2);
      expect(paymentRepo.findAllCallCount).toBe(0);
    });
  });

  // ===========================================================================
  // 6. Deterministic Ordering Guarantee
  // ===========================================================================
  describe('6. Deterministic Ordering Guarantee', () => {
    it('orders payments by createdAt ASC by default with deterministic id ASC tiebreaker', async () => {
      const sale = createSale({ id: 'sale-sort-asc' });

      // Create 3 payments: two with identical timestamps
      const sharedTime = new Date('2026-10-01T12:00:00.000Z');
      createPayment({
        id: 'pmt-zeta',
        saleId: sale.id.value,
        createdAt: sharedTime,
      });
      createPayment({
        id: 'pmt-alpha',
        saleId: sale.id.value,
        createdAt: sharedTime,
      });
      createPayment({
        id: 'pmt-early',
        saleId: sale.id.value,
        createdAt: new Date('2026-10-01T11:00:00.000Z'),
      });

      const result = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(result).toHaveLength(3);
      // 'pmt-early' is oldest
      expect(result[0]!.id).toBe('pmt-early');
      // For sharedTime: 'pmt-alpha' comes before 'pmt-zeta' due to id ASC tie-breaker
      expect(result[1]!.id).toBe('pmt-alpha');
      expect(result[2]!.id).toBe('pmt-zeta');
    });

    it('supports sortDirection=desc with deterministic id ASC tiebreaker', async () => {
      const sale = createSale({ id: 'sale-sort-desc' });

      const sharedTime = new Date('2026-10-01T12:00:00.000Z');
      createPayment({
        id: 'pmt-zeta',
        saleId: sale.id.value,
        createdAt: sharedTime,
      });
      createPayment({
        id: 'pmt-alpha',
        saleId: sale.id.value,
        createdAt: sharedTime,
      });
      createPayment({
        id: 'pmt-early',
        saleId: sale.id.value,
        createdAt: new Date('2026-10-01T11:00:00.000Z'),
      });

      const result = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser, 'desc');

      expect(result).toHaveLength(3);
      // Descending: sharedTime payments first (with id ASC tie-breaker: 'pmt-alpha' before 'pmt-zeta')
      expect(result[0]!.id).toBe('pmt-alpha');
      expect(result[1]!.id).toBe('pmt-zeta');
      expect(result[2]!.id).toBe('pmt-early');
    });
  });

  // ===========================================================================
  // 7. Correct Monetary & Timestamp Serialization (No Leakage)
  // ===========================================================================
  describe('7. Correct Monetary & Timestamp Serialization (No Leakage)', () => {
    it('returns explicit summary DTOs adhering to ADR-0114 monetary precision and zero leakages', async () => {
      const sale = createSale({
        id: 'sale-dto-shape',
        clientId: 'client-12345',
      });

      createPayment({
        id: 'pmt-dto-01',
        saleId: sale.id.value,
        amount: 49.99,
        currency: 'USD',
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        reference: 'DRAWER-01-TX-42',
        createdAt: new Date('2026-10-01T14:30:00.000Z'),
        paidAt: new Date('2026-10-01T14:30:05.000Z'),
      });

      const [dto] = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(dto).toBeDefined();
      expect(dto!.id).toBe('pmt-dto-01');
      expect(dto!.saleId).toBe(sale.id.value);
      expect(dto!.method).toBe(PaymentMethod.CASH);
      expect(dto!.status).toBe(PaymentStatus.COMPLETED);
      expect(dto!.reference).toBe('DRAWER-01-TX-42');
      expect(dto!.paidAt).toBe('2026-10-01T14:30:05.000Z');
      expect(dto!.createdAt).toBe('2026-10-01T14:30:00.000Z');
      expect(dto!.version).toBe(1);

      // Monetary object shape
      expect(dto!.amount).toEqual({
        amount: 49.99,
        currency: 'USD',
        formatted: '49.99',
        cents: 4999,
      });
      expect(dto!.amountValue).toBe(49.99);

      // Verify zero leakages of internal persistence or client fields
      const rawDto = dto as unknown as Record<string, unknown>;
      expect(rawDto['clientId']).toBeUndefined();
      expect(rawDto['client']).toBeUndefined();
      expect(rawDto['customer']).toBeUndefined();
      expect(rawDto['items']).toBeUndefined();
      expect(rawDto['tenantId']).toBeUndefined();
      expect(rawDto['updatedAt']).toBeUndefined();
    });

    it('correctly handles pending payment with null paidAt and null reference', async () => {
      const sale = createSale({ id: 'sale-pending-pmt' });

      createPayment({
        id: 'pmt-pending-01',
        saleId: sale.id.value,
        amount: 20.0,
        status: PaymentStatus.PENDING,
        reference: null,
        paidAt: null,
      });

      const [dto] = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(dto).toBeDefined();
      expect(dto!.status).toBe(PaymentStatus.PENDING);
      expect(dto!.reference).toBeNull();
      expect(dto!.paidAt).toBeNull();
    });
  });

  // ===========================================================================
  // 8. Parent Sale Authorization Enforcement (No Bypass)
  // ===========================================================================
  describe('8. Parent Sale Authorization Enforcement (No Bypass)', () => {
    it('always verifies parent sale existence and authorization before returning payments', async () => {
      const sale = createSale({ id: 'sale-auth-parent' });
      createPayment({ id: 'pmt-auth-01', saleId: sale.id.value });

      saleRepo.findByIdCallCount = 0;
      const result = await controller.getPaymentsBySaleId(sale.id.value, receptionistUser);

      expect(result).toHaveLength(1);
      // Guaranteed parent sale lookup was performed
      expect(saleRepo.findByIdCallCount).toBe(1);
    });

    it('rejects orphaned payment query if sale does not exist in persistence', async () => {
      // Payment exists in store, but sale was removed / never existed in saleRepo
      createPayment({ id: 'pmt-orphan-01', saleId: 'sale-deleted' });

      await expect(
        controller.getPaymentsBySaleId('sale-deleted', receptionistUser),
      ).rejects.toThrow(SaleNotFoundException);
    });
  });
});
