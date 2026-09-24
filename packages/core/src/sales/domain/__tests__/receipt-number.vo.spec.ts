import { ReceiptNumber } from '../value-objects/receipt-number.vo';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

describe('ReceiptNumber Value Object', () => {
  describe('create()', () => {
    it('creates a valid ReceiptNumber from a properly formatted string', () => {
      const receiptNumber = ReceiptNumber.create('REC-2026-000001');

      expect(receiptNumber.value).toBe('REC-2026-000001');
      expect(receiptNumber.getValue()).toBe('REC-2026-000001');
      expect(receiptNumber.toString()).toBe('REC-2026-000001');
    });

    it('trims leading and trailing whitespace', () => {
      const receiptNumber = ReceiptNumber.create('   REC-2026-000042   ');
      expect(receiptNumber.value).toBe('REC-2026-000042');
    });

    it('implements value equality correctly', () => {
      const num1 = ReceiptNumber.create('REC-2026-000001');
      const num2 = ReceiptNumber.create('REC-2026-000001');
      const num3 = ReceiptNumber.create('REC-2026-000002');

      expect(num1.equals(num2)).toBe(true);
      expect(num1.equals(num3)).toBe(false);
      expect(num1.equals(null)).toBe(false);
      expect(num1.equals(undefined)).toBe(false);
    });

    it('throws when string is empty or whitespace', () => {
      expect(() => ReceiptNumber.create('')).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.create('   ')).toThrow(ReceiptDomainException);
    });

    it('throws when string contains invalid characters', () => {
      expect(() => ReceiptNumber.create('REC 2026 0001')).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.create('REC@2026#0001')).toThrow(ReceiptDomainException);
    });

    it('throws when string exceeds MAX_LENGTH (50 chars)', () => {
      const tooLong = 'REC-2026-' + '0'.repeat(45);
      expect(() => ReceiptNumber.create(tooLong)).toThrow(ReceiptDomainException);
    });
  });

  describe('fromParts(year, sequence)', () => {
    it('deterministically formats year and sequence with 6-digit zero padding', () => {
      expect(ReceiptNumber.fromParts(2026, 1).value).toBe('REC-2026-000001');
      expect(ReceiptNumber.fromParts(2026, 42).value).toBe('REC-2026-000042');
      expect(ReceiptNumber.fromParts(2026, 999).value).toBe('REC-2026-000999');
      expect(ReceiptNumber.fromParts(2026, 100000).value).toBe('REC-2026-100000');
    });

    it('handles year transitions cleanly', () => {
      expect(ReceiptNumber.fromParts(2025, 1).value).toBe('REC-2025-000001');
      expect(ReceiptNumber.fromParts(2026, 1).value).toBe('REC-2026-000001');
      expect(ReceiptNumber.fromParts(2027, 1).value).toBe('REC-2027-000001');
    });

    it('rejects non-integer or out-of-range calendar year', () => {
      expect(() => ReceiptNumber.fromParts(1999, 1)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(2101, 1)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(2026.5, 1)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(NaN, 1)).toThrow(ReceiptDomainException);
    });

    it('rejects non-positive or non-integer sequence counter', () => {
      expect(() => ReceiptNumber.fromParts(2026, 0)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(2026, -5)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(2026, 1.5)).toThrow(ReceiptDomainException);
      expect(() => ReceiptNumber.fromParts(2026, NaN)).toThrow(ReceiptDomainException);
    });
  });
});
