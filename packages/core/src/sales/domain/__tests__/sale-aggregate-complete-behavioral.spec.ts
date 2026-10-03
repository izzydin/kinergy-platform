import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { Payment } from '../payment.aggregate';
import { PaymentId } from '../value-objects/payment-id.vo';
import { PaymentMethod } from '../enums/payment-method.enum';
import { EmptySaleException } from '../exceptions/empty-sale.exception';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { InvalidSaleTransitionException } from '../exceptions/invalid-sale-transition.exception';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { Clock } from '../shared/clock';
import { SalePaymentCoordinationService } from '../../application/services/sale-payment-coordination.service';
import { SaleRepositoryPort } from '../../application/ports/sale-repository.port';
import { PaymentRepositoryPort } from '../../application/ports/payment-repository.port';
import { PaymentNotFoundException } from '../../application/exceptions/payment-not-found.exception';
import { PaymentSaleMismatchException } from '../../application/exceptions/payment-sale-mismatch.exception';
import { PaymentNotCompletedException } from '../../application/exceptions/payment-not-completed.exception';
import { InsufficientPaymentException } from '../../application/exceptions/insufficient-payment.exception';

class DeterministicClock implements Clock {
  constructor(private readonly fixedDate: Date) {}
  public now(): Date {
    return new Date(this.fixedDate.getTime());
  }
}

class InMemorySaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }
  public async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

class InMemoryPaymentRepo implements PaymentRepositoryPort {
  public store = new Map<string, Payment>();
  public async findById(id: PaymentId | string): Promise<Payment | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.store.get(key) ?? null;
  }
  public async findBySaleId(saleId: SaleId | string): Promise<Payment[]> {
    const key = typeof saleId === 'string' ? saleId : saleId.value;
    return Array.from(this.store.values()).filter((p) => p.saleId.value === key);
  }
  public async save(payment: Payment): Promise<void> {
    this.store.set(payment.id.value, payment);
  }
}

