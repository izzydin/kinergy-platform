import { GetMembershipOperationalSummaryHandler } from './get-membership-operational-summary.handler';
import { GetMembershipOperationalSummaryQuery } from './get-membership-operational-summary.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';

describe('GetMembershipOperationalSummaryHandler (Phase 5.4-F)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let handler: GetMembershipOperationalSummaryHandler;

  const planId = 'plan_monthly';

  const createMembership = (
    id: string,
    clientId: string,
    status: MembershipStatus,
    startDate: Date,
    endDate: Date,
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(startDate, endDate),
      status,
      freezeHistory: [],
      version: 1,
      createdAt: startDate,
      updatedAt: startDate,
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

    handler = new GetMembershipOperationalSummaryHandler(membershipRepository, clock);
  });

  describe('1. Operational Dashboard Metrics Aggregation', () => {
    it('should accurately aggregate active, expiring soon, expired, frozen, and pending memberships', async () => {
      // 1. Active not expiring soon (ends Sept 30)
      const activeLong = createMembership(
        'mem_1',
        'c1',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      );

      // 2. Active expiring soon (ends Aug 22, in 4 days)
      const activeExpSoon = createMembership(
        'mem_2',
        'c2',
        MembershipStatus.ACTIVE,
        new Date('2026-07-22T00:00:00.000Z'),
        new Date('2026-08-22T00:00:00.000Z'),
      );

      // 3. Frozen expiring soon (ends Aug 24, in 6 days)
      const frozenExpSoon = createMembership(
        'mem_3',
        'c3',
        MembershipStatus.FROZEN,
        new Date('2026-07-24T00:00:00.000Z'),
        new Date('2026-08-24T00:00:00.000Z'),
      );

      // 4. Frozen long term (ends Nov 01)
      const frozenLong = createMembership(
        'mem_4',
        'c4',
        MembershipStatus.FROZEN,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-11-01T00:00:00.000Z'),
      );

      // 5. Explicitly Expired
      const expiredPersisted = createMembership(
        'mem_5',
        'c5',
        MembershipStatus.EXPIRED,
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      // 6. Pending
      const pending = createMembership(
        'mem_6',
        'c6',
        MembershipStatus.PENDING,
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      membershipRepository.findAll.mockResolvedValue([
        activeLong,
        activeExpSoon,
        frozenExpSoon,
        frozenLong,
        expiredPersisted,
        pending,
      ]);

      const query = new GetMembershipOperationalSummaryQuery();
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const summary = result.getValue();

      expect(summary.totalMemberships).toBe(6);
      expect(summary.totalActive).toBe(2);
      expect(summary.expiringSoonCount).toBe(2); // activeExpSoon + frozenExpSoon
      expect(summary.frozenCount).toBe(2);
      expect(summary.expiredCount).toBe(1);
      expect(summary.pendingCount).toBe(1);
      expect(summary.horizonDays).toBe(7);
      expect(summary.asOfDate).toBe(baseTime.toISOString());
    });

    it('should reject invalid asOfDate input', async () => {
      const query = new GetMembershipOperationalSummaryQuery({
        asOfDate: 'not-valid',
      });

      const result = await handler.execute(query);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain("Invalid asOfDate 'not-valid'");
    });
  });
});
