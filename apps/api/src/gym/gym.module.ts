import { Module } from '@nestjs/common';
import {
  MembershipRepository,
  MembershipPlanRepository,
  AttendanceRecordRepository,
  SystemClock,
  Clock,
  ClientLookupPort,
  GymEventPublisherPort,
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsHandler,
  GetExpiringMembershipsHandler,
  GetDailyAttendanceHandler,
  GetClientAttendanceHistoryHandler,
  GetAttendanceSummaryHandler,
  SearchAttendanceHandler,
  CreateMembershipPlanHandler,
  UpdateMembershipPlanPricingHandler,
  PublishMembershipPlanHandler,
  ArchiveMembershipPlanHandler,
  GetMembershipPlanByIdHandler,
  ListMembershipPlansHandler,
  CreateMembershipHandler,
  RenewMembershipHandler,
  FreezeMembershipHandler,
  UnfreezeMembershipHandler,
  CancelMembershipHandler,
  ExpireMembershipsHandler,
  GetMembershipByIdHandler,
  ListMembershipsHandler,
  ListExpiredMembershipsHandler,
  CheckMembershipEligibilityHandler,
  RecordCheckInHandler,
  Membership,
  MembershipPlan,
  PlanStatus,
  AttendanceRecord,
  GymDomainEvent,
} from '@kinergy-platform/core';
import {
  TrainerDashboardController,
  MembershipPlansController,
  MembershipsController,
  AttendanceController,
} from './controllers';

// Injection tokens
export const MEMBERSHIP_REPOSITORY_TOKEN = 'MembershipRepository';
export const MEMBERSHIP_PLAN_REPOSITORY_TOKEN = 'MembershipPlanRepository';
export const ATTENDANCE_RECORD_REPOSITORY_TOKEN = 'AttendanceRecordRepository';
export const GYM_CLOCK_TOKEN = 'GymClock';
export const CLIENT_LOOKUP_PORT_TOKEN = 'ClientLookupPort';
export const GYM_EVENT_PUBLISHER_PORT_TOKEN = 'GymEventPublisherPort';