describe('Master Behavioral Test Suite: Sale Aggregate', () => {
  const clock = new DeterministicClock(new Date('2026-09-28T12:00:00.000Z'));

  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-protein-01',
    sourceCode: 'WHEY-500',
  });

  const sessionSource = SourceReference.create({
    sourceType: SourceType.TREATMENT_SESSION,
    sourceId: 'session-rehab-01',
    sourceCode: 'KINESIO-60',
  });

  // ==========================================================================
  // 1. Item Invariants
  // ==========================================================================
  describe('1. Item Invariants', () => {
    it('Sale starts without items if construction allows drafts', () => {
      const sale = Sale.create({ source: validSource }, clock);

      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.itemCount).toBe(0);
      expect(sale.items).toHaveLength(0);
      expect(sale.subtotal.isZero()).toBe(true);
      expect(sale.total.isZero()).toBe(true);
    });

    it('commercially valid Sale requires at least one item to finalize', () => {
      const emptySale = Sale.create({ source: validSource }, clock);

      expect(() => emptySale.finalize(clock)).toThrow(EmptySaleException);
    });

    it('adding a valid item updates items count and recalculates totals', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Whey Protein 500g',
          quantity: 2,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      expect(sale.itemCount).toBe(1);
      expect(sale.hasItem(item.id)).toBe(true);
      expect(sale.getItem(item.id)).toBeDefined();
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.total.amount).toBe(50.0);
    });

    it('adding multiple items aggregates quantities and subtotals accurately', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item A',
          quantity: 3,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: sessionSource,
          description: 'Item B',
          quantity: 1,
          unitPrice: Money.create(70.0, 'USD'),
        },
        clock,
      );

      expect(sale.itemCount).toBe(2);
      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.total.amount).toBe(100.0);
    });

    it('removing an item removes it from collection and updates totals', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item1 = sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(40.0, 'USD'),
        },
        clock,
      );
      const item2 = sale.addItem(
        {
          source: sessionSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(60.0, 'USD'),
        },
        clock,
      );

      expect(sale.itemCount).toBe(2);
      expect(sale.total.amount).toBe(100.0);

      sale.removeItem(item1.id, clock);

      expect(sale.itemCount).toBe(1);
      expect(sale.hasItem(item1.id)).toBe(false);
      expect(sale.hasItem(item2.id)).toBe(true);
      expect(sale.total.amount).toBe(60.0);
    });

    it('attempting invalid removal of non-existent item throws InvalidSaleStateException', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );

      expect(() => sale.removeItem('non-existent-item-id', clock)).toThrow(
        InvalidSaleStateException,
      );
    });

    it("attempting to attach another Sale's item throws InvalidSaleStateException", () => {
      const saleA = Sale.create({ id: SaleId.create('sale-a'), source: validSource }, clock);
      const saleB = Sale.create({ id: SaleId.create('sale-b'), source: validSource }, clock);

      const itemBelongingToB = SaleItem.create({
        saleId: saleB.id,
        source: validSource,
        description: 'Exclusive to Sale B',
        quantity: 1,
        unitPrice: Money.create(50.0, 'USD'),
      });

      expect(() => saleA.addItem(itemBelongingToB, clock)).toThrow(InvalidSaleStateException);
      expect(() => saleA.addItem(itemBelongingToB, clock)).toThrow(
        /Cross-Sale item attachment is strictly prohibited/,
      );
    });

    it('item quantity validation rejects non-positive or excessive quantities', () => {
      expect(() =>
        SaleItem.create({
          source: validSource,
          description: 'Zero quantity',
          quantity: 0,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      expect(() =>
        SaleItem.create({
          source: validSource,
          description: 'Negative quantity',
          quantity: -2,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      expect(() =>
        SaleItem.create({
          source: validSource,
          description: 'Over max quantity',
          quantity: 1_000_000,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);
    });

    it('item price validation rejects negative prices', () => {
      expect(() => Money.create(-5.0, 'USD')).toThrow(InvalidMoneyException);
    });

    it('collection immutability prevents callers from mutating items array externally', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      const items = sale.items;
      expect(() => (items as unknown as SaleItem[]).push(items[0]!)).toThrow();
      expect(sale.itemCount).toBe(1);
    });
  });

  // ==========================================================================
  // 2. Discount Invariants
  // ==========================================================================
  describe('2. Discount Invariants', () => {
    it('applies valid fixed discount to order', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      sale.applyDiscount(Discount.fixed(15.0, '$15 voucher'), clock);

      expect(sale.orderDiscount?.value).toBe(15.0);
      expect(sale.discountTotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(85.0);
    });

    it('applies valid percentage discount to order', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(200.0, 'USD'),
        },
        clock,
      );

      sale.applyDiscount(Discount.percentage(10.0, '10% membership discount'), clock);

      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(180.0);
    });

    it('rejects invalid discounts with negative values or excessive percentages', () => {
      expect(() => Discount.fixed(-10.0)).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(-5.0)).toThrow(InvalidDiscountException);
      expect(() => Discount.percentage(105.0)).toThrow(InvalidDiscountException);
    });

    it('caps fixed discount exceeding eligible amount so total never becomes negative', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      sale.applyDiscount(Discount.fixed(100.0, 'Huge voucher exceeding cart total'), clock);

      expect(sale.discountTotal.amount).toBe(50.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
    });

    it('compounds line-item and order-level discounts correctly', () => {
      const sale = Sale.create({ source: validSource }, clock);
      // Item: $100 with $10 line discount -> net item = $90
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
          discount: Discount.fixed(10.0, 'Line promo'),
        },
        clock,
      );

      // Order discount: 10% on remaining net $90 = $9
      sale.applyDiscount(Discount.percentage(10.0, 'Order 10%'), clock);

      expect(sale.subtotal.amount).toBe(100.0);
      expect(sale.discountTotal.amount).toBe(19.0); // $10 line + $9 order
      expect(sale.total.amount).toBe(81.0);
    });

    it('removes discount and deterministically recalculates totals', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(80.0, 'USD'),
        },
        clock,
      );
      sale.applyDiscount(Discount.fixed(20.0, 'Voucher'), clock);
      expect(sale.total.amount).toBe(60.0);

      sale.removeDiscount(clock);

      expect(sale.orderDiscount).toBeNull();
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(80.0);
    });
  });

  // ==========================================================================
  // 3. Financial Invariants
  // ==========================================================================
  describe('3. Financial Invariants', () => {
    it('calculates subtotal as exact sum of line items', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 2,
          unitPrice: Money.create(12.5, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: validSource,
          description: 'Item 2',
          quantity: 3,
          unitPrice: Money.create(8.25, 'USD'),
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(49.75);
    });

    it('supports legitimate zero total commercial agreements', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Complimentary promotional item',
          quantity: 1,
          unitPrice: Money.create(0.0, 'USD'),
        },
        clock,
      );

      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.isZero()).toBe(true);
      expect(() => sale.finalize(clock)).not.toThrow();
    });

    it('guarantees total cannot become negative under any circumstance', () => {
      // 1. Line-item discount exceeding item amount is strictly rejected
      expect(() =>
        SaleItem.create({
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
          discount: Discount.fixed(50.0), // Discount exceeds price
        }),
      ).toThrow(InvalidDiscountException);

      // 2. Order discount can reduce total down to exactly $0.00 but never negative
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );
      sale.applyDiscount(Discount.percentage(100.0), clock);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
      expect(sale.total.isZero()).toBe(true);
    });

    it('maintains deterministic cent arithmetic avoiding JavaScript binary floating-point flaws', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(0.1, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source: validSource,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(0.2, 'USD'),
        },
        clock,
      );

      // In binary float: 0.1 + 0.2 = 0.30000000000000004
      // In Money integer cents: 10 + 20 = 30 cents ($0.30)
      expect(sale.total.amount).toBe(0.3);
      expect(sale.total.cents).toBe(30);
      expect(sale.total.toString()).toBe('0.30 USD');
    });

    it('strictly enforces single currency homogeneity across aggregate', () => {
      const sale = Sale.create({ source: validSource, currency: 'USD' }, clock);

      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Euro Item',
            quantity: 1,
            unitPrice: Money.create(20.0, 'EUR'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });
  });

  // ==========================================================================
  // 4. Lifecycle & State Machine
  // ==========================================================================
  describe('4. Lifecycle & State Machine', () => {
    it('follows valid state machine: DRAFT -> PENDING_PAYMENT -> PARTIALLY_PAID -> PAID -> COMPLETED', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Membership',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.version).toBe(1);

      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.version).toBe(2);

      sale.markPartiallyPaid(clock);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(sale.version).toBe(3);

      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
      expect(sale.version).toBe(4);

      sale.markCompleted(clock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);
      expect(sale.completedAt).toBeDefined();
      expect(sale.version).toBe(5);
    });

    it('rejects invalid or skipped state machine transitions', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      // Cannot skip directly to PAID from DRAFT
      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);

      // Cannot skip directly to COMPLETED from DRAFT
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
    });

    it('rejects repeated transitions to the same status', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);

      expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
    });

    it('asserts isTerminal() returns true strictly for CANCELLED and REFUNDED', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      expect(sale.isTerminal()).toBe(false);

      sale.cancel('Order cancelled', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.isTerminal()).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Payment Relationship & Coordination
  // ==========================================================================
  describe('5. Payment Relationship & Coordination', () => {
    let saleRepo: InMemorySaleRepo;
    let paymentRepo: InMemoryPaymentRepo;
    let service: SalePaymentCoordinationService;

    beforeEach(() => {
      saleRepo = new InMemorySaleRepo();
      paymentRepo = new InMemoryPaymentRepo();
      service = new SalePaymentCoordinationService(saleRepo, paymentRepo, clock);
    });

    it('settles Sale to PAID upon full valid completed Payment tender', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-01'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-001'),
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
      });

      expect(result.isSuccess).toBe(true);
      expect(sale.status).toBe(SaleStatus.PAID);
    });

    it('fails coordination if Payment does not exist', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-02'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: 'non-existent-pay-id',
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentNotFoundException);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('fails coordination if Payment is in PENDING status', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-03'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-pending-01'),
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(payment); // Status is PENDING

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('fails coordination if Payment is FAILED', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-04'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-failed-01'),
          saleId: sale.id,
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      payment.fail({ reason: 'Card network declined transaction', clock });
      await paymentRepo.save(payment);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('fails coordination if Payment is CANCELLED', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-05'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const payment = Payment.createPending(
        {
          id: PaymentId.create('pay-cancelled-01'),
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      payment.cancel({ reason: 'Customer cancelled transaction', clock });
      await paymentRepo.save(payment);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: payment.id,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentNotCompletedException);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('fails coordination if Payment belongs to another Sale', async () => {
      const saleA = Sale.create({ id: SaleId.create('sale-A'), source: validSource }, clock);
      saleA.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      saleA.finalize(clock);
      await saleRepo.save(saleA);

      const paymentForB = Payment.createCompleted(
        {
          id: PaymentId.create('pay-for-B'),
          saleId: SaleId.create('sale-B'),
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      await paymentRepo.save(paymentForB);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: saleA.id,
        paymentId: paymentForB.id,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(PaymentSaleMismatchException);
      expect(saleA.status).toBe(SaleStatus.PENDING_PAYMENT);
    });

    it('fails coordination if Payment amount is insufficient to settle the debt', async () => {
      const sale = Sale.create({ id: SaleId.create('sale-pay-06'), source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Service',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      await saleRepo.save(sale);

      const partialPayment = Payment.createCompleted(
        {
          id: PaymentId.create('pay-partial-01'),
          saleId: sale.id,
          method: PaymentMethod.CASH,
          amount: Money.create(40.0, 'USD'), // $40 is less than $100
        },
        clock,
      );
      await paymentRepo.save(partialPayment);

      const result = await service.coordinateSalePaymentSettlement({
        saleId: sale.id,
        paymentId: partialPayment.id,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InsufficientPaymentException);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
    });
  });

  // ==========================================================================
  // 6. Cancellation Invariants
  // ==========================================================================
  describe('6. Cancellation Invariants', () => {
    it('cancelled Sale permanently rejects adding items', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Customer changed mind', clock);

      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Item 2',
            quantity: 1,
            unitPrice: Money.create(30.0, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale permanently rejects removing items', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Order cancelled', clock);

      expect(() => sale.removeItem(item.id, clock)).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale permanently rejects applying discounts', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Order cancelled', clock);

      expect(() => sale.applyDiscount(Discount.fixed(10.0), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
    });

    it('cancelled Sale financial state is permanently frozen', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Order cancelled', clock);

      expect(() => sale.calculateTotals()).toThrow(SaleAlreadyFinalizedException);
      expect(sale.total.amount).toBe(50.0);
    });

    it('cancelled Sale cannot become PAID or COMPLETED', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Order cancelled', clock);

      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot silently reactivate back to DRAFT or PENDING_PAYMENT', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
      sale.cancel('Order cancelled', clock);

      expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPendingPayment(clock)).toThrow(InvalidSaleTransitionException);
      expect(sale.isTerminal()).toBe(true);
    });
  });

  // ==========================================================================
  // 7. Aggregate Encapsulation
  // ==========================================================================
  describe('7. Aggregate Encapsulation', () => {
    it('callers cannot mutate internal item collections via external reference', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(30.0, 'USD'),
        },
        clock,
      );

      const itemsSnapshot = sale.items;
      expect(() => {
        (itemsSnapshot as unknown as SaleItem[]).length = 0;
      }).toThrow();

      expect(sale.itemCount).toBe(1);
    });

    it('callers cannot assign financial state through public APIs (read-only totals)', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(100.0, 'USD'),
        },
        clock,
      );

      const saleAny = sale as unknown as Record<string, unknown>;
      expect(typeof Object.getOwnPropertyDescriptor(Sale.prototype, 'total')?.set).toBe(
        'undefined',
      );
      expect(typeof Object.getOwnPropertyDescriptor(Sale.prototype, 'subtotal')?.set).toBe(
        'undefined',
      );
      expect(typeof Object.getOwnPropertyDescriptor(Sale.prototype, 'discountTotal')?.set).toBe(
        'undefined',
      );

      // Attempting write to total throws or fails
      expect(() => {
        saleAny.total = Money.create(0.0, 'USD');
      }).toThrow();
      expect(sale.total.amount).toBe(100.0);
    });

    it('domain methods are the sole mechanism for state and cart modifications', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(sale.status).toBe(SaleStatus.DRAFT);

      // Attempting direct mutation on status throws
      const saleAny = sale as unknown as Record<string, unknown>;
      expect(() => {
        saleAny.status = SaleStatus.PAID;
      }).toThrow();

      expect(sale.status).toBe(SaleStatus.DRAFT);
    });
  });
});
