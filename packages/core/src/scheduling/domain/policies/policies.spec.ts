import { DefaultAppointmentDurationPolicy } from './appointment-duration.policy';
import { BookingWindowPolicy } from './booking-window.policy';
import { CancellationPolicy } from './cancellation.policy';
import { ReschedulePolicy } from './reschedule.policy';
import { BookingIdempotencyPolicy } from './booking-idempotency.policy';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { Duration } from '../value-objects/duration.vo';
import { TestClock } from '../shared/clock';

describe('Domain Business Policies', () => {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const testClock = new TestClock(now);

  describe('DefaultAppointmentDurationPolicy', () => {
    const policy = new DefaultAppointmentDurationPolicy();
    const assessmentType = AppointmentType.create(AppointmentTypeEnum.ASSESSMENT);

    it('should validate compliant durations', () => {
      const validDuration = Duration.fromMinutes(60);
      const res = policy.validateDuration(assessmentType, validDuration);
      expect(res.isValid).toBe(true);
    });

    it('should reject durations below minimum limit', () => {
      const tooShort = Duration.fromMinutes(15);
      const res = policy.validateDuration(assessmentType, tooShort);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('less than minimum required');
    });

    it('should reject durations exceeding maximum limit', () => {
      const tooLong = Duration.fromMinutes(150);
      const res = policy.validateDuration(assessmentType, tooLong);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('exceeds maximum allowed');
    });

    it('should return standard default duration for type', () => {
      const defaultDur = policy.getDefaultDuration(assessmentType);
      expect(defaultDur.toMinutes()).toBe(60);
    });
  });

  describe('BookingWindowPolicy', () => {
    const policy = new BookingWindowPolicy({
      minNotice: Duration.fromHours(2),
      maxAdvanceHorizonDays: 90,
    });

    it('should allow booking scheduled within valid window (e.g. 5 hours out)', () => {
      const validStart = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const res = policy.validateBookingWindow(validStart, testClock);
      expect(res.isValid).toBe(true);
    });

    it('should reject booking scheduled with less than min notice (e.g. 30m out)', () => {
      const shortNoticeStart = new Date(now.getTime() + 30 * 60 * 1000);
      const res = policy.validateBookingWindow(shortNoticeStart, testClock);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('at least 2 hour(s) in advance');
    });

    it('should reject booking scheduled beyond max advance horizon (e.g. 100 days out)', () => {
      const farFutureStart = new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000);
      const res = policy.validateBookingWindow(farFutureStart, testClock);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('more than 90 days in advance');
    });
  });

  describe('CancellationPolicy', () => {
    const policy = new CancellationPolicy({
      noticeCutoff: Duration.fromHours(24),
    });

    it('should evaluate cancellation as fee-free when notice is > 24 hours', () => {
      const apptStart = new Date('2026-08-05T10:00:00.000Z');
      const cancelTime = new Date('2026-08-03T10:00:00.000Z');

      const res = policy.evaluateCancellation(apptStart, cancelTime);
      expect(res.isLateCancellation).toBe(false);
      expect(res.penaltyApplies).toBe(false);
    });

    it('should evaluate cancellation as late when notice is < 24 hours', () => {
      const apptStart = new Date('2026-08-04T10:00:00.000Z');
      const cancelTime = new Date('2026-08-03T18:00:00.000Z'); // 16 hours notice

      const res = policy.evaluateCancellation(apptStart, cancelTime);
      expect(res.isLateCancellation).toBe(true);
      expect(res.penaltyApplies).toBe(true);
      expect(res.reason).toContain('Late cancellation fee applies');
    });
  });

  describe('ReschedulePolicy', () => {
    const policy = new ReschedulePolicy({
      maxReschedules: 3,
      minNotice: Duration.fromHours(12),
    });

    it('should allow valid reschedule request', () => {
      const currentStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours away
      const newTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const res = policy.validateReschedule(1, currentStart, newTime, testClock);
      expect(res.isValid).toBe(true);
    });

    it('should reject reschedule when max count is reached', () => {
      const currentStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const newTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const res = policy.validateReschedule(3, currentStart, newTime, testClock);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Maximum allowed reschedules (3) exceeded');
    });

    it('should reject reschedule when notice is insufficient', () => {
      const currentStart = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours away
      const newTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const res = policy.validateReschedule(1, currentStart, newTime, testClock);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('at least 12 hour(s) advance notice');
    });
  });

  describe('BookingIdempotencyPolicy', () => {
    const policy = new BookingIdempotencyPolicy();

    it('should pass for new request keys', () => {
      const existingKeys = new Set(['key_1', 'key_2']);
      const res = policy.validateIdempotency('key_3', existingKeys);

      expect(res.isDuplicate).toBe(false);
    });

    it('should detect duplicate request keys', () => {
      const existingKeys = new Set(['key_1', 'key_2']);
      const res = policy.validateIdempotency('key_1', existingKeys);

      expect(res.isDuplicate).toBe(true);
      expect(res.reason).toContain('Duplicate booking request detected');
    });
  });
});
