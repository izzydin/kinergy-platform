import * as fs from 'fs';
import * as path from 'path';
import {
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  SaleStatus,
  Payment,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  Receipt,
  ReceiptNumber,
  CreateSaleHandler,
  CreateSaleCommand,
  CreatePaymentHandler,
  CreatePaymentCommand,
  CompletePaymentHandler,
  CompletePaymentCommand,
  FailPaymentHandler,
  FailPaymentCommand,
  CancelPaymentHandler,
  CancelPaymentCommand,
  CancelSaleHandler,
  CancelSaleCommand,
  GetPaymentsBySaleIdHandler,
  GetPaymentsBySaleIdQuery,
  GetSalePaymentHistoryHandler,
  GetSalePaymentHistoryQuery,
  IssueReceiptHandler,
  IssueReceiptCommand,
  GetReceiptHandler,
  GetReceiptQuery,
  GetReceiptBySaleHandler,
  GetReceiptBySaleQuery,
  CoordinateSalePaymentHandler,
  CoordinateSalePaymentCommand,
  SalePaymentCoordinationService,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
  SaleSourceValidatorPort,
  IUnitOfWork,
  SalesEventPublisherPort,
  SaleNotFoundException,
  SaleUnauthorizedException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  PaymentSaleMismatchException,
  PaymentNotCompletedException,
  PaymentCurrencyMismatchException,
  InsufficientPaymentException,
  SourceNotFoundException,
  InvalidSaleSourceException,
} from '../../index';
import { DeterministicClock } from '../domain/shared/clock';
import { DomainEvent } from '../domain/shared/domain-event';

// =============================================================================
// TEST CONSTANTS & FIXTURES
// =============================================================================

const TENANT_A = 'tenant_alpha';
const TENANT_B = 'tenant_beta';

const CLOCK = new DeterministicClock(new Date('2026-10-12T14:00:00.000Z'));

// Principals with segregated duties
const PRINCIPAL_SALES_ONLY = {
  id: 'usr_sales_clerk',
  userId: 'usr_sales_clerk',
  tenantId: TENANT_A,
  roles: ['Sales Specialist'],
  permissions: ['sales.create', 'sales.read'],
};

const PRINCIPAL_PAYMENTS_CREATE_ONLY = {
  id: 'usr_cashier_jr',
  userId: 'usr_cashier_jr',
  tenantId: TENANT_A,
  roles: ['Cashier Assistant'],
  permissions: ['payments.create', 'payments.read'],
};

const PRINCIPAL_PAYMENTS_MANAGER = {
  id: 'usr_billing_mgr',
  userId: 'usr_billing_mgr',
  tenantId: TENANT_A,
  roles: ['Manager'],
  permissions: ['payments.manage', 'payments.create', 'payments.read'],
};

const PRINCIPAL_RECEIPTS_MANAGER = {
  id: 'usr_receipt_issuer',
  userId: 'usr_receipt_issuer',
  tenantId: TENANT_A,
  roles: ['Receptionist'],
  permissions: ['receipts.manage', 'receipts.read'],
};

const PRINCIPAL_CLIENT_2 = {
  id: 'client_202',
  userId: 'client_202',
  clientId: 'client_202',
  tenantId: TENANT_A,
  roles: ['Client'],
  permissions: ['sales.read', 'payments.read', 'receipts.read'],
};

const PRINCIPAL_TENANT_B_USER = {
  id: 'usr_beta_staff',
  userId: 'usr_beta_staff',
  tenantId: TENANT_B,
  roles: ['Owner'],
  permissions: ['*'],
};

// =============================================================================
// IN-MEMORY TEST PORTS
// =============================================================================

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

class InMemoryReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  private seq = 1;

  async findById(id: string): Promise<Receipt | null> {
    return this.store.get(id.trim()) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).find((r) => r.saleId.value === key) ?? null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const num = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    return Array.from(this.store.values()).find((r) => r.receiptNumber.value === num) ?? null;
  }

  async getNextReceiptNumber(_tenantId: string, year: number): Promise<ReceiptNumber> {
    const padded = String(this.seq++).padStart(6, '0');
    return ReceiptNumber.create(`REC-${year}-${padded}`);
  }

  async save(receipt: Receipt): Promise<void> {
    this.store.set(receipt.id.value, receipt);
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public events: DomainEvent[] = [];
  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.events.push(...events);
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public shouldFail = false;
  public executed = false;

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executed = true;
    if (this.shouldFail) {
      throw new Error('Database transaction aborted due to storage constraint violation');
    }
    return await work();
  }
}

