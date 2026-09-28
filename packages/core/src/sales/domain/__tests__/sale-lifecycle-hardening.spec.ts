import { Sale } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { Money } from '../value-objects/money.vo';
import { Discount } from '../value-objects/discount.vo';
import { Payment } from '../payment.aggregate';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { InvalidSaleTransitionException } from '../exceptions/invalid-sale-transition.exception';
import { InvalidSaleStateException } from '../exceptions/invalid-sale-state.exception';
import { SaleAlreadyFinalizedException } from '../exceptions/sale-already-finalized.exception';
import { Clock } from '../shared/clock';

class TestClock implements Clock {
  constructor(private currentDate: Date) {}
  public now(): Date {
    return new Date(this.currentDate.getTime());
  }
  public advance(ms: number): void {
    this.currentDate = new Date(this.currentDate.getTime() + ms);
  }
}

describe('Sale Lifecycle Hardening & Complete State Transition Matrix', () => {
  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SHAKE-01',
  });

  const createSaleInStatus = (
    status: SaleStatus,
    clock: TestClock = new TestClock(new Date('2026-09-28T10:00:00.000Z')),
  ): Sale => {
    const sale = Sale.create(
      {
        source: defaultSource,
        currency: 'USD',
        clientId: 'client-001',
      },
      clock,
    );

    sale.addItem(
      {
        source: defaultSource,
        description: 'Protein Shake',
        quantity: 2,
        unitPrice: Money.create(25.0, 'USD'),
      },
      clock,
    );
    sale.clearEvents();

    if (status === SaleStatus.DRAFT) {
      return sale;
    }

    sale.finalize(clock);
    sale.clearEvents();
    if (status === SaleStatus.PENDING_PAYMENT) {
      return sale;
    }

    if (status === SaleStatus.PARTIALLY_PAID) {
      sale.markPartiallyPaid(clock);
      sale.clearEvents();
      return sale;
    }

    if (status === SaleStatus.CANCELLED) {
      sale.cancel('Cancelled during checkout', clock);
      sale.clearEvents();
      return sale;
    }

    sale.markPaid(clock);
    sale.clearEvents();
    if (status === SaleStatus.PAID) {
      return sale;
    }

    if (status === SaleStatus.COMPLETED) {
      sale.markCompleted(clock);
      sale.clearEvents();
      return sale;
    }

    if (status === SaleStatus.REFUNDED) {
      sale.markRefunded('Refunded by customer request', clock);
      sale.clearEvents();
      return sale;
    }

    throw new Error(`Unhandled setup status: ${status}`);
  };

  describe('1. Prevention of Arbitrary Public Status Mutation', () => {
    it('does not allow public property assignment to status (no setter)', () => {
      const sale = createSaleInStatus(SaleStatus.DRAFT);

      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sale), 'status');
      expect(descriptor?.set).toBeUndefined();
      expect(typeof descriptor?.get).toBe('function');

      // Attempting assignment in strict mode throws TypeError or is ignored
      expect(() => {
        (sale as unknown as { status: SaleStatus }).status = SaleStatus.PAID;
      }).toThrow(TypeError);

      // Verify status is unaltered
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });
  });

  describe('2. Comprehensive 7x7 Transition Matrix Verification', () => {
    const allStatuses: SaleStatus[] = [
      SaleStatus.DRAFT,
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PARTIALLY_PAID,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
      SaleStatus.REFUNDED,
    ];

    const executeTransition = (sale: Sale, target: SaleStatus, clock: Clock): void => {
      switch (target) {
        case SaleStatus.PENDING_PAYMENT:
          sale.markPendingPayment(clock);
          break;
        case SaleStatus.PARTIALLY_PAID:
          sale.markPartiallyPaid(clock);
          break;
        case SaleStatus.PAID:
          sale.markPaid(clock);
          break;
        case SaleStatus.COMPLETED:
          sale.markCompleted(clock);
          break;
        case SaleStatus.CANCELLED:
          sale.cancel('Valid cancellation test reason', clock);
          break;
        case SaleStatus.REFUNDED:
          sale.markRefunded('Valid refund test reason', clock);
          break;
        case SaleStatus.DRAFT:
          // There is no domain method to transition backward to DRAFT
          throw new InvalidSaleTransitionException(
            sale.status,
            SaleStatus.DRAFT,
            'Cannot transition backward to DRAFT status.',
          );
        default:
          throw new Error(`Unknown target status: ${target}`);
      }
    };

    allStatuses.forEach((sourceStatus) => {
      describe(`From source state: ${sourceStatus}`, () => {
        allStatuses.forEach((targetStatus) => {
          it(`evaluates transition to ${targetStatus}`, () => {
            const clock = new TestClock(new Date('2026-09-28T10:00:00.000Z'));
            const sale = createSaleInStatus(sourceStatus, clock);
            const permitted = sale.canTransitionTo(targetStatus);

            if (permitted) {
              const prevVersion = sale.version;
              clock.advance(1000);

              expect(() => executeTransition(sale, targetStatus, clock)).not.toThrow();
              expect(sale.status).toBe(targetStatus);
              expect(sale.version).toBe(prevVersion + 1);
              expect(sale.updatedAt).toEqual(clock.now());
            } else {
              const prevVersion = sale.version;

              expect(() => executeTransition(sale, targetStatus, clock)).toThrow(
                InvalidSaleTransitionException,
              );
              expect(sale.status).toBe(sourceStatus);
              expect(sale.version).toBe(prevVersion);
            }
          });
        });
      });
    });
  });

  describe('3. Terminal States Rigidity', () => {
    it('asserts isTerminal() returns true strictly for CANCELLED and REFUNDED', () => {
      expect(createSaleInStatus(SaleStatus.DRAFT).isTerminal()).toBe(false);
      expect(createSaleInStatus(SaleStatus.PENDING_PAYMENT).isTerminal()).toBe(false);
      expect(createSaleInStatus(SaleStatus.PARTIALLY_PAID).isTerminal()).toBe(false);
      expect(createSaleInStatus(SaleStatus.PAID).isTerminal()).toBe(false);
      expect(createSaleInStatus(SaleStatus.COMPLETED).isTerminal()).toBe(false);
      expect(createSaleInStatus(SaleStatus.CANCELLED).isTerminal()).toBe(true);
      expect(createSaleInStatus(SaleStatus.REFUNDED).isTerminal()).toBe(true);
    });

    it('rejects any cart mutation or discount on CANCELLED sales', () => {
      const sale = createSaleInStatus(SaleStatus.CANCELLED);

      expect(() =>
        sale.addItem({
          source: defaultSource,
          description: 'New item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);

      expect(() => sale.removeItem('item-01')).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.applyOrderDiscount(Discount.percentage(10, 'Promo'))).toThrow(
        SaleAlreadyFinalizedException,
      );
    });

    it('rejects any cart mutation or discount on REFUNDED sales', () => {
      const sale = createSaleInStatus(SaleStatus.REFUNDED);

      expect(() =>
        sale.addItem({
          source: defaultSource,
          description: 'New item',
          quantity: 1,
          unitPrice: Money.create(10.0, 'USD'),
        }),
      ).toThrow(SaleAlreadyFinalizedException);

      expect(() => sale.removeItem('item-01')).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.applyOrderDiscount(Discount.percentage(10, 'Promo'))).toThrow(
        SaleAlreadyFinalizedException,
      );
    });
  });

  describe('4. Repeated Transition Idempotency Rejection', () => {
    it('rejects repeated finalize() on PENDING_PAYMENT', () => {
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT);
      expect(() => sale.finalize()).toThrow(InvalidSaleTransitionException);
      expect(() => sale.markPendingPayment()).toThrow(InvalidSaleTransitionException);
    });

    it('rejects repeated markPaid() on PAID', () => {
      const sale = createSaleInStatus(SaleStatus.PAID);
      expect(() => sale.markPaid()).toThrow(InvalidSaleTransitionException);
    });

    it('rejects repeated markCompleted() on COMPLETED', () => {
      const sale = createSaleInStatus(SaleStatus.COMPLETED);
      expect(() => sale.markCompleted()).toThrow(InvalidSaleTransitionException);
    });

    it('rejects repeated cancel() on CANCELLED', () => {
      const sale = createSaleInStatus(SaleStatus.CANCELLED);
      expect(() => sale.cancel('Second cancellation')).toThrow(InvalidSaleTransitionException);
    });

    it('rejects repeated markRefunded() on REFUNDED', () => {
      const sale = createSaleInStatus(SaleStatus.REFUNDED);
      expect(() => sale.markRefunded('Second refund')).toThrow(InvalidSaleTransitionException);
    });
  });

  describe('5. Cancellation Rules & Immutability', () => {
    it('requires a non-empty cancellation reason', () => {
      const sale = createSaleInStatus(SaleStatus.DRAFT);
      expect(() => sale.cancel('')).toThrow(InvalidSaleStateException);
      expect(() => sale.cancel('   ')).toThrow(InvalidSaleStateException);
    });

    it('records cancellation timestamp and reason accurately', () => {
      const clock = new TestClock(new Date('2026-09-28T12:00:00.000Z'));
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT, clock);

      clock.advance(5000);
      sale.cancel('Customer abandoned cart', clock);

      expect(sale.status).toBe(SaleStatus.CANCELLED);
      expect(sale.cancelledAt).toEqual(new Date('2026-09-28T12:00:05.000Z'));
      expect(sale.cancellationReason).toBe('Customer abandoned cart');
    });

    it('rejects cancellation on PAID or COMPLETED sales', () => {
      const paidSale = createSaleInStatus(SaleStatus.PAID);
      expect(() => paidSale.cancel('Customer wants refund')).toThrow(
        InvalidSaleTransitionException,
      );

      const completedSale = createSaleInStatus(SaleStatus.COMPLETED);
      expect(() => completedSale.cancel('Customer wants refund')).toThrow(
        InvalidSaleTransitionException,
      );
    });
  });

  describe('6. Separation of Payment State Machine & Payment Failure Handling', () => {
    it('maintains Payment lifecycle autonomy and keeps Sale untouched on Payment failure', () => {
      const clock = new TestClock(new Date('2026-09-28T10:00:00.000Z'));
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT, clock);

      // Create Payment aggregate for this Sale
      const payment = Payment.createPending(
        {
          tenantId: 'tenant-001',
          saleId: sale.id,
          amount: sale.total,
          method: PaymentMethod.QR,
        },
        clock,
      );

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Simulate Gateway Payment Failure
      clock.advance(2000);
      payment.markAsFailed('Card processor network timeout: 504 Gateway Timeout', clock);

      // Payment aggregate has transitioned to FAILED
      expect(payment.status).toBe(PaymentStatus.FAILED);

      // Crucial DDD invariant: Payment failure does NOT mutate Sale state
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // From this state, the customer can retry payment or cancel the Sale
      clock.advance(3000);
      sale.cancel('Customer card payment failed and customer left counter', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);
    });

    it('allows successful retry payment after previous payment failure', () => {
      const clock = new TestClock(new Date('2026-09-28T10:00:00.000Z'));
      const sale = createSaleInStatus(SaleStatus.PENDING_PAYMENT, clock);

      // Payment 1 fails
      const failedPayment = Payment.createPending(
        {
          tenantId: 'tenant-001',
          saleId: sale.id,
          amount: sale.total,
          method: PaymentMethod.QR,
        },
        clock,
      );
      failedPayment.markAsFailed('Insufficient funds', clock);
      expect(failedPayment.status).toBe(PaymentStatus.FAILED);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      // Payment 2 (Cash retry) succeeds
      clock.advance(10000);
      const retryPayment = Payment.createSettled(
        {
          tenantId: 'tenant-001',
          saleId: sale.id,
          amount: sale.total,
          method: PaymentMethod.CASH,
        },
        clock,
      );
      expect(retryPayment.status).toBe(PaymentStatus.COMPLETED);

      // Application orchestration marks Sale as PAID once payment is completed
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);
    });
  });
});
