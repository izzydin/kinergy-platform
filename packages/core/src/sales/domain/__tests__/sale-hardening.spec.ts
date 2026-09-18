import { Sale } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SaleId } from '../value-objects/sale-id.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { SaleItem } from '../entities/sale-item.entity';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { InvalidSaleItemException } from '../exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../exceptions/invalid-discount.exception';
import { SaleDomainException } from '../exceptions/sale-domain.exception';
import { Clock } from '../shared/clock';

class DeterministicClock implements Clock {
  constructor(private currentDate: Date) {}
  public now(): Date {
    return this.currentDate;
  }
}

describe('Sale Aggregate Root — Production Financial Hardening & Anti-Tampering', () => {
  const clock = new DeterministicClock(new Date('2026-09-17T12:00:00.000Z'));
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-prod-001',
    sourceCode: 'WHEY-VAN-01',
  });

  describe('1. Construction & Factory Hardening', () => {
    it('rejects creation when props is missing', () => {
      expect(() => (Sale as unknown as { create: (p: unknown) => Sale }).create(null)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('rejects creation when SourceReference is missing or not an instance of SourceReference', () => {
      expect(() =>
        Sale.create(
          {
            source: {
              sourceType: SourceType.INVENTORY_ITEM,
              sourceId: 'inv-1',
            } as unknown as SourceReference,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects creation when SaleId is not an instance of SaleId', () => {
      expect(() =>
        Sale.create(
          {
            source: validSource,
            id: { value: 'fake-id' } as unknown as SaleId,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects creation when tenantId is empty or whitespace only', () => {
      expect(() =>
        Sale.create(
          {
            source: validSource,
            tenantId: '   ',
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects creation when clientId is empty or whitespace only', () => {
      expect(() =>
        Sale.create(
          {
            source: validSource,
            clientId: '   ',
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects creation when currency is not a valid 3-letter ISO code', () => {
      expect(() =>
        Sale.create(
          {
            source: validSource,
            currency: 'US',
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        Sale.create(
          {
            source: validSource,
            currency: 'INVALID',
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects creation when orderDiscount is not an instance of Discount', () => {
      expect(() =>
        Sale.create(
          {
            source: validSource,
            orderDiscount: {
              type: 'PERCENTAGE',
              value: 10,
              reason: 'Hacked',
            } as unknown as Discount,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('2. Line Item Addition & Precision Hardening', () => {
    it('rejects addItem when props is missing', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => (sale as unknown as { addItem: (p: unknown) => void }).addItem(null)).toThrow(
        InvalidSaleStateException,
      );
    });

    it('rejects addItem when unitPrice is not a Money instance', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Item with raw object price',
            quantity: 1,
            unitPrice: { amount: 10, currency: 'USD' } as unknown as Money,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects addItem when adding an item with duplicate SaleItemId', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const itemId = SaleItemId.create();

      sale.addItem(
        {
          id: itemId,
          source: validSource,
          description: 'Original Item',
          quantity: 1,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );

      expect(() =>
        sale.addItem(
          {
            id: itemId,
            source: validSource,
            description: 'Duplicate Item ID',
            quantity: 2,
            unitPrice: Money.create(15.0, 'USD'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects addItem when quantity rounds down to 0 at 3 decimal places (underflow guard)', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Micro Quantity Item',
            quantity: 0.0001, // Rounds to 0.000 at 3 decimals
            unitPrice: Money.create(100.0, 'USD'),
          },
          clock,
        ),
      ).toThrow(InvalidSaleItemException);
    });

    it('rejects addItem when line discount is not a Discount instance', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Discount Tampering Item',
            quantity: 1,
            unitPrice: Money.create(50.0, 'USD'),
            discount: { type: 'PERCENTAGE', value: 20 } as unknown as Discount,
          },
          clock,
        ),
      ).toThrow(InvalidSaleItemException);
    });
  });

  describe('3. Mutating Cart Items with Invalid Item IDs & Input Data', () => {
    let sale: Sale;
    let existingItemId: SaleItemId;

    beforeEach(() => {
      sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Standard Item',
          quantity: 2,
          unitPrice: Money.create(20.0, 'USD'),
        },
        clock,
      );
      existingItemId = item.id;
    });

    it('rejects updateItemQuantity when itemId is missing or blank', () => {
      expect(() => sale.updateItemQuantity('', 5, clock)).toThrow(InvalidSaleStateException);
      expect(() => sale.updateItemQuantity('   ', 5, clock)).toThrow(InvalidSaleStateException);
      expect(() =>
        (
          sale as unknown as { updateItemQuantity: (id: unknown, q: number) => void }
        ).updateItemQuantity(null, 5),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects applyItemDiscount when itemId is missing or discount is not a Discount instance', () => {
      expect(() =>
        sale.applyItemDiscount(
          existingItemId,
          { type: 'PERCENTAGE', value: 10 } as unknown as Discount,
          clock,
        ),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        sale.applyItemDiscount('', Discount.percentage(10, 'Valid Reason'), clock),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects removeItemDiscount when itemId is missing or blank', () => {
      expect(() => sale.removeItemDiscount('', clock)).toThrow(InvalidSaleStateException);
      expect(() =>
        (sale as unknown as { removeItemDiscount: (id: unknown) => void }).removeItemDiscount(null),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects removeItem when itemId is missing or blank', () => {
      expect(() => sale.removeItem('', clock)).toThrow(InvalidSaleStateException);
      expect(() =>
        (sale as unknown as { removeItem: (id: unknown) => void }).removeItem(null),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects applyOrderDiscount when discount is not a Discount instance', () => {
      expect(() =>
        sale.applyOrderDiscount({ type: 'FIXED_AMOUNT', value: 5 } as unknown as Discount, clock),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('4. Financial Invariants: Non-Negative Guard and Capping Under Pressure', () => {
    it('guarantees fixed line discount exceeding subtotal is rejected by domain invariant', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => {
        sale.addItem(
          {
            source: validSource,
            description: 'Small Item',
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
            discount: Discount.fixedAmount(50.0, 'Huge Coupon'), // Exceeds line subtotal
          },
          clock,
        );
      }).toThrow(InvalidDiscountException);
    });

    it('guarantees fixed line discount equal to unit price * quantity results in $0.00 line total', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Small Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
          discount: Discount.fixedAmount(10.0, 'Exact Coupon'), // Equal to line subtotal
        },
        clock,
      );

      expect(sale.subtotal.amount).toBe(10.0);
      expect(sale.discountTotal.amount).toBe(10.0);
      expect(sale.total.amount).toBe(0.0); // Total is $0.00, non-negative
    });

    it('guarantees total does not drop below 0 when order discount exceeds net pre-order subtotal', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item A',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'), // Subtotal $30
          discount: Discount.fixedAmount(10.0, 'Line Disc'), // Net $20
        },
        clock,
      );

      sale.applyOrderDiscount(Discount.fixedAmount(100.0, 'Massive Manager Voucher'), clock);

      expect(sale.subtotal.amount).toBe(30.0);
      expect(sale.discountTotal.amount).toBe(30.0); // $10 line + $20 order (capped at pre-order net)
      expect(sale.total.amount).toBe(0.0);
    });

    it('rejects decreasing quantity when fixed line discount would exceed new subtotal (failure atomicity)', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Bulk Towels',
          quantity: 5,
          unitPrice: Money.create(10.0, 'USD'), // Subtotal $50
          discount: Discount.fixedAmount(30.0, 'Bulk Discount'),
        },
        clock,
      );

      // Decreasing quantity from 5 to 2 drops subtotal to $20, which is less than fixed discount $30.
      // Must be rejected by domain invariant rather than silently clamping.
      expect(() => {
        sale.updateItemQuantity(item.id, 2, clock);
      }).toThrow(InvalidDiscountException);

      // Failure atomicity: Sale remains at 5 items ($50 subtotal, $30 discount, $20 total)
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.discountTotal.amount).toBe(30.0);
      expect(sale.total.amount).toBe(20.0);
    });

    it('dynamically adapts line percentage discount and order discount when quantity decreases', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Bulk Towels',
          quantity: 5,
          unitPrice: Money.create(10.0, 'USD'), // Subtotal $50
          discount: Discount.percentage(40, 'Bulk 40% Discount'), // Disc = $20
        },
        clock,
      );

      sale.applyOrderDiscount(Discount.fixedAmount(15.0, 'Order Bonus'), clock);

      // Subtotal $50, Line Disc $20 -> Net $30 -> Order Disc $15 -> Disc Total $35, Total $15
      expect(sale.subtotal.amount).toBe(50.0);
      expect(sale.discountTotal.amount).toBe(35.0);
      expect(sale.total.amount).toBe(15.0);

      // Decrease quantity from 5 to 2 (Subtotal drops to $20, 40% Line Disc adapts to $8.00)
      sale.updateItemQuantity(item.id, 2, clock);

      // Subtotal $20. Line Disc $8 -> Net pre-order $12. Order Disc $15 capped at $12 -> Disc Total $20, Total $0
      expect(sale.subtotal.amount).toBe(20.0);
      expect(sale.discountTotal.amount).toBe(20.0);
      expect(sale.total.amount).toBe(0.0);
    });
  });

  describe('5. Immutability & Defensive Encapsulation Protection', () => {
    it('prevents external array push or mutation on sale.items getter', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Item 1',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );

      const items = sale.items as unknown as SaleItem[];
      expect(Object.isFrozen(items)).toBe(true);
      expect(() => {
        items.push({} as unknown as SaleItem);
      }).toThrow();
    });

    it('prevents external modification of uncommitted events', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const events = sale.getUncommittedEvents() as unknown as unknown[];
      expect(Object.isFrozen(events)).toBe(true);
      expect(() => {
        events.push({});
      }).toThrow();
    });

    it('returns defensive copies of dates ensuring internal timestamps are tamper-proof', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const createdAt1 = sale.createdAt;
      createdAt1.setFullYear(1990); // Mutate the returned copy

      expect(sale.createdAt.getFullYear()).toBe(2026); // Internal date is protected
    });

    it('locks all mutating methods once sale departs DRAFT into PENDING_PAYMENT', () => {
      const sale = Sale.create({ source: validSource }, clock);
      const item = sale.addItem(
        {
          source: validSource,
          description: 'Lockable Item',
          quantity: 1,
          unitPrice: Money.create(25.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);

      expect(() =>
        sale.addItem(
          {
            source: validSource,
            description: 'Item after finalize',
            quantity: 1,
            unitPrice: Money.create(10.0, 'USD'),
          },
          clock,
        ),
      ).toThrow(SaleAlreadyFinalizedException);

      expect(() => sale.updateItemQuantity(item.id, 10, clock)).toThrow(
        SaleAlreadyFinalizedException,
      );
      expect(() =>
        sale.applyItemDiscount(item.id, Discount.percentage(10, 'After finalize'), clock),
      ).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeItemDiscount(item.id, clock)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeItem(item.id, clock)).toThrow(SaleAlreadyFinalizedException);
      expect(() =>
        sale.applyOrderDiscount(Discount.percentage(10, 'After finalize'), clock),
      ).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeOrderDiscount(clock)).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('6. Reconstitution Strict Invariant Auditing', () => {
    let validSale: Sale;

    beforeEach(() => {
      validSale = Sale.create(
        { source: validSource, tenantId: 'tenant-100', clientId: 'client-200' },
        clock,
      );
      validSale.addItem(
        {
          source: validSource,
          description: 'Item',
          quantity: 1,
          unitPrice: Money.create(50.0, 'USD'),
        },
        clock,
      );
    });

    it('rejects reconstitution with missing props or non-SaleId', () => {
      expect(() =>
        Sale.reconstitute(null as unknown as Parameters<typeof Sale.reconstitute>[0]),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        Sale.reconstitute({
          id: { value: 'not-a-vo' } as unknown as SaleId,
          status: validSale.status,
          currency: validSale.currency,
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: validSale.version,
          createdAt: validSale.createdAt,
          updatedAt: validSale.updatedAt,
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution with invalid status', () => {
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: 'MALICIOUS_STATUS' as unknown as SaleStatus,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when items array has duplicate SaleItem IDs', () => {
      const item = validSale.items[0]!;
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSale.source,
          items: [item, item], // Duplicate identical item ID
          subtotal: Money.create(100.0, 'USD'),
          discountTotal: Money.zero('USD'),
          total: Money.create(100.0, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when financial values are not Money instances', () => {
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: { amount: 50, currency: 'USD' } as unknown as Money, // Raw object bypass
          discountTotal: Money.zero('USD'),
          total: Money.create(50.0, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when financial totals currency does not match Sale currency', () => {
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: Money.create(50.0, 'EUR'), // Currency mismatch!
          discountTotal: Money.zero('USD'),
          total: Money.create(50.0, 'USD'),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when CANCELLED status is missing cancellationReason or cancelledAt', () => {
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.CANCELLED,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: 2,
          cancellationReason: '', // Empty reason
          cancelledAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.CANCELLED,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: 2,
          cancellationReason: 'Legitimate reason',
          cancelledAt: undefined, // Missing timestamp
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when updatedAt is earlier than createdAt (time travel)', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: 1,
          createdAt: now,
          updatedAt: past, // Earlier than createdAt!
        }),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects reconstitution when DRAFT status contains post-draft timestamps', () => {
      expect(() =>
        Sale.reconstitute({
          id: validSale.id,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          source: validSale.source,
          items: [...validSale.items],
          subtotal: validSale.subtotal,
          discountTotal: validSale.discountTotal,
          total: validSale.total,
          version: 1,
          completedAt: new Date(), // DRAFT cannot be completed!
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('7. Transition Hardening with Malicious or Null Arguments', () => {
    it('rejects cancel with non-string reason', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(() => (sale as unknown as { cancel: (r: unknown) => void }).cancel(12345)).toThrow(
        SaleDomainException,
      );
    });

    it('rejects markRefunded with invalid whitespace or non-string reason when provided', () => {
      const sale = Sale.create({ source: validSource }, clock);
      sale.addItem(
        {
          source: validSource,
          description: 'Refund Test Item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        },
        clock,
      );
      sale.finalize(clock);
      sale.markPaid(clock);

      expect(() =>
        (sale as unknown as { markRefunded: (r: unknown) => void }).markRefunded(999),
      ).toThrow(SaleDomainException);

      expect(() => sale.markRefunded('   ')).toThrow(SaleDomainException);
    });
  });
});
