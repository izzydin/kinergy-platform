import { Sale } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceType } from '../enums/source-type.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Clock } from '../shared/clock';
import {
  EmptySaleException,
  SaleAlreadyFinalizedException,
  InvalidSaleStateException,
  InvalidSaleTransitionException,
  InvalidSaleItemException,
  InvalidDiscountException,
} from '../exceptions';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';

class DeterministicClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
  public advanceBy(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

describe('Milestone 7.8 Authoritative Sale Invariant Catalog Specification', () => {
  const clock = new DeterministicClock(new Date('2026-09-25T12:00:00.000Z'));
  const source = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-101',
    sourceCode: 'WHEY-PRO-1KG',
  });

  const createDraftSale = (itemsCount = 1): Sale => {
    const sale = Sale.create(
      {
        tenantId: 'tenant-kinergy-01',
        currency: 'USD',
        source,
      },
      clock,
    );

    for (let i = 1; i <= itemsCount; i++) {
      sale.addItem(
        {
          source: SourceReference.create({
            sourceType: SourceType.INVENTORY_ITEM,
            sourceId: `sku-${i}`,
          }),
          description: `Product ${i}`,
          quantity: 1,
          unitPrice: Money.create(50, 'USD'),
        },
        clock,
      );
    }

    return sale;
  };

  describe('[SALE-001] Sale must contain at least one item when considered commercially valid', () => {
    it('allows an empty cart in DRAFT status during checkout preparation', () => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.itemCount).toBe(0);
      expect(sale.total.amount).toBe(0);
    });

    it('strictly forbids finalizing a Sale with zero line items', () => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);
      expect(() => sale.finalize(clock)).toThrow(EmptySaleException);
    });
  });

  describe('[SALE-002] Sale total must equal deterministic calculation of items minus applicable discounts', () => {
    it('calculates total deterministically across line subtotals and discounts', () => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);
      sale.addItem(
        {
          source,
          description: 'Item 1',
          quantity: 2,
          unitPrice: Money.create(25, 'USD'), // 50.00
          discount: Discount.percentage(10, '10% off'), // -5.00 => net 45.00
        },
        clock,
      );
      sale.addItem(
        {
          source,
          description: 'Item 2',
          quantity: 1,
          unitPrice: Money.create(30, 'USD'), // 30.00
        },
        clock,
      );

      sale.applyOrderDiscount(Discount.fixed(10, 'VIP Voucher'), clock);

      // Subtotal = 50 + 30 = 80.00
      // Line discount = 5.00
      // Net pre-order discount = 80 - 5 = 75.00
      // Order discount = 10.00
      // Total discount = 5 + 10 = 15.00
      // Final Total = 80 - 15 = 65.00
      expect(sale.subtotal.amount).toBe(80);
      expect(sale.discountTotal.amount).toBe(15);
      expect(sale.total.amount).toBe(65);
    });

    it('rejects reconstitution if persisted total does not reconcile with calculated total', () => {
      const saleId = SaleId.create();
      const now = clock.now();
      const item = SaleItem.create({
        saleId,
        source,
        description: 'Test Item',
        quantity: 1,
        unitPrice: Money.create(100, 'USD'),
      });

      expect(() =>
        Sale.reconstitute({
          id: saleId,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source,
          items: [item],
          subtotal: Money.create(100, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(90, 'USD'), // Corrupted total!
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('[SALE-003] Sale total cannot be negative', () => {
    it('guarantees total is floored at zero even if discount equals or exceeds subtotal', () => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);
      sale.addItem(
        {
          source,
          description: 'Promotional Trial',
          quantity: 1,
          unitPrice: Money.create(20, 'USD'),
        },
        clock,
      );

      // 100% discount reduces total to exactly 0.00
      sale.applyOrderDiscount(Discount.percentage(100, 'Free promo'), clock);
      expect(sale.total.amount).toBe(0);
      expect(sale.total.cents).toBe(0);
    });

    it('rejects instantiating negative Money anywhere in financial totals', () => {
      expect(() => Money.create(-10, 'USD')).toThrow(InvalidMoneyException);
    });
  });

  describe('[SALE-004] Sale subtotal cannot be negative', () => {
    it('enforces non-negative item prices, guaranteeing subtotal >= 0', () => {
      expect(() =>
        SaleItem.create({
          saleId: SaleId.create(),
          source,
          description: 'Negative price test',
          quantity: 1,
          unitPrice: Money.create(-5, 'USD'),
        }),
      ).toThrow(InvalidMoneyException);
    });
  });

  describe('[SALE-005] Sale discount total cannot be negative', () => {
    it('rejects creation of negative percentage discounts', () => {
      expect(() => Discount.percentage(-15, 'Invalid Negative Rate')).toThrow(
        InvalidDiscountException,
      );
    });

    it('rejects creation of negative fixed discounts', () => {
      expect(() => Discount.fixed(-10, 'Invalid Negative Fixed')).toThrow(InvalidDiscountException);
    });
  });

  describe('[SALE-006] Sale currency must be valid', () => {
    it('rejects invalid currency formats or non-3-letter codes', () => {
      expect(() => Sale.create({ source, currency: 'US1' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: 'TOOLONG' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: 'US' }, clock)).toThrow(
        InvalidSaleStateException,
      );
      expect(() => Sale.create({ source, currency: '' }, clock)).toThrow(InvalidSaleStateException);
    });
  });

  describe('[SALE-007] Sale cannot transition to PAID unless Payment is valid and COMPLETED', () => {
    it('forbids marking a DRAFT sale directly as PAID without going through finalized settlement', () => {
      const sale = createDraftSale();
      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
    });

    it('permits marking as PAID from PENDING_PAYMENT or PARTIALLY_PAID', () => {
      const sale = createDraftSale();
      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
    });
  });

  describe('[SALE-008] Cancelled Sale cannot be silently modified', () => {
    it('strictly forbids adding, updating, or removing items from a CANCELLED sale', () => {
      const sale = createDraftSale();
      sale.cancel('Customer walked away', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);

      expect(() =>
        sale.addItem(
          {
            source,
            description: 'Item after cancellation',
            quantity: 1,
            unitPrice: Money.create(10, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);

      expect(() => sale.applyOrderDiscount(Discount.percentage(10, 'Test'), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
    });

    it('strictly forbids state transitions out of CANCELLED', () => {
      const sale = createDraftSale();
      sale.cancel('Voided', clock);

      expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPaid(clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);
    });
  });

  describe('[SALE-009] A SaleItem attached to a Sale must belong to that Sale', () => {
    it('automatically assigns the parent SaleId to child items on addItem', () => {
      const sale = createDraftSale();
      const item = sale.items[0];
      expect(item?.saleId?.equals(sale.id)).toBe(true);
    });

    it('rejects reconstituting a Sale containing a SaleItem with a mismatched saleId', () => {
      const saleId = SaleId.create();
      const alienSaleId = SaleId.create();
      const now = clock.now();

      const alienItem = SaleItem.create({
        saleId: alienSaleId,
        source,
        description: 'Alien Item',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      });

      expect(() =>
        Sale.reconstitute({
          id: saleId,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source,
          items: [alienItem],
          subtotal: Money.create(50, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(50, 'USD'),
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('[SALE-010] One Sale represents exactly one commercial transaction', () => {
    it('generates a unique identity and cannot be reset to DRAFT for subsequent orders', () => {
      const sale1 = createDraftSale();
      const sale2 = createDraftSale();
      expect(sale1.id.equals(sale2.id)).toBe(false);

      sale1.finalize(clock);
      sale1.markPaid(clock);
      sale1.markCompleted(clock);
      expect(sale1.status).toBe(SaleStatus.COMPLETED);

      // Attempting to re-finalize or reopen is rejected
      expect(() => sale1.finalize(clock)).toThrow(InvalidSaleTransitionException);
    });
  });

  describe('[SALE-011] Valid Item Quantity', () => {
    it('rejects zero or negative quantities', () => {
      expect(() =>
        SaleItem.create({
          saleId: SaleId.create(),
          source,
          description: 'Zero quantity',
          quantity: 0,
          unitPrice: Money.create(10, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);

      expect(() =>
        SaleItem.create({
          saleId: SaleId.create(),
          source,
          description: 'Negative quantity',
          quantity: -2,
          unitPrice: Money.create(10, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);
    });

    it('rejects quantities exceeding 999,999', () => {
      expect(() =>
        SaleItem.create({
          saleId: SaleId.create(),
          source,
          description: 'Excessive quantity',
          quantity: 1_000_000,
          unitPrice: Money.create(10, 'USD'),
        }),
      ).toThrow(InvalidSaleItemException);
    });
  });

  describe('[SALE-012] Valid Item Price', () => {
    it('permits authorized complimentary items with $0.00 unit price', () => {
      const item = SaleItem.create({
        saleId: SaleId.create(),
        source,
        description: 'Complimentary Towel',
        quantity: 1,
        unitPrice: Money.zero('USD'),
      });
      expect(item.unitPrice.amount).toBe(0);
      expect(item.subtotal.amount).toBe(0);
    });
  });

  describe('[SALE-013] Valid Discount Bounds & Non-Exceeding Guard', () => {
    it('strictly rejects fixed discounts that exceed the eligible line subtotal', () => {
      expect(() =>
        SaleItem.create({
          saleId: SaleId.create(),
          source,
          description: 'Over-discounted Item',
          quantity: 1,
          unitPrice: Money.create(10, 'USD'),
          discount: Discount.fixed(25, 'Excessive discount'),
        }),
      ).toThrow(InvalidDiscountException);
    });

    it('strictly rejects percentage discounts exceeding 100%', () => {
      expect(() => Discount.percentage(105, '105% off')).toThrow(InvalidDiscountException);
    });
  });

  describe('[SALE-014] Currency Consistency across Aggregate', () => {
    it('rejects adding an item whose currency does not match the Sale currency', () => {
      const sale = Sale.create({ source, currency: 'USD' }, clock);
      expect(() =>
        sale.addItem(
          {
            source,
            description: 'Euro Item',
            quantity: 1,
            unitPrice: Money.create(20, 'EUR'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('[SALE-015] Valid Commercial Status Transitions', () => {
    it('strictly enforces the forward state machine progression', () => {
      const sale = createDraftSale();
      // Cannot skip to COMPLETED from DRAFT
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);

      sale.finalize(clock);
      // Cannot transition to COMPLETED directly from PENDING_PAYMENT
      expect(() => sale.markCompleted(clock)).toThrow(InvalidSaleTransitionException);

      sale.markPaid(clock);
      sale.markCompleted(clock);
      expect(sale.status).toBe(SaleStatus.COMPLETED);
    });
  });

  describe('[SALE-016] Valid Lifecycle Ordering & Terminal Immutability', () => {
    it('ensures terminal COMPLETED sales cannot be cancelled or re-finalized', () => {
      const sale = createDraftSale();
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);

      expect(() => sale.cancel('Too late', clock)).toThrow(InvalidSaleTransitionException);
      expect(() => sale.finalize(clock)).toThrow(InvalidSaleTransitionException);
    });
  });

  describe('[SALE-017] Timestamp Consistency', () => {
    it('rejects reconstitution if updatedAt is earlier than createdAt', () => {
      const saleId = SaleId.create();
      const now = new Date('2026-09-25T12:00:00.000Z');
      const past = new Date('2026-09-25T11:00:00.000Z');

      expect(() =>
        Sale.reconstitute({
          id: saleId,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source,
          items: [],
          subtotal: Money.zero('USD'),
          discountTotal: Money.zero('USD'),
          total: Money.zero('USD'),
          version: 1,
          createdAt: now,
          updatedAt: past, // Earlier than createdAt!
        }),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('[SALE-018] Immutable Commercial Snapshots (Post-Finalization Freeze)', () => {
    it('freezes items, prices, quantities, and discounts once finalized into PENDING_PAYMENT', () => {
      const sale = createDraftSale();
      sale.finalize(clock);

      expect(() =>
        sale.addItem(
          {
            source,
            description: 'Late Addition',
            quantity: 1,
            unitPrice: Money.create(10, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);

      const itemId = sale.items[0]!.id;
      expect(() => sale.updateItemQuantity(itemId, 5, clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() => sale.removeItem(itemId, clock)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.applyOrderDiscount(Discount.percentage(10, 'Discount'), clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
    });
  });

  describe('[SALE-019] Payment Amount Consistency (Settlement Coverage)', () => {
    it('supports transitioning to PARTIALLY_PAID on partial settlement and PAID on full settlement', () => {
      const sale = createDraftSale();
      sale.finalize(clock);

      sale.markPartiallyPaid(clock);
      expect(sale.status).toBe(SaleStatus.PARTIALLY_PAID);

      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
    });
  });

  describe('[SALE-020] Receipt Issuance Consistency', () => {
    it('records completedAt when transitioning from PAID to COMPLETED for receipt proof-of-purchase', () => {
      const sale = createDraftSale();
      sale.finalize(clock);
      sale.markPaid(clock);
      sale.markCompleted(clock);

      expect(sale.status).toBe(SaleStatus.COMPLETED);
      expect(sale.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('[SALE-021] Cancellation Reason Invariant', () => {
    it('requires a non-empty cancellationReason to cancel a sale', () => {
      const sale = createDraftSale();
      expect(() => sale.cancel('', clock)).toThrow(InvalidSaleStateException);
      expect(() => sale.cancel('   ', clock)).toThrow(InvalidSaleStateException);
    });
  });
});
