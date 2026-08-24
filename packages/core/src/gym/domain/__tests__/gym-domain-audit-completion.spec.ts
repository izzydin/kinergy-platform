import {
  Membership,
  MembershipStatus,
  MembershipPeriod,
  FreezeWindow,
  MembershipPlan,
  PlanCode,
  PlanPrice,
  PlanDuration,
  PlanStatus,
  AttendanceRecord,
  AccessResult,
  CheckInMethod,
  GymDay,
  InvalidMembershipPeriodException,
  InvalidMembershipTransitionException,
  MembershipPlanInvariantViolationException,
  InvalidAttendanceException,
  MembershipCreatedEvent,
  MembershipRenewedEvent,
  MembershipExpiredEvent,
  MembershipCancelledEvent,
  MembershipPlanPublishedEvent,
  MembershipPlanArchivedEvent,
  AttendanceRecordedEvent,
} from '../../index';
import { TestClock } from '../shared/clock';

describe('Phase 5: Gym Management Domain Comprehensive Audit & Verification', () => {
  let clock: TestClock;
  const t0 = new Date('2026-08-01T08:00:00.000Z');

  beforeEach(() => {
    clock = new TestClock(t0);
  });

  // =========================================================================
  // SECTION 1: MEMBERSHIP DOMAIN & LIFECYCLE TESTS
  // =========================================================================
  describe('1. Membership Domain Aggregate & Invariants', () => {
    it('1.1 Valid construction with default ACTIVE status and period math', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const period = MembershipPeriod.create(start, end);

      const membership = Membership.create(
        {
          clientId: 'client_101',
          planId: 'plan_std_monthly',
          period,
        },
        clock,
      );

      expect(membership.id).toBeDefined();
      expect(membership.clientId).toBe('client_101');
      expect(membership.planId).toBe('plan_std_monthly');
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.period.startDate).toEqual(start);
      expect(membership.period.endDate).toEqual(end);
      expect(membership.period.durationDays).toBe(30);

      // Verify domain event
      const events = membership.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(MembershipCreatedEvent);
      expect((events[0] as MembershipCreatedEvent).payload.clientId).toBe('client_101');
    });

    it('1.2 Rejects missing or empty Client reference', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );

      expect(() =>
        Membership.create(
          {
            clientId: '',
            planId: 'plan_1',
            period,
          },
          clock,
        ),
      ).toThrow('Client ID cannot be empty');

      expect(() =>
        Membership.create(
          {
            clientId: '   ',
            planId: 'plan_1',
            period,
          },
          clock,
        ),
      ).toThrow('Client ID cannot be empty');
    });

    it('1.3 Rejects missing or empty Plan reference', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );

      expect(() =>
        Membership.create(
          {
            clientId: 'client_1',
            planId: '',
            period,
          },
          clock,
        ),
      ).toThrow('Plan ID cannot be empty');
    });

    it('1.4 Rejects invalid dates in MembershipPeriod', () => {
      const invalidDate = new Date('invalid-date-string');
      const validDate = new Date('2026-08-01T00:00:00.000Z');

      expect(() => MembershipPeriod.create(invalidDate, validDate)).toThrow(
        InvalidMembershipPeriodException,
      );
      expect(() => MembershipPeriod.create(validDate, invalidDate)).toThrow(
        InvalidMembershipPeriodException,
      );
    });

    it('1.5 Rejects end date preceding start date', () => {
      const start = new Date('2026-08-31T00:00:00.000Z');
      const end = new Date('2026-08-01T00:00:00.000Z');

      expect(() => MembershipPeriod.create(start, end)).toThrow(InvalidMembershipPeriodException);
    });

    it('1.6 Rejects same-day zero-duration period (end date equals start date)', () => {
      const sameDate = new Date('2026-08-01T00:00:00.000Z');

      expect(() => MembershipPeriod.create(sameDate, sameDate)).toThrow(
        InvalidMembershipPeriodException,
      );
    });

    it('1.7 Initial lifecycle state conforms to specified status or defaults to ACTIVE', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );

      const mDefault = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);
      expect(mDefault.status).toBe(MembershipStatus.ACTIVE);

      const mPending = Membership.create(
        { clientId: 'c1', planId: 'p1', period, status: MembershipStatus.PENDING },
        clock,
      );
      expect(mPending.status).toBe(MembershipStatus.PENDING);
    });

    it('1.8 Valid state transitions execute cleanly', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // ACTIVE -> FROZEN
      const freezeWin = FreezeWindow.create(
        new Date('2026-08-05T00:00:00.000Z'),
        new Date('2026-08-15T00:00:00.000Z'),
        'Travel',
      );
      m.freeze(freezeWin, clock);
      expect(m.status).toBe(MembershipStatus.FROZEN);

      // FROZEN -> ACTIVE (Unfreeze)
      m.unfreeze(clock);
      expect(m.status).toBe(MembershipStatus.ACTIVE);

      // ACTIVE -> CANCELLED
      m.cancel('Relocation', clock);
      expect(m.status).toBe(MembershipStatus.CANCELLED);
    });

    it('1.9 Invalid state transitions are rejected with domain exceptions', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // Freeze once
      const freezeWin = FreezeWindow.create(
        new Date('2026-08-05T00:00:00.000Z'),
        new Date('2026-08-15T00:00:00.000Z'),
        'Medical',
      );
      m.freeze(freezeWin, clock);

      // Double freeze on already FROZEN membership is rejected
      expect(() => m.freeze(freezeWin, clock)).toThrow(InvalidMembershipTransitionException);

      // Cancel
      m.cancel('Moving away', clock);
      expect(m.status).toBe(MembershipStatus.CANCELLED);

      // Mutating a CANCELLED membership is rejected
      expect(() => m.freeze(freezeWin, clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => m.unfreeze(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => m.expire(clock)).toThrow(InvalidMembershipTransitionException);
      expect(() => m.cancel('Another reason', clock)).toThrow(InvalidMembershipTransitionException);
    });

    it('1.10 Renewal before expiration extends endDate from prior expiration', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const period = MembershipPeriod.create(start, end);
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // Advance clock by 10 days to Aug 11 (20 days remaining)
      clock.advanceDays(10);

      // Renew with a 30-day new period (Aug 31 -> Sep 30)
      const newPeriod = MembershipPeriod.create(end, new Date('2026-09-30T00:00:00.000Z'));
      m.renew(newPeriod, clock, 'p1');

      expect(m.period.startDate).toEqual(start);
      expect(m.period.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
      expect(m.period.durationDays).toBe(60);

      const events = m.getUncommittedEvents();
      const renewEvent = events.find((e) => e instanceof MembershipRenewedEvent);
      expect(renewEvent).toBeDefined();
    });

    it('1.11 Renewal at exact expiration boundary preserves continuity', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const period = MembershipPeriod.create(start, end);
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // Advance clock exactly to expiration boundary
      clock.advanceDays(30);

      const newPeriod = MembershipPeriod.create(end, new Date('2026-09-30T00:00:00.000Z'));
      m.renew(newPeriod, clock, 'p1');

      expect(m.period.endDate).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    });

    it('1.12 Renewal after expiration resets period from renewal evaluation date', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const period = MembershipPeriod.create(start, end);
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // Advance clock past expiration to Sep 10 and mark expired
      clock.advanceDays(40);
      m.expire(clock);
      expect(m.status).toBe(MembershipStatus.EXPIRED);

      // Renewing expired pass starts from Sep 10 -> Oct 10
      const renewalDate = clock.now();
      const newPeriod = MembershipPeriod.create(
        renewalDate,
        new Date(renewalDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      );
      m.renew(newPeriod, clock, 'p1');

      expect(m.status).toBe(MembershipStatus.ACTIVE);
      expect(m.period.startDate).toEqual(renewalDate);
      expect(m.period.endDate).toEqual(new Date('2026-10-10T08:00:00.000Z'));
    });

    it('1.13 Invalid renewal of CANCELLED membership is rejected', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);
      m.cancel('Cancelled by client', clock);

      const newPeriod = MembershipPeriod.create(
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-10-01T00:00:00.000Z'),
      );

      expect(() => m.renew(newPeriod, clock, 'p1')).toThrow(InvalidMembershipTransitionException);
    });

    it('1.14 Expiration behavior transitions to EXPIRED and emits event', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      // Advance clock past expiration
      clock.advanceDays(31);
      m.expire(clock);

      expect(m.status).toBe(MembershipStatus.EXPIRED);
      const expiredEvent = m
        .getUncommittedEvents()
        .find((e) => e instanceof MembershipExpiredEvent);
      expect(expiredEvent).toBeDefined();
    });

    it('1.15 Suspension (Freeze) and Resume (Unfreeze) preserves freeze window history', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T00:00:00.000Z');
      const period = MembershipPeriod.create(start, end);
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      const fStart = new Date('2026-08-05T00:00:00.000Z');
      const fEnd = new Date('2026-08-15T00:00:00.000Z');
      const freezeWin = FreezeWindow.create(fStart, fEnd, 'Vacation');

      m.freeze(freezeWin, clock);
      expect(m.status).toBe(MembershipStatus.FROZEN);
      expect(m.freezeHistory.length).toBe(1);

      // Unfreezing extends original end date by the 10 freeze days (Aug 31 + 10 days = Sep 10)
      m.unfreeze(clock);
      expect(m.status).toBe(MembershipStatus.ACTIVE);
      expect(m.period.endDate).toEqual(new Date('2026-09-10T00:00:00.000Z'));
      expect(m.period.durationDays).toBe(40);
    });

    it('1.16 Cancellation records reason and transitions to CANCELLED', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      m.cancel('Doctor advised against exercise', clock);
      expect(m.status).toBe(MembershipStatus.CANCELLED);
      expect(m.cancellationReason).toBe('Doctor advised against exercise');

      const cancelEvent = m
        .getUncommittedEvents()
        .find((e) => e instanceof MembershipCancelledEvent);
      expect(cancelEvent).toBeDefined();
    });

    it('1.17 Trainer assignment and removal behaves predictably', () => {
      const period = MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
      const m = Membership.create({ clientId: 'c1', planId: 'p1', period }, clock);

      m.assignTrainer('trainer_alice', clock);
      expect(m.trainerAssignment?.trainerId).toBe('trainer_alice');

      m.removeTrainer(clock);
      expect(m.trainerAssignment).toBeNull();
    });
  });

  // =========================================================================
  // SECTION 2: MEMBERSHIP PLAN DOMAIN TESTS
  // =========================================================================
  describe('2. Membership Plan Domain Aggregate & Value Objects', () => {
    it('2.1 Valid Plan construction with VOs', () => {
      const plan = MembershipPlan.create({
        code: PlanCode.create('PLAN_STD_30'),
        name: 'Standard 30 Day Pass',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(99, 'USD'),
        description: 'Unlimited gym access',
        createdAt: clock.now(),
      });

      expect(plan.id).toBeDefined();
      expect(plan.code.value).toBe('PLAN_STD_30');
      expect(plan.name).toBe('Standard 30 Day Pass');
      expect(plan.duration.durationInDays).toBe(30);
      expect(plan.price.amount).toBe(99);
      expect(plan.price.currency).toBe('USD');
      expect(plan.status).toBe(PlanStatus.DRAFT);
      expect(plan.isAvailableForPurchase()).toBe(false);
    });

    it('2.2 Rejects invalid plan durations (<= 0 or non-integer)', () => {
      expect(() => PlanDuration.ofDays(0)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(-5)).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanDuration.ofDays(15.5)).toThrow(MembershipPlanInvariantViolationException);
    });

    it('2.3 Rejects invalid plan price amounts and currencies', () => {
      expect(() => PlanPrice.create(-10, 'USD')).toThrow(MembershipPlanInvariantViolationException);
      expect(() => PlanPrice.create(99, 'INVALID_CURRENCY_CODE')).toThrow(
        MembershipPlanInvariantViolationException,
      );
      expect(() => PlanPrice.create(99, '')).toThrow(MembershipPlanInvariantViolationException);
    });

    it('2.4 Plan publishing (activation) and archival (deactivation)', () => {
      const plan = MembershipPlan.create({
        code: PlanCode.create('PLAN_PRO_30'),
        name: 'Pro Pass',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(149, 'USD'),
        createdAt: clock.now(),
      });

      expect(plan.status).toBe(PlanStatus.DRAFT);

      // Publish
      plan.publish(clock.now());
      expect(plan.status).toBe(PlanStatus.ACTIVE);
      expect(plan.isAvailableForPurchase()).toBe(true);
      expect(
        plan.getUncommittedEvents().some((e) => e instanceof MembershipPlanPublishedEvent),
      ).toBe(true);

      // Archive
      plan.archive(clock.now());
      expect(plan.status).toBe(PlanStatus.ARCHIVED);
      expect(plan.isAvailableForPurchase()).toBe(false);
      expect(
        plan.getUncommittedEvents().some((e) => e instanceof MembershipPlanArchivedEvent),
      ).toBe(true);
    });

    it('2.5 Plan pricing update preserves historical aggregate immutability', () => {
      const plan = MembershipPlan.create({
        code: PlanCode.create('PLAN_ANNUAL'),
        name: 'Annual Pass',
        duration: PlanDuration.ofDays(365),
        price: PlanPrice.create(999, 'USD'),
        createdAt: clock.now(),
      });

      const newPrice = PlanPrice.create(1099, 'USD');
      plan.updatePricing(newPrice, clock.now());

      expect(plan.price.amount).toBe(1099);
      expect(plan.price.currency).toBe('USD');
    });
  });

  // =========================================================================
  // SECTION 3: ATTENDANCE DOMAIN TESTS
  // =========================================================================
  describe('3. Attendance Domain Aggregate & Rules', () => {
    it('3.1 Valid GRANTED attendance check-in emits event', () => {
      const checkInTime = new Date('2026-08-01T09:30:00.000Z');
      const gymDay = GymDay.fromUtc(checkInTime, 'America/New_York', 'fac_main');

      const record = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          membershipId: 'mem_123',
          checkInTime,
          gymDay,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
          gateId: 'turnstile_01',
        },
        clock,
      );

      expect(record.id).toBeDefined();
      expect(record.clientId).toBe('client_sarah');
      expect(record.membershipId).toBe('mem_123');
      expect(record.result).toBe(AccessResult.GRANTED);
      expect(record.isGranted()).toBe(true);
      expect(record.isDenied()).toBe(false);
      expect(record.gymDay.localDate).toBe('2026-08-01');

      const event = record.getUncommittedEvents().find((e) => e instanceof AttendanceRecordedEvent);
      expect(event).toBeDefined();
    });

    it('3.2 Rejects GRANTED check-in when membershipId is missing', () => {
      const checkInTime = new Date('2026-08-01T09:30:00.000Z');
      const gymDay = GymDay.fromUtc(checkInTime);

      expect(() =>
        AttendanceRecord.record(
          {
            clientId: 'client_sarah',
            membershipId: null,
            checkInTime,
            gymDay,
            method: CheckInMethod.QR_CODE,
            result: AccessResult.GRANTED,
          },
          clock,
        ),
      ).toThrow(InvalidAttendanceException);
    });

    it('3.3 Rejects check-in with empty client ID', () => {
      const checkInTime = new Date('2026-08-01T09:30:00.000Z');
      const gymDay = GymDay.fromUtc(checkInTime);

      expect(() =>
        AttendanceRecord.record(
          {
            clientId: '',
            checkInTime,
            gymDay,
            method: CheckInMethod.MANUAL_RECEPTION,
            result: AccessResult.DENIED_NO_MEMBERSHIP,
          },
          clock,
        ),
      ).toThrow(InvalidAttendanceException);
    });

    it('3.4 Records DENIED access results correctly without requiring membershipId', () => {
      const checkInTime = new Date('2026-08-01T09:30:00.000Z');
      const gymDay = GymDay.fromUtc(checkInTime);

      const deniedExpired = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          checkInTime,
          gymDay,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.DENIED_EXPIRED,
        },
        clock,
      );
      expect(deniedExpired.isDenied()).toBe(true);
      expect(deniedExpired.result).toBe(AccessResult.DENIED_EXPIRED);

      const deniedFrozen = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          checkInTime,
          gymDay,
          method: CheckInMethod.BARCODE,
          result: AccessResult.DENIED_FROZEN,
        },
        clock,
      );
      expect(deniedFrozen.isDenied()).toBe(true);
      expect(deniedFrozen.result).toBe(AccessResult.DENIED_FROZEN);

      const deniedDuplicate = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          checkInTime,
          gymDay,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.DENIED_DUPLICATE_CHECKIN,
        },
        clock,
      );
      expect(deniedDuplicate.isDenied()).toBe(true);
      expect(deniedDuplicate.result).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
    });

    it('3.5 GymDay correctly normalizes UTC timestamps across timezone offsets', () => {
      // 2026-08-01 02:00 UTC is 2026-07-31 22:00 EDT (UTC-4)
      const lateUtc = new Date('2026-08-01T02:00:00.000Z');
      const gymDayEst = GymDay.fromUtc(lateUtc, 'America/New_York', 'fac_nyc');

      expect(gymDayEst.localDate).toBe('2026-07-31');
      expect(gymDayEst.facilityId).toBe('fac_nyc');
      expect(gymDayEst.toString()).toBe('2026-07-31@fac_nyc(America/New_York)');
    });
  });
});
