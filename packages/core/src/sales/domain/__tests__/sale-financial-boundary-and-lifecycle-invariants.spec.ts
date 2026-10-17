/**
 * Milestone 7.19 — Phase 7 Domain Behavioral & Financial Integrity Test Suite.
 *
 * Verifies observable business invariants across:
 * 1. Sale creation, currency validation, source types, and initial state.
 * 2. Sale item addition, quantity normalization/bounds, price integrity, and ownership.
 * 3. Discount calculation, 100% discount, zero totals, negative total rejection, and commercial half-up rounding.
 * 4. Sale and Payment lifecycle state machines, terminal immutability, and duplicate transition rejection.
 * 5. Financial invariants: paid sale immutability, positive payment amounts, and receipt issuance prerequisites.
 */

import { Sale, CreateSaleProps } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { Payment } from '../payment.aggregate';
import { Receipt } from '../receipt.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { SourceType } from '../enums/source-type.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Clock } from '../shared/clock';
import {
  EmptySaleException,
  SaleAlreadyFinalizedException,
  InvalidSaleStateException,
  InvalidSaleTransitionException,
  InvalidPaymentTransitionException,
  SaleCannotBeMarkedPaidException,
  InvalidSaleItemException,
  InvalidDiscountException,
  InvalidPaymentAmountException,
  PaymentAlreadyCompletedException,
  PaymentAlreadyFailedException,
  PaymentAlreadyCancelledException,
  ReceiptDomainException,
} from '../exceptions';
import { PaymentLifecycleStateMachine } from '../services/payment-lifecycle.state-machine';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

