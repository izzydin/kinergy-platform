import { SourceReference } from '../value-objects/source-reference.vo';
import { SourceType } from '../enums/source-type.enum';
import { SaleDomainException } from '../exceptions/sale-domain.exception';

describe('SourceReference Value Object', () => {
  it('creates a valid SourceReference with all attributes', () => {
    const ref = SourceReference.create({
      sourceType: SourceType.INVENTORY_ITEM,
      sourceId: 'inv_123',
      sourceCode: 'SKU-WHEY-01',
    });

    expect(ref.sourceType).toBe(SourceType.INVENTORY_ITEM);
    expect(ref.sourceId).toBe('inv_123');
    expect(ref.sourceCode).toBe('SKU-WHEY-01');
    expect(ref.toString()).toBe('INVENTORY_ITEM:inv_123 (SKU-WHEY-01)');
  });

  it('creates a valid SourceReference without sourceCode', () => {
    const ref = SourceReference.create({
      sourceType: SourceType.TREATMENT_SESSION,
      sourceId: 'sess_456',
    });

    expect(ref.sourceType).toBe(SourceType.TREATMENT_SESSION);
    expect(ref.sourceId).toBe('sess_456');
    expect(ref.sourceCode).toBeNull();
    expect(ref.toString()).toBe('TREATMENT_SESSION:sess_456');
  });

  it('is immutable and frozen', () => {
    const ref = SourceReference.create({
      sourceType: SourceType.MEMBERSHIP_PLAN,
      sourceId: 'plan_789',
    });

    expect(Object.isFrozen(ref)).toBe(true);
    expect(() => {
      (ref as unknown as { sourceId: string }).sourceId = 'changed';
    }).toThrow();
  });

  it('evaluates value equality correctly', () => {
    const ref1 = SourceReference.create({
      sourceType: SourceType.CUSTOM_SERVICE,
      sourceId: 'srv_1',
      sourceCode: 'ROOM_RENTAL',
    });
    const ref2 = SourceReference.create({
      sourceType: SourceType.CUSTOM_SERVICE,
      sourceId: 'srv_1',
      sourceCode: 'ROOM_RENTAL',
    });
    const ref3 = SourceReference.create({
      sourceType: SourceType.CUSTOM_SERVICE,
      sourceId: 'srv_2',
    });

    expect(ref1.equals(ref2)).toBe(true);
    expect(ref1.equals(ref3)).toBe(false);
    expect(ref1.equals(null)).toBe(false);
    expect(ref1.equals(undefined)).toBe(false);
  });

  it('throws SaleDomainException if sourceId is empty or whitespace', () => {
    expect(() => {
      SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: '   ',
      });
    }).toThrow(SaleDomainException);
  });

  it('throws SaleDomainException if sourceType is invalid', () => {
    expect(() => {
      SourceReference.create({
        sourceType: 'UNKNOWN_TYPE' as SourceType,
        sourceId: 'item_1',
      });
    }).toThrow(SaleDomainException);
  });
});
