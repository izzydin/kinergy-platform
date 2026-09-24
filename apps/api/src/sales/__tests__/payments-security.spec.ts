import { Test, TestingModule } from '@nestjs/testing';
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
  PaymentRepositoryPort,
  SaleRepositoryPort,
  SalesEventPublisherPort,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  SaleNotFoundException,
  PaymentNotFoundException,
  PaymentUnauthorizedException,
  InvalidPaymentReferenceException,
  InvalidPaymentTransitionException,
} from '@kinergy-platform/core';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import {
  RecordPaymentRequestDto,
  CancelPaymentRequestDto,
  CompletePaymentRequestDto,
  FailPaymentRequestDto,
} from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { SalesAuditEventPublisher } from '../infrastructure/sales-audit-event-publisher';
import {
  AUDIT_EVENT_PUBLISHER,
  IAuditEventPublisher,
  IAuditEvent,
  AuditEventCategory,
  AuditOutcome,
  AuditSeverity,
} from '../../platform/audit';

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

class MockAuditEventPublisher implements IAuditEventPublisher {
  public publishedEvents: IAuditEvent[] = [];

  async publish(event: IAuditEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  async publishBatch(events: IAuditEvent[]): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Payment Financial Security, Authorization & Audit Hardening Spec', () => {
  const primaryTenantId = 'tenant_fitness_hub';
  const competitorTenantId = 'tenant_rival_wellness';

  // Personas
  const receptionistUser: AuthenticatedUserPayload = {
    id: 'user_frontdesk_01',
    email: 'frontdesk@fitnesshub.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read'],
    tenantId: primaryTenantId,
  };

