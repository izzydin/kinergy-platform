import { FreezeMembershipHandler } from './freeze-membership.handler';
import { UnfreezeMembershipHandler } from './unfreeze-membership.handler';
import { CancelMembershipHandler } from './cancel-membership.handler';
import { FreezeMembershipCommand } from '../commands/freeze-membership.command';
import { UnfreezeMembershipCommand } from '../commands/unfreeze-membership.command';
import { CancelMembershipCommand } from '../commands/cancel-membership.command';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';

describe('Phase 5.7-A: Membership Lifecycle Application Handlers Spec', () => {
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let clock: TestClock;

  const baseTime = new Date('2026-08-22T10:00:00.000Z');

  const createMembership = (status = MembershipStatus.ACTIVE): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create('mem_test_123'),
      clientId: 'client_usr_456',
      planId: 'plan_std_01',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      status,
      trainerAssignment: TrainerAssignment.create(
        'trainer_007',
        new Date('2026-08-01T00:00:00.000Z'),
      ),
      version: 1,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn(),
      findExpiringCandidates: jest.fn(),
      findExpiringWithinHorizon: jest.fn(),
      findByTrainerId: jest.fn(),
      findAll: jest.fn(),
    };

    eventPublisher = {
      publish: jest.fn(),
    };
  });

  describe('1. FreezeMembershipHandler', () => {
    it('freezes an active membership and emits MembershipFrozenEvent', async () => {
      const mem = createMembership(MembershipStatus.ACTIVE);
      membershipRepo.findById.mockResolvedValue(mem);

      const handler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const command = new FreezeMembershipCommand({
        membershipId: 'mem_test_123',
        startDate: new Date('2026-08-23T00:00:00.000Z'),
        endDate: new Date('2026-08-30T00:00:00.000Z'),
        reason: 'Medical recovery',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.FROZEN);
      expect(result.getValue().freezeHistory.length).toBe(1);
      expect(result.getValue().freezeHistory[0]!.reason).toBe('Medical recovery');
      expect(membershipRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('fails when membership is not found', async () => {
      membershipRepo.findById.mockResolvedValue(null);

      const handler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const command = new FreezeMembershipCommand({
        membershipId: 'mem_missing',
        startDate: '2026-08-23',
        endDate: '2026-08-30',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership with ID 'mem_missing' not found.");
    });
  });

  describe('2. UnfreezeMembershipHandler', () => {
    it('unfreezes a frozen membership, extends the end date and emits event', async () => {
      const mem = createMembership(MembershipStatus.ACTIVE);
      membershipRepo.findById.mockResolvedValue(mem);

      const freezeHandler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      await freezeHandler.execute(
        new FreezeMembershipCommand({
          membershipId: 'mem_test_123',
          startDate: new Date('2026-08-23T00:00:00.000Z'),
          endDate: new Date('2026-08-30T00:00:00.000Z'),
        }),
      );

      const unfreezeHandler = new UnfreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const result = await unfreezeHandler.execute(
        new UnfreezeMembershipCommand({ membershipId: 'mem_test_123' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.ACTIVE);
      expect(membershipRepo.save).toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalled();
    });
  });

  describe('3. CancelMembershipHandler', () => {
    it('cancels an active membership with reason and records cancellation event', async () => {
      const mem = createMembership(MembershipStatus.ACTIVE);
      membershipRepo.findById.mockResolvedValue(mem);

      const handler = new CancelMembershipHandler(membershipRepo, clock, eventPublisher);
      const command = new CancelMembershipCommand({
        membershipId: 'mem_test_123',
        reason: 'Relocated to another city',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().status).toBe(MembershipStatus.CANCELLED);
      expect(membershipRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });
});
