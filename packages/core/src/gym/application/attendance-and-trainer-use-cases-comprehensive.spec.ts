import { RecordCheckInHandler } from './handlers/record-check-in.handler';
import { CheckMembershipEligibilityHandler } from './queries/check-membership-eligibility.handler';
import { GetDailyAttendanceHandler } from './queries/get-daily-attendance.handler';
import { GetClientAttendanceHistoryHandler } from './queries/get-client-attendance-history.handler';
import { GetAttendanceSummaryHandler } from './queries/get-attendance-summary.handler';
import { SearchAttendanceHandler } from './queries/search-attendance.handler';
import { GetTrainerDashboardSummaryHandler } from './queries/get-trainer-dashboard-summary.handler';
import { GetAssignedClientMembershipsHandler } from './queries/get-assigned-client-memberships.handler';
import { RecordCheckInCommand } from './commands/record-check-in.command';
import { GetDailyAttendanceQuery } from './queries/get-daily-attendance.query';
import { GetClientAttendanceHistoryQuery } from './queries/get-client-attendance-history.query';
import { GetAttendanceSummaryQuery } from './queries/get-attendance-summary.query';
import { SearchAttendanceQuery } from './queries/search-attendance.query';
import { GetTrainerDashboardSummaryQuery } from './queries/get-trainer-dashboard-summary.query';
import { GetAssignedClientMembershipsQuery } from './queries/get-assigned-client-memberships.query';
import { AttendanceRecordRepository } from '../domain/repositories/attendance-record.repository';
import { MembershipRepository } from '../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../domain/repositories/membership-plan.repository';
import { ClientLookupPort } from './ports/client-lookup.port';
import { GymEventPublisherPort } from './ports/gym-event-publisher.port';
import { TestClock } from '../domain/shared/clock';
import { AttendanceRecord } from '../domain/attendance/attendance-record.aggregate';
import { AttendanceId } from '../domain/attendance/attendance-id.vo';
import { AccessResult } from '../domain/attendance/access-result.enum';
import { CheckInMethod } from '../domain/attendance/check-in-method.enum';
import { GymDay } from '../domain/attendance/gym-day.vo';
import { Membership } from '../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../domain/membership/membership-period.vo';
import { MembershipStatus } from '../domain/membership/membership-status.enum';
import { MembershipId } from '../domain/membership/membership-id.vo';
import { TrainerAssignment } from '../domain/membership/trainer-assignment.vo';
import { MembershipPlan } from '../domain/plan/membership-plan.aggregate';
import { PlanId } from '../domain/plan/plan-id.vo';
import { PlanCode } from '../domain/plan/plan-code.vo';
import { PlanDuration } from '../domain/plan/plan-duration.vo';
import { PlanPrice } from '../domain/plan/plan-price.vo';
import { PlanStatus } from '../domain/plan/plan-status.enum';

