import { GetAssignedClientMembershipsHandler } from './get-assigned-client-memberships.handler';
import { GetAssignedClientMembershipsQuery } from './get-assigned-client-memberships.query';
import { GetDailyAttendanceHandler } from './get-daily-attendance.handler';
import { GetDailyAttendanceQuery } from './get-daily-attendance.query';
import { MembershipRepository } from '../../domain/repositories/membership.repository';
import { MembershipPlanRepository } from '../../domain/repositories/membership-plan.repository';
import { AttendanceRecordRepository } from '../../domain/repositories/attendance-record.repository';
import { TestClock } from '../../domain/shared/clock';
import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipPeriod } from '../../domain/membership/membership-period.vo';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';
import { MembershipId } from '../../domain/membership/membership-id.vo';
import { TrainerAssignment } from '../../domain/membership/trainer-assignment.vo';
import { MembershipPlan } from '../../domain/plan/membership-plan.aggregate';
import { PlanId } from '../../domain/plan/plan-id.vo';
import { PlanCode } from '../../domain/plan/plan-code.vo';
import { PlanDuration } from '../../domain/plan/plan-duration.vo';
import { PlanPrice } from '../../domain/plan/plan-price.vo';
import { PlanStatus } from '../../domain/plan/plan-status.enum';
import { AttendanceRecord } from '../../domain/attendance/attendance-record.aggregate';
import { AttendanceId } from '../../domain/attendance/attendance-id.vo';
import { AccessResult } from '../../domain/attendance/access-result.enum';
import { CheckInMethod } from '../../domain/attendance/check-in-method.enum';
import { GymDay } from '../../domain/attendance/gym-day.vo';

