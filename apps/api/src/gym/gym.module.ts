import { Module } from '@nestjs/common';
import {
  MembershipRepository,
  MembershipPlanRepository,
  AttendanceRecordRepository,
  SystemClock,
  Clock,
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsHandler,
  GetExpiringMembershipsHandler,
  GetDailyAttendanceHandler,
  Membership,
  MembershipPlan,
  PlanStatus,
  AttendanceRecord,
} from '@kinergy-platform/core';
import { TrainerDashboardController } from './controllers/trainer-dashboard.controller';

// Injection tokens
export const MEMBERSHIP_REPOSITORY_TOKEN = 'MembershipRepository';
export const MEMBERSHIP_PLAN_REPOSITORY_TOKEN = 'MembershipPlanRepository';
export const ATTENDANCE_RECORD_REPOSITORY_TOKEN = 'AttendanceRecordRepository';
export const GYM_CLOCK_TOKEN = 'GymClock';

/**
 * Standard in-memory fallback repositories for Gym domain queries when persistent DB adapters are being bound.
 */
class DefaultGymMembershipRepository implements MembershipRepository {
  private readonly items = new Map<string, Membership>();

  async save(membership: Membership): Promise<void> {
    this.items.set(membership.id.value, membership);
  }

  async findById(id: string): Promise<Membership | null> {
    return this.items.get(id) ?? null;
  }

  async findByClientId(clientId: string): Promise<Membership[]> {
    return Array.from(this.items.values()).filter((m) => m.clientId === clientId);
  }

  async findByTrainerId(trainerId: string): Promise<Membership[]> {
    return Array.from(this.items.values()).filter(
      (m) => m.trainerAssignment?.trainerId === trainerId,
    );
  }

  async findExpiringCandidates(asOfDate: Date): Promise<Membership[]> {
    return Array.from(this.items.values()).filter((m) => m.period.endDate <= asOfDate);
  }

  async findExpiringWithinHorizon(asOfDate: Date, horizonDays: number): Promise<Membership[]> {
    const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
    return Array.from(this.items.values()).filter((m) => {
      const diffMs = m.period.endDate.getTime() - asOfDate.getTime();
      return diffMs > 0 && diffMs <= horizonMs;
    });
  }

  async findAll(): Promise<Membership[]> {
    return Array.from(this.items.values());
  }
}

class DefaultGymPlanRepository implements MembershipPlanRepository {
  private readonly items = new Map<string, MembershipPlan>();

  async save(plan: MembershipPlan): Promise<void> {
    this.items.set(plan.id.value, plan);
  }

  async findById(id: string): Promise<MembershipPlan | null> {
    return this.items.get(id) ?? null;
  }

  async findByCode(code: string): Promise<MembershipPlan | null> {
    return Array.from(this.items.values()).find((p) => p.code.value === code) ?? null;
  }

  async findActive(): Promise<MembershipPlan[]> {
    return Array.from(this.items.values()).filter((p) => p.status === PlanStatus.ACTIVE);
  }
}

class DefaultGymAttendanceRepository implements AttendanceRecordRepository {
  private readonly items: AttendanceRecord[] = [];

  async append(record: AttendanceRecord): Promise<void> {
    this.items.push(record);
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    return this.items.find((r) => r.id.value === id) ?? null;
  }

  async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const list = this.items.filter((r) => r.clientId === clientId);
    return limit ? list.slice(0, limit) : list;
  }

  async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    return this.items.filter((r) => r.clientId === clientId && r.checkInTime >= since);
  }

  async findByGymDay(gymDay: string): Promise<AttendanceRecord[]> {
    return this.items.filter((r) => r.gymDay.toString() === gymDay);
  }

  async countGrantedByGymDay(gymDay: string): Promise<number> {
    return this.items.filter((r) => r.gymDay.toString() === gymDay && r.isGranted).length;
  }

  async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    return this.items.filter(
      (r) => r.clientId === clientId && r.gymDay.toString() === gymDay && r.isGranted,
    ).length;
  }
}

@Module({
  controllers: [TrainerDashboardController],
  providers: [
    {
      provide: MEMBERSHIP_REPOSITORY_TOKEN,
      useClass: DefaultGymMembershipRepository,
    },
    {
      provide: MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
      useClass: DefaultGymPlanRepository,
    },
    {
      provide: ATTENDANCE_RECORD_REPOSITORY_TOKEN,
      useClass: DefaultGymAttendanceRepository,
    },
    {
      provide: GYM_CLOCK_TOKEN,
      useClass: SystemClock,
    },
    {
      provide: GetTrainerDashboardSummaryHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        attendanceRepo: AttendanceRecordRepository,
        clock: Clock,
      ) => new GetTrainerDashboardSummaryHandler(membershipRepo, attendanceRepo, clock),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, ATTENDANCE_RECORD_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: GetAssignedClientMembershipsHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        planRepo: MembershipPlanRepository,
        clock: Clock,
      ) => new GetAssignedClientMembershipsHandler(membershipRepo, planRepo, clock),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, MEMBERSHIP_PLAN_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: GetExpiringMembershipsHandler,
      useFactory: (membershipRepo: MembershipRepository, clock: Clock) =>
        new GetExpiringMembershipsHandler(membershipRepo, clock),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: GetDailyAttendanceHandler,
      useFactory: (attendanceRepo: AttendanceRecordRepository, clock: Clock) =>
        new GetDailyAttendanceHandler(attendanceRepo, clock),
      inject: [ATTENDANCE_RECORD_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
  ],
  exports: [
    GetTrainerDashboardSummaryHandler,
    GetAssignedClientMembershipsHandler,
    GetExpiringMembershipsHandler,
    GetDailyAttendanceHandler,
  ],
})
export class GymModule {}
