import { SaleSource, SaleSourceProps } from '../value-objects/sale-source.vo';
import { SaleSourceType, isValidSaleSourceType } from '../enums/sale-source-type.enum';
import { InvalidSaleSourceException } from '../exceptions/invalid-sale-source.exception';
import { SaleDomainException } from '../exceptions/sale-domain.exception';

describe('SaleSource Value Object (ADR-0121)', () => {
  describe('1. Supported Source Types', () => {
    const supportedTypes: { type: SaleSourceType; sampleRefId: string; description: string }[] = [
      {
        type: SaleSourceType.KINESIOLOGY_SESSION,
        sampleRefId: 'session_01j9876543210abcdef',
        description: 'Clinical Kinesiology treatment session',
      },
      {
        type: SaleSourceType.GYM_MEMBERSHIP,
        sampleRefId: 'mem_annual_vip_2026',
        description: 'Gym membership agreement or plan',
      },
      {
        type: SaleSourceType.FOOD,
        sampleRefId: 'kitchen_salad_bowl_042',
        description: 'Food or meal order item',
      },
      {
        type: SaleSourceType.DRINK,
        sampleRefId: 'bar_protein_shake_vanilla',
        description: 'Drink, smoothie, or beverage product',
      },
      {
        type: SaleSourceType.ROOM_RENTAL,
        sampleRefId: 'room_rehab_bay_2',
        description: 'Hourly room or facility space rental',
      },
    ];

    it.each(supportedTypes)(
      'instantiates successfully for $type ($description) via constructor',
      ({ type, sampleRefId }) => {
        const source = new SaleSource(type, sampleRefId);

        expect(source.type).toBe(type);
        expect(source.referenceId).toBe(sampleRefId);
        expect(source.toString()).toBe(`${type}:${sampleRefId}`);
      },
    );

    it.each(supportedTypes)(
      'instantiates successfully for $type via SaleSource.create() with props object',
      ({ type, sampleRefId }) => {
        const source = SaleSource.create({ type, referenceId: sampleRefId });

        expect(source.type).toBe(type);
        expect(source.referenceId).toBe(sampleRefId);
      },
    );

    it.each(supportedTypes)(
      'instantiates successfully for $type via SaleSource.create() with positional arguments',
      ({ type, sampleRefId }) => {
        const source = SaleSource.create(type, sampleRefId);

        expect(source.type).toBe(type);
        expect(source.referenceId).toBe(sampleRefId);
      },
    );

    it.each(supportedTypes)(
      'verifies complete lifecycle properties (construction, reference, serialization, equality, immutability) for $type',
      ({ type, sampleRefId }) => {
        // 1. Valid construction
        const source1 = SaleSource.create(type, sampleRefId);
        const source2 = new SaleSource(type, sampleRefId);

        // 2. Valid reference extraction
        expect(source1.type).toBe(type);
        expect(source1.referenceId).toBe(sampleRefId);
        expect(source1.sourceType).toBe(type);
        expect(source1.sourceId).toBe(sampleRefId);
        expect(source1.sourceCode).toBeNull();

        // 3. Serialization
        expect(source1.getValue()).toEqual({ type, referenceId: sampleRefId });
        expect(source1.toJSON()).toEqual({ type, referenceId: sampleRefId });
        expect(JSON.stringify(source1)).toBe(JSON.stringify({ type, referenceId: sampleRefId }));
        const reconstituted = SaleSource.fromJSON(source1.toJSON());
        expect(reconstituted.type).toBe(type);
        expect(reconstituted.referenceId).toBe(sampleRefId);

        // 4. Deterministic equality
        expect(source1.equals(source2)).toBe(true);
        expect(source2.equals(source1)).toBe(true);
        const diffRef = SaleSource.create(type, 'different_ref_id_999');
        expect(source1.equals(diffRef)).toBe(false);

        // 5. Immutability
        expect(Object.isFrozen(source1)).toBe(true);
        expect(() => {
          (source1 as unknown as Record<string, unknown>)['type'] = 'OTHER';
        }).toThrow();
        expect(() => {
          (source1 as unknown as Record<string, unknown>)['referenceId'] = 'tampered';
        }).toThrow();
      },
    );

    it('confirms isValidSaleSourceType recognizes exactly the five supported enum values', () => {
      expect(isValidSaleSourceType('KINESIOLOGY_SESSION')).toBe(true);
      expect(isValidSaleSourceType('GYM_MEMBERSHIP')).toBe(true);
      expect(isValidSaleSourceType('FOOD')).toBe(true);
      expect(isValidSaleSourceType('DRINK')).toBe(true);
      expect(isValidSaleSourceType('ROOM_RENTAL')).toBe(true);

      expect(isValidSaleSourceType('HOTEL')).toBe(false);
      expect(isValidSaleSourceType('TREATMENT_SESSION')).toBe(false);
      expect(isValidSaleSourceType('')).toBe(false);
      expect(isValidSaleSourceType(null)).toBe(false);
      expect(isValidSaleSourceType(undefined)).toBe(false);
      expect(isValidSaleSourceType(123)).toBe(false);
    });
  });

  describe('2. Source Type Validation & Invalid Construction Guardrails', () => {
    it('rejects unknown or arbitrary string source types', () => {
      expect(() => new SaleSource('UNKNOWN' as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => SaleSource.create('MASSAGE' as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => SaleSource.create('HOTEL_ROOM' as unknown as SaleSourceType, 'ref_123')).toThrow(
        /Invalid or unsupported source type/,
      );
    });

    it('rejects lowercase or malformed casing', () => {
      expect(() => new SaleSource('food' as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
      expect(
        () => new SaleSource('Gym_Membership' as unknown as SaleSourceType, 'ref_123'),
      ).toThrow(InvalidSaleSourceException);
    });

    it('rejects null, undefined, or empty source type', () => {
      expect(() => new SaleSource('' as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(null as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(undefined as unknown as SaleSourceType, 'ref_123')).toThrow(
        InvalidSaleSourceException,
      );
    });

    it('proves exception inherits from base SaleDomainException', () => {
      try {
        new SaleSource('INVALID_TYPE' as unknown as SaleSourceType, 'ref_123');
        fail('Should have thrown InvalidSaleSourceException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidSaleSourceException);
        expect(err).toBeInstanceOf(SaleDomainException);
        expect((err as InvalidSaleSourceException).code).toBe('INVALID_SALE_SOURCE_TYPE');
      }
    });
  });

  describe('3. Reference Identifier Validation & Uninterpreted Generic Contract', () => {
    it('rejects empty or whitespace-only referenceId', () => {
      expect(() => new SaleSource(SaleSourceType.FOOD, '')).toThrow(InvalidSaleSourceException);
      expect(() => new SaleSource(SaleSourceType.FOOD, '   ')).toThrow(InvalidSaleSourceException);
      expect(() => new SaleSource(SaleSourceType.FOOD, '\t\n')).toThrow(InvalidSaleSourceException);
      expect(() => SaleSource.create(SaleSourceType.DRINK, '')).toThrow(
        /Reference ID cannot be empty/,
      );
    });

    it('rejects non-string referenceId values', () => {
      expect(() => new SaleSource(SaleSourceType.FOOD, null as unknown as string)).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(SaleSourceType.FOOD, undefined as unknown as string)).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(SaleSourceType.FOOD, 12345 as unknown as string)).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(SaleSourceType.FOOD, {} as unknown as string)).toThrow(
        InvalidSaleSourceException,
      );
    });

    it('trims leading and trailing whitespace from valid reference identifiers', () => {
      const source = new SaleSource(SaleSourceType.FOOD, '   order_item_445   ');
      expect(source.referenceId).toBe('order_item_445');
    });

    it('rejects referenceId exceeding maximum length constraint (255 chars)', () => {
      const longId = 'a'.repeat(256);
      expect(() => new SaleSource(SaleSourceType.ROOM_RENTAL, longId)).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => new SaleSource(SaleSourceType.ROOM_RENTAL, longId)).toThrow(
        /cannot exceed 255 characters/,
      );

      // Boundary: Exactly 255 chars is valid
      const exact255 = 'a'.repeat(255);
      const validSource = new SaleSource(SaleSourceType.ROOM_RENTAL, exact255);
      expect(validSource.referenceId.length).toBe(255);
    });

    it('rejects control characters in referenceId for security and data sanitization', () => {
      expect(() => new SaleSource(SaleSourceType.FOOD, 'item\0poison')).toThrow(
        /contains invalid control characters/,
      );
      expect(() => new SaleSource(SaleSourceType.FOOD, 'item\x1b[31mescape')).toThrow(
        /contains invalid control characters/,
      );
    });

    it('proves Sales domain does NOT interpret referenceId format (accepts diverse valid identifier formats)', () => {
      const testCases = [
        'e0344d9f-6821-4f80-b74c-473550e58319', // Standard UUID v4
        'session_01j9876543210abcdef', // Prefixed ULID
        'ORD-2026-0929-9941', // Human-readable sequential reference
        'SKU-PROTEIN-1KG', // Barcode / SKU
        '10042', // Numeric string
        'pos_checkout_terminal_01', // Retail register tag
        'room#bay-3/east_wing', // Punctuation / resource path
      ];

      for (const id of testCases) {
        const source = new SaleSource(SaleSourceType.KINESIOLOGY_SESSION, id);
        expect(source.referenceId).toBe(id);
      }
    });
  });

  describe('4. Complete Immutability & State Freezing', () => {
    it('is deeply frozen with Object.freeze upon construction', () => {
      const source = new SaleSource(SaleSourceType.GYM_MEMBERSHIP, 'mem_123');
      expect(Object.isFrozen(source)).toBe(true);
    });

    it('prevents mutation of type or referenceId properties in runtime', () => {
      const source = new SaleSource(SaleSourceType.GYM_MEMBERSHIP, 'mem_123');

      expect(() => {
        (source as unknown as { type: string }).type = SaleSourceType.FOOD;
      }).toThrow();

      expect(() => {
        (source as unknown as { referenceId: string }).referenceId = 'changed_id';
      }).toThrow();

      expect(source.type).toBe(SaleSourceType.GYM_MEMBERSHIP);
      expect(source.referenceId).toBe('mem_123');
    });
  });

  describe('5. Value Object Equality (Deterministic)', () => {
    it('returns true when comparing instances with identical type and referenceId', () => {
      const a = new SaleSource(SaleSourceType.FOOD, 'salad_01');
      const b = SaleSource.create({ type: SaleSourceType.FOOD, referenceId: 'salad_01' });

      expect(a.equals(b)).toBe(true);
      expect(b.equals(a)).toBe(true);
    });

    it('returns false when types differ even if referenceId matches', () => {
      const a = new SaleSource(SaleSourceType.FOOD, 'id_123');
      const b = new SaleSource(SaleSourceType.DRINK, 'id_123');

      expect(a.equals(b)).toBe(false);
    });

    it('returns false when referenceIds differ even if types match', () => {
      const a = new SaleSource(SaleSourceType.ROOM_RENTAL, 'room_1');
      const b = new SaleSource(SaleSourceType.ROOM_RENTAL, 'room_2');

      expect(a.equals(b)).toBe(false);
    });

    it('returns false when comparing against null, undefined, or foreign objects', () => {
      const source = new SaleSource(SaleSourceType.DRINK, 'smoothie_01');

      expect(source.equals(null)).toBe(false);
      expect(source.equals(undefined)).toBe(false);
      expect(source.equals({} as unknown as SaleSource)).toBe(false);
      expect(
        source.equals({
          type: SaleSourceType.DRINK,
          referenceId: 'smoothie_01',
        } as unknown as SaleSource),
      ).toBe(false);
    });
  });

  describe('6. Serialization & Projection Contracts', () => {
    it('exports pure value via getValue() matching SaleSourceProps', () => {
      const source = new SaleSource(SaleSourceType.KINESIOLOGY_SESSION, 'session_889');
      const value: SaleSourceProps = source.getValue();

      expect(value).toEqual({
        type: SaleSourceType.KINESIOLOGY_SESSION,
        referenceId: 'session_889',
      });
    });

    it('serializes cleanly to JSON via toJSON() and JSON.stringify()', () => {
      const source = new SaleSource(SaleSourceType.FOOD, 'snack_protein_bar');
      const json = source.toJSON();

      expect(json).toEqual({
        type: 'FOOD',
        referenceId: 'snack_protein_bar',
      });

      const serializedString = JSON.stringify(source);
      expect(JSON.parse(serializedString)).toEqual({
        type: 'FOOD',
        referenceId: 'snack_protein_bar',
      });
    });

    it('reconstitutes valid instance from JSON via SaleSource.fromJSON()', () => {
      const raw = {
        type: 'DRINK',
        referenceId: 'shake_electrolyte_02',
      };

      const source = SaleSource.fromJSON(raw);
      expect(source).toBeInstanceOf(SaleSource);
      expect(source.type).toBe(SaleSourceType.DRINK);
      expect(source.referenceId).toBe('shake_electrolyte_02');
    });

    it('rejects invalid JSON payloads during deserialization', () => {
      expect(() => SaleSource.fromJSON(null)).toThrow(InvalidSaleSourceException);
      expect(() => SaleSource.fromJSON('not-an-object')).toThrow(InvalidSaleSourceException);
      expect(() => SaleSource.fromJSON({ type: 'UNKNOWN', referenceId: 'ref_1' })).toThrow(
        InvalidSaleSourceException,
      );
      expect(() => SaleSource.fromJSON({ type: 'FOOD', referenceId: '' })).toThrow(
        InvalidSaleSourceException,
      );
    });
  });
});
