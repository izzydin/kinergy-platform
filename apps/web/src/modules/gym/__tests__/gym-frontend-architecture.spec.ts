import { plansQueryKeys } from '../plans/api/plans-query-keys';
import { membershipsQueryKeys } from '../memberships/api/memberships-query-keys';
import { attendanceQueryKeys } from '../attendance/api/attendance-query-keys';
import { trainerDashboardQueryKeys } from '../trainer-dashboard/api/trainer-dashboard-query-keys';
import { createPlanSchema, updatePricingSchema } from '../plans/schemas/plan.schema';
import {
  createMembershipSchema,
  freezeMembershipSchema,
  cancelMembershipSchema,
} from '../memberships/schemas/membership.schema';
import { checkInSchema } from '../attendance/schemas/check-in.schema';
import { moduleRegistry } from '../../../app/routes/module-registry';

// Ensure module registration side-effects run
import '../index';

describe('Phase 5.7-F: Gym Management Frontend Feature Architecture Spec', () => {
  // =========================================================================
  // 1. Module & Route Registration Verification
  // =========================================================================
  describe('1. Module & Route Registration', () => {
    it('registers gym module contract in moduleRegistry', () => {
      const registered = moduleRegistry.getRegisteredModules();
      const gymModule = registered.find((m) => m.id === 'gym');
      expect(gymModule).toBeDefined();
      expect(gymModule?.prefix).toBe('/gym');
      expect(gymModule?.isProtected).toBe(true);
      expect(gymModule?.requiredPermissions).toContain('memberships.read');
    });

    it('registers gym-trainer module contract in moduleRegistry', () => {
      const registered = moduleRegistry.getRegisteredModules();
      const trainerModule = registered.find((m) => m.id === 'gym-trainer');
      expect(trainerModule).toBeDefined();
      expect(trainerModule?.prefix).toBe('/gym/trainer-dashboard');
      expect(trainerModule?.isProtected).toBe(true);
      expect(trainerModule?.requiredPermissions).toContain('clients.read');
    });
  });

  // =========================================================================
  // 2. TanStack Query Key Factory Isolation
  // =========================================================================
  describe('2. Query Key Factories', () => {
    it('builds isolated, hierarchical query keys for plans', () => {
      expect(plansQueryKeys.all).toEqual(['gym', 'plans']);
      expect(plansQueryKeys.lists()).toEqual(['gym', 'plans', 'list']);
      expect(plansQueryKeys.list({ page: 1, limit: 10 })).toEqual([
        'gym',
        'plans',
        'list',
        { page: 1, limit: 10 },
      ]);
      expect(plansQueryKeys.detail('plan_123')).toEqual(['gym', 'plans', 'detail', 'plan_123']);
    });

    it('builds isolated, hierarchical query keys for memberships', () => {
      expect(membershipsQueryKeys.all).toEqual(['gym', 'memberships']);
      expect(membershipsQueryKeys.lists()).toEqual(['gym', 'memberships', 'list']);
      expect(membershipsQueryKeys.detail('mem_123')).toEqual([
        'gym',
        'memberships',
        'detail',
        'mem_123',
      ]);
      expect(membershipsQueryKeys.expiring(14)).toEqual(['gym', 'memberships', 'expiring', 14]);
      expect(membershipsQueryKeys.eligibility('cli_01')).toEqual([
        'gym',
        'memberships',
        'eligibility',
        'cli_01',
        'now',
      ]);
    });

    it('builds isolated, hierarchical query keys for attendance', () => {
      expect(attendanceQueryKeys.all).toEqual(['gym', 'attendance']);
      expect(attendanceQueryKeys.today({ date: '2026-08-22' })).toEqual([
        'gym',
        'attendance',
        'today',
        { date: '2026-08-22' },
      ]);
      expect(attendanceQueryKeys.clientHistory('cli_01')).toEqual([
        'gym',
        'attendance',
        'client',
        'cli_01',
        {},
      ]);
    });

    it('builds isolated, hierarchical query keys for trainer dashboard', () => {
      expect(trainerDashboardQueryKeys.all).toEqual(['gym', 'trainer-dashboard']);
      expect(trainerDashboardQueryKeys.summary({ trainerId: 'usr_t1' })).toEqual([
        'gym',
        'trainer-dashboard',
        'summary',
        { trainerId: 'usr_t1' },
      ]);
    });
  });

  // =========================================================================
  // 3. Form Validation Zod Schemas
  // =========================================================================
  describe('3. Form Validation Schemas', () => {
    it('validates plan creation and pricing update schemas', () => {
      const validPlan = {
        code: 'STD_MONTHLY',
        name: 'Standard Monthly Pass',
        durationInDays: 30,
        priceAmount: 4999,
        priceCurrency: 'USD',
      };
      expect(createPlanSchema.safeParse(validPlan).success).toBe(true);

      const invalidCodePlan = {
        code: 'invalid lowercase',
        name: 'Plan',
        durationInDays: 30,
        priceAmount: 4999,
      };
      expect(createPlanSchema.safeParse(invalidCodePlan).success).toBe(false);

      expect(updatePricingSchema.safeParse({ priceAmount: 5999, currency: 'USD' }).success).toBe(
        true,
      );
      expect(updatePricingSchema.safeParse({ priceAmount: -50, currency: 'USD' }).success).toBe(
        false,
      );
    });

    it('validates membership creation and cancellation schemas', () => {
      expect(
        createMembershipSchema.safeParse({ clientId: 'cli_01', planId: 'plan_01' }).success,
      ).toBe(true);
      expect(createMembershipSchema.safeParse({ clientId: '', planId: '' }).success).toBe(false);

      expect(cancelMembershipSchema.safeParse({ reason: 'Relocated out of state' }).success).toBe(
        true,
      );
      expect(cancelMembershipSchema.safeParse({ reason: 'no' }).success).toBe(false);
    });

    it('validates freeze membership schema with temporal date ordering refinement', () => {
      const validFreeze = {
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-15T00:00:00.000Z',
        reason: 'Injury',
      };
      expect(freezeMembershipSchema.safeParse(validFreeze).success).toBe(true);

      const invertedFreeze = {
        startDate: '2026-09-15T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
        reason: 'Invalid inverted dates',
      };
      const result = freezeMembershipSchema.safeParse(invertedFreeze);
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('strictly after');
      }
    });

    it('validates check-in input schema', () => {
      const validCheckIn = {
        clientId: 'cli_123',
        method: 'QR_CODE',
      };
      expect(checkInSchema.safeParse(validCheckIn).success).toBe(true);

      const missingClient = {
        method: 'RFID',
      };
      expect(checkInSchema.safeParse(missingClient).success).toBe(false);
    });
  });
});
