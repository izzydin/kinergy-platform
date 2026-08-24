import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { trainerDashboardApi } from '../trainer-dashboard/api/trainer-dashboard-api';
import { TrainerDashboardPage } from '../trainer-dashboard/routes/trainer-dashboard-page';
import {
  AccessResult,
  CheckInMethod,
  ExpiringMembershipItemVM,
  PaginatedAssignedClientsVM,
  TrainerAttendanceResponseVM,
  TrainerDashboardSummaryVM,
} from '../trainer-dashboard/types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layers
jest.mock('../trainer-dashboard/api/trainer-dashboard-api', () => ({
  trainerDashboardApi: {
    getSummary: jest.fn(),
    getAssignedClients: jest.fn(),
    getExpiringMemberships: jest.fn(),
    getAttendance: jest.fn(),
  },
}));

jest.mock('../attendance/api/attendance-api', () => ({
  attendanceApi: {
    searchClients: jest.fn(),
    checkEligibility: jest.fn(),
    recordCheckIn: jest.fn(),
    getToday: jest.fn(),
    getClientHistory: jest.fn(),
  },
}));

const mockedTrainerApi = jest.mocked(trainerDashboardApi);
const mockedAttendanceApi = jest.mocked(attendanceApi);

const MOCK_TRAINER_USER: AuthUser = {
  id: 'usr_coach_01',
  email: 'coach.alex@kinergy.io',
  name: 'Coach Alex',
  roles: ['Trainer'],
  permissions: ['clients.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_SUMMARY: TrainerDashboardSummaryVM = {
  totalAssignedClients: 12,
  activeMembershipsCount: 10,
  expiringSoonMembershipsCount: 3,
  frozenMembershipsCount: 1,
  todayGrantedCheckInsCount: 5,
  asOfDate: '2026-08-24',
  horizonDays: 7,
};

const MOCK_ASSIGNED_CLIENTS: PaginatedAssignedClientsVM = {
  items: [
    {
      membershipId: 'mem_01',
      clientId: 'cli_sarah123',
      planId: 'STD_MONTHLY',
      planName: 'Standard Monthly Pass',
      status: 'ACTIVE',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      daysRemaining: 7,
      isExpiringSoon: true,
      isExpired: false,
      isCurrentlyFrozen: false,
      assignedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      membershipId: 'mem_02',
      clientId: 'cli_bob456',
      planId: 'VIP_ANNUAL',
      planName: 'VIP Annual Pass',
      status: 'FROZEN',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2027-07-01T00:00:00.000Z',
      daysRemaining: 310,
      isExpiringSoon: false,
      isExpired: false,
      isCurrentlyFrozen: true,
      assignedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const MOCK_EXPIRING_ITEMS: ExpiringMembershipItemVM[] = [
  {
    membershipId: 'mem_01',
    clientId: 'cli_sarah123',
    planId: 'STD_MONTHLY',
    planName: 'Standard Monthly Pass',
    status: 'ACTIVE',
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-31T00:00:00.000Z',
    daysRemaining: 7,
    isExpiringSoon: true,
    isExpired: false,
  },
];

const MOCK_TRAINER_ATTENDANCE: TrainerAttendanceResponseVM = {
  items: [
    {
      id: 'att_01',
      clientId: 'cli_sarah123',
      membershipId: 'mem_01',
      checkInTime: '2026-08-24T08:15:00.000Z',
      gymDay: '2026-08-24',
      method: CheckInMethod.MANUAL_RECEPTION,
      result: AccessResult.GRANTED,
      gateId: 'turnstile_main',
    },
  ],
  total: 1,
  grantedCount: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderTrainerApp(
  initialEntries = ['/gym/trainer-dashboard'],
  authUser: AuthUser = MOCK_TRAINER_USER,
  queryClient = createTestQueryClient(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/gym/trainer-dashboard',
        element: <TrainerDashboardPage />,
      },
    ],
    { initialEntries },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={authUser}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Phase 5.7-H: Trainer Dashboard Operational Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrainerApi.getSummary.mockResolvedValue(MOCK_SUMMARY);
    mockedTrainerApi.getAssignedClients.mockResolvedValue(MOCK_ASSIGNED_CLIENTS);
    mockedTrainerApi.getExpiringMemberships.mockResolvedValue({
      items: MOCK_EXPIRING_ITEMS,
      total: 1,
      horizonDays: 7,
    });
    mockedTrainerApi.getAttendance.mockResolvedValue(MOCK_TRAINER_ATTENDANCE);
  });

  // =========================================================================
  // 1. Authoritative Top-Line Operational Summary KPIs
  // =========================================================================
  describe('1. Trainer Summary KPI Banner', () => {
    it('renders aggregated summary counts for the authenticated trainer', async () => {
      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('kpi-banner-container')).toBeInTheDocument();
      });

      const banner = screen.getByTestId('kpi-banner-container');

      await waitFor(() => {
        expect(within(banner).getByText('12')).toBeInTheDocument(); // Total Assigned
      });
      expect(within(banner).getByText('10')).toBeInTheDocument(); // Active Memberships
      expect(within(banner).getByText('3')).toBeInTheDocument(); // Expiring Soon
      expect(within(banner).getByText('1')).toBeInTheDocument(); // Frozen
      expect(within(banner).getByText('5')).toBeInTheDocument(); // Today Check-ins
    });
  });

  // =========================================================================
  // 2. Assigned Clients Roster
  // =========================================================================
  describe('2. Assigned Clients Roster', () => {
    it('renders assigned client memberships with days remaining and status badges', async () => {
      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('assigned-clients-table-container')).toBeInTheDocument();
      });

      const tableContainer = screen.getByTestId('assigned-clients-table-container');

      await waitFor(() => {
        expect(within(tableContainer).getByText('cli_sarah123')).toBeInTheDocument();
      });
      expect(within(tableContainer).getByText('Standard Monthly Pass')).toBeInTheDocument();
      expect(within(tableContainer).getByText('cli_bob456')).toBeInTheDocument();
      expect(within(tableContainer).getByText('VIP Annual Pass')).toBeInTheDocument();

      // Check status badges within table
      expect(within(tableContainer).getByTestId('status-badge-active')).toBeInTheDocument();
      expect(within(tableContainer).getByTestId('status-badge-frozen')).toBeInTheDocument();
    });

    it('filters assigned roster by membership status', async () => {
      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('status-filter-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('status-filter-select'), {
        target: { value: 'ACTIVE' },
      });

      await waitFor(() => {
        expect(mockedTrainerApi.getAssignedClients).toHaveBeenCalledWith(
          expect.objectContaining({ statuses: ['ACTIVE'] }),
        );
      });
    });
  });

  // =========================================================================
  // 3. Expiring Soon Memberships & Today's Attendance
  // =========================================================================
  describe('3. Expiring Memberships & Live Attendance Arrival Feed', () => {
    it('renders expiring soon memberships within 7-day lookahead horizon', async () => {
      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('expiring-memberships-section')).toBeInTheDocument();
      });

      const expiringSection = screen.getByTestId('expiring-memberships-section');

      await waitFor(() => {
        expect(within(expiringSection).getByText('Client ID: cli_sarah123')).toBeInTheDocument();
      });
      expect(within(expiringSection).getByText(/7d remaining/i)).toBeInTheDocument();
    });

    it('renders live arrivals feed scoped to trainer assigned clients', async () => {
      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('trainer-attendance-feed')).toBeInTheDocument();
      });

      const feedContainer = screen.getByTestId('trainer-attendance-feed');

      await waitFor(() => {
        expect(within(feedContainer).getByTestId('trainer-checkin-att_01')).toBeInTheDocument();
      });
      expect(within(feedContainer).getByText('Client: cli_sarah123')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Quick Client Lookup & Inspection
  // =========================================================================
  describe('4. Quick Client Lookup & Real-Time Eligibility Inspection', () => {
    it('searches and displays authoritative membership eligibility inside lookup card', async () => {
      mockedAttendanceApi.searchClients.mockResolvedValue([
        {
          id: 'cli_sarah123',
          fullName: 'Sarah Connor',
          email: 'sarah@resistance.io',
          status: 'ACTIVE',
        },
      ]);

      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_sarah123',
        isEligible: true,
        outcome: 'GRANTED',
        membershipId: 'mem_01',
        planId: 'STD_MONTHLY',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-24T12:00:00.000Z',
        reason: null,
      });

      renderTrainerApp();

      await waitFor(() => {
        expect(screen.getByTestId('trainer-client-lookup-card')).toBeInTheDocument();
      });

      const lookupCard = screen.getByTestId('trainer-client-lookup-card');
      const lookupInput = within(lookupCard).getByTestId('client-search-input');
      fireEvent.change(lookupInput, { target: { value: 'Sarah' } });

      await waitFor(() => {
        expect(
          within(lookupCard).getByTestId('client-search-item-cli_sarah123'),
        ).toBeInTheDocument();
      });

      fireEvent.click(within(lookupCard).getByTestId('client-search-item-cli_sarah123'));

      await waitFor(() => {
        expect(within(lookupCard).getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });
      expect(within(lookupCard).getByTestId('eligibility-status-badge')).toHaveTextContent(
        '✓ ELIGIBLE TO ENTER',
      );
    });
  });
});
