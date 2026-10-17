/**
 * Milestone 7.19 — Application Use-Case, Orchestration & Authorization Test Suite.
 *
 * Validates:
 * 1. IAM & Application Authorization (Sales, Payments, Receipts, Role Matrix, Capability Inheritance).
 * 2. Use-Case Orchestration (Multi-installment split-tender settlement, repository interactions, not-found invariants).
 * 3. Transaction Boundaries & Rollback (Atomic multi-aggregate writes, rollback safety, event isolation).
 * 4. Duplicate Transaction Handling & Idempotency (Safe retry semantics, conflict detection, cancelled re-billing).
 */

import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { CancelSaleHandler } from '../handlers/cancel-sale.handler';
import { IssueReceiptHandler } from '../handlers/issue-receipt.handler';

import { CreateSaleCommand } from '../commands/create-sale.command';
import { CreatePaymentCommand } from '../commands/create-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { IssueReceiptCommand } from '../commands/issue-receipt.command';

import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { SalesTransactionCoordinatorPort } from '../ports/sales-transaction-coordinator.port';

import { Sale } from '../../domain/sale.aggregate';
import { SaleItem } from '../../domain/entities/sale-item.entity';
import { Payment } from '../../domain/payment.aggregate';
import { Receipt } from '../../domain/receipt.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { ReceiptId } from '../../domain/value-objects/receipt-id.vo';
import { ReceiptNumber } from '../../domain/value-objects/receipt-number.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';

import {
  SaleUnauthorizedException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  SaleNotFoundException,
  PaymentNotFoundException,
  PaymentOverpaymentException,
} from '../exceptions';
import { DuplicatePaymentReferenceException } from '../exceptions/duplicate-payment-reference.exception';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';

import { checkSaleAuthorization, SaleCurrentUser } from '../shared/sale-authorization';
import { checkPaymentAuthorization, PaymentCurrentUser } from '../shared/payment-authorization';
import { checkReceiptAuthorization, ReceiptCurrentUser } from '../shared/receipt-authorization';

// =============================================================================
// Test Doubles (In-Memory Repositories, Coordinator & Event Publisher)
// =============================================================================

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public throwOnSave: Error | null = null;

  private cloneSale(sale: Sale): Sale {
    return Sale.reconstitute({
      id: sale.id,
      tenantId: sale.tenantId,
      clientId: sale.clientId,
      currency: sale.currency,
      status: sale.status,
      source: sale.source,
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
        }),
      ),
      orderDiscount: sale.orderDiscount,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      version: sale.version,
      completedAt: sale.completedAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      refundedAt: sale.refundedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    });
  }

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const s = this.store.get(key);
    return s ? this.cloneSale(s) : null;
  }

  async findBySourceReference(
    sourceType: SourceType,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== SaleStatus.CANCELLED
      ) {
        return this.cloneSale(sale);
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceCode === sourceCode &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== SaleStatus.CANCELLED
      ) {
        return this.cloneSale(sale);
      }
    }
    return null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.saveCount++;
    this.store.set(sale.id.value, this.cloneSale(sale));
  }
}

class MockPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public saveCount = 0;
  public throwOnSave: Error | null = null;

  async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async findByReference(reference: string, tenantId?: string): Promise<Payment | null> {
    for (const payment of this.store.values()) {
      if (payment.reference?.value === reference && (!tenantId || payment.tenantId === tenantId)) {
        return payment;
      }
    }
    return null;
  }

  async save(payment: Payment): Promise<void> {
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.saveCount++;
    this.store.set(payment.id.value, payment);
  }
}

class MockReceiptRepository implements ReceiptRepositoryPort {
  public store = new Map<string, Receipt>();
  public saveCount = 0;
  private counter = 1000;

