import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { AttendancePage } from '../attendance/routes/attendance-page';
import { AccessResult, CheckInMethod } from '../attendance/types';
import { membershipsApi } from '../memberships/api/memberships-api';
import { MembershipsListPage } from '../memberships/routes/memberships-list-page';
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
    updatePlan: jest.fn(),
    activatePlan: jest.fn(),
    deactivatePlan: jest.fn(),
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

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['Admin', 'Receptionist', 'Trainer'],
  permissions: [
    'memberships.read',
    'memberships.create',
    'memberships.manage',
    'plans.read',
    'plans.write',
    'attendance.read',
    'attendance.create',
    'clients.read',
  ],
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

function renderAppWithRouter(initialEntries: string[]) {
  const queryClient = createTestQueryClient();

  const currentRouter = createMemoryRouter(
    [
      {
        path: '/gym/memberships',
        element: <MembershipsListPage />,
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
      <AuthProvider initialSessionOverride={MOCK_ADMIN_USER}>
        <NotificationProvider>
          <RouterProvider router={currentRouter} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...utils,
    router: currentRouter,
  };
}

describe('Phase 5.7-I: URL-Driven State & Operational UX Hardening Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedMembershipsApi.listMemberships.mockResolvedValue({
      items: [
        {
          id: 'mem_1',
          clientId: 'cli_sarah',
          planId: 'plan_gold',
          period: {
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-31T00:00:00.000Z',
            durationDays: 30,
          },
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      limit: 20,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    mockedPlansApi.listPlans.mockResolvedValue({
      items: [
        {
          id: 'plan_standard',
          code: 'STD_MONTHLY',
          name: 'Standard Monthly Pass',
          description: 'Standard plan',
          priceAmount: 99,
          priceCurrency: 'USD',
          durationInDays: 30,
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    mockedAttendanceApi.getToday.mockResolvedValue({
      items: [
        {
          id: 'att_01',
          clientId: 'cli_sarah',
          membershipId: 'mem_1',
          checkInTime: '2026-08-24T08:15:00.000Z',
          gymDay: '2026-08-24',
          facilityId: 'fac_main',
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
          gateId: 'turnstile_main',
          receptionistId: null,
          notes: null,
        },
      ],
      pagination: {
        page: 2,
        limit: 15,
        totalItems: 16,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
      dailySummary: {
        totalCheckIns: 16,
        grantedCount: 15,
        deniedCount: 1,
        uniqueClientsCount: 14,
      },
    });

    mockedAttendanceApi.getClientHistory.mockResolvedValue({
      items: [
        {
          id: 'att_01',
          clientId: 'cli_sarah',
          membershipId: 'mem_1',
          checkInTime: '2026-08-24T08:15:00.000Z',
          gymDay: '2026-08-24',
          facilityId: 'fac_main',
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
          gateId: 'turnstile_main',
          receptionistId: null,
          notes: null,
        },
      ],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      clientStats: {
        totalVisits: 12,
        firstVisitAt: '2026-01-01T00:00:00.000Z',
        lastVisitAt: '2026-08-24T08:15:00.000Z',
      },
    });

    mockedAttendanceApi.checkEligibility.mockResolvedValue({
      clientId: 'cli_sarah',
      isEligible: true,
      outcome: 'GRANTED',
      membershipId: 'mem_1',
      planId: 'STD_MONTHLY',
      period: {
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        durationDays: 30,
      },
      evaluatedAt: '2026-08-24T12:00:00.000Z',
      reason: null,
    });

    mockedTrainerApi.getSummary.mockResolvedValue({
      totalAssignedClients: 1,
      activeMembershipsCount: 1,
      expiringSoonMembershipsCount: 0,
      frozenMembershipsCount: 0,
      todayGrantedCheckInsCount: 1,
      asOfDate: '2026-08-24',
      horizonDays: 7,
    });

    mockedTrainerApi.getAssignedClients.mockResolvedValue({
      items: [
        {
          membershipId: 'mem_1',
          clientId: 'cli_sarah',
          planId: 'STD_MONTHLY',
          planName: 'Gold Unlimited',
          status: 'ACTIVE',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          daysRemaining: 7,
          isExpiringSoon: true,
          isExpired: false,
          isCurrentlyFrozen: false,
          assignedAt: '2026-08-01T00:00:00.000Z',
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
  // 1. Memberships URL State Synchronization & Parameter Preservation
  // =========================================================================
  describe('1. Memberships URL State Synchronization', () => {
    it('initializes from URL query string and passes parsed params to API', async () => {
      renderAppWithRouter(['/gym/memberships?status=ACTIVE&search=Sarah&page=2&limit=20']);

      await waitFor(() => {
        expect(mockedMembershipsApi.listMemberships).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'ACTIVE',
            clientId: 'Sarah',
            page: 2,
            limit: 20,
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('cli_sarah')).toBeInTheDocument();
      });
    });

    it('updating status filter updates URL and resets page to 1 while preserving search', async () => {
      const { router } = renderAppWithRouter([
        '/gym/memberships?status=ACTIVE&search=Sarah&page=2',
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('membership-status-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('membership-status-filter'), {
        target: { value: 'FROZEN' },
      });

      await waitFor(() => {
        const search = router.state.location.search;
        expect(search).toContain('status=FROZEN');
        expect(search).toContain('search=Sarah');
        expect(search).not.toContain('page=2'); // Resets to page 1
      });
    });
  });

  // =========================================================================
  // 2. Attendance Ingress URL State & History Deep-Linking
  // =========================================================================
  describe('2. Attendance Ingress URL State & History Deep-Linking', () => {
    it('initializes outcome and method filters from URL and syncs query', async () => {
      renderAppWithRouter(['/gym/attendance?result=GRANTED&method=QR_CODE&page=2']);

      await waitFor(() => {
        expect(mockedAttendanceApi.getToday).toHaveBeenCalledWith(
          expect.objectContaining({
            result: AccessResult.GRANTED,
            method: CheckInMethod.QR_CODE,
            page: 2,
          }),
        );
      });
    });

    it('opens client history modal automatically when historyClientId is present in URL', async () => {
      renderAppWithRouter(['/gym/attendance?historyClientId=cli_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('client-attendance-history-dialog')).toBeInTheDocument();
      });

      expect(mockedAttendanceApi.getClientHistory).toHaveBeenCalledWith(
        'cli_sarah',
        expect.anything(),
      );

      await waitFor(() => {
        expect(screen.getByTestId('stats-total-visits')).toHaveTextContent('12');
      });
    });

    it('hydrates selected member and authoritative eligibility card directly from clientId in URL', async () => {
      renderAppWithRouter(['/gym/attendance?clientId=cli_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });

      expect(mockedAttendanceApi.checkEligibility).toHaveBeenCalledWith('cli_sarah', undefined);
      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(
        '✓ ELIGIBLE TO ENTER',
      );
    });

    it('clearing member selection removes clientId from URL', async () => {
      const { router } = renderAppWithRouter(['/gym/attendance?clientId=cli_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('clear-client-selection-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('clear-client-selection-btn'));

      await waitFor(() => {
        expect(router.state.location.search).not.toContain('clientId=cli_sarah');
      });
    });
  });

  // =========================================================================
  // 3. Trainer Dashboard URL State & Client Deep-Linking
  // =========================================================================
  describe('3. Trainer Dashboard URL State & Client Deep-Linking', () => {
    it('hydrates roster filter and selected client card from URL parameters', async () => {
      renderAppWithRouter([
        '/gym/trainer-dashboard?status=ACTIVE&search=Gold&selectedClientId=cli_sarah',
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-inspection-card')).toBeInTheDocument();
      });

      const inspectionCard = screen.getByTestId('selected-client-inspection-card');
      expect(within(inspectionCard).getByText('Client ID:')).toBeInTheDocument();
      expect(within(inspectionCard).getByText('cli_sarah')).toBeInTheDocument();

      // Query sent with status filter
      expect(mockedTrainerApi.getAssignedClients).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['ACTIVE'],
        }),
      );
    });

    it('closing client inspection card cleanly updates URL parameter', async () => {
      const { router } = renderAppWithRouter(['/gym/trainer-dashboard?selectedClientId=cli_sarah']);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-inspection-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /✕ Close/i }));

      await waitFor(() => {
        expect(router.state.location.search).not.toContain('selectedClientId=cli_sarah');
      });
    });
  });

  // =========================================================================
  // 4. Operational UX Hardening, Error Recovery & Retry
  // =========================================================================
  describe('4. Operational UX Hardening & Error Recovery', () => {
    it('handles query error gracefully with retry trigger across attendance feed', async () => {
      mockedAttendanceApi.getToday.mockRejectedValueOnce(new Error('Network connection timeout'));

      renderAppWithRouter(['/gym/attendance']);

      await waitFor(() => {
        expect(screen.getByTestId('today-attendance-error')).toBeInTheDocument();
      });
      expect(screen.getByText(/Network connection timeout/i)).toBeInTheDocument();

      // Click retry
      mockedAttendanceApi.getToday.mockResolvedValueOnce({
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

      fireEvent.click(screen.getByRole('button', { name: /Retry Feed/i }));

      await waitFor(() => {
        expect(screen.getByTestId('today-attendance-empty')).toBeInTheDocument();
      });
    });
  });
});
