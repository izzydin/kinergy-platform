import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { FreezeWindow } from '../../domain/membership/freeze-window.vo';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { GymLoggerPort } from '../ports/gym-logger.port';
import { MembershipEligibilityOutcome } from '../dtos/membership-eligibility-outcome.enum';
import { CheckMembershipEligibilityQuery } from './check-membership-eligibility.query';
import { CheckMembershipEligibilityHandler } from './check-membership-eligibility.handler';

describe('Phase 5.5-B: CheckMembershipEligibilityHandler', () => {
  let clock: TestClock;
  let membershipsDb: Map<string, Membership>;
  let existingClients: Set<string>;

  let membershipRepo: MembershipRepository;
  let clientLookupPort: ClientLookupPort;
  let logger: GymLoggerPort;
  let handler: CheckMembershipEligibilityHandler;

  // Base evaluation timeline: 2026-08-15T12:00:00.000Z
  const tBase = new Date('2026-08-15T12:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(tBase);
    membershipsDb = new Map<string, Membership>();
    existingClients = new Set<string>(['client_valid_1', 'client_valid_2', 'client_multi']);

    membershipRepo = {
      save: jest.fn(async (m: Membership) => {
        membershipsDb.set(m.id.value, m);
      }),
      findById: jest.fn(async (id: MembershipId | string) => {
        const key = typeof id === 'string' ? id : id.value;
        return membershipsDb.get(key) ?? null;
      }),
      findByClientId: jest.fn(async (clientId: string) => {
        return Array.from(membershipsDb.values()).filter((m) => m.clientId === clientId);
      }),
      findExpiringCandidates: jest.fn(async () => []),
      findExpiringWithinHorizon: jest.fn(async () => []),
      findAll: jest.fn(async () => Array.from(membershipsDb.values())),
    };

    clientLookupPort = {
      validateClientExists: jest.fn(async (clientId: string) => existingClients.has(clientId)),
    };

    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    handler = new CheckMembershipEligibilityHandler(
      membershipRepo,
      clientLookupPort,
      clock,
      logger,
    );
  });

  describe('1. Active & Eligible Cases', () => {
    it('1.1 Returns ELIGIBLE when client has an active membership covering current time', async () => {
      const membership = Membership.create(
        {
          clientId: 'client_valid_1',
          planId: 'plan_monthly',
          period: MembershipPeriod.create(
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-31T00:00:00.000Z'),
          ),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));

      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(true);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.ELIGIBLE);
      expect(dto.membershipId).toBe(membership.id.value);
      expect(dto.planId).toBe('plan_monthly');
      expect(dto.period).toEqual({
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
      });
      expect(dto.reason).toBe('Client has an active and valid membership.');
    });

    it('1.2 Supports direct invocation via MembershipEligibilityPort evaluateEligibility', async () => {
      const membership = Membership.create(
        {
          clientId: 'client_valid_1',
          planId: 'plan_monthly',
          period: MembershipPeriod.create(
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-31T00:00:00.000Z'),
          ),
          status: MembershipStatus.ACTIVE,
        },
        clock,
      );
      await membershipRepo.save(membership);

      const dto = await handler.evaluateEligibility('client_valid_1');
      expect(dto.isEligible).toBe(true);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.ELIGIBLE);
    });
  });

  describe('2. Client Identity & Cross-Context Boundary', () => {
    it('2.1 Returns INACTIVE_CLIENT when client does not exist in Client Management', async () => {
      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_non_existent'));

      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.INACTIVE_CLIENT);
      expect(dto.membershipId).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Client not found or inactive'),
        expect.objectContaining({ clientId: 'client_non_existent' }),
      );
    });

    it('2.2 Returns INACTIVE_CLIENT when clientId is empty or whitespace', async () => {
      const res = await handler.execute(new CheckMembershipEligibilityQuery('   '));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.INACTIVE_CLIENT);
    });
  });

  describe('3. Ineligible Membership States & Diagnostics', () => {
    it('3.1 Returns NO_MEMBERSHIP when client has zero membership agreements', async () => {
      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_2'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.NO_MEMBERSHIP);
      expect(dto.membershipId).toBeNull();
    });

    it('3.2 Returns EXPIRED when membership validity end date has passed', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_exp_1'),
        version: 1,
        status: MembershipStatus.EXPIRED,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.EXPIRED);
      expect(dto.membershipId).toBe('mem_exp_1');
      expect(dto.reason).toContain('Membership expired on 2026-07-31T00:00:00.000Z.');
    });

    it('3.3 Returns FROZEN when membership is currently in a freeze window', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_froz_1'),
        version: 1,
        status: MembershipStatus.FROZEN,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        freezeHistory: [
          FreezeWindow.create(
            new Date('2026-08-10T00:00:00.000Z'),
            new Date('2026-08-20T00:00:00.000Z'),
            'Medical recovery',
          ),
        ],
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.FROZEN);
      expect(dto.membershipId).toBe('mem_froz_1');
      expect(dto.reason).toBe('Membership is currently frozen and access is suspended.');
    });

    it('3.4 Returns NOT_YET_ACTIVE when membership period is scheduled for the future', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_future_1'),
        version: 1,
        status: MembershipStatus.PENDING,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-09-01T00:00:00.000Z'),
          new Date('2026-09-30T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.NOT_YET_ACTIVE);
      expect(dto.membershipId).toBe('mem_future_1');
      expect(dto.reason).toContain('valid from 2026-09-01T00:00:00.000Z');
    });

    it('3.5 Returns CANCELLED when membership was cancelled prior to expiration', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_canc_1'),
        version: 1,
        status: MembershipStatus.CANCELLED,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.CANCELLED);
    });

    it('3.6 Returns TERMINATED when membership was terminated', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_term_1'),
        version: 1,
        status: MembershipStatus.TERMINATED,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_valid_1'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(false);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.TERMINATED);
    });
  });

  describe('4. Multiple Memberships Resolution Policy', () => {
    it('4.1 Selects the ACTIVE eligible membership when client has historical expired memberships', async () => {
      // Past expired membership
      const oldMem = Membership.reconstitute({
        id: MembershipId.create('mem_past_exp'),
        version: 1,
        status: MembershipStatus.EXPIRED,
        clientId: 'client_multi',
        planId: 'plan_past',
        period: MembershipPeriod.create(
          new Date('2026-06-01T00:00:00.000Z'),
          new Date('2026-06-30T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });

      // Current active renewed membership
      const activeMem = Membership.reconstitute({
        id: MembershipId.create('mem_current_act'),
        version: 1,
        status: MembershipStatus.ACTIVE,
        clientId: 'client_multi',
        planId: 'plan_current',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });

      await membershipRepo.save(oldMem);
      await membershipRepo.save(activeMem);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_multi'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(true);
      expect(dto.outcome).toBe(MembershipEligibilityOutcome.ELIGIBLE);
      expect(dto.membershipId).toBe('mem_current_act');
    });

    it('4.2 Selects currently ACTIVE membership when future pre-scheduled renewal exists', async () => {
      const activeMem = Membership.reconstitute({
        id: MembershipId.create('mem_active_now'),
        version: 1,
        status: MembershipStatus.ACTIVE,
        clientId: 'client_multi',
        planId: 'plan_aug',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });

      const futureMem = Membership.reconstitute({
        id: MembershipId.create('mem_future_sep'),
        version: 1,
        status: MembershipStatus.PENDING,
        clientId: 'client_multi',
        planId: 'plan_sep',
        period: MembershipPeriod.create(
          new Date('2026-08-31T00:00:00.000Z'),
          new Date('2026-09-30T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });

      await membershipRepo.save(activeMem);
      await membershipRepo.save(futureMem);

      const res = await handler.execute(new CheckMembershipEligibilityQuery('client_multi'));
      expect(res.isSuccess).toBe(true);
      const dto = res.getValue();
      expect(dto.isEligible).toBe(true);
      expect(dto.membershipId).toBe('mem_active_now');
    });
  });

  describe('5. Exact Temporal & Expiration Boundary Precision', () => {
    it('5.1 Evaluates [startDate, endDate) half-open interval: 1ms before endDate is ELIGIBLE, exact boundary is EXPIRED', async () => {
      const membership = Membership.reconstitute({
        id: MembershipId.create('mem_boundary_1'),
        version: 1,
        status: MembershipStatus.ACTIVE,
        clientId: 'client_valid_1',
        planId: 'plan_monthly',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
        createdAt: tBase,
        updatedAt: tBase,
      });
      await membershipRepo.save(membership);

      // 1 ms before expiration (2026-08-30T23:59:59.999Z)
      const tBefore = new Date('2026-08-30T23:59:59.999Z');
      const resBefore = await handler.execute(
        new CheckMembershipEligibilityQuery('client_valid_1', tBefore),
      );
      expect(resBefore.getValue().isEligible).toBe(true);
      expect(resBefore.getValue().outcome).toBe(MembershipEligibilityOutcome.ELIGIBLE);

      // Exact expiration instant (2026-08-31T00:00:00.000Z)
      const tExact = new Date('2026-08-31T00:00:00.000Z');
      const resExact = await handler.execute(
        new CheckMembershipEligibilityQuery('client_valid_1', tExact),
      );
      expect(resExact.getValue().isEligible).toBe(false);
      expect(resExact.getValue().outcome).toBe(MembershipEligibilityOutcome.EXPIRED);
    });
  });
});
