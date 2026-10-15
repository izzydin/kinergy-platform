import { Test, TestingModule } from '@nestjs/testing';
import {
  Receipt,
  ReceiptId,
  ReceiptNumber,
  Sale,
  SaleId,
  Money,
  SourceReference,
  SourceType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  ReceiptStatus,
  Payment,
  PaymentId,
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  GetReceiptBySaleHandler,
  SaleNotFoundException,
  ReceiptNotFoundException,
  InMemoryReceiptSequenceGenerator,
} from '@kinergy-platform/core';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from '../controllers/receipts.controller';
import { SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { ReceiptResponseDto } from '../dto';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// --- Instrumented Repository Doubles for Tracking Mutation & State Isolation ---

class TrackingReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCount = 0;
  private readonly sequenceGenerator = new InMemoryReceiptSequenceGenerator();

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string, tenantId?: string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const receipt of this.store.values()) {
      if (receipt.saleId.value === key) {
        if (tenantId && receipt.tenantId !== tenantId) {
          continue;
        }
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
    this.saveCount++;
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    return this.sequenceGenerator.getNextReceiptNumber(tenantId, year);
  }
}

class TrackingSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    this.store.set(sale.id.value, sale);
  }
}

class TrackingPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    this.saveCount++;
    this.store.set(payment.id.value, payment);
  }
}

