import {
  PaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  FUTURE_PAYMENT_METHODS,
  isValidPaymentMethod,
  isFuturePaymentMethod,
  assertValidPaymentMethod,
} from '../enums/payment-method.enum';
import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  isValidPaymentStatus,
  canTransitionPaymentStatus,
  assertValidPaymentStatus,
} from '../enums/payment-status.enum';
import { PaymentReference } from '../value-objects/payment-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';
import { InvalidPaymentMethodException } from '../exceptions/invalid-payment-method.exception';
import { InvalidPaymentStatusException } from '../exceptions/invalid-payment-status.exception';
import { InvalidPaymentReferenceException } from '../exceptions/invalid-payment-reference.exception';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';
import { SaleDomainException } from '../exceptions/sale-domain.exception';

describe('Payment Foundational Domain Types (Milestone 7.5)', () => {
  // ===========================================================================
  // 1. Payment Method Tests
  // ===========================================================================
  describe('1. PaymentMethod', () => {
    it('accepts CASH as a valid, active payment method', () => {
      expect(isValidPaymentMethod('CASH')).toBe(true);
      expect(isValidPaymentMethod(PaymentMethod.CASH)).toBe(true);
      expect(() => assertValidPaymentMethod('CASH')).not.toThrow();
    });

    it('accepts QR as a valid, active payment method', () => {
      expect(isValidPaymentMethod('QR')).toBe(true);
      expect(isValidPaymentMethod(PaymentMethod.QR)).toBe(true);
      expect(() => assertValidPaymentMethod('QR')).not.toThrow();
    });

    it('identifies future payment methods (CARD, TRANSFER, ONLINE) as recognized but inactive', () => {
      expect(FUTURE_PAYMENT_METHODS).toEqual(['CARD', 'TRANSFER', 'ONLINE']);

      for (const futureMethod of ['CARD', 'TRANSFER', 'ONLINE']) {
        expect(isFuturePaymentMethod(futureMethod)).toBe(true);
        expect(isValidPaymentMethod(futureMethod)).toBe(false);

        expect(() => assertValidPaymentMethod(futureMethod)).toThrow(InvalidPaymentMethodException);

        expect(() => assertValidPaymentMethod(futureMethod)).toThrow(
          /planned for a future milestone but is not yet active/i,
        );
      }
    });

    it('rejects arbitrary invalid or unrecognized payment methods', () => {
      const invalidInputs = [
        'BITCOIN',
        'GOLD_BARS',
        'CHEQUE',
        '',
        '   ',
        null,
        undefined,
        123,
        {},
        [],
      ];

      for (const input of invalidInputs) {
        expect(isValidPaymentMethod(input)).toBe(false);
        expect(isFuturePaymentMethod(input)).toBe(false);
        expect(() => assertValidPaymentMethod(input)).toThrow(InvalidPaymentMethodException);
      }
    });

    it('exposes immutable supported payment methods array', () => {
      expect(SUPPORTED_PAYMENT_METHODS).toEqual([PaymentMethod.CASH, PaymentMethod.QR]);
      expect(Object.isFrozen(SUPPORTED_PAYMENT_METHODS)).toBe(true);
      expect(Object.isFrozen(FUTURE_PAYMENT_METHODS)).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Payment Status Tests
  // ===========================================================================
  describe('2. PaymentStatus', () => {
    it('recognizes every approved status (PENDING, SETTLED, FAILED, CANCELLED)', () => {
      const expectedStatuses = [
        PaymentStatus.PENDING,
        PaymentStatus.SETTLED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ];

      expect(SUPPORTED_PAYMENT_STATUSES).toEqual(expectedStatuses);
      expect(Object.isFrozen(SUPPORTED_PAYMENT_STATUSES)).toBe(true);

      for (const status of expectedStatuses) {
        expect(isValidPaymentStatus(status)).toBe(true);
        expect(() => assertValidPaymentStatus(status)).not.toThrow();
      }
    });

    it('rejects unapproved or unrecognized statuses', () => {
      const invalidStatuses = [
        'AUTHORIZED',
        'DRAFT',
        'REFUNDED',
        'PROCESSING',
        '',
        null,
        undefined,
        42,
      ];

      for (const status of invalidStatuses) {
        expect(isValidPaymentStatus(status)).toBe(false);
        expect(() => assertValidPaymentStatus(status)).toThrow(InvalidPaymentStatusException);
      }
    });

    describe('Transition Matrix Invariants', () => {
      it('allows valid transitions from PENDING to SETTLED, FAILED, or CANCELLED', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.SETTLED)).toBe(true);
        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.FAILED)).toBe(true);
        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.CANCELLED)).toBe(
          true,
        );
      });

      it('disallows transition from PENDING to PENDING', () => {
        expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PENDING)).toBe(
          false,
        );
      });

      it('treats SETTLED as a terminal immutable state with zero allowed transitions', () => {
        for (const target of SUPPORTED_PAYMENT_STATUSES) {
          expect(canTransitionPaymentStatus(PaymentStatus.SETTLED, target)).toBe(false);
        }
      });

      it('treats FAILED as a terminal state with zero allowed transitions', () => {
        for (const target of SUPPORTED_PAYMENT_STATUSES) {
          expect(canTransitionPaymentStatus(PaymentStatus.FAILED, target)).toBe(false);
        }
      });

      it('treats CANCELLED as a terminal state with zero allowed transitions', () => {
        for (const target of SUPPORTED_PAYMENT_STATUSES) {
          expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, target)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // 3. Payment Reference Value Object Tests
  // ===========================================================================
  describe('3. PaymentReference Value Object', () => {
    it('creates a valid reference from clean alphanumeric and punctuation inputs', () => {
      const validCases = [
        'DRAWER-1-RCPT-402',
        'QR_TXN_987654321',
        'REG#02/SESSION.123:A',
        'Cash tender counter 4',
        'ORDER-REF-2026.09.19',
      ];

      for (const input of validCases) {
        const ref = PaymentReference.create(input);
        expect(ref.getValue()).toBe(input);
        expect(ref.value).toBe(input);
        expect(ref.toString()).toBe(input);
        expect(PaymentReference.isValid(input)).toBe(true);
      }
    });

    it('supports absent references via factory method returning null', () => {
      expect(PaymentReference.from(null)).toBeNull();
      expect(PaymentReference.from(undefined)).toBeNull();
      expect(PaymentReference.from()).toBeNull();
    });

    it('returns a PaymentReference instance when valid string is provided to from()', () => {
      const ref = PaymentReference.from('RECEIPT-101');
      expect(ref).toBeInstanceOf(PaymentReference);
      expect(ref?.getValue()).toBe('RECEIPT-101');
    });

    it('trims leading and trailing whitespace while preserving safe internal spaces', () => {
      const ref = PaymentReference.create('   DRAWER 1 RECEIPT 402   ');
      expect(ref.getValue()).toBe('DRAWER 1 RECEIPT 402');
    });

    it('rejects empty string or whitespace-only references', () => {
      const emptyInputs = ['', ' ', '   ', '\t', '\n'];

      for (const input of emptyInputs) {
        expect(() => PaymentReference.create(input)).toThrow(InvalidPaymentReferenceException);
        expect(() => PaymentReference.from(input)).toThrow(InvalidPaymentReferenceException);
        expect(PaymentReference.isValid(input)).toBe(false);
      }
    });

    it('rejects references exceeding maximum length of 100 characters', () => {
      const longRef = 'A'.repeat(101);
      expect(() => PaymentReference.create(longRef)).toThrow(InvalidPaymentReferenceException);
      expect(() => PaymentReference.create(longRef)).toThrow(/cannot exceed 100 characters/i);
      expect(PaymentReference.isValid(longRef)).toBe(false);

      // 100 characters is exactly permitted
      const maxRef = 'A'.repeat(100);
      expect(() => PaymentReference.create(maxRef)).not.toThrow();
      expect(PaymentReference.isValid(maxRef)).toBe(true);
    });

    it('rejects references containing prohibited characters (HTML tags, script injection, control chars)', () => {
      const dangerousInputs = [
        '<script>alert(1)</script>',
        'REF" OR 1=1--',
        'REF; DROP TABLE payments;',
        'REF\x00NULL',
        'REF@EMAIL.COM',
        'REF$MONEY',
        'REF*STAR',
      ];

      for (const input of dangerousInputs) {
        expect(() => PaymentReference.create(input)).toThrow(InvalidPaymentReferenceException);
        expect(PaymentReference.isValid(input)).toBe(false);
      }
    });

    it('protects against accidental exposure of sensitive credit card PAN numbers', () => {
      const sensitiveInputs = [
        '4111 1111 1111 1111', // 16 digit Visa
        '4111-1111-1111-1111',
        '4111111111111111',
        '5500 0000 0000 0004', // 16 digit MC
        '378282246310005', // 15 digit AMEX
      ];

      for (const input of sensitiveInputs) {
        expect(() => PaymentReference.create(input)).toThrow(InvalidPaymentReferenceException);
        expect(() => PaymentReference.create(input)).toThrow(
          /must not contain sensitive cardholder data/i,
        );
        expect(PaymentReference.isValid(input)).toBe(false);
      }
    });

    it('implements value object equality correctly', () => {
      const ref1 = PaymentReference.create('REF-ABC-123');
      const ref2 = PaymentReference.create('  REF-ABC-123  ');
      const ref3 = PaymentReference.create('REF-XYZ-999');

      expect(ref1.equals(ref2)).toBe(true);
      expect(ref1.equals(ref3)).toBe(false);
      expect(ref1.equals(null)).toBe(false);
      expect(ref1.equals(undefined)).toBe(false);
    });

    it('is immutable via Object.freeze', () => {
      const ref = PaymentReference.create('IMMUTABLE-REF');
      expect(Object.isFrozen(ref)).toBe(true);
    });
  });

  // ===========================================================================
  // 4. PaymentId Value Object Tests
  // ===========================================================================
  describe('4. PaymentId Value Object', () => {
    it('creates PaymentId with explicit value', () => {
      const id = PaymentId.create('pay_test_123');
      expect(id.getValue()).toBe('pay_test_123');
      expect(id.value).toBe('pay_test_123');
      expect(id.toString()).toBe('pay_test_123');
    });

    it('generates random prefixed PaymentId when omitted', () => {
      const id = PaymentId.create();
      expect(id.getValue()).toMatch(/^pay_\d+_[a-z0-9]+$/);
    });

    it('rejects empty or whitespace-only PaymentId', () => {
      expect(() => PaymentId.create('')).toThrow(PaymentDomainException);
      expect(() => PaymentId.create('   ')).toThrow(PaymentDomainException);
    });

    it('implements value object equality', () => {
      const id1 = PaymentId.create('pay_1');
      const id2 = PaymentId.create('pay_1');
      const id3 = PaymentId.create('pay_2');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
      expect(id1.equals(null)).toBe(false);
    });
  });

  // ===========================================================================
  // 5. Exception Hierarchy Tests
  // ===========================================================================
  describe('5. Exception Hierarchy', () => {
    it('PaymentDomainException inherits from SaleDomainException and Error', () => {
      const ex = new PaymentDomainException('Payment failure', 'PAYMENT_TEST');
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(SaleDomainException);
      expect(ex).toBeInstanceOf(PaymentDomainException);
      expect(ex.code).toBe('PAYMENT_TEST');
      expect(ex.name).toBe('PaymentDomainException');
    });

    it('InvalidPaymentMethodException inherits from PaymentDomainException', () => {
      const ex = new InvalidPaymentMethodException('CARD');
      expect(ex).toBeInstanceOf(PaymentDomainException);
      expect(ex.code).toBe('INVALID_PAYMENT_METHOD');
    });

    it('InvalidPaymentStatusException inherits from PaymentDomainException', () => {
      const ex = new InvalidPaymentStatusException('UNKNOWN');
      expect(ex).toBeInstanceOf(PaymentDomainException);
      expect(ex.code).toBe('INVALID_PAYMENT_STATUS');
    });

    it('InvalidPaymentReferenceException inherits from PaymentDomainException', () => {
      const ex = new InvalidPaymentReferenceException('Bad reference');
      expect(ex).toBeInstanceOf(PaymentDomainException);
      expect(ex.code).toBe('INVALID_PAYMENT_REFERENCE');
    });
  });
});