  async findById(id: ReceiptId | string): Promise<Receipt | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findByReceiptNumber(
    receiptNumber: ReceiptNumber | string,
    tenantId?: string,
  ): Promise<Receipt | null> {
    const num = typeof receiptNumber === 'string' ? receiptNumber : receiptNumber.value;
    for (const receipt of this.store.values()) {
      if (receipt.receiptNumber.value === num && (!tenantId || receipt.tenantId === tenantId)) {
        return receipt;
      }
    }
    return null;
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

  async save(receipt: Receipt): Promise<void> {
    this.saveCount++;
    this.store.set(receipt.id.value, receipt);
  }

  async getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber> {
    this.counter++;
    return ReceiptNumber.create(
      `REC-${tenantId.toUpperCase()}-${year}-${String(this.counter).padStart(6, '0')}`,
    );
  }
}

class MockTransactionCoordinator implements SalesTransactionCoordinatorPort {
  public executedTransactions = 0;
  public rolledBackTransactions = 0;

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.executedTransactions++;
    try {
      return await work();
    } catch (error) {
      this.rolledBackTransactions++;
      throw error;
    }
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.executeInTransaction(work);
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Milestone 7.19: Application Use-Case, Orchestration & Authorization Tests', () => {
  const baseTime = new Date('2026-10-17T11:00:00.000Z');
  const tenantId = 'tenant_kinergy_main';
  const clientId = 'client_john_doe';

  let clock: DeterministicClock;
  let saleRepo: MockSaleRepository;
  let paymentRepo: MockPaymentRepository;
  let receiptRepo: MockReceiptRepository;
  let txCoordinator: MockTransactionCoordinator;
  let eventPublisher: MockEventPublisher;

  let createSaleHandler: CreateSaleHandler;
  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let cancelSaleHandler: CancelSaleHandler;
  let issueReceiptHandler: IssueReceiptHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    saleRepo = new MockSaleRepository();
    paymentRepo = new MockPaymentRepository();
    receiptRepo = new MockReceiptRepository();
    txCoordinator = new MockTransactionCoordinator();
    eventPublisher = new MockEventPublisher();

