import { Sale } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { EmptySaleException } from '../exceptions/empty-sale.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { InvalidSaleTransitionException } from '../exceptions/invalid-sale-transition.exception';
import { SaleDomainException } from '../exceptions/sale-domain.exception';
import {
  SaleFinalizedEvent,
  SaleCancelledEvent,
  SalePartiallyPaidEvent,
  SalePaidEvent,
  SaleCompletedEvent,
  SaleRefundedEvent,
} from '../events';
import { Clock } from '../shared/clock';

class DeterministicClock implements Clock {
  constructor(private currentDate: Date) {}
  public now(): Date {
    return this.currentDate;
  }
  public advance(ms: number): void {
    this.currentDate = new Date(this.currentDate.getTime() + ms);
  }
}

describe('Sale Lifecycle State Machine', () => {
  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_pos_register',
  });

  const createDraftWithItem = (clock: Clock): Sale => {
    const sale = Sale.create({ source: defaultSource }, clock);
    sale.addItem(
      {
        source: defaultSource,
        description: 'Resistance Band Set',
        skuOrCode: 'RB-01',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
      },
      clock,
    );
    sale.clearEvents();
    return sale;
  };

  describe('1. Valid State Transitions', () => {
    it('executes DRAFT -> PENDING_PAYMENT via finalize()', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      const prevVersion = sale.version;

      clock.advance(5000);
      sale.finalize(clock);

      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.version).toBe(prevVersion + 1);
      expect(sale.updatedAt).toEqual(new Date('2026-09-17T10:00:05.000Z'));

      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleFinalizedEvent);
      const finalizedEvt = events[0] as SaleFinalizedEvent;
      expect(finalizedEvt.payload.saleId).toBe(sale.id.value);
      expect(finalizedEvt.payload.totalAmount).toBe(50.0);
      expect(finalizedEvt.payload.currency).toBe('USD');
      expect(finalizedEvt.payload.itemCount).toBe(1);
    });

    it('executes DRAFT -> CANCELLED via cancel(reason)', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);

      clock.advance(10000);
      sale.cancel('Customer changed mind', clock);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancelledAt).toEqual(new Date('2026-09-17T10:00:10.000Z'));
      expect(sale.cancellationReason).toBe('Customer changed mind');

      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleCancelledEvent);
      const cancelledEvt = events[0] as SaleCancelledEvent;
      expect(cancelledEvt.payload.reason).toBe('Customer changed mind');
    });

    it('executes PENDING_PAYMENT -> PARTIALLY_PAID via markPartiallyPaid()', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.clearEvents();

      clock.advance(1000);
      sale.markPartiallyPaid(clock);

      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SalePartiallyPaidEvent);
      const partiallyPaidEvt = events[0] as SalePartiallyPaidEvent;
      expect(partiallyPaidEvt.payload.saleId).toBe(sale.id.value);
      expect(partiallyPaidEvt.payload.totalAmount).toBe(50.0);
    });

    it('executes PENDING_PAYMENT -> PAID via markPaid()', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.clearEvents();

      clock.advance(2000);
      sale.markPaid(clock);

      expect(sale.status).toBe(SaleStatus.PAID);
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SalePaidEvent);
      const paidEvt = events[0] as SalePaidEvent;
      expect(paidEvt.payload.saleId).toBe(sale.id.value);
      expect(paidEvt.payload.totalAmount).toBe(50.0);
    });

    it('executes PENDING_PAYMENT -> CANCELLED via cancel(reason)', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.clearEvents();

      clock.advance(3000);
      sale.cancel('Payment method expired at register', clock);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancelledAt).toEqual(new Date('2026-09-17T10:00:03.000Z'));
      expect(sale.cancellationReason).toBe('Payment method expired at register');
    });

    it('executes PARTIALLY_PAID -> PAID via markPaid()', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.markPartiallyPaid(clock);
      sale.clearEvents();

      clock.advance(4000);
      sale.markPaid(clock);

      expect(sale.status).toBe(SaleStatus.PAID);
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SalePaidEvent);
    });

    it('executes PARTIALLY_PAID -> CANCELLED via cancel(reason)', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.markPartiallyPaid(clock);
      sale.clearEvents();

      clock.advance(5000);
      sale.cancel('Card limit reached, customer voided partial checkout', clock);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancelledAt).toEqual(new Date('2026-09-17T10:00:05.000Z'));
      expect(sale.cancellationReason).toBe('Card limit reached, customer voided partial checkout');
    });

    it('executes PAID -> COMPLETED via markCompleted()', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.clearEvents();

      clock.advance(6000);
      sale.markCompleted(clock);

      expect(sale.status).toBe(SaleStatus.COMPLETED);
      expect(sale.completedAt).toEqual(new Date('2026-09-17T10:00:06.000Z'));
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleCompletedEvent);
      const completedEvt = events[0] as SaleCompletedEvent;
      expect(completedEvt.payload.saleId).toBe(sale.id.value);
    });

    it('executes PAID -> REFUNDED via markRefunded(reason)', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.clearEvents();

      clock.advance(7000);
      sale.markRefunded('Defective product returned immediately', clock);

      expect(sale.status).toBe(SaleStatus.REFUNDED);
      expect(sale.refundedAt).toEqual(new Date('2026-09-17T10:00:07.000Z'));
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleRefundedEvent);
      const refundedEvt = events[0] as SaleRefundedEvent;
      expect(refundedEvt.payload.reason).toBe('Defective product returned immediately');
    });

    it('executes COMPLETED -> REFUNDED via markRefunded(reason)', () => {
      const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
      const sale = createDraftWithItem(clock);
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);
      sale.clearEvents();

      clock.advance(8000);
      sale.markRefunded('Customer dissatisfaction return within 30 days', clock);

      expect(sale.status).toBe(SaleStatus.REFUNDED);
      expect(sale.refundedAt).toEqual(new Date('2026-09-17T10:00:08.000Z'));
      const events = sale.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(SaleRefundedEvent);
    });
  });

  describe('2. Invalid State Transitions (Must be strictly rejected)', () => {
    const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));

    describe('From DRAFT status', () => {
      it('rejects markPartiallyPaid()', () => {
        const sale = createDraftWithItem(clock);
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPaid()', () => {
        const sale = createDraftWithItem(clock);
        expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted()', () => {
        const sale = createDraftWithItem(clock);
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markRefunded()', () => {
        const sale = createDraftWithItem(clock);
        expect(() => sale.markRefunded('reason', clock)).toThrow(InvalidSaleTransitionException);
      });
    });

    describe('From PENDING_PAYMENT status', () => {
      const setupPendingSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.finalize(clock);
        return sale;
      };

      it('rejects finalize() (re-finalization)', () => {
        const sale = setupPendingSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted()', () => {
        const sale = setupPendingSale();
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markRefunded()', () => {
        const sale = setupPendingSale();
        expect(() => sale.markRefunded('reason', clock)).toThrow(InvalidSaleTransitionException);
      });
    });

    describe('From PARTIALLY_PAID status', () => {
      const setupPartiallyPaidSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.finalize(clock);
        sale.markPartiallyPaid(clock);
        return sale;
      };

      it('rejects finalize()', () => {
        const sale = setupPartiallyPaidSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPartiallyPaid() (already in partially paid)', () => {
        const sale = setupPartiallyPaidSale();
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted()', () => {
        const sale = setupPartiallyPaidSale();
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markRefunded()', () => {
        const sale = setupPartiallyPaidSale();
        expect(() => sale.markRefunded('reason', clock)).toThrow(InvalidSaleTransitionException);
      });
    });

    describe('From PAID status', () => {
      const setupPaidSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.finalize(clock);
        sale.markPaid(clock);
        return sale;
      };

      it('rejects finalize()', () => {
        const sale = setupPaidSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPartiallyPaid()', () => {
        const sale = setupPaidSale();
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPaid() (already paid)', () => {
        const sale = setupPaidSale();
        expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects cancel()', () => {
        const sale = setupPaidSale();
        expect(() => sale.cancel('Customer wants cancel', clock)).toThrow(
          InvalidSaleTransitionException,
        );
      });
    });

    describe('From COMPLETED status', () => {
      const setupCompletedSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.finalize(clock);
        sale.markPaid(clock);
        sale.markCompleted(clock);
        return sale;
      };

      it('rejects finalize()', () => {
        const sale = setupCompletedSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPartiallyPaid()', () => {
        const sale = setupCompletedSale();
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPaid()', () => {
        const sale = setupCompletedSale();
        expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted() (already completed)', () => {
        const sale = setupCompletedSale();
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects cancel()', () => {
        const sale = setupCompletedSale();
        expect(() => sale.cancel('Attempt to cancel completed sale', clock)).toThrow(
          InvalidSaleTransitionException,
        );
      });
    });

    describe('From CANCELLED status (Strictly Terminal)', () => {
      const setupCancelledSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.cancel('Order cancelled', clock);
        return sale;
      };

      it('rejects finalize()', () => {
        const sale = setupCancelledSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPartiallyPaid()', () => {
        const sale = setupCancelledSale();
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPaid()', () => {
        const sale = setupCancelledSale();
        expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted()', () => {
        const sale = setupCancelledSale();
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markRefunded()', () => {
        const sale = setupCancelledSale();
        expect(() => sale.markRefunded('reason', clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects cancel() again', () => {
        const sale = setupCancelledSale();
        expect(() => sale.cancel('Double cancel', clock)).toThrow(InvalidSaleTransitionException);
      });
    });

    describe('From REFUNDED status (Strictly Terminal)', () => {
      const setupRefundedSale = (): Sale => {
        const sale = createDraftWithItem(clock);
        sale.finalize(clock);
        sale.markPaid(clock);
        sale.markRefunded('Refunded order', clock);
        return sale;
      };

      it('rejects finalize()', () => {
        const sale = setupRefundedSale();
        expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPartiallyPaid()', () => {
        const sale = setupRefundedSale();
        expect(() => sale.markPartiallyPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markPaid()', () => {
        const sale = setupRefundedSale();
        expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markCompleted()', () => {
        const sale = setupRefundedSale();
        expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
      });

      it('rejects markRefunded() again', () => {
        const sale = setupRefundedSale();
        expect(() => sale.markRefunded('Double refund', clock)).toThrow(
          InvalidSaleTransitionException,
        );
      });

      it('rejects cancel()', () => {
        const sale = setupRefundedSale();
        expect(() => sale.cancel('Cannot cancel refunded sale', clock)).toThrow(
          InvalidSaleTransitionException,
        );
      });
    });
  });

  describe('3. Cancellation Rules (SALE-09)', () => {
    const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));

    it('rejects cancellation when reason is empty or whitespace', () => {
      const sale = createDraftWithItem(clock);
      expect(() => sale.cancel('', clock)).toThrow(SaleDomainException);
      expect(() => sale.cancel('   ', clock)).toThrow(SaleDomainException);
    });

    it('trims the cancellation reason properly', () => {
      const sale = createDraftWithItem(clock);
      sale.cancel('   Customer left premises   ', clock);
      expect(sale.cancellationReason).toBe('Customer left premises');
    });
  });

  describe('4. Finalization Invariant Rules (SALE-05)', () => {
    const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));

    it('rejects finalization when cart has zero items', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      expect(sale.items).toHaveLength(0);
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);
    });
  });

  describe('5. Progressive Immutability & Mutation Restrictions (SALE-08)', () => {
    const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));
    const dummyItem = {
      source: defaultSource,
      description: 'Extra Water',
      quantity: 1,
      unitPrice: Money.create(2.0, 'USD'),
    };

    const postDraftStates: SaleStatus[] = [
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PARTIALLY_PAID,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
      SaleStatus.REFUNDED,
    ];

    const getSaleInStatus = (targetStatus: SaleStatus): Sale => {
      const sale = createDraftWithItem(clock);
      if (targetStatus === SaleStatus.CANCELLED) {
        sale.cancel('Cancelled reason', clock);
        return sale;
      }
      sale.finalize(clock);
      if (targetStatus === SaleStatus.PENDING_PAYMENT) return sale;

      if (targetStatus === SaleStatus.PARTIALLY_PAID) {
        sale.markPartiallyPaid(clock);
        return sale;
      }

      sale.markPaid(clock);
      if (targetStatus === SaleStatus.PAID) return sale;

      if (targetStatus === SaleStatus.COMPLETED) {
        sale.markCompleted(clock);
        return sale;
      }

      if (targetStatus === SaleStatus.REFUNDED) {
        sale.markRefunded('Full refund', clock);
        return sale;
      }

      return sale;
    };

    postDraftStates.forEach((status) => {
      describe(`Status: ${status}`, () => {
        it(`blocks addItem() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          expect(() => sale.addItem(dummyItem, clock)).toThrow(SaleAlreadyFinalizedException);
        });

        it(`blocks updateItemQuantity() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          const firstItemId = sale.items[0]!.id;
          expect(() => sale.updateItemQuantity(firstItemId, 5, clock)).toThrow(
            SaleAlreadyFinalizedException,
          );
        });

        it(`blocks applyItemDiscount() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          const firstItemId = sale.items[0]!.id;
          expect(() =>
            sale.applyItemDiscount(firstItemId, Discount.percentage(10, 'Test'), clock),
          ).toThrow(SaleAlreadyFinalizedException);
        });

        it(`blocks removeItemDiscount() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          const firstItemId = sale.items[0]!.id;
          expect(() => sale.removeItemDiscount(firstItemId, clock)).toThrow(
            SaleAlreadyFinalizedException,
          );
        });

        it(`blocks removeItem() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          const firstItemId = sale.items[0]!.id;
          expect(() => sale.removeItem(firstItemId, clock)).toThrow(SaleAlreadyFinalizedException);
        });

        it(`blocks applyOrderDiscount() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          expect(() => sale.applyOrderDiscount(Discount.percentage(10, 'Test'), clock)).toThrow(
            SaleAlreadyFinalizedException,
          );
        });

        it(`blocks removeOrderDiscount() in ${status}`, () => {
          const sale = getSaleInStatus(status);
          expect(() => sale.removeOrderDiscount(clock)).toThrow(SaleAlreadyFinalizedException);
        });
      });
    });
  });

  describe('6. Financial Invariant Preservation Across State Transitions', () => {
    const clock = new DeterministicClock(new Date('2026-09-17T10:00:00.000Z'));

    it('preserves exact subtotal, discountTotal, and total throughout the full lifecycle', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem(
        {
          source: defaultSource,
          description: 'Personal Training Session',
          quantity: 2,
          unitPrice: Money.create(50.0, 'USD'),
          discount: Discount.fixedAmount(10.0, 'Session Discount'),
        },
        clock,
      );
      sale.applyOrderDiscount(Discount.percentage(10, 'VIP Promo'), clock);

      const expectedSubtotal = Money.create(100.0, 'USD');
      const expectedDiscountTotal = Money.create(19.0, 'USD'); // 10 line + 10% of 90 = 19
      const expectedTotal = Money.create(81.0, 'USD');

      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);

      // Transition: DRAFT -> PENDING_PAYMENT
      sale.finalize(clock);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);

      // Transition: PENDING_PAYMENT -> PARTIALLY_PAID
      sale.markPartiallyPaid(clock);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);

      // Transition: PARTIALLY_PAID -> PAID
      sale.markPaid(clock);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);

      // Transition: PAID -> COMPLETED
      sale.markCompleted(clock);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);

      // Transition: COMPLETED -> REFUNDED
      sale.markRefunded('Compensating refund', clock);
      expect(sale.subtotal).toEqual(expectedSubtotal);
      expect(sale.discountTotal).toEqual(expectedDiscountTotal);
      expect(sale.total).toEqual(expectedTotal);
    });
  });

  describe('7. Reconstitution with Lifecycle Timestamps and State', () => {
    it('accurately reconstitutes a COMPLETED and REFUNDED sale', () => {
      const now = new Date('2026-09-17T10:00:00.000Z');
      const completedAt = new Date('2026-09-17T10:30:00.000Z');
      const refundedAt = new Date('2026-09-17T11:00:00.000Z');
      const draftSale = createDraftWithItem(new DeterministicClock(now));

      const reconstituted = Sale.reconstitute({
        id: draftSale.id,
        tenantId: 'tenant-123',
        clientId: 'client-456',
        status: SaleStatus.REFUNDED,
        currency: 'USD',
        source: defaultSource,
        items: [...draftSale.items],
        subtotal: draftSale.subtotal,
        discountTotal: draftSale.discountTotal,
        total: draftSale.total,
        version: 5,
        completedAt,
        refundedAt,
        createdAt: now,
        updatedAt: refundedAt,
      });

      expect(reconstituted.status).toBe(SaleStatus.REFUNDED);
      expect(reconstituted.completedAt).toEqual(completedAt);
      expect(reconstituted.refundedAt).toEqual(refundedAt);
      expect(reconstituted.version).toBe(5);
    });

    it('accurately reconstitutes a CANCELLED sale with reason', () => {
      const now = new Date('2026-09-17T10:00:00.000Z');
      const cancelledAt = new Date('2026-09-17T10:15:00.000Z');
      const draftSale = createDraftWithItem(new DeterministicClock(now));

      const reconstituted = Sale.reconstitute({
        id: draftSale.id,
        tenantId: 'tenant-123',
        status: SaleStatus.CANCELLED,
        currency: 'USD',
        source: defaultSource,
        items: [...draftSale.items],
        subtotal: draftSale.subtotal,
        discountTotal: draftSale.discountTotal,
        total: draftSale.total,
        version: 2,
        cancelledAt,
        cancellationReason: 'Abandoned checkout session',
        createdAt: now,
        updatedAt: cancelledAt,
      });

      expect(reconstituted.status).toBe(SaleStatus.CANCELLED);
      expect(reconstituted.cancelledAt).toEqual(cancelledAt);
      expect(reconstituted.cancellationReason).toBe('Abandoned checkout session');
    });
  });
});
