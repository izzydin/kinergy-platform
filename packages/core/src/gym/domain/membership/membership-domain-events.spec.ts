import { Membership } from './membership.aggregate';
import { MembershipId } from './membership-id.vo';
import { MembershipStatus } from './membership-status.enum';
import { MembershipPeriod } from './membership-period.vo';
import { FreezeWindow } from './freeze-window.vo';
import { TestClock } from '../shared/clock';
import {
  MembershipCreatedEvent,
  MembershipActivatedEvent,
  MembershipFrozenEvent,
  MembershipUnfrozenEvent,
  MembershipRenewedEvent,
  MembershipExpiredEvent,
  MembershipCancelledEvent,
  MembershipTerminatedEvent,
} from '../events';
import { InvalidMembershipTransitionException } from '../exceptions/invalid-membership-transition.exception';

describe('Membership Aggregate Root — Domain Events (Phase 5.2-E)', () => {
  const baseTime = new Date('2026-08-18T10:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(baseTime);
  });

  it('should emit MembershipCreatedEvent upon factory creation', () => {
    const period = MembershipPeriod.create(
      new Date('2026-08-18T00:00:00.000Z'),
      new Date('2026-09-18T00:00:00.000Z'),
    );

    const membership = Membership.create(
      {
        clientId: 'client-100',
        planId: 'plan-unlimited',
        period,
      },
      clock,
    );

    const events = membership.getUncommittedEvents();
    expect(events.length).toBe(1);

    const createdEvent = events[0] as MembershipCreatedEvent;
    expect(createdEvent.eventType).toBe('MembershipCreated');
    expect(createdEvent.aggregateId).toBe(membership.id.value);
    expect(createdEvent.aggregateVersion).toBe(1);
    expect(createdEvent.payload.clientId).toBe('client-100');
    expect(createdEvent.payload.planId).toBe('plan-unlimited');
    expect(createdEvent.payload.status).toBe(MembershipStatus.ACTIVE);
    expect(createdEvent.payload.startDate).toEqual(period.startDate);
    expect(createdEvent.payload.endDate).toEqual(period.endDate);
  });

  it('should emit MembershipActivatedEvent upon successful activation', () => {
    const period = MembershipPeriod.create(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    const membership = Membership.create(
      {
        clientId: 'client-101',
        planId: 'plan-monthly',
        period,
        status: MembershipStatus.PENDING,
      },
      clock,
    );
    membership.clearEvents();

    clock.advanceMinutes(30);
    membership.activate(clock);

    const events = membership.getUncommittedEvents();
    expect(events.length).toBe(1);

    const activatedEvent = events[0] as MembershipActivatedEvent;
    expect(activatedEvent.eventType).toBe('MembershipActivated');
    expect(activatedEvent.aggregateId).toBe(membership.id.value);
    expect(activatedEvent.aggregateVersion).toBe(2);
    expect(activatedEvent.payload.clientId).toBe('client-101');
    expect(activatedEvent.payload.planId).toBe('plan-monthly');
    expect(activatedEvent.payload.activatedAt).toEqual(clock.now());
  });

  it('should NOT emit MembershipActivatedEvent if activation fails', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-active-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-102',
      planId: 'plan-monthly',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    expect(() => membership.activate(clock)).toThrow(InvalidMembershipTransitionException);
    expect(membership.getUncommittedEvents().length).toBe(0);
  });

  it('should emit MembershipFrozenEvent upon successful freeze', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-freeze-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-103',
      planId: 'plan-premium',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    const freeze = FreezeWindow.create(
      new Date('2026-08-10T00:00:00.000Z'),
      new Date('2026-08-20T00:00:00.000Z'),
      'Family vacation',
    );

    membership.freeze(freeze, clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const frozenEvent = events[0] as MembershipFrozenEvent;
    expect(frozenEvent.eventType).toBe('MembershipFrozen');
    expect(frozenEvent.payload.clientId).toBe('client-103');
    expect(frozenEvent.payload.freezeStartDate).toEqual(freeze.startDate);
    expect(frozenEvent.payload.freezeEndDate).toEqual(freeze.endDate);
    expect(frozenEvent.payload.reason).toBe('Family vacation');
  });

  it('should emit MembershipUnfrozenEvent upon resuming from freeze', () => {
    const freeze = FreezeWindow.create(
      new Date('2026-08-05T00:00:00.000Z'),
      new Date('2026-08-15T00:00:00.000Z'), // 10 days
    );
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-unfreeze-1'),
      version: 2,
      status: MembershipStatus.FROZEN,
      clientId: 'client-104',
      planId: 'plan-premium',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      freezeHistory: [freeze],
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    membership.unfreeze(clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const unfrozenEvent = events[0] as MembershipUnfrozenEvent;
    expect(unfrozenEvent.eventType).toBe('MembershipUnfrozen');
    expect(unfrozenEvent.payload.freezeDurationDays).toBe(10);
    expect(unfrozenEvent.payload.newEndDate).toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });

  it('should emit MembershipRenewedEvent upon renewing an active membership', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-renew-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-105',
      planId: 'plan-basic',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    const renewalPeriod = MembershipPeriod.create(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );

    membership.renew(renewalPeriod, clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const renewedEvent = events[0] as MembershipRenewedEvent;
    expect(renewedEvent.eventType).toBe('MembershipRenewed');
    expect(renewedEvent.payload.planId).toBe('plan-basic');
    expect(renewedEvent.payload.newStartDate).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(renewedEvent.payload.newEndDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
  });

  it('should emit MembershipExpiredEvent when expired', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-expire-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-106',
      planId: 'plan-basic',
      period: MembershipPeriod.create(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    membership.expire(clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const expiredEvent = events[0] as MembershipExpiredEvent;
    expect(expiredEvent.eventType).toBe('MembershipExpired');
    expect(expiredEvent.payload.clientId).toBe('client-106');
  });

  it('should emit MembershipCancelledEvent when cancelled', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-cancel-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-107',
      planId: 'plan-basic',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    membership.cancel('Relocated to another country', clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const cancelledEvent = events[0] as MembershipCancelledEvent;
    expect(cancelledEvent.eventType).toBe('MembershipCancelled');
    expect(cancelledEvent.payload.cancellationReason).toBe('Relocated to another country');
  });

  it('should emit MembershipTerminatedEvent when terminated', () => {
    const membership = Membership.reconstitute({
      id: MembershipId.create('mem-terminate-1'),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client-108',
      planId: 'plan-basic',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    membership.terminate('Severe facility code violation', clock);

    const events = membership.pullEvents();
    expect(events.length).toBe(1);

    const terminatedEvent = events[0] as MembershipTerminatedEvent;
    expect(terminatedEvent.eventType).toBe('MembershipTerminated');
    expect(terminatedEvent.payload.terminationReason).toBe('Severe facility code violation');
  });

  it('should enforce event payload immutability', () => {
    const event = new MembershipActivatedEvent(
      'mem_immutable',
      'client_immutable',
      'plan_vip',
      2,
      baseTime,
    );

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });
});
