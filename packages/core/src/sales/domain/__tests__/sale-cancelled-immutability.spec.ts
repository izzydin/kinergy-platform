import { Sale } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { SaleItemId } from '../value-objects/sale-item-id.vo';
import { Clock } from '../shared/clock';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { InvalidSaleTransitionException } from '../exceptions/invalid-sale-transition.exception';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { PrismaSaleRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { PrismaClient } from '@prisma/client';

class TestClock implements Clock {
  constructor(private currentDate: Date = new Date('2026-09-28T10:00:00.000Z')) {}
  public now(): Date {
    return new Date(this.currentDate.getTime());
  }
  public advance(ms: number): void {
    this.currentDate = new Date(this.currentDate.getTime() + ms);
  }
}

describe('Cancelled Sale Immutability & Financial Integrity Hardening', () => {
  const clock = new TestClock();
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-100',
    sourceCode: 'PROTEIN-01',
  });

  const createDraftSaleWithItems = (): { sale: Sale; itemId: SaleItemId } => {
    const sale = Sale.create(
      {
        source: validSource,
        tenantId: 'tenant-gym-01',
        clientId: 'client-alice-01',
        currency: 'USD',
      },
      clock,
    );

    const item = sale.addItem(
      {
        source: validSource,
        description: 'Whey Protein 2kg',
        quantity: 2,
        unitPrice: Money.create(30.0, 'USD'),
        discount: Discount.fixed(5.0, 'Promo $5 off'),
      },
      clock,
    );

    sale.applyOrderDiscount(Discount.percentage(10, 'VIP 10%'), clock);
    sale.clearEvents();

    return { sale, itemId: item.id };
  };

  const createCancelledSale = (): { sale: Sale; itemId: SaleItemId } => {
    const { sale, itemId } = createDraftSaleWithItems();
    clock.advance(1000);
    sale.cancel('Customer declined transaction at point of sale', clock);
    sale.clearEvents();
    return { sale, itemId };
  };

  describe('1. Cancelled Sale Verification & Immutability Preconditions', () => {
    it('enters CANCELLED status with terminal audit timestamps and reason', () => {
      const { sale } = createCancelledSale();

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.isTerminal()).toBe(true);
      expect(sale.cancellationReason).toBe('Customer declined transaction at point of sale');
      expect(sale.cancelledAt).toBeInstanceOf(Date);
      expect(sale.version).toBe(2);
    });

    it('reconstituting a CANCELLED sale requires non-empty cancellationReason and cancelledAt', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        Sale.reconstitute({
          id: sale.id,
          tenantId: sale.tenantId,
          clientId: sale.clientId,
          status: SaleStatus.CANCELLED,
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
          cancellationReason: '', // Invalid empty reason
          cancelledAt: sale.cancelledAt,
        });
      }).toThrow(InvalidSaleStateException);

      expect(() => {
        Sale.reconstitute({
          id: sale.id,
          tenantId: sale.tenantId,
          clientId: sale.clientId,
          status: SaleStatus.CANCELLED,
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
          cancellationReason: 'Valid reason',
          cancelledAt: undefined, // Invalid missing timestamp
        });
      }).toThrow(InvalidSaleStateException);
    });
  });

  describe('2. Rejection of Item Mutations on Cancelled Sale', () => {
    it('cancelled Sale rejects addItem', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.addItem(
          {
            source: validSource,
            description: 'Creatine Monohydrate',
            quantity: 1,
            unitPrice: Money.create(20.0, 'USD'),
          },
          clock,
        );
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects removeItem', () => {
      const { sale, itemId } = createCancelledSale();

      expect(() => {
        sale.removeItem(itemId, clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects updateItem', () => {
      const { sale, itemId } = createCancelledSale();

      expect(() => {
        sale.updateItem(itemId, { quantity: 5 }, clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects updateItemQuantity', () => {
      const { sale, itemId } = createCancelledSale();

      expect(() => {
        sale.updateItemQuantity(itemId, 10, clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('protects items array against external array mutation', () => {
      const { sale } = createCancelledSale();

      expect(Object.isFrozen(sale.items)).toBe(true);

      expect(() => {
        (sale.items as unknown[]).push({} as never);
      }).toThrow(TypeError);
    });
  });

  describe('3. Rejection of Discount Mutations on Cancelled Sale', () => {
    it('cancelled Sale rejects applyItemDiscount', () => {
      const { sale, itemId } = createCancelledSale();

      expect(() => {
        sale.applyItemDiscount(itemId, Discount.percentage(15, 'Late promo'), clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects removeItemDiscount', () => {
      const { sale, itemId } = createCancelledSale();

      expect(() => {
        sale.removeItemDiscount(itemId, clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects applyOrderDiscount and applyDiscount', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.applyOrderDiscount(Discount.fixed(10, 'Staff discount'), clock);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.applyDiscount(Discount.fixed(10, 'Staff discount'), clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('cancelled Sale rejects removeOrderDiscount and removeDiscount', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.removeOrderDiscount(clock);
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.removeDiscount(clock);
      }).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('4. Rejection of Financial & Totals Mutations on Cancelled Sale', () => {
    it('cancelled Sale rejects calculateTotals recalculation call', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.calculateTotals();
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('prevents direct property mutation of subtotal, discountTotal, total, and currency (no setters)', () => {
      const { sale } = createCancelledSale();

      const subtotalDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'subtotal');
      expect(subtotalDesc?.set).toBeUndefined();

      const discountTotalDesc = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(sale),
        'discountTotal',
      );
      expect(discountTotalDesc?.set).toBeUndefined();

      const totalDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'total');
      expect(totalDesc?.set).toBeUndefined();

      const currencyDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'currency');
      expect(currencyDesc?.set).toBeUndefined();

      expect(() => {
        (sale as unknown as { total: Money }).total = Money.zero('USD');
      }).toThrow(TypeError);

      expect(() => {
        (sale as unknown as { currency: string }).currency = 'EUR';
      }).toThrow(TypeError);
    });
  });

  describe('5. Client Association Hardening on Cancelled Sale', () => {
    it('allows assigning client in DRAFT status', () => {
      const sale = Sale.create({ source: validSource }, clock);
      expect(sale.clientId).toBeUndefined();

      sale.assignClient('client-new-001');
      expect(sale.clientId).toBe('client-new-001');

      sale.assignClient(undefined);
      expect(sale.clientId).toBeUndefined();
    });

    it('rejects empty or whitespace clientId in assignClient', () => {
      const sale = Sale.create({ source: validSource }, clock);

      expect(() => sale.assignClient('')).toThrow(InvalidSaleStateException);
      expect(() => sale.assignClient('   ')).toThrow(InvalidSaleStateException);
    });

    it('cancelled Sale rejects assignClient', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.assignClient('client-hacked-999');
      }).toThrow(SaleAlreadyFinalizedException);

      expect(() => {
        sale.assignClient(undefined);
      }).toThrow(SaleAlreadyFinalizedException);
    });

    it('prevents direct property assignment to clientId (no setter)', () => {
      const { sale } = createCancelledSale();

      const clientIdDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'clientId');
      expect(clientIdDesc?.set).toBeUndefined();

      expect(() => {
        (sale as unknown as { clientId: string }).clientId = 'client-hacked-999';
      }).toThrow(TypeError);
    });
  });

  describe('6. Rejection of Status Transitions & Resurrection on Cancelled Sale', () => {
    it('cancelled Sale cannot become PAID', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.markPaid(clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot become PENDING_PAYMENT or finalize', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.finalize(clock);
      }).toThrow(InvalidSaleTransitionException);

      expect(() => {
        sale.markPendingPayment(clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot become PARTIALLY_PAID', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.markPartiallyPaid(clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot become COMPLETED', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.markCompleted(clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot become REFUNDED', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.markRefunded('Refund cancelled sale', clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot re-cancel', () => {
      const { sale } = createCancelledSale();

      expect(() => {
        sale.cancel('Cancel again', clock);
      }).toThrow(InvalidSaleTransitionException);
    });

    it('cancelled Sale cannot silently return to an active state (canTransitionTo is false for all)', () => {
      const { sale } = createCancelledSale();

      const allStatuses: SaleStatus[] = [
        SaleStatus.DRAFT,
        SaleStatus.PENDING_PAYMENT,
        SaleStatus.PARTIALLY_PAID,
        SaleStatus.PAID,
        SaleStatus.COMPLETED,
        SaleStatus.CANCELLED,
        SaleStatus.REFUNDED,
      ];

      for (const status of allStatuses) {
        expect(sale.canTransitionTo(status)).toBe(false);
      }
    });

    it('prevents direct property assignment to status (no setter)', () => {
      const { sale } = createCancelledSale();

      const statusDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'status');
      expect(statusDesc?.set).toBeUndefined();

      expect(() => {
        (sale as unknown as { status: SaleStatus }).status = SaleStatus.PAID;
      }).toThrow(TypeError);

      expect(() => {
        (sale as unknown as { status: SaleStatus }).status = SaleStatus.DRAFT;
      }).toThrow(TypeError);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
    });
  });

  describe('7. Persistence-Level Immutability Guard', () => {
    type MockPrisma = {
      $transaction: jest.Mock;
      sale: {
        findUnique: jest.Mock;
        upsert: jest.Mock;
        updateMany: jest.Mock;
      };
      saleItem: {
        upsert: jest.Mock;
        deleteMany: jest.Mock;
      };
    };

    const createMockPrisma = (saleFindUniqueResult: unknown, updateManyCount = 1): MockPrisma => {
      const mock: MockPrisma = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock)),
        sale: {
          findUnique: jest.fn().mockResolvedValue(saleFindUniqueResult),
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
        },
        saleItem: {
          upsert: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({}),
        },
      };
      return mock;
    };

    it('PrismaSaleRepository.save rejects updating an already CANCELLED sale record', async () => {
      const mockPrisma = createMockPrisma({ status: 'CANCELLED' });

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const { sale } = createCancelledSale();

      await expect(repo.save(sale)).rejects.toThrow(InvalidSaleStateException);
      await expect(repo.save(sale)).rejects.toThrow(
        /Sale is already in terminal CANCELLED status in persistence/,
      );

      // Verify no write operations were dispatched
      expect(mockPrisma.sale.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.sale.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.saleItem.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.saleItem.deleteMany).not.toHaveBeenCalled();
    });

    it('PrismaSaleRepository.save permits transitioning a DRAFT or PENDING_PAYMENT sale to CANCELLED', async () => {
      const mockPrisma = createMockPrisma({ status: 'PENDING_PAYMENT' }, 1);

      const repo = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
      const { sale } = createCancelledSale();

      await expect(repo.save(sale)).resolves.not.toThrow();
      expect(mockPrisma.sale.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sale.id.value, version: 1 },
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancellationReason: 'Customer declined transaction at point of sale',
          }),
        }),
      );
    });
  });
});
