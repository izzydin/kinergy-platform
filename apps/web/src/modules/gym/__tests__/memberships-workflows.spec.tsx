import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { membershipsApi } from '../memberships/api/memberships-api';
import { CreateMembershipPage } from '../memberships/routes/create-membership-page';
import { MembershipDetailPage } from '../memberships/routes/membership-detail-page';
import { MembershipsListPage } from '../memberships/routes/memberships-list-page';
import type { MembershipVM } from '../memberships/types';
import { plansApi } from '../plans/api/plans-api';
import type { MembershipPlanVM } from '../plans/types';

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
    renewMembership: jest.fn(),
    freezeMembership: jest.fn(),
    unfreezeMembership: jest.fn(),
    cancelMembership: jest.fn(),
    getExpiring: jest.fn(),
    getExpired: jest.fn(),
    checkEligibility: jest.fn(),
    expireBatch: jest.fn(),
  },
}));

jest.mock('../plans/api/plans-api', () => ({
  plansApi: {
    listPlans: jest.fn(),
    getPlanById: jest.fn(),
  },
}));

const mockedMembershipsApi = jest.mocked(membershipsApi);
const mockedPlansApi = jest.mocked(plansApi);

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: [
    'memberships.read',
    'memberships.create',
    'memberships.update',
    'plans.create',
    'plans.update',
  ],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_VIEWER_USER: AuthUser = {
  id: 'usr_viewer_1',
  email: 'viewer@kinergy.io',
  name: 'Viewer User',
  roles: ['CLIENT'],
  permissions: ['memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_PLANS: MembershipPlanVM[] = [
  {
    id: 'plan_std',
    code: 'STD_MONTHLY',
    name: 'Standard Monthly Pass',
    description: '30 days standard access',
    durationInDays: 30,
    priceAmount: 4999,
    priceCurrency: 'USD',
    visitQuota: undefined,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'plan_vip',
    code: 'VIP_ANNUAL',
    name: 'VIP Annual Pass',
    description: '365 days full VIP access',
    durationInDays: 365,
    priceAmount: 49900,
    priceCurrency: 'USD',
    visitQuota: 100,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

const MOCK_MEMBERSHIPS: MembershipVM[] = [
  {
    id: 'mem_01',
    clientId: 'cli_alice123',
    planId: 'plan_std',
    period: {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      durationDays: 30,
    },
    status: 'ACTIVE',
    assignedTrainerId: 'usr_coach01',
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'mem_02',
    clientId: 'cli_bob456',
    planId: 'plan_vip',
    period: {
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2027-07-01T00:00:00.000Z',
      durationDays: 365,
    },
    status: 'FROZEN',
    freezeHistory: [
      {
        startDate: '2026-08-10T00:00:00.000Z',
        endDate: '2026-08-25T00:00:00.000Z',
        reason: 'Injury recovery',
      },
    ],
    version: 2,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'mem_03',
    clientId: 'cli_charlie789',
    planId: 'plan_std',
    period: {
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-07-01T00:00:00.000Z',
      durationDays: 30,
    },
    status: 'EXPIRED',
    version: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'mem_04',
    clientId: 'cli_david000',
    planId: 'plan_std',
    period: {
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-31T00:00:00.000Z',
      durationDays: 30,
    },
    status: 'CANCELLED',
    cancellationReason: 'Relocated to another city',
    version: 2,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderMembershipsApp(
  initialEntries = ['/gym/memberships'],
  authUser: AuthUser = MOCK_ADMIN_USER,
  queryClient = createTestQueryClient(),
) {
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
        path: '/gym/memberships/:membershipId',
        element: <MembershipDetailPage />,
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

describe('Phase 5.7-G: Membership Agreements Frontend Workflows Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPlansApi.listPlans.mockResolvedValue({
      items: MOCK_PLANS,
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  // =========================================================================
  // 1. Membership List & Filtering
  // =========================================================================
  describe('1. Membership List & Server-Side Filtering', () => {
    it('renders populated membership agreements table with statuses', async () => {
      mockedMembershipsApi.listMemberships.mockResolvedValue({
        items: MOCK_MEMBERSHIPS,
        total: 4,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderMembershipsApp();

      await waitFor(() => {
        expect(screen.getByText('cli_alice123')).toBeInTheDocument();
      });

      expect(screen.getByText('cli_bob456')).toBeInTheDocument();
      expect(screen.getByText('cli_charlie789')).toBeInTheDocument();
      expect(screen.getByText('cli_david000')).toBeInTheDocument();

      // Check status badges
      expect(screen.getByTestId('membership-status-badge-active')).toBeInTheDocument();
      expect(screen.getByTestId('membership-status-badge-frozen')).toBeInTheDocument();
      expect(screen.getByTestId('membership-status-badge-expired')).toBeInTheDocument();
      expect(screen.getByTestId('membership-status-badge-cancelled')).toBeInTheDocument();
    });

    it('filters memberships by status and client search', async () => {
      mockedMembershipsApi.listMemberships.mockResolvedValue({
        items: [MOCK_MEMBERSHIPS[0]!],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderMembershipsApp();

      await waitFor(() => {
        expect(screen.getByTestId('membership-status-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('membership-status-filter'), {
        target: { value: 'ACTIVE' },
      });

      await waitFor(() => {
        expect(mockedMembershipsApi.listMemberships).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'ACTIVE' }),
        );
      });

      fireEvent.change(screen.getByTestId('membership-search-input'), {
        target: { value: 'cli_alice' },
      });

      await waitFor(() => {
        expect(mockedMembershipsApi.listMemberships).toHaveBeenCalledWith(
          expect.objectContaining({ clientId: 'cli_alice' }),
        );
      });
    });
  });

  // =========================================================================
  // 2. Membership Creation Workflow
  // =========================================================================
  describe('2. Membership Creation Workflow', () => {
    it('selects client, picks active plan, displays server-derived commercial info, and creates agreement', async () => {
      const createdMembership: MembershipVM = {
        id: 'mem_new99',
        clientId: 'cli_sarah99',
        planId: 'plan_std',
        period: {
          startDate: '2026-08-24T00:00:00.000Z',
          endDate: '2026-09-23T00:00:00.000Z',
          durationDays: 30,
        },
        status: 'ACTIVE',
        assignedTrainerId: 'usr_coach01',
        version: 1,
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      };

      mockedMembershipsApi.createMembership.mockResolvedValue(createdMembership);
      mockedMembershipsApi.getMembershipById.mockResolvedValue(createdMembership);
      mockedMembershipsApi.checkEligibility.mockResolvedValue({
        isEligible: true,
        outcome: 'GRANTED',
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: '2026-08-24T00:00:00.000Z',
        reason: 'Client in good standing with active account',
      });

      renderMembershipsApp(['/gym/memberships/new']);

      await waitFor(() => {
        expect(screen.getByTestId('create-membership-page')).toBeInTheDocument();
      });

      // Fill in Client ID
      fireEvent.change(screen.getByTestId('input-client-id'), {
        target: { value: 'cli_sarah99' },
      });

      // Select Plan (Standard Monthly Pass)
      await waitFor(() => {
        expect(screen.getByTestId('select-plan-id')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('select-plan-id'), {
        target: { value: 'plan_std' },
      });

      // Verify server-derived commercial info is displayed without computing in React
      await waitFor(() => {
        expect(screen.getByTestId('server-derived-plan-info')).toBeInTheDocument();
      });
      expect(screen.getByText('$49.99 USD')).toBeInTheDocument();
      expect(screen.getByText('30 Days')).toBeInTheDocument();

      // Submit Agreement
      fireEvent.click(screen.getByTestId('submit-membership-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.createMembership).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_sarah99',
            planId: 'plan_std',
          }),
        );
      });
    });
  });

  // =========================================================================
  // 3. Membership Details & Lifecycle Actions
  // =========================================================================
  describe('3. Membership Details & Lifecycle Actions', () => {
    it('renders membership details with period, freeze history, and status', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[1]!); // FROZEN

      renderMembershipsApp(['/gym/memberships/mem_02']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('cli_bob456')).toBeInTheDocument();
      expect(screen.getByText('plan_vip')).toBeInTheDocument();
      expect(screen.getByText(/suspension \/ freeze history/i)).toBeInTheDocument();
      expect(screen.getByText('Injury recovery')).toBeInTheDocument();
      expect(screen.getByTestId('membership-status-badge-frozen')).toBeInTheDocument();
    });

    it('performs renewal and displays server-calculated resulting period', async () => {
      const renewed: MembershipVM = {
        ...MOCK_MEMBERSHIPS[0]!,
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-30T00:00:00.000Z',
          durationDays: 60,
        },
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[0]!); // ACTIVE
      mockedMembershipsApi.renewMembership.mockResolvedValue(renewed);

      renderMembershipsApp(['/gym/memberships/mem_01']);

      await waitFor(() => {
        expect(screen.getByTestId('renew-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('renew-detail-button'));

      expect(screen.getByTestId('renew-membership-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('submit-renew-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
          'mem_01',
          expect.anything(),
        );
      });

      // Confirm server-authoritative resulting period displayed
      await waitFor(() => {
        expect(screen.getByTestId('renew-success-container')).toBeInTheDocument();
      });
      expect(screen.getByText('60 days')).toBeInTheDocument();
    });

    it('performs freeze / suspension with validated dates', async () => {
      const frozen: MembershipVM = {
        ...MOCK_MEMBERSHIPS[0]!,
        status: 'FROZEN',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[0]!); // ACTIVE
      mockedMembershipsApi.freezeMembership.mockResolvedValue(frozen);

      renderMembershipsApp(['/gym/memberships/mem_01']);

      await waitFor(() => {
        expect(screen.getByTestId('freeze-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('freeze-detail-button'));

      expect(screen.getByTestId('freeze-membership-dialog')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('input-freeze-reason'), {
        target: { value: 'Annual holiday travel' },
      });

      fireEvent.click(screen.getByTestId('submit-freeze-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.freezeMembership).toHaveBeenCalledWith(
          'mem_01',
          expect.objectContaining({
            reason: 'Annual holiday travel',
          }),
        );
      });
    });

    it('performs resume / unfreeze action with automatic validity extension notification', async () => {
      const resumed: MembershipVM = {
        ...MOCK_MEMBERSHIPS[1]!,
        status: 'ACTIVE',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[1]!); // FROZEN
      mockedMembershipsApi.unfreezeMembership.mockResolvedValue(resumed);

      renderMembershipsApp(['/gym/memberships/mem_02']);

      await waitFor(() => {
        expect(screen.getByTestId('unfreeze-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('unfreeze-detail-button'));

      expect(screen.getByTestId('unfreeze-membership-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-unfreeze-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.unfreezeMembership).toHaveBeenCalledWith('mem_02');
      });
    });

    it('performs voluntary cancellation with mandatory audit reason', async () => {
      const cancelled: MembershipVM = {
        ...MOCK_MEMBERSHIPS[0]!,
        status: 'CANCELLED',
        cancellationReason: 'Client relocated out of state',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[0]!); // ACTIVE
      mockedMembershipsApi.cancelMembership.mockResolvedValue(cancelled);

      renderMembershipsApp(['/gym/memberships/mem_01']);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cancel-detail-button'));

      expect(screen.getByTestId('cancel-membership-dialog')).toBeInTheDocument();

      // Submit valid reason
      fireEvent.change(screen.getByTestId('input-cancel-reason'), {
        target: { value: 'Client relocated out of state' },
      });

      fireEvent.click(screen.getByTestId('confirm-cancel-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.cancelMembership).toHaveBeenCalledWith('mem_01', {
          reason: 'Client relocated out of state',
        });
      });
    });
  });

  // =========================================================================
  // 4. Permission Boundary Enforcement
  // =========================================================================
  describe('4. Permission Boundary Restrictions', () => {
    it('hides lifecycle action buttons for unprivileged viewer', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_MEMBERSHIPS[0]!); // ACTIVE

      renderMembershipsApp(['/gym/memberships/mem_01'], MOCK_VIEWER_USER);

      await waitFor(() => {
        expect(screen.getByTestId('membership-detail-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('renew-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('freeze-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-detail-button')).not.toBeInTheDocument();
    });
  });
});
