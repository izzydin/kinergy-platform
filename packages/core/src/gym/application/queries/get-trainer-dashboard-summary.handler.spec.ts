import { GetTrainerDashboardSummaryHandler } from './get-trainer-dashboard-summary.handler';
import { GetTrainerDashboardSummaryQuery } from './get-trainer-dashboard-summary.query';
import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';
import { FreezeWindow } from '../../domain/membership/freeze-window.vo';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AttendanceId } from '../../domain/attendance/attendance-id.vo';
import { GymDay } from '../../domain/attendance/gym-day.vo';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { AccessResult } from '../../domain/attendance/access-result.enum';

describe('Phase 5.6-D: Trainer Dashboard Read Model Spec', () => {
  const baseTime = new Date('2026-08-22T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let attendanceRepository: jest.Mocked<AttendanceRecordRepository>;
  let planRepository: jest.Mocked<MembershipPlanRepository>;
  let summaryHandler: GetTrainerDashboardSummaryHandler;
  let assignedHandler: GetAssignedClientMembershipsHandler;

  const trainerId = 'trainer_usr_007';

  beforeEach(() => {
    clock = new TestClock(baseTime);

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findByTrainerId: jest.fn().mockResolvedValue([]),
    };

    attendanceRepository = {
      append: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findRecentByClientId: jest.fn().mockResolvedValue([]),
      findByGymDay: jest.fn().mockResolvedValue([]),
      countGrantedByGymDay: jest.fn().mockResolvedValue(0),
      countGrantedByClientAndGymDay: jest.fn().mockResolvedValue(0),
    };

    planRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    summaryHandler = new GetTrainerDashboardSummaryHandler(
      membershipRepository,
      attendanceRepository,
      clock,
    );

    assignedHandler = new GetAssignedClientMembershipsHandler(
      membershipRepository,
      planRepository,
      clock,
    );
  });

  describe('1. Top-Line KPI Summary Calculation', () => {
    it('accurately computes total clients, active, expiring, frozen, and today check-ins', async () => {
      // Setup 3 memberships:
      // 1. Alice: ACTIVE, expiring in 3 days (within 7 day horizon)
      const aliceMem = Membership.reconstitute({
        id: MembershipId.create('mem_alice'),
        clientId: 'client_alice',
        planId: 'plan_std',
        period: MembershipPeriod.create(
          new Date('2026-07-25T00:00:00.000Z'),
          new Date('2026-08-25T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
        trainerAssignment: TrainerAssignment.create(
          trainerId,
          new Date('2026-07-25T00:00:00.000Z'),
        ),
        version: 1,
        createdAt: new Date('2026-07-25T00:00:00.000Z'),
        updatedAt: new Date('2026-07-25T00:00:00.000Z'),
      });

      // 2. Bob: ACTIVE, expiring in 20 days (not expiring soon)
      const bobMem = Membership.reconstitute({
        id: MembershipId.create('mem_bob'),
        clientId: 'client_bob',
        planId: 'plan_std',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-11T00:00:00.000Z'),
        ),
        status: MembershipStatus.ACTIVE,
        trainerAssignment: TrainerAssignment.create(
          trainerId,
          new Date('2026-08-01T00:00:00.000Z'),
        ),
        version: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      // 3. Charlie: FROZEN (freeze window active today)
      const charlieMem = Membership.reconstitute({
        id: MembershipId.create('mem_charlie'),
        clientId: 'client_charlie',
        planId: 'plan_std',
        period: MembershipPeriod.create(
          new Date('2026-08-01T00:00:00.000Z'),
          new Date('2026-09-01T00:00:00.000Z'),
        ),
        status: MembershipStatus.FROZEN,
        freezeHistory: [
          FreezeWindow.create(
            new Date('2026-08-15T00:00:00.000Z'),
            new Date('2026-08-30T00:00:00.000Z'),
            'Travel',
          ),
        ],
        trainerAssignment: TrainerAssignment.create(
          trainerId,
          new Date('2026-08-01T00:00:00.000Z'),
        ),
        version: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      membershipRepository.findByTrainerId = jest
        .fn()
        .mockResolvedValue([aliceMem, bobMem, charlieMem]);

      // Today's attendance records:
      // Alice (assigned, granted) -> counted
      // Unassigned Dave (granted) -> NOT counted for this trainer
      // Bob (assigned, denied) -> NOT counted
      const aliceCheckIn = AttendanceRecord.reconstitute({
        id: AttendanceId.create('att_1'),
        clientId: 'client_alice',
        membershipId: 'mem_alice',
        checkInTime: new Date('2026-08-22T08:30:00.000Z'),
        gymDay: GymDay.fromUtc(baseTime, 'UTC', 'main'),
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
        gateId: 'gate_1',
        receptionistId: null,
        notes: null,
        createdAt: new Date('2026-08-22T08:30:00.000Z'),
      });

      const daveCheckIn = AttendanceRecord.reconstitute({
        id: AttendanceId.create('att_2'),
        clientId: 'client_dave_unassigned',
        membershipId: 'mem_dave',
        checkInTime: new Date('2026-08-22T09:00:00.000Z'),
        gymDay: GymDay.fromUtc(baseTime, 'UTC', 'main'),
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
        gateId: 'gate_1',
        receptionistId: null,
        notes: null,
        createdAt: new Date('2026-08-22T09:00:00.000Z'),
      });

      const bobDenied = AttendanceRecord.reconstitute({
        id: AttendanceId.create('att_3'),
        clientId: 'client_bob',
        membershipId: 'mem_bob',
        checkInTime: new Date('2026-08-22T09:30:00.000Z'),
        gymDay: GymDay.fromUtc(baseTime, 'UTC', 'main'),
        method: CheckInMethod.RFID,
        result: AccessResult.DENIED_EXPIRED,
        gateId: 'gate_1',
        receptionistId: null,
        notes: null,
        createdAt: new Date('2026-08-22T09:30:00.000Z'),
      });

      attendanceRepository.findByGymDay.mockResolvedValue([aliceCheckIn, daveCheckIn, bobDenied]);

      const query = new GetTrainerDashboardSummaryQuery({ trainerId });
      const result = await summaryHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const summary = result.getValue();

      expect(summary.trainerId).toBe(trainerId);
      expect(summary.totalAssignedClients).toBe(3);
      expect(summary.activeMembershipsCount).toBe(2);
      expect(summary.expiringMembershipsCount).toBe(1); // Alice
      expect(summary.frozenMembershipsCount).toBe(1); // Charlie
      expect(summary.todayCheckInsCount).toBe(1); // Only Alice
    });

    it('returns zeroes for trainer with 0 assigned clients without error', async () => {
      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue([]);

      const query = new GetTrainerDashboardSummaryQuery({ trainerId: 'new_trainer' });
      const result = await summaryHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const summary = result.getValue();
      expect(summary.totalAssignedClients).toBe(0);
      expect(summary.activeMembershipsCount).toBe(0);
      expect(summary.expiringMembershipsCount).toBe(0);
      expect(summary.frozenMembershipsCount).toBe(0);
      expect(summary.todayCheckInsCount).toBe(0);
    });

    it('rejects empty trainerId', async () => {
      const query = new GetTrainerDashboardSummaryQuery({ trainerId: '' });
      const result = await summaryHandler.execute(query);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain('Trainer ID cannot be empty');
    });
  });

  describe('2. Deterministic Pagination and Sorting in Assigned Clients Query', () => {
    it('supports paginating and sorting assigned clients deterministically', async () => {
      const mems: Membership[] = [];
      for (let i = 1; i <= 10; i++) {
        mems.push(
          Membership.reconstitute({
            id: MembershipId.create(`mem_${i}`),
            clientId: `client_${i}`,
            planId: 'plan_std',
            period: MembershipPeriod.create(
              new Date('2026-08-01T00:00:00.000Z'),
              new Date(`2026-08-${(10 + i).toString().padStart(2, '0')}T00:00:00.000Z`),
            ),
            status: MembershipStatus.ACTIVE,
            trainerAssignment: TrainerAssignment.create(
              trainerId,
              new Date('2026-08-01T00:00:00.000Z'),
            ),
            version: 1,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          }),
        );
      }

      membershipRepository.findByTrainerId = jest.fn().mockResolvedValue(mems);

      // Query page 2 with limit 3, sorted by endDate ASC
      const query = new GetAssignedClientMembershipsQuery({
        trainerId,
        page: 2,
        limit: 3,
        sortBy: 'endDate',
        sortOrder: 'ASC',
      });

      const result = await assignedHandler.execute(query);
      expect(result.isSuccess).toBe(true);
      const pageItems = result.getValue();

      expect(pageItems).toHaveLength(3);
      expect(pageItems[0]?.membershipId).toBe('mem_4');
      expect(pageItems[1]?.membershipId).toBe('mem_5');
      expect(pageItems[2]?.membershipId).toBe('mem_6');
    });
  });
});