/**
 * In-memory repository fallback implementations for standalone execution.
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

  async findAll(): Promise<MembershipPlan[]> {
    return Array.from(this.items.values());
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

class DefaultClientLookupPort implements ClientLookupPort {
  async validateClientExists(_clientId: string): Promise<boolean> {
    return true;
  }
}

class DefaultGymEventPublisherPort implements GymEventPublisherPort {
  async publish(_events: ReadonlyArray<GymDomainEvent>): Promise<void> {}
}

@Module({
  controllers: [
    TrainerDashboardController,
    MembershipPlansController,
    MembershipsController,
    AttendanceController,
  ],
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
      provide: CLIENT_LOOKUP_PORT_TOKEN,
      useClass: DefaultClientLookupPort,
    },
    {
      provide: GYM_EVENT_PUBLISHER_PORT_TOKEN,
      useClass: DefaultGymEventPublisherPort,
    },

    // Plan Handlers
    {
      provide: CreateMembershipPlanHandler,
      useFactory: (
        planRepo: MembershipPlanRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new CreateMembershipPlanHandler(planRepo, clock, publisher),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: UpdateMembershipPlanPricingHandler,
      useFactory: (
        planRepo: MembershipPlanRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new UpdateMembershipPlanPricingHandler(planRepo, clock, publisher),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: PublishMembershipPlanHandler,
      useFactory: (
        planRepo: MembershipPlanRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new PublishMembershipPlanHandler(planRepo, clock, publisher),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: ArchiveMembershipPlanHandler,
      useFactory: (
        planRepo: MembershipPlanRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new ArchiveMembershipPlanHandler(planRepo, clock, publisher),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: GetMembershipPlanByIdHandler,
      useFactory: (planRepo: MembershipPlanRepository) =>
        new GetMembershipPlanByIdHandler(planRepo),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN],
    },
    {
      provide: ListMembershipPlansHandler,
      useFactory: (planRepo: MembershipPlanRepository) => new ListMembershipPlansHandler(planRepo),
      inject: [MEMBERSHIP_PLAN_REPOSITORY_TOKEN],
    },

    // Membership Handlers
    {
      provide: CreateMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        planRepo: MembershipPlanRepository,
        clientLookup: ClientLookupPort,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new CreateMembershipHandler(membershipRepo, planRepo, clientLookup, clock, publisher),
      inject: [
        MEMBERSHIP_REPOSITORY_TOKEN,
        MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
        CLIENT_LOOKUP_PORT_TOKEN,
        GYM_CLOCK_TOKEN,
        GYM_EVENT_PUBLISHER_PORT_TOKEN,
      ],
    },
    {
      provide: RenewMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        planRepo: MembershipPlanRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new RenewMembershipHandler(membershipRepo, planRepo, clock, publisher),
      inject: [
        MEMBERSHIP_REPOSITORY_TOKEN,
        MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
        GYM_CLOCK_TOKEN,
        GYM_EVENT_PUBLISHER_PORT_TOKEN,
      ],
    },
    {
      provide: FreezeMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new FreezeMembershipHandler(membershipRepo, clock, publisher),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: UnfreezeMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new UnfreezeMembershipHandler(membershipRepo, clock, publisher),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: CancelMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new CancelMembershipHandler(membershipRepo, clock, publisher),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: ExpireMembershipsHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new ExpireMembershipsHandler(membershipRepo, clock, publisher),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN, GYM_EVENT_PUBLISHER_PORT_TOKEN],
    },
    {
      provide: GetMembershipByIdHandler,
      useFactory: (membershipRepo: MembershipRepository) =>
        new GetMembershipByIdHandler(membershipRepo),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN],
    },
    {
      provide: ListMembershipsHandler,
      useFactory: (membershipRepo: MembershipRepository) =>
        new ListMembershipsHandler(membershipRepo),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN],
    },
    {
      provide: ListExpiredMembershipsHandler,
      useFactory: (membershipRepo: MembershipRepository) =>
        new ListExpiredMembershipsHandler(membershipRepo),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN],
    },
    {
      provide: GetExpiringMembershipsHandler,
      useFactory: (membershipRepo: MembershipRepository, clock: Clock) =>
        new GetExpiringMembershipsHandler(membershipRepo, clock),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: CheckMembershipEligibilityHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        clientLookup: ClientLookupPort,
        clock: Clock,
      ) => new CheckMembershipEligibilityHandler(membershipRepo, clientLookup, clock),
      inject: [MEMBERSHIP_REPOSITORY_TOKEN, CLIENT_LOOKUP_PORT_TOKEN, GYM_CLOCK_TOKEN],
    },

    // Attendance Handlers
    {
      provide: RecordCheckInHandler,
      useFactory: (
        attendanceRepo: AttendanceRecordRepository,
        eligibilityHandler: CheckMembershipEligibilityHandler,
        clock: Clock,
        publisher: GymEventPublisherPort,
      ) => new RecordCheckInHandler(attendanceRepo, eligibilityHandler, clock, publisher),
      inject: [
        ATTENDANCE_RECORD_REPOSITORY_TOKEN,
        CheckMembershipEligibilityHandler,
        GYM_CLOCK_TOKEN,
        GYM_EVENT_PUBLISHER_PORT_TOKEN,
      ],
    },
    {
      provide: GetDailyAttendanceHandler,
      useFactory: (attendanceRepo: AttendanceRecordRepository, clock: Clock) =>
        new GetDailyAttendanceHandler(attendanceRepo, clock),
      inject: [ATTENDANCE_RECORD_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: GetClientAttendanceHistoryHandler,
      useFactory: (attendanceRepo: AttendanceRecordRepository) =>
        new GetClientAttendanceHistoryHandler(attendanceRepo),
      inject: [ATTENDANCE_RECORD_REPOSITORY_TOKEN],
    },
    {
      provide: GetAttendanceSummaryHandler,
      useFactory: (attendanceRepo: AttendanceRecordRepository, clock: Clock) =>
        new GetAttendanceSummaryHandler(attendanceRepo, clock),
      inject: [ATTENDANCE_RECORD_REPOSITORY_TOKEN, GYM_CLOCK_TOKEN],
    },
    {
      provide: SearchAttendanceHandler,
      useFactory: (attendanceRepo: AttendanceRecordRepository) =>
        new SearchAttendanceHandler(attendanceRepo),
      inject: [ATTENDANCE_RECORD_REPOSITORY_TOKEN],
    },

    // Trainer Dashboard Handlers
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
  ],
  exports: [
    GetTrainerDashboardSummaryHandler,
    GetAssignedClientMembershipsHandler,
    GetExpiringMembershipsHandler,
    GetDailyAttendanceHandler,
    MembershipPlansController,
    MembershipsController,
    AttendanceController,
  ],
})
export class GymModule {}
