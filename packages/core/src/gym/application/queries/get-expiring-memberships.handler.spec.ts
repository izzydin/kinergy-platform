import { GetExpiringMembershipsHandler } from './get-expiring-memberships.handler';
import { GetExpiringMembershipsQuery } from './get-expiring-memberships.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { FreezeWindow } from '../../domain/membership/freeze-window.vo';

describe('GetExpiringMembershipsHandler (Phase 5.4-F)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let handler: GetExpiringMembershipsHandler;

  const planId = 'plan_standard';

  const createMembership = (
    id: string,
    clientId: string,
    status: MembershipStatus,
    startDate: Date,
    endDate: Date,
    freezes: FreezeWindow[] = [],
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(startDate, endDate),
      status,
      freezeHistory: freezes,
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

    handler = new GetExpiringMembershipsHandler(membershipRepository, clock);
  });

  describe('1. Expiring-Soon Projections & Temporal Indicators', () => {
    it('should correctly project expiring-soon items within the 7-day default horizon', async () => {
      // Clock is 2026-08-18T10:00:00.000Z
      // Item 1: Expires 2026-08-20 (in 2 days) -> Expiring soon
      const expIn2Days = createMembership(
        'mem_exp_2d',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-07-20T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      );

      // Item 2: Expires 2026-08-23 (in 5 days) -> Expiring soon
      const expIn5Days = createMembership(
        'mem_exp_5d',
        'client_002',
        MembershipStatus.ACTIVE,
        new Date('2026-07-23T00:00:00.000Z'),
        new Date('2026-08-23T00:00:00.000Z'),
      );

      // Item 3: Frozen member expiring 2026-08-22 -> Expiring soon & frozen
      const frozenExpSoon = createMembership(
        'mem_frozen_soon',
        'client_003',
        MembershipStatus.FROZEN,
        new Date('2026-07-22T00:00:00.000Z'),
        new Date('2026-08-22T00:00:00.000Z'),
        [
          FreezeWindow.create(
            new Date('2026-08-15T00:00:00.000Z'),
            new Date('2026-08-25T00:00:00.000Z'),
            'Travel',
          ),
        ],
      );

      membershipRepository.findExpiringWithinHorizon.mockResolvedValue([
        expIn5Days,
        expIn2Days,
        frozenExpSoon,
      ]);

      const query = new GetExpiringMembershipsQuery();
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(3);

      // Sorted by daysRemaining ascending
      expect(items[0]?.membershipId).toBe('mem_exp_2d');
      expect(items[0]?.daysRemaining).toBe(2);
      expect(items[0]?.isExpiringSoon).toBe(true);
      expect(items[0]?.isExpired).toBe(false);
      expect(items[0]?.isCurrentlyFrozen).toBe(false);

      expect(items[1]?.membershipId).toBe('mem_frozen_soon');
      expect(items[1]?.daysRemaining).toBe(4);
      expect(items[1]?.isExpiringSoon).toBe(true);
      expect(items[1]?.isCurrentlyFrozen).toBe(true);

      expect(items[2]?.membershipId).toBe('mem_exp_5d');
      expect(items[2]?.daysRemaining).toBe(5);
      expect(items[2]?.isExpiringSoon).toBe(true);
    });

    it('should respect custom horizonDays and custom asOfDate', async () => {
      const customAsOf = new Date('2026-10-01T00:00:00.000Z');
      const query = new GetExpiringMembershipsQuery({
        asOfDate: customAsOf,
        horizonDays: 14,
      });

      await handler.execute(query);

      expect(membershipRepository.findExpiringWithinHorizon).toHaveBeenCalledWith(customAsOf, 14);
    });

    it('should reject invalid asOfDate input', async () => {
      const query = new GetExpiringMembershipsQuery({
        asOfDate: 'invalid-date',
      });

      const result = await handler.execute(query);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain("Invalid asOfDate 'invalid-date'");
    });
  });
});
