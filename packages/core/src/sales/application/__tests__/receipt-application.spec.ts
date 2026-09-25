import { IssueReceiptHandler } from '../handlers/issue-receipt.handler';
import { GetReceiptHandler } from '../handlers/get-receipt.handler';
import { GetReceiptBySaleHandler } from '../handlers/get-receipt-by-sale.handler';
import { IssueReceiptCommand } from '../commands/issue-receipt.command';
import { GetReceiptQuery, GetReceiptByIdQuery } from '../queries/get-receipt.query';
import {
  GetReceiptBySaleQuery,
  GetReceiptBySaleIdQuery,
} from '../queries/get-receipt-by-sale.query';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { ClientFacadePort, ClientSummaryPayload } from '../ports/client-facade.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Receipt } from '../../domain/receipt.aggregate';
import { ReceiptId } from '../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../domain/value-objects/receipt-number.vo';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleItem } from '../../domain/entities/sale-item.entity';
import { SaleItemId } from '../../domain/value-objects/sale-item-id.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { PaymentReference } from '../../domain/value-objects/payment-reference.vo';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { Clock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { ReceiptNotFoundException } from '../exceptions/receipt-not-found.exception';
import { ReceiptUnauthorizedException } from '../exceptions/receipt-unauthorized.exception';
import { ReceiptIssuanceRejectedException } from '../exceptions/receipt-issuance-rejected.exception';
import { DuplicateReceiptException } from '../../domain/exceptions/duplicate-receipt.exception';
import { ReceiptDomainException } from '../../domain/exceptions/receipt-domain.exception';
import { InvalidMoneyException } from '../../domain/exceptions/invalid-money.exception';
import { ReceiptIssuedEvent } from '../../domain/events';
import { InMemoryReceiptSequenceGenerator } from '../../infrastructure/services/in-memory-receipt-sequence.generator';
import { SalesApplicationResult } from '../shared/sales-application-result';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

class MockReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public sequenceGenerator = new InMemoryReceiptSequenceGenerator();
  public errorToThrow: Error | null = null;
  public throwDuplicateOnSave = false;

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    if (this.errorToThrow) throw this.errorToThrow;
    if (this.throwDuplicateOnSave) {
      throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
    }
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    if (this.errorToThrow) throw this.errorToThrow;
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public errorToThrow: Error | null = null;

  async findById(id: SaleId | string): Promise<Sale | null> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.errorToThrow) throw this.errorToThrow;
    this.store.set(sale.id.value, sale);
  }
}

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public errorToThrow: Error | null = null;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    if (this.errorToThrow) throw this.errorToThrow;
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    if (this.errorToThrow) throw this.errorToThrow;
    this.store.set(payment.id.value, payment);
  }
}

class MockClientFacade implements ClientFacadePort {
  public clients = new Map<string, ClientSummaryPayload>();

