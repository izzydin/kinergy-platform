import { MembershipPlan } from './membership-plan.aggregate';
import { PlanId } from './plan-id.vo';
import { PlanCode } from './plan-code.vo';
import { PlanDuration } from './plan-duration.vo';
import { PlanPrice } from './plan-price.vo';
import { VisitQuota } from './visit-quota.vo';
import { PlanStatus } from './plan-status.enum';
import { InvalidPlanTransitionException } from '../exceptions/invalid-plan-transition.exception';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';

describe('MembershipPlan Aggregate Specification (Phase 5.3-B)', () => {
  const defaultTestDate = new Date('2026-06-01T10:00:00.000Z');

  describe('1. Plan Creation & Factory Invariants', () => {
    it('should create a valid MembershipPlan in DRAFT status by default', () => {
      const planId = PlanId.create('plan_custom_init');
      const planCode = PlanCode.create('MONTHLY_STD');
      const plan = MembershipPlan.create(
        {
          id: planId,
          code: planCode,
          name: 'Standard Monthly Plan',
          description: 'Full gym floor access for 30 days',
          duration: 30,
          price: { amount: 50.0, currency: 'USD' },
          visitQuota: 20,
        },
        defaultTestDate,
      );

      expect(plan.id.equals(planId)).toBe(true);
      expect(plan.code.equals(planCode)).toBe(true);
      expect(plan.name).toBe('Standard Monthly Plan');
      expect(plan.description).toBe('Full gym floor access for 30 days');
      expect(plan.duration.durationInDays).toBe(30);
      expect(plan.price.amount).toBe(50.0);
      expect(plan.price.currency).toBe('USD');
      expect(plan.visitQuota?.maxVisits).toBe(20);
      expect(plan.status).toBe(PlanStatus.DRAFT);
      expect(plan.version).toBe(1);
      expect(plan.isAvailableForPurchase()).toBe(false);
      expect(plan.createdAt.toISOString()).toBe(defaultTestDate.toISOString());
      expect(plan.updatedAt.toISOString()).toBe(defaultTestDate.toISOString());
    });

    it('should reject creation with empty or whitespace-only name', () => {
      expect(() =>
        MembershipPlan.create({
          code: 'VALID_CODE',
          name: '   ',
          duration: 30,
          price: { amount: 50.0 },
        }),
      ).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should reject creation with name exceeding 100 characters', () => {
      expect(() =>
        MembershipPlan.create({
          code: 'VALID_CODE',
          name: 'A'.repeat(101),
          duration: 30,
          price: { amount: 50.0 },
        }),
      ).toThrow(MembershipPlanInvariantViolationException);
    });

    it('should trim and normalize name and description', () => {
      const plan = MembershipPlan.create({
        code: 'PROMO_PLAN',
        name: '  Special Promotion  ',
        description: '   Valid during summer only.   ',
        duration: 14,
        price: { amount: 25.0 },
      });

      expect(plan.name).toBe('Special Promotion');
      expect(plan.description).toBe('Valid during summer only.');
    });

    it('should reconstitute a MembershipPlan from persistence accurately', () => {
      const plan = MembershipPlan.reconstitute({
        id: 'plan_custom_99',
        code: 'VIP_ANNUAL',
        name: 'Annual VIP Membership',
        description: 'Unlimited access + trainer perks',
        duration: 365,
        price: { amount: 499.0, currency: 'USD' },
        visitQuota: null,
        status: PlanStatus.ACTIVE,
        version: 5,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(plan.id.value).toBe('plan_custom_99');
      expect(plan.code.value).toBe('VIP_ANNUAL');
      expect(plan.status).toBe(PlanStatus.ACTIVE);
      expect(plan.version).toBe(5);
      expect(plan.isAvailableForPurchase()).toBe(true);
      expect(plan.visitQuota).toBeUndefined();
    });
  });

  describe('2. Catalog Publishing & Archiving Lifecycle', () => {
    it('should transition DRAFT to ACTIVE when published', () => {
      const plan = MembershipPlan.create({
        code: 'MONTHLY_STD',
        name: 'Standard Monthly',
        duration: 30,
        price: { amount: 50.0 },
      });

      expect(plan.status).toBe(PlanStatus.DRAFT);
      expect(plan.isAvailableForPurchase()).toBe(false);

      const publishDate = new Date('2026-06-02T12:00:00.000Z');
      plan.publish(publishDate);

      expect(plan.status).toBe(PlanStatus.ACTIVE);
      expect(plan.isAvailableForPurchase()).toBe(true);
      expect(plan.version).toBe(2);
      expect(plan.updatedAt.toISOString()).toBe(publishDate.toISOString());
    });

    it('should be idempotent when publishing an already ACTIVE plan', () => {
      const plan = MembershipPlan.create({
        code: 'MONTHLY_STD',
        name: 'Standard Monthly',
        duration: 30,
        price: { amount: 50.0 },
        status: PlanStatus.ACTIVE,
      });

      plan.publish();
      expect(plan.status).toBe(PlanStatus.ACTIVE);
      expect(plan.version).toBe(1); // No version bump on idempotent call
    });

    it('should forbid publishing an ARCHIVED plan', () => {
      const plan = MembershipPlan.reconstitute({
        id: 'plan_archived_1',
        code: 'OLD_TIER',
        name: 'Legacy Tier',
        duration: 30,
        price: { amount: 20.0, currency: 'USD' },
        status: PlanStatus.ARCHIVED,
        version: 3,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });

      expect(() => plan.publish()).toThrow(InvalidPlanTransitionException);
    });

    it('should transition ACTIVE or DRAFT to ARCHIVED', () => {
      const plan = MembershipPlan.create({
        code: 'MONTHLY_STD',
        name: 'Standard Monthly',
        duration: 30,
        price: { amount: 50.0 },
      });

      plan.publish();
      expect(plan.status).toBe(PlanStatus.ACTIVE);

      const archiveDate = new Date('2026-07-01T00:00:00.000Z');
      plan.archive(archiveDate);

      expect(plan.status).toBe(PlanStatus.ARCHIVED);
      expect(plan.isAvailableForPurchase()).toBe(false);
      expect(plan.version).toBe(3);
      expect(plan.updatedAt.toISOString()).toBe(archiveDate.toISOString());
    });

    it('should be idempotent when archiving an already ARCHIVED plan', () => {
      const plan = MembershipPlan.reconstitute({
        id: 'plan_archived_1',
        code: 'OLD_TIER',
        name: 'Legacy Tier',
        duration: 30,
        price: { amount: 20.0, currency: 'USD' },
        status: PlanStatus.ARCHIVED,
        version: 3,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });

      plan.archive();
      expect(plan.status).toBe(PlanStatus.ARCHIVED);
      expect(plan.version).toBe(3);
    });
  });

  describe('3. Commercial Pricing Updates', () => {
    it('should update pricing on DRAFT and ACTIVE plans and increment version', () => {
      const plan = MembershipPlan.create({
        code: 'MONTHLY_STD',
        name: 'Standard Monthly',
        duration: 30,
        price: { amount: 50.0, currency: 'USD' },
      });

      const newPrice = PlanPrice.create(55.0, 'USD');
      plan.updatePricing(newPrice);

      expect(plan.price.amount).toBe(55.0);
      expect(plan.version).toBe(2);

      plan.publish();
      expect(plan.status).toBe(PlanStatus.ACTIVE);

      const activeNewPrice = PlanPrice.create(60.0, 'USD');
      plan.updatePricing(activeNewPrice);

      expect(plan.price.amount).toBe(60.0);
      expect(plan.version).toBe(4);
    });

    it('should be a no-op if updating pricing with the exact same amount and currency', () => {
      const plan = MembershipPlan.create({
        code: 'MONTHLY_STD',
        name: 'Standard Monthly',
        duration: 30,
        price: { amount: 50.0, currency: 'USD' },
      });

      plan.updatePricing(PlanPrice.create(50.0, 'USD'));
      expect(plan.version).toBe(1);
    });

    it('should reject pricing updates on ARCHIVED plans', () => {
      const plan = MembershipPlan.reconstitute({
        id: 'plan_1',
        code: 'ARCHIVED_PLAN',
        name: 'Archived Plan',
        duration: 30,
        price: { amount: 50.0, currency: 'USD' },
        status: PlanStatus.ARCHIVED,
        version: 1,
        createdAt: defaultTestDate,
        updatedAt: defaultTestDate,
      });

      expect(() => plan.updatePricing(PlanPrice.create(55.0, 'USD'))).toThrow(
        MembershipPlanInvariantViolationException,
      );
    });
  });

  describe('4. Duration Mutation Constraints', () => {
    it('should permit changing duration when in DRAFT state', () => {
      const plan = MembershipPlan.create({
        code: 'CUSTOM_PLAN',
        name: 'Custom Trial',
        duration: 14,
        price: { amount: 15.0 },
      });

      plan.updateDuration(PlanDuration.ofDays(21));
      expect(plan.duration.durationInDays).toBe(21);
      expect(plan.version).toBe(2);
    });

    it('should strictly prohibit changing duration once plan is ACTIVE or ARCHIVED', () => {
      const plan = MembershipPlan.create({
        code: 'LOCKED_PLAN',
        name: 'Locked Plan',
        duration: 30,
        price: { amount: 50.0 },
      });

      plan.publish();
      expect(plan.status).toBe(PlanStatus.ACTIVE);

      expect(() => plan.updateDuration(PlanDuration.ofDays(60))).toThrow(
        MembershipPlanInvariantViolationException,
      );

      plan.archive();
      expect(() => plan.updateDuration(PlanDuration.ofDays(60))).toThrow(
        MembershipPlanInvariantViolationException,
      );
    });
  });

  describe('5. Details & Quota Updates', () => {
    it('should update name, description, and visitQuota', () => {
      const plan = MembershipPlan.create({
        code: 'TIER_1',
        name: 'Basic Tier',
        duration: 30,
        price: { amount: 40.0 },
      });

      plan.updateDetails({
        name: 'Tier 1 Standard',
        description: 'New expanded description',
      });

      expect(plan.name).toBe('Tier 1 Standard');
      expect(plan.description).toBe('New expanded description');
      expect(plan.version).toBe(2);

      plan.updateVisitQuota(VisitQuota.of(15));
      expect(plan.visitQuota?.maxVisits).toBe(15);
      expect(plan.version).toBe(3);

      plan.updateVisitQuota(null);
      expect(plan.visitQuota).toBeUndefined();
      expect(plan.version).toBe(4);
    });

    it('should reject updating details on ARCHIVED plans', () => {
      const plan = MembershipPlan.reconstitute({
        id: 'plan_1',
        code: 'ARCHIVED_PLAN',
        name: 'Archived Plan',
        duration: 30,
        price: { amount: 50.0, currency: 'USD' },
        status: PlanStatus.ARCHIVED,
        version: 1,
        createdAt: defaultTestDate,
        updatedAt: defaultTestDate,
      });

      expect(() => plan.updateDetails({ name: 'New Name' })).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => plan.updateVisitQuota(VisitQuota.of(10))).toThrow(
        MembershipPlanInvariantViolationException,
      );
    });
  });

  describe('6. Defensive Copy Encapsulation', () => {
    it('should prevent mutating internal Date instances externally', () => {
      const plan = MembershipPlan.create({
        code: 'SAFE_PLAN',
        name: 'Safe Plan',
        duration: 30,
        price: { amount: 50.0 },
      });

      const created = plan.createdAt;
      created.setFullYear(2000);

      expect(plan.createdAt.getFullYear()).not.toBe(2000);
    });
  });
});
