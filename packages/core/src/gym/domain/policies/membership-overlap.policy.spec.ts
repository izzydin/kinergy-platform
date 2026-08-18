import { MembershipOverlapPolicy } from './membership-overlap.policy';
import { Membership } from '../membership/membership.aggregate';
import { MembershipId } from '../membership/membership-id.vo';
import { MembershipPeriod } from '../membership/membership-period.vo';
import { MembershipStatus } from '../membership/membership-status.enum';
import { FreezeWindow } from '../membership/freeze-window.vo';
import { OverlappingMembershipException } from '../exceptions/overlapping-membership.exception';

describe('MembershipOverlapPolicy (Phase 5.3-E)', () => {
  const policy = new MembershipOverlapPolicy();
  const clientId = 'client_overlap_test';
  const baseTime = new Date('2026-06-01T00:00:00.000Z');

  function createMembership(
    idStr: string,
    status: MembershipStatus,
    startStr: string,
    endStr: string,
  ): Membership {
    return Membership.reconstitute({
      id: MembershipId.create(idStr),
      version: 1,
      status,
      clientId,
      planId: 'plan_std_30d',
      period: MembershipPeriod.create(new Date(startStr), new Date(endStr)),
      freezeHistory:
        status === MembershipStatus.FROZEN
          ? [
              FreezeWindow.create(
                new Date(startStr),
                new Date(new Date(startStr).getTime() + 5 * 24 * 60 * 60 * 1000),
                'Temporary freeze',
              ),
            ]
          : [],
      createdAt: baseTime,
      updatedAt: baseTime,
    });
  }

  describe('1. Valid Non-Overlapping Scenarios', () => {
    it('should permit creation when client has zero existing memberships', () => {
      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap([], candidatePeriod);
      expect(result.hasOverlap).toBe(false);
      expect(() => policy.assertNoOverlap(clientId, [], candidatePeriod)).not.toThrow();
    });

    it('should permit creation when prior memberships are EXPIRED, CANCELLED, or TERMINATED', () => {
      const existing = [
        createMembership(
          'mem_exp',
          MembershipStatus.EXPIRED,
          '2026-04-01T00:00:00.000Z',
          '2026-05-01T00:00:00.000Z',
        ),
        createMembership(
          'mem_can',
          MembershipStatus.CANCELLED,
          '2026-05-01T00:00:00.000Z',
          '2026-06-01T00:00:00.000Z',
        ),
        createMembership(
          'mem_term',
          MembershipStatus.TERMINATED,
          '2026-05-15T00:00:00.000Z',
          '2026-06-15T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-05-20T00:00:00.000Z'),
        new Date('2026-06-20T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(false);
      expect(() => policy.assertNoOverlap(clientId, existing, candidatePeriod)).not.toThrow();
    });

    it('should permit adjacent consecutive periods (pre-scheduled renewal starting at current endDate)', () => {
      const existing = [
        createMembership(
          'mem_active_june',
          MembershipStatus.ACTIVE,
          '2026-06-01T00:00:00.000Z',
          '2026-07-01T00:00:00.000Z',
        ),
      ];

      // Next period starts exactly on or after current end date
      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(false);
      expect(() => policy.assertNoOverlap(clientId, existing, candidatePeriod)).not.toThrow();
    });
  });

  describe('2. Forbidden Overlap Violations', () => {
    it('should detect overlap when candidate period partially overlaps an ACTIVE membership', () => {
      const existing = [
        createMembership(
          'mem_active',
          MembershipStatus.ACTIVE,
          '2026-06-01T00:00:00.000Z',
          '2026-07-01T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-06-15T00:00:00.000Z'),
        new Date('2026-07-15T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingMembership?.id.value).toBe('mem_active');
      expect(result.reason).toContain('overlaps with existing ACTIVE membership');

      expect(() => policy.assertNoOverlap(clientId, existing, candidatePeriod)).toThrow(
        OverlappingMembershipException,
      );
    });

    it('should detect overlap when candidate period is identical duplicate of an ACTIVE membership', () => {
      const existing = [
        createMembership(
          'mem_active',
          MembershipStatus.ACTIVE,
          '2026-06-01T00:00:00.000Z',
          '2026-07-01T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingMembership?.id.value).toBe('mem_active');
    });

    it('should detect overlap when candidate period overlaps a FROZEN membership', () => {
      const existing = [
        createMembership(
          'mem_frozen',
          MembershipStatus.FROZEN,
          '2026-06-01T00:00:00.000Z',
          '2026-07-10T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-07-05T00:00:00.000Z'),
        new Date('2026-08-05T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingMembership?.id.value).toBe('mem_frozen');
    });

    it('should detect overlap when candidate period overlaps a PENDING future membership', () => {
      const existing = [
        createMembership(
          'mem_pending',
          MembershipStatus.PENDING,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-08-15T00:00:00.000Z'),
        new Date('2026-09-15T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod);
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingMembership?.id.value).toBe('mem_pending');
    });

    it('should respect excludeMembershipId parameter to allow self updates without self-collision', () => {
      const existing = [
        createMembership(
          'mem_self',
          MembershipStatus.ACTIVE,
          '2026-06-01T00:00:00.000Z',
          '2026-07-01T00:00:00.000Z',
        ),
      ];

      const candidatePeriod = MembershipPeriod.create(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const result = policy.evaluateOverlap(existing, candidatePeriod, 'mem_self');
      expect(result.hasOverlap).toBe(false);
    });
  });
});
