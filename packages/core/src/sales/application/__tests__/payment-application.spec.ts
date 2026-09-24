import { RecordPaymentHandler } from '../handlers/record-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { SettlePaymentHandler } from '../handlers/settle-payment.handler';
import { FailPaymentHandler } from '../handlers/fail-payment.handler';
import { CancelPaymentHandler } from '../handlers/cancel-payment.handler';
import { GetPaymentByIdHandler } from '../handlers/get-payment-by-id.handler';
import { GetPaymentsBySaleIdHandler } from '../handlers/get-payments-by-sale-id.handler';
import { RecordPaymentCommand } from '../commands/record-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { SettlePaymentCommand } from '../commands/settle-payment.command';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';
import { GetPaymentByIdQuery } from '../queries/get-payment-by-id.query';
import { GetPaymentsBySaleIdQuery } from '../queries/get-payments-by-sale-id.query';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
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
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { SaleNotPayableException } from '../exceptions/sale-not-payable.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { InvalidPaymentMethodException } from '../../domain/exceptions/invalid-payment-method.exception';
import { InvalidPaymentTransitionException } from '../../domain/exceptions/invalid-payment-transition.exception';
import { SaleOptimisticLockException } from '../../domain/exceptions/optimistic-lock.exception';

// In-Memory Test Doubles
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public shouldFailSave = false;
  public enforceOCC = false;
  public versions = new Map<string, number>();

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
      throw new Error('Simulated repository persistence failure.');
    }
    if (this.enforceOCC && payment.version > 1) {
      const storedVersion = this.versions.get(payment.id.value) ?? 1;
      const expectedPriorVersion = payment.version - 1;
      if (storedVersion !== expectedPriorVersion) {
        throw new SaleOptimisticLockException('Payment', payment.id.value, expectedPriorVersion);
      }
      this.versions.set(payment.id.value, payment.version);
    } else if (this.enforceOCC) {
      this.versions.set(payment.id.value, payment.version);
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
      throw new Error('Simulated sale repository persistence failure.');
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

describe('Payment Application Layer Test Suite', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-09-21T10:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;

  let recordPaymentHandler: RecordPaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;
  let settlePaymentHandler: SettlePaymentHandler;
  let failPaymentHandler: FailPaymentHandler;
  let cancelPaymentHandler: CancelPaymentHandler;
  let getPaymentByIdHandler: GetPaymentByIdHandler;
  let getPaymentsBySaleIdHandler: GetPaymentsBySaleIdHandler;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_123',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_123',
      }),
      description: 'Monthly Wellness Membership',
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

    recordPaymentHandler = new RecordPaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
    );
    settlePaymentHandler = new SettlePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    failPaymentHandler = new FailPaymentHandler(paymentRepo, clock, eventPublisher);
    cancelPaymentHandler = new CancelPaymentHandler(paymentRepo, clock, eventPublisher);
    getPaymentByIdHandler = new GetPaymentByIdHandler(paymentRepo);
    getPaymentsBySaleIdHandler = new GetPaymentsBySaleIdHandler(paymentRepo);
  });

  // 1. Successful Creation
  describe('1. Successful Creation', () => {
    it('should create and settle a CASH payment directly, advancing Sale to PAID when fully covered', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 100.0,
        method: PaymentMethod.CASH,
        tenantId,
        reference: 'DRAWER-01-RECEIPT-99',
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.amount.formatted).toBe('100.00');
      expect(dto.amount.cents).toBe(10000);
      expect(dto.paidAt).toBe(baseTime.toISOString());
      expect(dto.reference).toBe('DRAWER-01-RECEIPT-99');

      // Verify Sale status transitioned to PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);

      // Verify events published
      expect(eventPublisher.publishedEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should create a partial CASH payment, advancing Sale to PARTIALLY_PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 40.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PARTIALLY_PAID);
    });

    it('should create an async PENDING QR payment without advancing Sale status yet', async () => {
      const sale = createPayableSale(150.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 150.0,
        method: PaymentMethod.QR,
        status: PaymentStatus.PENDING,
        tenantId,
        reference: 'QR-INVOICE-TRACE-55',
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.paidAt).toBeNull();

      // Sale remains in PENDING_PAYMENT
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 2. Missing Sale
  describe('2. Missing Sale Handling', () => {
    it('should fail with SaleNotFoundException when sale ID does not exist', async () => {
      const nonExistentId = 'sale_non_existent_999';
      const command = new RecordPaymentCommand({
        saleId: nonExistentId,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain(nonExistentId);
    });

    it('should fail with an error when sale ID is blank or empty', async () => {
      const command = new RecordPaymentCommand({
        saleId: '   ',
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain('Sale ID cannot be empty');
    });

    it('should fail with SaleNotPayableException when Sale is still in DRAFT status', async () => {
      const draftSale = Sale.create({
        tenantId,
        currency: 'USD',
        source: SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'srv_1',
        }),
      });
      saleRepo.store.set(draftSale.id.value, draftSale);

      const command = new RecordPaymentCommand({
        saleId: draftSale.id.value,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotPayableException);
    });
  });

  // 3. Invalid Amount
  describe('3. Invalid Amount Handling', () => {
    it('should reject zero payment amount', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 0.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toMatch(/positive|greater than zero|Invalid/i);
    });

    it('should reject negative payment amount', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: -25.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
    });

    it('should reject payment exceeding the remaining sale balance', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 150.0,
        method: PaymentMethod.QR,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect((result.getError() as Error).message).toContain('exceeds the remaining sale balance');
    });

    it('should reject payment when currency does not match Sale currency', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 100.0,
        currency: 'EUR',
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
    });
  });

  // 4. Invalid Method
  describe('4. Invalid Method Handling', () => {
    it('should reject speculative or unsupported payment methods', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: 'CARD', // CARD is recognized future method, not active in Phase 7.5
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethodException);
    });

    it('should reject completely unrecognized payment method string', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: 'CRYPTO_COIN',
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidPaymentMethodException);
    });
  });

  // 5. Invalid Status Transition
  describe('5. Invalid Status Transitions', () => {
    it('should reject settling an already SETTLED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const settleRes = await settlePaymentHandler.execute(
        new SettlePaymentCommand({
          paymentId: paymentDto.id,
          tenantId,
        }),
      );

      expect(settleRes.isFailure).toBe(true);
      expect(settleRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('should reject cancelling an already SETTLED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const cancelRes = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: paymentDto.id,
          reason: 'Customer requested void',
          tenantId,
        }),
      );

      expect(cancelRes.isFailure).toBe(true);
      expect(cancelRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('should reject failing an already SETTLED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const failRes = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: paymentDto.id,
          reason: 'Timeout',
          tenantId,
        }),
      );

      expect(failRes.isFailure).toBe(true);
      expect(failRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });
  });

  // 6. Valid Lifecycle Transitions
  describe('6. Valid Lifecycle Transitions', () => {
    it('should transition PENDING -> SETTLED, updating paidAt and advancing Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // 1. Create PENDING QR
      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();
      expect(paymentDto.status).toBe(PaymentStatus.PENDING);

      // Advance clock by 30 seconds
      clock.advanceSeconds(30);

      // 2. Settle payment
      const settleRes = await settlePaymentHandler.execute(
        new SettlePaymentCommand({
          paymentId: paymentDto.id,
          reference: 'QR-SETTLE-REF-100',
          tenantId,
        }),
      );

      expect(settleRes.isSuccess).toBe(true);
      const settledDto = settleRes.getValue();
      expect(settledDto.status).toBe(PaymentStatus.COMPLETED);
      expect(settledDto.paidAt).toBe(clock.now().toISOString());
      expect(settledDto.reference).toBe('QR-SETTLE-REF-100');

      // Sale should now be PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('should transition PENDING -> FAILED without affecting Sale status', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const failRes = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: paymentDto.id,
          reason: 'Network gateway timeout',
          tenantId,
        }),
      );

      expect(failRes.isSuccess).toBe(true);
      const failedDto = failRes.getValue();
      expect(failedDto.status).toBe(PaymentStatus.FAILED);

      const saleAfterFail = await saleRepo.findById(sale.id);
      expect(saleAfterFail?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('should transition PENDING -> CANCELLED when operator voids the tender', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const cancelRes = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: paymentDto.id,
          reason: 'Operator voided prompt',
          tenantId,
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      const cancelledDto = cancelRes.getValue();
      expect(cancelledDto.status).toBe(PaymentStatus.CANCELLED);
    });
  });

  // 7. Unauthorized Access & Multi-Tenancy
  describe('7. Unauthorized Access & Multi-Tenancy', () => {
    it('should reject execution when user lacks required payments.create permission', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
        currentUser: {
          id: 'user_unauthorized',
          permissions: ['sales.read'], // Missing payments.create
          roles: ['Member'],
        },
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should allow execution when user has payments.create permission', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
        currentUser: {
          id: 'user_cashier',
          permissions: ['payments.create'],
          roles: ['Receptionist'],
        },
      });

      const result = await recordPaymentHandler.execute(command);
      expect(result.isSuccess).toBe(true);
    });

    it('should reject cross-tenant recording attempts', async () => {
      const sale = createPayableSale(100.0, 'USD'); // Belongs to 'tenant_kinergy_wellness'

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId: 'tenant_other_unrelated', // Mismatched tenant
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
      expect((result.getError() as Error).message).toContain('Cross-tenant');
    });

    it('should reject query when user lacks payments.read permission', async () => {
      const query = new GetPaymentByIdQuery({
        paymentId: 'pay_123',
        currentUser: {
          id: 'user_guest',
          permissions: ['inventory.read'],
          roles: ['Guest'],
        },
      });

      const result = await getPaymentByIdHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });
  });

  // 8. Retrieval (GetPaymentById)
  describe('8. Retrieval', () => {
    it('should retrieve existing payment DTO with exact monetary precision', async () => {
      const sale = createPayableSale(55.5, 'USD');
      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 55.5,
          method: PaymentMethod.CASH,
          tenantId,
          reference: 'DRAWER-RECEIPT-55',
        }),
      );
      const created = createRes.getValue();

      const query = new GetPaymentByIdQuery({
        paymentId: created.id,
        tenantId,
      });

      const queryRes = await getPaymentByIdHandler.execute(query);

      expect(queryRes.isSuccess).toBe(true);
      const dto = queryRes.getValue();
      expect(dto.id).toBe(created.id);
      expect(dto.amount.formatted).toBe('55.50');
      expect(dto.amount.cents).toBe(5550);
      expect(dto.reference).toBe('DRAWER-RECEIPT-55');
    });

    it('should return PaymentNotFoundException when payment ID does not exist', async () => {
      const query = new GetPaymentByIdQuery({
        paymentId: 'pay_non_existent',
      });

      const result = await getPaymentByIdHandler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });
  });

  // 9. Sale Payment Listing
  describe('9. Sale Payment Listing', () => {
    it('should list all payments associated with a specific Sale', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Record first payment: $40 CASH settled
      await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 40.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      // Record second payment: $60 QR settled
      await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 60.0,
          method: PaymentMethod.QR,
          tenantId,
        }),
      );

      const query = new GetPaymentsBySaleIdQuery({
        saleId: sale.id.value,
        tenantId,
      });

      const listRes = await getPaymentsBySaleIdHandler.execute(query);

      expect(listRes.isSuccess).toBe(true);
      const list = listRes.getValue();
      expect(list.length).toBe(2);
      expect(list[0]!.amount.formatted).toBe('40.00');
      expect(list[1]!.amount.formatted).toBe('60.00');

      // Verify Sale is fully PAID
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });
  });

  // 10. Persistence Failures
  describe('10. Persistence Failures', () => {
    it('should propagate repository errors gracefully via SalesApplicationResult.fail', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Simulate database connection drop or OCC collision
      paymentRepo.shouldFailSave = true;

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 100.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain(
        'Simulated repository persistence failure',
      );
    });

    it('should propagate sale repository persistence failure during settlement', async () => {
      const sale = createPayableSale(100.0, 'USD');
      saleRepo.shouldFailSave = true;

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 100.0,
        method: PaymentMethod.CASH,
        tenantId,
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain(
        'Simulated sale repository persistence failure',
      );
    });
  });

  // 11. Domain Error Propagation
  describe('11. Domain Error Propagation', () => {
    it('should propagate invalid reference length errors from the domain aggregate', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const command = new RecordPaymentCommand({
        saleId: sale.id.value,
        amount: 50.0,
        method: PaymentMethod.CASH,
        tenantId,
        reference: 'A'.repeat(101), // Exceeds 100-character maximum
      });

      const result = await recordPaymentHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain('100 characters');
    });
  });

  // 12. CompletePaymentHandler Lifecycle Transitions
  describe('12. CompletePaymentHandler Lifecycle Transitions', () => {
    it('should complete a PENDING payment, update paidAt, and advance Sale to PAID', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();
      expect(pendingDto.status).toBe(PaymentStatus.PENDING);

      clock.advanceSeconds(45);
      const completeRes = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          reference: 'CONFIRM-QR-999',
          tenantId,
          currentUser: {
            id: 'cashier_1',
            roles: ['Receptionist'],
            permissions: ['payments.create'],
          },
        }),
      );

      expect(completeRes.isSuccess).toBe(true);
      const completedDto = completeRes.getValue();
      expect(completedDto.status).toBe(PaymentStatus.COMPLETED);
      expect(completedDto.paidAt).toBe(clock.now().toISOString());
      expect(completedDto.reference).toBe('CONFIRM-QR-999');

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale?.status).toBe(SaleStatus.PAID);
    });

    it('should return PaymentNotFoundException when completing non-existent payment', async () => {
      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: 'pay_does_not_exist',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('should return InvalidPaymentTransitionException when attempting to re-complete an already COMPLETED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      // First complete succeeds
      await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      // Second complete must fail with InvalidPaymentTransitionException
      const secondRes = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(secondRes.isFailure).toBe(true);
      expect(secondRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('should return PaymentUnauthorizedException on cross-tenant completion attempt', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          tenantId: 'different_tenant',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should return PaymentUnauthorizedException when payment does not belong to specified saleId', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          saleId: 'sale_wrong_scoping',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should return repository failure when payment save fails during complete', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      paymentRepo.shouldFailSave = true;

      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain(
        'Simulated repository persistence failure',
      );
    });
  });

  // 13. FailPaymentHandler Lifecycle Transitions
  describe('13. FailPaymentHandler Lifecycle Transitions', () => {
    it('should transition PENDING payment to FAILED with reason and keep paidAt null', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const failRes = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: pendingDto.id,
          reason: 'Issuing bank timeout',
          tenantId,
          currentUser: {
            id: 'cashier_1',
            roles: ['Receptionist'],
            permissions: ['payments.create'],
          },
        }),
      );

      expect(failRes.isSuccess).toBe(true);
      const failedDto = failRes.getValue();
      expect(failedDto.status).toBe(PaymentStatus.FAILED);
      expect(failedDto.paidAt).toBeNull();

      // Parent sale status remains unchanged
      const saleAfterFail = await saleRepo.findById(sale.id);
      expect(saleAfterFail?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('should return PaymentNotFoundException when failing non-existent payment', async () => {
      const result = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: 'pay_non_existent',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('should return InvalidPaymentTransitionException when failing an already COMPLETED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.CASH, // Immediate COMPLETED
          tenantId,
        }),
      );
      const paymentDto = createRes.getValue();

      const failRes = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: paymentDto.id,
          reason: 'Declined late',
          tenantId,
        }),
      );

      expect(failRes.isFailure).toBe(true);
      expect(failRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('should return PaymentUnauthorizedException when caller lacks payments.create/manage', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const result = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
          currentUser: {
            id: 'unauth_user',
            roles: ['Member'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should return repository failure when payment save fails during fail transition', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      paymentRepo.shouldFailSave = true;

      const result = await failPaymentHandler.execute(
        new FailPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain(
        'Simulated repository persistence failure',
      );
    });
  });

  // 14. CancelPaymentHandler Lifecycle Transitions
  describe('14. CancelPaymentHandler Lifecycle Transitions', () => {
    it('should cancel a PENDING payment when authorized with payments.manage', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const cancelRes = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: pendingDto.id,
          reason: 'Customer cancelled checkout',
          tenantId,
          currentUser: {
            id: 'manager_1',
            roles: ['Manager'],
            permissions: ['payments.manage'],
          },
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      const cancelledDto = cancelRes.getValue();
      expect(cancelledDto.status).toBe(PaymentStatus.CANCELLED);
      expect(cancelledDto.paidAt).toBeNull();
    });

    it('should return PaymentNotFoundException when cancelling non-existent payment', async () => {
      const result = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: 'pay_non_existent',
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
    });

    it('should return InvalidPaymentTransitionException when cancelling an already CANCELLED payment', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      // First cancel succeeds
      await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      // Second cancel must fail with InvalidPaymentTransitionException
      const secondRes = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(secondRes.isFailure).toBe(true);
      expect(secondRes.getError()).toBeInstanceOf(InvalidPaymentTransitionException);
    });

    it('should reject cancellation when user lacks payments.manage permission', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      const result = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
          currentUser: {
            id: 'operator_readonly',
            roles: ['Receptionist'],
            permissions: ['payments.read'], // Missing payments.manage
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentUnauthorizedException);
    });

    it('should return repository failure when payment save fails during cancellation', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      paymentRepo.shouldFailSave = true;

      const result = await cancelPaymentHandler.execute(
        new CancelPaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toContain(
        'Simulated repository persistence failure',
      );
    });
  });

  // 15. Optimistic Concurrency Control (OCC) & Concurrent Transitions
  describe('15. Optimistic Concurrency Control (OCC) & Concurrent Transitions', () => {
    it('should prevent conflicting concurrent transitions from silently overwriting each other', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Enable OCC enforcement on the repository
      paymentRepo.enforceOCC = true;

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      // Read aggregate instance concurrently (simulate two workers reading version 1)
      const worker1Payment = await paymentRepo.findById(pendingDto.id);
      const worker2Payment = await paymentRepo.findById(pendingDto.id);

      expect(worker1Payment).not.toBeNull();
      expect(worker2Payment).not.toBeNull();
      expect(worker1Payment?.version).toBe(1);
      expect(worker2Payment?.version).toBe(1);

      // Worker 1 completes the payment: transitions PENDING -> COMPLETED (version becomes 2)
      worker1Payment!.complete(clock);
      await paymentRepo.save(worker1Payment!);

      // Worker 2 attempts to cancel the same payment from stale version 1
      worker2Payment!.cancel('Concurrent cashier void', clock);

      // Saving worker 2's stale transition must be rejected by OCC
      await expect(paymentRepo.save(worker2Payment!)).rejects.toThrow(SaleOptimisticLockException);

      // Verify the persisted payment remains COMPLETED and was not corrupted by the concurrent worker
      const finalPayment = await paymentRepo.findById(pendingDto.id);
      expect(finalPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(finalPayment?.version).toBe(2);
    });

    it('handler gracefully catches OCC collision and returns SalesApplicationResult.fail', async () => {
      const sale = createPayableSale(100.0, 'USD');
      paymentRepo.enforceOCC = true;

      const createRes = await recordPaymentHandler.execute(
        new RecordPaymentCommand({
          saleId: sale.id.value,
          amount: 100.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          tenantId,
        }),
      );
      const pendingDto = createRes.getValue();

      // Advance version in DB behind the scenes (simulating another node updating the payment first)
      paymentRepo.versions.set(pendingDto.id, 99);

      // Attempt to complete the payment via handler
      const result = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingDto.id,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleOptimisticLockException);
    });
  });
});
