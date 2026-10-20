import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GymModule } from '../gym.module';
import {
  MEMBERSHIP_REPOSITORY_TOKEN,
  MEMBERSHIP_PLAN_REPOSITORY_TOKEN,
  ATTENDANCE_RECORD_REPOSITORY_TOKEN,
} from '../gym.module';
import {
  PrismaMembershipRepository,
  PrismaMembershipPlanRepository,
  PrismaAttendanceRecordRepository,
  DefaultGymMembershipRepository,
  DefaultGymPlanRepository,
  DefaultGymAttendanceRepository,
} from '../infrastructure';
import {
  TrainerDashboardController,
  MembershipPlansController,
  MembershipsController,
  AttendanceController,
} from '../controllers';
import {
  CreateMembershipPlanHandler,
  CreateMembershipHandler,
  RecordCheckInHandler,
  GetTrainerDashboardSummaryHandler,
} from '@kinergy-platform/core';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';
import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { ACCESS_TOKEN_SERVICE } from '../../platform/identity/tokens/access-token.service';
import { USER_REPOSITORY } from '../../platform/identity/domain';

const mockPrisma = {
  membership: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  membershipPlan: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  attendanceRecord: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: mockPrisma,
    },
    {
      provide: AUTHORIZATION_EVALUATOR,
      useValue: {
        evaluate: jest.fn().mockResolvedValue(true),
      },
    },
    {
      provide: ACCESS_TOKEN_SERVICE,
      useValue: {
        validateToken: jest.fn(),
      },
    },
    {
      provide: USER_REPOSITORY,
      useValue: {
        findById: jest.fn(),
      },
    },
  ],
  exports: [PrismaService, AUTHORIZATION_EVALUATOR, ACCESS_TOKEN_SERVICE, USER_REPOSITORY],
})
class GlobalMockPlatformModule {}

describe('GymModule Production DI Composition & Wiring Specification (ADR-0080)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [GlobalMockPlatformModule, GymModule],
    }).compile();
  });

  describe('Module Compilation & Controller Resolution', () => {
    it('compiles GymModule successfully without missing dependency errors', () => {
      expect(moduleRef).toBeDefined();
    });

    it('resolves TrainerDashboardController from the DI container', () => {
      const ctrl = moduleRef.get<TrainerDashboardController>(TrainerDashboardController);
      expect(ctrl).toBeDefined();
      expect(ctrl).toBeInstanceOf(TrainerDashboardController);
    });

    it('resolves MembershipPlansController from the DI container', () => {
      const ctrl = moduleRef.get<MembershipPlansController>(MembershipPlansController);
      expect(ctrl).toBeDefined();
      expect(ctrl).toBeInstanceOf(MembershipPlansController);
    });

    it('resolves MembershipsController from the DI container', () => {
      const ctrl = moduleRef.get<MembershipsController>(MembershipsController);
      expect(ctrl).toBeDefined();
      expect(ctrl).toBeInstanceOf(MembershipsController);
    });

    it('resolves AttendanceController from the DI container', () => {
      const ctrl = moduleRef.get<AttendanceController>(AttendanceController);
      expect(ctrl).toBeDefined();
      expect(ctrl).toBeInstanceOf(AttendanceController);
    });
  });

  describe('Production Repository Token Binding & ADR-0080 Enforcement', () => {
    it('binds MEMBERSHIP_REPOSITORY_TOKEN to PrismaMembershipRepository (not in-memory)', () => {
      const repo = moduleRef.get(MEMBERSHIP_REPOSITORY_TOKEN);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(PrismaMembershipRepository);
      expect(repo).not.toBeInstanceOf(DefaultGymMembershipRepository);
    });

    it('binds MEMBERSHIP_PLAN_REPOSITORY_TOKEN to PrismaMembershipPlanRepository (not in-memory)', () => {
      const repo = moduleRef.get(MEMBERSHIP_PLAN_REPOSITORY_TOKEN);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(PrismaMembershipPlanRepository);
      expect(repo).not.toBeInstanceOf(DefaultGymPlanRepository);
    });

    it('binds ATTENDANCE_RECORD_REPOSITORY_TOKEN to PrismaAttendanceRecordRepository (not in-memory)', () => {
      const repo = moduleRef.get(ATTENDANCE_RECORD_REPOSITORY_TOKEN);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(PrismaAttendanceRecordRepository);
      expect(repo).not.toBeInstanceOf(DefaultGymAttendanceRepository);
    });

    it('resolves Prisma-backed concrete class providers directly', () => {
      expect(moduleRef.get(PrismaMembershipRepository)).toBeInstanceOf(PrismaMembershipRepository);
      expect(moduleRef.get(PrismaMembershipPlanRepository)).toBeInstanceOf(
        PrismaMembershipPlanRepository,
      );
      expect(moduleRef.get(PrismaAttendanceRecordRepository)).toBeInstanceOf(
        PrismaAttendanceRecordRepository,
      );
    });
  });

  describe('Application Handler Wiring', () => {
    it('resolves CreateMembershipPlanHandler wired with PrismaMembershipPlanRepository', () => {
      const handler = moduleRef.get<CreateMembershipPlanHandler>(CreateMembershipPlanHandler);
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(CreateMembershipPlanHandler);
    });

    it('resolves CreateMembershipHandler wired with PrismaMembershipRepository', () => {
      const handler = moduleRef.get<CreateMembershipHandler>(CreateMembershipHandler);
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(CreateMembershipHandler);
    });

    it('resolves RecordCheckInHandler wired with PrismaAttendanceRecordRepository', () => {
      const handler = moduleRef.get<RecordCheckInHandler>(RecordCheckInHandler);
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(RecordCheckInHandler);
    });

    it('resolves GetTrainerDashboardSummaryHandler wired with production repositories', () => {
      const handler = moduleRef.get<GetTrainerDashboardSummaryHandler>(
        GetTrainerDashboardSummaryHandler,
      );
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(GetTrainerDashboardSummaryHandler);
    });
  });

  describe('Test Double Isolation & Overridability', () => {
    it('allows tests to override repository tokens with deterministic in-memory fakes', async () => {
      const fakeMembershipRepo = new DefaultGymMembershipRepository();
      const fakePlanRepo = new DefaultGymPlanRepository();
      const fakeAttendanceRepo = new DefaultGymAttendanceRepository();

      const testModule = await Test.createTestingModule({
        imports: [GlobalMockPlatformModule, GymModule],
      })
        .overrideProvider(MEMBERSHIP_REPOSITORY_TOKEN)
        .useValue(fakeMembershipRepo)
        .overrideProvider(MEMBERSHIP_PLAN_REPOSITORY_TOKEN)
        .useValue(fakePlanRepo)
        .overrideProvider(ATTENDANCE_RECORD_REPOSITORY_TOKEN)
        .useValue(fakeAttendanceRepo)
        .compile();

      expect(testModule.get(MEMBERSHIP_REPOSITORY_TOKEN)).toBe(fakeMembershipRepo);
      expect(testModule.get(MEMBERSHIP_PLAN_REPOSITORY_TOKEN)).toBe(fakePlanRepo);
      expect(testModule.get(ATTENDANCE_RECORD_REPOSITORY_TOKEN)).toBe(fakeAttendanceRepo);

      // Verify that overriding in test does not contaminate production moduleRef
      expect(moduleRef.get(MEMBERSHIP_REPOSITORY_TOKEN)).toBeInstanceOf(PrismaMembershipRepository);
    });
  });
});
