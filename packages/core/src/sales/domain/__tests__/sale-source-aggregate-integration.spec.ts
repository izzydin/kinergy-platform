import { Sale, CreateSaleProps, ReconstituteSaleProps } from '../sale.aggregate';
import { SaleItem } from '../entities/sale-item.entity';
import { SaleStatus } from '../enums/sale-status.enum';
import { SaleSourceType } from '../enums/sale-source-type.enum';
import { SaleSource } from '../value-objects/sale-source.vo';
import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleId } from '../value-objects/sale-id.vo';
import { Money } from '../value-objects/money.vo';
import { InvalidSaleStateException, SaleAlreadyFinalizedException } from '../exceptions';
import { Clock } from '../shared/clock';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  public now(): Date {
    return new Date(this.currentTime.getTime());
  }
}

describe('Sale Aggregate & SaleSource Domain Integration (ADR-0121)', () => {
  const clock = new TestClock(new Date('2026-09-29T10:00:00Z'));
  const validTenantId = 'tenant_kinergy_main';
  const validClientId = 'client_athlete_123';
  const usd = (amount: number) => Money.create(amount, 'USD');

  const createDraftSale = (source?: SaleSource | SourceReference) => {
    const saleSource = source ?? SaleSource.create(SaleSourceType.FOOD, 'meal_order_999');
    return Sale.create(
      {
        tenantId: validTenantId,
        clientId: validClientId,
        currency: 'USD',
        source: saleSource,
      },
      clock,
    );
  };

  describe('1. SaleSource Ownership and Supported Types at Creation', () => {
    const supportedTypes: Array<{ type: SaleSourceType; refId: string }> = [
      { type: SaleSourceType.KINESIOLOGY_SESSION, refId: 'session_kin_001' },
      { type: SaleSourceType.GYM_MEMBERSHIP, refId: 'membership_gym_12m' },
      { type: SaleSourceType.FOOD, refId: 'bar_food_bowl_44' },
      { type: SaleSourceType.DRINK, refId: 'smoothie_protein_02' },
      { type: SaleSourceType.ROOM_RENTAL, refId: 'room_rehab_bay_3' },
    ];

    it.each(supportedTypes)(
      'creates Sale aggregate with supported source type: $type',
      ({ type, refId }) => {
        const source = SaleSource.create(type, refId);
        const sale = Sale.create(
          {
            tenantId: validTenantId,
            clientId: validClientId,
            currency: 'USD',
            source,
          },
          clock,
        );

        expect(sale.source).toBeDefined();
        expect(sale.source).toBe(source);
        expect(sale.sourceReference).toBe(source);
        expect((sale.source as SaleSource).type).toBe(type);
        expect((sale.source as SaleSource).referenceId).toBe(refId);
        expect(sale.status).toBe(SaleStatus.DRAFT);
      },
    );

    it('supports backward-compatible SourceReference alongside SaleSource', () => {
      const legacySource = SourceReference.create({
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'legacy_sess_99',
        sourceCode: 'CODE-99',
      });

      const sale = Sale.create(
        {
          tenantId: validTenantId,
          clientId: validClientId,
          currency: 'USD',
          source: legacySource,
        },
        clock,
      );

      expect(sale.source).toBe(legacySource);
      expect(sale.sourceReference).toBe(legacySource);
      expect((sale.source as SourceReference).sourceType).toBe(SourceType.TREATMENT_SESSION);
    });

    it('accepts source passed via sourceReference prop alias', () => {
      const source = SaleSource.create(SaleSourceType.DRINK, 'drink_iso_001');
      const sale = Sale.create(
        {
          tenantId: validTenantId,
          currency: 'USD',
          sourceReference: source,
        },
        clock,
      );

      expect(sale.source).toBe(source);
      expect(sale.sourceReference).toBe(source);
    });
  });

  describe('2. Source Invariants: Required at Creation (ADR-0121 §4.7 & §4.8)', () => {
    it('rejects Sale creation when source is omitted entirely', () => {
      expect(() =>
        Sale.create(
          {
            tenantId: validTenantId,
            currency: 'USD',
          } as unknown as CreateSaleProps,
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects Sale creation when source is null or undefined', () => {
      expect(() =>
        Sale.create(
          {
            tenantId: validTenantId,
            currency: 'USD',
            source: null as unknown as SaleSource,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);

      expect(() =>
        Sale.create(
          {
            tenantId: validTenantId,
            currency: 'USD',
            source: undefined as unknown as SaleSource,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('rejects Sale creation when source is a plain object rather than a domain value object', () => {
      expect(() =>
        Sale.create(
          {
            tenantId: validTenantId,
            currency: 'USD',
            source: { type: 'FOOD', referenceId: 'meal_1' } as unknown as SaleSource,
          },
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('proves source is NOT optional during DRAFT (required at initial creation)', () => {
      expect(() =>
        Sale.create(
          {
            tenantId: validTenantId,
            currency: 'USD',
            items: [],
          } as unknown as CreateSaleProps,
          clock,
        ),
      ).toThrow(InvalidSaleStateException);
    });

    it('proves source is permanently present prior to PENDING_PAYMENT transition', () => {
      const source = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session_123');
      const sale = Sale.create(
        {
          tenantId: validTenantId,
          currency: 'USD',
          source,
        },
        clock,
      );

      sale.addItem({
        description: 'Kinesiology session item',
        quantity: 1,
        unitPrice: usd(100),
        source,
      });

      sale.finalize(clock);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(sale.source).toBe(source);
    });
  });

  describe('3. Immutability and Reassignment Prohibition (ADR-0121 §4.9 & §4.10)', () => {
    it('prohibits changeSource on a DRAFT sale under ADR-0121 immutability law', () => {
      const initialSource = SaleSource.create(SaleSourceType.FOOD, 'meal_001');
      const alternateSource = SaleSource.create(SaleSourceType.FOOD, 'meal_002');
      const sale = createDraftSale(initialSource);

      expect(() => sale.changeSource(alternateSource)).toThrow(InvalidSaleStateException);
      try {
        sale.changeSource(alternateSource);
      } catch (err) {
        expect((err as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
      }

      // Proves source remains unchanged
      expect(sale.source).toBe(initialSource);
    });

    it('prohibits assignSource on an already assigned Sale', () => {
      const sale = createDraftSale();
      const anotherSource = SaleSource.create(SaleSourceType.DRINK, 'drink_001');

      expect(() => sale.assignSource(anotherSource)).toThrow(InvalidSaleStateException);
      try {
        sale.assignSource(anotherSource);
      } catch (err) {
        expect((err as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
      }
    });

    it('prohibits source changes on a CANCELLED sale', () => {
      const sale = createDraftSale();
      sale.cancel('Customer changed mind', clock);
      expect(sale.status).toBe(SaleStatus.CANCELLED);

      const newSource = SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'gym_sub_99');
      expect(() => sale.changeSource(newSource)).toThrow(InvalidSaleStateException);
      try {
        sale.changeSource(newSource);
      } catch (err) {
        expect((err as InvalidSaleStateException).code).toBe('CANNOT_MODIFY_CANCELLED_SALE');
      }

      expect(() => sale.assignSource(newSource)).toThrow(InvalidSaleStateException);
      try {
        sale.assignSource(newSource);
      } catch (err) {
        expect((err as InvalidSaleStateException).code).toBe('CANNOT_MODIFY_CANCELLED_SALE');
      }
    });

    it('prohibits source changes on a PAID / finalized sale', () => {
      const source = SaleSource.create(SaleSourceType.FOOD, 'food_dish_1');
      const sale = createDraftSale(source);
      sale.addItem({
        description: 'Healthy Lunch',
        quantity: 1,
        unitPrice: usd(25),
        source,
      });
      sale.finalize(clock);
      sale.markPaid(clock);
      expect(sale.status).toBe(SaleStatus.PAID);

      const newSource = SaleSource.create(SaleSourceType.DRINK, 'drink_alt_2');
      expect(() => sale.changeSource(newSource)).toThrow(SaleAlreadyFinalizedException);
      expect(() => sale.assignSource(newSource)).toThrow(SaleAlreadyFinalizedException);
    });

    it('proves no arbitrary property mutation is permitted (sale.sourceReference is read-only)', () => {
      const sale = createDraftSale();
      expect(() => {
        (sale as unknown as { sourceReference: unknown }).sourceReference = SaleSource.create(
          SaleSourceType.FOOD,
          'tampered',
        );
      }).toThrow();

      expect(() => {
        (sale as unknown as { source: unknown }).source = SaleSource.create(
          SaleSourceType.FOOD,
          'tampered',
        );
      }).toThrow();
    });
  });

  describe('4. Sale Identity vs SaleSource Origin Separation', () => {
    it('proves Sale identity remains strictly SaleId (equals checks ID, not source)', () => {
      const commonSource = SaleSource.create(SaleSourceType.FOOD, 'shared_order_ref');
      const sale1 = Sale.create(
        {
          id: SaleId.create('a0000000-0000-0000-0000-000000000001'),
          tenantId: validTenantId,
          currency: 'USD',
          source: commonSource,
        },
        clock,
      );

      const sale2 = Sale.create(
        {
          id: SaleId.create('b0000000-0000-0000-0000-000000000002'),
          tenantId: validTenantId,
          currency: 'USD',
          source: commonSource,
        },
        clock,
      );

      // Both sales have the same source origin, but represent distinct commercial entities
      expect((sale1.source as SaleSource).equals(sale2.source as SaleSource)).toBe(true);
      expect(sale1.equals(sale2)).toBe(false);
      expect(sale1.id.equals(sale2.id)).toBe(false);
    });

    it('proves identical SaleId indicates identical Sale even if compared across instances', () => {
      const saleId = SaleId.create('c0000000-0000-0000-0000-000000000003');
      const source = SaleSource.create(SaleSourceType.ROOM_RENTAL, 'room_101');

      const sale1 = Sale.create(
        {
          id: saleId,
          tenantId: validTenantId,
          currency: 'USD',
          source,
        },
        clock,
      );

      expect(sale1.equals(sale1)).toBe(true);
      expect(sale1.equals(null)).toBe(false);
      expect(sale1.equals(undefined)).toBe(false);
    });
  });

  describe('5. Line Item Integration with SaleSource', () => {
    it('attaches SaleItem using SaleSource and preserves source across cart operations', () => {
      const saleSource = SaleSource.create(SaleSourceType.ROOM_RENTAL, 'room_studio_a');
      const itemSource = SaleSource.create(SaleSourceType.ROOM_RENTAL, 'room_studio_a');
      const sale = createDraftSale(saleSource);

      const item = sale.addItem({
        description: 'Studio A Hourly Rental',
        quantity: 2,
        unitPrice: usd(50),
        source: itemSource,
      });

      expect(item.source).toBe(itemSource);
      expect(item.sourceReference).toBe(itemSource);
      expect(sale.items).toHaveLength(1);
      expect(sale.subtotal.amount).toBe(100);
      expect(sale.total.amount).toBe(100);

      // Financial invariants remain intact
      expect(sale.total.currency).toBe('USD');
      expect(sale.total.isZero()).toBe(false);
    });
  });

  describe('6. Reconstitution from Persistence with SaleSource', () => {
    it('reconstitutes Sale aggregate with SaleSource', () => {
      const source = SaleSource.create(SaleSourceType.GYM_MEMBERSHIP, 'mem_plan_platinum');
      const saleId = SaleId.create();
      const item = SaleItem.create({
        description: 'Platinum Membership 1 Month',
        quantity: 1,
        unitPrice: usd(150),
        source,
      });

      const reconstituted = Sale.reconstitute({
        id: saleId,
        tenantId: validTenantId,
        clientId: validClientId,
        status: SaleStatus.DRAFT,
        currency: 'USD',
        source,
        items: [item],
        subtotal: usd(150),
        discountTotal: usd(0),
        total: usd(150),
        version: 1,
        createdAt: new Date('2026-09-29T08:00:00Z'),
        updatedAt: new Date('2026-09-29T08:00:00Z'),
      });

      expect(reconstituted.id.equals(saleId)).toBe(true);
      expect(reconstituted.source).toBe(source);
      expect(reconstituted.sourceReference).toBe(source);
      expect(reconstituted.total.amount).toBe(150);
    });

    it('rejects reconstitution if source is omitted or invalid', () => {
      const saleId = SaleId.create();
      expect(() =>
        Sale.reconstitute({
          id: saleId,
          tenantId: validTenantId,
          status: SaleStatus.DRAFT,
          currency: 'USD',
          items: [],
          subtotal: usd(0),
          discountTotal: usd(0),
          total: usd(0),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as ReconstituteSaleProps),
      ).toThrow(InvalidSaleStateException);
    });
  });
});
