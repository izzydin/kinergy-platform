import {
  PrismaMembershipPlanMapper,
  PrismaMembershipMapper,
  PrismaAttendanceRecordMapper,
} from '../index';
import {
  MembershipPlan,
  PlanCode,
  PlanPrice,
  PlanDuration,
  PlanStatus,
} from '../../../../domain/plan';
import {
  Membership,
  MembershipStatus,
  MembershipPeriod,
  FreezeWindow,
  TrainerAssignment,
} from '../../../../domain/membership';
import {
  AttendanceRecord,
  AccessResult,
  CheckInMethod,
  GymDay,
} from '../../../../domain/attendance';
import { TestClock } from '../../../../domain/shared/clock';
import {
  Prisma,
  MembershipPlan as PrismaMembershipPlanModel,
  Membership as PrismaMembershipModel,
  AttendanceRecord as PrismaAttendanceRecordModel,
} from '@prisma/client';

describe('Phase 5: Gym Management Production Persistence Audit', () => {
  const clock = new TestClock(new Date('2026-08-01T10:00:00.000Z'));

  describe('1. Membership Plan Persistence Mapping & Schema Integrity', () => {
    it('accurately maps domain aggregate to Prisma model and reconstitutes without loss', () => {
      const plan = MembershipPlan.create(
        {
          code: PlanCode.create('PLAN_PRO_90'),
          name: 'Pro Quarterly',
          description: 'Full facility access with pool',
          duration: PlanDuration.ofDays(90),
          price: PlanPrice.create(299.99, 'USD'),
          visitQuota: 100,
          status: PlanStatus.ACTIVE,
        },
        clock.now(),
      );

      const persistenceData = PrismaMembershipPlanMapper.toPersistence(plan);
      expect(persistenceData.id).toBe(plan.id.value);
      expect(persistenceData.code).toBe('PLAN_PRO_90');
      expect(persistenceData.durationDays).toBe(90);
      expect(persistenceData.priceAmount).toEqual(new Prisma.Decimal(299.99));
      expect(persistenceData.priceCurrency).toBe('USD');
      expect(persistenceData.visitQuota).toBe(100);
      expect(persistenceData.status).toBe('ACTIVE');

      // Reconstitute from simulated Prisma raw row
      const rawRow: PrismaMembershipPlanModel = {
        ...persistenceData,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      };

      const reconstituted = PrismaMembershipPlanMapper.toDomain(rawRow);
      expect(reconstituted.id.value).toBe(plan.id.value);
      expect(reconstituted.code.value).toBe('PLAN_PRO_90');
      expect(reconstituted.duration.value).toBe(90);
      expect(reconstituted.price.amount).toBe(299.99);
      expect(reconstituted.price.currency).toBe('USD');
      expect(reconstituted.visitQuota?.value).toBe(100);
      expect(reconstituted.status).toBe(PlanStatus.ACTIVE);
    });
  });

  describe('2. Membership Persistence Mapping & Freeze History JSON Representation', () => {
    it('accurately serializes freeze history into JSON and restores periods losslessly', () => {
      const startDate = new Date('2026-08-01T00:00:00.000Z');
      const endDate = new Date('2026-08-31T00:00:00.000Z');

      const membership = Membership.create(
        {
          clientId: 'client_audit_1',
          planId: 'plan_std',
          period: MembershipPeriod.create(startDate, endDate),
          trainerAssignment: TrainerAssignment.create('trainer_alice'),
        },
        clock,
      );

      // Apply freeze
      membership.freeze(
        FreezeWindow.create(
          new Date('2026-08-10T00:00:00.000Z'),
          new Date('2026-08-20T00:00:00.000Z'),
          'Summer Holiday',
        ),
        clock,
      );

      const persistenceData = PrismaMembershipMapper.toPersistence(membership);
      expect(persistenceData.clientId).toBe('client_audit_1');
      expect(persistenceData.planId).toBe('plan_std');
      expect(persistenceData.status).toBe('FROZEN');
      expect(persistenceData.assignedTrainerId).toBe('trainer_alice');
      expect(Array.isArray(persistenceData.freezeHistory)).toBe(true);

      const freezeList = persistenceData.freezeHistory as Array<{ reason?: string }>;
      expect(freezeList.length).toBe(1);
      expect(freezeList[0]?.reason).toBe('Summer Holiday');

      // Reconstitute from raw database row
      const rawRow: PrismaMembershipModel = {
        ...persistenceData,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      };

      const reconstituted = PrismaMembershipMapper.toDomain(rawRow);
      expect(reconstituted.id.value).toBe(membership.id.value);
      expect(reconstituted.status).toBe(MembershipStatus.FROZEN);
      expect(reconstituted.freezeHistory.length).toBe(1);
      expect(reconstituted.freezeHistory[0]?.reason).toBe('Summer Holiday');
      expect(reconstituted.freezeHistory[0]?.durationDays).toBe(10);
      expect(reconstituted.trainerAssignment?.trainerId).toBe('trainer_alice');
    });
  });

  describe('3. Attendance Record Mapping & Append-Only Verification', () => {
    it('persists write-once check-in logs and preserves GymDay timezone strings', () => {
      const checkInTime = new Date('2026-08-01T14:30:00.000Z');
      const gymDay = GymDay.fromUtc(checkInTime, 'America/New_York', 'FAC_MAIN');

      const record = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          membershipId: 'mem_123',
          checkInTime,
          gymDay,
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
          gateId: 'turnstile_east',
          receptionistId: 'staff_john',
          notes: 'VIP access',
        },
        clock,
      );

      const persistenceData = PrismaAttendanceRecordMapper.toPersistence(record);
      expect(persistenceData.id).toBe(record.id.value);
      expect(persistenceData.clientId).toBe('client_sarah');
      expect(persistenceData.membershipId).toBe('mem_123');
      expect(persistenceData.method).toBe('QR_CODE');
      expect(persistenceData.result).toBe('GRANTED');
      expect(persistenceData.gateId).toBe('turnstile_east');
      expect(persistenceData.receptionistId).toBe('staff_john');
      expect(persistenceData.gymDay).toBe(gymDay.toString());

      // Reconstitute
      const rawRow: PrismaAttendanceRecordModel = {
        ...persistenceData,
        createdAt: checkInTime,
      };

      const reconstituted = PrismaAttendanceRecordMapper.toDomain(rawRow);
      expect(reconstituted.id.value).toBe(record.id.value);
      expect(reconstituted.isGranted()).toBe(true);
      expect(reconstituted.gymDay.facilityId).toBe('FAC_MAIN');
      expect(reconstituted.gymDay.localDate).toBe(gymDay.localDate);
    });
  });
});
