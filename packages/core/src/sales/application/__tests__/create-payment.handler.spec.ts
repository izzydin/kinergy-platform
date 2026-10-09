import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CreatePaymentCommand } from '../commands/create-payment.command';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { Payment } from '../../domain/payment.aggregate';
import { Sale } from '../../domain/sale.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleNotPayableException } from '../exceptions/sale-not-payable.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { DuplicatePaymentReferenceException } from '../exceptions/duplicate-payment-reference.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { InvalidPaymentMethodException } from '../../domain/exceptions/invalid-payment-method.exception';
import { InvalidPaymentStatusException } from '../../domain/exceptions/invalid-payment-status.exception';
import { PaymentDomainException } from '../../domain/exceptions/payment-domain.exception';

// In-Memory Test Doubles
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public shouldFailSave = false;

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
    const key = typeof saleId === 'string' ? saleId.trim() : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }

  async save(payment: Payment): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database connection lost: simulated payment persistence failure.');
    }
    this.store.set(payment.id.value, payment);
  }
}

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public shouldFailSave = false;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database connection lost: simulated sale persistence failure.');
    }
    this.store.set(sale.id.value, sale);
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

function extractErrorMessage(result: SalesApplicationResult<unknown>): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err);
}

describe('CreatePaymentHandler Specification Suite (Milestone 7.12)', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-10-07T12:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let handler: CreatePaymentHandler;

  const createPayableSale = (
    totalAmount: number = 100.0,
    currency: string = 'USD',
    tenant: string = tenantId,
  ): Sale => {
    const sale = Sale.create({
      tenantId: tenant,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_01',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'plan_gold_01',
      }),
      description: 'Gold Membership',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();

    handler = new CreatePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
  });

  // 1. Valid Payment Scenarios
  describe('1. Valid Payment Scenarios', () => {
    it('creates and settles a full CASH payment, establishing Sale relationship and advancing Sale to PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: 'DRAWER-01-TX-99',
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.saleId).toBe(sale.id.value);
      expect(dto.amountValue).toBe(100.0);
      expect(dto.amount.currency).toBe('USD');
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('DRAWER-01-TX-99');
      expect(dto.paidAt).toBe(baseTime.toISOString());

      // Verify persisted in repository
      const persisted = await paymentRepo.findById(dto.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.saleId.value).toBe(sale.id.value);
      expect(persisted!.status).toBe(PaymentStatus.COMPLETED);

      // Verify Sale aggregate advanced to PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PAID);

      // Verify post-commit events published
      expect(eventPublisher.publishedEvents.length).toBeGreaterThan(0);
      const settledEvent = eventPublisher.publishedEvents.find(
        (e) => e.eventType === 'PaymentSettled',
      );
      expect(settledEvent).toBeDefined();
    });

    it('creates a partial CASH payment, establishing Sale relationship and advancing Sale to PARTIALLY_PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 40.0,
          currency: 'USD',
          method: PaymentMethod.CASH,
          reference: 'DRAWER-PARTIAL-01',
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.amountValue).toBe(40.0);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('creates an initial PENDING payment according to Milestone 7.6 without mutating Sale state', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          currency: 'USD',
          method: PaymentMethod.QR,
          reference: 'QR-PENDING-SESSION-01',
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.paidAt).toBeNull();

      // Sale remains in PENDING_PAYMENT
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('defaults currency to Sale currency if omitted in request', async () => {
      const sale = createPayableSale(50.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().amount.currency).toBe('USD');
    });
  });

  // 2. Missing Sale
  describe('2. Missing Sale', () => {
    it('rejects creation when the target Sale does not exist', async () => {
      const nonExistentSaleId = 'c0000000-0000-4000-8000-000000000000';

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: nonExistentSaleId,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(extractErrorMessage(result)).toContain(nonExistentSaleId);
    });

    it('rejects creation when saleId is empty or whitespace', async () => {
      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: '   ',
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain('Sale ID cannot be empty');
    });
  });

  // 3. Invalid Amount
  describe('3. Invalid Amount', () => {
    it('rejects creation with zero amount', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentDomainException);
      expect(extractErrorMessage(result)).toContain('strictly greater than zero');
    });

    it('rejects creation with negative amount', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: -25.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toMatch(
        /cannot be negative|non-negative|strictly greater than zero/,
      );
    });

    it('rejects creation with NaN or non-finite amount', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const resultNaN = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: NaN,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );
      expect(resultNaN.isFailure).toBe(true);
      expect(extractErrorMessage(resultNaN)).toContain(
        'Payment amount must be a valid finite number',
      );

      const resultInf = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: Infinity,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );
      expect(resultInf.isFailure).toBe(true);
    });

    it('rejects payment amount exceeding remaining balance (overpayment protection)', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 150.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect(extractErrorMessage(result)).toContain('exceeds the remaining sale balance');
    });
  });

  // 4. Invalid Method
  describe('4. Invalid Method', () => {
    it('rejects creation with unknown or unsupported payment method string', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: 'CRYPTO_BITCOIN',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethodException);
    });

    it('rejects creation with empty or missing payment method', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: '',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain('Payment method cannot be empty');
    });
  });

  // 5. Invalid Currency
  describe('5. Invalid Currency', () => {
    it('rejects creation when payment currency does not match Sale currency', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          currency: 'EUR',
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect(extractErrorMessage(result)).toContain('does not match the associated sale currency');
    });
  });

  // 6. Duplicate Reference Handling
  describe('6. Duplicate Reference Handling', () => {
    it('rejects creation when another payment for the same Sale shares the exact reference', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // First partial payment with reference
      const res1 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.QR,
          reference: 'QR-GATEWAY-TX-998877',
          tenantId,
        }),
      );
      expect(res1.isSuccess).toBe(true);

      // Second payment attempting to use duplicate reference
      const res2 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.QR,
          reference: 'QR-GATEWAY-TX-998877',
          tenantId,
        }),
      );

      expect(res2.isFailure).toBe(true);
      expect(res2.getError()).toBeInstanceOf(DuplicatePaymentReferenceException);
      expect(extractErrorMessage(res2)).toContain('already exists for sale');
    });

    it('allows multiple payments with distinct references for the same Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const res1 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.CASH,
          reference: 'DRAWER-TENDER-01',
          tenantId,
        }),
      );
      expect(res1.isSuccess).toBe(true);

      const res2 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.CASH,
          reference: 'DRAWER-TENDER-02',
          tenantId,
        }),
      );
      expect(res2.isSuccess).toBe(true);
    });

    it('allows multiple payments with null references for the same Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const res1 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 25.0,
          method: PaymentMethod.CASH,
          reference: null,
          tenantId,
        }),
      );
      expect(res1.isSuccess).toBe(true);

      const res2 = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 25.0,
          method: PaymentMethod.CASH,
          reference: null,
          tenantId,
        }),
      );
      expect(res2.isSuccess).toBe(true);
    });
  });

  // 7. Persistence Failure
  describe('7. Persistence Failure', () => {
    it('returns failure when payment repository save operation fails', async () => {
      const sale = createPayableSale(100.0, 'USD');
      paymentRepo.shouldFailSave = true;

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain('simulated payment persistence failure');
    });

    it('returns failure when sale repository save operation fails', async () => {
      const sale = createPayableSale(100.0, 'USD');
      saleRepo.shouldFailSave = true;

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain('simulated sale persistence failure');
    });
  });

  // 8. Milestone 7.6 State Determinism & Calling Restrictions
  describe('8. Milestone 7.6 Initial State Determinism', () => {
    it('strictly rejects callers trying to instantiate a Payment in CANCELLED status', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          status: PaymentStatus.CANCELLED,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain(
        'Initial payment status must be PENDING or COMPLETED',
      );
    });

    it('strictly rejects callers trying to instantiate a Payment in FAILED status', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          status: PaymentStatus.FAILED,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(extractErrorMessage(result)).toContain(
        'Initial payment status must be PENDING or COMPLETED',
      );
    });

    it('strictly rejects callers supplying arbitrary status strings', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          status: 'REFUNDED_BY_ADMIN',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentStatusException);
    });
  });

  // 9. Multi-Tenant Isolation & Authorization
  describe('9. Multi-Tenant Isolation & Authorization', () => {
    it('rejects payment creation for a Sale belonging to another tenant', async () => {
      const otherTenantSale = createPayableSale(100.0, 'USD', 'tenant_other_gym');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: otherTenantSale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId: 'tenant_kinergy_wellness',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('rejects unauthorized caller missing payments.create permission', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
          currentUser: {
            id: 'user_unauthorized',
            permissions: ['sales.read'], // Missing payments.create
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });

  // 10. Sale Payable Status Verification
  describe('10. Sale Payable Status Verification', () => {
    it('rejects payment creation when Sale is already PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Pay in full
      await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      // Attempt second payment
      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotPayableException);
    });

    it('rejects payment creation when Sale is CANCELLED', async () => {
      const sale = createPayableSale(100.0, 'USD');
      sale.cancel('Customer declined transaction', clock);
      saleRepo.store.set(sale.id.value, sale);

      const result = await handler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotPayableException);
    });

    it('executes atomic multi-aggregate persistence inside UnitOfWork transaction when provided', async () => {
      const sale = createPayableSale(100.0, 'USD');
      let transactionExecuted = false;
      const unitOfWork = {
        async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
          transactionExecuted = true;
          return await work();
        },
      };

      const transactionalHandler = new CreatePaymentHandler(
        paymentRepo,
        saleRepo,
        clock,
        eventPublisher,
        unitOfWork,
      );

      const result = await transactionalHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(transactionExecuted).toBe(true);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });
  });
});
