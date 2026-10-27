import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation/navigation-provider';
import { BreadcrumbProvider } from '../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../shared/ui/slots';
import { AppRouter } from '../../../app/routes/app-router';
import { NavigationBuilder } from '../../../app/navigation/navigation.builder';
import { defaultNavigationItems } from '../../../app/navigation/navigation.config';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { trainerDashboardApi } from '../trainer-dashboard/api/trainer-dashboard-api';
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

// Configure testing-library async timeouts for JSDOM under heavy test suite load
configure({ asyncUtilTimeout: 6000 });
jest.setTimeout(25000);

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

const AUTHORIZED_TRAINER: AuthUser = {
  id: 'usr_trainer_01',
  email: 'trainer.jordan@kinergy.io',
  name: 'Jordan Hayes',
  roles: ['Trainer'],
  permissions: ['clients.read'],
  tenantId: 'tenant_kinergy_master',
};

const UNAUTHORIZED_USER: AuthUser = {
  id: 'usr_billing_staff',
  email: 'billing@kinergy.io',
  name: 'Billing Staff',
  roles: ['Staff'],
  permissions: ['billing.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_SUMMARY: TrainerDashboardSummaryVM = {
  totalAssignedClients: 8,
  activeMembershipsCount: 6,
  expiringSoonMembershipsCount: 2,
  frozenMembershipsCount: 1,
  todayGrantedCheckInsCount: 4,
  asOfDate: '2026-10-27',
  horizonDays: 7,
};

const MOCK_ASSIGNED_CLIENTS: PaginatedAssignedClientsVM = {
  items: [
    {
      membershipId: 'mem_1001',
      clientId: 'cli_alexander',
      planId: 'PLAN_PRO',
      planName: 'Pro Athlete Pass',
      status: 'ACTIVE',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-11-01T00:00:00.000Z',
      daysRemaining: 5,
      isExpiringSoon: true,
      isExpired: false,
      isCurrentlyFrozen: false,
      assignedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      membershipId: 'mem_1002',
      clientId: 'cli_elena',
      planId: 'PLAN_BASIC',
      planName: 'Basic Monthly',
      status: 'FROZEN',
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-12-01T00:00:00.000Z',
      daysRemaining: 35,
      isExpiringSoon: false,
      isExpired: false,
      isCurrentlyFrozen: true,
      assignedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const MOCK_EXPIRING_ITEMS: ExpiringMembershipItemVM[] = [
  {
    membershipId: 'mem_1001',
    clientId: 'cli_alexander',
    planId: 'PLAN_PRO',
    planName: 'Pro Athlete Pass',
    status: 'ACTIVE',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-11-01T00:00:00.000Z',
    daysRemaining: 5,
    isExpiringSoon: true,
    isExpired: false,
  },
];

const MOCK_ATTENDANCE: TrainerAttendanceResponseVM = {
  items: [
    {
      id: 'att_77',
      clientId: 'cli_alexander',
      membershipId: 'mem_1001',
      checkInTime: '2026-10-27T08:00:00.000Z',
      gymDay: '2026-10-27',
      method: CheckInMethod.QR_CODE,
      result: AccessResult.GRANTED,
      gateId: 'turnstile_east',
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

function renderFullAppWithRoute(
  initialEntry: string,
  userOverride?: AuthUser | null,
  queryClient = createTestQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={userOverride}>
              <FeatureFlagProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </NotificationProvider>
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Milestone 6.5: Trainer Dashboard & Operational Summary Comprehensive Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrainerApi.getSummary.mockResolvedValue(MOCK_SUMMARY);
    mockedTrainerApi.getAssignedClients.mockResolvedValue(MOCK_ASSIGNED_CLIENTS);
    mockedTrainerApi.getExpiringMemberships.mockResolvedValue({
      items: MOCK_EXPIRING_ITEMS,
      total: 1,
      horizonDays: 7,
    });
    mockedTrainerApi.getAttendance.mockResolvedValue(MOCK_ATTENDANCE);
  });

  // =========================================================================
  // 1. Authorized and Unauthorized Navigation
  // =========================================================================
  describe('1. Navigation Authorization', () => {
    it('includes Trainer Dashboard in navigation tree when user has clients.read permission', () => {
      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: (perm) => perm === 'clients.read',
      });

      const coreSection = sections.find((s) => s.id === 'core');
      expect(coreSection).toBeDefined();

      const trainerItem = coreSection?.items.find((item) => item.id === 'trainer-dashboard');
      expect(trainerItem).toBeDefined();
      expect(trainerItem?.path).toBe('/gym/trainer-dashboard');
      expect(trainerItem?.label).toBe('Trainer Dashboard');
      expect(trainerItem?.requiredPermissions).toEqual(['clients.read']);
    });

    it('hides Trainer Dashboard from navigation when user lacks clients.read permission', () => {
      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: (perm) => perm === 'billing.read',
      });

      const allPaths = sections.flatMap((s) => s.items).map((i) => i.path);
      expect(allPaths).not.toContain('/gym/trainer-dashboard');
    });
  });

  // =========================================================================
  // 2. Direct Access to Protected Route & Security Boundaries
  // =========================================================================
  describe('2. Direct Route Access & Security Boundaries', () => {
    it('grants direct access to /gym/trainer-dashboard for authorized trainer', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: /Trainer Operational Dashboard/i }),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('trainer.jordan@kinergy.io')).toBeInTheDocument();
    });

    it('blocks direct navigation to /gym/trainer-dashboard with 403 Forbidden for unauthorized user', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', UNAUTHORIZED_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
      });

      // Protected trainer data must not leak
      expect(screen.queryByText(/Trainer Operational Dashboard/i)).not.toBeInTheDocument();
      expect(screen.queryByText('cli_alexander')).not.toBeInTheDocument();
    });

    it('redirects unauthenticated direct navigation to /auth/login with redirect param', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', null);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. Assigned-Client Query Behavior & Filtering
  // =========================================================================
  describe('3. Assigned-Client Query Behavior', () => {
    it('executes assigned clients query with correct trainer scoping and pagination', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(mockedTrainerApi.getAssignedClients).toHaveBeenCalledWith(
          expect.objectContaining({
            trainerId: 'usr_trainer_01',
            page: 1,
            limit: 10,
            sortBy: 'daysRemaining',
            sortOrder: 'ASC',
          }),
        );
      });
    });

    it('updates query parameters when filtering by membership status', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByTestId('status-filter-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('status-filter-select'), {
        target: { value: 'FROZEN' },
      });

      await waitFor(() => {
        expect(mockedTrainerApi.getAssignedClients).toHaveBeenCalledWith(
          expect.objectContaining({
            statuses: ['FROZEN'],
          }),
        );
      });
    });
  });

  // =========================================================================
  // 4. Populated Dashboard & Membership Links
  // =========================================================================
  describe('4. Populated Dashboard & Canonical Links', () => {
    it('renders assigned client rows with links to canonical client and membership pages', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByTestId('assigned-clients-table-container')).toBeInTheDocument();
      });

      const tableContainer = screen.getByTestId('assigned-clients-table-container');

      await waitFor(() => {
        expect(within(tableContainer).getByText('cli_alexander')).toBeInTheDocument();
      });

      // Verify canonical link to /clients/cli_alexander
      const clientLinks = screen.getAllByRole('link', { name: 'cli_alexander' });
      expect(clientLinks.length).toBeGreaterThan(0);
      expect(clientLinks[0]).toHaveAttribute('href', '/clients/cli_alexander');

      // Verify canonical link to /gym/memberships/mem_1001
      const membershipLinks = screen.getAllByRole('link', { name: 'mem_1001' });
      expect(membershipLinks.length).toBeGreaterThan(0);
      expect(membershipLinks[0]).toHaveAttribute('href', '/gym/memberships/mem_1001');

      // Verify status badges
      expect(screen.getByTestId('status-badge-active')).toHaveTextContent('ACTIVE');
      expect(screen.getByTestId('status-badge-frozen')).toHaveTextContent('FROZEN');
    });

    it('renders canonical links in expiring memberships section', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByTestId('expiring-memberships-section')).toBeInTheDocument();
      });

      const expiringSection = screen.getByTestId('expiring-memberships-section');

      await waitFor(() => {
        expect(
          within(expiringSection).getByRole('link', {
            name: 'Client ID: cli_alexander',
          }),
        ).toBeInTheDocument();
      });

      const expiringClientLink = within(expiringSection).getByRole('link', {
        name: 'Client ID: cli_alexander',
      });
      expect(expiringClientLink).toHaveAttribute('href', '/clients/cli_alexander');

      const expiringMemLink = within(expiringSection).getByRole('link', {
        name: 'Mem: mem_1001',
      });
      expect(expiringMemLink).toHaveAttribute('href', '/gym/memberships/mem_1001');
    });
  });

  // =========================================================================
  // 5. Empty Assignments State
  // =========================================================================
  describe('5. Empty Assignments State', () => {
    it('displays honest empty state message when trainer has zero assigned clients', async () => {
      mockedTrainerApi.getAssignedClients.mockResolvedValue({
        items: [],
        total: 0,
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
        totalPages: 1,
      });

      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByText('No assigned clients found')).toBeInTheDocument();
      });
      expect(
        screen.getByText('No clients are currently assigned to your roster.'),
      ).toBeInTheDocument();
      expect(screen.getByText('No memberships expiring soon')).toBeInTheDocument();
      expect(screen.getByText('No check-ins yet today')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. Section-Level Loading and Error Recovery
  // =========================================================================
  describe('6. Operational Resilience & Error Recovery', () => {
    it('handles KPI summary error gracefully with functional retry', async () => {
      mockedTrainerApi.getSummary.mockRejectedValue(new Error('Network error'));

      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(
        () => {
          expect(screen.getByTestId('kpi-banner-error')).toBeInTheDocument();
        },
        { timeout: 6000 },
      );

      expect(screen.getByText('Unable to load operational summary metrics.')).toBeInTheDocument();

      // Assigned clients roster remains accessible
      expect(screen.getByTestId('assigned-clients-table-container')).toBeInTheDocument();

      // Retry button calls getSummary again
      mockedTrainerApi.getSummary.mockResolvedValue(MOCK_SUMMARY);
      fireEvent.click(screen.getByRole('button', { name: /Retry Summary/i }));

      await waitFor(
        () => {
          expect(screen.queryByTestId('kpi-banner-error')).not.toBeInTheDocument();
        },
        { timeout: 10000 },
      );
    });

    it('refreshes all queries when "Refresh Dashboard" button is clicked', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh Dashboard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Refresh Dashboard/i }));

      await waitFor(() => {
        expect(mockedTrainerApi.getSummary).toHaveBeenCalledTimes(2);
        expect(mockedTrainerApi.getAssignedClients).toHaveBeenCalledTimes(2);
        expect(mockedTrainerApi.getExpiringMemberships).toHaveBeenCalledTimes(2);
        expect(mockedTrainerApi.getAttendance).toHaveBeenCalledTimes(2);
      });
    });
  });

  // =========================================================================
  // 7. Absence of Fabricated Metrics & Sensitive Data Leakage
  // =========================================================================
  describe('7. Absence of Fabricated Metrics & Sensitive Data Protection', () => {
    it('renders only verified backend metrics without client-side estimations', async () => {
      renderFullAppWithRoute('/gym/trainer-dashboard', AUTHORIZED_TRAINER);

      await waitFor(() => {
        expect(screen.getByTestId('kpi-banner-container')).toBeInTheDocument();
      });

      const banner = screen.getByTestId('kpi-banner-container');

      await waitFor(() => {
        expect(within(banner).getByText('8')).toBeInTheDocument(); // totalAssignedClients
      });
      expect(within(banner).getByText('6')).toBeInTheDocument(); // activeMembershipsCount
      expect(within(banner).getByText('2')).toBeInTheDocument(); // expiringSoonMembershipsCount
      expect(within(banner).getByText('1')).toBeInTheDocument(); // frozenMembershipsCount
      expect(within(banner).getByText('4')).toBeInTheDocument(); // todayGrantedCheckInsCount

      // Verify no invented metrics like "engagement rate", "attendance rate", or "churn"
      expect(screen.queryByText(/engagement rate/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/churn/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/attendance total/i)).not.toBeInTheDocument();

      // Verify commercial financial data is NOT exposed
      expect(screen.queryByText(/\$\d+/)).not.toBeInTheDocument();
      expect(screen.queryByText(/amount/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/clinical notes/i)).not.toBeInTheDocument();
    });
  });
});
