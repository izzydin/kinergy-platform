import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipPlansController } from './membership-plans.controller';
import { MembershipsController } from './memberships.controller';
import { AttendanceController } from './attendance.controller';
import { TrainerDashboardController } from './trainer-dashboard.controller';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
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
  GetExpiringMembershipsHandler,
  CheckMembershipEligibilityHandler,
  RecordCheckInHandler,
  GetDailyAttendanceHandler,
  GetClientAttendanceHistoryHandler,
  GetAttendanceSummaryHandler,
  SearchAttendanceHandler,
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsHandler,
  ApplicationResult,
  PlanStatus,
  AccessResult,
  CheckInMethod,
} from '@kinergy-platform/core';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators';

describe('Phase 5.7-E: Gym Management REST API Controllers Comprehensive Spec', () => {
  let plansController: MembershipPlansController;
  let membershipsController: MembershipsController;
  let attendanceController: AttendanceController;
  let trainerDashboardController: TrainerDashboardController;

  // Mock Handlers
  const mockCreatePlanHandler = { execute: jest.fn() };
  const mockUpdatePricingHandler = { execute: jest.fn() };
  const mockPublishPlanHandler = { execute: jest.fn() };
  const mockArchivePlanHandler = { execute: jest.fn() };
  const mockGetPlanByIdHandler = { execute: jest.fn() };
  const mockListPlansHandler = { execute: jest.fn() };

  const mockCreateMembershipHandler = { execute: jest.fn() };
  const mockRenewMembershipHandler = { execute: jest.fn() };
  const mockFreezeMembershipHandler = { execute: jest.fn() };
  const mockUnfreezeMembershipHandler = { execute: jest.fn() };
  const mockCancelMembershipHandler = { execute: jest.fn() };
  const mockExpireMembershipsHandler = { execute: jest.fn() };
  const mockGetMembershipByIdHandler = { execute: jest.fn() };
  const mockListMembershipsHandler = { execute: jest.fn() };
  const mockListExpiredMembershipsHandler = { execute: jest.fn() };
  const mockGetExpiringMembershipsHandler = { execute: jest.fn() };
  const mockCheckEligibilityHandler = { execute: jest.fn() };

  const mockRecordCheckInHandler = { execute: jest.fn() };
  const mockGetDailyAttendanceHandler = { execute: jest.fn() };
  const mockGetClientHistoryHandler = { execute: jest.fn() };
  const mockGetAttendanceSummaryHandler = { execute: jest.fn() };
  const mockSearchAttendanceHandler = { execute: jest.fn() };

  const mockGetSummaryHandler = { execute: jest.fn() };
  const mockGetAssignedClientsHandler = { execute: jest.fn() };

  const adminUser: AuthenticatedUserPayload = {
    id: 'usr_admin_1',
    email: 'admin@kinergy.test',
    roles: ['Admin'],
    permissions: ['*'],
    status: 'ACTIVE',
  };

  const trainerUser: AuthenticatedUserPayload = {
    id: 'usr_trainer_1',
    email: 'trainer@kinergy.test',
    roles: ['Trainer'],
    permissions: ['clients.read'],
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        MembershipPlansController,
        MembershipsController,
        AttendanceController,
        TrainerDashboardController,
      ],
      providers: [
        { provide: CreateMembershipPlanHandler, useValue: mockCreatePlanHandler },
        { provide: UpdateMembershipPlanPricingHandler, useValue: mockUpdatePricingHandler },
        { provide: PublishMembershipPlanHandler, useValue: mockPublishPlanHandler },
        { provide: ArchiveMembershipPlanHandler, useValue: mockArchivePlanHandler },
        { provide: GetMembershipPlanByIdHandler, useValue: mockGetPlanByIdHandler },
        { provide: ListMembershipPlansHandler, useValue: mockListPlansHandler },

        { provide: CreateMembershipHandler, useValue: mockCreateMembershipHandler },
        { provide: RenewMembershipHandler, useValue: mockRenewMembershipHandler },
        { provide: FreezeMembershipHandler, useValue: mockFreezeMembershipHandler },
        { provide: UnfreezeMembershipHandler, useValue: mockUnfreezeMembershipHandler },
        { provide: CancelMembershipHandler, useValue: mockCancelMembershipHandler },
        { provide: ExpireMembershipsHandler, useValue: mockExpireMembershipsHandler },
        { provide: GetMembershipByIdHandler, useValue: mockGetMembershipByIdHandler },
        { provide: ListMembershipsHandler, useValue: mockListMembershipsHandler },
        { provide: ListExpiredMembershipsHandler, useValue: mockListExpiredMembershipsHandler },
        { provide: GetExpiringMembershipsHandler, useValue: mockGetExpiringMembershipsHandler },
        { provide: CheckMembershipEligibilityHandler, useValue: mockCheckEligibilityHandler },

        { provide: RecordCheckInHandler, useValue: mockRecordCheckInHandler },
        { provide: GetDailyAttendanceHandler, useValue: mockGetDailyAttendanceHandler },
        { provide: GetClientAttendanceHistoryHandler, useValue: mockGetClientHistoryHandler },
        { provide: GetAttendanceSummaryHandler, useValue: mockGetAttendanceSummaryHandler },
        { provide: SearchAttendanceHandler, useValue: mockSearchAttendanceHandler },

        { provide: GetTrainerDashboardSummaryHandler, useValue: mockGetSummaryHandler },
        { provide: GetAssignedClientMembershipsHandler, useValue: mockGetAssignedClientsHandler },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    plansController = module.get<MembershipPlansController>(MembershipPlansController);
    membershipsController = module.get<MembershipsController>(MembershipsController);
    attendanceController = module.get<AttendanceController>(AttendanceController);
    trainerDashboardController = module.get<TrainerDashboardController>(TrainerDashboardController);
  });

  // =========================================================================
  // 1. MembershipPlansController
  // =========================================================================
  describe('1. MembershipPlansController', () => {
    it('POST /membership-plans - creates plan successfully', async () => {
      mockCreatePlanHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          id: 'plan_01',
          code: 'STD_MONTHLY',
          name: 'Standard Monthly Pass',
          durationInDays: 30,
          priceAmount: 4999,
          priceCurrency: 'USD',
          status: PlanStatus.DRAFT,
          version: 1,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        }),
      );

      const res = await plansController.createPlan({
        code: 'STD_MONTHLY',
        name: 'Standard Monthly Pass',
        durationInDays: 30,
        priceAmount: 4999,
      });

      expect(res.id).toBe('plan_01');
      expect(res.status).toBe(PlanStatus.DRAFT);
    });

    it('POST /membership-plans - throws BadRequestException on failure', async () => {
      mockCreatePlanHandler.execute.mockResolvedValue(ApplicationResult.fail('Duplicate code'));

      await expect(
        plansController.createPlan({
          code: 'DUP_CODE',
          name: 'Duplicate',
          durationInDays: 30,
          priceAmount: 4999,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('GET /membership-plans/:id - returns plan or throws NotFoundException', async () => {
      mockGetPlanByIdHandler.execute.mockResolvedValue(
        ApplicationResult.ok({ id: 'plan_01', name: 'Pass' }),
      );

      const res = await plansController.getPlan('plan_01');
      expect(res.id).toBe('plan_01');

      mockGetPlanByIdHandler.execute.mockResolvedValue(ApplicationResult.fail('Not found'));
      await expect(plansController.getPlan('missing')).rejects.toThrow(NotFoundException);
    });

    it('POST /membership-plans/:id/publish - publishes plan', async () => {
      mockPublishPlanHandler.execute.mockResolvedValue(
        ApplicationResult.ok({ id: 'plan_01', status: PlanStatus.ACTIVE }),
      );

      const res = await plansController.publishPlan('plan_01');
      expect(res.status).toBe(PlanStatus.ACTIVE);
    });
  });

  // =========================================================================
  // 2. MembershipsController
  // =========================================================================
  describe('2. MembershipsController', () => {
    it('POST /memberships - creates membership successfully', async () => {
      mockCreateMembershipHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          id: 'mem_01',
          clientId: 'cli_01',
          planId: 'plan_01',
          status: 'ACTIVE',
        }),
      );

      const res = await membershipsController.createMembership({
        clientId: 'cli_01',
        planId: 'plan_01',
      });

      expect(res.id).toBe('mem_01');
    });

    it('POST /memberships/:id/renew - renews membership', async () => {
      mockRenewMembershipHandler.execute.mockResolvedValue(
        ApplicationResult.ok({ id: 'mem_01', status: 'ACTIVE' }),
      );

      const res = await membershipsController.renewMembership('mem_01', {});
      expect(res.id).toBe('mem_01');
    });

    it('POST /memberships/:id/freeze - freezes membership', async () => {
      mockFreezeMembershipHandler.execute.mockResolvedValue(
        ApplicationResult.ok({ id: 'mem_01', status: 'FROZEN' }),
      );

      const res = await membershipsController.freezeMembership('mem_01', {
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-15T00:00:00.000Z',
      });

      expect(res.status).toBe('FROZEN');
    });

    it('POST /memberships/:id/cancel - cancels membership', async () => {
      mockCancelMembershipHandler.execute.mockResolvedValue(
        ApplicationResult.ok({ id: 'mem_01', status: 'CANCELLED' }),
      );

      const res = await membershipsController.cancelMembership('mem_01', {
        reason: 'Relocated',
      });

      expect(res.status).toBe('CANCELLED');
    });

    it('GET /memberships/eligibility/check - returns admission eligibility', async () => {
      mockCheckEligibilityHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          isEligible: true,
          outcome: 'ELIGIBLE',
          membershipId: 'mem_01',
          planId: 'plan_01',
          evaluatedAt: '2026-08-22T10:00:00.000Z',
          reason: 'Client has active membership',
        }),
      );

      const res = await membershipsController.checkEligibility({ clientId: 'cli_01' });
      expect(res.isEligible).toBe(true);
      expect(res.reason).toBe('Client has active membership');
    });
  });

  // =========================================================================
  // 3. AttendanceController
  // =========================================================================
  describe('3. AttendanceController', () => {
    it('POST /attendance/check-in - records physical check-in', async () => {
      mockRecordCheckInHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          isGranted: true,
          outcome: AccessResult.GRANTED,
          attendanceId: 'att_01',
          clientId: 'cli_01',
          membershipId: 'mem_01',
          checkInTime: '2026-08-22T10:30:00.000Z',
          gymDay: {
            localDate: '2026-08-22',
            timezone: 'America/Guayaquil',
            facilityId: 'fac_main',
          },
          method: CheckInMethod.QR_CODE,
          isDuplicate: false,
          isIdempotentReplay: false,
          denialReason: null,
        }),
      );

      const res = await attendanceController.checkIn(
        { clientId: 'cli_01', method: CheckInMethod.QR_CODE },
        adminUser,
      );

      expect(res.isGranted).toBe(true);
      expect(res.attendanceId).toBe('att_01');
    });

    it('GET /attendance/today - returns daily attendance feed', async () => {
      mockGetDailyAttendanceHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          items: [],
          pagination: {
            page: 1,
            limit: 20,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      );

      const res = await attendanceController.getToday({});
      expect(res.pagination.totalItems).toBe(0);
    });

    it('GET /attendance/search - multi-criteria search', async () => {
      mockSearchAttendanceHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          items: [],
          pagination: {
            page: 1,
            limit: 20,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      );

      const res = await attendanceController.search({ clientId: 'cli_01' });
      expect(res.pagination.totalItems).toBe(0);
    });
  });

  // =========================================================================
  // 4. TrainerDashboardController
  // =========================================================================
  describe('4. TrainerDashboardController', () => {
    it('GET /trainer-dashboard/summary - retrieves trainer KPI metrics', async () => {
      mockGetSummaryHandler.execute.mockResolvedValue(
        ApplicationResult.ok({
          trainerId: 'usr_trainer_1',
          asOf: '2026-08-22T10:30:00.000Z',
          horizonDays: 7,
          totalAssignedClients: 12,
          activeMembershipsCount: 10,
          expiringMembershipsCount: 2,
          frozenMembershipsCount: 1,
          todayCheckInsCount: 4,
        }),
      );

      const res = await trainerDashboardController.getSummary(trainerUser);
      expect(res.totalAssignedClients).toBe(12);
      expect(res.todayCheckInsCount).toBe(4);
    });
  });
});