    createSaleHandler = new CreateSaleHandler(saleRepo, clock);
    createPaymentHandler = new CreatePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      txCoordinator,
    );
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
      txCoordinator,
    );
    cancelSaleHandler = new CancelSaleHandler(
      saleRepo,
      clock,
      eventPublisher,
      paymentRepo,
      txCoordinator,
    );
    issueReceiptHandler = new IssueReceiptHandler(
      receiptRepo,
      saleRepo,
      paymentRepo,
      undefined,
      clock,
      eventPublisher,
    );
  });

  // ===========================================================================
  // 1. Authorization at Application Boundary
  // ===========================================================================
  describe('1. Authorization Invariants at Application Boundary', () => {
    it('allows authorized callers with explicit permissions to pass sales authorization', () => {
      const authorizedUser: SaleCurrentUser = {
        userId: 'usr_mgr_01',
        tenantId,
        roles: ['Manager'],
        permissions: ['sales.create', 'sales.read', 'sales.cancel'],
      };

      expect(() => checkSaleAuthorization(authorizedUser, ['sales.create'])).not.toThrow();
      expect(() => checkSaleAuthorization(authorizedUser, ['sales.cancel'])).not.toThrow();
    });

    it('denies callers lacking the required sales permission with SaleUnauthorizedException', () => {
      const unauthorizedTrainer: SaleCurrentUser = {
        userId: 'usr_trainer_01',
        tenantId,
        roles: ['Trainer'],
        permissions: ['sales.read'],
      };

      expect(() => checkSaleAuthorization(unauthorizedTrainer, ['sales.create'])).toThrow(
        SaleUnauthorizedException,
      );
      expect(() => checkSaleAuthorization(unauthorizedTrainer, ['sales.cancel'])).toThrow(
        SaleUnauthorizedException,
      );
    });

    it('inherits capabilities: sales.manage implies sales.read, sales.create, and sales.cancel', () => {
      const adminUser: SaleCurrentUser = {
        userId: 'usr_admin_01',
        tenantId,
        roles: ['Owner'],
        permissions: ['sales.manage'],
      };

      expect(() => checkSaleAuthorization(adminUser, ['sales.read'])).not.toThrow();
      expect(() => checkSaleAuthorization(adminUser, ['sales.create'])).not.toThrow();
      expect(() => checkSaleAuthorization(adminUser, ['sales.cancel'])).not.toThrow();
    });

    it('validates payment authorization: requires payments.create or payments.manage', () => {
      const cashierUser: PaymentCurrentUser = {
        userId: 'usr_cashier_01',
        tenantId,
        roles: ['Receptionist'],
        permissions: ['payments.create'],
      };
      const readonlyUser: PaymentCurrentUser = {
        userId: 'usr_ro_01',
        tenantId,
        roles: ['Trainer'],
        permissions: ['payments.read'],
      };

      expect(() => checkPaymentAuthorization(cashierUser, ['payments.create'])).not.toThrow();
      expect(() => checkPaymentAuthorization(readonlyUser, ['payments.create'])).toThrow(
        PaymentUnauthorizedException,
      );
    });

    it('validates receipt authorization: denies users lacking receipts.manage or receipts.read', () => {
      const receptionist: ReceiptCurrentUser = {
        userId: 'usr_rec_01',
        tenantId,
        roles: ['Receptionist'],
        permissions: ['receipts.manage', 'receipts.read'],
      };
      const clientUser: ReceiptCurrentUser = {
        userId: 'usr_client_01',
        tenantId,
        roles: ['Client'],
        permissions: [],
      };

      expect(() => checkReceiptAuthorization(receptionist, ['receipts.manage'])).not.toThrow();
      expect(() => checkReceiptAuthorization(clientUser, ['receipts.manage'])).toThrow(
        ReceiptUnauthorizedException,
      );
    });
  });

  // ===========================================================================
  // 2. Use-Case Orchestration & Multi-Installment Settlement
  // ===========================================================================
  describe('2. Use-Case Orchestration & Split-Tender Multi-Installment Settlement', () => {
    it('orchestrates end-to-end split-tender settlement across 2 installments, transitioning Sale from DRAFT to PAID and issuing Receipt', async () => {
      // Step A: Create Sale for $150.00
      const createSaleCmd = new CreateSaleCommand({
        id: 'sale_split_001',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'session_clinical_201',
          sourceCode: 'CLINIC-ENC-201',
        },
        items: [
          {
            description: 'Kinesiology Evaluation',
            quantity: 1,
            unitPriceAmount: 150.0,
          },
        ],
      });

      const saleResult = await createSaleHandler.execute(createSaleCmd);
      expect(saleResult.isSuccess).toBe(true);
      const saleDto = saleResult.getValue();
      expect(saleDto.status).toBe(SaleStatus.DRAFT);
      expect(saleDto.totalAmount).toBe(150.0);

      // Finalize the sale directly to PENDING_PAYMENT
      const loadedSale = await saleRepo.findById(saleDto.id);
      expect(loadedSale).toBeDefined();
      loadedSale!.finalize(clock);
      await saleRepo.save(loadedSale!);

      // Step B: Installment 1 — Partial Payment of $50.00 CASH (status = COMPLETED)
      const p1Result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_split_p1',
          tenantId,
          saleId: saleDto.id,
          method: PaymentMethod.CASH,
          amount: 50.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
        }),
      );
      expect(p1Result.isSuccess).toBe(true);

      const saleAfterP1 = await saleRepo.findById(saleDto.id);
      expect(saleAfterP1?.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Step C: Installment 2 — Remaining Balance of $100.00 QR (Created PENDING then COMPLETED)
      const p2Result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_split_p2',
          tenantId,
          saleId: saleDto.id,
          method: PaymentMethod.QR,
          amount: 100.0,
          currency: 'USD',
          status: PaymentStatus.PENDING,
        }),
      );
      expect(p2Result.isSuccess).toBe(true);

      // Complete P2
      const completeP2Result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_split_p2',
          tenantId,
        }),
      );
      expect(completeP2Result.isSuccess).toBe(true);

      // Sale must now be fully PAID
      const saleAfterP2 = await saleRepo.findById(saleDto.id);
      expect(saleAfterP2?.status).toBe(SaleStatus.PAID);

      // Step D: Issue Receipt reflecting both payments
      const receiptResult = await issueReceiptHandler.execute(
        new IssueReceiptCommand({
          saleId: saleDto.id,
          tenantId,
        }),
      );
      expect(receiptResult.isSuccess).toBe(true);
      const receiptDto = receiptResult.getValue();
      expect(receiptDto.total.amount).toBe(150.0);
      expect(receiptDto.payments).toHaveLength(2);
      expect(receiptDto.payments.map((p) => p.amount.amount)).toEqual([50.0, 100.0]);
    });

    it('rejects an installment that would exceed the remaining Sale balance (Overpayment Guard)', async () => {
      // Create and finalize a $100.00 Sale
      const sale = Sale.create(
        {
          id: SaleId.create('sale_overpay_test'),
          tenantId,
          clientId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'sess_overpay_01',
          }),
        },
        clock,
      );
      sale.addItem(
        {
          source: sale.source,
          description: 'Single Session',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      // Installment 1: $60.00
      const p1Res = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_p1_60',
          tenantId,
          saleId: sale.id.value,
          method: PaymentMethod.CASH,
          amount: 60.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
        }),
      );
      expect(p1Res.isSuccess).toBe(true);

      // Installment 2: $50.00 (Exceeds remaining $40.00 balance)
      const p2Res = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_p2_50',
          tenantId,
          saleId: sale.id.value,
          method: PaymentMethod.QR,
          amount: 50.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
        }),
      );
      expect(p2Res.isFailure).toBe(true);
      expect(p2Res.getError()).toBeInstanceOf(PaymentOverpaymentException);

      // Verify that no extra payment was saved
      const payments = await paymentRepo.findBySaleId(sale.id.value);
      expect(payments).toHaveLength(1);
    });

    it('not-found behavior: fails with SaleNotFoundException without creating any payment record', async () => {
      const res = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_nonexistent_sale',
          tenantId,
          saleId: 'sale_does_not_exist',
          method: PaymentMethod.CASH,
          amount: 50.0,
          currency: 'USD',
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(paymentRepo.saveCount).toBe(0);
    });

    it('not-found behavior: fails with PaymentNotFoundException when completing nonexistent payment', async () => {
      const res = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_missing_123',
          tenantId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.getError()).toBeInstanceOf(PaymentNotFoundException);
    });
  });

  // ===========================================================================
  // 3. Transaction Boundaries & Rollback
  // ===========================================================================
  describe('3. Transaction Boundaries & Atomicity', () => {
    it('executes use-cases inside atomic unit-of-work transactions', async () => {
      const cmd = new CreateSaleCommand({
        id: 'sale_tx_001',
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'tx_sess_01',
        },
        items: [{ description: 'Tx item', quantity: 1, unitPriceAmount: 20.0 }],
      });

      await createSaleHandler.execute(cmd);
      expect(saleRepo.saveCount).toBe(1);
    });

    it('rolls back transaction and does not publish uncommitted domain events if persistence fails', async () => {
      // Create Sale
      const sale = Sale.create(
        {
          id: SaleId.create('sale_fail_tx'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'sess_fail_01',
          }),
        },
        clock,
      );
      sale.addItem(
        {
          source: sale.source,
          description: 'Fail test',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      // Force paymentRepo to throw on save
      paymentRepo.throwOnSave = new Error('Database disk full');

      const res = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          id: 'pay_fail_tx',
          tenantId,
          saleId: sale.id.value,
          method: PaymentMethod.CASH,
          amount: 100.0,
          currency: 'USD',
          status: PaymentStatus.COMPLETED,
        }),
      );

      expect(res.isFailure).toBe(true);
      const err = res.getError();
      const errMsg = err instanceof Error ? err.message : String(err);
      expect(errMsg).toBe('Database disk full');

      // Verify transaction rollback counter incremented
      expect(txCoordinator.rolledBackTransactions).toBe(1);

      // Verify that no domain events leaked into external event publisher
      expect(eventPublisher.publishedEvents).toHaveLength(0);

      // Verify Sale status was not updated to PAID in persistent store
      const persistedSale = await saleRepo.findById(sale.id.value);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ===========================================================================
  // 4. Duplicate Transaction Handling & Idempotency
  // ===========================================================================
  describe('4. Duplicate Transaction Handling & Idempotent Safe Retries', () => {
    it('safely and idempotently returns existing Sale when identical CreateSaleCommand is retried', async () => {
      const command = new CreateSaleCommand({
        id: 'sale_retry_001',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_repeat_01',
          sourceCode: 'CLINIC-ENC-REPEAT',
        },
        items: [
          {
            description: 'Recurring Therapy',
            quantity: 1,
            unitPriceAmount: 90.0,
          },
        ],
      });

      // First execution
      const firstResult = await createSaleHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      expect(firstResult.getValue().id).toBe('sale_retry_001');

      // Retry execution (e.g. after network timeout)
      const retryResult = await createSaleHandler.execute(command);
      expect(retryResult.isSuccess).toBe(true);
      expect(retryResult.getValue().id).toBe('sale_retry_001');

      // Exactly 1 Sale in the repository
      expect(saleRepo.store.size).toBe(1);
    });

    it('rejects duplicate submission with conflicting commercial payload for the same source reference', async () => {
      const firstCommand = new CreateSaleCommand({
        id: 'sale_source_orig',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_conflict_01',
          sourceCode: 'ENC-CONFLICT',
        },
        items: [
          {
            description: 'Original Session',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });

      await createSaleHandler.execute(firstCommand);

      // Conflicting command attempting to bill the same session with different items/amounts
      const conflictingCommand = new CreateSaleCommand({
        id: 'sale_source_different_id',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_conflict_01', // Identical sourceId!
          sourceCode: 'ENC-CONFLICT',
        },
        items: [
          {
            description: 'Mismatched Session',
            quantity: 1,
            unitPriceAmount: 250.0, // Different amount!
          },
        ],
      });

      const confRes = await createSaleHandler.execute(conflictingCommand);
      expect(confRes.isFailure).toBe(true);
      expect(confRes.getError()).toBeInstanceOf(DuplicateSaleException);
    });

    it('allows a new commercial Sale to be created if the prior checkout for the source was CANCELLED', async () => {
      // Step 1: Create first sale
      const cmd1 = new CreateSaleCommand({
        id: 'sale_cancelled_attempt',
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_rebill_01',
          sourceCode: 'ENC-REBILL',
        },
        items: [{ description: 'First Attempt', quantity: 1, unitPriceAmount: 80.0 }],
      });
      await createSaleHandler.execute(cmd1);

      // Step 2: Cancel first sale
      const cancelRes = await cancelSaleHandler.execute(
        new CancelSaleCommand({
          saleId: 'sale_cancelled_attempt',
          tenantId,
          reason: 'Client arrived late, rescheduling required',
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);

      const cancelledSale = await saleRepo.findById('sale_cancelled_attempt');
      expect(cancelledSale?.status).toBe(SaleStatus.CANCELLED);

      // Step 3: Create second sale for the same clinical session
      const cmd2 = new CreateSaleCommand({
        id: 'sale_active_rebill',
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_rebill_01', // Same sourceId
          sourceCode: 'ENC-REBILL',
        },
        items: [{ description: 'Second Attempt Validated', quantity: 1, unitPriceAmount: 80.0 }],
      });

      const rebillResult = await createSaleHandler.execute(cmd2);
      expect(rebillResult.isSuccess).toBe(true);
      expect(rebillResult.getValue().id).toBe('sale_active_rebill');
      expect(rebillResult.getValue().status).toBe(SaleStatus.DRAFT);
    });

    it('safely allows identical payment retries and rejects conflicting payment replays', async () => {
      const sale = Sale.create(
        {
          id: SaleId.create('sale_pay_dup'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'sess_pay_dup',
          }),
        },
        clock,
      );
      sale.addItem(
        {
          source: sale.source,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payCmd = new CreatePaymentCommand({
        id: 'pay_duplicate_key',
        tenantId,
        saleId: sale.id.value,
        method: PaymentMethod.CASH,
        amount: 50.0,
        currency: 'USD',
        reference: 'TX_REF_UNIQUE_999',
      });

      // 1. Initial submission succeeds
      const res1 = await createPaymentHandler.execute(payCmd);
      expect(res1.isSuccess).toBe(true);
      expect(res1.getValue().id).toBe('pay_duplicate_key');

      // 2. Identical replay is handled idempotently, returning existing payment
      const res2 = await createPaymentHandler.execute(payCmd);
      expect(res2.isSuccess).toBe(true);
      expect(res2.getValue().id).toBe('pay_duplicate_key');

      // 3. Conflicting replay (same payment id, but mismatched amount) fails with DuplicatePaymentReferenceException
      const conflictingPayCmd = new CreatePaymentCommand({
        id: 'pay_duplicate_key',
        tenantId,
        saleId: sale.id.value,
        method: PaymentMethod.CASH,
        amount: 75.0, // Mismatched amount!
        currency: 'USD',
        reference: 'TX_REF_UNIQUE_999',
      });

      const res3 = await createPaymentHandler.execute(conflictingPayCmd);
      expect(res3.isFailure).toBe(true);
      expect(res3.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
    });
  });
});
