import { Prisma, PrismaClient, Receipt as PrismaReceiptModel } from '@prisma/client';
import { Receipt } from '../domain/receipt.aggregate';
import { ReceiptId } from '../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../domain/value-objects/receipt-number.vo';
import { ReceiptClientSnapshot } from '../domain/value-objects/receipt-client-snapshot.vo';
import { ReceiptItemSnapshot } from '../domain/value-objects/receipt-item-snapshot.vo';
import { ReceiptPaymentSnapshot } from '../domain/value-objects/receipt-payment-snapshot.vo';
import { ReceiptStatus } from '../domain/enums/receipt-status.enum';
import { Sale } from '../domain/sale.aggregate';
import { SaleId } from '../domain/value-objects/sale-id.vo';
import { SaleStatus } from '../domain/enums/sale-status.enum';
import { SaleItem } from '../domain/entities/sale-item.entity';
import { SaleItemId } from '../domain/value-objects/sale-item-id.vo';
import { Payment } from '../domain/payment.aggregate';
import { PaymentId } from '../domain/value-objects/payment-id.vo';
import { PaymentMethod } from '../domain/enums/payment-method.enum';
import { PaymentStatus } from '../domain/enums/payment-status.enum';
import { Money } from '../domain/value-objects/money.vo';
import { Discount } from '../domain/value-objects/discount.vo';
import { SourceReference } from '../domain/value-objects/source-reference.vo';
import { SourceType } from '../domain/enums/source-type.enum';
import { ReceiptDomainException, DuplicateReceiptException } from '../domain/exceptions';
import { PaymentReference } from '../domain/value-objects/payment-reference.vo';
import { ReceiptIssuanceRejectedException } from '../application/exceptions/receipt-issuance-rejected.exception';
import { SaleNotFoundException } from '../application/exceptions/sale-not-found.exception';
import { DeterministicClock } from '../domain/shared/clock';
import { DomainEvent } from '../domain/shared/domain-event';
import {
  IssueReceiptCommand,
  IssueReceiptHandler,
  GetReceiptQuery,
  GetReceiptByIdQuery,
  GetReceiptHandler,
  GetReceiptBySaleQuery,
  GetReceiptBySaleHandler,
} from '../application';
import {
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  SalesEventPublisherPort,
  ClientSummaryPayload,
} from '../application/ports';
import { InMemoryReceiptSequenceGenerator } from '../infrastructure/services/in-memory-receipt-sequence.generator';
import { PrismaReceiptMapper } from '../infrastructure/persistence/prisma/mappers/prisma-receipt.mapper';
import { PrismaReceiptRepository } from '../infrastructure/persistence/prisma/repositories/prisma-receipt.repository';

// ============================================================================
// Test Doubles
// ============================================================================

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
    if (receipt.version === 1) {
      for (const existing of this.store.values()) {
        if (
          existing.tenantId === receipt.tenantId &&
          existing.saleId.value === receipt.saleId.value
        ) {
          throw new DuplicateReceiptException(receipt.saleId.value, receipt.tenantId);
        }
      }
    }
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

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// Master Financial Domain QA Matrix for Receipt
// ============================================================================