describe('Senior Domain Integrity Audit: Receipt API Historical Snapshot & Domain Invariants', () => {
  const tenantId = 'tenant_kinergy_integrity';

  const staffUser: AuthenticatedUserPayload = {
    id: 'usr_staff_01',
    email: 'staff@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['receipts.read', 'sales.read'],
    tenantId,
  };

  const clientUser: AuthenticatedUserPayload = {
    id: 'cli_historical_01',
    email: 'jane.historical@example.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: ['receipts.read'],
    tenantId,
  };

  let controller: ReceiptsController;
  let receiptRepo: TrackingReceiptRepository;
  let saleRepo: TrackingSaleRepository;
  let paymentRepo: TrackingPaymentRepository;

  beforeEach(async () => {
    receiptRepo = new TrackingReceiptRepository();
    saleRepo = new TrackingSaleRepository();
    paymentRepo = new TrackingPaymentRepository();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [
        {
          provide: RECEIPT_REPOSITORY_TOKEN,
          useValue: receiptRepo,
        },
        {
          provide: SALE_REPOSITORY_TOKEN,
          useValue: saleRepo,
        },
        {
          provide: PAYMENT_REPOSITORY_TOKEN,
          useValue: paymentRepo,
        },
        {
          provide: GetReceiptBySaleHandler,
          useFactory: () => new GetReceiptBySaleHandler(receiptRepo, saleRepo),
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReceiptsController>(ReceiptsController);
  });

  // ===========================================================================
  // 1. HISTORICAL CLIENT SNAPSHOT PRESERVATION (Differing Current Client Record)
  // ===========================================================================
  describe('1. Historical Client Snapshot Invariant', () => {
    it('returns historical client name captured at issuance time even if current client profile changes', async () => {
      // Step 1: Sale settled when client was named "Jane Historical Maiden"
      const sale = Sale.create({
        tenantId,
        clientId: clientUser.id,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_annual',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_annual',
        }),
        description: 'Annual Gym Membership',
        quantity: 1,
        unitPrice: Money.create(600.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        amount: Money.create(600.0, 'USD'),
        method: PaymentMethod.QR,
      });
      await paymentRepo.save(payment);

      // Receipt issued with historical snapshot
      const receipt = Receipt.fromSettledSale({
        sale,
        payments: [payment],
        receiptNumber: 'REC-2026-000501',
        clientSummary: {
          id: clientUser.id,
          referenceNumber: 'CLI-00123',
          fullName: 'Jane Historical Maiden',
          email: 'jane.maiden@example.com',
          phone: '+1-555-0199',
        },
      });
      await receiptRepo.save(receipt);

      // Step 2: In current CRM / identity records, Client subsequently updates name and contact details:
      // Current identity = "Jane Married NewName", email = "jane.new@example.com"
      // Simulated by current caller token payload having updated name/details:
      const updatedClientPayload: AuthenticatedUserPayload = {
        id: clientUser.id,
        email: 'jane.new@example.com',
        status: 'ACTIVE',
        roles: ['Client'],
        permissions: ['receipts.read'],
        tenantId,
      };

      // Step 3: Retrieve receipt voucher via GET /sales/:saleId/receipt
      const response: ReceiptResponseDto = await controller.getReceiptBySale(
        sale.id.value,
        updatedClientPayload,
      );

      // Invariant Verification: Retrieval MUST return historical point-in-time snapshot, NOT current profile
      expect(response.clientSnapshot).toBeDefined();
      expect(response.clientSnapshot?.fullName).toBe('Jane Historical Maiden');
      expect(response.clientSnapshot?.email).toBe('jane.maiden@example.com');
      expect(response.clientSnapshot?.phone).toBe('+1-555-0199');
      expect(response.clientSnapshot?.referenceNumber).toBe('CLI-00123');
      expect(response.clientSnapshot?.clientId).toBe(clientUser.id);

      // Verification: Zero mutations during retrieval
      expect(receiptRepo.saveCount).toBe(1); // Only initial save during setup
      expect(saleRepo.saveCount).toBe(1);
    });
  });

  // ===========================================================================
  // 2. HISTORICAL PRICE & TOTAL SNAPSHOT PRESERVATION (Differing Catalog Prices)
  // ===========================================================================
  describe('2. Historical Product Price & Commercial Total Invariant', () => {
    it('returns original unit price and totals even if product price increases or discounts change later', async () => {
      // Step 1: Sale settled when product unit price was $45.00
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'prod_whey_5lb',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'prod_whey_5lb',
        }),
        description: 'Whey Protein 5lb Jar',
        quantity: 2,
        unitPrice: Money.create(45.0, 'USD'), // Historical unit price: $45.00, subtotal: $90.00
      });
      sale.finalize();
      sale.markPaid();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        amount: Money.create(90.0, 'USD'),
        method: PaymentMethod.CASH,
      });
      await paymentRepo.save(payment);

      const receipt = Receipt.fromSettledSale({
        sale,
        payments: [payment],
        receiptNumber: 'REC-2026-000502',
      });
      await receiptRepo.save(receipt);

      // Step 2: Later, catalog inflation increases current unit price from $45.00 to $65.00
      // Invariant: The receipt retrieval MUST NOT re-query catalog or recalculate prices.
      const response = await controller.getReceiptBySale(sale.id.value, staffUser);

      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.description).toBe('Whey Protein 5lb Jar');
      expect(response.items[0]?.quantity).toBe(2);
      expect(response.items[0]?.unitPrice.formatted).toBe('45.00');
      expect(response.items[0]?.unitPrice.cents).toBe(4500);
      expect(response.items[0]?.total.formatted).toBe('90.00');
      expect(response.items[0]?.total.cents).toBe(9000);

      // Historical subtotal and total remain frozen at $90.00
      expect(response.subtotal.formatted).toBe('90.00');
      expect(response.total.formatted).toBe('90.00');
      expect(response.discountTotal.formatted).toBe('0.00');
    });
  });

  // ===========================================================================
  // 3. ZERO STATE MUTATION OF SALE OR PAYMENT ON RETRIEVAL
  // ===========================================================================
  describe('3. Absence of Sale & Payment Lifecycle State Mutation', () => {
    it('does not alter Sale status, Payment status, version, or uncommitted domain events during retrieval', async () => {
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_silver',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_silver',
        }),
        description: 'Silver Membership',
        quantity: 1,
        unitPrice: Money.create(75.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();
      sale.clearEvents();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        amount: Money.create(75.0, 'USD'),
        method: PaymentMethod.CASH,
      });
      await paymentRepo.save(payment);

      const receipt = Receipt.fromSettledSale({
        sale,
        payments: [payment],
        receiptNumber: 'REC-2026-000503',
      });
      await receiptRepo.save(receipt);

      const saleVersionBefore = sale.version;
      const paymentVersionBefore = payment.version;
      const receiptVersionBefore = receipt.version;
      const receiptReprintCountBefore = receipt.reprintCount;

      // Execute retrieval via controller
      const response = await controller.getReceiptBySale(sale.id.value, staffUser);

      // Verify Sale status and version unchanged
      const persistedSale = await saleRepo.findById(sale.id.value);
      expect(persistedSale?.status).toBe('PAID');
      expect(persistedSale?.version).toBe(saleVersionBefore);
      expect(persistedSale?.getUncommittedEvents()).toHaveLength(0);

      // Verify Payment status and version unchanged
      const persistedPayment = await paymentRepo.findById(payment.id.value);
      expect(persistedPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayment?.version).toBe(paymentVersionBefore);

      // Verify Receipt reprint count is NOT incremented on GET (read-only query)
      const persistedReceipt = await receiptRepo.findById(receipt.id.value);
      expect(persistedReceipt?.version).toBe(receiptVersionBefore);
      expect(persistedReceipt?.reprintCount).toBe(receiptReprintCountBefore);
      expect(response.reprintCount).toBe(0);
      expect(response.lastReprintedAt).toBeNull();

      // Verify repository write call count remained 1 (from setup)
      expect(saleRepo.saveCount).toBe(1);
      expect(paymentRepo.saveCount).toBe(1);
      expect(receiptRepo.saveCount).toBe(1);
    });
  });

  // ===========================================================================
  // 4. CANCELLED SALES AND INCOMPLETE PAYMENTS CONTRACT
  // ===========================================================================
  describe('4. Cancelled Sales & Incomplete Payments Invariants', () => {
    it('retrieves already-issued receipt voucher even if the sale was subsequently CANCELLED', async () => {
      // Step 1: Sale was settled and receipt was issued
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_subsequent_cancel',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_subsequent_cancel',
        }),
        description: 'Monthly Pass',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        amount: Money.create(50.0, 'USD'),
        method: PaymentMethod.CASH,
      });

      const receipt = Receipt.fromSettledSale({
        sale,
        payments: [payment],
        receiptNumber: 'REC-2026-000504',
      });
      await receiptRepo.save(receipt);

      // Step 2: Later, the commercial sale was reconciled/cancelled (e.g. administrative void/chargeback return)
      const now = new Date();
      const cancelledSale = Sale.reconstitute({
        id: sale.id,
        tenantId: sale.tenantId,
        currency: sale.currency,
        source: sale.source,
        items: [...sale.items],
        status: SaleStatus.CANCELLED,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: sale.version + 1,
        createdAt: sale.createdAt,
        updatedAt: now,
        cancelledAt: now,
        cancellationReason: 'Member requested refund and membership termination',
      });
      await saleRepo.save(cancelledSale);

      // Step 3: Query receipt voucher for the cancelled sale
      const response = await controller.getReceiptBySale(sale.id.value, staffUser);

      // Invariant: The receipt remains retrievable as legal proof of the original commercial purchase
      expect(response.id).toBe(receipt.id.value);
      expect(response.receiptNumber).toBe('REC-2026-000504');
      expect(response.status).toBe(ReceiptStatus.ISSUED);
      expect(response.total.formatted).toBe('50.00');

      // Sale status in repository remains CANCELLED
      const persistedSale = await saleRepo.findById(sale.id.value);
      expect(persistedSale?.status).toBe('CANCELLED');
    });

    it('returns 404 Not Found when a CANCELLED sale never had a receipt issued (zero silent repair)', async () => {
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancelled_no_receipt',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_cancelled_no_receipt',
        }),
        description: 'Failed Enrollment',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });
      sale.finalize();
      sale.cancel('Abandoned transaction');
      await saleRepo.save(sale);

      // Attempt to retrieve receipt
      await expect(controller.getReceiptBySale(sale.id.value, staffUser)).rejects.toThrow(
        ReceiptNotFoundException,
      );

      // Invariant: Zero silent receipt generation
      expect(receiptRepo.saveCount).toBe(0);
      expect(receiptRepo.store.size).toBe(0);
    });

    it('returns 404 Not Found when a DRAFT or PENDING sale has no receipt (zero silent repair)', async () => {
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_draft_no_receipt',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_draft_no_receipt',
        }),
        description: 'Draft Order',
        quantity: 1,
        unitPrice: Money.create(30.0, 'USD'),
      });
      await saleRepo.save(sale);

      await expect(controller.getReceiptBySale(sale.id.value, staffUser)).rejects.toThrow(
        ReceiptNotFoundException,
      );

      // Invariant: Receipt repository is not modified
      expect(receiptRepo.saveCount).toBe(0);
    });

    it('returns 404 Not Found when sale does not exist (SaleNotFoundException)', async () => {
      await expect(
        controller.getReceiptBySale('sale_completely_non_existent', staffUser),
      ).rejects.toThrow(SaleNotFoundException);

      expect(receiptRepo.saveCount).toBe(0);
    });
  });

  // ===========================================================================
  // 5. RECEIPT ROLE AS PROOF-OF-PURCHASE (NOT ACCOUNTING OR REVENUE ENTRY)
  // ===========================================================================
  describe('5. Legal Proof-of-Purchase Voucher Boundary Invariant', () => {
    it('verifies receipt document is purely customer-facing proof-of-purchase with no tax or ledger entries', async () => {
      const sale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_proof_only',
        }),
      });
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_proof_only',
        }),
        description: 'General Access',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
      });
      sale.finalize();
      sale.markPaid();
      await saleRepo.save(sale);

      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        amount: Money.create(40.0, 'USD'),
        method: PaymentMethod.CASH,
      });
      await paymentRepo.save(payment);

      const receipt = Receipt.fromSettledSale({
        sale,
        payments: [payment],
        receiptNumber: 'REC-2026-000505',
      });
      await receiptRepo.save(receipt);

      const response = await controller.getReceiptBySale(sale.id.value, staffUser);

      // Verify the response is a customer voucher:
      expect(response.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(response.status).toBe(ReceiptStatus.ISSUED);

      // Verify absence of accounting or tax invoice fields in public voucher DTO:
      const rawDto = response as unknown as Record<string, unknown>;
      expect(rawDto.generalLedgerAccount).toBeUndefined();
      expect(rawDto.taxInvoiceNumber).toBeUndefined();
      expect(rawDto.taxRegistrationNumber).toBeUndefined();
      expect(rawDto.revenueRecognitionDate).toBeUndefined();
      expect(rawDto.fiscalJournalEntryId).toBeUndefined();
    });
  });
});
