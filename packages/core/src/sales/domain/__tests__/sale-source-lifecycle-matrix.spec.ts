/**
 * Authoritative Domain Lifecycle & State-Mutation Matrix Test Suite for SaleSource.
 *
 * Traceability:
 * - Milestone 7.8: Sale Aggregate Boundary & Lifecycle Invariants (ADR-0119)
 * - Milestone 7.9: Sale Source References & Origin Model (ADR-0121)
 * - Invariant Catalog: SALE-008 (Cancelled Immutability), SALE-015 (State Progression), SALE-022 (Source Immutability)
 */

import { Sale, CreateSaleProps } from '../sale.aggregate';
import { SaleStatus } from '../enums/sale-status.enum';
import { SaleSourceType } from '../enums/sale-source-type.enum';
import { SaleSource } from '../value-objects/sale-source.vo';
import { Money } from '../value-objects/money.vo';
import { InvalidSaleStateException, SaleAlreadyFinalizedException } from '../exceptions';
import { Clock } from '../shared/clock';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('SaleSource Domain Lifecycle & State Mutation Matrix (ADR-0121)', () => {
  const clock = new TestClock(new Date('2026-09-29T11:00:00Z'));
  const tenantId = 'tenant_rehab_center';
  const clientId = 'client_patient_001';
  const usd = (amount: number) => Money.create(amount, 'USD');

  const baseSource = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session_initial_01');
  const alternateSource = SaleSource.create(SaleSourceType.FOOD, 'meal_healthy_02');

  const createSaleInState = (targetStatus: SaleStatus): Sale => {
    const sale = Sale.create(
      {
        tenantId,
        clientId,
        currency: 'USD',
        source: baseSource,
      },
      clock,
    );

    if (targetStatus === SaleStatus.DRAFT) {
      return sale;
    }

    if (targetStatus === SaleStatus.CANCELLED) {
      sale.cancel('Patient requested cancellation', clock);
      return sale;
    }

    // Add item required to progress past DRAFT
    sale.addItem({
      description: 'Physical Therapy Treatment',
      quantity: 1,
      unitPrice: usd(120),
      source: baseSource,
    });

    sale.finalize(clock);
    if (targetStatus === SaleStatus.PENDING_PAYMENT) {
      return sale;
    }

    if (targetStatus === SaleStatus.PARTIALLY_PAID) {
      sale.markPartiallyPaid(clock);
      return sale;
    }

    sale.markPaid(clock);
    if (targetStatus === SaleStatus.PAID) {
      return sale;
    }

    if (targetStatus === SaleStatus.COMPLETED) {
      sale.markCompleted(clock);
      return sale;
    }

    if (targetStatus === SaleStatus.REFUNDED) {
      sale.markRefunded('Customer requested refund', clock);
      return sale;
    }

    throw new Error(`Unhandled test status: ${targetStatus}`);
  };

  describe('1. Creation Transitions: Mandatory Commercial Origin', () => {
    it.each([
      SaleSourceType.KINESIOLOGY_SESSION,
      SaleSourceType.GYM_MEMBERSHIP,
      SaleSourceType.FOOD,
      SaleSourceType.DRINK,
      SaleSourceType.ROOM_RENTAL,
    ])('permits Sale creation with supported source type: %s', (type) => {
      const src = SaleSource.create(type, `ref_${type.toLowerCase()}`);
      const sale = Sale.create({ tenantId, currency: 'USD', source: src }, clock);

      expect(sale.source).toBe(src);
      expect(sale.sourceReference).toBe(src);
      expect(sale.status).toBe(SaleStatus.DRAFT);
    });

    it('rejects Sale creation when source is omitted entirely', () => {
      expect(() =>
        Sale.create({ tenantId, currency: 'USD' } as unknown as CreateSaleProps, clock),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects Sale creation when source is null or undefined', () => {
      expect(() =>
        Sale.create({ tenantId, currency: 'USD', source: null as unknown as SaleSource }, clock),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        Sale.create(
          { tenantId, currency: 'USD', source: undefined as unknown as SaleSource },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });
  });

  describe('2. Exhaustive $7$-State Mutation Matrix for changeSource()', () => {
    const allStatuses: SaleStatus[] = [
      SaleStatus.DRAFT,
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PARTIALLY_PAID,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
      SaleStatus.REFUNDED,
    ];

    it.each(allStatuses)(
      'prohibits changeSource() on %s and preserves aggregate state without partial mutation',
      (status) => {
        const sale = createSaleInState(status);
        const snapshotSource = sale.source;
        const snapshotStatus = sale.status;
        const snapshotVersion = sale.version;
        const snapshotItemCount = sale.itemCount;
        const snapshotTotal = sale.total.amount;

        // Expect domain rejection
        if (status === SaleStatus.CANCELLED) {
          expect(() => sale.changeSource(alternateSource)).toThrow(InvalidSaleStateException);
          try {
            sale.changeSource(alternateSource);
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('CANNOT_MODIFY_CANCELLED_SALE');
          }
        } else if (
          status === SaleStatus.PAID ||
          status === SaleStatus.COMPLETED ||
          status === SaleStatus.REFUNDED
        ) {
          expect(() => sale.changeSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
        } else {
          // DRAFT, PENDING_PAYMENT, PARTIALLY_PAID
          expect(() => sale.changeSource(alternateSource)).toThrow(InvalidSaleStateException);
          try {
            sale.changeSource(alternateSource);
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
          }
        }

        // Invariant: Non-partial failure guarantee — Sale remains 100% unaltered
        expect(sale.source).toBe(snapshotSource);
        expect(sale.status).toBe(snapshotStatus);
        expect(sale.version).toBe(snapshotVersion);
        expect(sale.itemCount).toBe(snapshotItemCount);
        expect(sale.total.amount).toBe(snapshotTotal);
      },
    );
  });

  describe('3. Exhaustive $7$-State Mutation Matrix for assignSource()', () => {
    const allStatuses: SaleStatus[] = [
      SaleStatus.DRAFT,
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PARTIALLY_PAID,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
      SaleStatus.REFUNDED,
    ];

    it.each(allStatuses)(
      'prohibits assignSource() on %s and preserves aggregate state without partial mutation',
      (status) => {
        const sale = createSaleInState(status);
        const snapshotSource = sale.source;
        const snapshotStatus = sale.status;
        const snapshotVersion = sale.version;
        const snapshotTotal = sale.total.amount;

        if (status === SaleStatus.CANCELLED) {
          expect(() => sale.assignSource(alternateSource)).toThrow(InvalidSaleStateException);
          try {
            sale.assignSource(alternateSource);
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('CANNOT_MODIFY_CANCELLED_SALE');
          }
        } else if (
          status === SaleStatus.PAID ||
          status === SaleStatus.COMPLETED ||
          status === SaleStatus.REFUNDED
        ) {
          expect(() => sale.assignSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
        } else {
          // DRAFT, PENDING_PAYMENT, PARTIALLY_PAID (already assigned at creation)
          expect(() => sale.assignSource(alternateSource)).toThrow(InvalidSaleStateException);
          try {
            sale.assignSource(alternateSource);
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
          }
        }

        // Non-partial mutation guarantee
        expect(sale.source).toBe(snapshotSource);
        expect(sale.status).toBe(snapshotStatus);
        expect(sale.version).toBe(snapshotVersion);
        expect(sale.total.amount).toBe(snapshotTotal);
      },
    );
  });

  describe('4. Exhaustive $7$-State Mutation Matrix for removeSource()', () => {
    const allStatuses: SaleStatus[] = [
      SaleStatus.DRAFT,
      SaleStatus.PENDING_PAYMENT,
      SaleStatus.PARTIALLY_PAID,
      SaleStatus.PAID,
      SaleStatus.COMPLETED,
      SaleStatus.CANCELLED,
      SaleStatus.REFUNDED,
    ];

    it.each(allStatuses)(
      'prohibits removeSource() on %s and guarantees origin permanence',
      (status) => {
        const sale = createSaleInState(status);
        const snapshotSource = sale.source;
        const snapshotStatus = sale.status;
        const snapshotVersion = sale.version;

        if (status === SaleStatus.CANCELLED) {
          expect(() => sale.removeSource()).toThrow(InvalidSaleStateException);
          try {
            sale.removeSource();
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('CANNOT_MODIFY_CANCELLED_SALE');
          }
        } else if (
          status === SaleStatus.PAID ||
          status === SaleStatus.COMPLETED ||
          status === SaleStatus.REFUNDED
        ) {
          expect(() => sale.removeSource()).toThrow(SaleAlreadyFinalizedException);
        } else {
          expect(() => sale.removeSource()).toThrow(InvalidSaleStateException);
          try {
            sale.removeSource();
          } catch (e) {
            expect((e as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
          }
        }

        // Non-partial failure guarantee
        expect(sale.source).toBe(snapshotSource);
        expect(sale.status).toBe(snapshotStatus);
        expect(sale.version).toBe(snapshotVersion);
      },
    );
  });

  describe('5. Post-Payment & Post-Cancellation Edge Cases', () => {
    it('prohibits assigning or changing source after partial payment (PARTIALLY_PAID)', () => {
      const sale = createSaleInState(SaleStatus.PARTIALLY_PAID);
      expect(() => sale.changeSource(alternateSource)).toThrow(InvalidSaleStateException);
      expect(() => sale.assignSource(alternateSource)).toThrow(InvalidSaleStateException);
      expect(() => sale.removeSource()).toThrow(InvalidSaleStateException);
    });

    it('prohibits assigning or changing source after full payment (PAID)', () => {
      const sale = createSaleInState(SaleStatus.PAID);
      expect(() => sale.changeSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.assignSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeSource()).toThrow(SaleAlreadyFinalizedException);
    });

    it('prohibits assigning or changing source after cancellation (CANCELLED)', () => {
      const sale = createSaleInState(SaleStatus.CANCELLED);
      expect(() => sale.changeSource(alternateSource)).toThrow(InvalidSaleStateException);
      expect(() => sale.assignSource(alternateSource)).toThrow(InvalidSaleStateException);
      expect(() => sale.removeSource()).toThrow(InvalidSaleStateException);
    });

    it('prohibits assigning or changing source after order refund (REFUNDED)', () => {
      const sale = createSaleInState(SaleStatus.REFUNDED);
      expect(() => sale.changeSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.assignSource(alternateSource)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.removeSource()).toThrow(SaleAlreadyFinalizedException);
    });
  });

  describe('6. Rejection of Direct Property Tampering', () => {
    it('prohibits direct property assignment on sale.source and sale.sourceReference', () => {
      const sale = createSaleInState(SaleStatus.DRAFT);

      expect(() => {
        (sale as unknown as { source: unknown }).source = alternateSource;
      }).toThrow();

      expect(() => {
        (sale as unknown as { sourceReference: unknown }).sourceReference = alternateSource;
      }).toThrow();

      expect(sale.source).toBe(baseSource);
    });
  });
});
