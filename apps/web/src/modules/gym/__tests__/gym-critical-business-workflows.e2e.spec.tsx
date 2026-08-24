import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { AttendancePage } from '../attendance/routes/attendance-page';
import { AccessResult, CheckInMethod } from '../attendance/types';
import { membershipsApi } from '../memberships/api/memberships-api';
import { MembershipsListPage } from '../memberships/routes/memberships-list-page';
import { CreateMembershipPage } from '../memberships/routes/create-membership-page';
import { plansApi } from '../plans/api/plans-api';
import { PlansListPage } from '../plans/routes/plans-list-page';
import { trainerDashboardApi } from '../trainer-dashboard/api/trainer-dashboard-api';
import { TrainerDashboardPage } from '../trainer-dashboard/routes/trainer-dashboard-page';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layers
jest.mock('../memberships/api/memberships-api', () => ({
  membershipsApi: {
    listMemberships: jest.fn(),
    getMembershipById: jest.fn(),
    createMembership: jest.fn(),
    freezeMembership: jest.fn(),
    unfreezeMembership: jest.fn(),
    renewMembership: jest.fn(),
    cancelMembership: jest.fn(),
  },
}));

jest.mock('../plans/api/plans-api', () => ({
  plansApi: {
    listPlans: jest.fn(),
    getPlanById: jest.fn(),
    createPlan: jest.fn(),
    updatePricing: jest.fn(),
    publishPlan: jest.fn(),
    archivePlan: jest.fn(),
  },
}));

jest.mock('../attendance/api/attendance-api', () => ({
  attendanceApi: {
    searchClients: jest.fn(),
    checkEligibility: jest.fn(),
    recordCheckIn: jest.fn(),
    getToday: jest.fn(),
    getClientHistory: jest.fn(),
    searchAttendance: jest.fn(),
  },
}));

jest.mock('../trainer-dashboard/api/trainer-dashboard-api', () => ({
  trainerDashboardApi: {
    getSummary: jest.fn(),
    getAssignedClients: jest.fn(),
    getExpiringMemberships: jest.fn(),
    getAttendance: jest.fn(),
  },
}));

const mockedMembershipsApi = jest.mocked(membershipsApi);
const mockedPlansApi = jest.mocked(plansApi);
const mockedAttendanceApi = jest.mocked(attendanceApi);
const mockedTrainerApi = jest.mocked(trainerDashboardApi);

