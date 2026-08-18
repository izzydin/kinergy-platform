import { RenewMembershipHandler } from './renew-membership.handler';
import { RenewMembershipCommand } from '../commands/renew-membership.command';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { TestClock } from '../../domain/shared/clock';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { FreezeWindow } from '../../domain/membership/freeze-window.vo';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { DomainEvent } from '../../domain/shared/domain-event';
import { MembershipRenewedEvent } from '../../domain/events/membership-renewed.event';

describe('RenewMembershipHandler (Phase 5.4-C)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let membershipPlanRepository: jest.Mocked<MembershipPlanRepository>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let handler: RenewMembershipHandler;

  let activePlan30d: MembershipPlan;
  let activePlan90d: MembershipPlan;
  let draftPlan: MembershipPlan;
  let archivedPlan: MembershipPlan;

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

    membershipPlanRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    activePlan30d = MembershipPlan.create({
      id: PlanId.create('plan-std-30d'),
      code: PlanCode.create('STD_30D'),
      name: 'Standard 30 Days',
      duration: 30,
      price: PlanPrice.create(60.0, 'USD'),
    });
    activePlan30d.publish(baseTime);

    activePlan90d = MembershipPlan.create({
      id: PlanId.create('plan-gold-90d'),
      code: PlanCode.create('GOLD_90D'),
      name: 'Gold 90 Days',
      duration: 90,
      price: PlanPrice.create(160.0, 'USD'),
    });
    activePlan90d.publish(baseTime);

    draftPlan = MembershipPlan.create({
      id: PlanId.create('plan-draft-90d'),
      code: PlanCode.create('VIP_DRAFT'),
      name: 'VIP Draft',
      duration: 90,
      price: PlanPrice.create(200.0, 'USD'),
    });

    archivedPlan = MembershipPlan.create({
      id: PlanId.create('plan-archived-annual'),
      code: PlanCode.create('ANNUAL_2025'),
      name: 'Annual 2025',
      duration: 365,
      price: PlanPrice.create(500.0, 'USD'),
    });
    archivedPlan.publish(baseTime);
    archivedPlan.archive(baseTime);

    membershipPlanRepository.findById.mockImplementation(async (id) => {
      const idVal = id instanceof PlanId ? id.value : String(id);
      if (idVal === activePlan30d.id.value) return activePlan30d;
      if (idVal === activePlan90d.id.value) return activePlan90d;
      if (idVal === draftPlan.id.value) return draftPlan;
      if (idVal === archivedPlan.id.value) return archivedPlan;
      return null;
    });

    handler = new RenewMembershipHandler(
      membershipRepository,
      membershipPlanRepository,
      clock,
      eventPublisher,
    );
  });

  describe('1. Early & Standard Renewal Workflows', () => {
    it('should orchestrate early renewal gaplessly preserving remaining paid days', async () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const initialPeriod = MembershipPeriod.create(start, end);

      const membership = Membership.create(
        {
          id: MembershipId.create('mem-early-123'),
          clientId: 'client-123',
          planId: activePlan30d.id.value,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      membership.clearEvents();

      membershipRepository.findById.mockResolvedValueOnce(membership);
      membershipRepository.findByClientId.mockResolvedValueOnce([membership]);

      // Renew on August 18 (13 days before expiration)
      const command = new RenewMembershipCommand({
        membershipId: 'mem-early-123',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.id).toBe('mem-early-123');
      expect(dto.status).toBe('ACTIVE');
      expect(dto.version).toBe(2);
      expect(dto.period.startDate).toBe(start.toISOString());
      expect(dto.period.endDate).toBe(new Date('2026-09-30T00:00:00.000Z').toISOString());
      expect(dto.period.durationDays).toBe(60);

      // Verify persistence & event publication
      expect(membershipRepository.save).toHaveBeenCalledWith(membership);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
      const events = eventPublisher.publish.mock.calls[0]![0] as ReadonlyArray<DomainEvent>;
      expect(events[0]!.eventType).toBe('MembershipRenewed');
    });

    it('should orchestrate renewal with an upgraded plan', async () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const initialPeriod = MembershipPeriod.create(start, end);

      const membership = Membership.create(
        {
          id: MembershipId.create('mem-upgrade-456'),
          clientId: 'client-456',
          planId: activePlan30d.id.value,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      membership.clearEvents();

      membershipRepository.findById.mockResolvedValueOnce(membership);
      membershipRepository.findByClientId.mockResolvedValueOnce([membership]);

      // Upgrade to 90 days plan
      const command = new RenewMembershipCommand({
        membershipId: 'mem-upgrade-456',
        newPlanId: activePlan90d.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.planId).toBe(activePlan90d.id.value);
      expect(dto.period.durationDays).toBe(120); // 30 initial + 90 renewal
      expect(dto.period.endDate).toBe(new Date('2026-11-29T00:00:00.000Z').toISOString());

      const events = eventPublisher.publish.mock.calls[0]![0] as ReadonlyArray<DomainEvent>;
      const renewedEvent = events[0] as MembershipRenewedEvent;
      expect(renewedEvent.payload.planId).toBe(activePlan90d.id.value);
    });
  });

  describe('2. Boundary & Post-Expiration Renewal Workflows', () => {
    it('should renew smoothly at the exact expiration boundary instant', async () => {
      const start = new Date('2026-07-19T10:00:00.000Z');
      const end = baseTime; // 2026-08-18T10:00:00.000Z (exact boundary)
      const initialPeriod = MembershipPeriod.create(start, end);

      const membership = Membership.create(
        {
          id: MembershipId.create('mem-boundary-789'),
          clientId: 'client-789',
          planId: activePlan30d.id.value,
          period: initialPeriod,
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      membership.clearEvents();

      membershipRepository.findById.mockResolvedValueOnce(membership);
      membershipRepository.findByClientId.mockResolvedValueOnce([membership]);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-boundary-789',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.period.endDate).toBe(new Date('2026-09-17T10:00:00.000Z').toISOString());
    });

    it('should re-activate an EXPIRED membership starting from the effective payment date without gap backdating', async () => {
      const pastStart = new Date('2026-06-01T00:00:00.000Z');
      const pastEnd = new Date('2026-07-01T00:00:00.000Z');
      const initialPeriod = MembershipPeriod.create(pastStart, pastEnd);

      const membership = Membership.create(
        {
          id: MembershipId.create('mem-expired-101'),
          clientId: 'client-101',
          planId: activePlan30d.id.value,
          period: initialPeriod,
          status: MembershipStatus.EXPIRED,
        },
        clock,
      );
      membership.clearEvents();

      membershipRepository.findById.mockResolvedValueOnce(membership);
      membershipRepository.findByClientId.mockResolvedValueOnce([membership]);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-expired-101',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.status).toBe('ACTIVE');
      expect(dto.period.startDate).toBe(baseTime.toISOString());
      expect(dto.period.endDate).toBe(new Date('2026-09-17T10:00:00.000Z').toISOString());
      expect(dto.period.durationDays).toBe(30);
    });

    it('should support effectiveDate parameter for controlled execution', async () => {
      const pastStart = new Date('2026-06-01T00:00:00.000Z');
      const pastEnd = new Date('2026-07-01T00:00:00.000Z');
      const initialPeriod = MembershipPeriod.create(pastStart, pastEnd);

      const membership = Membership.create(
        {
          id: MembershipId.create('mem-custom-date'),
          clientId: 'client-101',
          planId: activePlan30d.id.value,
          period: initialPeriod,
          status: MembershipStatus.EXPIRED,
        },
        clock,
      );

      membershipRepository.findById.mockResolvedValueOnce(membership);
      membershipRepository.findByClientId.mockResolvedValueOnce([membership]);

      const customEffective = '2026-08-20T00:00:00.000Z';
      const command = new RenewMembershipCommand({
        membershipId: 'mem-custom-date',
        effectiveDate: customEffective,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.period.startDate).toBe(customEffective);
    });
  });

  describe('3. Validation, Missing Resources & Lifecycle Invariant Rejections', () => {
    it('should reject when membershipId is missing', async () => {
      const command = new RenewMembershipCommand({
        membershipId: '   ',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Membership ID is required');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject when membership is not found', async () => {
      membershipRepository.findById.mockResolvedValueOnce(null);

      const command = new RenewMembershipCommand({
        membershipId: 'non-existent-mem',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership with id 'non-existent-mem' not found");
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject when renewal plan is not found', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-plan-missing'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-plan-missing',
        newPlanId: 'unknown-plan-999',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership plan with id 'unknown-plan-999' not found");
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject when plan is in DRAFT status', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-draft-plan'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-draft-plan',
        newPlanId: draftPlan.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for renewal');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject when plan is in ARCHIVED status', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-archived-plan'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-archived-plan',
        newPlanId: archivedPlan.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for renewal');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject when effectiveDate format is invalid', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-invalid-date'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-invalid-date',
        effectiveDate: 'invalid-date-string',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Invalid effectiveDate 'invalid-date-string'");
    });

    it('should reject renewal from CANCELLED state', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-cancelled'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membership.cancel('Client relocated', clock);
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-cancelled',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Only ACTIVE or EXPIRED memberships can be renewed');
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should reject renewal from TERMINATED state', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-terminated'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membership.terminate('Safety violation', clock);
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-terminated',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Only ACTIVE or EXPIRED memberships can be renewed');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject renewal while FROZEN (must unfreeze first)', async () => {
      const membership = Membership.create({
        id: MembershipId.create('mem-frozen'),
        clientId: 'client-123',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(baseTime, new Date('2026-09-17T10:00:00.000Z')),
      });
      membership.freeze(
        FreezeWindow.create(baseTime, new Date('2026-08-28T10:00:00.000Z'), 'Medical'),
        clock,
      );
      membershipRepository.findById.mockResolvedValueOnce(membership);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-frozen',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Only ACTIVE or EXPIRED memberships can be renewed');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('4. Cross-Membership Overlap Enforcement (Phase 5.3-E)', () => {
    it('should reject renewal if the extended period overlaps with another separate active membership of the client', async () => {
      const targetMembership = Membership.create({
        id: MembershipId.create('mem-target'),
        clientId: 'client-multi',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
      });

      // Another distinct membership already booked for September 15 to October 15
      const conflictingMembership = Membership.create({
        id: MembershipId.create('mem-conflicting'),
        clientId: 'client-multi',
        planId: activePlan30d.id.value,
        period: MembershipPeriod.create(
          new Date('2026-09-15T00:00:00.000Z'),
          new Date('2026-10-15T00:00:00.000Z'),
        ),
      });

      membershipRepository.findById.mockResolvedValueOnce(targetMembership);
      membershipRepository.findByClientId.mockResolvedValueOnce([
        targetMembership,
        conflictingMembership,
      ]);

      const command = new RenewMembershipCommand({
        membershipId: 'mem-target',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('overlaps with existing');
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });
});
