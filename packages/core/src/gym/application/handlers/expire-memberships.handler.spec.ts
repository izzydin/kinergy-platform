import { ExpireMembershipsHandler } from './expire-memberships.handler';
import { ExpireMembershipsCommand } from '../commands/expire-memberships.command';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { GymLoggerPort } from '../ports/gym-logger.port';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';

describe('ExpireMembershipsHandler (Phase 5.4-E)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let logger: jest.Mocked<GymLoggerPort>;
  let handler: ExpireMembershipsHandler;

  const planId = 'plan_monthly_standard';

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
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    handler = new ExpireMembershipsHandler(membershipRepository, clock, eventPublisher, logger);
  });

  describe('1. Batch Expiration Processing', () => {
    it('should successfully transition eligible ACTIVE and FROZEN memberships to EXPIRED', async () => {
      const activePastEnd = createMembership(
        'mem_active_past',
        'client_001',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      const frozenPastEnd = createMembership(
        'mem_frozen_past',
        'client_002',
        MembershipStatus.FROZEN,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      membershipRepository.findExpiringCandidates.mockResolvedValue([activePastEnd, frozenPastEnd]);

      const command = new ExpireMembershipsCommand();
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.processedCount).toBe(2);
      expect(data.expiredCount).toBe(2);
      expect(data.skippedCount).toBe(0);
      expect(data.failedCount).toBe(0);
      expect(data.dryRun).toBe(false);

      // Verify domain transitions
      expect(activePastEnd.status).toBe(MembershipStatus.EXPIRED);
      expect(activePastEnd.version).toBe(2);
      expect(frozenPastEnd.status).toBe(MembershipStatus.EXPIRED);
      expect(frozenPastEnd.version).toBe(2);

      // Verify repository persistence
      expect(membershipRepository.save).toHaveBeenCalledTimes(2);
      expect(membershipRepository.save).toHaveBeenCalledWith(activePastEnd);
      expect(membershipRepository.save).toHaveBeenCalledWith(frozenPastEnd);

      // Verify domain event publication
      expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
      expect(activePastEnd.getUncommittedEvents()).toHaveLength(0);
      expect(frozenPastEnd.getUncommittedEvents()).toHaveLength(0);
    });

    it('should skip memberships whose validity period is still current', async () => {
      // endDate is Aug 31, 2026 (clock is Aug 18, 2026) -> current!
      const currentActive = createMembership(
        'mem_active_current',
        'client_003',
        MembershipStatus.ACTIVE,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );

      membershipRepository.findExpiringCandidates.mockResolvedValue([currentActive]);

      const command = new ExpireMembershipsCommand();
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.processedCount).toBe(1);
      expect(data.expiredCount).toBe(0);
      expect(data.skippedCount).toBe(1);
      expect(data.failedCount).toBe(0);

      // Aggregate remained untouched
      expect(currentActive.status).toBe(MembershipStatus.ACTIVE);
      expect(currentActive.version).toBe(1);
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should skip non-expirable statuses (EXPIRED, CANCELLED, TERMINATED) idempotently', async () => {
      const alreadyExpired = createMembership(
        'mem_already_expired',
        'client_004',
        MembershipStatus.EXPIRED,
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const cancelled = createMembership(
        'mem_cancelled',
        'client_005',
        MembershipStatus.CANCELLED,
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      const terminated = createMembership(
        'mem_terminated',
        'client_006',
        MembershipStatus.TERMINATED,
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      membershipRepository.findExpiringCandidates.mockResolvedValue([
        alreadyExpired,
        cancelled,
        terminated,
      ]);

      const command = new ExpireMembershipsCommand();
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.processedCount).toBe(3);
      expect(data.expiredCount).toBe(0);
      expect(data.skippedCount).toBe(3);
      expect(data.failedCount).toBe(0);

      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('2. Dry Run Simulation', () => {
    it('should simulate expiration evaluation without mutating state, saving, or emitting events', async () => {
      const candidate = createMembership(
        'mem_candidate_1',
        'client_100',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      membershipRepository.findExpiringCandidates.mockResolvedValue([candidate]);

      const command = new ExpireMembershipsCommand({ dryRun: true });
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.dryRun).toBe(true);
      expect(data.processedCount).toBe(1);
      expect(data.expiredCount).toBe(1);
      expect(data.expired[0]?.membershipId).toBe('mem_candidate_1');
      expect(data.expired[0]?.previousStatus).toBe(MembershipStatus.ACTIVE);

      // Aggregate remained unchanged
      expect(candidate.status).toBe(MembershipStatus.ACTIVE);
      expect(candidate.version).toBe(1);
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('3. Fault Isolation & Concurrency Safety', () => {
    it('should isolate item failure and continue processing remaining items in batch', async () => {
      const item1 = createMembership(
        'mem_item_1',
        'client_A',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
      const item2Failing = createMembership(
        'mem_item_2_fail',
        'client_B',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
      const item3 = createMembership(
        'mem_item_3',
        'client_C',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      membershipRepository.findExpiringCandidates.mockResolvedValue([item1, item2Failing, item3]);

      // Mock failure specifically on item2
      membershipRepository.save.mockImplementation(async (m: Membership) => {
        if (m.id.value === 'mem_item_2_fail') {
          throw new Error('Database transaction lock timeout');
        }
      });

      const command = new ExpireMembershipsCommand();
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.processedCount).toBe(3);
      expect(data.expiredCount).toBe(2);
      expect(data.failedCount).toBe(1);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0]?.membershipId).toBe('mem_item_2_fail');
      expect(data.errors[0]?.error).toContain('Database transaction lock timeout');

      // item1 and item3 succeeded
      expect(item1.status).toBe(MembershipStatus.EXPIRED);
      expect(item3.status).toBe(MembershipStatus.EXPIRED);

      // Error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to expire membership 'mem_item_2_fail'"),
        expect.any(String),
        expect.objectContaining({ membershipId: 'mem_item_2_fail' }),
      );
    });

    it('should gracefully handle empty candidate list', async () => {
      membershipRepository.findExpiringCandidates.mockResolvedValue([]);

      const command = new ExpireMembershipsCommand();
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.processedCount).toBe(0);
      expect(data.expiredCount).toBe(0);
      expect(data.skippedCount).toBe(0);
      expect(data.failedCount).toBe(0);
    });
  });

  describe('4. Custom Evaluation Timestamp and Batch Limits', () => {
    it('should respect custom asOfDate and batchSize arguments', async () => {
      const customAsOf = new Date('2026-12-31T23:59:59.000Z');
      const command = new ExpireMembershipsCommand({
        asOfDate: customAsOf,
        batchSize: 100,
      });

      await handler.execute(command);

      expect(membershipRepository.findExpiringCandidates).toHaveBeenCalledWith(customAsOf, 100);
      expect(logger.info).toHaveBeenCalledWith(
        'Starting automatic membership expiration processing',
        expect.objectContaining({
          asOf: customAsOf.toISOString(),
          batchSize: 100,
        }),
      );
    });

    it('should reject invalid asOfDate input', async () => {
      const command = new ExpireMembershipsCommand({
        asOfDate: 'not-a-valid-date',
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain("Invalid asOfDate 'not-a-valid-date'");
    });
  });

  describe('5. Observability and Dependency Optionality', () => {
    it('should operate cleanly when eventPublisher and logger are omitted', async () => {
      const standaloneHandler = new ExpireMembershipsHandler(membershipRepository, clock);

      const pastMembership = createMembership(
        'mem_standalone',
        'client_standalone',
        MembershipStatus.ACTIVE,
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
      membershipRepository.findExpiringCandidates.mockResolvedValue([pastMembership]);

      const command = new ExpireMembershipsCommand();
      const result = await standaloneHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().expiredCount).toBe(1);
      expect(pastMembership.status).toBe(MembershipStatus.EXPIRED);
      expect(membershipRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