// =============================================================================
// AUDIT SPECIFICATION SUITE
// =============================================================================

describe('Phase 7 Cross-Aggregate Authorization & Security Boundary Audit', () => {
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let receiptRepo: InMemoryReceiptRepository;
  let eventPublisher: MockEventPublisher;
  let unitOfWork: MockUnitOfWork;

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    receiptRepo = new InMemoryReceiptRepository();
    eventPublisher = new MockEventPublisher();
    unitOfWork = new MockUnitOfWork();
  });

  // ---------------------------------------------------------------------------
  // 1. DOMAIN AGGREGATE PURITY & DEPENDENCY DIRECTION
  // ---------------------------------------------------------------------------
  describe('1. Domain Aggregate Architectural Purity', () => {
    it('verifies Sale, Payment, and Receipt aggregate files contain ZERO IAM/HTTP/NestJS imports', () => {
      const domainDir = path.resolve(__dirname, '../domain');
      const domainFiles = [
        path.join(domainDir, 'sale.aggregate.ts'),
        path.join(domainDir, 'payment.aggregate.ts'),
        path.join(domainDir, 'receipt.aggregate.ts'),
      ];

      const forbiddenTokens = [
        '@nestjs',
        'express',
        'AuthorizationGuard',
        'AuthenticationGuard',
        'jsonwebtoken',
        'HttpStatus',
        'CurrentUser',
        'Permissions(',
        'Roles(',
        'checkPaymentAuthorization',
        'checkSaleAuthorization',
        'checkReceiptAuthorization',
      ];

      for (const filePath of domainFiles) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');

        for (const token of forbiddenTokens) {
          expect(content.includes(token)).toBe(false);
        }
      }
    });

    it('confirms domain aggregate state transitions do not require or accept IAM contexts', () => {
      const sale = Sale.create({
        id: SaleId.create('sale_pure_01'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'drink_latte',
        }),
      });

      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'drink_latte',
        }),
        description: 'Matcha Latte',
        unitPrice: Money.create(10, 'USD'),
        quantity: 1,
      });
      sale.finalize(CLOCK);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Mutating domain methods accept only domain primitives, VO, or Clock
      sale.markPaid(CLOCK);
      expect(sale.status).toBe(SaleStatus.PAID);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SEGREGATION OF DUTIES ACROSS RELATED OPERATIONS
  // ---------------------------------------------------------------------------
  describe('2. Segregation of Duties Across Related Aggregates', () => {
    let finalizedSale: Sale;

    beforeEach(() => {
      finalizedSale = Sale.create({
        id: SaleId.create('sale_test_100'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'drink_protein',
        }),
      });
      finalizedSale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'drink_protein',
        }),
        description: 'Protein Shake',
        unitPrice: Money.create(25, 'USD'),
        quantity: 1,
      });
      finalizedSale.finalize(CLOCK);
      saleRepo.store.set(finalizedSale.id.value, finalizedSale);
    });

    it('prohibits a principal with only sales.create from recording a payment', async () => {
      const handler = new CreatePaymentHandler(paymentRepo, saleRepo, CLOCK, eventPublisher);

      const command = new CreatePaymentCommand({
        saleId: finalizedSale.id.value,
        amount: 25,
        currency: 'USD',
        method: PaymentMethod.CASH,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_SALES_ONLY,
      });

      const result = await handler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(paymentRepo.store.size).toBe(0);
    });

    it('prohibits a cashier with only payments.create from cancelling/voiding a payment', async () => {
      const payment = Payment.createPending({
        id: PaymentId.create('pay_pending_void_01'),
        saleId: finalizedSale.id,
        method: PaymentMethod.QR,
        amount: Money.create(25, 'USD'),
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(payment.id.value, payment);

      const cancelHandler = new CancelPaymentHandler(paymentRepo, saleRepo, CLOCK, eventPublisher);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: finalizedSale.id.value,
        reason: 'Customer changed mind',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_CREATE_ONLY, // lacks payments.manage
      });

      const result = await cancelHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(payment.status).toBe(PaymentStatus.PENDING); // untouched
    });

    it('allows a manager with payments.manage to cancel an unsettled payment', async () => {
      const payment = Payment.createPending({
        id: PaymentId.create('pay_pending_void_02'),
        saleId: finalizedSale.id,
        method: PaymentMethod.QR,
        amount: Money.create(25, 'USD'),
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(payment.id.value, payment);

      const cancelHandler = new CancelPaymentHandler(paymentRepo, saleRepo, CLOCK, eventPublisher);

      const command = new CancelPaymentCommand({
        paymentId: payment.id.value,
        saleId: finalizedSale.id.value,
        reason: 'Manager override void',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER,
      });

      const result = await cancelHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe('CANCELLED');
    });

    it('prohibits a payment manager from cancelling the parent sale order', async () => {
      const cancelSaleHandler = new CancelSaleHandler(saleRepo, CLOCK, eventPublisher);

      const command = new CancelSaleCommand({
        saleId: finalizedSale.id.value,
        reason: 'Attempted sale cancellation by billing manager',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER, // possesses payments.manage, lacks sales.cancel
      });

      const result = await cancelSaleHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(finalizedSale.status).toBe(SaleStatus.PENDING_PAYMENT); // untouched
    });

    it('prohibits a payment manager from issuing a receipt without receipts.manage', async () => {
      finalizedSale.markPaid(CLOCK);
      const payment = Payment.createCompleted({
        id: PaymentId.create('pay_settled_01'),
        saleId: finalizedSale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(25, 'USD'),
        reference: 'REF-PAID-01',
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(payment.id.value, payment);

      const issueReceiptHandler = new IssueReceiptHandler(
        receiptRepo,
        saleRepo,
        paymentRepo,
        undefined,
        CLOCK,
        eventPublisher,
      );

      const command = new IssueReceiptCommand({
        saleId: finalizedSale.id.value,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER, // lacks receipts.manage
      });

      const result = await issueReceiptHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
      expect(receiptRepo.store.size).toBe(0);
    });

    it('allows a reception staff with receipts.manage to issue a receipt', async () => {
      finalizedSale.markPaid(CLOCK);
      const payment = Payment.createCompleted({
        id: PaymentId.create('pay_settled_02'),
        saleId: finalizedSale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(25, 'USD'),
        reference: 'REF-PAID-02',
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(payment.id.value, payment);

      const issueReceiptHandler = new IssueReceiptHandler(
        receiptRepo,
        saleRepo,
        paymentRepo,
        undefined,
        CLOCK,
        eventPublisher,
      );

      const command = new IssueReceiptCommand({
        saleId: finalizedSale.id.value,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_RECEIPTS_MANAGER,
      });

      const result = await issueReceiptHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().saleId).toBe(finalizedSale.id.value);
      expect(receiptRepo.store.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CROSS-AGGREGATE ROUTE MISMATCH & NESTED PARAMETER PROBING
  // ---------------------------------------------------------------------------
  describe('3. Cross-Aggregate Route Mismatch & Nested Resource Parameter Probing', () => {
    let saleA: Sale;
    let saleB: Sale;
    let paymentOfSaleB: Payment;

    beforeEach(() => {
      saleA = Sale.create({
        id: SaleId.create('sale_order_alpha'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd1' }),
      });
      saleA.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd1' }),
        description: 'Juice A',
        unitPrice: Money.create(20, 'USD'),
        quantity: 1,
      });
      saleA.finalize(CLOCK);
      saleRepo.store.set(saleA.id.value, saleA);

      saleB = Sale.create({
        id: SaleId.create('sale_order_beta'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd2' }),
      });
      saleB.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd2' }),
        description: 'Juice B',
        unitPrice: Money.create(30, 'USD'),
        quantity: 1,
      });
      saleB.finalize(CLOCK);
      saleRepo.store.set(saleB.id.value, saleB);

      paymentOfSaleB = Payment.createPending({
        id: PaymentId.create('pay_belongs_to_beta'),
        saleId: saleB.id,
        method: PaymentMethod.QR,
        amount: Money.create(30, 'USD'),
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(paymentOfSaleB.id.value, paymentOfSaleB);
    });

    it('rejects CompletePayment when paymentId belongs to Sale B but caller passed saleId A', async () => {
      const completeHandler = new CompletePaymentHandler(
        paymentRepo,
        saleRepo,
        CLOCK,
        eventPublisher,
        unitOfWork,
      );

      const command = new CompletePaymentCommand({
        paymentId: paymentOfSaleB.id.value,
        saleId: saleA.id.value, // Route mismatch probe
        reference: 'TXN-MISMATCH',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER,
      });

      const result = await completeHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(String(result.getError())).toContain('Payment does not belong to the specified Sale');

      // Invariants intact
      expect(paymentOfSaleB.status).toBe(PaymentStatus.PENDING);
      expect(saleA.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(saleB.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects CancelPayment when paymentId belongs to Sale B but caller passed saleId A', async () => {
      const cancelHandler = new CancelPaymentHandler(paymentRepo, saleRepo, CLOCK, eventPublisher);

      const command = new CancelPaymentCommand({
        paymentId: paymentOfSaleB.id.value,
        saleId: saleA.id.value, // Route mismatch probe
        reason: 'Cross-sale void probe',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER,
      });

      const result = await cancelHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(String(result.getError())).toContain('Payment does not belong to the specified Sale');
      expect(paymentOfSaleB.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects FailPayment when paymentId belongs to Sale B but caller passed saleId A', async () => {
      const failHandler = new FailPaymentHandler(paymentRepo, saleRepo, CLOCK, eventPublisher);

      const command = new FailPaymentCommand({
        paymentId: paymentOfSaleB.id.value,
        saleId: saleA.id.value, // Route mismatch probe
        reason: 'Bank decline',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER,
      });

      const result = await failHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect(String(result.getError())).toContain('Payment does not belong to the specified Sale');
      expect(paymentOfSaleB.status).toBe(PaymentStatus.PENDING);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. INFORMATION HIDING & NON-DISCLOSURE OF PROTECTED RELATED DATA
  // ---------------------------------------------------------------------------
  describe('4. Information Hiding & Error Boundary Protection', () => {
    let client1Sale: Sale;
    let client1Receipt: Receipt;

    beforeEach(() => {
      client1Sale = Sale.create({
        id: SaleId.create('sale_client1_confidential'),
        clientId: 'client_101',
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'd_conf',
        }),
      });
      client1Sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'd_conf',
        }),
        description: 'Private Service',
        unitPrice: Money.create(100, 'USD'),
        quantity: 1,
      });
      client1Sale.finalize(CLOCK);
      client1Sale.markPaid(CLOCK);
      saleRepo.store.set(client1Sale.id.value, client1Sale);

      const payment = Payment.createCompleted({
        id: PaymentId.create('pay_client1_settled'),
        saleId: client1Sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(100, 'USD'),
        reference: 'REF-CONF-101',
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(payment.id.value, payment);

      client1Receipt = Receipt.fromSettledSale(
        {
          sale: client1Sale,
          payments: [payment],
          receiptNumber: ReceiptNumber.create('REC-2026-000101'),
          clientSummary: {
            id: 'client_101',
            fullName: 'Alice Private',
          },
        },
        CLOCK,
      );
      receiptRepo.store.set(client1Receipt.id.value, client1Receipt);
    });

    it('returns SaleNotFoundException (yielding 404) when Client 2 queries Client 1 payments', async () => {
      const handler = new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo);

      const query = new GetPaymentsBySaleIdQuery({
        saleId: client1Sale.id.value,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_CLIENT_2, // Different client attempting to inspect payment history
      });

      const result = await handler.execute(query);
      expect(result.isFailure).toBe(true);
      // Masks the existence of Client 1's sale to prevent resource enumeration
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('returns SaleNotFoundException (yielding 404) when Client 2 queries Client 1 payment history', async () => {
      const handler = new GetSalePaymentHistoryHandler(paymentRepo, saleRepo);

      const query = new GetSalePaymentHistoryQuery({
        saleId: client1Sale.id.value,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_CLIENT_2,
      });

      const result = await handler.execute(query);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('returns ReceiptUnauthorizedException when Client 2 queries Client 1 receipt via sale nested endpoint', async () => {
      const handler = new GetReceiptBySaleHandler(receiptRepo, saleRepo);

      const query = new GetReceiptBySaleQuery({
        saleId: client1Sale.id.value,
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_CLIENT_2,
      });

      const result = await handler.execute(query);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
    });

    it('rejects cross-tenant probing of receipts without leaking foreign tenant financial data', async () => {
      const handler = new GetReceiptHandler(receiptRepo);

      const query = new GetReceiptQuery({
        receiptId: client1Receipt.id.value,
        tenantId: TENANT_B, // User from Tenant B probing Tenant A receipt
        currentUser: PRINCIPAL_TENANT_B_USER,
      });

      const result = await handler.execute(query);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
      expect(String(result.getError())).toContain('Cross-tenant access forbidden');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SOURCE-DOMAIN OWNERSHIP PRESERVATION (CreateSale & Source Validator Port)
  // ---------------------------------------------------------------------------
  describe('5. Source-Domain Ownership Preservation', () => {
    class MockSourceValidator implements SaleSourceValidatorPort {
      public shouldExist = true;
      public shouldBelong = true;

      async validateSource(params: { sourceType: unknown; sourceId: string }): Promise<{
        exists: boolean;
        belongsToContext?: boolean;
        isValid: boolean;
        errorMessage?: string;
      }> {
        if (!this.shouldExist) {
          return {
            exists: false,
            isValid: false,
            errorMessage: `Source ${params.sourceId} does not exist.`,
          };
        }
        if (!this.shouldBelong) {
          return {
            exists: true,
            belongsToContext: false,
            isValid: false,
            errorMessage: 'Source context mismatch.',
          };
        }
        return { exists: true, belongsToContext: true, isValid: true };
      }
    }

    it('validates upstream source existence through generic port without importing foreign domain entities', async () => {
      const sourceValidator = new MockSourceValidator();
      const handler = new CreateSaleHandler(saleRepo, CLOCK, eventPublisher, sourceValidator);

      // 1. Upstream entity does not exist -> SourceNotFoundException
      sourceValidator.shouldExist = false;
      const cmdFail = new CreateSaleCommand({
        currency: 'USD',
        tenantId: TENANT_A,
        source: {
          sourceType: 'DRINK',
          sourceId: 'drink_ghost_item',
        },
        currentUser: {
          id: 'usr_staff_1',
          tenantId: TENANT_A,
          roles: ['Owner'],
          permissions: ['sales.manage'],
        },
      });

      const resFail = await handler.execute(cmdFail);
      expect(resFail.isFailure).toBe(true);
      expect(resFail.getError()).toBeInstanceOf(SourceNotFoundException);

      // 2. Upstream entity belongs to mismatched context -> InvalidSaleSourceException
      sourceValidator.shouldExist = true;
      sourceValidator.shouldBelong = false;
      const resMismatch = await handler.execute(cmdFail);
      expect(resMismatch.isFailure).toBe(true);
      expect(resMismatch.getError()).toBeInstanceOf(InvalidSaleSourceException);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. INTERNAL TRUSTED WORKFLOW BOUNDARY (Coordination Service)
  // ---------------------------------------------------------------------------
  describe('6. Internal Trusted Workflow Boundary', () => {
    it('prohibits unauthorized callers from invoking payment coordination', async () => {
      const coordinationHandler = new CoordinateSalePaymentHandler(
        saleRepo,
        paymentRepo,
        CLOCK,
        eventPublisher,
      );

      const command = new CoordinateSalePaymentCommand({
        saleId: 'sale_coord_01',
        paymentId: 'pay_coord_01',
        tenantId: TENANT_A,
        currentUser: {
          id: 'unauthorized_guest',
          roles: ['Client'],
          permissions: [], // no payments.create / payments.manage
        },
      });

      await expect(coordinationHandler.execute(command)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('enforces strict cross-aggregate invariants in SalePaymentCoordinationService', async () => {
      const service = new SalePaymentCoordinationService(
        saleRepo,
        paymentRepo,
        CLOCK,
        eventPublisher,
      );

      const sale = Sale.create({
        id: SaleId.create('sale_coord_inv'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd_co' }),
      });
      sale.addItem({
        source: SourceReference.create({ sourceType: SourceType.INVENTORY_ITEM, sourceId: 'd_co' }),
        description: 'Towel',
        unitPrice: Money.create(50, 'USD'),
        quantity: 1,
      });
      sale.finalize(CLOCK);
      saleRepo.store.set(sale.id.value, sale);

      // Payment for different sale
      const foreignPayment = Payment.createCompleted({
        id: PaymentId.create('pay_foreign'),
        saleId: SaleId.create('different_sale_999'),
        method: PaymentMethod.CASH,
        amount: Money.create(50, 'USD'),
        reference: 'REF-F',
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(foreignPayment.id.value, foreignPayment);

      // Invariant: Mismatched saleId rejected
      const resMismatch = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: foreignPayment.id,
        tenantId: TENANT_A,
      });
      expect(resMismatch.isFailure).toBe(true);
      expect(resMismatch.getError()).toBeInstanceOf(PaymentSaleMismatchException);

      // Invariant: Pending payment cannot settle sale
      const pendingPayment = Payment.createPending({
        id: PaymentId.create('pay_pending_same'),
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(50, 'USD'),
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(pendingPayment.id.value, pendingPayment);

      const resPending = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: pendingPayment.id,
        tenantId: TENANT_A,
      });
      expect(resPending.isFailure).toBe(true);
      expect(resPending.getError()).toBeInstanceOf(PaymentNotCompletedException);

      // Invariant: Currency mismatch rejected
      const euroPayment = Payment.createCompleted({
        id: PaymentId.create('pay_euro'),
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(50, 'EUR'),
        reference: 'REF-EUR',
        tenantId: TENANT_A,
      });
      paymentRepo.store.set(euroPayment.id.value, euroPayment);

      const resCurrency = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: euroPayment.id,
        tenantId: TENANT_A,
      });
      expect(resCurrency.isFailure).toBe(true);
      expect(resCurrency.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      paymentRepo.store.delete(euroPayment.id.value);

      // Invariant: Insufficient partial payment cannot mark sale PAID
      const partialPayment = Payment.createCompleted(
        {
          id: PaymentId.create('pay_partial'),
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(20, 'USD'), // only 20 out of 50
          reference: 'REF-PARTIAL',
          tenantId: TENANT_A,
        },
        CLOCK,
      );
      paymentRepo.store.set(partialPayment.id.value, partialPayment);

      const resInsufficient = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: partialPayment.id,
        tenantId: TENANT_A,
      });
      expect(resInsufficient.isFailure).toBe(true);
      expect(resInsufficient.getError()).toBeInstanceOf(InsufficientPaymentException);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. TRANSACTION BOUNDARY PRESERVATION ON COORDINATED FINANCIAL CHANGES
  // ---------------------------------------------------------------------------
  describe('7. Transaction Boundary Preservation on Coordinated Financial Changes', () => {
    it('aborts coordinated payment completion when unitOfWork encounters a commit failure', async () => {
      const sale = Sale.create({
        id: SaleId.create('sale_atomic_rollback'),
        currency: 'USD',
        tenantId: TENANT_A,
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'd_atm',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'd_atm',
        }),
        description: 'Smoothie',
        unitPrice: Money.create(40, 'USD'),
        quantity: 1,
      });
      sale.finalize(CLOCK);
      saleRepo.store.set(sale.id.value, sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay_atomic_pend'),
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(40, 'USD'),
          tenantId: TENANT_A,
        },
        CLOCK,
      );
      paymentRepo.store.set(payment.id.value, payment);

      // Configure UnitOfWork to simulate database failure during commit
      unitOfWork.shouldFail = true;

      const completeHandler = new CompletePaymentHandler(
        paymentRepo,
        saleRepo,
        CLOCK,
        eventPublisher,
        unitOfWork,
      );

      const command = new CompletePaymentCommand({
        paymentId: payment.id.value,
        saleId: sale.id.value,
        reference: 'TXN-FAIL-01',
        tenantId: TENANT_A,
        currentUser: PRINCIPAL_PAYMENTS_MANAGER,
      });

      const result = await completeHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(String(result.getError())).toContain('Database transaction aborted');
      expect(unitOfWork.executed).toBe(true);

      // Zero post-commit events published
      expect(eventPublisher.events).toHaveLength(0);
    });
  });
});
