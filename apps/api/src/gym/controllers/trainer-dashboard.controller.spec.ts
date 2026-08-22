import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TrainerDashboardController } from './trainer-dashboard.controller';
import {
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsHandler,
  GetExpiringMembershipsHandler,
  GetDailyAttendanceHandler,
  GymApplicationResult as ApplicationResult,
  MembershipStatus,
  AccessResult,
  CheckInMethod,
} from '@kinergy-platform/core';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';

describe('Phase 5.6-E: TrainerDashboardController API & Architecture Spec', () => {
  let controller: TrainerDashboardController;
  let summaryHandler: jest.Mocked<GetTrainerDashboardSummaryHandler>;
  let assignedClientsHandler: jest.Mocked<GetAssignedClientMembershipsHandler>;
  let expiringHandler: jest.Mocked<GetExpiringMembershipsHandler>;
  let attendanceHandler: jest.Mocked<GetDailyAttendanceHandler>;

  const mockTrainerUser: AuthenticatedUserPayload = {
    id: 'usr_trainer_007',
    email: 'trainer@kinergy.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['clients.read'],
  };

  const mockAdminUser: AuthenticatedUserPayload = {
    id: 'usr_admin_001',
    email: 'admin@kinergy.com',
    status: 'ACTIVE',
    roles: ['Admin'],
    permissions: ['clients.read', 'clients.write', 'admin.all'],
  };

  beforeEach(async () => {
    summaryHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok({
          trainerId: 'usr_trainer_007',
          asOf: '2026-08-22T10:00:00.000Z',
          horizonDays: 7,
          totalAssignedClients: 15,
          activeMembershipsCount: 14,
          expiringMembershipsCount: 2,
          frozenMembershipsCount: 1,
          todayCheckInsCount: 4,
        }),
      ),
    } as unknown as jest.Mocked<GetTrainerDashboardSummaryHandler>;

    assignedClientsHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok([
          {
            membershipId: 'mem_1',
            clientId: 'client_1',
            planId: 'plan_1',
            planName: 'VIP Pass',
            status: MembershipStatus.ACTIVE,
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-09-01T00:00:00.000Z',
            daysRemaining: 10,
            isExpiringSoon: false,
            isExpired: false,
            isCurrentlyFrozen: false,
            assignedAt: '2026-08-01T00:00:00.000Z',
          },
          {
            membershipId: 'mem_2',
            clientId: 'client_2',
            planId: 'plan_1',
            planName: 'VIP Pass',
            status: MembershipStatus.ACTIVE,
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-25T00:00:00.000Z',
            daysRemaining: 3,
            isExpiringSoon: true,
            isExpired: false,
            isCurrentlyFrozen: false,
            assignedAt: '2026-08-01T00:00:00.000Z',
          },
        ]),
      ),
    } as unknown as jest.Mocked<GetAssignedClientMembershipsHandler>;

    expiringHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok([
          {
            membershipId: 'mem_2',
            clientId: 'client_2',
            planId: 'plan_1',
            endDate: '2026-08-25T00:00:00.000Z',
            daysRemaining: 3,
            isExpiringSoon: true,
          },
        ]),
      ),
    } as unknown as jest.Mocked<GetExpiringMembershipsHandler>;

    attendanceHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok({
          items: [
            {
              id: 'att_1',
              clientId: 'client_1',
              membershipId: 'mem_1',
              checkInTime: '2026-08-22T08:30:00.000Z',
              gymDay: '2026-08-22',
              method: CheckInMethod.RFID,
              result: AccessResult.GRANTED,
              gateId: 'gate_1',
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
          dailySummary: {
            totalCheckIns: 1,
            grantedCount: 1,
            deniedCount: 0,
            uniqueClientsCount: 1,
          },
        }),
      ),
    } as unknown as jest.Mocked<GetDailyAttendanceHandler>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainerDashboardController],
      providers: [
        { provide: GetTrainerDashboardSummaryHandler, useValue: summaryHandler },
        { provide: GetAssignedClientMembershipsHandler, useValue: assignedClientsHandler },
        { provide: GetExpiringMembershipsHandler, useValue: expiringHandler },
        { provide: GetDailyAttendanceHandler, useValue: attendanceHandler },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TrainerDashboardController>(TrainerDashboardController);
  });

  describe('1. GET /summary', () => {
    it('scopes query to authenticated trainer userId', async () => {
      const response = await controller.getSummary(mockTrainerUser);

      expect(response).toBeDefined();
      expect(response.trainerId).toBe('usr_trainer_007');
      expect(response.totalAssignedClients).toBe(15);
      expect(summaryHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ trainerId: 'usr_trainer_007' }),
        }),
      );
    });

    it('allows Admin to query another trainerId', async () => {
      await controller.getSummary(mockAdminUser, 'usr_other_trainer');

      expect(summaryHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ trainerId: 'usr_other_trainer' }),
        }),
      );
    });

    it('ignores requestedTrainerId if caller is a standard Trainer (preventing horizontal escalation)', async () => {
      await controller.getSummary(mockTrainerUser, 'usr_tampered_trainer');

      expect(summaryHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ trainerId: 'usr_trainer_007' }),
        }),
      );
    });

    it('throws BadRequestException on handler failure', async () => {
      summaryHandler.execute.mockResolvedValueOnce(ApplicationResult.fail('Database failure'));

      await expect(controller.getSummary(mockTrainerUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. GET /clients', () => {
    it('returns paginated assigned client memberships', async () => {
      const response = await controller.getAssignedClients(mockTrainerUser, {
        page: 1,
        limit: 1,
      });

      expect(response.items).toHaveLength(1);
      expect(response.totalItems).toBe(2);
      expect(response.totalPages).toBe(2);
      expect(response.hasNextPage).toBe(true);
      expect(response.hasPreviousPage).toBe(false);
    });
  });

  describe('3. GET /expiring-memberships', () => {
    it('returns memberships expiring within horizon for the trainer', async () => {
      const response = await controller.getExpiringMemberships(mockTrainerUser, {
        horizonDays: 7,
      });

      expect(response.items).toHaveLength(1);
      expect(response.total).toBe(1);
      expect(response.horizonDays).toBe(7);
    });
  });

  describe('4. GET /attendance', () => {
    it('scopes attendance search to assigned client IDs only', async () => {
      const response = await controller.getAttendance(mockTrainerUser, {
        date: '2026-08-22',
      });

      expect(response.items).toHaveLength(1);
      expect(response.grantedCount).toBe(1);
      expect(attendanceHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            assignedClientIds: ['client_1', 'client_2'],
          }),
        }),
      );
    });
  });
});