  async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId.trim()) ?? null;
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Receipt Application Layer — End-to-End Orchestration & Boundary Tests', () => {
  const baseTime = new Date('2026-09-25T10:00:00.000Z');
  const tenantId = 'tenant_kinergy_prime';

  let receiptRepo: MockReceiptRepository;
  let saleRepo: MockSaleRepository;
  let paymentRepo: MockPaymentRepository;
  let clientFacade: MockClientFacade;
  let eventPublisher: MockEventPublisher;
  let clock: DeterministicClock;

  let issueReceiptHandler: IssueReceiptHandler;
  let getReceiptHandler: GetReceiptHandler;
  let getReceiptBySaleHandler: GetReceiptBySaleHandler;

  const getErrorMessage = (result: SalesApplicationResult<unknown>): string => {
    const err = result.getError();
    return err instanceof Error ? err.message : String(err);
  };

  beforeEach(() => {
    receiptRepo = new MockReceiptRepository();
    saleRepo = new MockSaleRepository();
    paymentRepo = new MockPaymentRepository();
    clientFacade = new MockClientFacade();
    eventPublisher = new MockEventPublisher();
    clock = new DeterministicClock(baseTime);

    issueReceiptHandler = new IssueReceiptHandler(
      receiptRepo,
      saleRepo,
      paymentRepo,
      clientFacade,
      clock,
      eventPublisher,
    );

    getReceiptHandler = new GetReceiptHandler(receiptRepo);
    getReceiptBySaleHandler = new GetReceiptBySaleHandler(receiptRepo, saleRepo);
  });

  const setupSettledSale = (params: {
    saleId?: string;
    total?: number;
    status?: SaleStatus;
    clientId?: string;
    currency?: string;
    description?: string;
  }) => {
    const saleId = params.saleId ?? 'sale_test_001';
    const total = params.total ?? 100.0;
    const status = params.status ?? SaleStatus.PAID;
    const clientId = params.clientId !== undefined ? params.clientId : 'client_101';
    const currency = params.currency ?? 'USD';
    const description = params.description ?? 'Monthly Gym Membership';

    const item = SaleItem.create({
      id: SaleItemId.create(`item_${saleId}`),
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold',
      }),
      description,
      quantity: 1,
      unitPrice: Money.create(total, currency),
    });

    const moneyTotal = Money.create(total, currency);

    const sale = Sale.reconstitute({
      id: SaleId.create(saleId),
      tenantId,
      clientId: clientId ? clientId.trim() : undefined,
      status,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold',
        sourceCode: `ORD-${saleId.toUpperCase()}`,
      }),
      items: [item],
      orderDiscount: null,
      subtotal: moneyTotal,
      discountTotal: Money.zero(currency),
      total: moneyTotal,
      version: 1,
      completedAt: status === SaleStatus.COMPLETED ? baseTime : undefined,
      cancelledAt: status === SaleStatus.CANCELLED ? baseTime : undefined,
      cancellationReason: status === SaleStatus.CANCELLED ? 'Customer request' : undefined,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
    saleRepo.save(sale);

    if (clientId) {
      clientFacade.clients.set(clientId, {
        id: clientId,
        referenceNumber: 'CLI-001',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+15559876',
      });
    }

    return sale;
  };

  const setupPayment = (params: {
    saleId: string;
    amount?: number;
    method?: PaymentMethod;
    status?: PaymentStatus;
    currency?: string;
  }) => {
    const amount = params.amount ?? 100.0;
    const method = params.method ?? PaymentMethod.QR;
    const status = params.status ?? PaymentStatus.COMPLETED;
    const currency = params.currency ?? 'USD';

    const payment = Payment.reconstitute({
      id: PaymentId.create(`pay_${params.saleId}_${Math.random().toString(36).substring(7)}`),
      tenantId,
      saleId: SaleId.create(params.saleId),
      method,
      amount: Money.create(amount, currency),
      status,
      reference: PaymentReference.create('REF-PAY-123'),
      paidAt: status === PaymentStatus.COMPLETED ? baseTime : null,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
    paymentRepo.save(payment);
    return payment;
  };

  // ===========================================================================
  // 1. VALID ISSUANCE
  // ===========================================================================
  describe('1. Valid Issuance Orchestration', () => {
    it('should successfully orchestrate receipt issuance for a settled PAID sale', async () => {
      const sale = setupSettledSale({ saleId: 'sale_paid_01', total: 150.0 });
      setupPayment({ saleId: sale.id.value, amount: 150.0 });

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
        currentUser: { permissions: ['receipts.manage'], roles: ['Receptionist'] },
      });

      const result = await issueReceiptHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.receiptNumber).toBe('REC-2026-000001');
      expect(dto.saleId).toBe('sale_paid_01');
      expect(dto.saleReference).toBe('ORD-SALE_PAID_01');
      expect(dto.total.amount).toBe(150.0);
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]!.description).toBe('Monthly Gym Membership');
      expect(dto.clientSnapshot?.fullName).toBe('Jane Doe');
      expect(dto.clientSnapshot?.email).toBe('jane@example.com');
      expect(dto.status).toBe('ISSUED');
      expect(dto.reprintCount).toBe(0);

      // Verify repository persistence
      const saved = await receiptRepo.findBySaleId(sale.id.value);
      expect(saved).not.toBeNull();
      expect(saved!.receiptNumber.value).toBe('REC-2026-000001');

      // Verify domain event emitted
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]).toBeInstanceOf(ReceiptIssuedEvent);
      const event = eventPublisher.publishedEvents[0] as ReceiptIssuedEvent;
      expect(event.payload.receiptNumber).toBe('REC-2026-000001');
      expect(event.payload.saleId).toBe('sale_paid_01');
    });

    it('should successfully issue a receipt for a COMPLETED sale', async () => {
      const sale = setupSettledSale({
        saleId: 'sale_completed_01',
        total: 75.0,
        status: SaleStatus.COMPLETED,
      });
      setupPayment({ saleId: sale.id.value, amount: 75.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().total.amount).toBe(75.0);
    });

    it('should support multi-tender split settlement (e.g. $40 Cash + $60 QR)', async () => {
      const sale = setupSettledSale({ saleId: 'sale_split_01', total: 100.0 });
      setupPayment({ saleId: sale.id.value, amount: 40.0, method: PaymentMethod.CASH });
      setupPayment({ saleId: sale.id.value, amount: 60.0, method: PaymentMethod.QR });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.payments).toHaveLength(2);
      expect(dto.payments[0]!.method).toBe('CASH');
      expect(dto.payments[0]!.amount.amount).toBe(40.0);
      expect(dto.payments[1]!.method).toBe('QR');
      expect(dto.payments[1]!.amount.amount).toBe(60.0);
      expect(dto.total.amount).toBe(100.0);
    });

    it('should support walk-in / anonymous sales with null clientSnapshot', async () => {
      const sale = setupSettledSale({
        saleId: 'sale_anon_01',
        total: 20.0,
        clientId: '',
      });
      setupPayment({ saleId: sale.id.value, amount: 20.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().clientSnapshot).toBeNull();
    });

    it('should allow caller to provide an explicit client-supplied receiptId', async () => {
      const customReceiptId = 'rec_custom_uuid_999';
      const sale = setupSettledSale({ saleId: 'sale_custom_id', total: 50.0 });
      setupPayment({ saleId: sale.id.value, amount: 50.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({
          receiptId: customReceiptId,
          saleId: sale.id.value,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe(customReceiptId);
    });
  });

  // ===========================================================================
  // 2. MISSING SALE
  // ===========================================================================
  describe('2. Missing Sale Validation', () => {
    it('should fail with SaleNotFoundException when the requested saleId does not exist', async () => {
      const command = new IssueReceiptCommand({
        saleId: 'non_existent_sale_999',
        tenantId,
      });

      const result = await issueReceiptHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toContain('non_existent_sale_999');
      expect(receiptRepo.store.size).toBe(0);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should fail when saleId is empty or whitespace only', async () => {
      const command = new IssueReceiptCommand({
        saleId: '   ',
        tenantId,
      });

      const result = await issueReceiptHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty');
    });
  });

  // ===========================================================================
  // 3. INVALID SALE STATE
  // ===========================================================================
  describe('3. Invalid Sale State Validation', () => {
    it('should reject issuance if Sale is in DRAFT status', async () => {
      const sale = setupSettledSale({
        saleId: 'sale_draft_state',
        total: 100.0,
        status: SaleStatus.DRAFT,
      });
      setupPayment({ saleId: sale.id.value, amount: 100.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('requires PAID or COMPLETED sale');
    });

    it('should reject issuance if Sale is in PENDING_PAYMENT status', async () => {
      const sale = setupSettledSale({
        saleId: 'sale_pending_state',
        total: 100.0,
        status: SaleStatus.PENDING_PAYMENT,
      });
      setupPayment({ saleId: sale.id.value, amount: 100.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('requires PAID or COMPLETED sale');
    });

    it('should reject issuance if Sale is in CANCELLED status', async () => {
      const sale = setupSettledSale({
        saleId: 'sale_cancelled_state',
        total: 100.0,
        status: SaleStatus.CANCELLED,
      });
      setupPayment({ saleId: sale.id.value, amount: 100.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('requires PAID or COMPLETED sale');
    });
  });

  // ===========================================================================
  // 4. INVALID PAYMENT STATE
  // ===========================================================================
  describe('4. Invalid Payment State Validation', () => {
    it('should reject issuance if no payment records exist for the sale', async () => {
      const sale = setupSettledSale({ saleId: 'sale_zero_payments', total: 100.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('No payment records found');
    });

    it('should reject issuance if payment records are only PENDING', async () => {
      const sale = setupSettledSale({ saleId: 'sale_pending_payment', total: 100.0 });
      setupPayment({
        saleId: sale.id.value,
        amount: 100.0,
        status: PaymentStatus.PENDING,
      });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('No COMPLETED payment tenders found');
    });

    it('should reject issuance if payments are FAILED or CANCELLED', async () => {
      const sale = setupSettledSale({ saleId: 'sale_failed_payments', total: 100.0 });
      setupPayment({
        saleId: sale.id.value,
        amount: 50.0,
        status: PaymentStatus.FAILED,
      });
      setupPayment({
        saleId: sale.id.value,
        amount: 50.0,
        status: PaymentStatus.CANCELLED,
      });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('No COMPLETED payment tenders found');
    });

    it('should reject issuance if settled payment total does not cover the sale total (underpayment)', async () => {
      const sale = setupSettledSale({ saleId: 'sale_underpaid', total: 100.0 });
      setupPayment({ saleId: sale.id.value, amount: 60.0 }); // $40 short

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
      expect(getErrorMessage(result)).toContain('does not cover payable sale total');
    });
  });

  // ===========================================================================
  // 5. DUPLICATE ISSUANCE & IDEMPOTENCY
  // ===========================================================================
  describe('5. Duplicate Issuance & Idempotency Rules', () => {
    it('should be strictly idempotent: repeated issuance for the same sale returns the existing receipt', async () => {
      const sale = setupSettledSale({ saleId: 'sale_idempotent_01', total: 80.0 });
      setupPayment({ saleId: sale.id.value, amount: 80.0 });

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      // First call
      const firstResult = await issueReceiptHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      const firstDto = firstResult.getValue();
      expect(firstDto.receiptNumber).toBe('REC-2026-000001');

      // Clear publisher to verify no secondary events
      eventPublisher.publishedEvents = [];

      // Second call (repeated)
      const secondResult = await issueReceiptHandler.execute(command);
      expect(secondResult.isSuccess).toBe(true);
      const secondDto = secondResult.getValue();

      expect(secondDto.id).toBe(firstDto.id);
      expect(secondDto.receiptNumber).toBe(firstDto.receiptNumber);
      expect(receiptRepo.store.size).toBe(1);
      expect(eventPublisher.publishedEvents).toHaveLength(0);
    });

    it('should gracefully recover and return the existing receipt if persistence throws DuplicateReceiptException', async () => {
      const sale = setupSettledSale({ saleId: 'sale_concurrent_race', total: 50.0 });
      setupPayment({ saleId: sale.id.value, amount: 50.0 });

      // First issue normally
      await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      // Now simulate a concurrent thread attempting to save
      receiptRepo.throwDuplicateOnSave = true;

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().saleId).toBe('sale_concurrent_race');
    });
  });

  // ===========================================================================
  // 6. REPOSITORY FAILURES
  // ===========================================================================
  describe('6. Repository Failure Handling', () => {
    it('should return failure result when saleRepository fails with a database error', async () => {
      saleRepo.errorToThrow = new Error('Database connection failed in saleRepository');

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: 'sale_err', tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Database connection failed in saleRepository');
    });

    it('should return failure result when paymentRepository fails with an I/O error', async () => {
      const sale = setupSettledSale({ saleId: 'sale_pay_err', total: 50.0 });
      paymentRepo.errorToThrow = new Error('Socket timeout in paymentRepository');

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Socket timeout in paymentRepository');
    });

    it('should return failure result when receiptRepository.save fails with a storage error', async () => {
      const sale = setupSettledSale({ saleId: 'sale_save_err', total: 50.0 });
      setupPayment({ saleId: sale.id.value, amount: 50.0 });
      receiptRepo.errorToThrow = new Error('Disk write error in receiptRepository.save');

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Disk write error in receiptRepository.save');
    });

    it('should return failure result when GetReceiptHandler repository fails', async () => {
      receiptRepo.errorToThrow = new Error('Postgres connection pool exhausted');

      const result = await getReceiptHandler.execute(
        new GetReceiptQuery({ receiptId: 'rec_pool_err', tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Postgres connection pool exhausted');
    });

    it('should return failure result when GetReceiptBySaleHandler repository fails', async () => {
      const sale = setupSettledSale({ saleId: 'sale_replica_err', total: 50.0 });
      receiptRepo.errorToThrow = new Error('Replica read failure');

      const result = await getReceiptBySaleHandler.execute(
        new GetReceiptBySaleQuery({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Replica read failure');
    });
  });

  // ===========================================================================
  // 7. DOMAIN VALIDATION FAILURE
  // ===========================================================================
  describe('7. Domain Validation Failure Preservation', () => {
    it('should preserve and fail with domain exception when tender payment currency does not match sale currency', async () => {
      const sale = setupSettledSale({ saleId: 'sale_usd', total: 100.0, currency: 'USD' });
      // Payment recorded in EUR instead of USD
      setupPayment({ saleId: sale.id.value, amount: 100.0, currency: 'EUR' });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidMoneyException);
      expect(getErrorMessage(result).toLowerCase()).toContain('currencies');
    });

    it('should preserve and fail with ReceiptDomainException when domain invariants fail during receipt construction', async () => {
      const sale = setupSettledSale({ saleId: 'sale_invalid_ref', total: 100.0, currency: 'USD' });
      setupPayment({ saleId: sale.id.value, amount: 100.0, currency: 'USD' });

      // Pass invalid empty/whitespace saleReference override to trigger ReceiptDomainException
      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          tenantId,
          saleReference: '   ',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptDomainException);
      expect(getErrorMessage(result)).toContain('saleReference');
    });
  });

  // ===========================================================================
  // 8. RETRIEVAL USE CASES (GetReceipt & GetReceiptBySale)
  // ===========================================================================
  describe('8. Retrieval Use Cases — GetReceipt & GetReceiptBySale', () => {
    let issuedReceiptId: string;
    let issuedReceiptNumber: string;
    let issuedSaleId: string;

    beforeEach(async () => {
      const sale = setupSettledSale({ saleId: 'sale_retrieve_01', total: 125.0 });
      setupPayment({ saleId: sale.id.value, amount: 125.0 });

      const result = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );
      expect(result.isSuccess).toBe(true);
      issuedReceiptId = result.getValue().id;
      issuedReceiptNumber = result.getValue().receiptNumber;
      issuedSaleId = sale.id.value;
    });

    describe('GetReceiptHandler', () => {
      it('should retrieve receipt by internal UUID (receiptId)', async () => {
        const query = new GetReceiptByIdQuery({
          receiptId: issuedReceiptId,
          tenantId,
          currentUser: { permissions: ['receipts.read'] },
        });

        const result = await getReceiptHandler.execute(query);

        expect(result.isSuccess).toBe(true);
        expect(result.getValue().id).toBe(issuedReceiptId);
        expect(result.getValue().receiptNumber).toBe(issuedReceiptNumber);
        expect(result.getValue().total.amount).toBe(125.0);
      });

      it('should retrieve receipt by human-readable sequential voucher number (receiptNumber)', async () => {
        const query = new GetReceiptQuery({
          receiptNumber: issuedReceiptNumber,
          tenantId,
        });

        const result = await getReceiptHandler.execute(query);

        expect(result.isSuccess).toBe(true);
        expect(result.getValue().id).toBe(issuedReceiptId);
        expect(result.getValue().receiptNumber).toBe(issuedReceiptNumber);
      });

      it('should fail when neither receiptId nor receiptNumber is provided', async () => {
        const query = new GetReceiptQuery({ tenantId });

        const result = await getReceiptHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(getErrorMessage(result)).toContain(
          'Either receiptId or receiptNumber must be provided',
        );
      });

      it('should fail with ReceiptNotFoundException when receipt does not exist', async () => {
        const query = new GetReceiptByIdQuery({
          receiptId: 'non_existent_rec_id',
          tenantId,
        });

        const result = await getReceiptHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(ReceiptNotFoundException);
      });

      it('should enforce multi-tenant isolation and reject cross-tenant receipt queries', async () => {
        const query = new GetReceiptByIdQuery({
          receiptId: issuedReceiptId,
          tenantId: 'different_tenant_999',
        });

        const result = await getReceiptHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
      });

      it('should enforce authorization and reject unauthorized callers lacking receipts.read', async () => {
        const query = new GetReceiptByIdQuery({
          receiptId: issuedReceiptId,
          tenantId,
          currentUser: { permissions: ['marketing.read'], roles: ['Guest'] },
        });

        const result = await getReceiptHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
      });
    });

    describe('GetReceiptBySaleHandler', () => {
      it('should retrieve receipt by associated saleId', async () => {
        const query = new GetReceiptBySaleIdQuery({
          saleId: issuedSaleId,
          tenantId,
          currentUser: { permissions: ['receipts.read'] },
        });

        const result = await getReceiptBySaleHandler.execute(query);

        expect(result.isSuccess).toBe(true);
        expect(result.getValue().id).toBe(issuedReceiptId);
        expect(result.getValue().saleId).toBe(issuedSaleId);
      });

      it('should fail when saleId is empty', async () => {
        const query = new GetReceiptBySaleQuery({ saleId: '', tenantId });

        const result = await getReceiptBySaleHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(getErrorMessage(result)).toContain('Sale ID cannot be empty');
      });

      it('should fail with SaleNotFoundException if sale does not exist', async () => {
        const query = new GetReceiptBySaleQuery({
          saleId: 'missing_sale_123',
          tenantId,
        });

        const result = await getReceiptBySaleHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      });

      it('should fail with ReceiptNotFoundException if sale exists but receipt was not yet issued', async () => {
        const unissuedSale = setupSettledSale({ saleId: 'sale_unissued_yet', total: 30.0 });

        const query = new GetReceiptBySaleQuery({
          saleId: unissuedSale.id.value,
          tenantId,
        });

        const result = await getReceiptBySaleHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(ReceiptNotFoundException);
      });

      it('should reject cross-tenant queries for GetReceiptBySale', async () => {
        const query = new GetReceiptBySaleQuery({
          saleId: issuedSaleId,
          tenantId: 'other_tenant_id',
        });

        const result = await getReceiptBySaleHandler.execute(query);

        expect(result.isFailure).toBe(true);
        expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
      });
    });
  });

  // ===========================================================================
  // 9. HISTORICAL SNAPSHOT IMMUTABILITY BEHAVIOR
  // ===========================================================================
  describe('9. Historical Snapshot Immutability Behavior', () => {
    it('guarantees that subsequent downstream changes to Client, Catalog, or Sale DO NOT mutate the issued Receipt snapshot', async () => {
      const initialClientName = 'Original Client Name';
      const initialItemDescription = 'Yearly Gold Pass';
      const initialTotal = 500.0;

      const sale = setupSettledSale({
        saleId: 'sale_historical_test',
        total: initialTotal,
        description: initialItemDescription,
        clientId: 'client_hist_01',
      });
      clientFacade.clients.set('client_hist_01', {
        id: 'client_hist_01',
        referenceNumber: 'CLI-HIST-01',
        fullName: initialClientName,
        email: 'original@example.com',
        phone: '+10000000',
      });
      setupPayment({ saleId: sale.id.value, amount: initialTotal });

      // 1. Issue Receipt
      const issueResult = await issueReceiptHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );
      expect(issueResult.isSuccess).toBe(true);
      const receiptId = issueResult.getValue().id;

      // 2. Simulate subsequent mutations in upstream modules
      // a) Client changes legal name and contact in Client Profile bounded context
      clientFacade.clients.set('client_hist_01', {
        id: 'client_hist_01',
        referenceNumber: 'CLI-HIST-01-CHANGED',
        fullName: 'Completely Mutated Name',
        email: 'mutated@example.com',
        phone: '+99999999',
      });

      // b) Upstream catalog / cart item description changes
      const mutatedItem = SaleItem.create({
        id: SaleItemId.create('item_mutated'),
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_gold',
        }),
        description: 'New Renamed Catalog Product 2027',
        quantity: 2,
        unitPrice: Money.create(1000.0, 'USD'),
      });
      const mutatedSale = Sale.reconstitute({
        id: sale.id,
        tenantId,
        clientId: sale.clientId,
        status: SaleStatus.COMPLETED,
        completedAt: baseTime,
        currency: 'USD',
        source: sale.source,
        items: [mutatedItem],
        orderDiscount: null,
        subtotal: Money.create(2000.0, 'USD'),
        discountTotal: Money.zero('USD'),
        total: Money.create(2000.0, 'USD'),
        version: 2,
        createdAt: baseTime,
        updatedAt: new Date(),
      });
      await saleRepo.save(mutatedSale);

      // c) Payments modified
      paymentRepo.store.clear();

      // 3. Query the Receipt via GetReceiptHandler
      const getResult = await getReceiptHandler.execute(
        new GetReceiptByIdQuery({ receiptId, tenantId }),
      );
      expect(getResult.isSuccess).toBe(true);
      const dto = getResult.getValue();

      // Verify permanent snapshot integrity
      expect(dto.clientSnapshot?.fullName).toBe(initialClientName);
      expect(dto.clientSnapshot?.email).toBe('original@example.com');
      expect(dto.clientSnapshot?.referenceNumber).toBe('CLI-HIST-01'); // Original snapshot
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0]!.description).toBe(initialItemDescription);
      expect(dto.items[0]!.unitPrice.amount).toBe(initialTotal);
      expect(dto.total.amount).toBe(initialTotal);
      expect(dto.payments).toHaveLength(1);
      expect(dto.payments[0]!.amount.amount).toBe(initialTotal);

      // 4. Query via GetReceiptBySaleHandler
      const getBySaleResult = await getReceiptBySaleHandler.execute(
        new GetReceiptBySaleQuery({ saleId: sale.id.value, tenantId }),
      );
      expect(getBySaleResult.isSuccess).toBe(true);
      expect(getBySaleResult.getValue().total.amount).toBe(initialTotal);
      expect(getBySaleResult.getValue().clientSnapshot?.fullName).toBe(initialClientName);
    });
  });
});
