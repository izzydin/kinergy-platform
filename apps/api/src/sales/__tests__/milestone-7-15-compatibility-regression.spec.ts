import { Test, TestingModule } from '@nestjs/testing';
import {
  Sale,
  Payment,
  Receipt,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  ReceiptStatus,
  Money,
  SourceReference,
  SourceType,
  PaymentId,
  SaleId,
  ReceiptNumber,
  PaymentRepositoryPort,
  SaleRepositoryPort,
  ReceiptRepositoryPort,
  IUnitOfWork,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentCurrencyMismatchException,
  InvalidPaymentTransitionException,
  SaleNotFoundException,
  PaymentUnauthorizedException,
  SaleItem,
} from '@kinergy-platform/core';
import { PaymentsController } from '../controllers/payments.controller';
import { SalesController } from '../controllers/sales.controller';
import { ReceiptsController } from '../controllers/receipts.controller';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  RECEIPT_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

// ============================================================================
// IN-MEMORY COMPATIBILITY TEST DOUBLES
// ============================================================================

class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public items = new Map<string, Payment>();

  private clone(p: Payment): Payment {
    return Payment.reconstitute({
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
    });
  }

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const item = this.items.get(key);
    return item ? this.clone(item) : null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.items.values())
      .filter((p) => p.saleId.value === key)
      .map((p) => this.clone(p));
  }

  async save(payment: Payment): Promise<void> {
    this.items.set(payment.id.value, this.clone(payment));
  }

  async count(): Promise<number> {
    return this.items.size;
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public items = new Map<string, Sale>();

  private clone(sale: Sale): Sale {
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      status: sale.status,
      source: sale.sourceReference ?? undefined,
      items: sale.items.map((i) =>
        SaleItem.reconstitute({
          id: i.id,
          saleId: i.saleId,
          source: i.source,
          description: i.description,
          skuOrCode: i.skuOrCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          subtotal: i.subtotal,
          discountTotal: i.discountTotal,
          total: i.total,
        }),
      ),
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      cancellationReason: sale.cancellationReason ?? undefined,
      cancelledAt: sale.cancelledAt ?? undefined,
      completedAt: sale.completedAt ?? undefined,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      version: sale.version,
    });
  }

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const item = this.items.get(key);
    return item ? this.clone(item) : null;
  }

  async save(sale: Sale): Promise<void> {
    this.items.set(sale.id.value, this.clone(sale));
  }
}

class InMemoryReceiptRepository implements ReceiptRepositoryPort {
  public items = new Map<string, Receipt>();
  private sequenceCounter = 0;

  async findById(id: string): Promise<Receipt | null> {
    return this.items.get(id.trim()) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Receipt | null> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    for (const r of this.items.values()) {
      if (r.saleId.value === key) return r;
    }
    return null;
  }

  async findByReceiptNumber(receiptNumber: string): Promise<Receipt | null> {
    const key = receiptNumber.trim();
    for (const r of this.items.values()) {
      if (r.receiptNumber.value === key) return r;
    }
    return null;
  }

  async save(receipt: Receipt): Promise<void> {
    this.items.set(receipt.id.value, receipt);
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  async getNextSequence(): Promise<number> {
    this.sequenceCounter += 1;
    return this.sequenceCounter;
  }

  async getNextReceiptNumber(_tenantId: string, year: number): Promise<ReceiptNumber> {
    this.sequenceCounter += 1;
    return ReceiptNumber.create(`REC-${year}-${String(this.sequenceCounter).padStart(6, '0')}`);
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public shouldFail = false;

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.shouldFail) {
      throw new Error('Database transaction aborted by unit of work failure simulation.');
    }
    return work();
  }
}

// ============================================================================
// REGRESSION & COMPATIBILITY AUDIT SUITE
// ============================================================================

