import { CreateMembershipHandler } from './create-membership.handler';
import { CreateMembershipCommand } from '../commands/create-membership.command';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { GymEventPublisherPort } from '../ports/gym-event-publisher.port';
import { TestClock } from '../../domain/shared/clock';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { Membership } from '../../domain/membership/membership.aggregate';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { DomainEvent } from '../../domain/shared/domain-event';

describe('CreateMembershipHandler (Phase 5.3-D)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let membershipPlanRepository: jest.Mocked<MembershipPlanRepository>;
  let clientLookupPort: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let handler: CreateMembershipHandler;

  let activePlan: MembershipPlan;
  let draftPlan: MembershipPlan;
  let archivedPlan: MembershipPlan;

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByClientId: jest.fn().mockResolvedValue([]),
    };

    membershipPlanRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    clientLookupPort = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    activePlan = MembershipPlan.create({
      id: PlanId.create('plan-monthly-std'),
      code: PlanCode.create('STD_30D'),
      name: 'Standard 30 Days',
      duration: 30,
      price: PlanPrice.create(60.0, 'USD'),
    });
    activePlan.publish(baseTime);

    draftPlan = MembershipPlan.create({
      id: PlanId.create('plan-draft-90d'),
      code: PlanCode.create('VIP_90D_DRAFT'),
      name: 'VIP 90 Days Draft',
      duration: 90,
      price: PlanPrice.create(150.0, 'USD'),
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
      if (idVal === activePlan.id.value) return activePlan;
      if (idVal === draftPlan.id.value) return draftPlan;
      if (idVal === archivedPlan.id.value) return archivedPlan;
      return null;
    });

    handler = new CreateMembershipHandler(
      membershipRepository,
      membershipPlanRepository,
      clientLookupPort,
      clock,
      eventPublisher,
    );
  });

  describe('1. Successful Membership Creation Workflow', () => {
    it('should orchestrate membership creation with default current time and active plan', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: 'plan-monthly-std',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.clientId).toBe('client-123');
      expect(dto.planId).toBe('plan-monthly-std');
      expect(dto.status).toBe('ACTIVE');
      expect(dto.period.startDate).toBe(baseTime.toISOString());
      expect(dto.period.durationDays).toBe(30);

      // Verify repository persistence
      expect(membershipRepository.save).toHaveBeenCalledTimes(1);
      const savedMembership = membershipRepository.save.mock.calls[0]![0] as Membership;
      expect(savedMembership.clientId).toBe('client-123');
      expect(savedMembership.planId).toBe('plan-monthly-std');

      // Verify domain events published
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
      const publishedEvents = eventPublisher.publish.mock
        .calls[0]![0] as ReadonlyArray<DomainEvent>;
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]!.eventType).toBe('MembershipCreated');
    });

    it('should correctly calculate end date from custom start date and plan duration', async () => {
      const customStart = '2026-09-01T00:00:00.000Z';
      const command = new CreateMembershipCommand({
        clientId: 'client-456',
        planId: 'plan-monthly-std',
        startDate: customStart,
        assignedTrainerId: 'trainer-99',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      expect(dto.period.startDate).toBe(customStart);
      expect(dto.period.durationDays).toBe(30);
      expect(dto.assignedTrainerId).toBe('trainer-99');
    });

    it('should respect custom ID when provided in input', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-789',
        planId: 'plan-monthly-std',
        customId: 'mem_custom_789',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('mem_custom_789');
    });
  });

  describe('2. Validation & Boundary Rejections', () => {
    it('should reject creation when clientId is missing or blank', async () => {
      const command = new CreateMembershipCommand({
        clientId: '   ',
        planId: 'plan-monthly-std',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Client ID is required');
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should reject creation when planId is missing or blank', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: '',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Plan ID is required');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject creation when client does not exist according to ClientLookupPort', async () => {
      clientLookupPort.validateClientExists.mockResolvedValueOnce(false);

      const command = new CreateMembershipCommand({
        clientId: 'client-nonexistent',
        planId: 'plan-monthly-std',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Client with id 'client-nonexistent' does not exist");
      expect(membershipRepository.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should reject creation when plan does not exist in repository', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: 'plan-unknown-999',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Membership plan with id 'plan-unknown-999' not found");
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject creation when plan is in DRAFT status', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: draftPlan.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for new memberships');
      expect(result.getError()).toContain('DRAFT');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject creation when plan is in ARCHIVED status', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: archivedPlan.id.value,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('is not active or available for new memberships');
      expect(result.getError()).toContain('ARCHIVED');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should reject creation when startDate is invalid format', async () => {
      const command = new CreateMembershipCommand({
        clientId: 'client-123',
        planId: 'plan-monthly-std',
        startDate: 'not-a-valid-date',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Invalid startDate 'not-a-valid-date'");
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });
  });
});