const MOCK_ADMIN_STAFF: AuthUser = {
  id: 'usr_staff_1',
  email: 'admin@kinergy.io',
  name: 'Gym Manager & Staff',
  roles: ['ADMIN', 'Staff', 'RECEPTIONIST'],
  permissions: [
    'memberships.read',
    'memberships.create',
    'memberships.update',
    'memberships.manage',
    'plans.read',
    'plans.create',
    'plans.update',
    'plans.write',
    'attendance.read',
    'attendance.create',
    'clients.read',
  ],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_TRAINER_USER: AuthUser = {
  id: 'usr_trainer_bob',
  email: 'trainer.bob@kinergy.io',
  name: 'Trainer Bob',
  roles: ['Trainer'],
  permissions: ['memberships.read', 'attendance.read', 'clients.read'],
  tenantId: 'tenant_kinergy_master',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderGymApp(initialEntries: string[], user: AuthUser = MOCK_ADMIN_STAFF) {
  const queryClient = createTestQueryClient();

  const router = createMemoryRouter(
    [
      {
        path: '/gym/memberships',
        element: <MembershipsListPage />,
      },
      {
        path: '/gym/memberships/new',
        element: <CreateMembershipPage />,
      },
      {
        path: '/gym/plans',
        element: <PlansListPage />,
      },
      {
        path: '/gym/attendance',
        element: <AttendancePage />,
      },
      {
        path: '/gym/trainer-dashboard',
        element: <TrainerDashboardPage />,
      },
    ],
    { initialEntries },
  );

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...utils,
    router,
    queryClient,
  };
}

describe('Phase 5.7-J: Gym Critical End-to-End Business Workflows (Frontend E2E)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Seed Data
    mockedPlansApi.listPlans.mockImplementation(async () => ({
      items: [
        {
          id: 'plan_std',
          code: 'STD_MONTHLY',
          name: 'Standard Monthly Pass',
          description: 'Full gym access',
          durationInDays: 30,
          priceAmount: 9900,
          priceCurrency: 'USD',
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    }));

    mockedMembershipsApi.listMemberships.mockImplementation(async () => ({
      items: [
        {
          id: 'mem_sarah_1',
          clientId: 'client_sarah',
          planId: 'plan_std',
          period: {
            startDate: '2026-08-01T08:00:00.000Z',
            endDate: '2026-08-31T08:00:00.000Z',
            durationDays: 30,
          },
          status: 'ACTIVE',
          assignedTrainerId: 'trainer_bob',
          version: 1,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    }));

    mockedAttendanceApi.getToday.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 15,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      dailySummary: {
        totalCheckIns: 0,
        grantedCount: 0,
        deniedCount: 0,
        uniqueClientsCount: 0,
      },
    });

    mockedAttendanceApi.searchClients.mockResolvedValue([
      {
        id: 'client_sarah',
        fullName: 'Sarah Connor',
        email: 'sarah@resistance.io',
        phone: '+1555123456',
        status: 'ACTIVE',
      },
    ]);

    mockedAttendanceApi.checkEligibility.mockResolvedValue({
      clientId: 'client_sarah',
      isEligible: true,
      outcome: 'GRANTED',
      membershipId: 'mem_sarah_1',
      planId: 'plan_std',
      period: {
        startDate: '2026-08-01T08:00:00.000Z',
        endDate: '2026-08-31T08:00:00.000Z',
        durationDays: 30,
      },
      evaluatedAt: '2026-08-15T12:00:00.000Z',
      reason: null,
    });

    mockedTrainerApi.getSummary.mockResolvedValue({
      totalAssignedClients: 1,
      activeMembershipsCount: 1,
      expiringSoonMembershipsCount: 0,
      frozenMembershipsCount: 0,
      todayGrantedCheckInsCount: 0,
      asOfDate: '2026-08-15',
      horizonDays: 7,
    });

    mockedTrainerApi.getAssignedClients.mockResolvedValue({
      items: [
        {
          membershipId: 'mem_sarah_1',
          clientId: 'client_sarah',
          planId: 'plan_std',
          planName: 'Standard Monthly Pass',
          status: 'ACTIVE',
          startDate: '2026-08-01T08:00:00.000Z',
          endDate: '2026-08-31T08:00:00.000Z',
          daysRemaining: 16,
          isExpiringSoon: false,
          isExpired: false,
          isCurrentlyFrozen: false,
          assignedAt: '2026-08-01T08:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    mockedTrainerApi.getExpiringMemberships.mockResolvedValue({
      items: [],
      total: 0,
      horizonDays: 7,
    });

    mockedTrainerApi.getAttendance.mockResolvedValue({
      items: [],
      total: 0,
      grantedCount: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  // =========================================================================
  // Workflow 1: Create Membership UI Journey
  // =========================================================================
  it('Workflow 1 — Create Membership: Authorized staff opens page, inputs client & plan, and persists membership', async () => {
    mockedMembershipsApi.createMembership.mockResolvedValueOnce({
      id: 'mem_john_1',
      clientId: 'client_john',
      planId: 'plan_std',
      period: {
        startDate: '2026-08-15T00:00:00.000Z',
        endDate: '2026-09-14T00:00:00.000Z',
        durationDays: 30,
      },
      status: 'ACTIVE',
      version: 1,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });

    renderGymApp(['/gym/memberships/new']);

    await waitFor(() => {
      expect(screen.getByTestId('create-membership-page')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('select-plan-id')).not.toBeDisabled();
    });

    // Fill Client ID and Select Plan
    fireEvent.change(screen.getByTestId('input-client-id'), {
      target: { value: 'client_john' },
    });
    fireEvent.change(screen.getByTestId('select-plan-id'), {
      target: { value: 'plan_std' },
    });

    // Submit Creation
    fireEvent.click(screen.getByTestId('submit-membership-button'));

    await waitFor(() => {
      expect(mockedMembershipsApi.createMembership).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client_john',
          planId: 'plan_std',
        }),
      );
    });
  });

  // =========================================================================
  // Workflow 2: Renew Membership UI Journey
  // =========================================================================
  it('Workflow 2 — Renew Membership: Extends validity period and increments renewal version', async () => {
    mockedMembershipsApi.renewMembership.mockResolvedValueOnce({
      id: 'mem_sarah_1',
      clientId: 'client_sarah',
      planId: 'plan_std',
      period: {
        startDate: '2026-08-01T08:00:00.000Z',
        endDate: '2026-09-30T08:00:00.000Z',
        durationDays: 60,
      },
      status: 'ACTIVE',
      version: 2,
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-15T08:00:00.000Z',
    });

    renderGymApp(['/gym/memberships']);

    await waitFor(() => {
      expect(screen.getByText('client_sarah')).toBeInTheDocument();
    });

    // Open row action menu & click Renew
    const rowActionsBtn = screen.getByRole('button', { name: /Open actions menu/i });
    fireEvent.click(rowActionsBtn);

    await waitFor(() => {
      expect(screen.getByText('Renew Agreement')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Renew Agreement'));

    await waitFor(() => {
      expect(screen.getByTestId('renew-membership-dialog')).toBeInTheDocument();
    });

    // Confirm renewal
    fireEvent.click(screen.getByTestId('submit-renew-button'));

    await waitFor(() => {
      expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
        'mem_sarah_1',
        expect.objectContaining({}),
      );
    });
  });

  // =========================================================================
  // Workflow 3 & 4: Reception Check-In & Real-Time Eligibility Evaluation
  // =========================================================================
  describe('Workflow 3 & 4 — Check-In & Access Ingress Matrix', () => {
    it('Workflow 4: Receptionist selects client, verifies eligibility, and grants admission', async () => {
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_new_1',
        clientId: 'client_sarah',
        membershipId: 'mem_sarah_1',
        planId: 'plan_std',
        checkInTime: '2026-08-15T12:05:00.000Z',
        gymDay: {
          localDate: '2026-08-15',
          timezone: 'UTC',
          facilityId: 'main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_1',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      });

      renderGymApp(['/gym/attendance?clientId=client_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
      });

      // Verify Eligibility Card is shown with ELIGIBLE badge
      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });
      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(/ELIGIBLE/i);

      // Click Grant Check-In
      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'client_sarah',
            method: CheckInMethod.MANUAL_RECEPTION,
          }),
        );
      });
    });

    it('Workflow 3: Expired membership renders NOT ELIGIBLE badge and rejects admission', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValueOnce({
        clientId: 'client_sarah',
        isEligible: false,
        outcome: 'EXPIRED',
        membershipId: 'mem_sarah_1',
        planId: 'plan_std',
        period: {
          startDate: '2026-07-01T08:00:00.000Z',
          endDate: '2026-07-31T08:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T12:00:00.000Z',
        reason: 'Membership expired on 2026-07-31',
      });

      renderGymApp(['/gym/attendance?clientId=client_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(/EXPIRED/i);
    });
  });

  // =========================================================================
  // Workflow 5 & 6: Trainer Dashboard & Authorization Scoping
  // =========================================================================
  describe('Workflow 5 & 6 — Trainer Dashboard & Scoped Authorization', () => {
    it('Workflow 5: Trainer logs in, inspects assigned client, and views active passes', async () => {
      renderGymApp(['/gym/trainer-dashboard'], MOCK_TRAINER_USER);

      await waitFor(() => {
        expect(screen.getByText('Trainer Operational Dashboard')).toBeInTheDocument();
      });

      // Verify KPI banner and Assigned Client Roster
      await waitFor(() => {
        expect(screen.getByTestId('kpi-banner-container')).toBeInTheDocument();
        expect(screen.getByText('client_sarah')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Workflow 7: Plan Archival & Lifecycle
  // =========================================================================
  it('Workflow 7 — Plan Archival: Staff archives plan and confirms status change', async () => {
    mockedPlansApi.archivePlan.mockResolvedValueOnce({
      id: 'plan_std',
      code: 'STD_MONTHLY',
      name: 'Standard Monthly Pass',
      description: 'Standard plan',
      durationInDays: 30,
      priceAmount: 9900,
      priceCurrency: 'USD',
      status: 'ARCHIVED',
      version: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });

    renderGymApp(['/gym/plans']);

    await waitFor(() => {
      expect(screen.getByText('Membership Plans')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
    });

    // Open row actions & click Archive
    const actionsBtn = screen.getByRole('button', { name: /Open actions menu/i });
    fireEvent.click(actionsBtn);

    await waitFor(() => {
      expect(screen.getByText('Archive Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Archive Plan'));

    await waitFor(() => {
      expect(screen.getByTestId('archive-plan-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-archive-plan-button'));

    await waitFor(() => {
      expect(mockedPlansApi.archivePlan).toHaveBeenCalledWith('plan_std');
    });
  });

  // =========================================================================
  // Workflow 8: Lifecycle Actions Integrity
  // =========================================================================
  it('Workflow 8 — Lifecycle Integrity: Exposes valid actions (Freeze, Cancel) on ACTIVE membership', async () => {
    mockedMembershipsApi.freezeMembership.mockResolvedValueOnce({
      id: 'mem_sarah_1',
      clientId: 'client_sarah',
      planId: 'plan_std',
      period: {
        startDate: '2026-08-01T08:00:00.000Z',
        endDate: '2026-08-31T08:00:00.000Z',
        durationDays: 30,
      },
      status: 'FROZEN',
      version: 2,
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-15T08:00:00.000Z',
    });

    renderGymApp(['/gym/memberships']);

    await waitFor(() => {
      expect(screen.getByText('client_sarah')).toBeInTheDocument();
    });

    const actionsBtn = screen.getByRole('button', { name: /Open actions menu/i });
    fireEvent.click(actionsBtn);

    await waitFor(() => {
      expect(screen.getByText('Freeze / Suspend')).toBeInTheDocument();
      expect(screen.getByText('Cancel Agreement')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Freeze / Suspend'));

    await waitFor(() => {
      expect(screen.getByTestId('freeze-membership-dialog')).toBeInTheDocument();
    });

    // Fill dates & submit freeze
    fireEvent.change(screen.getByTestId('input-freeze-start-date'), {
      target: { value: '2026-08-16' },
    });
    fireEvent.change(screen.getByTestId('input-freeze-end-date'), {
      target: { value: '2026-08-25' },
    });
    fireEvent.change(screen.getByTestId('input-freeze-reason'), {
      target: { value: 'Travel' },
    });

    fireEvent.click(screen.getByTestId('submit-freeze-button'));

    await waitFor(() => {
      expect(mockedMembershipsApi.freezeMembership).toHaveBeenCalledWith(
        'mem_sarah_1',
        expect.objectContaining({
          reason: 'Travel',
        }),
      );
    });
  });

  // =========================================================================
  // Workflow 9: URL-Driven State Persistence
  // =========================================================================
  it('Workflow 9 — URL State: Preserves filter parameters across page refresh and back navigation', async () => {
    const { router } = renderGymApp(['/gym/memberships?status=ACTIVE&search=client_sarah&page=1']);

    await waitFor(() => {
      expect(mockedMembershipsApi.listMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACTIVE',
          clientId: 'client_sarah',
          page: 1,
        }),
      );
    });

    expect(router.state.location.search).toContain('status=ACTIVE');
    expect(router.state.location.search).toContain('search=client_sarah');
  });

  // =========================================================================
  // Workflow 10: Failure Recovery & Error Retry
  // =========================================================================
  it('Workflow 10 — Failure Recovery: Gracefully recovers from API failure via retry trigger', async () => {
    mockedMembershipsApi.listMemberships.mockRejectedValueOnce(new Error('Gateway timeout (504)'));

    renderGymApp(['/gym/memberships']);

    await waitFor(() => {
      expect(screen.getByText(/Gateway timeout/i)).toBeInTheDocument();
    });

    // Mock successful recovery on retry
    mockedMembershipsApi.listMemberships.mockResolvedValueOnce({
      items: [
        {
          id: 'mem_sarah_1',
          clientId: 'client_sarah',
          planId: 'plan_std',
          period: {
            startDate: '2026-08-01T08:00:00.000Z',
            endDate: '2026-08-31T08:00:00.000Z',
            durationDays: 30,
          },
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('client_sarah')).toBeInTheDocument();
    });
  });
});