  const managerUser: AuthenticatedUserPayload = {
    id: 'user_manager_01',
    email: 'manager@fitnesshub.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage', 'sales.read'],
    tenantId: primaryTenantId,
  };

  const unprivilegedMemberUser: AuthenticatedUserPayload = {
    id: 'user_member_01',
    email: 'member@example.com',
    status: 'ACTIVE',
    roles: ['Member'],
    permissions: [],
    tenantId: primaryTenantId,
  };

  const crossTenantManagerUser: AuthenticatedUserPayload = {
    id: 'user_rival_manager_01',
    email: 'manager@rival.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['payments.create', 'payments.read', 'payments.manage', 'sales.read'],
    tenantId: competitorTenantId,
  };

  let controller: PaymentsController;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let mockAuditPublisher: MockAuditEventPublisher;
  let salesAuditPublisher: SalesAuditEventPublisher;

  const createPayableSale = (
    tenant: string = primaryTenantId,
    totalAmount: number = 100.0,
    currency: string = 'USD',
  ): Sale => {
    const sale = Sale.create({
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
      description: 'Gold Monthly Membership',
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
    mockAuditPublisher = new MockAuditEventPublisher();
    salesAuditPublisher = new SalesAuditEventPublisher(mockAuditPublisher);

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
          provide: AUDIT_EVENT_PUBLISHER,
          useValue: mockAuditPublisher,
        },
        {
          provide: SalesAuditEventPublisher,
          useValue: salesAuditPublisher,
        },
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              salesAuditPublisher as unknown as SalesEventPublisherPort,
            ),
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(paymentRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              salesAuditPublisher as unknown as SalesEventPublisherPort,
            ),
        },
        {
          provide: SettlePaymentHandler,
          useFactory: () =>
            new SettlePaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              salesAuditPublisher as unknown as SalesEventPublisherPort,
            ),
        },
        {
          provide: FailPaymentHandler,
          useFactory: () =>
            new FailPaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              salesAuditPublisher as unknown as SalesEventPublisherPort,
            ),
        },
        {
          provide: CancelPaymentHandler,
          useFactory: () =>
            new CancelPaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              salesAuditPublisher as unknown as SalesEventPublisherPort,
            ),
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

  // 1. Authenticated Access & Permissions
  describe('1. Authenticated Access & Least-Privilege Permissions', () => {
    it('allows Receptionist with payments.create to record payment tender', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        currency: 'USD',
        reference: 'DRAWER-01',
      };

      const result = await controller.recordPayment(sale.id.value, dto, receptionistUser);
      expect(result.id).toBeDefined();
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.amount.formatted).toBe('50.00');
    });

    it('rejects unprivileged user lacking payments.create permission', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      const dto: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
      };

      await expect(
        controller.recordPayment(sale.id.value, dto, unprivilegedMemberUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('rejects unprivileged user from querying payments by sale or id', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');
      const payment = await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 50.0 },
        receptionistUser,
      );

      await expect(controller.getPaymentById(payment.id, unprivilegedMemberUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );

      await expect(
        controller.getPaymentsBySaleId(sale.id.value, unprivilegedMemberUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('allows Manager with payments.manage to cancel a pending payment', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      // Create pending QR tender
      const recordHandler = new RecordPaymentHandler(
        paymentRepo,
        saleRepo,
        undefined,
        salesAuditPublisher as unknown as SalesEventPublisherPort,
      );
      const pendingRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId: primaryTenantId,
          currentUser: receptionistUser,
        },
      });
      const pending = pendingRes.getValue();

      const cancelDto: CancelPaymentRequestDto = {
        reason: 'Customer requested cancellation prior to scanning QR',
      };

      const result = await controller.cancelPayment(pending.id, cancelDto, managerUser);
      expect(result.status).toBe(PaymentStatus.CANCELLED);
    });

    it('rejects Receptionist lacking payments.manage from cancelling a payment', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');
      const recordHandler = new RecordPaymentHandler(
        paymentRepo,
        saleRepo,
        undefined,
        salesAuditPublisher as unknown as SalesEventPublisherPort,
      );
      const pendingRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId: primaryTenantId,
          currentUser: receptionistUser,
        },
      });
      const pending = pendingRes.getValue();

      // receptionistUser has payments.create but lacks payments.manage
      await expect(
        controller.cancelPayment(
          pending.id,
          { reason: 'Unauthorized cancellation' },
          receptionistUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });

  // 2. Sale Scoping & Cross-Sale Isolation
  describe('2. Sale Scoping & Cross-Sale Tampering Defenses', () => {
    it('rejects creating Payment against an inaccessible / nonexistent Sale', async () => {
      const nonexistentSaleId = 'sale_nonexistent_999';

      await expect(
        controller.recordPayment(
          nonexistentSaleId,
          { method: PaymentMethod.CASH, amount: 25.0 },
          receptionistUser,
        ),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('rejects listing payments for an inaccessible / nonexistent Sale', async () => {
      const nonexistentSaleId = 'sale_nonexistent_999';

      await expect(
        controller.getPaymentsBySaleId(nonexistentSaleId, receptionistUser),
      ).rejects.toThrow(SaleNotFoundException);
    });

    it('rejects retrieving non-existent payment ID with PaymentNotFoundException', async () => {
      await expect(
        controller.getPaymentById('pmt_nonexistent_999', receptionistUser),
      ).rejects.toThrow(PaymentNotFoundException);
    });

    it('ensures payments returned are strictly scoped to the requested Sale', async () => {
      const saleA = createPayableSale(primaryTenantId, 100.0, 'USD');
      const saleB = createPayableSale(primaryTenantId, 200.0, 'USD');

      await controller.recordPayment(
        saleA.id.value,
        { method: PaymentMethod.CASH, amount: 40.0 },
        receptionistUser,
      );
      await controller.recordPayment(
        saleB.id.value,
        { method: PaymentMethod.CASH, amount: 80.0 },
        receptionistUser,
      );

      const paymentsSaleA = await controller.getPaymentsBySaleId(saleA.id.value, receptionistUser);
      expect(paymentsSaleA.length).toBe(1);
      expect(paymentsSaleA[0]?.saleId).toBe(saleA.id.value);

      const paymentsSaleB = await controller.getPaymentsBySaleId(saleB.id.value, receptionistUser);
      expect(paymentsSaleB.length).toBe(1);
      expect(paymentsSaleB[0]?.saleId).toBe(saleB.id.value);
    });
  });

  // 3. Multi-Tenant Organization Isolation
  describe('3. Multi-Tenant Organization Isolation', () => {
    it('prevents cross-tenant payment recording: Tenant B cannot record payment on Tenant A sale', async () => {
      const saleTenantA = createPayableSale(primaryTenantId, 100.0, 'USD');

      // Tenant B manager attempts to record payment on Tenant A sale
      await expect(
        controller.recordPayment(
          saleTenantA.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          crossTenantManagerUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('prevents cross-tenant payment retrieval: Tenant B cannot view Tenant A payment', async () => {
      const saleTenantA = createPayableSale(primaryTenantId, 100.0, 'USD');
      const payment = await controller.recordPayment(
        saleTenantA.id.value,
        { method: PaymentMethod.CASH, amount: 50.0 },
        receptionistUser,
      );

      await expect(controller.getPaymentById(payment.id, crossTenantManagerUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('prevents cross-tenant sale payment listing: Tenant B cannot list Tenant A sale payments', async () => {
      const saleTenantA = createPayableSale(primaryTenantId, 100.0, 'USD');

      await expect(
        controller.getPaymentsBySaleId(saleTenantA.id.value, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('prevents cross-tenant payment settlement or cancellation', async () => {
      const saleTenantA = createPayableSale(primaryTenantId, 100.0, 'USD');
      const recordHandler = new RecordPaymentHandler(
        paymentRepo,
        saleRepo,
        undefined,
        salesAuditPublisher as unknown as SalesEventPublisherPort,
      );
      const pendingRes = await recordHandler.execute({
        input: {
          saleId: saleTenantA.id.value,
          amount: 50.0,
          method: PaymentMethod.QR,
          tenantId: primaryTenantId,
          currentUser: receptionistUser,
        },
      });
      const pending = pendingRes.getValue();

      // Settle attempt across tenant
      await expect(
        controller.settlePayment(pending.id, {}, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);

      // Cancel attempt across tenant
      await expect(
        controller.cancelPayment(
          pending.id,
          { reason: 'Cross tenant void' },
          crossTenantManagerUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });
  });

  // 4. Identity Anti-Tampering
  describe('4. Identity Anti-Tampering & Scoping Integrity', () => {
    it('authoritatively scopes payments to authenticated user context, ignoring body spoofing attempts', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      // Attempting to pass spoofed body fields
      const dtoWithSpoofedFields: RecordPaymentRequestDto & {
        tenantId?: string;
        userId?: string;
        status?: string;
      } = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        currency: 'USD',
        reference: 'DRAWER-01',
        tenantId: 'spoofed_tenant',
        userId: 'spoofed_admin',
        status: 'SETTLED',
      };

      const result = await controller.recordPayment(
        sale.id.value,
        dtoWithSpoofedFields,
        receptionistUser,
      );
      const storedPayment = await paymentRepo.findById(result.id);
      expect(storedPayment?.tenantId).toBe(primaryTenantId); // Derived strictly from authenticated context
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  // 5. Reference Data Protection & Sanitization
  describe('5. Reference Data Protection & PCI-DSS Non-Storage Policy', () => {
    it('rejects credit card Primary Account Numbers (13-19 digits) in payment reference', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      const dtoWithPan: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        reference: '4111 2222 3333 4444', // 16 digit PAN
      };

      await expect(
        controller.recordPayment(sale.id.value, dtoWithPan, receptionistUser),
      ).rejects.toThrow(InvalidPaymentReferenceException);
    });

    it('accepts safe register drawer and alphanumeric transaction identifiers', async () => {
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      const dtoWithSafeRef: RecordPaymentRequestDto = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        reference: 'DRAWER_POS-01:REC#9876/TX',
      };

      const result = await controller.recordPayment(
        sale.id.value,
        dtoWithSafeRef,
        receptionistUser,
      );
      expect(result.reference).toBe('DRAWER_POS-01:REC#9876/TX');
    });
  });

  // 6. Auditability & Compliance Trail
  describe('6. Auditability & Financial Compliance Trail', () => {
    it('publishes structured IAuditEvent record upon PaymentSettled', async () => {
      mockAuditPublisher.clear();
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');

      await controller.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0, reference: 'RECEIPT-AUDIT-01' },
        receptionistUser,
      );

      // Verify audit event published
      expect(mockAuditPublisher.publishedEvents.length).toBeGreaterThanOrEqual(1);
      const settlementAudit = mockAuditPublisher.publishedEvents.find(
        (e) => e.eventType === 'PaymentCompleted' || e.eventType === 'PaymentSettled',
      );
      expect(settlementAudit).toBeDefined();
      expect(settlementAudit?.category).toBe(AuditEventCategory.DATA_ACCESS);
      expect(settlementAudit?.target.type).toBe('Payment');
      expect(settlementAudit?.outcome).toBe(AuditOutcome.SUCCESS);
      expect(settlementAudit?.severity).toBe(AuditSeverity.LOW);
      expect(settlementAudit?.tenantId).toBe(primaryTenantId);
      expect(settlementAudit?.metadata?.custom?.amount).toBe(100.0);
      expect(settlementAudit?.metadata?.custom?.reference).toBe('RECEIPT-AUDIT-01');
      expect(settlementAudit?.actor?.userId).toBe(receptionistUser.id);
      expect(settlementAudit?.actor?.roles).toEqual(['Receptionist']);
    });

    it('publishes structured IAuditEvent record upon PaymentCancelled', async () => {
      mockAuditPublisher.clear();
      const sale = createPayableSale(primaryTenantId, 100.0, 'USD');
      const recordHandler = new RecordPaymentHandler(
        paymentRepo,
        saleRepo,
        undefined,
        salesAuditPublisher as unknown as SalesEventPublisherPort,
      );
      const pendingRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId: primaryTenantId,
          currentUser: receptionistUser,
        },
      });
      const pending = pendingRes.getValue();

      mockAuditPublisher.clear();

      await controller.cancelPayment(pending.id, { reason: 'Customer changed mind' }, managerUser);

      const cancelAudit = mockAuditPublisher.publishedEvents.find(
        (e) => e.eventType === 'PaymentCancelled',
      );
      expect(cancelAudit).toBeDefined();
      expect(cancelAudit?.outcome).toBe(AuditOutcome.SUCCESS);
      expect(cancelAudit?.severity).toBe(AuditSeverity.MEDIUM);
      expect(cancelAudit?.target.id).toBe(pending.id);
      expect(cancelAudit?.metadata?.reason).toBe('Customer changed mind');
      expect(cancelAudit?.actor?.userId).toBe(managerUser.id);
      expect(cancelAudit?.actor?.roles).toEqual(['Manager']);
    });
  });

  // 7. Payment Lifecycle Transition Authorization, Cross-Context & Audit Hardening
  describe('7. Payment Lifecycle Transition Authorization, Cross-Context & Audit Hardening', () => {
    const createPendingPayment = async (
      tenantId: string = primaryTenantId,
      saleAmount: number = 100.0,
      paymentAmount: number = 50.0,
    ) => {
      const sale = createPayableSale(tenantId, saleAmount, 'USD');
      const recordHandler = new RecordPaymentHandler(
        paymentRepo,
        saleRepo,
        undefined,
        salesAuditPublisher as unknown as SalesEventPublisherPort,
      );
      const pendingRes = await recordHandler.execute({
        input: {
          saleId: sale.id.value,
          amount: paymentAmount,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
          currentUser: receptionistUser,
        },
      });
      return { sale, pending: pendingRes.getValue() };
    };

    it('authorized completion: allows Receptionist with payments.create to complete PENDING payment, publishing PaymentCompleted audit record with actor attribution', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      const completeDto: CompletePaymentRequestDto = {
        reference: 'TERM-OK-AUTH-1001',
      };

      const result = await controller.completePayment(pending.id, completeDto, receptionistUser);

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.paidAt).not.toBeNull();
      expect(result.reference).toBe('TERM-OK-AUTH-1001');

      // Verify audit event creation
      expect(mockAuditPublisher.publishedEvents.length).toBe(1);
      const audit = mockAuditPublisher.publishedEvents[0]!;
      expect(audit.eventType).toBe('PaymentCompleted');
      expect(audit.category).toBe(AuditEventCategory.DATA_ACCESS);
      expect(audit.outcome).toBe(AuditOutcome.SUCCESS);
      expect(audit.severity).toBe(AuditSeverity.LOW);
      expect(audit.target.type).toBe('Payment');
      expect(audit.target.id).toBe(pending.id);
      expect(audit.tenantId).toBe(primaryTenantId);
      expect(audit.actor?.userId).toBe(receptionistUser.id);
      expect(audit.actor?.email).toBe(receptionistUser.email);
      expect(audit.actor?.roles).toEqual(['Receptionist']);
      expect(audit.metadata?.custom?.amount).toBe(50.0);
      expect(audit.metadata?.custom?.reference).toBe('TERM-OK-AUTH-1001');
      expect(audit.metadata?.custom?.paidAt).toBeDefined();
    });

    it('unauthorized completion: rejects unprivileged user lacking payments.create/manage and emits NO audit event', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      await expect(
        controller.completePayment(
          pending.id,
          { reference: 'UNAUTH-COMPLETE' },
          unprivilegedMemberUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);

      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
      const stored = await paymentRepo.findById(pending.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
      expect(stored?.paidAt).toBeNull();
    });

    it('authorized failure: allows Receptionist with payments.create to mark payment as failed, publishing PaymentFailed audit record with actor attribution and reason', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      const failDto: FailPaymentRequestDto = {
        reason: 'Payment network decline: Insufficient balance on card',
      };

      const result = await controller.failPayment(pending.id, failDto, receptionistUser);

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.paidAt).toBeNull();

      expect(mockAuditPublisher.publishedEvents.length).toBe(1);
      const audit = mockAuditPublisher.publishedEvents[0]!;
      expect(audit.eventType).toBe('PaymentFailed');
      expect(audit.category).toBe(AuditEventCategory.SYSTEM_SECURITY);
      expect(audit.outcome).toBe(AuditOutcome.FAILURE);
      expect(audit.severity).toBe(AuditSeverity.HIGH);
      expect(audit.target.id).toBe(pending.id);
      expect(audit.target.type).toBe('Payment');
      expect(audit.actor?.userId).toBe(receptionistUser.id);
      expect(audit.metadata?.reason).toBe('Payment network decline: Insufficient balance on card');
      expect(audit.metadata?.custom?.amount).toBe(50.0);
    });

    it('unauthorized failure: rejects unprivileged user lacking payments.create/manage and emits NO audit event', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      await expect(
        controller.failPayment(
          pending.id,
          { reason: 'Rogue failure attempt' },
          unprivilegedMemberUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);

      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
      const stored = await paymentRepo.findById(pending.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
    });

    it('authorized cancellation: allows Manager with payments.manage to cancel payment, publishing PaymentCancelled audit record with actor attribution and reason', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      const cancelDto: CancelPaymentRequestDto = {
        reason: 'Customer tender cancellation approved by store supervisor',
      };

      const result = await controller.cancelPayment(pending.id, cancelDto, managerUser);

      expect(result.status).toBe(PaymentStatus.CANCELLED);
      expect(result.paidAt).toBeNull();

      expect(mockAuditPublisher.publishedEvents.length).toBe(1);
      const audit = mockAuditPublisher.publishedEvents[0]!;
      expect(audit.eventType).toBe('PaymentCancelled');
      expect(audit.category).toBe(AuditEventCategory.DATA_ACCESS);
      expect(audit.outcome).toBe(AuditOutcome.SUCCESS);
      expect(audit.severity).toBe(AuditSeverity.MEDIUM);
      expect(audit.target.id).toBe(pending.id);
      expect(audit.actor?.userId).toBe(managerUser.id);
      expect(audit.actor?.roles).toEqual(['Manager']);
      expect(audit.metadata?.reason).toBe(
        'Customer tender cancellation approved by store supervisor',
      );
    });

    it('unauthorized cancellation: rejects Receptionist lacking payments.manage from cancelling payment and emits NO audit event', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      await expect(
        controller.cancelPayment(
          pending.id,
          { reason: 'Cashier attempt to cancel tender' },
          receptionistUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);

      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
      const stored = await paymentRepo.findById(pending.id);
      expect(stored?.status).toBe(PaymentStatus.PENDING);
    });

    it('cross-context access: rejects complete/fail/cancel when client specifies mismatched saleId and emits NO audit event', async () => {
      const { pending } = await createPendingPayment();
      const foreignSale = createPayableSale(primaryTenantId, 250.0, 'USD');
      mockAuditPublisher.clear();

      // Mismatched saleId on complete
      await expect(
        controller.completePayment(pending.id, {}, receptionistUser, foreignSale.id.value),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      // Mismatched saleId on fail
      await expect(
        controller.failPayment(
          pending.id,
          { reason: 'Declined' },
          receptionistUser,
          foreignSale.id.value,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      // Mismatched saleId on cancel
      await expect(
        controller.cancelPayment(
          pending.id,
          { reason: 'Voided' },
          managerUser,
          foreignSale.id.value,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
    });

    it('cross-tenant isolation: rejects lifecycle transitions by cross-tenant caller and emits NO audit event', async () => {
      const { pending } = await createPendingPayment(primaryTenantId);
      mockAuditPublisher.clear();

      await expect(
        controller.completePayment(pending.id, {}, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.failPayment(pending.id, { reason: 'Rail failure' }, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.cancelPayment(pending.id, { reason: 'Aborted' }, crossTenantManagerUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
    });

    it('cross-context defense: rejects payment whose associated sale belongs to another tenant and emits NO audit event', async () => {
      // Create pending payment in Tenant A, but associated sale has Tenant B
      const saleRival = createPayableSale(competitorTenantId, 100.0, 'USD');
      const anomalousPayment = Payment.createPending({
        id: PaymentId.create(),
        tenantId: primaryTenantId,
        saleId: saleRival.id,
        method: PaymentMethod.CASH,
        amount: Money.create(50.0, 'USD'),
      });
      await paymentRepo.save(anomalousPayment);
      mockAuditPublisher.clear();

      await expect(
        controller.completePayment(anomalousPayment.id.value, {}, receptionistUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.failPayment(anomalousPayment.id.value, { reason: 'Timeout' }, receptionistUser),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.cancelPayment(
          anomalousPayment.id.value,
          { reason: 'Cancel anomalous' },
          managerUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
    });

    it('audit event absence on invalid state machine transitions: terminal payments reject transition and emit NO audit event', async () => {
      const { pending } = await createPendingPayment();
      // First, complete the payment legally
      await controller.completePayment(pending.id, {}, receptionistUser);
      mockAuditPublisher.clear();

      // Attempt repeated complete on COMPLETED payment -> domain rejects transition
      await expect(controller.completePayment(pending.id, {}, managerUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      // Attempt fail on COMPLETED payment -> domain rejects transition
      await expect(
        controller.failPayment(pending.id, { reason: 'Declined' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      // Attempt cancel on COMPLETED payment -> domain rejects transition
      await expect(
        controller.cancelPayment(pending.id, { reason: 'Cancel' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
    });

    it('audit event absence when payment is not found', async () => {
      mockAuditPublisher.clear();

      await expect(
        controller.completePayment('pmt_nonexistent_id_404', {}, receptionistUser),
      ).rejects.toThrow(PaymentNotFoundException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.failPayment('pmt_nonexistent_id_404', { reason: 'Fail' }, receptionistUser),
      ).rejects.toThrow(PaymentNotFoundException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);

      await expect(
        controller.cancelPayment('pmt_nonexistent_id_404', { reason: 'Cancel' }, managerUser),
      ).rejects.toThrow(PaymentNotFoundException);
      expect(mockAuditPublisher.publishedEvents.length).toBe(0);
    });

    it('audit privacy & data protection: credit card PANs and cardholder sensitive tokens are masked in audit records', async () => {
      const { pending } = await createPendingPayment();
      mockAuditPublisher.clear();

      const sensitiveReason = 'Gateway rail decline for card 4111222233334444: Expired card';

      await controller.failPayment(pending.id, { reason: sensitiveReason }, receptionistUser);

      expect(mockAuditPublisher.publishedEvents.length).toBe(1);
      const audit = mockAuditPublisher.publishedEvents[0]!;
      expect(audit.metadata?.reason).toBe(
        'Gateway rail decline for card ****-****-****-[MASKED]: Expired card',
      );
      expect(audit.metadata?.reason).not.toContain('4111222233334444');
      // Verify no sensitive credentials leaked
      const stringifiedAudit = JSON.stringify(audit);
      expect(stringifiedAudit).not.toContain('password');
      expect(stringifiedAudit).not.toContain('secret');
      expect(stringifiedAudit).not.toContain('apiKey');
    });
  });
});