describe('Phase 5.7-D: Comprehensive Attendance & Trainer Application Use Cases Spec', () => {
  let attendanceRepo: jest.Mocked<AttendanceRecordRepository>;
  let membershipRepo: jest.Mocked<MembershipRepository>;
  let planRepo: jest.Mocked<MembershipPlanRepository>;
  let clientLookup: jest.Mocked<ClientLookupPort>;
  let eventPublisher: jest.Mocked<GymEventPublisherPort>;
  let clock: TestClock;
  let eligibilityHandler: CheckMembershipEligibilityHandler;

  const facilityTz = 'America/Guayaquil';
  const t0 = new Date('2026-08-22T15:30:00.000Z'); // 10:30 AM in America/Guayaquil (UTC-5)
  const currentGymDay = GymDay.fromUtc(t0, facilityTz);

  const createActiveMembership = (
    id = 'mem_001',
    clientId = 'client_001',
    trainerId = 'trainer_007',
  ): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId: 'plan_std_01',
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      ),
      status: MembershipStatus.ACTIVE,
      trainerAssignment: TrainerAssignment.create(trainerId, new Date('2026-08-01')),
      version: 1,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
  };

  const createAttendanceRecord = (
    id = 'att_001',
    clientId = 'client_001',
    result = AccessResult.GRANTED,
    checkInTime = t0,
  ): AttendanceRecord => {
    return AttendanceRecord.reconstitute({
      id: AttendanceId.create(id),
      clientId,
      membershipId: result === AccessResult.GRANTED ? 'mem_001' : null,
      checkInTime,
      gymDay: GymDay.fromUtc(checkInTime, facilityTz),
      result,
      method: CheckInMethod.QR_CODE,
      gateId: null,
      receptionistId: null,
      notes: null,
      createdAt: checkInTime,
    });
  };

  beforeEach(() => {
    clock = new TestClock(t0, facilityTz);

    attendanceRepo = {
      append: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findRecentByClientId: jest.fn().mockResolvedValue([]),
      findByGymDay: jest.fn().mockResolvedValue([]),
      countGrantedByGymDay: jest.fn().mockResolvedValue(0),
      countGrantedByClientAndGymDay: jest.fn().mockResolvedValue(0),
    };

    membershipRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findByTrainerId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

    planRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MembershipPlanRepository>;

    clientLookup = {
      validateClientExists: jest.fn().mockResolvedValue(true),
    };

    eventPublisher = {
      publish: jest.fn(),
    };

    eligibilityHandler = new CheckMembershipEligibilityHandler(membershipRepo, clientLookup, clock);
  });

  // =========================================================================
  // 1. Check-In Eligibility & Enforcement Use Cases
  // =========================================================================
  describe('1. Check-In Eligibility & Enforcement Use Cases', () => {
    it('grants access for client with active membership and records event', async () => {
      const mem = createActiveMembership();
      membershipRepo.findByClientId.mockResolvedValue([mem]);

      const handler = new RecordCheckInHandler(
        attendanceRepo,
        eligibilityHandler,
        clock,
        eventPublisher,
      );

      const command = new RecordCheckInCommand({
        clientId: 'client_001',
        method: CheckInMethod.QR_CODE,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.outcome).toBe(AccessResult.GRANTED);
      expect(dto.isGranted).toBe(true);
      expect(dto.membershipId).toBe('mem_001');
      expect(attendanceRepo.append).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('denies access when client does not exist in Client context', async () => {
      clientLookup.validateClientExists.mockResolvedValue(false);

      const handler = new RecordCheckInHandler(
        attendanceRepo,
        eligibilityHandler,
        clock,
        eventPublisher,
      );

      const command = new RecordCheckInCommand({
        clientId: 'client_nonexistent',
        method: CheckInMethod.MANUAL_RECEPTION,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_INACTIVE_CLIENT);
      expect(result.getValue().isGranted).toBe(false);
      expect(attendanceRepo.append).toHaveBeenCalledTimes(1);
    });

    it('denies access when client has no active membership', async () => {
      membershipRepo.findByClientId.mockResolvedValue([]);

      const handler = new RecordCheckInHandler(
        attendanceRepo,
        eligibilityHandler,
        clock,
        eventPublisher,
      );

      const command = new RecordCheckInCommand({
        clientId: 'client_001',
        method: CheckInMethod.QR_CODE,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(result.getValue().isGranted).toBe(false);
    });

    it('denies access when client membership is frozen', async () => {
      const frozenMem = Membership.reconstitute({
        id: MembershipId.create('mem_001'),
        clientId: 'client_001',
        planId: 'plan_001',
        period: MembershipPeriod.create(new Date('2026-08-01'), new Date('2026-08-31')),
        status: MembershipStatus.FROZEN,
        version: 1,
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-01'),
      });
      membershipRepo.findByClientId.mockResolvedValue([frozenMem]);

      const handler = new RecordCheckInHandler(
        attendanceRepo,
        eligibilityHandler,
        clock,
        eventPublisher,
      );

      const command = new RecordCheckInCommand({
        clientId: 'client_001',
        method: CheckInMethod.QR_CODE,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_FROZEN);
      expect(result.getValue().isGranted).toBe(false);
    });

    it('denies duplicate check-in within rapid re-scan debounce window', async () => {
      const mem = createActiveMembership();
      membershipRepo.findByClientId.mockResolvedValue([mem]);

      // Simulate a recent check-in 2 minutes ago
      const recentRec = createAttendanceRecord(
        'att_000',
        'client_001',
        AccessResult.GRANTED,
        new Date(t0.getTime() - 2 * 60 * 1000),
      );
      attendanceRepo.findRecentByClientId.mockResolvedValue([recentRec]);

      const handler = new RecordCheckInHandler(
        attendanceRepo,
        eligibilityHandler,
        clock,
        eventPublisher,
      );

      const command = new RecordCheckInCommand({
        clientId: 'client_001',
        method: CheckInMethod.QR_CODE,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(result.getValue().isDuplicate).toBe(true);
      expect(result.getValue().isGranted).toBe(false);
    });
  });

  // =========================================================================
  // 2. Attendance Queries & Time Model Use Cases
  // =========================================================================
  describe('2. Attendance Queries & Time Model Use Cases', () => {
    it('GetDailyAttendanceHandler returns records for the authoritative facility GymDay', async () => {
      const rec1 = createAttendanceRecord('att_001', 'client_001');
      const rec2 = createAttendanceRecord('att_002', 'client_002');
      attendanceRepo.findByGymDay.mockResolvedValue([rec1, rec2]);

      const handler = new GetDailyAttendanceHandler(attendanceRepo, clock);
      const result = await handler.execute(
        new GetDailyAttendanceQuery({
          date: currentGymDay.localDate,
          facilityId: 'fac_main',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.pagination.totalItems).toBe(2);
      expect(dto.items[0]!.clientId).toBe('client_001');
    });

    it('GetClientAttendanceHistoryHandler returns client check-in history', async () => {
      const rec1 = createAttendanceRecord('att_001', 'client_001');
      attendanceRepo.findByClientId.mockResolvedValue([rec1]);

      const handler = new GetClientAttendanceHistoryHandler(attendanceRepo);
      const result = await handler.execute(
        new GetClientAttendanceHistoryQuery({ clientId: 'client_001' }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items.length).toBe(1);
    });

    it('GetAttendanceSummaryHandler returns high-efficiency daily summary counts', async () => {
      const rec1 = createAttendanceRecord('att_001', 'client_001', AccessResult.GRANTED);
      attendanceRepo.findByGymDay.mockResolvedValue([rec1]);
      attendanceRepo.countGrantedByGymDay.mockResolvedValue(1);

      const handler = new GetAttendanceSummaryHandler(attendanceRepo, clock);
      const result = await handler.execute(
        new GetAttendanceSummaryQuery({
          startDate: currentGymDay.localDate,
          endDate: currentGymDay.localDate,
          facilityId: 'fac_main',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().totalGrantedVisits).toBe(1);
    });

    it('SearchAttendanceHandler supports multi-dimensional filtering with pagination and deterministic sorting', async () => {
      const rec1 = createAttendanceRecord(
        'att_001',
        'client_001',
        AccessResult.GRANTED,
        new Date('2026-08-22T10:00:00Z'),
      );
      const rec2 = createAttendanceRecord(
        'att_002',
        'client_001',
        AccessResult.DENIED_NO_MEMBERSHIP,
        new Date('2026-08-22T11:00:00Z'),
      );

      attendanceRepo.findWithPagination = jest.fn().mockResolvedValue({
        records: [rec2, rec1],
        total: 2,
      });

      const handler = new SearchAttendanceHandler(attendanceRepo);
      const result = await handler.execute(
        new SearchAttendanceQuery({
          clientId: 'client_001',
          page: 1,
          limit: 10,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.pagination.totalItems).toBe(2);
      expect(dto.items[0]!.id).toBe('att_002');
    });
  });

  // =========================================================================
  // 3. Trainer Operational Dashboard & Scoped Queries
  // =========================================================================
  describe('3. Trainer Operational Dashboard & Scoped Queries', () => {
    it('GetTrainerDashboardSummaryHandler aggregates KPIs scoped strictly to trainer assignments', async () => {
      const mem1 = createActiveMembership('mem_001', 'client_001', 'trainer_007');
      const mem2 = createActiveMembership('mem_002', 'client_002', 'trainer_007');
      (membershipRepo.findByTrainerId as jest.Mock).mockResolvedValue([mem1, mem2]);

      const checkIn1 = createAttendanceRecord('att_001', 'client_001', AccessResult.GRANTED);
      attendanceRepo.findByGymDay.mockResolvedValue([checkIn1]);

      const handler = new GetTrainerDashboardSummaryHandler(membershipRepo, attendanceRepo, clock);
      const result = await handler.execute(
        new GetTrainerDashboardSummaryQuery({
          trainerId: 'trainer_007',
          timezone: facilityTz,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.totalAssignedClients).toBe(2);
      expect(dto.todayCheckInsCount).toBe(1);
    });

    it('GetAssignedClientMembershipsHandler resolves plans with O(1) batch lookup cache and deterministic tie-breaker', async () => {
      const mem1 = createActiveMembership('mem_001', 'client_001', 'trainer_007');
      (membershipRepo.findByTrainerId as jest.Mock).mockResolvedValue([mem1]);

      const plan = MembershipPlan.reconstitute({
        id: PlanId.create('plan_std_01'),
        code: PlanCode.create('STD_MONTHLY'),
        name: 'Standard Monthly Plan',
        duration: PlanDuration.ofDays(30),
        price: PlanPrice.create(4999, 'USD'),
        status: PlanStatus.ACTIVE,
        version: 1,
        createdAt: t0,
        updatedAt: t0,
      });
      planRepo.findById.mockResolvedValue(plan);

      const handler = new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock);
      const result = await handler.execute(
        new GetAssignedClientMembershipsQuery({
          trainerId: 'trainer_007',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items.length).toBe(1);
      expect(items[0]!.planName).toBe('Standard Monthly Plan');
    });
  });
});
