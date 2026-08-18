import { PlanId } from './plan-id.vo';
import { PlanCode } from './plan-code.vo';
import { PlanDuration } from './plan-duration.vo';
import { PlanPrice } from './plan-price.vo';
import { VisitQuota } from './visit-quota.vo';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

describe('MembershipPlan Value Objects Specification (Phase 5.3-B)', () => {
  describe('PlanId Value Object', () => {
    it('should create valid PlanId with custom string or generated identifier', () => {
      const customId = PlanId.create('plan_vip_001');
      expect(customId.value).toBe('plan_vip_001');
      expect(customId.getValue()).toBe('plan_vip_001');
      expect(customId.toString()).toBe('plan_vip_001');

      const generatedId = PlanId.create();
      expect(generatedId.value).toMatch(/^plan_\d+_[a-z0-9]+$/);
    });

    it('should reject empty or whitespace-only PlanId', () => {
      expect(() => PlanId.create('')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanId.create('   ')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanId.create(null as unknown as string)).toThrow(
        MembershipPlanInvariantViolationException,
      );
    });

    it('should verify PlanId structural equality', () => {
      const id1 = PlanId.create('plan_123');
      const id2 = PlanId.create('plan_123');
      const id3 = PlanId.create('plan_456');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
      expect(id1.equals(null as unknown as PlanId)).toBe(false);
    });
  });

  describe('PlanCode Value Object', () => {
    it('should create valid PlanCode and normalize to uppercase', () => {
      const code1 = PlanCode.create('std_monthly');
      expect(code1.value).toBe('STD_MONTHLY');
      expect(code1.toString()).toBe('STD_MONTHLY');

      const code2 = PlanCode.create('VIP_ANNUAL_2026');
      expect(code2.value).toBe('VIP_ANNUAL_2026');
    });

    it('should reject invalid, too short, too long, or non-alphanumeric PlanCode', () => {
      expect(() => PlanCode.create('')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanCode.create('AB')).toThrow(MembershipPlanInvariantViolationException); // < 3 chars
      expect(() => PlanCode.create('A'.repeat(51))).toThrow(
        MembershipPlanInvariantViolationException,
      ); // > 50 chars
      expect(() => PlanCode.create('INVALID CODE!')).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => PlanCode.create('PLAN#123')).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should verify PlanCode structural equality', () => {
      const code1 = PlanCode.create('PROMO_14D');
      const code2 = PlanCode.create('promo_14d');
      const code3 = PlanCode.create('PROMO_30D');

      expect(code1.equals(code2)).toBe(true);
      expect(code1.equals(code3)).toBe(false);
    });
  });

  describe('PlanDuration Value Object', () => {
    it('should create valid duration from integer days', () => {
      const duration = PlanDuration.ofDays(30);
      expect(duration.durationInDays).toBe(30);
      expect(duration.value).toBe(30);
      expect(duration.toString()).toBe('30 days');
    });

    it('should create duration from months assuming standard 30-day billing intervals', () => {
      const monthly = PlanDuration.ofMonths(1);
      expect(monthly.durationInDays).toBe(30);

      const quarterly = PlanDuration.ofMonths(3);
      expect(quarterly.durationInDays).toBe(90);

      const annual = PlanDuration.ofMonths(12);
      expect(annual.durationInDays).toBe(360);
    });

    it('should reject 0, negative, or non-integer durations', () => {
      expect(() => PlanDuration.ofDays(0)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(-10)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(14.5)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofMonths(0)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofMonths(-1)).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should calculate deterministic contract end dates without date drift', () => {
      const duration = PlanDuration.ofDays(30);
      const start = new Date('2026-06-01T00:00:00.000Z');
      const end = duration.calculateEndDate(start);

      expect(end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)).toBe(30);
    });

    it('should verify PlanDuration structural equality', () => {
      const dur1 = PlanDuration.ofDays(30);
      const dur2 = PlanDuration.ofMonths(1);
      const dur3 = PlanDuration.ofDays(60);

      expect(dur1.equals(dur2)).toBe(true);
      expect(dur1.equals(dur3)).toBe(false);
    });
  });

  describe('PlanPrice Value Object', () => {
    it('should create valid PlanPrice with amount and ISO-4217 currency', () => {
      const price = PlanPrice.create(49.99, 'USD');
      expect(price.amount).toBe(49.99);
      expect(price.currency).toBe('USD');
      expect(price.isFree()).toBe(false);
      expect(price.toString()).toBe('49.99 USD');
    });

    it('should support complimentary free plans ($0.00)', () => {
      const freePrice = PlanPrice.free('USD');
      expect(freePrice.amount).toBe(0);
      expect(freePrice.isFree()).toBe(true);
      expect(freePrice.toString()).toBe('0.00 USD');
    });

    it('should reject negative amounts, non-numeric values, or invalid currency codes', () => {
      expect(() => PlanPrice.create(-10, 'USD')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(NaN, 'USD')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(Infinity, 'USD')).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => PlanPrice.create(50, '')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(50, 'US')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(50, 'USDD')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(50, '123')).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should round amount to 2 decimal places to prevent floating-point precision issues', () => {
      const price = PlanPrice.create(49.999, 'USD');
      expect(price.amount).toBe(50.0);

      const price2 = PlanPrice.create(19.994, 'EUR');
      expect(price2.amount).toBe(19.99);
    });

    it('should verify PlanPrice structural equality', () => {
      const price1 = PlanPrice.create(50.0, 'USD');
      const price2 = PlanPrice.create(50.0, 'usd');
      const price3 = PlanPrice.create(50.0, 'EUR');
      const price4 = PlanPrice.create(60.0, 'USD');

      expect(price1.equals(price2)).toBe(true);
      expect(price1.equals(price3)).toBe(false);
      expect(price1.equals(price4)).toBe(false);
    });
  });

  describe('VisitQuota Value Object', () => {
    it('should create valid VisitQuota with positive integer limit', () => {
      const quota = VisitQuota.of(10);
      expect(quota.maxVisits).toBe(10);
      expect(quota.value).toBe(10);
      expect(quota.toString()).toBe('10 visits');
    });

    it('should reject 0, negative, or non-integer visit quotas', () => {
      expect(() => VisitQuota.of(0)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => VisitQuota.of(-5)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => VisitQuota.of(10.5)).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should verify VisitQuota structural equality', () => {
      const q1 = VisitQuota.of(10);
      const q2 = VisitQuota.of(10);
      const q3 = VisitQuota.of(20);

      expect(q1.equals(q2)).toBe(true);
      expect(q1.equals(q3)).toBe(false);
    });
  });
});