describe('Milestone 7.15 API & Cross-Module Compatibility Regression Audit', () => {
  const tenantId = 'tenant_kinergy_main';

  const managerUser: AuthenticatedUserPayload = {
    id: 'usr_mgr_001',
    email: 'manager@kinergy.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: [
      'payments.create',
      'payments.read',
      'payments.manage',
      'sales.create',
      'sales.read',
      'receipts.manage',
      'receipts.read',
    ],
    tenantId,
  };

  const cashierUser: AuthenticatedUserPayload = {
    id: 'usr_cashier_002',
    email: 'cashier@kinergy.com',
    status: 'ACTIVE',
    roles: ['Receptionist'],
    permissions: ['payments.create', 'payments.read', 'sales.read', 'receipts.read'],
    tenantId,
  };

  const clientUser: AuthenticatedUserPayload = {
    id: 'usr_client_003',
    email: 'client@kinergy.com',
    status: 'ACTIVE',
    roles: ['Client'],
    permissions: [],
    tenantId,
  };

  let paymentsController: PaymentsController;
  let salesController: SalesController;
  let receiptsController: ReceiptsController;

  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let receiptRepo: InMemoryReceiptRepository;
  let unitOfWork: MockUnitOfWork;

  const createSaleWithStatus = (
    status: SaleStatus,
    amount: number = 100.0,
    currency: string = 'USD',
  ): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_item_protein_01',
        sourceCode: 'PROTEIN-VANILLA',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv_item_protein_01',
      }),
      description: 'Protein Shake Powder',
      quantity: 1,
      unitPrice: Money.create(amount, currency),
    });

    if (status !== SaleStatus.DRAFT) {
      sale.finalize();
    }
    if (status === SaleStatus.CANCELLED) {
      sale.cancel('Order cancelled by customer');
    }
    if (status === SaleStatus.PAID) {
      sale.markPaid();
    }
    if (status === SaleStatus.PARTIALLY_PAID) {
      sale.markPartiallyPaid();
    }

    saleRepo.items.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    receiptRepo = new InMemoryReceiptRepository();
    unitOfWork = new MockUnitOfWork();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController, SalesController, ReceiptsController],
      providers: [
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: RECEIPT_REPOSITORY_TOKEN, useValue: receiptRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    paymentsController = module.get<PaymentsController>(PaymentsController);
    salesController = module.get<SalesController>(SalesController);
    receiptsController = module.get<ReceiptsController>(ReceiptsController);
  });

  // ==========================================================================
  // 1. ROUTE REUSE & ALIAS RESOLUTION
  // ==========================================================================
  describe('1. Route Reuse & Alias Path Compatibility', () => {
    it('proves POST /sales/:saleId/payments and POST /payments resolve identical canonical behavior', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      // Call via nested path signature
      const nestedRes = await paymentsController.recordPayment(
        sale.id.value,
        {
          method: PaymentMethod.CASH,
          amount: 50.0,
        },
        managerUser,
      );

      expect(nestedRes.saleId).toBe(sale.id.value);
      expect(nestedRes.amount.formatted).toBe('50.00');
      expect(nestedRes.status).toBe(PaymentStatus.COMPLETED);

      // Call via root alias signature (saleId in body)
      const rootRes = await paymentsController.recordPayment(
        undefined as unknown as string,
        {
          saleId: sale.id.value,
          method: PaymentMethod.CASH,
          amount: 50.0,
        },
        managerUser,
      );

      expect(rootRes.saleId).toBe(sale.id.value);
      expect(rootRes.amount.formatted).toBe('50.00');
      expect(rootRes.status).toBe(PaymentStatus.COMPLETED);

      // Sale should now be fully PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('proves SalesController.coordinatePayment operates harmoniously on settled Payments without route duplication', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 80.0);

      // Create pre-existing settled payment directly in repo
      const payment = Payment.createCompleted({
        saleId: sale.id,
        tenantId,
        method: PaymentMethod.CASH,
        amount: Money.create(80.0, 'USD'),
      });
      await paymentRepo.save(payment);

      // Invoke SalesController coordination
      const coordinatedSale = await salesController.coordinatePayment(
        sale.id.value,
        { paymentId: payment.id.value },
        managerUser,
      );

      expect(coordinatedSale.id).toBe(sale.id.value);
      expect(coordinatedSale.status).toBe(SaleStatus.PAID);
    });
  });

  // ==========================================================================
  // 2. SALE LIFECYCLE & SOURCE RULES IN PAYMENT CREATION
  // ==========================================================================
  describe('2. Sale Lifecycle Preconditions & Currency Homogeneity', () => {
    it('strictly forbids creating a payment for a DRAFT sale (must be finalized)', async () => {
      const draftSale = createSaleWithStatus(SaleStatus.DRAFT, 100.0);

      await expect(
        paymentsController.recordPayment(
          draftSale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          managerUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });

    it('strictly forbids creating a payment for a CANCELLED sale', async () => {
      const cancelledSale = createSaleWithStatus(SaleStatus.CANCELLED, 100.0);

      await expect(
        paymentsController.recordPayment(
          cancelledSale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          managerUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });

    it('strictly forbids creating a payment for an already PAID sale', async () => {
      const paidSale = createSaleWithStatus(SaleStatus.PAID, 100.0);

      await expect(
        paymentsController.recordPayment(
          paidSale.id.value,
          { method: PaymentMethod.CASH, amount: 50.0 },
          managerUser,
        ),
      ).rejects.toThrow(SaleNotPayableException);
    });

    it('strictly rejects currency mismatch between Sale and Payment tender', async () => {
      const saleUSD = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0, 'USD');

      await expect(
        paymentsController.recordPayment(
          saleUSD.id.value,
          { method: PaymentMethod.CASH, amount: 100.0, currency: 'EUR' },
          managerUser,
        ),
      ).rejects.toThrow(PaymentCurrencyMismatchException);
    });

    it('strictly rejects overpayment exceeding remaining unpaid balance', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 50.0);

      await expect(
        paymentsController.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 50.01 },
          managerUser,
        ),
      ).rejects.toThrow(PaymentOverpaymentException);
    });
  });

  // ==========================================================================
  // 3. PAYMENT QUERYING & SALE ISOLATION
  // ==========================================================================
  describe('3. Payment Querying & Deterministic Tie-Breaking', () => {
    it('guarantees payment list for Sale A contains zero records from Sale B', async () => {
      const saleA = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const saleB = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      await paymentsController.recordPayment(
        saleA.id.value,
        { method: PaymentMethod.CASH, amount: 30.0 },
        managerUser,
      );
      await paymentsController.recordPayment(
        saleB.id.value,
        { method: PaymentMethod.CASH, amount: 45.0 },
        managerUser,
      );

      const listA = await paymentsController.getPaymentsBySaleId(saleA.id.value, managerUser);
      const listB = await paymentsController.getPaymentsBySaleId(saleB.id.value, managerUser);

      expect(listA.length).toBe(1);
      expect(listA[0]!.saleId).toBe(saleA.id.value);
      expect(listA[0]!.amount.formatted).toBe('30.00');

      expect(listB.length).toBe(1);
      expect(listB[0]!.saleId).toBe(saleB.id.value);
      expect(listB[0]!.amount.formatted).toBe('45.00');
    });

    it('returns 404 when querying payment history for non-existent Sale', async () => {
      await expect(
        paymentsController.getPaymentsBySaleId('sale_non_existent_999', managerUser),
      ).rejects.toThrow(SaleNotFoundException);
    });
  });

  // ==========================================================================
  // 4. TRANSITION STATE MACHINE INTEGRITY
  // ==========================================================================
  describe('4. Lifecycle State Machine Domain Enforcement', () => {
    it('proves terminal COMPLETED payment strictly forbids fail or cancel transitions', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const res = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0 },
        managerUser,
      );

      expect(res.status).toBe(PaymentStatus.COMPLETED);

      // Attempt complete again
      await expect(paymentsController.completePayment(res.id, {}, managerUser)).rejects.toThrow(
        InvalidPaymentTransitionException,
      );

      // Attempt fail
      await expect(
        paymentsController.failPayment(res.id, { reason: 'Charge failed' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);

      // Attempt cancel
      await expect(
        paymentsController.cancelPayment(res.id, { reason: 'User cancelled' }, managerUser),
      ).rejects.toThrow(InvalidPaymentTransitionException);
    });

    it('transitions PENDING payment to FAILED without altering Sale state', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const res = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 100.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      expect(res.status).toBe(PaymentStatus.PENDING);

      const failRes = await paymentsController.failPayment(
        res.id,
        { reason: 'Customer device timed out' },
        managerUser,
      );

      expect(failRes.status).toBe(PaymentStatus.FAILED);

      // Sale remains open in PENDING_PAYMENT
      const saleAfterFail = await saleRepo.findById(sale.id);
      expect(saleAfterFail?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('transitions PENDING payment to CANCELLED without altering Sale state', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const res = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 100.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      expect(res.status).toBe(PaymentStatus.PENDING);

      const cancelRes = await paymentsController.cancelPayment(
        res.id,
        { reason: 'Cashier changed tender to physical cash' },
        managerUser,
      );

      expect(cancelRes.status).toBe(PaymentStatus.CANCELLED);

      // Sale remains open in PENDING_PAYMENT
      const saleAfterCancel = await saleRepo.findById(sale.id);
      expect(saleAfterCancel?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ==========================================================================
  // 5. COMPLETE PAYMENT & CROSS-AGGREGATE CONSISTENCY
  // ==========================================================================
  describe('5. CompletePayment Cross-Aggregate Orchestration & Atomicity', () => {
    it('advances Sale from PENDING_PAYMENT to PARTIALLY_PAID on partial completion', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      const p1 = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 40.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      const completeRes = await paymentsController.completePayment(p1.id, {}, managerUser);
      expect(completeRes.status).toBe(PaymentStatus.COMPLETED);

      const saleAfterP1 = await saleRepo.findById(sale.id);
      expect(saleAfterP1?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('advances Sale from PARTIALLY_PAID to PAID on final remaining completion', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      // Settle 40.0
      await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 40.0 },
        managerUser,
      );

      // Initiate 60.0 pending
      const p2 = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 60.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      // Complete 60.0
      const completeRes = await paymentsController.completePayment(p2.id, {}, managerUser);
      expect(completeRes.status).toBe(PaymentStatus.COMPLETED);

      const finalSale = await saleRepo.findById(sale.id);
      expect(finalSale?.status).toBe(SaleStatus.PAID);
    });

    it('rolls back aggregate changes if UnitOfWork persistence encounters transactional failure', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      const p = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 100.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      unitOfWork.shouldFail = true;

      await expect(paymentsController.completePayment(p.id, {}, managerUser)).rejects.toThrow(
        /Database transaction aborted/,
      );

      unitOfWork.shouldFail = false;

      // Persistence state must remain PENDING for Payment and PENDING_PAYMENT for Sale
      const paymentInRepo = await paymentRepo.findById(p.id);
      const saleInRepo = await saleRepo.findById(sale.id);

      expect(paymentInRepo?.status).toBe(PaymentStatus.PENDING);
      expect(saleInRepo?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ==========================================================================
  // 6. PHASE 1 IAM & PHASE 7.13 AUTHORIZATION MATRIX
  // ==========================================================================
  describe('6. Phase 1 IAM & Phase 7.13 Authorization Matrix', () => {
    it('prohibits Client role lacking payments.create from recording a payment', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      await expect(
        paymentsController.recordPayment(
          sale.id.value,
          { method: PaymentMethod.CASH, amount: 100.0 },
          clientUser,
        ),
      ).rejects.toThrow(PaymentUnauthorizedException);
    });

    it('prohibits unauthorized caller lacking payment permissions from completing a payment', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const p = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 100.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      await expect(paymentsController.completePayment(p.id, {}, clientUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('prohibits Cashier (lacks payments.manage) from cancelling a payment', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const p = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.QR, amount: 100.0, status: PaymentStatus.PENDING },
        managerUser,
      );

      await expect(paymentsController.cancelPayment(p.id, {}, cashierUser)).rejects.toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('strictly forbids cross-tenant payment retrieval', async () => {
      const foreignSale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);
      const p = await paymentsController.recordPayment(
        foreignSale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0 },
        managerUser,
      );

      const foreignUser: AuthenticatedUserPayload = {
        ...managerUser,
        tenantId: 'tenant_foreign_evil',
      };

      await expect(paymentsController.getPaymentById(p.id, foreignUser)).rejects.toThrow(
        /Forbidden|cross-tenant/i,
      );
    });
  });

  // ==========================================================================
  // 7. RECEIPT AGGREGATE AUTONOMY & RECOGNITION HARMONY
  // ==========================================================================
  describe('7. Receipt Aggregate Autonomy & Downstream Settlement Verification', () => {
    it('strictly prohibits issuing a Receipt for an unfinalized or partially paid Sale', async () => {
      const partialSale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      // Record partial payment
      await paymentsController.recordPayment(
        partialSale.id.value,
        { method: PaymentMethod.CASH, amount: 40.0 },
        managerUser,
      );

      // Receipt issuance should be rejected
      await expect(
        receiptsController.issueReceipt(partialSale.id.value, {}, managerUser),
      ).rejects.toThrow();
    });

    it('issues an immutable proof-of-purchase Receipt once Sale is fully settled via completed payments', async () => {
      const sale = createSaleWithStatus(SaleStatus.PENDING_PAYMENT, 100.0);

      // Record full cash payment
      const p = await paymentsController.recordPayment(
        sale.id.value,
        { method: PaymentMethod.CASH, amount: 100.0 },
        managerUser,
      );

      expect(p.status).toBe(PaymentStatus.COMPLETED);

      // Issue Receipt
      const receipt = await receiptsController.issueReceipt(sale.id.value, {}, managerUser);

      expect(receipt.saleId).toBe(sale.id.value);
      expect(receipt.status).toBe(ReceiptStatus.ISSUED);
      expect(receipt.total.formatted).toBe('100.00');
      expect(receipt.payments.length).toBe(1);
      expect(receipt.payments[0]?.paymentId).toBe(p.id);
      expect(receipt.payments[0]?.method).toBe(PaymentMethod.CASH);
      expect(receipt.payments[0]?.amount.formatted).toBe('100.00');
    });
  });
});