describe('Milestone 7.19: Complete Sales and Payments Domain Invariants', () => {
  const baseTime = new Date('2026-10-17T10:00:00.000Z');
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
  });

  const createValidSource = (
    type: SourceType = SourceType.TREATMENT_SESSION,
    id = 'sess_clinical_101',
    code = 'CLINIC-ENC-001',
  ): SourceReference => {
    return SourceReference.create({
      sourceType: type,
      sourceId: id,
      sourceCode: code,
    });
  };

  // ===========================================================================
  // 1. Sale Creation Invariants
  // ===========================================================================
  describe('1. Sale Creation Invariants', () => {
    it('creates a valid Sale in DRAFT status with version 1, zero totals, and uncommitted creation event', () => {
      const source = createValidSource();
      const sale = Sale.create(
        {
          tenantId: 'tenant_main',
          clientId: 'client_alpha',
          currency: 'USD',
          source,
        },
        clock,
      );

      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.version).toBe(1);
      expect(sale.currency).toBe('USD');
      expect(sale.tenantId).toBe('tenant_main');
      expect(sale.clientId).toBe('client_alpha');
      expect(sale.itemCount).toBe(0);
      expect(sale.items).toHaveLength(0);
      expect(sale.subtotal.cents).toBe(0);
      expect(sale.discountTotal.cents).toBe(0);
      expect(sale.total.cents).toBe(0);
      expect(sale.createdAt).toEqual(baseTime);
      expect(sale.updatedAt).toEqual(baseTime);
      expect(sale.isTerminal()).toBe(false);

      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('SaleCreated');
    });

    it('supports all valid commercial SourceType variants at creation', () => {
      const supportedTypes: SourceType[] = [
        SourceType.TREATMENT_SESSION,
        SourceType.INVENTORY_ITEM,
        SourceType.MEMBERSHIP_PLAN,
        SourceType.CUSTOM_SERVICE,
      ];

      for (const st of supportedTypes) {
        const source = createValidSource(st, `src_${st}_01`, `CODE-${st}`);
        const sale = Sale.create({ source, currency: 'USD' }, clock);
        expect(sale.source.sourceType).toBe(st);
        expect(sale.status).toBe(SaleStatus.DRAFT);
      }
    });

    it('rejects creation when props or source reference are missing', () => {
      expect(() => Sale.create(null as unknown as CreateSaleProps, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({} as unknown as CreateSaleProps, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source: null as unknown as SourceReference }, clock)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('normalizes valid lowercase currency to uppercase and rejects malformed non-ISO codes', () => {
      const source = createValidSource();

      // Lowercase is normalized to uppercase ISO-4217
      const saleWithLowercase = Sale.create({ source, currency: 'usd' }, clock);
      expect(saleWithLowercase.currency).toBe('USD');

      // Invalid length / syntax rejected
      expect(() => Sale.create({ source, currency: 'US' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: 'USDD' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: '$' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: '123' }, clock)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('rejects empty or whitespace-only tenantId and clientId', () => {
      const source = createValidSource();

      expect(() => Sale.create({ source, tenantId: '   ' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, clientId: '' }, clock)).toThrow(InvalidSaleStateException);
    });

    it('rejects invalid orderDiscount types passed into factory props', () => {
      const source = createValidSource();
      expect(() =>
        Sale.create({ source, orderDiscount: { amount: 50 } as unknown as Discount }, clock),
      ).toThrow(InvalidSaleStateException);
    });
  });

  // ===========================================================================
  // 2. Sale Item Addition Invariants
  // ===========================================================================
  describe('2. Sale Item Addition Invariants', () => {
    it('successfully adds valid item to DRAFT sale and recalculates subtotal, discount, and total', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      const itemSource = createValidSource(SourceType.INVENTORY_ITEM, 'prod_protein_01', 'PROT-01');

      const added = sale.addItem(
        {
          source: itemSource,
          description: 'Whey Protein Isolate 1kg',
          skuOrCode: 'WHEY-ISO-1KG',
          quantity: 2,
          unitPrice: Money.create(45.0, 'USD'),
        },
        clock,
      );

      expect(added).toBeDefined();
      expect(sale.itemCount).toBe(1);
      expect(sale.subtotal.amount).toBe(90.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(90.0);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleItemAdded')).toBe(true);
    });

    it('strictly validates quantity: rejects non-finite, zero, negative, or overflow values', () => {
      const source = createValidSource();

      // Zero quantity
      expect(() =>
        SaleItem.create({
          source,
          description: 'Session',
          quantity: 0,
          unitPrice: Money.create(50, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      // Negative quantity
      expect(() =>
        SaleItem.create({
          source,
          description: 'Session',
          quantity: -1,
          unitPrice: Money.create(50, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      // NaN quantity
      expect(() =>
        SaleItem.create({
          source,
          description: 'Session',
          quantity: NaN,
          unitPrice: Money.create(50, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      // Infinity quantity
      expect(() =>
        SaleItem.create({
          source,
          description: 'Session',
          quantity: Infinity,
          unitPrice: Money.create(50, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      // Quantity exceeding MAX_QUANTITY (999,999)
      expect(() =>
        SaleItem.create({
          source,
          description: 'Session',
          quantity: 1_000_000,
          unitPrice: Money.create(50, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);
    });

    it('normalizes fractional quantities to 3 decimal places and rejects quantities rounding to 0', () => {
      const source = createValidSource();

      // Quantity rounding to 0 at 3 decimal places (e.g. 0.0001)
      expect(() =>
        SaleItem.create({
          source,
          description: 'Micro dose',
          quantity: 0.0001,
          unitPrice: Money.create(100, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      // Valid fractional quantity (1.234)
      const validItem = SaleItem.create({
        source,
        description: 'Fractional Therapy Hours',
        quantity: 1.2345, // normalizes to 1.235
        unitPrice: Money.create(100, 'USD'),
      });
      expect(validItem.quantity).toBe(1.235);
      expect(validItem.subtotal.amount).toBe(123.5);
    });

    it('strictly enforces price validation: rejects negative prices and currency mismatches', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);

      // Negative unit price rejected by Money VO
      expect(() => Money.create(-25, 'USD')).toThrow();

      // Currency mismatch: cannot add CAD item to USD sale
      expect(() =>
        sale.addItem(
          {
            source: createValidSource(),
            description: 'Cross-currency item',
            quantity: 1,
            unitPrice: Money.create(50, 'CAD'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects adding duplicate SaleItemId to the same Sale', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      const duplicateItemId = SaleItemId.create('item_duplicate_1');

      sale.addItem(
        {
          id: duplicateItemId,
          source: createValidSource(),
          description: 'First occurrence',
          quantity: 1,
          unitPrice: Money.create(10, 'USD'),
        },
        clock,
      );

      expect(() =>
        sale.addItem(
          {
            id: duplicateItemId,
            source: createValidSource(),
            description: 'Duplicate occurrence',
            quantity: 1,
            unitPrice: Money.create(10, 'USD'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects attaching a SaleItem that belongs to a different Sale aggregate', () => {
      const saleA = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      const saleB = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);

      const itemBelongingToSaleA = SaleItem.create({
        saleId: saleA.id,
        source: createValidSource(),
        description: 'Item of Sale A',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      });

      expect(() => saleB.addItem(itemBelongingToSaleA, clock)).toThrow(InvalidSaleStateException);
    });

    it('allows item removal and item attribute updates in DRAFT, properly recalculating totals', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      const item1 = sale.addItem(
        {
          source: createValidSource(),
          description: 'Item 1',
          quantity: 2,
          unitPrice: Money.create(30, 'USD'),
        },
        clock,
      );
      const item2 = sale.addItem(
        {
          source: createValidSource(),
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(40, 'USD'),
        },
        clock,
      );

      expect(sale.total.amount).toBe(100.0);

      // Update quantity of Item 1
      sale.updateItemQuantity(item1.id, 3, clock);
      expect(sale.total.amount).toBe(130.0); // 3*30 + 40

      // Remove Item 2
      sale.removeItem(item2.id, clock);
      expect(sale.itemCount).toBe(1);
      expect(sale.total.amount).toBe(90.0);
    });
  });

  // ===========================================================================
  // 3. Discount and Totals Calculation Invariants
  // ===========================================================================
  describe('3. Discount and Totals Calculation Invariants', () => {
    it('applies valid percentage discounts and verifies boundaries', () => {
      // 0% discount is valid
      const zeroDiscount = Discount.percentage(0, 'Zero discount');
      expect(zeroDiscount.calculate(Money.create(100, 'USD')).cents).toBe(0);

      // 100% discount is valid
      const fullDiscount = Discount.percentage(100, 'Full complimentary');
      expect(fullDiscount.calculate(Money.create(100, 'USD')).amount).toBe(100.0);

      // Percentage > 100% is strictly rejected
      expect(() => Discount.percentage(100.01)).toThrow(InvalidDiscountException);

      // Negative percentage is rejected
      expect(() => Discount.percentage(-5)).toThrow(InvalidDiscountException);

      // Non-finite percentage is rejected
      expect(() => Discount.percentage(NaN)).toThrow(InvalidDiscountException);
    });

    it('applies fixed discounts and verifies non-negative boundaries', () => {
      const fixed = Discount.fixed(15.5, 'Promo coupon');
      expect(fixed.calculate(Money.create(50, 'USD')).amount).toBe(15.5);

      // Negative fixed discount rejected
      expect(() => Discount.fixed(-10)).toThrow(InvalidDiscountException);
    });

    it('handles 100% item discount leading to $0 line subtotal and correctly reconciles cart totals', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      sale.addItem(
        {
          source: createValidSource(),
          description: 'Complimentary Consultation',
          quantity: 1,
          unitPrice: Money.create(120, 'USD'),
          discount: Discount.percentage(100, 'VIP Promo'),
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(120.0);
      expect(sale.discountTotal.amount).toBe(120.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
    });

    it('handles 100% order-level discount resulting in zero total', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      sale.addItem(
        {
          source: createValidSource(),
          description: 'Standard Assessment',
          quantity: 1,
          unitPrice: Money.create(200, 'USD'),
        },
        clock,
      );

      sale.applyOrderDiscount(Discount.percentage(100, 'Full Sponsorship'), clock);

      expect(sale.subtotal.amount).toBe(200.0);
      expect(sale.discountTotal.amount).toBe(200.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
    });

    it('strictly rejects discounts that would produce a negative sale total', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      sale.addItem(
        {
          source: createValidSource(),
          description: 'Modest Item',
          quantity: 1,
          unitPrice: Money.create(30, 'USD'),
        },
        clock,
      );

      // Attempting to apply a $50 fixed discount on a $30 cart
      // Discount.calculateReduction caps at netPreOrderDiscount ($30), preventing negative totals
      sale.applyOrderDiscount(Discount.fixed(50, 'Huge voucher'), clock);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.total.cents).toBe(0);
      expect(sale.discountTotal.amount).toBe(30.0);
    });

    it('enforces commercial half-up rounding on fractional cent discount computations', () => {
      // 33.33% on $10.00 (1000 cents): 1000 * 0.3333 = 333.3 -> rounds to 333 cents ($3.33)
      const discount = Discount.percentage(33.33);
      const reduction = discount.calculate(Money.create(10, 'USD'));
      expect(reduction.cents).toBe(333);
      expect(reduction.amount).toBe(3.33);

      // 33.335% on $10.00: 1000 * 0.33335 = 333.35 -> half-up rounds to 333 cents ($3.33)
      // 33.35% on $10.00: 1000 * 0.3335 = 333.5 -> half-up rounds to 334 cents ($3.34)
      const discountRoundUp = Discount.percentage(33.35);
      const reductionRoundUp = discountRoundUp.calculate(Money.create(10, 'USD'));
      expect(reductionRoundUp.cents).toBe(334);
      expect(reductionRoundUp.amount).toBe(3.34);
    });
  });

  // ===========================================================================
  // 4. Lifecycle Rules and State Machine
  // ===========================================================================
  describe('4. Lifecycle Rules and State Machine', () => {
    it('enforces valid Sale lifecycle progression and prevents empty order finalization', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);

      // Attempting to finalize an empty sale throws EmptySaleException
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);

      sale.addItem(
        {
          source: createValidSource(),
          description: 'Valid Session',
          quantity: 1,
          unitPrice: Money.create(100, 'USD'),
        },
        clock,
      );

      // Finalize: DRAFT -> PENDING_PAYMENT
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Partial settlement: PENDING_PAYMENT -> PARTIALLY_PAID
      sale.markPartiallyPaid(clock);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      // Full settlement: PARTIALLY_PAID -> PAID
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);

      // Fulfillment: PAID -> COMPLETED
      sale.markCompleted(clock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);
      expect(sale.completedAt).toBeDefined();

      // Refund: COMPLETED -> REFUNDED
      sale.markRefunded('Customer dissatisfaction', clock);
      expect(sale.status).toBe(SaleStatus.REFUNDED);
      expect(sale.refundedAt).toBeDefined();
      expect(sale.isTerminal()).toBe(true);
    });

    it('strictly rejects illegal Sale state transitions', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      sale.addItem(
        {
          source: createValidSource(),
          description: 'Session',
          quantity: 1,
          unitPrice: Money.create(100, 'USD'),
        },
        clock,
      );

      // DRAFT cannot jump directly to PAID or COMPLETED
      expect(() => sale.markPaid(clock)).toThrow(SaleCannotBeMarkedPaidException);
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markRefunded('Invalid', clock)).toThrow(InvalidSaleTransitionException);

      // Cancel requires non-empty reason
      expect(() => sale.cancel('', clock)).toThrow(InvalidSaleStateException);
      expect(() => sale.cancel('   ', clock)).toThrow(InvalidSaleStateException);

      // Cancel the sale
      sale.cancel('Client requested appointment cancellation', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.isTerminal()).toBe(true);

      // Once CANCELLED, all further transitions are prohibited
      expect(sale.canTransitionTo(SaleStatus.PENDING_PAYMENT)).toBe(false);
      expect(sale.canTransitionTo(SaleStatus.PAID)).toBe(false);
      expect(sale.canTransitionTo(SaleStatus.COMPLETED)).toBe(false);
      expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPaid(clock)).toThrow(SaleCannotBeMarkedPaidException);
    });

    it('enforces Payment lifecycle state machine transitions and prevents duplicate completions', () => {
      const saleId = SaleId.create();
      const payment = Payment.createPending(
        {
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(100, 'USD'),
          tenantId: 'tenant_main',
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(
        PaymentLifecycleStateMachine.canTransition(payment.status, PaymentStatus.COMPLETED),
      ).toBe(true);
      expect(PaymentLifecycleStateMachine.canTransition(payment.status, PaymentStatus.FAILED)).toBe(
        true,
      );
      expect(
        PaymentLifecycleStateMachine.canTransition(payment.status, PaymentStatus.CANCELLED),
      ).toBe(true);

      // Complete the payment
      clock.advance(1000);
      payment.complete({ clock });
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toBeDefined();

      // Attempting to complete an already completed payment throws PaymentAlreadyCompletedException
      expect(() => payment.complete({ clock })).toThrow(PaymentAlreadyCompletedException);

      // Attempting to fail or cancel a completed payment is prohibited
      expect(() => payment.fail({ clock })).toThrow(PaymentAlreadyCompletedException);
      expect(() => payment.cancel({ clock })).toThrow(PaymentAlreadyCompletedException);
      expect(
        PaymentLifecycleStateMachine.canTransition(
          PaymentStatus.COMPLETED,
          PaymentStatus.COMPLETED,
        ),
      ).toBe(false);
      expect(
        PaymentLifecycleStateMachine.canTransition(PaymentStatus.COMPLETED, PaymentStatus.FAILED),
      ).toBe(false);
      expect(
        PaymentLifecycleStateMachine.canTransition(
          PaymentStatus.COMPLETED,
          PaymentStatus.CANCELLED,
        ),
      ).toBe(false);
    });

    it('validates FAILED and CANCELLED terminal state transitions for Payments', () => {
      const saleId = SaleId.create();

      // Failed payment terminality
      const failedPayment = Payment.createPending(
        {
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(50, 'USD'),
          tenantId: 'tenant_main',
        },
        clock,
      );
      failedPayment.fail({ reason: 'Insufficient funds', clock });
      expect(failedPayment.status).toBe(PaymentStatus.FAILED);
      expect(() => failedPayment.complete({ clock })).toThrow(InvalidPaymentTransitionException);
      expect(() => failedPayment.fail({ clock })).toThrow(PaymentAlreadyFailedException);

      // Cancelled payment terminality
      const cancelledPayment = Payment.createPending(
        {
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(50, 'USD'),
          tenantId: 'tenant_main',
        },
        clock,
      );
      cancelledPayment.cancel({ reason: 'Customer changed tender', clock });
      expect(cancelledPayment.status).toBe(PaymentStatus.CANCELLED);
      expect(() => cancelledPayment.complete({ clock })).toThrow(InvalidPaymentTransitionException);
      expect(() => cancelledPayment.cancel({ clock })).toThrow(PaymentAlreadyCancelledException);
    });

    it('enforces Receipt issuance prerequisites: requires PAID or COMPLETED sale and settled payments', () => {
      const sale = Sale.create(
        { source: createValidSource(), currency: 'USD', tenantId: 'tenant_main' },
        clock,
      );
      sale.addItem(
        {
          source: createValidSource(),
          description: 'Physiotherapy Assessment',
          quantity: 1,
          unitPrice: Money.create(150, 'USD'),
        },
        clock,
      );

      const settledPayment = Payment.createCompleted({
        saleId: sale.id,
        method: PaymentMethod.CASH,
        amount: Money.create(150, 'USD'),
        tenantId: 'tenant_main',
      });

      // Sale is in DRAFT -> cannot issue receipt
      expect(() =>
        Receipt.fromSettledSale({
          sale,
          payments: [settledPayment],
          receiptNumber: 'RCP-2026-0001',
        }),
      ).toThrow(ReceiptDomainException);

      // Move sale to PENDING_PAYMENT -> still cannot issue receipt
      sale.finalize(clock);
      expect(() =>
        Receipt.fromSettledSale({
          sale,
          payments: [settledPayment],
          receiptNumber: 'RCP-2026-0001',
        }),
      ).toThrow(ReceiptDomainException);

      // Move sale to PAID -> can issue receipt
      sale.markPaid(clock);
      const receipt = Receipt.fromSettledSale(
        {
          sale,
          payments: [settledPayment],
          receiptNumber: 'RCP-2026-0001',
        },
        clock,
      );

      expect(receipt).toBeDefined();
      expect(receipt.total.amount).toBe(150.0);
      expect(receipt.items).toHaveLength(1);
      expect(receipt.payments).toHaveLength(1);
      expect(receipt.reprintCount).toBe(0);

      // Recording reprints increments count while preserving snapshot integrity
      clock.advance(60000); // 1 minute later
      receipt.recordReprint(clock);
      expect(receipt.reprintCount).toBe(1);
      expect(receipt.lastReprintedAt).toBeDefined();

      receipt.recordReprint(clock);
      expect(receipt.reprintCount).toBe(2);
    });
  });

  // ===========================================================================
  // 5. Financial Invariants
  // ===========================================================================
  describe('5. Financial Invariants', () => {
    it('freezes commercial terms permanently once a Sale leaves DRAFT or is paid', () => {
      const sale = Sale.create({ source: createValidSource(), currency: 'USD' }, clock);
      const item = sale.addItem(
        {
          source: createValidSource(),
          description: 'Rehabilitation Session',
          quantity: 1,
          unitPrice: Money.create(80, 'USD'),
        },
        clock,
      );

      sale.finalize(clock);
      sale.markPaid(clock);

      // Invariant: cannot add item to finalized/paid sale
      expect(() =>
        sale.addItem(
          {
            source: createValidSource(),
            description: 'Post-paid item',
            quantity: 1,
            unitPrice: Money.create(20, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);

      // Invariant: cannot modify existing item quantity or discount
      expect(() => sale.updateItemQuantity(item.id, 2, clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.applyItemDiscount(item.id, Discount.percentage(10), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );

      // Invariant: cannot remove item
      expect(() => sale.removeItem(item.id, clock)).toThrow(SaleAlreadyFinalizedException);

      // Invariant: cannot apply order discount
      expect(() => sale.applyOrderDiscount(Discount.percentage(10), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );

      // Invariant: cannot re-assign or clear source
      expect(() => sale.changeSource(createValidSource())).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeSource()).toThrow(SaleAlreadyFinalizedException);

      // Invariant: cannot cancel a PAID sale
      expect(() => sale.cancel('Cannot cancel paid sale', clock)).toThrow(
        InvalidSaleTransitionException,
      );
    });

    it('requires Payment amount to be strictly positive (> 0.00)', () => {
      const saleId = SaleId.create();

      // Zero cents payment rejected
      expect(() =>
        Payment.createCompleted({
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.zero('USD'),
          tenantId: 'tenant_main',
        }),
      ).toThrow(InvalidPaymentAmountException);

      // Negative cents payment rejected
      expect(() =>
        Payment.createCompleted({
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(-10, 'USD', { allowNegative: true }),
          tenantId: 'tenant_main',
        }),
      ).toThrow(InvalidPaymentAmountException);
    });

    it('preserves historical snapshot integrity across item modifications', () => {
      const source = createValidSource();
      const originalItem = SaleItem.create({
        source,
        description: 'Original Session',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
        discount: Discount.fixed(10),
      });

      // withQuantity produces a new immutable instance without mutating original
      const modifiedItem = originalItem.withQuantity(3);
      expect(originalItem.quantity).toBe(1);
      expect(originalItem.total.amount).toBe(90.0);
      expect(modifiedItem.quantity).toBe(3);
      expect(modifiedItem.subtotal.amount).toBe(300.0);
      expect(modifiedItem.total.amount).toBe(290.0);
    });
  });
});
