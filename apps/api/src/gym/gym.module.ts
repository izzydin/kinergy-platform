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
  ActivateOrRenewMembershipHandler,
  ResolveMembershipCommercialDetailsHandler,
  InMemoryGymFulfillmentStore,
  GymDomainEvent,
} from '@kinergy-platform/core';
import {
  TrainerDashboardController,
  MembershipPlansController,
  MembershipsController,
  AttendanceController,
} from './controllers';

import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaMembershipRepository,
  PrismaMembershipPlanRepository,
  PrismaAttendanceRecordRepository,
  DefaultGymMembershipRepository,
  DefaultGymPlanRepository,
  DefaultGymAttendanceRepository,
} from './infrastructure';

// Injection tokens
export const MEMBERSHIP_REPOSITORY_TOKEN = 'MembershipRepository';
export const MEMBERSHIP_PLAN_REPOSITORY_TOKEN = 'MembershipPlanRepository';
export const ATTENDANCE_RECORD_REPOSITORY_TOKEN = 'AttendanceRecordRepository';
export const GYM_CLOCK_TOKEN = 'GymClock';
export const CLIENT_LOOKUP_PORT_TOKEN = 'ClientLookupPort';
export const GYM_EVENT_PUBLISHER_PORT_TOKEN = 'GymEventPublisherPort';
export const GYM_FULFILLMENT_STORE_PORT_TOKEN = 'GymFulfillmentStorePort';

// Export in-memory classes for testing doubles
export { DefaultGymMembershipRepository, DefaultGymPlanRepository, DefaultGymAttendanceRepository };

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
    // Production Persistence Adapters (ADR-0080 compliance)
    {
      provide: PrismaMembershipRepository,
      useFactory: (prisma: PrismaService) => new PrismaMembershipRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: MEMBERSHIP_REPOSITORY_TOKEN,
      useExisting: PrismaMembershipRepository,
    },
    {
      provide: PrismaMembershipPlanRepository,
      useFactory: (prisma: PrismaService) => new PrismaMembershipPlanRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
      useExisting: PrismaMembershipPlanRepository,
    },
    {
      provide: PrismaAttendanceRecordRepository,
      useFactory: (prisma: PrismaService) => new PrismaAttendanceRecordRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ATTENDANCE_RECORD_REPOSITORY_TOKEN,
      useExisting: PrismaAttendanceRecordRepository,
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
    {
      provide: GYM_FULFILLMENT_STORE_PORT_TOKEN,
      useClass: InMemoryGymFulfillmentStore,
    },
    {
      provide: ActivateOrRenewMembershipHandler,
      useFactory: (
        membershipRepo: MembershipRepository,
        planRepo: MembershipPlanRepository,
        clientLookup: ClientLookupPort,
        clock: Clock,
        publisher: GymEventPublisherPort,
        store: InMemoryGymFulfillmentStore,
      ) =>
        new ActivateOrRenewMembershipHandler(
          membershipRepo,
          planRepo,
          clientLookup,
          clock,
          publisher,
          store,
        ),
      inject: [
        MEMBERSHIP_REPOSITORY_TOKEN,
        MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
        CLIENT_LOOKUP_PORT_TOKEN,
        GYM_CLOCK_TOKEN,
        GYM_EVENT_PUBLISHER_PORT_TOKEN,
        GYM_FULFILLMENT_STORE_PORT_TOKEN,
      ],
    },
    {
      provide: ResolveMembershipCommercialDetailsHandler,
      useFactory: (
        planRepo: MembershipPlanRepository,
        membershipRepo: MembershipRepository,
        clientLookup: ClientLookupPort,
        clock: Clock,
      ) =>
        new ResolveMembershipCommercialDetailsHandler(
          planRepo,
          membershipRepo,
          clientLookup,
          clock,
        ),
      inject: [
        MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
        MEMBERSHIP_REPOSITORY_TOKEN,
        CLIENT_LOOKUP_PORT_TOKEN,
        GYM_CLOCK_TOKEN,
      ],
    },
  ],
  exports: [
    GetTrainerDashboardSummaryHandler,
    GetAssignedClientMembershipsHandler,
    GetExpiringMembershipsHandler,
    GetDailyAttendanceHandler,
    GetMembershipPlanByIdHandler,
    GetMembershipByIdHandler,
    CheckMembershipEligibilityHandler,
    ActivateOrRenewMembershipHandler,
    ResolveMembershipCommercialDetailsHandler,
    MEMBERSHIP_REPOSITORY_TOKEN,
    MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
    ATTENDANCE_RECORD_REPOSITORY_TOKEN,
    PrismaMembershipRepository,
    PrismaMembershipPlanRepository,
    PrismaAttendanceRecordRepository,
  ],
})
export class GymModule {}
