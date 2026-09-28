import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
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
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { Clock } from '../shared/clock';
import { SalePaymentCoordinationService } from '../../application/services/sale-payment-coordination.service';
import { SaleRepositoryPort } from '../../application/ports/sale-repository.port';
import { PaymentRepositoryPort } from '../../application/ports/payment-repository.port';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
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

interface SaleSnapshot {
  itemCount: number;
  itemIds: string[];
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  status: SaleStatus;
  version: number;
  updatedAt: number;
  cancellationReason?: string;
  cancelledAt?: number;
}

function captureSaleSnapshot(sale: Sale): SaleSnapshot {
  return {
    itemCount: sale.itemCount,
    itemIds: sale.items.map((i) => i.id.value),
    subtotalCents: sale.subtotal.cents,
    discountTotalCents: sale.discountTotal.cents,
    totalCents: sale.total.cents,
    status: sale.status,
    version: sale.version,
    updatedAt: sale.updatedAt.getTime(),
    cancellationReason: sale.cancellationReason,
    cancelledAt: sale.cancelledAt?.getTime(),
  };
}

describe('Senior Financial Systems Invariant Property Matrix: Sale Aggregate', () => {
  const clock = new DeterministicClock(new Date('2026-09-28T14:00:00.000Z'));
  const source = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-alpha-01',
    sourceCode: 'SKU-ALPHA-01',
  });

  // ==========================================================================
  // Property 1: Universal Financial Mathematical Invariant (I_math)
  // For ANY valid item collection:
  //   subtotal >= 0
  //   discountTotal >= 0
  //   total >= 0
  //   total = subtotal - discountTotal
  // ==========================================================================
  describe('Property 1: Universal Financial Mathematical Invariants', () => {
    interface InvariantTestVector {
      name: string;
      items: Array<{
        description: string;
        quantity: number;
        unitPriceAmount: number;
        lineDiscount?: Discount;
      }>;
      orderDiscount?: Discount;
    }

    const testVectors: InvariantTestVector[] = [
      {
        name: 'Empty cart (draft initialization)',
        items: [],
      },
      {
        name: 'Single zero-dollar promotional item ($0.00)',
        items: [{ description: 'Promo sticker', quantity: 1, unitPriceAmount: 0.0 }],
      },
      {
        name: 'Minimum cent boundary transaction ($0.01)',
        items: [{ description: 'Cent item', quantity: 1, unitPriceAmount: 0.01 }],
      },
      {
        name: 'Fractional quantity with sub-cent price rounding (0.333 @ $10.00)',
        items: [{ description: 'Bulk herbs', quantity: 0.333, unitPriceAmount: 10.0 }],
      },
      {
        name: 'Standard retail transaction (3 diverse line items)',
        items: [
          { description: 'Whey Protein', quantity: 2, unitPriceAmount: 29.99 },
          { description: 'Creatine', quantity: 1, unitPriceAmount: 19.5 },
          { description: 'Shaker Bottle', quantity: 3, unitPriceAmount: 7.25 },
        ],
      },
      {
        name: 'High-value enterprise medical equipment transaction ($125,000.00)',
        items: [{ description: 'Cryotherapy Chamber', quantity: 1, unitPriceAmount: 125000.0 }],
      },
      {
        name: 'Order with fixed discount below subtotal',
        items: [
          { description: 'Massage Session', quantity: 1, unitPriceAmount: 85.0 },
          { description: 'Aromatherapy Oil', quantity: 2, unitPriceAmount: 12.5 },
        ],
        orderDiscount: Discount.fixed(20.0, 'Loyalty voucher'),
      },
      {
        name: 'Order with percentage discount (15% off)',
        items: [
          { description: 'PT Session 10-pack', quantity: 1, unitPriceAmount: 450.0 },
          { description: 'Nutrition Plan', quantity: 1, unitPriceAmount: 150.0 },
        ],
        orderDiscount: Discount.percentage(15.0, 'Seasonal 15% promo'),
      },
      {
        name: 'Order with 100% percentage discount (comped/scholarship session)',
        items: [{ description: 'Rehab Session', quantity: 1, unitPriceAmount: 120.0 }],
        orderDiscount: Discount.percentage(100.0, 'Director 100% comp'),
      },
      {
        name: 'Order with fixed discount equal to exact subtotal ($50 off $50)',
        items: [{ description: 'Day Pass', quantity: 2, unitPriceAmount: 25.0 }],
        orderDiscount: Discount.fixed(50.0, 'Exact $50 credit voucher'),
      },
      {
        name: 'Order with fixed discount exceeding subtotal ($200 off $150 cart)',
        items: [{ description: 'Personal Training', quantity: 1, unitPriceAmount: 150.0 }],
        orderDiscount: Discount.fixed(200.0, 'Excessive voucher capped at cart total'),
      },
      {
        name: 'Complex multi-tier compounded discounts (line-item fixed + line-item percent + order percent)',
        items: [
          {
            description: 'Item A',
            quantity: 2,
            unitPriceAmount: 50.0,
            lineDiscount: Discount.fixed(5.0, 'Item A $5 coupon'), // subtotal $100 - $10 = $90
          },
          {
            description: 'Item B',
            quantity: 1,
            unitPriceAmount: 80.0,
            lineDiscount: Discount.percentage(25.0, 'Item B 25% clearance'), // $80 - $20 = $60
          },
          {
            description: 'Item C',
            quantity: 3,
            unitPriceAmount: 15.0, // $45 net
          },
        ],
        orderDiscount: Discount.percentage(10.0, 'VIP 10% on remaining net cart'),
      },
    ];

    test.each(testVectors)('$name', ({ items, orderDiscount }) => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);

      for (const item of items) {
        sale.addItem(
          {
            source,
            description: item.description,
            quantity: item.quantity,
            unitPrice: Money.create(item.unitPriceAmount, 'USD'),
            discount: item.lineDiscount,
          },
          clock,
        );
      }

      if (orderDiscount) {
        sale.applyDiscount(orderDiscount, clock);
      }

      // Invariant 1: subtotal >= 0
      expect(sale.subtotal.amount).toBeGreaterThanOrEqual(0);
      expect(sale.subtotal.cents).toBeGreaterThanOrEqual(0);

      // Invariant 2: discountTotal >= 0
      expect(sale.discountTotal.amount).toBeGreaterThanOrEqual(0);
      expect(sale.discountTotal.cents).toBeGreaterThanOrEqual(0);

      // Invariant 3: total >= 0
      expect(sale.total.amount).toBeGreaterThanOrEqual(0);
      expect(sale.total.cents).toBeGreaterThanOrEqual(0);

      // Invariant 4: total = subtotal - discountTotal
      const expectedTotal = sale.subtotal.subtract(sale.discountTotal);
      expect(sale.total.equals(expectedTotal)).toBe(true);
      expect(sale.total.cents).toBe(sale.subtotal.cents - sale.discountTotal.cents);
      expect(sale.total.amount).toBeCloseTo(sale.subtotal.amount - sale.discountTotal.amount, 2);
    });
  });

  // ==========================================================================
  // Property 2: Item Ownership & Encapsulation Invariant (I_ownership)
  // For ANY valid Sale:
  //   all SaleItems belong to the Sale
  //   callers cannot mutate internal collections
  // ==========================================================================
  describe('Property 2: Item Ownership & Encapsulation Invariant', () => {
    it('guarantees every attached SaleItem strictly references the parent SaleId', () => {
      const sale = Sale.create({ source }, clock);
      sale.addItem(
        {
          source,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.addItem(
        {
          source,
          description: 'Item 2',
          quantity: 2,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );

      for (const item of sale.items) {
        expect(item.saleId).toBeDefined();
        expect(item.saleId?.equals(sale.id)).toBe(true);
        expect(item.unitPrice.currency).toBe(sale.currency);
        expect(item.subtotal.currency).toBe(sale.currency);
        expect(item.total.currency).toBe(sale.currency);
      }
    });

    it('strictly rejects attaching SaleItem instances belonging to a foreign Sale', () => {
      const sale1 = Sale.create({ id: SaleId.create('sale-uuid-1'), source }, clock);
      const sale2 = Sale.create({ id: SaleId.create('sale-uuid-2'), source }, clock);

      const itemBelongingToSale1 = SaleItem.create({
        saleId: sale1.id,
        source,
        description: 'Item for Sale 1',
        quantity: 1,
        unitPrice: Money.create(35.0, 'USD'),
      });

      expect(() => sale2.addItem(itemBelongingToSale1, clock)).toThrow(InvalidSaleStateException);
      expect(() => sale2.addItem(itemBelongingToSale1, clock)).toThrow(
        /Cross-Sale item attachment is strictly prohibited/,
      );

      // Verify sale2 remains unmodified
      expect(sale2.itemCount).toBe(0);
      expect(sale2.total.isZero()).toBe(true);
    });

    it('enforces collection immutability: mutating returned array does not corrupt aggregate', () => {
      const sale = Sale.create({ source }, clock);
      sale.addItem(
        {
          source,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );

      const items = sale.items;
      expect(() => {
        (items as unknown as SaleItem[]).push(
          SaleItem.create({
            saleId: sale.id,
            source,
            description: 'Illicit item',
            quantity: 1,
            unitPrice: Money.create(999.0, 'USD'),
          }),
        );
      }).toThrow();

      expect(sale.itemCount).toBe(1);
      expect(sale.total.amount).toBe(25.0);
    });
  });

  // ==========================================================================
  // Property 3: Cancelled Sale Financial Freeze Invariant (I_freeze)
  // A cancelled Sale CANNOT accept any financial mutations or state transitions
  // ==========================================================================
  describe('Property 3: Cancelled Sale Financial Freeze Invariant', () => {
    type MutationMethod = (sale: Sale) => void;

    const attemptedMutations: Array<[string, MutationMethod]> = [
      [
        'addItem()',
        (s) =>
          s.addItem(
            {
              source,
              description: 'Post-cancel item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'USD'),
            },
            clock,
          ),
      ],
      ['removeItem()', (s) => s.removeItem('item-1', clock)],
      ['updateItemQuantity()', (s) => s.updateItemQuantity('item-1', 5, clock)],
      [
        'updateItem()',
        (s) => s.updateItem('item-1', { quantity: 3, discount: Discount.fixed(5) }, clock),
      ],
      ['applyItemDiscount()', (s) => s.applyItemDiscount('item-1', Discount.fixed(2), clock)],
      ['removeItemDiscount()', (s) => s.removeItemDiscount('item-1', clock)],
      ['applyOrderDiscount()', (s) => s.applyOrderDiscount(Discount.fixed(10), clock)],
      ['removeOrderDiscount()', (s) => s.removeOrderDiscount(clock)],
      ['calculateTotals()', (s) => s.calculateTotals()],
      ['assignClient()', (s) => s.assignClient('client-new')],
      ['finalize()', (s) => s.finalize(clock)],
      ['markPendingPayment()', (s) => s.markPendingPayment(clock)],
      ['markPartiallyPaid()', (s) => s.markPartiallyPaid(clock)],
      ['markPaid()', (s) => s.markPaid(clock)],
      ['markCompleted()', (s) => s.markCompleted(clock)],
      ['cancel() again', (s) => s.cancel('Attempt second cancel', clock)],
    ];

    test.each(attemptedMutations)(
      'rejects %s and preserves identical aggregate state',
      (_, mutation) => {
        const sale = Sale.create({ source }, clock);
        sale.addItem(
          {
            id: SaleItemId.create('item-1'),
            source,
            description: 'Item 1',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
          },
          clock,
        );
        sale.cancel('Client requested cancellation', clock);
        expect(sale.status).toBe(SaleStatus.CANCELLED);

        const snapshotBefore = captureSaleSnapshot(sale);

        // All mutations must throw
        expect(() => mutation(sale)).toThrow();

        const snapshotAfter = captureSaleSnapshot(sale);

        // Verify state is completely preserved
        expect(snapshotAfter).toEqual(snapshotBefore);
      },
    );
  });

  // ==========================================================================
  // Property 4: Settlement Precondition Invariant (I_settlement)
  // A Sale cannot become PAID without a valid completed Payment
  // ==========================================================================
  describe('Property 4: Settlement Precondition Invariant', () => {
    let saleRepo: InMemorySaleRepo;
    let paymentRepo: InMemoryPaymentRepo;
    let coordinationService: SalePaymentCoordinationService;

    beforeEach(() => {
      saleRepo = new InMemorySaleRepo();
      paymentRepo = new InMemoryPaymentRepo();
      coordinationService = new SalePaymentCoordinationService(saleRepo, paymentRepo, clock);
    });

    it('rejects direct markPaid() from DRAFT status without finalization and payment', () => {
      const sale = Sale.create({ source }, clock);
      sale.addItem(
        {
          source,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(60.0, 'USD'),
        },
        clock,
      );

      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });

    const invalidPaymentScenarios: Array<{
      name: string;
      setupPayment: (sale: Sale) => Promise<string>;
    }> = [
      {
        name: 'Payment record does not exist in store',
        setupPayment: async () => 'non-existent-payment-id',
      },
      {
        name: 'Payment is in PENDING status (not yet settled)',
        setupPayment: async (sale) => {
          const p = Payment.createPending(
            {
              id: PaymentId.create('pay-pending'),
              saleId: sale.id,
              method: PaymentMethod.QR,
              amount: sale.total,
            },
            clock,
          );
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
      {
        name: 'Payment is in FAILED status',
        setupPayment: async (sale) => {
          const p = Payment.createPending(
            {
              id: PaymentId.create('pay-failed'),
              saleId: sale.id,
              method: PaymentMethod.QR,
              amount: sale.total,
            },
            clock,
          );
          p.fail({ reason: 'Insufficient funds', clock });
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
      {
        name: 'Payment is in CANCELLED status',
        setupPayment: async (sale) => {
          const p = Payment.createPending(
            {
              id: PaymentId.create('pay-cancelled'),
              saleId: sale.id,
              method: PaymentMethod.CASH,
              amount: sale.total,
            },
            clock,
          );
          p.cancel({ reason: 'Voided by clerk', clock });
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
      {
        name: 'Payment belongs to a completely different Sale',
        setupPayment: async () => {
          const foreignSaleId = SaleId.create('foreign-sale-999');
          const p = Payment.createCompleted(
            {
              id: PaymentId.create('pay-foreign'),
              saleId: foreignSaleId,
              method: PaymentMethod.CASH,
              amount: Money.create(100.0, 'USD'),
            },
            clock,
          );
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
      {
        name: 'Payment has currency mismatch (EUR payment on USD sale)',
        setupPayment: async (sale) => {
          const p = Payment.createCompleted(
            {
              id: PaymentId.create('pay-currency-mismatch'),
              saleId: sale.id,
              method: PaymentMethod.CASH,
              amount: Money.create(100.0, 'EUR'),
            },
            clock,
          );
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
      {
        name: 'Payment is partial/underpaid ($40 payment on $100 sale)',
        setupPayment: async (sale) => {
          const p = Payment.createCompleted(
            {
              id: PaymentId.create('pay-underpaid'),
              saleId: sale.id,
              method: PaymentMethod.CASH,
              amount: Money.create(40.0, 'USD'),
            },
            clock,
          );
          await paymentRepo.save(p);
          return p.id.value;
        },
      },
    ];

    test.each(invalidPaymentScenarios)(
      'rejects settlement when $name',
      async ({ setupPayment }) => {
        const sale = Sale.create({ id: SaleId.create('sale-test-settle'), source }, clock);
        sale.addItem(
          {
            source,
            description: 'Consultation',
            quantity: 1,
            unitPrice: Money.create(100.0, 'USD'),
          },
          clock,
        );
        sale.finalize(clock);
        await saleRepo.save(sale);

        const paymentId = await setupPayment(sale);

        const result = await coordinationService.coordinateSalePaymentSettlement({
          saleId: sale.id,
          paymentId,
        });

        // Coordination MUST fail
        expect(result.isSuccess).toBe(false);

        // Sale MUST NOT become PAID
        expect(sale.status).not.toBe(SaleStatus.PAID);
        expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      },
    );
  });

  // ==========================================================================
  // Property 5: State Machine State-Preservation under Invalid Transitions (I_state-preservation)
  // Invalid lifecycle transitions MUST NOT alter aggregate state
  // ==========================================================================
  describe('Property 5: State Machine State-Preservation under Invalid Transitions', () => {
    function instantiateSaleInStatus(targetStatus: SaleStatus): Sale {
      const sale = Sale.create({ source }, clock);
      sale.addItem(
        {
          source,
          description: 'Base item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );

      if (targetStatus === SaleStatus.DRAFT) return sale;

      sale.finalize(clock);
      if (targetStatus === SaleStatus.PENDING_PAYMENT) return sale;

      if (targetStatus === SaleStatus.PARTIALLY_PAID) {
        sale.markPartiallyPaid(clock);
        return sale;
      }

      if (targetStatus === SaleStatus.PAID) {
        sale.markPaid(clock);
        return sale;
      }

      if (targetStatus === SaleStatus.COMPLETED) {
        sale.markPaid(clock);
        sale.markCompleted(clock);
        return sale;
      }

      if (targetStatus === SaleStatus.CANCELLED) {
        sale.cancel('Cancelled for test', clock);
        return sale;
      }

      if (targetStatus === SaleStatus.REFUNDED) {
        sale.markPaid(clock);
        sale.markRefunded('Refunded for test', clock);
        return sale;
      }

      return sale;
    }

    const invalidTransitionMatrix: Array<{
      currentStatus: SaleStatus;
      attemptAction: string;
      action: (s: Sale) => void;
    }> = [
      // From DRAFT
      {
        currentStatus: SaleStatus.DRAFT,
        attemptAction: 'markPartiallyPaid()',
        action: (s) => s.markPartiallyPaid(clock),
      },
      {
        currentStatus: SaleStatus.DRAFT,
        attemptAction: 'markPaid()',
        action: (s) => s.markPaid(clock),
      },
      {
        currentStatus: SaleStatus.DRAFT,
        attemptAction: 'markCompleted()',
        action: (s) => s.markCompleted(clock),
      },
      {
        currentStatus: SaleStatus.DRAFT,
        attemptAction: 'markRefunded()',
        action: (s) => s.markRefunded('Reason', clock),
      },

      // From PENDING_PAYMENT
      {
        currentStatus: SaleStatus.PENDING_PAYMENT,
        attemptAction: 'finalize()',
        action: (s) => s.finalize(clock),
      },
      {
        currentStatus: SaleStatus.PENDING_PAYMENT,
        attemptAction: 'markCompleted()',
        action: (s) => s.markCompleted(clock),
      },
      {
        currentStatus: SaleStatus.PENDING_PAYMENT,
        attemptAction: 'markRefunded()',
        action: (s) => s.markRefunded('Reason', clock),
      },

      // From PAID
      {
        currentStatus: SaleStatus.PAID,
        attemptAction: 'finalize()',
        action: (s) => s.finalize(clock),
      },
      {
        currentStatus: SaleStatus.PAID,
        attemptAction: 'markPendingPayment()',
        action: (s) => s.markPendingPayment(clock),
      },
      {
        currentStatus: SaleStatus.PAID,
        attemptAction: 'markPaid() again',
        action: (s) => s.markPaid(clock),
      },
      {
        currentStatus: SaleStatus.PAID,
        attemptAction: 'cancel()',
        action: (s) => s.cancel('Too late', clock),
      },

      // From COMPLETED
      {
        currentStatus: SaleStatus.COMPLETED,
        attemptAction: 'markCompleted() again',
        action: (s) => s.markCompleted(clock),
      },
      {
        currentStatus: SaleStatus.COMPLETED,
        attemptAction: 'cancel()',
        action: (s) => s.cancel('Too late', clock),
      },
      {
        currentStatus: SaleStatus.COMPLETED,
        attemptAction: 'finalize()',
        action: (s) => s.finalize(clock),
      },

      // From CANCELLED (Terminal)
      {
        currentStatus: SaleStatus.CANCELLED,
        attemptAction: 'finalize()',
        action: (s) => s.finalize(clock),
      },
      {
        currentStatus: SaleStatus.CANCELLED,
        attemptAction: 'markPaid()',
        action: (s) => s.markPaid(clock),
      },
      {
        currentStatus: SaleStatus.CANCELLED,
        attemptAction: 'markCompleted()',
        action: (s) => s.markCompleted(clock),
      },
      {
        currentStatus: SaleStatus.CANCELLED,
        attemptAction: 'markRefunded()',
        action: (s) => s.markRefunded('Reason', clock),
      },

      // From REFUNDED (Terminal)
      {
        currentStatus: SaleStatus.REFUNDED,
        attemptAction: 'finalize()',
        action: (s) => s.finalize(clock),
      },
      {
        currentStatus: SaleStatus.REFUNDED,
        attemptAction: 'markPaid()',
        action: (s) => s.markPaid(clock),
      },
      {
        currentStatus: SaleStatus.REFUNDED,
        attemptAction: 'cancel()',
        action: (s) => s.cancel('Reason', clock),
      },
      {
        currentStatus: SaleStatus.REFUNDED,
        attemptAction: 'markRefunded() again',
        action: (s) => s.markRefunded('Reason', clock),
      },
    ];

    test.each(invalidTransitionMatrix)(
      'rejects $attemptAction from $currentStatus and preserves aggregate unchanged',
      ({ currentStatus, action }) => {
        const sale = instantiateSaleInStatus(currentStatus);
        const snapshotBefore = captureSaleSnapshot(sale);

        expect(() => action(sale)).toThrow(InvalidSaleTransitionException);

        const snapshotAfter = captureSaleSnapshot(sale);
        expect(snapshotAfter).toEqual(snapshotBefore);
      },
    );
  });

  // ==========================================================================
  // Property 6: Failure Atomicity Invariant (I_failure-atomic)
  // Failed operations MUST leave the aggregate completely unmodified
  // ==========================================================================
  describe('Property 6: Failure Atomicity Invariant across Operations', () => {
    const failingOperations: Array<{
      name: string;
      setup?: (sale: Sale) => void;
      execute: (sale: Sale) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expectedError: new (...args: any[]) => Error;
    }> = [
      {
        name: 'addItem with foreign currency (EUR on USD sale)',
        execute: (s) =>
          s.addItem(
            {
              source,
              description: 'EUR item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'EUR'),
            },
            clock,
          ),
        expectedError: InvalidSaleStateException,
      },
      {
        name: 'addItem with duplicate item ID',
        execute: (s) => {
          const existingId = s.items[0]?.id;
          s.addItem(
            {
              id: existingId,
              source,
              description: 'Duplicate ID item',
              quantity: 1,
              unitPrice: Money.create(10.0, 'USD'),
            },
            clock,
          );
        },
        expectedError: InvalidSaleStateException,
      },
      {
        name: 'removeItem with non-existent ID',
        execute: (s) => s.removeItem('non-existent-id', clock),
        expectedError: InvalidSaleStateException,
      },
      {
        name: 'applyOrderDiscount with negative value',
        execute: (s) => s.applyOrderDiscount(Discount.fixed(-15.0), clock),
        expectedError: InvalidDiscountException,
      },
      {
        name: 'applyOrderDiscount with percentage > 100%',
        execute: (s) => s.applyOrderDiscount(Discount.percentage(120.0), clock),
        expectedError: InvalidDiscountException,
      },
      {
        name: 'applyItemDiscount on non-existent item',
        execute: (s) => s.applyItemDiscount('ghost-item', Discount.fixed(5.0), clock),
        expectedError: InvalidSaleStateException,
      },
      {
        name: 'finalize on cart with 0 items',
        setup: (s) => {
          const id = s.items[0]!.id;
          s.removeItem(id, clock);
        },
        execute: (s) => s.finalize(clock),
        expectedError: EmptySaleException,
      },
      {
        name: 'cancel with empty string reason',
        execute: (s) => s.cancel('', clock),
        expectedError: InvalidSaleStateException,
      },
      {
        name: 'cancel with whitespace-only reason',
        execute: (s) => s.cancel('    ', clock),
        expectedError: InvalidSaleStateException,
      },
    ];

    test.each(failingOperations)(
      'failed operation "$name" leaves aggregate in exact pre-operation state',
      ({ setup, execute, expectedError }) => {
        const sale = Sale.create({ source, currency: 'USD' }, clock);
        sale.addItem(
          {
            id: SaleItemId.create('item-base-1'),
            source,
            description: 'Base Product',
            quantity: 1,
            unitPrice: Money.create(40.0, 'USD'),
          },
          clock,
        );

        if (setup) {
          setup(sale);
        }

        const snapshotBefore = captureSaleSnapshot(sale);

        expect(() => execute(sale)).toThrow(expectedError);

        const snapshotAfter = captureSaleSnapshot(sale);
        expect(snapshotAfter).toEqual(snapshotBefore);
      },
    );
  });
});