describe('Receipt Financial-Domain Correctness Master QA Matrix (ADR-0110, ADR-0114, ADR-0117)', () => {
  const tenantId = 'tenant_kinergy_master_qa';
  const t0 = new Date('2026-09-24T12:00:00.000Z');
  let clock: DeterministicClock;
  let receiptRepo: InMemoryReceiptRepository;
  let saleRepo: InMemorySaleRepository;
  let paymentRepo: InMemoryPaymentRepository;
  let eventPublisher: MockSalesEventPublisher;
  let issueHandler: IssueReceiptHandler;

  beforeEach(() => {
    clock = new DeterministicClock(t0);
    receiptRepo = new InMemoryReceiptRepository();
    saleRepo = new InMemorySaleRepository();
    paymentRepo = new InMemoryPaymentRepository();
    eventPublisher = new MockSalesEventPublisher();
    issueHandler = new IssueReceiptHandler(
      receiptRepo,
      saleRepo,
      paymentRepo,
      undefined,
      clock,
      eventPublisher,
    );
  });

  // Helper factory for creating sales in specific lifecycle states
  const createTestSale = (params: {
    id?: string;
    status: SaleStatus;
    items?: SaleItem[];
    subtotal?: number;
    discountTotal?: number;
    total?: number;
    clientId?: string | null;
  }): Sale => {
    const saleId = SaleId.create(params.id ?? 'sale_qa_001');
    const source = SourceReference.create({
      sourceType: SourceType.TREATMENT_SESSION,
      sourceId: 'sess_qa_99',
    });

    const subtotalAmount = params.subtotal ?? params.total ?? 100.0;
    const discountAmount = params.discountTotal ?? 0.0;
    const totalAmount = params.total ?? subtotalAmount - discountAmount;

    const defaultItems = [
      SaleItem.create({
        id: SaleItemId.create('item_qa_01'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_qa_99',
        }),
        description: 'Standard Kinesiology Session',
        skuOrCode: 'KIN-STD',
        quantity: 1,
        unitPrice: Money.create(subtotalAmount, 'USD'),
      }),
    ];

    const items = params.items ?? defaultItems;
    const subtotal = Money.create(subtotalAmount, 'USD');
    const discountTotal = Money.create(discountAmount, 'USD');
    const total = Money.create(totalAmount, 'USD');

    return Sale.reconstitute({
      id: saleId,
      tenantId,
      clientId:
        params.clientId === undefined ? 'client_qa_master_01' : (params.clientId ?? undefined),
      status: params.status,
      currency: 'USD',
      source,
      items,
      orderDiscount: discountTotal.isPositive() ? Discount.fixed(discountTotal.amount) : null,
      subtotal,
      discountTotal,
      total,
      version: 1,
      completedAt: params.status === SaleStatus.COMPLETED ? t0 : undefined,
      cancelledAt: params.status === SaleStatus.CANCELLED ? t0 : undefined,
      cancellationReason:
        params.status === SaleStatus.CANCELLED ? 'Cancelled by QA test' : undefined,
      createdAt: t0,
      updatedAt: t0,
    });
  };

  // Helper factory for creating payments in specific lifecycle states
  const createTestPayment = (params: {
    id?: string;
    saleId: SaleId;
    status: PaymentStatus;
    amount?: number;
    method?: PaymentMethod;
    reference?: string | null;
  }): Payment => {
    return Payment.reconstitute({
      id: PaymentId.create(params.id ?? 'pay_qa_001'),
      tenantId,
      saleId: params.saleId,
      method: params.method ?? PaymentMethod.CASH,
      amount: Money.create(params.amount ?? 100.0, 'USD'),
      status: params.status,
      reference: params.reference ? PaymentReference.create(params.reference) : null,
      paidAt: params.status === PaymentStatus.COMPLETED ? t0 : null,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });
  };

  // ==========================================================================
  // 1. COMBINATORIAL SALE STATE X PAYMENT STATE MATRIX
  // ==========================================================================
  describe('1. Combinatorial Sale State x Payment State Matrix', () => {
    const allSaleStates: SaleStatus[] = [
      SaleStatus.DRAFT,
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
    ];

    const allPaymentStates: PaymentStatus[] = [
      PaymentStatus.PENDING,
      PaymentStatus.COMPLETED,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELLED,
    ];

    allSaleStates.forEach((saleStatus) => {
      allPaymentStates.forEach((paymentStatus) => {
        const isValid =
          (saleStatus === SaleStatus.PAID || saleStatus === SaleStatus.COMPLETED) &&
          paymentStatus === PaymentStatus.COMPLETED;

        if (isValid) {
          it(`[VALID COMBINATION] accepts Sale (${saleStatus}) + Payment (${paymentStatus})`, async () => {
            const sale = createTestSale({
              status: saleStatus,
              id: `sale_${saleStatus}_${paymentStatus}`,
            });
            const payment = createTestPayment({
              saleId: sale.id,
              status: paymentStatus,
              id: `pay_${saleStatus}_${paymentStatus}`,
            });

            await saleRepo.save(sale);
            await paymentRepo.save(payment);

            const result = await issueHandler.execute(
              new IssueReceiptCommand({ saleId: sale.id.value }),
            );

            expect(result.isSuccess).toBe(true);
            const receiptDto = result.getValue();
            expect(receiptDto.saleId).toBe(sale.id.value);
            expect(receiptDto.status).toBe(ReceiptStatus.ISSUED);
            expect(receiptRepo.store.size).toBe(1);

            // Invariant: Sale remains completely unchanged after issuance
            const persistedSale = await saleRepo.findById(sale.id);
            expect(persistedSale!.status).toBe(saleStatus);
            expect(persistedSale!.version).toBe(1);
            expect(persistedSale!.total.amount).toBe(100.0);

            // Invariant: Payment remains completely unchanged after issuance
            const persistedPayment = await paymentRepo.findById(payment.id);
            expect(persistedPayment!.status).toBe(paymentStatus);
            expect(persistedPayment!.version).toBe(1);
            expect(persistedPayment!.amount.amount).toBe(100.0);
          });
        } else {
          it(`[INVALID COMBINATION] rejects Sale (${saleStatus}) + Payment (${paymentStatus}) with zero receipt side-effects`, async () => {
            const sale = createTestSale({
              status: saleStatus,
              id: `sale_rej_${saleStatus}_${paymentStatus}`,
            });
            const payment = createTestPayment({
              saleId: sale.id,
              status: paymentStatus,
              id: `pay_rej_${saleStatus}_${paymentStatus}`,
            });

            await saleRepo.save(sale);
            await paymentRepo.save(payment);

            const result = await issueHandler.execute(
              new IssueReceiptCommand({ saleId: sale.id.value }),
            );

            expect(result.isFailure).toBe(true);
            expect(result.getError()).toBeInstanceOf(ReceiptIssuanceRejectedException);

            // Invariant: Zero receipts created or persisted
            expect(receiptRepo.store.size).toBe(0);
            expect(await receiptRepo.findBySaleId(sale.id)).toBeNull();

            // Invariant: Zero domain events published
            expect(eventPublisher.publishedEvents.length).toBe(0);

            // Invariant: Sale remains completely unchanged
            const persistedSale = await saleRepo.findById(sale.id);
            expect(persistedSale!.status).toBe(saleStatus);
            expect(persistedSale!.version).toBe(1);

            // Invariant: Payment remains completely unchanged
            const persistedPayment = await paymentRepo.findById(payment.id);
            expect(persistedPayment!.status).toBe(paymentStatus);
            expect(persistedPayment!.version).toBe(1);
          });
        }
      });
    });

    it('rejects issuance when Sale has zero payment records at all', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, id: 'sale_no_payments' });
      await saleRepo.save(sale);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));

      expect(result.isFailure).toBe(true);
      expect(receiptRepo.store.size).toBe(0);
    });

    it('rejects issuance when payments exist but total settled amount is less than sale total (underpayment)', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, id: 'sale_underpaid', total: 100.0 });
      const partialPayment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 80.0, // $80 < $100
      });

      await saleRepo.save(sale);
      await paymentRepo.save(partialPayment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));

      expect(result.isFailure).toBe(true);
      expect(String(result.getError())).toContain('Cannot issue receipt for underpaid sale');
      expect(receiptRepo.store.size).toBe(0);
    });
  });

  // ==========================================================================
  // 2. FINANCIAL VALUES PRECISION & BOUNDARY MATRIX
  // ==========================================================================
  describe('2. Financial Values Precision & Boundary Matrix', () => {
    it('handles positive subtotal, positive discount, and positive total deterministically ($150 - $25 = $125)', async () => {
      const item1 = SaleItem.create({
        id: SaleItemId.create('item_fin_1'),
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_1',
        }),
        description: 'Foam Roller',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      const item2 = SaleItem.create({
        id: SaleItemId.create('item_fin_2'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_1',
        }),
        description: 'Physical Therapy 60m',
        quantity: 1,
        unitPrice: Money.create(100.0, 'USD'),
      });

      const sale = createTestSale({
        status: SaleStatus.PAID,
        items: [item1, item2],
        subtotal: 150.0,
        discountTotal: 25.0,
        total: 125.0,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 125.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.subtotal.amount).toBe(150.0);
      expect(receipt.subtotal.cents).toBe(15000);
      expect(receipt.discountTotal.amount).toBe(25.0);
      expect(receipt.discountTotal.cents).toBe(2500);
      expect(receipt.total.amount).toBe(125.0);
      expect(receipt.total.cents).toBe(12500);
    });

    it('handles zero discount ($100 subtotal, $0 discount, $100 total)', async () => {
      const sale = createTestSale({
        status: SaleStatus.PAID,
        subtotal: 100.0,
        discountTotal: 0.0,
        total: 100.0,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 100.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.discountTotal.amount).toBe(0.0);
      expect(receipt.discountTotal.cents).toBe(0);
      expect(receipt.total.amount).toBe(100.0);
    });

    it('handles maximum valid discount (100% discount: $100 subtotal, $100 discount, $0 total)', async () => {
      const sale = createTestSale({
        status: SaleStatus.PAID,
        subtotal: 100.0,
        discountTotal: 100.0,
        total: 0.0,
      });
      // In 100% discount, zero payable total requires settled tender evidence covering >= $0
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 1.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.subtotal.amount).toBe(100.0);
      expect(receipt.discountTotal.amount).toBe(100.0);
      expect(receipt.total.amount).toBe(0.0);
      expect(receipt.total.cents).toBe(0);
    });

    it('enforces exact decimal precision without floating point drift on non-round prices ($19.99 + $49.95 + $10.05 = $79.99)', async () => {
      const item1 = SaleItem.create({
        id: SaleItemId.create('item_dec_1'),
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_a',
        }),
        description: 'Gym Shaker Bottle',
        quantity: 1,
        unitPrice: Money.create(19.99, 'USD'),
      });
      const item2 = SaleItem.create({
        id: SaleItemId.create('item_dec_2'),
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_b',
        }),
        description: 'Protein Tub 2lb',
        quantity: 1,
        unitPrice: Money.create(49.95, 'USD'),
      });
      const item3 = SaleItem.create({
        id: SaleItemId.create('item_dec_3'),
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_c',
        }),
        description: 'Electrolyte Pack',
        quantity: 1,
        unitPrice: Money.create(10.05, 'USD'),
      });

      // Sum: 1999 + 4995 + 1005 = 7999 cents ($79.99)
      const sale = createTestSale({
        status: SaleStatus.PAID,
        items: [item1, item2, item3],
        subtotal: 79.99,
        discountTotal: 0.0,
        total: 79.99,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 79.99,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.total.amount).toBe(79.99);
      expect(receipt.total.cents).toBe(7999);
      expect(receipt.items[0]!.unitPrice.cents).toBe(1999);
      expect(receipt.items[1]!.unitPrice.cents).toBe(4995);
      expect(receipt.items[2]!.unitPrice.cents).toBe(1005);
    });

    it('handles large valid commercial transactions ($999,999.99) within PostgreSQL DECIMAL(12, 2) boundary', async () => {
      const largeItem = SaleItem.create({
        id: SaleItemId.create('item_large_1'),
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'mem_corp_01',
        }),
        description: 'Enterprise Corporate Wellness Sponsorship (Annual)',
        quantity: 1,
        unitPrice: Money.create(999999.99, 'USD'),
      });

      const sale = createTestSale({
        status: SaleStatus.PAID,
        items: [largeItem],
        subtotal: 999999.99,
        discountTotal: 0.0,
        total: 999999.99,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 999999.99,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.total.cents).toBe(99999999);
      expect(receipt.total.amount).toBe(999999.99);
    });

    it('rejects issuance when mathematical reconciliation fails (e.g. subtotal !== sum of items)', () => {
      const item = ReceiptItemSnapshot.create({
        itemId: 'i1',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'src_1',
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
        subtotal: Money.create(50.0, 'USD'),
        total: Money.create(50.0, 'USD'),
      });

      const payment = ReceiptPaymentSnapshot.create({
        paymentId: 'p1',
        method: PaymentMethod.CASH,
        amount: Money.create(60.0, 'USD'),
        status: PaymentStatus.COMPLETED,
      });

      expect(() => {
        Receipt.create(
          {
            tenantId,
            saleId: 'sale_err_1',
            receiptNumber: 'REC-2026-000001',
            saleReference: 'REF-01',
            items: [item],
            subtotal: Money.create(60.0, 'USD'), // Item is 50.0, subtotal is 60.0 (mismatch!)
            total: Money.create(60.0, 'USD'),
            payments: [payment],
          },
          clock,
        );
      }).toThrow(ReceiptDomainException);
    });
  });

  // ==========================================================================
  // 3. ITEMS & LINE ITEM SNAPSHOTS
  // ==========================================================================
  describe('3. Line Items & Snapshot Preservation Matrix', () => {
    it('accurately captures multi-item sales with quantities and item-level discounts', async () => {
      const item1 = SaleItem.create({
        id: SaleItemId.create('line_1'),
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'inv_tape',
        }),
        description: 'Kinesiology Tape (Black)',
        quantity: 3,
        unitPrice: Money.create(15.0, 'USD'), // subtotal = 45.0
      });
      const item2 = SaleItem.create({
        id: SaleItemId.create('line_2'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_rehab',
        }),
        description: 'Rehabilitation Session 45m',
        quantity: 1,
        unitPrice: Money.create(75.0, 'USD'), // subtotal = 75.0
      });

      const sale = createTestSale({
        status: SaleStatus.PAID,
        items: [item1, item2],
        subtotal: 120.0,
        discountTotal: 0.0,
        total: 120.0,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 120.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      const receipt = result.getValue();
      expect(receipt.itemCount).toBe(2);
      expect(receipt.items[0]!.description).toBe('Kinesiology Tape (Black)');
      expect(receipt.items[0]!.quantity).toBe(3);
      expect(receipt.items[0]!.unitPrice.amount).toBe(15.0);
      expect(receipt.items[0]!.subtotal.amount).toBe(45.0);
      expect(receipt.items[1]!.description).toBe('Rehabilitation Session 45m');
      expect(receipt.items[1]!.quantity).toBe(1);
      expect(receipt.items[1]!.subtotal.amount).toBe(75.0);
    });

    it('proves snapshot preservation: modifying original Sale items list leaves receipt items completely frozen', async () => {
      const originalItem = SaleItem.create({
        id: SaleItemId.create('line_orig'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_1',
        }),
        description: 'Deep Tissue Massage 60m',
        quantity: 1,
        unitPrice: Money.create(90.0, 'USD'),
      });

      const sale = createTestSale({
        status: SaleStatus.PAID,
        items: [originalItem],
        subtotal: 90.0,
        total: 90.0,
      });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 90.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      expect(result.isSuccess).toBe(true);

      // MUTATION: Original Sale has item swapped for a different service and price
      const replacedItem = SaleItem.create({
        id: SaleItemId.create('line_replaced'),
        source: SourceReference.create({
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_2',
        }),
        description: 'Executive Performance Assessment',
        quantity: 2,
        unitPrice: Money.create(250.0, 'USD'),
      });
      const untypedSale = sale as unknown as Record<string, unknown>;
      untypedSale['_items'] = [replacedItem];
      untypedSale['_subtotal'] = Money.create(500.0, 'USD');
      untypedSale['_total'] = Money.create(500.0, 'USD');
      await saleRepo.save(sale);

      // PROOF: Retrieve receipt again; item snapshots remain 100% frozen
      const retrieved = await receiptRepo.findBySaleId(sale.id);
      expect(retrieved!.itemCount).toBe(1);
      expect(retrieved!.items[0]!.description).toBe('Deep Tissue Massage 60m');
      expect(retrieved!.items[0]!.quantity).toBe(1);
      expect(retrieved!.items[0]!.unitPrice.amount).toBe(90.0);
      expect(retrieved!.total.amount).toBe(90.0);
    });
  });

  // ==========================================================================
  // 4. CLIENT REPRESENTATION
  // ==========================================================================
  describe('4. Client Representation Matrix', () => {
    it('captures registered client attributes into an immutable client snapshot', async () => {
      const clientSummary: ClientSummaryPayload = {
        id: 'client_reg_01',
        referenceNumber: 'CLI-2026-0042',
        fullName: 'Alexander Hamilton',
        email: 'alex.hamilton@treasury.gov',
        phone: '+1-212-555-0176',
      };

      const sale = createTestSale({ status: SaleStatus.PAID, clientId: clientSummary.id });
      const payment = createTestPayment({ saleId: sale.id, status: PaymentStatus.COMPLETED });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          clientSummary,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const receipt = result.getValue();
      expect(receipt.clientSnapshot).not.toBeNull();
      expect(receipt.clientSnapshot!.clientId).toBe('client_reg_01');
      expect(receipt.clientSnapshot!.referenceNumber).toBe('CLI-2026-0042');
      expect(receipt.clientSnapshot!.fullName).toBe('Alexander Hamilton');
      expect(receipt.clientSnapshot!.email).toBe('alex.hamilton@treasury.gov');
      expect(receipt.clientSnapshot!.phone).toBe('+1-212-555-0176');
    });

    it('supports anonymous walk-in sales without registered client (clientSnapshot is null)', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, clientId: null });
      const payment = createTestPayment({ saleId: sale.id, status: PaymentStatus.COMPLETED });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const result = await issueHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          clientSummary: null,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const receipt = result.getValue();
      expect(receipt.clientSnapshot).toBeNull();
      expect(receipt.status).toBe(ReceiptStatus.ISSUED);
    });

    it('proves client decoupling: external mutation of client profile leaves receipt snapshot frozen', async () => {
      const mutableClient = {
        id: 'client_mutable_01',
        referenceNumber: 'CLI-001',
        fullName: 'Original Customer Name',
        email: 'original@kinergy.com',
        phone: '+1-555-1111',
      };

      const sale = createTestSale({ status: SaleStatus.PAID, clientId: mutableClient.id });
      const payment = createTestPayment({ saleId: sale.id, status: PaymentStatus.COMPLETED });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      await issueHandler.execute(
        new IssueReceiptCommand({
          saleId: sale.id.value,
          clientSummary: mutableClient,
        }),
      );

      // External caller changes client object
      mutableClient.fullName = 'Updated Name After Issuance';
      mutableClient.email = 'updated@kinergy.com';

      const receipt = await receiptRepo.findBySaleId(sale.id);
      expect(receipt!.clientSnapshot!.fullName).toBe('Original Customer Name');
      expect(receipt!.clientSnapshot!.email).toBe('original@kinergy.com');
    });
  });

  // ==========================================================================
  // 5. PAYMENT & TENDER REPRESENTATION
  // ==========================================================================
  describe('5. Payment & Tender Representation Matrix', () => {
    it('accurately captures single CASH tender payment with drawer reference', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, total: 50.0 });
      const cashPayment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 50.0,
        method: PaymentMethod.CASH,
        reference: 'DRAWER-REGISTER-01',
      });

      await saleRepo.save(sale);
      await paymentRepo.save(cashPayment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      const receipt = result.getValue();

      expect(receipt.paymentMethod).toBe(PaymentMethod.CASH);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments.length).toBe(1);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[0]!.amount.amount).toBe(50.0);
      expect(receipt.payments[0]!.reference).toBe('DRAWER-REGISTER-01');
    });

    it('accurately captures single QR tender payment with transaction reference', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, total: 75.0 });
      const qrPayment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 75.0,
        method: PaymentMethod.QR,
        reference: 'QR-TXN-2026-998877',
      });

      await saleRepo.save(sale);
      await paymentRepo.save(qrPayment);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      const receipt = result.getValue();

      expect(receipt.paymentMethod).toBe(PaymentMethod.QR);
      expect(receipt.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(receipt.payments.length).toBe(1);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.QR);
      expect(receipt.payments[0]!.reference).toBe('QR-TXN-2026-998877');
    });

    it('accurately captures multi-tender split payments (CASH $40 + QR $60 = $100)', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, total: 100.0 });
      const pay1 = createTestPayment({
        id: 'pay_split_1',
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 40.0,
        method: PaymentMethod.CASH,
      });
      const pay2 = createTestPayment({
        id: 'pay_split_2',
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 60.0,
        method: PaymentMethod.QR,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(pay1);
      await paymentRepo.save(pay2);

      const result = await issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value }));
      const receipt = result.getValue();

      expect(receipt.payments.length).toBe(2);
      expect(receipt.payments[0]!.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[0]!.amount.amount).toBe(40.0);
      expect(receipt.payments[1]!.method).toBe(PaymentMethod.QR);
      expect(receipt.payments[1]!.amount.amount).toBe(60.0);
      expect(receipt.total.amount).toBe(100.0);
    });
  });

  // ==========================================================================
  // 6. IDEMPOTENCY & CONCURRENCY
  // ==========================================================================
  describe('6. Idempotency & Concurrency Matrix', () => {
    it('strictly guarantees idempotency: repeated issuance returns existing receipt without new sequence number', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, total: 100.0 });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 100.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const firstCall = await issueHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value }),
      );
      expect(firstCall.isSuccess).toBe(true);
      const firstReceipt = firstCall.getValue();

      // Second invocation
      const secondCall = await issueHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value }),
      );
      expect(secondCall.isSuccess).toBe(true);
      const secondReceipt = secondCall.getValue();

      expect(secondReceipt.id).toBe(firstReceipt.id);
      expect(secondReceipt.receiptNumber).toBe(firstReceipt.receiptNumber);
      expect(secondReceipt.issuedAt).toBe(firstReceipt.issuedAt);
      expect(receiptRepo.store.size).toBe(1);
    });

    it('safely handles concurrent issuance calls by returning the same receipt', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID, total: 100.0 });
      const payment = createTestPayment({
        saleId: sale.id,
        status: PaymentStatus.COMPLETED,
        amount: 100.0,
      });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const [res1, res2] = await Promise.all([
        issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value })),
        issueHandler.execute(new IssueReceiptCommand({ saleId: sale.id.value })),
      ]);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().receiptNumber).toBe(res2.getValue().receiptNumber);
      expect(receiptRepo.store.size).toBe(1);
    });
  });

  // ==========================================================================
  // 7. PERSISTENCE ROUND-TRIP & CONSTRAINT VERIFICATION
  // ==========================================================================
  describe('7. Persistence Round-Trip & Constraint Verification', () => {
    it('guarantees 100% fidelity across domain -> Prisma -> domain round-trip mapping', () => {
      const item = ReceiptItemSnapshot.create({
        itemId: 'it_persist_1',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_101',
        description: 'Massage Ball Set',
        quantity: 2,
        unitPrice: Money.create(15.5, 'USD'),
        subtotal: Money.create(31.0, 'USD'),
        total: Money.create(31.0, 'USD'),
      });

      const clientSnapshot = ReceiptClientSnapshot.create({
        clientId: 'cli_persist_1',
        fullName: 'Benjamin Franklin',
        email: 'ben@franklin.org',
      });

      const payment = ReceiptPaymentSnapshot.create({
        paymentId: 'pay_persist_1',
        method: PaymentMethod.QR,
        amount: Money.create(31.0, 'USD'),
        status: PaymentStatus.COMPLETED,
        reference: 'QR-TXN-1234',
      });

      const domainReceipt = Receipt.create(
        {
          id: 'rec_persist_uuid_01',
          tenantId,
          saleId: 'sale_persist_01',
          receiptNumber: 'REC-2026-000101',
          saleReference: 'REF-ORD-101',
          clientSnapshot,
          items: [item],
          subtotal: Money.create(31.0, 'USD'),
          discountTotal: Money.create(0.0, 'USD'),
          total: Money.create(31.0, 'USD'),
          payments: [payment],
        },
        clock,
      );

      // 1. Domain to Prisma Persistence Data
      const persistenceData = PrismaReceiptMapper.toPersistence(domainReceipt);
      expect(persistenceData.id).toBe('rec_persist_uuid_01');
      expect(persistenceData.receiptNumber).toBe('REC-2026-000101');
      expect(persistenceData.totalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(persistenceData.totalAmount.toFixed(2)).toBe('31.00');

      // 2. Simulated DB row to Domain
      const rawRecord = {
        ...persistenceData,
        clientSnapshot: persistenceData.clientSnapshot as object,
        itemsSnapshot: persistenceData.itemsSnapshot as object[],
        paymentsSnapshot: persistenceData.paymentsSnapshot as object[],
        createdAt: domainReceipt.createdAt,
        updatedAt: domainReceipt.updatedAt,
      };

      const reconstituted = PrismaReceiptMapper.toDomain(
        rawRecord as unknown as PrismaReceiptModel,
      );

      expect(reconstituted.id.value).toBe(domainReceipt.id.value);
      expect(reconstituted.receiptNumber.value).toBe(domainReceipt.receiptNumber.value);
      expect(reconstituted.total.cents).toBe(3100);
      expect(reconstituted.total.amount).toBe(31.0);
      expect(reconstituted.clientSnapshot!.fullName).toBe('Benjamin Franklin');
      expect(reconstituted.items.length).toBe(1);
      expect(reconstituted.items[0]!.description).toBe('Massage Ball Set');
      expect(reconstituted.payments[0]!.reference).toBe('QR-TXN-1234');
      expect(reconstituted.status).toBe(ReceiptStatus.ISSUED);
    });

    it('verifies PrismaReceiptRepository save and retrieve operations', async () => {
      const mockRawDb = new Map<string, PrismaReceiptModel>();
      type MockDbClient = {
        $transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
        $queryRawUnsafe: jest.Mock;
        receipt: {
          create: (args: { data: PrismaReceiptModel }) => Promise<PrismaReceiptModel>;
          findUnique: (args: {
            where: {
              id?: string;
              unique_tenant_sale_receipt?: { tenantId: string; saleId: string };
            };
          }) => Promise<PrismaReceiptModel | null>;
          findFirst: (args: {
            where: { saleId?: string; receiptNumber?: string };
          }) => Promise<PrismaReceiptModel | null>;
          updateMany: jest.Mock;
        };
      };

      const mockPrisma: MockDbClient = {
        $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma),
        $queryRawUnsafe: jest.fn(),
        receipt: {
          create: async ({ data }: { data: PrismaReceiptModel }) => {
            mockRawDb.set(data.id, data);
            return data;
          },
          findUnique: async ({
            where,
          }: {
            where: {
              id?: string;
              unique_tenant_sale_receipt?: { tenantId: string; saleId: string };
            };
          }) => {
            if (where.id) return mockRawDb.get(where.id) ?? null;
            if (where.unique_tenant_sale_receipt) {
              const { tenantId: tId, saleId: sId } = where.unique_tenant_sale_receipt;
              for (const r of mockRawDb.values()) {
                if (r.tenantId === tId && r.saleId === sId) return r;
              }
            }
            return null;
          },
          findFirst: async ({ where }: { where: { saleId?: string; receiptNumber?: string } }) => {
            if (where.saleId) {
              for (const r of mockRawDb.values()) {
                if (r.saleId === where.saleId) return r;
              }
            }
            if (where.receiptNumber) {
              for (const r of mockRawDb.values()) {
                if (r.receiptNumber === where.receiptNumber) return r;
              }
            }
            return null;
          },
          updateMany: jest.fn(),
        },
      };

      const repo = new PrismaReceiptRepository(mockPrisma as unknown as PrismaClient);

      const item = ReceiptItemSnapshot.create({
        itemId: 'i_repo_1',
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'inv_1',
        description: 'Foam Roller',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
        subtotal: Money.create(40.0, 'USD'),
        total: Money.create(40.0, 'USD'),
      });
      const payment = ReceiptPaymentSnapshot.create({
        paymentId: 'p_repo_1',
        method: PaymentMethod.CASH,
        amount: Money.create(40.0, 'USD'),
        status: PaymentStatus.COMPLETED,
      });

      const receipt = Receipt.create(
        {
          id: 'rec_repo_test_01',
          tenantId,
          saleId: 'sale_repo_test_01',
          receiptNumber: 'REC-2026-000777',
          saleReference: 'REF-777',
          items: [item],
          subtotal: Money.create(40.0, 'USD'),
          total: Money.create(40.0, 'USD'),
          payments: [payment],
        },
        clock,
      );

      // Save
      await repo.save(receipt);

      // Retrieve by ID
      const byId = await repo.findById(receipt.id);
      expect(byId).not.toBeNull();
      expect(byId!.receiptNumber.value).toBe('REC-2026-000777');

      // Retrieve by Sale ID
      const bySale = await repo.findBySaleId('sale_repo_test_01');
      expect(bySale).not.toBeNull();
      expect(bySale!.id.value).toBe('rec_repo_test_01');

      // Retrieve by Receipt Number
      const byNumber = await repo.findByReceiptNumber('REC-2026-000777');
      expect(byNumber).not.toBeNull();
      expect(byNumber!.total.amount).toBe(40.0);
    });
  });

  // ==========================================================================
  // 8. APPLICATION QUERY HANDLERS & ERROR MAPPING
  // ==========================================================================
  describe('8. Application Query Handlers & Error Mapping', () => {
    it('retrieves receipt via GetReceiptHandler using UUID and sequential receipt number', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID });
      const payment = createTestPayment({ saleId: sale.id, status: PaymentStatus.COMPLETED });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const issueResult = await issueHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value }),
      );
      const issuedDto = issueResult.getValue();

      const getHandler = new GetReceiptHandler(receiptRepo);

      // Query by ID
      const queryById = new GetReceiptByIdQuery({ receiptId: issuedDto.id });
      const resById = await getHandler.execute(queryById);
      expect(resById.isSuccess).toBe(true);
      expect(resById.getValue().id).toBe(issuedDto.id);

      // Query by Receipt Number
      const queryByNumber = new GetReceiptQuery({ receiptNumber: issuedDto.receiptNumber });
      const resByNumber = await getHandler.execute(queryByNumber);
      expect(resByNumber.isSuccess).toBe(true);
      expect(resByNumber.getValue().receiptNumber).toBe(issuedDto.receiptNumber);
    });

    it('retrieves receipt via GetReceiptBySaleHandler', async () => {
      const sale = createTestSale({ status: SaleStatus.PAID });
      const payment = createTestPayment({ saleId: sale.id, status: PaymentStatus.COMPLETED });

      await saleRepo.save(sale);
      await paymentRepo.save(payment);

      const issueResult = await issueHandler.execute(
        new IssueReceiptCommand({ saleId: sale.id.value }),
      );
      const issuedDto = issueResult.getValue();

      const getBySaleHandler = new GetReceiptBySaleHandler(receiptRepo, saleRepo);
      const query = new GetReceiptBySaleQuery({ saleId: sale.id.value });
      const result = await getBySaleHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe(issuedDto.id);
    });

    it('returns fail result with SaleNotFoundException when querying by non-existent sale ID', async () => {
      const getBySaleHandler = new GetReceiptBySaleHandler(receiptRepo, saleRepo);
      const query = new GetReceiptBySaleQuery({ saleId: 'sale_non_existent' });
      const result = await getBySaleHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });
  });
});
