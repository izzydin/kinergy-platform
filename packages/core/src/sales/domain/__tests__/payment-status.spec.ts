import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PAYMENT_STATUS_METADATA,
  isValidPaymentStatus,
  assertValidPaymentStatus,
  parsePaymentStatus,
  arePaymentStatusesEqual,
  getPaymentStatusMetadata,
  isTerminalPaymentStatus,
  isPendingPaymentStatus,
  isCompletedPaymentStatus,
  isFailedPaymentStatus,
  isCancelledPaymentStatus,
  ALLOWED_PAYMENT_TRANSITIONS,
  canTransitionPaymentStatus,
  getAllowedPaymentTransitions,
  getProhibitedPaymentTransitions,
  PAYMENT_TRANSITION_MATRIX,
} from '../enums/payment-status.enum';
import { InvalidPaymentStatusException } from '../exceptions/invalid-payment-status.exception';
import { PrismaPaymentMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-payment.mapper';
import { PaymentStatus as PrismaPaymentStatus } from '@prisma/client';

describe('PaymentStatus Canonical Domain Representation (ADR-0116)', () => {
  // ===========================================================================
  // 1. Supported States & Exact Enum Values
  // ===========================================================================
  describe('1. Supported States Definition', () => {
    it('defines exactly the 4 canonical states approved by ADR-0116', () => {
      expect(SUPPORTED_PAYMENT_STATUSES).toHaveLength(4);
      expect(SUPPORTED_PAYMENT_STATUSES).toEqual([
        PaymentStatus.PENDING,
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
    });

    it('has exact string literals matching ADR specification without aliases', () => {
      expect(PaymentStatus.PENDING).toBe('PENDING');
      expect(PaymentStatus.COMPLETED).toBe('COMPLETED');
      expect(PaymentStatus.FAILED).toBe('FAILED');
      expect(PaymentStatus.CANCELLED).toBe('CANCELLED');
    });

    it('is an immutable, frozen array', () => {
      expect(Object.isFrozen(SUPPORTED_PAYMENT_STATUSES)).toBe(true);
      expect(() => {
        // @ts-expect-error - testing immutability
        SUPPORTED_PAYMENT_STATUSES.push('REFUNDED' as PaymentStatus);
      }).toThrow();
    });

    it('does NOT contain speculative or future states', () => {
      const enumValues = Object.values(PaymentStatus) as string[];
      expect(enumValues).not.toContain('REFUNDED');
      expect(enumValues).not.toContain('EXPIRED');
      expect(enumValues).not.toContain('PARTIALLY_COMPLETED');
      expect(enumValues).not.toContain('REVERSED');
      expect(enumValues).not.toContain('AUTHORIZED');
      expect(enumValues).not.toContain('SETTLED');
    });
  });

  // ===========================================================================
  // 2. Type-Safety & Validation Guards
  // ===========================================================================
  describe('2. Validation & Construction Safety', () => {
    describe('isValidPaymentStatus()', () => {
      it.each([
        [PaymentStatus.PENDING, true],
        [PaymentStatus.COMPLETED, true],
        [PaymentStatus.FAILED, true],
        [PaymentStatus.CANCELLED, true],
        ['PENDING', true],
        ['COMPLETED', true],
        ['FAILED', true],
        ['CANCELLED', true],
        ['pending', false],
        ['completed', false],
        ['SETTLED', false],
        ['REFUNDED', false],
        ['EXPIRED', false],
        ['INVALID', false],
        ['', false],
        [null, false],
        [undefined, false],
        [123, false],
        [{}, false],
        [[], false],
      ])('evaluates isValidPaymentStatus(%p) => %p', (input, expected) => {
        expect(isValidPaymentStatus(input)).toBe(expected);
      });
    });

    describe('assertValidPaymentStatus()', () => {
      it('accepts valid statuses without throwing', () => {
        for (const status of SUPPORTED_PAYMENT_STATUSES) {
          expect(() => assertValidPaymentStatus(status)).not.toThrow();
        }
      });

      it('rejects arbitrary and speculative strings with InvalidPaymentStatusException', () => {
        const invalidValues = [
          'SETTLED',
          'REFUNDED',
          'EXPIRED',
          'PARTIALLY_COMPLETED',
          'REVERSED',
          'AUTHORIZED',
          'FOO_BAR',
          '',
          null,
          undefined,
          42,
        ];

        for (const invalid of invalidValues) {
          expect(() => assertValidPaymentStatus(invalid)).toThrow(InvalidPaymentStatusException);
          try {
            assertValidPaymentStatus(invalid);
          } catch (err) {
            expect(err).toBeInstanceOf(InvalidPaymentStatusException);
            const ex = err as InvalidPaymentStatusException;
            expect(ex.code).toBe('INVALID_PAYMENT_STATUS');
            expect(ex.message).toContain('Invalid payment status:');
          }
        }
      });
    });

    describe('parsePaymentStatus()', () => {
      it('parses valid inputs into deterministic PaymentStatus', () => {
        expect(parsePaymentStatus('PENDING')).toBe(PaymentStatus.PENDING);
        expect(parsePaymentStatus('COMPLETED')).toBe(PaymentStatus.COMPLETED);
        expect(parsePaymentStatus('FAILED')).toBe(PaymentStatus.FAILED);
        expect(parsePaymentStatus('CANCELLED')).toBe(PaymentStatus.CANCELLED);
      });

      it('throws InvalidPaymentStatusException on invalid input', () => {
        expect(() => parsePaymentStatus('unknown')).toThrow(InvalidPaymentStatusException);
      });
    });
  });

  // ===========================================================================
  // 3. State Semantics & Predicates
  // ===========================================================================
  describe('3. State Semantics & Metadata Registry', () => {
    it('defines explicit semantics for every supported state', () => {
      for (const status of SUPPORTED_PAYMENT_STATUSES) {
        const meta = getPaymentStatusMetadata(status);
        expect(meta).toBeDefined();
        expect(meta.status).toBe(status);
        expect(typeof meta.label).toBe('string');
        expect(typeof meta.description).toBe('string');
        expect(meta.description.length).toBeGreaterThan(10);
      }
    });

    it('differentiates terminal vs non-terminal states correctly', () => {
      expect(isTerminalPaymentStatus(PaymentStatus.PENDING)).toBe(false);
      expect(isTerminalPaymentStatus(PaymentStatus.COMPLETED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.FAILED)).toBe(true);
      expect(isTerminalPaymentStatus(PaymentStatus.CANCELLED)).toBe(true);
    });

    it('identifies paidAt timestamp allowance correctly', () => {
      expect(PAYMENT_STATUS_METADATA[PaymentStatus.PENDING].allowsPaidAt).toBe(false);
      expect(PAYMENT_STATUS_METADATA[PaymentStatus.COMPLETED].allowsPaidAt).toBe(true);
      expect(PAYMENT_STATUS_METADATA[PaymentStatus.FAILED].allowsPaidAt).toBe(false);
      expect(PAYMENT_STATUS_METADATA[PaymentStatus.CANCELLED].allowsPaidAt).toBe(false);
    });

    it('provides accurate predicate helpers for each state', () => {
      expect(isPendingPaymentStatus(PaymentStatus.PENDING)).toBe(true);
      expect(isPendingPaymentStatus(PaymentStatus.COMPLETED)).toBe(false);

      expect(isCompletedPaymentStatus(PaymentStatus.COMPLETED)).toBe(true);
      expect(isCompletedPaymentStatus(PaymentStatus.PENDING)).toBe(false);

      expect(isFailedPaymentStatus(PaymentStatus.FAILED)).toBe(true);
      expect(isFailedPaymentStatus(PaymentStatus.CANCELLED)).toBe(false);

      expect(isCancelledPaymentStatus(PaymentStatus.CANCELLED)).toBe(true);
      expect(isCancelledPaymentStatus(PaymentStatus.FAILED)).toBe(false);
    });
  });

  // ===========================================================================
  // 4. Equality & Determinism
  // ===========================================================================
  describe('4. Equality Comparison', () => {
    it('returns true when comparing equal valid statuses', () => {
      expect(arePaymentStatusesEqual(PaymentStatus.PENDING, PaymentStatus.PENDING)).toBe(true);
      expect(arePaymentStatusesEqual(PaymentStatus.COMPLETED, PaymentStatus.COMPLETED)).toBe(true);
      expect(arePaymentStatusesEqual(PaymentStatus.FAILED, PaymentStatus.FAILED)).toBe(true);
      expect(arePaymentStatusesEqual(PaymentStatus.CANCELLED, PaymentStatus.CANCELLED)).toBe(true);
    });

    it('returns false when comparing distinct statuses', () => {
      expect(arePaymentStatusesEqual(PaymentStatus.PENDING, PaymentStatus.COMPLETED)).toBe(false);
      expect(arePaymentStatusesEqual(PaymentStatus.COMPLETED, PaymentStatus.FAILED)).toBe(false);
      expect(arePaymentStatusesEqual(PaymentStatus.FAILED, PaymentStatus.CANCELLED)).toBe(false);
    });

    it('returns false when any operand is invalid or nullish', () => {
      expect(arePaymentStatusesEqual(PaymentStatus.COMPLETED, 'SETTLED')).toBe(false);
      expect(arePaymentStatusesEqual('COMPLETED', null)).toBe(false);
      expect(arePaymentStatusesEqual(undefined, PaymentStatus.FAILED)).toBe(false);
      expect(arePaymentStatusesEqual('INVALID', 'INVALID')).toBe(false);
    });
  });

  // ===========================================================================
  // 5. State Transition Matrix Adherence
  // ===========================================================================
  describe('5. State Transition Rules Conformance (ADR-0116)', () => {
    it('allows only transitions originating from PENDING', () => {
      expect(ALLOWED_PAYMENT_TRANSITIONS[PaymentStatus.PENDING]).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(ALLOWED_PAYMENT_TRANSITIONS[PaymentStatus.COMPLETED]).toEqual([]);
      expect(getAllowedPaymentTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
      ]);
      expect(getAllowedPaymentTransitions(PaymentStatus.COMPLETED)).toEqual([]);
      expect(getAllowedPaymentTransitions(PaymentStatus.FAILED)).toEqual([]);
      expect(getAllowedPaymentTransitions(PaymentStatus.CANCELLED)).toEqual([]);
    });

    it('prohibits self-transition from PENDING to PENDING', () => {
      expect(canTransitionPaymentStatus(PaymentStatus.PENDING, PaymentStatus.PENDING)).toBe(false);
      expect(getProhibitedPaymentTransitions(PaymentStatus.PENDING)).toEqual([
        PaymentStatus.PENDING,
      ]);
    });

    it('strictly prohibits all transitions out of COMPLETED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(canTransitionPaymentStatus(PaymentStatus.COMPLETED, target)).toBe(false);
      }
    });

    it('strictly prohibits all transitions out of FAILED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(canTransitionPaymentStatus(PaymentStatus.FAILED, target)).toBe(false);
      }
    });

    it('strictly prohibits all transitions out of CANCELLED', () => {
      for (const target of SUPPORTED_PAYMENT_STATUSES) {
        expect(canTransitionPaymentStatus(PaymentStatus.CANCELLED, target)).toBe(false);
      }
    });

    it('defines exactly 16 cells in the complete 4x4 matrix', () => {
      expect(PAYMENT_TRANSITION_MATRIX).toHaveLength(16);
      for (const rule of PAYMENT_TRANSITION_MATRIX) {
        expect(canTransitionPaymentStatus(rule.from, rule.to)).toBe(rule.allowed);
      }
    });
  });

  // ===========================================================================
  // 6. Persistence Boundary Mapping & Non-Divergence
  // ===========================================================================
  describe('6. Persistence Boundary Conversion (PrismaPaymentMapper)', () => {
    it('converts domain PaymentStatus to Prisma persistence status without loss', () => {
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.PENDING)).toBe(
        PrismaPaymentStatus.PENDING,
      );
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.COMPLETED)).toBe(
        PrismaPaymentStatus.SETTLED,
      );
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.FAILED)).toBe(
        PrismaPaymentStatus.FAILED,
      );
      expect(PrismaPaymentMapper.toPersistenceStatus(PaymentStatus.CANCELLED)).toBe(
        PrismaPaymentStatus.CANCELLED,
      );
    });

    it('converts Prisma persistence status back to domain PaymentStatus accurately', () => {
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.PENDING)).toBe(
        PaymentStatus.PENDING,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.SETTLED)).toBe(
        PaymentStatus.COMPLETED,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.FAILED)).toBe(
        PaymentStatus.FAILED,
      );
      expect(PrismaPaymentMapper.toDomainStatus(PrismaPaymentStatus.CANCELLED)).toBe(
        PaymentStatus.CANCELLED,
      );
    });

    it('guarantees bidirectional roundtrip consistency across all supported states', () => {
      for (const domainStatus of SUPPORTED_PAYMENT_STATUSES) {
        const persistenceStatus = PrismaPaymentMapper.toPersistenceStatus(domainStatus);
        const reconstitutedDomainStatus = PrismaPaymentMapper.toDomainStatus(persistenceStatus);
        expect(reconstitutedDomainStatus).toBe(domainStatus);
      }
    });

    it('rejects unknown or invalid persistence status strings at the mapper boundary', () => {
      expect(() => PrismaPaymentMapper.toDomainStatus('UNKNOWN_STATUS')).toThrow(
        InvalidPaymentStatusException,
      );
      expect(() => PrismaPaymentMapper.toDomainStatus('')).toThrow(InvalidPaymentStatusException);
    });
  });

  // ===========================================================================
  // 7. Serialization Boundary & JSON Purity
  // ===========================================================================
  describe('7. Serialization & JSON Boundary', () => {
    it('serializes cleanly to JSON string matching domain value', () => {
      for (const status of SUPPORTED_PAYMENT_STATUSES) {
        const json = JSON.stringify({ status });
        const parsed = JSON.parse(json);
        expect(parsed.status).toBe(status);
        expect(isValidPaymentStatus(parsed.status)).toBe(true);
      }
    });
  });
});
