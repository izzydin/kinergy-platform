import { CreatePaymentHandler } from '../handlers/create-payment.handler';
import { CompletePaymentHandler } from '../handlers/complete-payment.handler';
import { CreatePaymentCommand } from '../commands/create-payment.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
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
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { PaymentDomainException } from '../../domain/exceptions/payment-domain.exception';
import { InvalidMoneyException } from '../../domain/exceptions/invalid-money.exception';

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
}

describe('Financial Settlement Boundaries & Overpayment Invariants (ADR-0134)', () => {
  const tenantId = 'tenant_kinergy_wellness';
  const baseTime = new Date('2026-10-07T12:00:00.000Z');

  let clock: DeterministicClock;
  let paymentRepo: InMemoryPaymentRepository;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let createPaymentHandler: CreatePaymentHandler;
  let completePaymentHandler: CompletePaymentHandler;

  const createSaleWithTotal = (amount: number, currency: string = 'USD'): Sale => {
    const sale = Sale.create({
      tenantId,
      currency,
      source: SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'treatment_physio_01',
      }),
    });
    sale.addItem({
      source: SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'treatment_physio_01',
      }),
      description: 'Physiotherapy Rehabilitation Package',
      quantity: 1,
      unitPrice: Money.create(amount, currency),
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

    createPaymentHandler = new CreatePaymentHandler(paymentRepo, saleRepo, clock, eventPublisher);
    completePaymentHandler = new CompletePaymentHandler(
      paymentRepo,
      saleRepo,
      clock,
      eventPublisher,
    );
  });

  // ==========================================================================
  // Boundary 1: Payment amount == Sale total (Full Single Settlement)
  // ==========================================================================
  describe('Boundary 1: Payment amount == Sale total (Exact Settlement)', () => {
    it('discharges debt in a single transaction and advances Sale directly from PENDING_PAYMENT to PAID', async () => {
      const sale = createSaleWithTotal(150.0);

      const result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 150.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PAID);
    });
  });

  // ==========================================================================
  // Boundary 2: Payment amount < Sale total (Partial Payments & Deposits)
  // ==========================================================================
  describe('Boundary 2: Payment amount < Sale total (Partial Payments & Customer Deposits)', () => {
    it('accepts an upfront partial deposit, advancing Sale to PARTIALLY_PAID and leaving remaining debt open', async () => {
      const sale = createSaleWithTotal(500.0);

      // Patient leaves $150 deposit upfront for 10-session package
      const depositResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 150.0,
          method: PaymentMethod.CASH,
          reference: 'DEPOSIT-INITIAL',
          tenantId,
        }),
      );

      expect(depositResult.isSuccess).toBe(true);
      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Verify settled payments sum to $150
      const payments = await paymentRepo.findBySaleId(sale.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]!.amount.amount).toBe(150.0);
    });

    it('freezes commercial terms while Sale is in PARTIALLY_PAID status', async () => {
      const sale = createSaleWithTotal(200.0);

      await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      const updatedSale = await saleRepo.findById(sale.id);
      expect(updatedSale!.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Commercial line item additions must be rejected on partially paid sales
      expect(() =>
        updatedSale!.addItem({
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'inv_01',
          }),
          description: 'Extra Bandage',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow();
    });
  });

  // ==========================================================================
  // Boundary 3: Multiple Completed Payments & Split Tenders (1 Sale -> N Payments)
  // ==========================================================================
  describe('Boundary 3: Multiple Completed Payments & Split Tenders (1 Sale -> N Payments)', () => {
    it('supports phased incremental settlement across 3 sequential payments', async () => {
      const sale = createSaleWithTotal(100.0);

      // Tender 1: $30.00
      const p1 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.CASH,
          reference: 'PHASE-1',
          tenantId,
        }),
      );
      expect(p1.isSuccess).toBe(true);
      expect((await saleRepo.findById(sale.id))!.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Tender 2: $40.00
      const p2 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 40.0,
          method: PaymentMethod.QR,
          reference: 'PHASE-2',
          tenantId,
        }),
      );
      expect(p2.isSuccess).toBe(true);
      expect((await saleRepo.findById(sale.id))!.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Tender 3: $30.00 (Clears remaining debt)
      const p3 = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.0,
          method: PaymentMethod.CASH,
          reference: 'PHASE-3',
          tenantId,
        }),
      );
      expect(p3.isSuccess).toBe(true);

      const finalSale = await saleRepo.findById(sale.id);
      expect(finalSale!.status).toBe(SaleStatus.PAID);

      const allPayments = await paymentRepo.findBySaleId(sale.id);
      expect(allPayments).toHaveLength(3);
      expect(allPayments.every((p) => p.status === PaymentStatus.COMPLETED)).toBe(true);
    });

    it('supports split tenders with exact 3-way penny division ($33.33 + $33.33 + $33.34 = $100.00)', async () => {
      const sale = createSaleWithTotal(100.0);

      // Tender 1: $33.33
      await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 33.33,
          method: PaymentMethod.CASH,
          reference: 'PENNY-SPLIT-1',
          tenantId,
        }),
      );

      // Tender 2: $33.33
      await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 33.33,
          method: PaymentMethod.QR,
          reference: 'PENNY-SPLIT-2',
          tenantId,
        }),
      );

      // Tender 3: $33.34 (Exact penny reconciliation without float arithmetic)
      const finalResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 33.34,
          method: PaymentMethod.CASH,
          reference: 'PENNY-SPLIT-3',
          tenantId,
        }),
      );

      expect(finalResult.isSuccess).toBe(true);
      const finalSale = await saleRepo.findById(sale.id);
      expect(finalSale!.status).toBe(SaleStatus.PAID);
    });
  });

  // ==========================================================================
  // Boundary 4: Overpayment Invariant Enforcement (amount > remainingBalance)
  // ==========================================================================
  describe('Boundary 4: Overpayment Invariant Enforcement (Prohibited)', () => {
    it('rejects an initial payment exceeding Sale total on CreatePayment', async () => {
      const sale = createSaleWithTotal(100.0);

      const result = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 100.01, // Overpayment by 1 cent!
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(PaymentOverpaymentException);
      expect((result.getError() as Error).message).toContain('exceeds the remaining sale balance');
    });

    it('rejects a second payment that exceeds the remaining unpaid balance on CreatePayment', async () => {
      const sale = createSaleWithTotal(100.0);

      // Pay $70
      await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 70.0,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      // Attempt to pay $30.01 ($0.01 over remaining $30 balance)
      const overpayResult = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 30.01,
          method: PaymentMethod.CASH,
          tenantId,
        }),
      );

      expect(overpayResult.isFailure).toBe(true);
      expect(overpayResult.getError()).toBeInstanceOf(PaymentOverpaymentException);
    });

    it('rejects CompletePayment if sibling settled payments have reduced balance below pending tender amount', async () => {
      const sale = createSaleWithTotal(100.0);

      // Create Pending Payment A for $60
      const pendingARes = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 60.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
          reference: 'PENDING-A',
          tenantId,
        }),
      );
      expect(pendingARes.isSuccess).toBe(true);
      const pendingAId = pendingARes.getValue().id;

      // In parallel or in the interim, tender B for $50 CASH is recorded as COMPLETED
      const tenderBRes = await createPaymentHandler.execute(
        new CreatePaymentCommand({
          saleId: sale.id.value,
          amount: 50.0,
          method: PaymentMethod.CASH,
          reference: 'INTERIM-CASH-B',
          tenantId,
        }),
      );
      expect(tenderBRes.isSuccess).toBe(true);

      // Now remaining balance is $50.00.
      // Attempting to complete Pending Payment A ($60.00) must be rejected because $60 > $50!
      const completeAResult = await completePaymentHandler.execute(
        new CompletePaymentCommand({
          paymentId: pendingAId,
          saleId: sale.id.value,
          tenantId,
        }),
      );

      expect(completeAResult.isFailure).toBe(true);
      expect(completeAResult.getError()).toBeInstanceOf(PaymentOverpaymentException);

      // Verify Payment A was NOT completed
      const unchangedPaymentA = await paymentRepo.findById(pendingAId);
      expect(unchangedPaymentA!.status).toBe(PaymentStatus.PENDING);
    });
  });

  // ==========================================================================
  // Boundary 5: Pure Payment Domain Invariant Validation (Intrinsic)
  // ==========================================================================
  describe('Boundary 5: Pure Payment Domain Invariant Validation (Intrinsic to Payment)', () => {
    it('enforces amount > $0.00 strictly in Payment domain without Sale knowledge', () => {
      // 0 cents
      expect(() =>
        Payment.createCompleted({
          saleId: SaleId.create('sale_dummy'),
          tenantId,
          method: PaymentMethod.CASH,
          amount: Money.zero('USD'),
        }),
      ).toThrow(PaymentDomainException);

      // Negative cents (rejected at Money VO level)
      expect(() => Money.create(-10.0, 'USD')).toThrow(InvalidMoneyException);
    });

    it('demonstrates Payment aggregate does not validate against Sale total intrinsically', () => {
      // A $1,000,000 payment aggregate is independently valid in domain if positive and well-formed
      const millionDollars = Money.create(1000000.0, 'USD');
      const payment = Payment.createCompleted({
        saleId: SaleId.create('sale_dummy'),
        tenantId,
        method: PaymentMethod.CASH,
        amount: millionDollars,
      });

      expect(payment.amount.amount).toBe(1000000.0);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
    });
  });
});