describe('Phase 5.6-B: Trainer Authorization, Context Boundaries & Data Isolation Security Spec', () => {
  const baseTime = new Date('2026-08-22T10:00:00.000Z');
  let clock: TestClock;
  let membershipRepository: jest.Mocked<MembershipRepository>;
  let planRepository: jest.Mocked<MembershipPlanRepository>;
  let attendanceRepository: jest.Mocked<AttendanceRecordRepository>;
  let assignedHandler: GetAssignedClientMembershipsHandler;
  let attendanceHandler: GetDailyAttendanceHandler;

  const trainerAlice = 'usr_trainer_alice';
  const trainerBob = 'usr_trainer_bob';

  const planId = 'plan_std_01';

  const createMembership = (id: string, clientId: string, trainerId: string): Membership => {
    return Membership.reconstitute({
      id: MembershipId.create(id),
      clientId,
      planId,
      period: MembershipPeriod.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ),
      status: MembershipStatus.ACTIVE,
      trainerAssignment: TrainerAssignment.create(trainerId, new Date('2026-08-01T00:00:00.000Z')),
      version: 1,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  };

  beforeEach(() => {
    clock = new TestClock(baseTime);

    const memAlice1 = createMembership('mem_a1', 'client_alice_01', trainerAlice);
    const memAlice2 = createMembership('mem_a2', 'client_alice_02', trainerAlice);
    const memBob1 = createMembership('mem_b1', 'client_bob_01', trainerBob);

    membershipRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findExpiringCandidates: jest.fn().mockResolvedValue([]),
      findExpiringWithinHorizon: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([memAlice1, memAlice2, memBob1]),
      findByTrainerId: jest.fn().mockImplementation(async (tid: string) => {
        if (tid === trainerAlice) return [memAlice1, memAlice2];
        if (tid === trainerBob) return [memBob1];
        return [];
      }),
    };

    planRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(
        MembershipPlan.reconstitute({
          id: PlanId.create(planId),
          code: PlanCode.create('STD_01'),
          name: 'Standard Membership Plan',
          duration: PlanDuration.ofDays(30),
          price: PlanPrice.create(9900, 'USD'),
          status: PlanStatus.ACTIVE,
          version: 1,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }),
      ),
      findByCode: jest.fn(),
      findActive: jest.fn().mockResolvedValue([]),
    };

    const recordAlice = AttendanceRecord.reconstitute({
      id: AttendanceId.create('att_01'),
      clientId: 'client_alice_01',
      membershipId: 'mem_a1',
      checkInTime: new Date('2026-08-22T08:00:00.000Z'),
      gymDay: GymDay.fromUtc(baseTime, 'UTC', 'main'),
      method: CheckInMethod.RFID,
      result: AccessResult.GRANTED,
      gateId: 'main',
      receptionistId: null,
      notes: null,
      createdAt: new Date('2026-08-22T08:00:00.000Z'),
    });

    const recordBob = AttendanceRecord.reconstitute({
      id: AttendanceId.create('att_02'),
      clientId: 'client_bob_01',
      membershipId: 'mem_b1',
      checkInTime: new Date('2026-08-22T08:15:00.000Z'),
      gymDay: GymDay.fromUtc(baseTime, 'UTC', 'main'),
      method: CheckInMethod.RFID,
      result: AccessResult.GRANTED,
      gateId: 'main',
      receptionistId: null,
      notes: null,
      createdAt: new Date('2026-08-22T08:15:00.000Z'),
    });

    attendanceRepository = {
      append: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByClientId: jest.fn().mockResolvedValue([]),
      findRecentByClientId: jest.fn().mockResolvedValue([]),
      findByGymDay: jest.fn().mockResolvedValue([recordAlice, recordBob]),
      countGrantedByGymDay: jest.fn().mockResolvedValue(2),
      countGrantedByClientAndGymDay: jest.fn().mockResolvedValue(1),
    };

    assignedHandler = new GetAssignedClientMembershipsHandler(
      membershipRepository,
      planRepository,
      clock,
    );

    attendanceHandler = new GetDailyAttendanceHandler(attendanceRepository, clock);
  });

  describe('1. Horizontal Data Isolation Between Trainers', () => {
    it('only returns Trainer Alice assigned clients when queried for Trainer Alice', async () => {
      const query = new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.clientId)).toEqual(['client_alice_01', 'client_alice_02']);
      expect(items.some((i) => i.clientId === 'client_bob_01')).toBe(false);
    });

    it('only returns Trainer Bob assigned clients when queried for Trainer Bob', async () => {
      const query = new GetAssignedClientMembershipsQuery({ trainerId: trainerBob });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(1);
      expect(items[0]?.clientId).toBe('client_bob_01');
      expect(items.some((i) => i.clientId.startsWith('client_alice'))).toBe(false);
    });

    it('returns empty list for a Trainer with zero assigned clients without leaking other records', async () => {
      const query = new GetAssignedClientMembershipsQuery({
        trainerId: 'usr_new_trainer_unassigned',
      });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const items = result.getValue();
      expect(items).toHaveLength(0);
    });
  });

  describe('2. Financial & Commercial Data Masking (Least Privilege)', () => {
    it('omits PlanPrice.amount and currency from all returned AssignedClientMembershipDTO items', async () => {
      const query = new GetAssignedClientMembershipsQuery({ trainerId: trainerAlice });
      const result = await assignedHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const item = result.getValue()[0];
      expect(item).toBeDefined();

      // Verify commercial details are not exposed
      const record = item as unknown as Record<string, unknown>;
      expect(record['price']).toBeUndefined();
      expect(record['amount']).toBeUndefined();
      expect(record['currency']).toBeUndefined();

      // Verify safe operational fields are present
      expect(item?.planName).toBe('Standard Membership Plan');
      expect(item?.daysRemaining).toBe(10);
      expect(item?.status).toBe(MembershipStatus.ACTIVE);
    });
  });

  describe('3. Attendance Scoping by Assigned Client IDs', () => {
    it('scopes today attendance feed strictly to assigned clients when whitelist is provided', async () => {
      // Alice only has client_alice_01 and client_alice_02
      const query = new GetDailyAttendanceQuery({
        assignedClientIds: ['client_alice_01', 'client_alice_02'],
      });

      const result = await attendanceHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.items).toHaveLength(1);
      expect(data.items[0]?.clientId).toBe('client_alice_01');
      expect(data.items.some((i) => i.clientId === 'client_bob_01')).toBe(false);
    });

    it('returns empty attendance feed when assigned clients have not visited today', async () => {
      const query = new GetDailyAttendanceQuery({
        assignedClientIds: ['client_unvisited_01'],
      });

      const result = await attendanceHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toHaveLength(0);
    });
  });
});
