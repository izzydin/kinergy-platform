import { SalePaymentCoordinationService } from '../services/sale-payment-coordination.service';
import { CoordinateSalePaymentHandler } from '../handlers/coordinate-sale-payment.handler';
import { CoordinateSalePaymentCommand } from '../commands/coordinate-sale-payment.command';
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
import { PaymentNotCompletedException } from '../exceptions/payment-not-completed.exception';
import { PaymentSaleMismatchException } from '../exceptions/payment-sale-mismatch.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { InsufficientPaymentException } from '../exceptions/insufficient-payment.exception';
import { InvalidSaleTransitionException } from '../../domain/exceptions/invalid-sale-transition.exception';

// In-Memory Test Doubles
class InMemoryPaymentRepository implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();

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
    this.store.set(payment.id.value, payment);
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

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Sale-Payment Cross-Aggregate Coordination & Lifecycle Hardening', () => {
  const tenantId = 'tenant_kinergy_master';
  const baseTime = new Date('2026-09-28T10:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let coordinationService: SalePaymentCoordinationService;
  let coordinationHandler: CoordinateSalePaymentHandler;

  const createPayableSale = (totalAmount: number = 100.0, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_standard',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.MEMBERSHIP_PLAN,
        sourceId: 'mem_standard',
      }),
      description: 'Standard Gym Membership',
      quantity: 1,
      unitPrice: Money.create(totalAmount, currency),
    });
    sale.finalize(clock);
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  const createCompletedPayment = (
    sale: Sale,
    amount: number = 100.0,
    currency: string = 'USD',
  ): Payment => {
    const payment = Payment.createCompleted(
      {
        saleId: sale.id,
        tenantId: sale.tenantId,
        method: PaymentMethod.CASH,
        amount: Money.create(amount, currency),
        reference: 'REF-COMPLETED-100',
      },
      clock,
    );
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  };

  const createPendingPayment = (
    sale: Sale,
    amount: number = 100.0,
    currency: string = 'USD',
  ): Payment => {
    const payment = Payment.createPending(
      {
        saleId: sale.id,
        tenantId: sale.tenantId,
        method: PaymentMethod.QR,
        amount: Money.create(amount, currency),
        reference: 'REF-PENDING-100',
      },
      clock,
    );
    paymentRepo.store.set(payment.id.value, payment);
    return payment;
  };

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    paymentRepo = new InMemoryPaymentRepository();
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();

    coordinationService = new SalePaymentCoordinationService(
      saleRepo,
      paymentRepo,
      clock,
      eventPublisher,
    );
    coordinationHandler = new CoordinateSalePaymentHandler(
      saleRepo,
      paymentRepo,
      clock,
      eventPublisher,
    );
  });

  // 1. completed Payment → valid Sale transition
  describe('1. completed Payment → valid Sale transition', () => {
    it('advances a PENDING_PAYMENT sale to PAID when a valid completed payment settles the total', async () => {
      const sale = createPayableSale(100.0, 'USD');
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const payment = createCompletedPayment(sale, 100.0, 'USD');
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });

      expect(result.isSuccess).toBe(true);
      const saleDto = result.getValue();
      expect(saleDto.status).toBe(SaleStatus.PAID);

      // Verify persisted state in repository
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PAID);

      // Verify payment was NOT mutated or altered by the coordination
      const persistedPayment = await paymentRepo.findById(payment.id);
      expect(persistedPayment?.status).toBe(PaymentStatus.COMPLETED);
      expect(persistedPayment?.version).toBe(1);

      // Verify domain events published
      expect(eventPublisher.publishedEvents.length).toBeGreaterThan(0);
      expect(eventPublisher.publishedEvents.some((e) => e.eventType === 'SalePaid')).toBe(true);
    });

    it('advances a PARTIALLY_PAID sale to PAID when subsequent completed payment satisfies remaining balance', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // First partial payment ($40)
      createCompletedPayment(sale, 40.0, 'USD');
      sale.markPartiallyPaid(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Second settling payment ($60)
      clock.advanceSeconds(30);
      const finalPayment = createCompletedPayment(sale, 60.0, 'USD');

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: finalPayment.id,
        tenantId,
      });

      expect(result.isSuccess).toBe(true);
      const saleDto = result.getValue();
      expect(saleDto.status).toBe(SaleStatus.PAID);

      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PAID);
    });

    it('succeeds via explicit CoordinateSalePaymentCommand and handler', async () => {
      const sale = createPayableSale(75.0, 'USD');
      const payment = createCompletedPayment(sale, 75.0, 'USD');

      const command = new CoordinateSalePaymentCommand({
        saleId: sale.id.value,
        paymentId: payment.id.value,
        tenantId,
        currentUser: {
          id: 'user_receptionist',
          roles: ['Receptionist'],
          permissions: ['payments.create'],
        },
      });

      const result = await coordinationHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(SaleStatus.PAID);
    });
  });

  // 2. pending Payment → rejected
  describe('2. pending Payment → rejected', () => {
    it('rejects coordination when payment is in PENDING status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const pendingPayment = createPendingPayment(sale, 100.0, 'USD');
      expect(pendingPayment.status).toBe(PaymentStatus.PENDING);

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: pendingPayment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect((result.getError() as Error).message).toContain("is in status 'PENDING'");

      // Verify Sale status is untouched
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 3. failed Payment → rejected
  describe('3. failed Payment → rejected', () => {
    it('rejects coordination when payment is in FAILED status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.fail('Card declined by gateway rail', clock);
      await paymentRepo.save(payment);
      expect(payment.status).toBe(PaymentStatus.FAILED);

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect((result.getError() as Error).message).toContain("is in status 'FAILED'");

      // Verify Sale status is untouched
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 4. cancelled Payment → rejected
  describe('4. cancelled Payment → rejected', () => {
    it('rejects coordination when payment is in CANCELLED status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createPendingPayment(sale, 100.0, 'USD');
      payment.cancel('Customer aborted checkout session', clock);
      await paymentRepo.save(payment);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect((result.getError() as Error).message).toContain("is in status 'CANCELLED'");

      // Verify Sale status is untouched
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 5. Payment belonging to another Sale → rejected
  describe('5. Payment belonging to another Sale → rejected', () => {
    it('rejects coordination when payment belongs to a different Sale aggregate', async () => {
      const saleA = createPayableSale(100.0, 'USD');
      const saleB = createPayableSale(100.0, 'USD');

      // Payment was issued for saleB
      const paymentForSaleB = createCompletedPayment(saleB, 100.0, 'USD');

      // Attempt to coordinate paymentForSaleB against saleA
      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: saleA.id,
        paymentId: paymentForSaleB.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentSaleMismatchException);
      expect((result.getError() as Error).message).toContain(
        `belongs to Sale '${saleB.id.value}', not to target Sale '${saleA.id.value}'`,
      );

      // Verify neither sale was marked paid
      const persistedSaleA = await saleRepo.findById(saleA.id);
      const persistedSaleB = await saleRepo.findById(saleB.id);
      expect(persistedSaleA?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(persistedSaleB?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 6. missing Payment → rejected
  describe('6. missing Payment → rejected', () => {
    it('rejects coordination with PaymentNotFoundException when payment does not exist', async () => {
      const sale = createPayableSale(100.0, 'USD');

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: 'non_existent_payment_uuid',
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect((result.getError() as Error).message).toContain('non_existent_payment_uuid');

      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects coordination with SaleNotFoundException when sale does not exist', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createCompletedPayment(sale, 100.0, 'USD');

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: 'non_existent_sale_uuid',
        paymentId: payment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain('non_existent_sale_uuid');
    });
  });

  // 7. repeated PAID transition
  describe('7. repeated PAID transition', () => {
    it('rejects coordination when Sale is already in PAID status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createCompletedPayment(sale, 100.0, 'USD');

      // First coordination settles the sale
      const firstRes = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });
      expect(firstRes.isSuccess).toBe(true);
      expect(firstRes.getValue().status).toBe(SaleStatus.PAID);

      // Attempt repeated coordination on already PAID sale
      const secondRes = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });

      expect(secondRes.isFailure).toBe(true);
      expect(secondRes.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((secondRes.getError() as Error).message).toContain('Sale is already in PAID status');
    });
  });

  // 8. cancelled Sale → rejected
  describe('8. cancelled Sale → rejected', () => {
    it('rejects coordination when target Sale is in CANCELLED status', async () => {
      const sale = createPayableSale(100.0, 'USD');
      sale.cancel('Customer declined transaction terms', clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.isTerminal()).toBe(true);

      const payment = createCompletedPayment(sale, 100.0, 'USD');

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((result.getError() as Error).message).toContain("terminal state 'CANCELLED'");

      // Verify Sale remains CANCELLED and was not resurrected
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.CANCELLED);
      expect(persistedSale?.cancellationReason).toBe('Customer declined transaction terms');
    });
  });

  // 9. Monetary and Currency Invariants
  describe('9. Monetary and Currency Invariants', () => {
    it('rejects coordination when total settled payments are insufficient to cover sale total', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Only $50 settled out of $100 total
      const partialPayment = createCompletedPayment(sale, 50.0, 'USD');

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: partialPayment.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InsufficientPaymentException);
      expect((result.getError() as Error).message).toContain('insufficient to cover Sale total');

      // Verify Sale status is untouched
      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('rejects coordination when payment currency does not match sale currency', async () => {
      const sale = createPayableSale(100.0, 'USD');

      // Foreign currency payment
      const paymentEUR = Payment.reconstitute({
        id: PaymentId.create(),
        tenantId,
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(100.0, 'EUR'),
        status: PaymentStatus.COMPLETED,
        reference: null,
        paidAt: clock.now(),
        createdAt: clock.now(),
        updatedAt: clock.now(),
        version: 1,
      });
      await paymentRepo.save(paymentEUR);

      const result = await coordinationService.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: paymentEUR.id,
        tenantId,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentCurrencyMismatchException);
      expect((result.getError() as Error).message).toContain(
        "Payment currency 'EUR' does not match",
      );

      const persistedSale = await saleRepo.findById(sale.id);
      expect(persistedSale?.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // 10. Autonomous Aggregate Boundaries & Non-Coupling
  describe('10. Autonomous Aggregate Boundaries & Non-Coupling', () => {
    it('proves Sale aggregate has zero direct mutators or references to Payment state machine', () => {
      const sale = createPayableSale(100.0, 'USD');

      // Assert Sale has no properties or methods coupling it to Payment
      expect((sale as unknown as Record<string, unknown>)['payment']).toBeUndefined();
      expect((sale as unknown as Record<string, unknown>)['payments']).toBeUndefined();
      expect((sale as unknown as Record<string, unknown>)['completePayment']).toBeUndefined();
      expect((sale as unknown as Record<string, unknown>)['failPayment']).toBeUndefined();
    });

    it('proves Payment aggregate has zero direct mutators or references to Sale state machine or persistence', () => {
      const sale = createPayableSale(100.0, 'USD');
      const payment = createCompletedPayment(sale, 100.0, 'USD');

      // Assert Payment has no properties or methods coupling it to Sale state machine
      expect((payment as unknown as Record<string, unknown>)['sale']).toBeUndefined();
      expect((payment as unknown as Record<string, unknown>)['markSalePaid']).toBeUndefined();
      expect((payment as unknown as Record<string, unknown>)['cancelSale']).toBeUndefined();
      expect((payment as unknown as Record<string, unknown>)['saveSale']).toBeUndefined();
    });
  });
});
