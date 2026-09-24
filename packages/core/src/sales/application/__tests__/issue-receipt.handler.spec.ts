import { IssueReceiptHandler } from '../handlers/issue-receipt.handler';
import { ReprintReceiptHandler } from '../handlers/reprint-receipt.handler';
import { IssueReceiptCommand } from '../commands/issue-receipt.command';
import { ReprintReceiptCommand } from '../commands/reprint-receipt.command';
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
import { ReceiptIssuedEvent, ReceiptReprintedEvent } from '../../domain/events';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

import { InMemoryReceiptSequenceGenerator } from '../../infrastructure/services/in-memory-receipt-sequence.generator';

class InMemoryReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null> {
    const key = typeof receiptNumber === 'string' ? receiptNumber.trim() : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === key) {
        return receipt;
      }
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}

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

class InMemoryClientFacade implements ClientFacadePort {
  public clients = new Map<string, ClientSummaryPayload>();

  async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId.trim()) ?? null;
  }
}

class InMemoryEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Receipt Application Lifecycle — IssueReceiptHandler & ReprintReceiptHandler', () => {
  const baseTime = new Date('2026-09-24T12:00:00.000Z');
  const tenantId = 'tenant_prime_001';

  let receiptRepo: InMemoryReceiptRepository;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let clientFacade: InMemoryClientFacade;
  let eventPublisher: InMemoryEventPublisher;
  let clock: DeterministicClock;

  let issueHandler: IssueReceiptHandler;
  let reprintHandler: ReprintReceiptHandler;

  beforeEach(() => {
    receiptRepo = new InMemoryReceiptRepository();
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    clientFacade = new InMemoryClientFacade();
    eventPublisher = new InMemoryEventPublisher();
    clock = new DeterministicClock(baseTime);

    issueHandler = new IssueReceiptHandler(
      receiptRepo,
      saleRepo,
      paymentRepo,
      clientFacade,
      clock,
      eventPublisher,
    );

    reprintHandler = new ReprintReceiptHandler(receiptRepo, clock, eventPublisher);
  });

  const setupSettledSaleAndPayment = (
    saleId = 'sale_app_001',
    total = 100.0,
    status = SaleStatus.PAID,
    clientId = 'client_001',
  ): { sale: Sale; payment: Payment } => {
    const item = SaleItem.create({
      id: SaleItemId.create('item_app_01'),
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_101',
      }),
      description: 'Wellness Pack',
      quantity: 1,
      unitPrice: Money.create(total, 'USD'),
    });

    const moneyTotal = Money.create(total, 'USD');

    const sale = Sale.reconstitute({
      id: SaleId.create(saleId),
      tenantId,
      clientId: clientId ? clientId.trim() : undefined,
      status,
      currency: 'USD',
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_101',
      }),
      items: [item],
      orderDiscount: null,
      subtotal: moneyTotal,
      discountTotal: Money.zero('USD'),
      total: moneyTotal,
      version: 1,
      completedAt: status === SaleStatus.COMPLETED ? baseTime : undefined,
      cancelledAt: status === SaleStatus.CANCELLED ? baseTime : undefined,
      cancellationReason:
        status === SaleStatus.CANCELLED ? 'Client requested cancellation' : undefined,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
    saleRepo.save(sale);

    const payment = Payment.reconstitute({
      id: PaymentId.create(`pay_${saleId}`),
      tenantId,
      saleId: sale.id,
      method: PaymentMethod.QR,
      amount: moneyTotal,
      status: PaymentStatus.COMPLETED,
      reference: PaymentReference.create('QR_REF_999'),
      paidAt: baseTime,
      createdAt: baseTime,
      updatedAt: baseTime,
      version: 1,
    });
    paymentRepo.save(payment);

    clientFacade.clients.set(clientId, {
      id: clientId,
      referenceNumber: 'CLI-2026-0001',
      fullName: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+15551234',
    });

    return { sale, payment };
  };

  // ===========================================================================
  // 1. SUCCESSFUL ISSUANCE & IDEMPOTENCY
  // ===========================================================================
  describe('1. Successful Receipt Issuance & Idempotency', () => {
    it('should issue a Receipt for a settled PAID sale, persisting it and emitting ReceiptIssuedEvent', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_01', 120.0);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
        currentUser: {
          permissions: ['receipts.manage'],
          roles: ['Receptionist'],
        },
      });

      const result = await issueHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.receiptNumber).toBe('REC-2026-000001');
      expect(dto.saleId).toBe('sale_01');
      expect(dto.total.amount).toBe(120.0);
      expect(dto.clientSnapshot?.fullName).toBe('Alice Johnson');
      expect(dto.clientSnapshot?.referenceNumber).toBe('CLI-2026-0001');
      expect(dto.status).toBe('ISSUED');
      expect(dto.reprintCount).toBe(0);

      // Verify atomic persistence
      const persisted = await receiptRepo.findBySaleId('sale_01');
      expect(persisted).not.toBeNull();
      expect(persisted!.receiptNumber.value).toBe('REC-2026-000001');

      // Verify domain event emitted
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]).toBeInstanceOf(ReceiptIssuedEvent);
      const event = eventPublisher.publishedEvents[0] as ReceiptIssuedEvent;
      expect(event.payload.receiptNumber).toBe('REC-2026-000001');
      expect(event.payload.saleId).toBe('sale_01');
    });

    it('should be strictly idempotent: repeated issuance for the same sale returns the existing receipt', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_02', 80.0);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      // First issuance
      const firstResult = await issueHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      expect(firstResult.getValue().receiptNumber).toBe('REC-2026-000001');

      // Clear publisher to verify no duplicate event emitted
      eventPublisher.publishedEvents = [];

      // Second issuance (repeated)
      const secondResult = await issueHandler.execute(command);
      expect(secondResult.isSuccess).toBe(true);
      expect(secondResult.getValue().receiptNumber).toBe('REC-2026-000001');
      expect(secondResult.getValue().id).toBe(firstResult.getValue().id);

      // Verify store still has only 1 receipt
      expect(receiptRepo.store.size).toBe(1);
      // No duplicate event published
      expect(eventPublisher.publishedEvents.length).toBe(0);
    });

    it('should support walk-in / anonymous sales where client is null', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_walkin', 50.0, SaleStatus.PAID, '');
      // Sale without client
      const walkinSale = Sale.reconstitute({
        id: sale.id,
        tenantId,
        clientId: undefined,
        status: SaleStatus.PAID,
        currency: 'USD',
        source: sale.source,
        items: [...sale.items],
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: 1,
        createdAt: baseTime,
        updatedAt: baseTime,
      });
      await saleRepo.save(walkinSale);

      const command = new IssueReceiptCommand({
        saleId: walkinSale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().clientSnapshot).toBeNull();
      expect(result.getValue().total.amount).toBe(50.0);
    });
  });

  // ===========================================================================
  // 2. REJECTION SCENARIOS
  // ===========================================================================
  describe('2. Rejection Scenarios & Lifecycle Invariants', () => {
    it('should reject issuance if Sale is not found', async () => {
      const command = new IssueReceiptCommand({
        saleId: 'non_existent_sale',
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('concurrently issues receipts for 20 distinct sales with collision-free, gap-free sequences', async () => {
      const salesCount = 20;
      const sales = Array.from({ length: salesCount }, (_, idx) =>
        setupSettledSaleAndPayment(`sale_concurrent_${idx}`, 50.0),
      );

      const promises = sales.map(({ sale }) =>
        issueHandler.execute(
          new IssueReceiptCommand({
            saleId: sale.id.value,
            tenantId,
          }),
        ),
      );

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.isSuccess).toBe(true);
      }

      const receiptNumbers = results.map((r) => r.getValue().receiptNumber);
      const uniqueNumbers = new Set(receiptNumbers);
      expect(uniqueNumbers.size).toBe(salesCount);

      // Verify gap-free sequence progression
      const indices = receiptNumbers
        .map((num) => parseInt(num.replace('REC-2026-', ''), 10))
        .sort((a, b) => a - b);

      expect(indices[0]).toBe(1);
      expect(indices[salesCount - 1]).toBe(salesCount);
    });

    it('should reject issuance if cross-tenant isolation is violated', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_cross_tenant', 100.0);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId: 'different_tenant',
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
    });

    it('should reject issuance if caller lacks receipt permissions', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_unauth', 100.0);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
        currentUser: {
          permissions: ['inventory.read'],
          roles: ['Guest'],
        },
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptUnauthorizedException);
    });

    it('should reject issuance if Sale is in DRAFT status', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_draft', 100.0, SaleStatus.DRAFT);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
    });

    it('should reject issuance if Sale is in PENDING_PAYMENT status', async () => {
      const { sale } = setupSettledSaleAndPayment(
        'sale_pending',
        100.0,
        SaleStatus.PENDING_PAYMENT,
      );

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
    });

    it('should reject issuance if Sale is in CANCELLED status', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_cancelled', 100.0, SaleStatus.CANCELLED);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
    });

    it('should reject issuance if payment records are empty or unsettled', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_no_payments', 100.0);
      paymentRepo.store.clear(); // Remove payments

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
    });

    it('should reject issuance if payments do not cover the sale total (underpayment)', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_underpaid', 100.0);
      // Replace with underpaid payment ($60 on $100 total)
      paymentRepo.store.clear();
      const partialPayment = Payment.reconstitute({
        id: PaymentId.create('pay_partial'),
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(60.0, 'USD'),
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
        version: 1,
      });
      paymentRepo.save(partialPayment);

      const command = new IssueReceiptCommand({
        saleId: sale.id.value,
        tenantId,
      });

      const result = await issueHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);
    });
  });

  // ===========================================================================
  // 3. REPRINT HANDLER LIFECYCLE
  // ===========================================================================
  describe('3. ReprintReceiptHandler Lifecycle', () => {
    it('should record a duplicate reprint, increment reprintCount, update lastReprintedAt, and emit ReceiptReprintedEvent', async () => {
      const { sale } = setupSettledSaleAndPayment('sale_reprint', 100.0);

      // Issue receipt first
      const issueResult = await issueHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value, tenantId }),
      );
      expect(issueResult.isSuccess).toBe(true);
      const receiptId = issueResult.getValue().id;

      // Clear publisher
      eventPublisher.publishedEvents = [];

      // Advance clock by 1 hour
      clock.advance(60 * 60 * 1000);
      const reprintTime = clock.now();

      // Execute reprint
      const reprintCommand = new ReprintReceiptCommand({
        receiptId,
        tenantId,
        currentUser: {
          permissions: ['receipts.manage'],
          roles: ['Manager'],
        },
      });

      const reprintResult = await reprintHandler.execute(reprintCommand);
      expect(reprintResult.isSuccess).toBe(true);
      const dto = reprintResult.getValue();
      expect(dto.status).toBe('REPRINTED');
      expect(dto.reprintCount).toBe(1);
      expect(dto.lastReprintedAt).toBe(reprintTime.toISOString());

      // Verify domain event emitted
      expect(eventPublisher.publishedEvents.length).toBe(1);
      expect(eventPublisher.publishedEvents[0]).toBeInstanceOf(ReceiptReprintedEvent);
      const event = eventPublisher.publishedEvents[0] as ReceiptReprintedEvent;
      expect(event.payload.receiptId).toBe(receiptId);
      expect(event.payload.reprintCount).toBe(1);
    });

    it('should reject reprint if receipt is not found', async () => {
      const command = new ReprintReceiptCommand({
        receiptId: 'non_existent_rec',
        tenantId,
      });

      const result = await reprintHandler.execute(command);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ReceiptNotFoundException);
    });
  });
});
