import { Sale } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { EmptySaleException } from '../exceptions/empty-sale.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { InvalidSaleTransitionException } from '../exceptions/invalid-sale-transition.exception';
import { Clock } from '../shared/clock';

class MockClock implements Clock {
  constructor(private readonly fixedDate: Date) {}
  public now(): Date {
    return this.fixedDate;
  }
}

describe('Sale Aggregate Root', () => {
  const fixedNow = new Date('2026-09-17T12:00:00.000Z');
  const clock = new MockClock(fixedNow);

  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_pos_register',
  });

  describe('Creation', () => {
    it('creates a new Sale in DRAFT status with version 1 and zero totals', () => {
      const sale = Sale.create(
        {
          tenantId: 'tenant_fitness_1',
          clientId: 'client_101',
          currency: 'USD',
          source: defaultSource,
        },
        clock,
      );

      expect(sale.id).toBeDefined();
      expect(sale.tenantId).toBe('tenant_fitness_1');
      expect(sale.clientId).toBe('client_101');
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.currency).toBe('USD');
      expect(sale.source.equals(defaultSource)).toBe(true);
      expect(sale.subtotal.amount).toBe(0.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(0.0);
      expect(sale.version).toBe(1);
      expect(sale.createdAt).toEqual(fixedNow);
      expect(sale.updatedAt).toEqual(fixedNow);
      expect(sale.items.length).toBe(0);

      const events = sale.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe('SaleCreated');
      expect(events[0]!.aggregateId).toBe(sale.id.value);
    });

    it('creates a Sale without optional tenantId or clientId', () => {
      const sale = Sale.create({
        source: defaultSource,
      });

      expect(sale.tenantId).toBeUndefined();
      expect(sale.clientId).toBeUndefined();
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });
  });

  describe('Item Management in DRAFT', () => {
    it('adds line items and updates subtotal and total', () => {
      const sale = Sale.create({ source: defaultSource }, clock);

      const item = sale.addItem(
        {
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: 'item_1',
          }),
          description: 'Electrolyte Drink',
          quantity: 2,
          unitPrice: Money.create(4.5, 'USD'),
        },
        clock,
      );

      expect(sale.items.length).toBe(1);
      expect(sale.subtotal.amount).toBe(9.0);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(9.0);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleItemAdded')).toBe(true);
      expect(sale.items[0]!.id.value).toBe(item.id.value);
    });

    it('rejects adding an item with a different currency', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource }, clock);

      expect(() => {
        sale.addItem(
          {
            source: defaultSource,
            description: 'Euro Snack',
            quantity: 1,
            unitPrice: Money.create(5.0, 'EUR'),
          },
          clock,
        );
      }).toThrow(InvalidSaleStateException);
    });

    it('updates item quantity and recalculates totals', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      const item = sale.addItem({
        source: defaultSource,
        description: 'Protein Shake',
        quantity: 1,
        unitPrice: Money.create(6.0, 'USD'),
      });

      sale.updateItemQuantity(item.id, 3);

      expect(sale.items[0]!.quantity).toBe(3);
      expect(sale.subtotal.amount).toBe(18.0);
      expect(sale.total.amount).toBe(18.0);
    });

    it('removes a line item and updates totals', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      const item1 = sale.addItem({
        source: defaultSource,
        description: 'Item 1',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      const item2 = sale.addItem({
        source: defaultSource,
        description: 'Item 2',
        quantity: 1,
        unitPrice: Money.create(15.0, 'USD'),
      });

      expect(sale.subtotal.amount).toBe(25.0);

      sale.removeItem(item1.id);
      expect(sale.items.length).toBe(1);
      expect(sale.items[0]!.id.value).toBe(item2.id.value);
      expect(sale.subtotal.amount).toBe(15.0);
      expect(sale.total.amount).toBe(15.0);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleItemRemoved')).toBe(true);
    });
  });

  describe('Discounts & Exact Reconciliation', () => {
    it('correctly reconciles line-item discount and order-level discount', () => {
      const sale = Sale.create({ source: defaultSource }, clock);

      // Item 1: 2 * $50.00 = $100.00, 10% line discount = $10.00. Line net: $90.00
      sale.addItem({
        source: defaultSource,
        description: 'Gym Bag',
        quantity: 2,
        unitPrice: Money.create(50.0, 'USD'),
        discount: Discount.percentage(10, '10% item discount'),
      });

      // Item 2: 1 * $60.00 = $60.00, no discount. Line net: $60.00
      sale.addItem({
        source: defaultSource,
        description: 'Foam Roller',
        quantity: 1,
        unitPrice: Money.create(60.0, 'USD'),
      });

      // Subtotal before order discount: $160.00
      // Total line discounts: $10.00
      // Pre-order discount net: $150.00
      expect(sale.subtotal.amount).toBe(160.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(150.0);

      // Apply $20.00 fixed order discount
      sale.applyOrderDiscount(Discount.fixedAmount(20.0, 'VIP Promo'));

      // Total discount = $10.00 line + $20.00 order = $30.00
      // Total = $160.00 - $30.00 = $130.00
      expect(sale.discountTotal.amount).toBe(30.0);
      expect(sale.total.amount).toBe(130.0);

      // Remove order discount
      sale.removeOrderDiscount();
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(150.0);
    });

    it('caps total order reduction so total never becomes negative', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Small Snack',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });

      sale.applyOrderDiscount(Discount.fixedAmount(100.0, 'Huge Voucher'));

      expect(sale.discountTotal.amount).toBe(5.0);
      expect(sale.total.amount).toBe(0.0);
    });
  });

  describe('Lifecycle State Transitions & Immutability', () => {
    it('throws EmptySaleException when attempting to finalize with zero items', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      expect(() => {
        sale.finalize(clock);
      }).toThrow(EmptySaleException);
    });

    it('finalizes a sale with items into PENDING_PAYMENT and freezes cart', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Personal Training Session',
        quantity: 1,
        unitPrice: Money.create(80.0, 'USD'),
      });

      sale.finalize(clock);

      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.version).toBe(2);

      const events = sale.getUncommittedEvents();
      expect(events.some((e) => e.eventType === 'SaleFinalized')).toBe(true);

      // Mutating items in PENDING_PAYMENT is strictly blocked
      expect(() => {
        sale.addItem({
          source: defaultSource,
          description: 'Water',
          quantity: 1,
          unitPrice: Money.create(2.0, 'USD'),
        });
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.applyOrderDiscount(Discount.percentage(10, 'Late Promo'));
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.finalize();
      }).toThrow(InvalidSaleTransitionException);
    });

    it('transitions to PARTIALLY_PAID and then to PAID', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Yoga Class',
        quantity: 1,
        unitPrice: Money.create(30.0, 'USD'),
      });
      sale.finalize(clock);

      sale.markPartiallyPaid(clock);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
    });

    it('allows cancellation from DRAFT and PENDING_PAYMENT', () => {
      const draftSale = Sale.create({ source: defaultSource }, clock);
      draftSale.cancel('Customer changed mind', clock);
      expect(draftSale.status).toBe(SaleStatus.CANCELLED);

      const finalizedSale = Sale.create({ source: defaultSource }, clock);
      finalizedSale.addItem({
        source: defaultSource,
        description: 'Towel',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      finalizedSale.finalize(clock);
      finalizedSale.cancel('Payment method expired', clock);
      expect(finalizedSale.status).toBe(SaleStatus.CANCELLED);
    });

    it('rejects cancellation from PAID status', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Towel',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });
      sale.finalize(clock);
      sale.markPaid(clock);

      expect(() => {
        sale.cancel('Wants refund');
      }).toThrow(InvalidSaleStateException);
    });
  });

  describe('Defensive Encapsulation & Domain Events', () => {
    it('protects internal items list against external mutation', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      const exposedItems = sale.items;
      expect(Object.isFrozen(exposedItems)).toBe(true);
      expect(() => {
        (exposedItems as unknown as unknown[]).push({});
      }).toThrow();
    });

    it('records and clears uncommitted events', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Water',
        quantity: 1,
        unitPrice: Money.create(2.0, 'USD'),
      });

      expect(sale.getUncommittedEvents().length).toBe(2);
      sale.clearEvents();
      expect(sale.getUncommittedEvents().length).toBe(0);
    });
  });

  describe('Item-Level Discounts Governed by Sale', () => {
    it('applies and removes line-item discount through Sale aggregate and recalculates totals', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      const item = sale.addItem({
        source: defaultSource,
        description: 'Yoga Mat',
        quantity: 1,
        unitPrice: Money.create(40.0, 'USD'),
      });

      expect(sale.total.amount).toBe(40.0);

      sale.applyItemDiscount(item.id, Discount.fixedAmount(10.0, 'Mat Discount'));
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(30.0);

      sale.removeItemDiscount(item.id);
      expect(sale.discountTotal.amount).toBe(0.0);
      expect(sale.total.amount).toBe(40.0);
    });

    it('rejects applying item discount after finalization', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      const item = sale.addItem({
        source: defaultSource,
        description: 'T-Shirt',
        quantity: 1,
        unitPrice: Money.create(25.0, 'USD'),
      });
      sale.finalize(clock);

      expect(() => {
        sale.applyItemDiscount(item.id, Discount.percentage(10, 'Late Discount'));
      }).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('Reconstitution and Critical Reconciliation Invariant', () => {
    it('reconstitutes an existing Sale when persisted snapshot totals reconcile exactly', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Protein Shake',
        quantity: 2,
        unitPrice: Money.create(5.0, 'USD'),
        discount: Discount.percentage(10, '10% line discount'),
      });
      sale.applyOrderDiscount(Discount.fixedAmount(1.0, 'Order Coupon'));
      sale.finalize(clock);

      // Subtotal: 10.00, Line discount: 1.00, Pre-order net: 9.00, Order discount: 1.00, Total discount: 2.00, Total: 8.00
      const reconstituted = Sale.reconstitute({
        id: sale.id,
        status: sale.status,
        currency: sale.currency,
        source: sale.source,
        items: [...sale.items],
        orderDiscount: sale.orderDiscount,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        total: sale.total,
        version: sale.version,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
      });

      expect(reconstituted.id.equals(sale.id)).toBe(true);
      expect(reconstituted.subtotal.amount).toBe(10.0);
      expect(reconstituted.discountTotal.amount).toBe(2.0);
      expect(reconstituted.total.amount).toBe(8.0);
    });

    it('throws InvalidSaleStateException when persisted subtotal does not equal sum of item subtotals', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Protein Bar',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });

      expect(() => {
        Sale.reconstitute({
          id: sale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: sale.source,
          items: [...sale.items],
          subtotal: Money.create(999.0, 'USD'), // Tampered subtotal (expected 5.00)
          discountTotal: Money.zero('USD'),
          total: Money.create(999.0, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }).toThrow(InvalidSaleStateException);
    });

    it('throws InvalidSaleStateException when persisted total does not equal subtotal - discountTotal', () => {
      const sale = Sale.create({ source: defaultSource }, clock);
      sale.addItem({
        source: defaultSource,
        description: 'Protein Bar',
        quantity: 1,
        unitPrice: Money.create(10.0, 'USD'),
      });

      expect(() => {
        Sale.reconstitute({
          id: sale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: sale.source,
          items: [...sale.items],
          subtotal: Money.create(10.0, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(5.0, 'USD'), // Tampered total (expected 10.00)
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }).toThrow(InvalidSaleStateException);
    });
  });
});
