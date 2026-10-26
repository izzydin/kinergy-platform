import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { membershipsApi } from '../api/memberships-api';
import { CreateMembershipPage } from '../routes/create-membership-page';
import { MembershipDetailPage } from '../routes/membership-detail-page';
import { MembershipsListPage } from '../routes/memberships-list-page';
import type { MembershipVM } from '../types';
import { plansApi } from '../../plans/api/plans-api';
import type { MembershipPlanVM } from '../../plans/types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API modules
jest.mock('../api/memberships-api', () => ({
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

jest.mock('../../plans/api/plans-api', () => ({
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
  permissions: ['memberships.read', 'memberships.create', 'memberships.update'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_RECEPTIONIST_USER: AuthUser = {
  id: 'usr_reception_1',
  email: 'reception@kinergy.io',
  name: 'Desk Staff',
  roles: ['RECEPTIONIST'],
  permissions: ['memberships.read', 'memberships.create', 'memberships.update'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_VIEWER_USER: AuthUser = {
  id: 'usr_viewer_1',
  email: 'member@kinergy.io',
  name: 'Gym Member',
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

const MOCK_ACTIVE_MEMBERSHIP: MembershipVM = {
  id: 'mem_act_01',
  clientId: 'cli_john123',
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
};

const MOCK_FROZEN_MEMBERSHIP: MembershipVM = {
  id: 'mem_frz_01',
  clientId: 'cli_sarah456',
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
      reason: 'Medical recovery after knee surgery',
    },
  ],
  version: 2,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

const MOCK_EXPIRED_MEMBERSHIP: MembershipVM = {
  id: 'mem_exp_01',
  clientId: 'cli_mike789',
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
};

const MOCK_CANCELLED_MEMBERSHIP: MembershipVM = {
  id: 'mem_cnc_01',
  clientId: 'cli_anna000',
  planId: 'plan_std',
  period: {
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-31T00:00:00.000Z',
    durationDays: 30,
  },
  status: 'CANCELLED',
  cancellationReason: 'Relocated out of state',
  version: 2,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const MOCK_PENDING_MEMBERSHIP: MembershipVM = {
  id: 'mem_pnd_01',
  clientId: 'cli_future111',
  planId: 'plan_vip',
  period: {
    startDate: '2026-12-01T00:00:00.000Z',
    endDate: '2027-12-01T00:00:00.000Z',
    durationDays: 365,
  },
  status: 'PENDING',
  version: 1,
  createdAt: '2026-10-26T18:00:00.000Z',
  updatedAt: '2026-10-26T18:00:00.000Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderMembershipsModule(
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

describe('Milestone 6.4: Gym Membership Enrollment & Lifecycle Spec', () => {
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
  // 1. Guided Enrollment Workflow & Domain Safeguards
  // =========================================================================
  describe('1. Guided Enrollment Workflow & Input Invariants', () => {
    it('renders enrollment form with plan pricing, duration, and proposed interval review summary', async () => {
      mockedMembershipsApi.checkEligibility.mockResolvedValue({
        isEligible: false,
        outcome: 'NO_MEMBERSHIP',
        membershipId: null,
        planId: null,
        period: null,
        evaluatedAt: '2026-10-26T18:00:00.000Z',
        reason: 'Client has no recorded active gym membership agreements.',
      });

      renderMembershipsModule(['/gym/memberships/new']);

      await waitFor(() => {
        expect(screen.getByTestId('create-membership-page')).toBeInTheDocument();
      });

      // Fill Client ID
      const clientInput = screen.getByTestId('input-client-id');
      fireEvent.change(clientInput, { target: { value: 'cli_john123' } });

      await waitFor(() => {
        expect(screen.getByTestId('client-eligibility-preview')).toBeInTheDocument();
      });
      expect(screen.getByText(/NO_MEMBERSHIP/i)).toBeInTheDocument();

      // Select Plan
      const planSelect = screen.getByTestId('select-plan-id');
      fireEvent.change(planSelect, { target: { value: 'plan_std' } });

      // Verifies server-derived commercial info display
      await waitFor(() => {
        expect(screen.getByTestId('server-derived-plan-info')).toBeInTheDocument();
      });
      expect(screen.getByText('$49.99 USD')).toBeInTheDocument();
      expect(screen.getByText('30 Days')).toBeInTheDocument();
      expect(screen.getByText('Unlimited')).toBeInTheDocument();

      // Verifies Step 4 Review Agreement & Proposed Interval Summary
      expect(screen.getByTestId('enrollment-review-summary')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('enrollment-review-summary')).getByText('cli_john123'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('enrollment-review-summary')).getByText(
          /Standard Monthly Pass — \$49.99 USD/i,
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('enrollment-review-summary')).getByText(/30 days duration/i),
      ).toBeInTheDocument();
    });

    it('preserves form input and displays inline error alert upon backend overlap rejection', async () => {
      mockedMembershipsApi.createMembership.mockRejectedValueOnce(
        new Error(
          "Client 'cli_john123' already has an active or overlapping membership for this period.",
        ),
      );

      renderMembershipsModule(['/gym/memberships/new']);

      await waitFor(() => {
        expect(screen.getByTestId('input-client-id')).toBeInTheDocument();
      });

      const clientInput = screen.getByTestId('input-client-id');
      const planSelect = screen.getByTestId('select-plan-id');

      fireEvent.change(clientInput, { target: { value: 'cli_john123' } });
      fireEvent.change(planSelect, { target: { value: 'plan_std' } });

      const submitBtn = screen.getByTestId('submit-membership-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('create-membership-error-alert')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/already has an active or overlapping membership for this period/i),
      ).toBeInTheDocument();

      // Preserves form values on recoverable failure so operator doesn't retype everything
      expect(clientInput).toHaveValue('cli_john123');
      expect(planSelect).toHaveValue('plan_std');
    });

    it('prevents duplicate submissions by disabling submit button during pending mutation', async () => {
      let resolveCreation: (val: MembershipVM) => void;
      const deferredPromise = new Promise<MembershipVM>((resolve) => {
        resolveCreation = resolve;
      });
      mockedMembershipsApi.createMembership.mockReturnValue(deferredPromise);

      renderMembershipsModule(['/gym/memberships/new']);

      await waitFor(() => {
        expect(screen.getByTestId('input-client-id')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('input-client-id'), {
        target: { value: 'cli_new_client' },
      });
      fireEvent.change(screen.getByTestId('select-plan-id'), { target: { value: 'plan_std' } });

      const submitBtn = screen.getByTestId('submit-membership-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
      });
      expect(screen.getByText('Creating Agreement...')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-membership-creation-button')).toBeDisabled();

      // Resolve successfully
      resolveCreation!({
        id: 'mem_new_created',
        clientId: 'cli_new_client',
        planId: 'plan_std',
        period: {
          startDate: '2026-10-26T00:00:00.000Z',
          endDate: '2026-11-25T00:00:00.000Z',
          durationDays: 30,
        },
        status: 'ACTIVE',
        version: 1,
        createdAt: '2026-10-26T18:00:00.000Z',
        updatedAt: '2026-10-26T18:00:00.000Z',
      });

      await waitFor(() => {
        expect(mockedMembershipsApi.createMembership).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_new_client',
            planId: 'plan_std',
          }),
        );
      });
    });
  });

  // =========================================================================
  // 2. Authoritative Details Presentation & Invariants Policies
  // =========================================================================
  describe('2. Authoritative Details Presentation & Policy Card', () => {
    it('displays active membership details and domain lifecycle policies card', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_act_01']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-detail-page')).toBeInTheDocument();
      });

      // Verify header, ID, status badge
      expect(screen.getByText(/ID: mem_act_01/i)).toBeInTheDocument();
      expect(screen.getByTestId('membership-status-badge-active')).toBeInTheDocument();
      expect(screen.getByText('cli_john123')).toBeInTheDocument();
      expect(screen.getByText('plan_std')).toBeInTheDocument();

      // Verify domain policies card
      const policyCard = screen.getByTestId('membership-lifecycle-policy-card');
      expect(policyCard).toBeInTheDocument();
      expect(within(policyCard).getByText(/Authoritative Date Derivation/i)).toBeInTheDocument();
      expect(within(policyCard).getByText(/Gapless Renewals/i)).toBeInTheDocument();
      expect(within(policyCard).getByText(/Suspension & Extension/i)).toBeInTheDocument();
      expect(within(policyCard).getByText(/Voluntary Termination/i)).toBeInTheDocument();
    });

    it('displays suspension badge and freeze history audit trail for frozen membership', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_FROZEN_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_frz_01']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-status-badge-frozen')).toBeInTheDocument();
      });

      expect(screen.getByText(/Suspension \/ Freeze History \(1\)/i)).toBeInTheDocument();
      expect(screen.getByTestId('freeze-history-row-0')).toBeInTheDocument();
      expect(screen.getByText('Medical recovery after knee surgery')).toBeInTheDocument();

      // Ensure Resume Access button is visible
      expect(screen.getByTestId('unfreeze-detail-button')).toBeInTheDocument();
    });

    it('displays termination notice and cancellation reason for cancelled membership', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_CANCELLED_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_cnc_01']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-status-badge-cancelled')).toBeInTheDocument();
      });

      expect(screen.getByText(/Agreement Terminated/i)).toBeInTheDocument();
      expect(screen.getByText(/Reason: Relocated out of state/i)).toBeInTheDocument();

      // No renewal or freeze actions allowed on terminal cancelled state
      expect(screen.queryByTestId('renew-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('freeze-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('unfreeze-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-detail-button')).not.toBeInTheDocument();
    });

    it('displays pending status badge and allows cancellation for scheduled pending memberships', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_PENDING_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_pnd_01']);

      await waitFor(() => {
        expect(screen.getByTestId('membership-status-badge-pending')).toBeInTheDocument();
      });

      // Pending agreements can be cancelled before becoming active
      expect(screen.getByTestId('cancel-detail-button')).toBeInTheDocument();
      // Cannot freeze or unfreeze a pending membership
      expect(screen.queryByTestId('freeze-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('unfreeze-detail-button')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Lifecycle Actions: Renew, Freeze, Unfreeze, Cancel
  // =========================================================================
  describe('3. Lifecycle Operations & Edge Case Handling', () => {
    it('performs gapless renewal on active membership and displays authoritative resulting dates', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);
      mockedMembershipsApi.renewMembership.mockResolvedValueOnce({
        ...MOCK_ACTIVE_MEMBERSHIP,
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-30T00:00:00.000Z',
          durationDays: 60,
        },
        version: 2,
      });

      renderMembershipsModule(['/gym/memberships/mem_act_01']);

      await waitFor(() => {
        expect(screen.getByTestId('renew-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('renew-detail-button'));

      expect(screen.getByTestId('renew-membership-dialog')).toBeInTheDocument();

      const submitRenewBtn = screen.getByTestId('submit-renew-button');
      fireEvent.click(submitRenewBtn);

      await waitFor(() => {
        expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
          'mem_act_01',
          expect.objectContaining({
            newPlanId: undefined,
            effectiveDate: undefined,
          }),
        );
      });

      // Authoritative recalculated period displayed in confirmation
      await waitFor(() => {
        expect(screen.getByTestId('renew-success-container')).toBeInTheDocument();
      });
      expect(screen.getByText('60 days')).toBeInTheDocument();
    });

    it('renews an expired membership establishing a new active period without penalty fees', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_EXPIRED_MEMBERSHIP);
      mockedMembershipsApi.renewMembership.mockResolvedValueOnce({
        ...MOCK_EXPIRED_MEMBERSHIP,
        status: 'ACTIVE',
        period: {
          startDate: '2026-10-26T00:00:00.000Z',
          endDate: '2026-11-25T00:00:00.000Z',
          durationDays: 30,
        },
        version: 2,
      });

      renderMembershipsModule(['/gym/memberships/mem_exp_01']);

      await waitFor(() => {
        expect(screen.getByTestId('renew-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('renew-detail-button'));

      fireEvent.click(screen.getByTestId('submit-renew-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
          'mem_exp_01',
          expect.anything(),
        );
      });
    });

    it('displays inline error alert upon renewal rejection without dismissing dialog', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);
      mockedMembershipsApi.renewMembership.mockRejectedValueOnce(
        new Error(
          "Membership plan 'STD_MONTHLY' is not active or available for renewal (status: ARCHIVED).",
        ),
      );

      renderMembershipsModule(['/gym/memberships/mem_act_01']);

      await waitFor(() => {
        expect(screen.getByTestId('renew-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('renew-detail-button'));

      const submitRenewBtn = screen.getByTestId('submit-renew-button');
      fireEvent.click(submitRenewBtn);

      await waitFor(() => {
        expect(screen.getByTestId('renew-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/not active or available for renewal/i)).toBeInTheDocument();
      // Dialog remains open for user review
      expect(screen.getByTestId('renew-membership-dialog')).toBeInTheDocument();
    });

    it('freezes active membership with validated date window and explains suspension consequences', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);
      mockedMembershipsApi.freezeMembership.mockResolvedValueOnce({
        ...MOCK_ACTIVE_MEMBERSHIP,
        status: 'FROZEN',
        version: 2,
      });

      renderMembershipsModule(['/gym/memberships/mem_act_01']);

      await waitFor(() => {
        expect(screen.getByTestId('freeze-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('freeze-detail-button'));

      expect(screen.getByTestId('freeze-membership-dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/During the freeze window, gym access check-in eligibility is denied/i),
      ).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('input-freeze-start-date'), {
        target: { value: '2026-08-10' },
      });
      fireEvent.change(screen.getByTestId('input-freeze-end-date'), {
        target: { value: '2026-08-20' },
      });
      fireEvent.change(screen.getByTestId('input-freeze-reason'), {
        target: { value: 'Business travel out of city' },
      });

      fireEvent.click(screen.getByTestId('submit-freeze-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.freezeMembership).toHaveBeenCalledWith(
          'mem_act_01',
          expect.objectContaining({
            startDate: '2026-08-10T00:00:00.000Z',
            endDate: '2026-08-20T00:00:00.000Z',
            reason: 'Business travel out of city',
          }),
        );
      });
    });

    it('resumes frozen membership and confirms server validity extension', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_FROZEN_MEMBERSHIP);
      mockedMembershipsApi.unfreezeMembership.mockResolvedValueOnce({
        ...MOCK_FROZEN_MEMBERSHIP,
        status: 'ACTIVE',
        period: {
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2027-07-16T00:00:00.000Z', // 15 days added
          durationDays: 380,
        },
        version: 3,
      });

      renderMembershipsModule(['/gym/memberships/mem_frz_01']);

      await waitFor(() => {
        expect(screen.getByTestId('unfreeze-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('unfreeze-detail-button'));

      expect(screen.getByTestId('unfreeze-membership-dialog')).toBeInTheDocument();
      expect(
        screen.getByText(
          /The server will calculate the exact days spent suspended and extend the agreement/i,
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-unfreeze-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.unfreezeMembership).toHaveBeenCalledWith('mem_frz_01');
      });
    });

    it('requires mandatory cancellation reason and explains retention and no-refund policy', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);
      mockedMembershipsApi.cancelMembership.mockResolvedValueOnce({
        ...MOCK_ACTIVE_MEMBERSHIP,
        status: 'CANCELLED',
        cancellationReason: 'Client moved abroad permanently',
        version: 2,
      });

      renderMembershipsModule(['/gym/memberships/mem_act_01']);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-detail-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cancel-detail-button'));

      expect(screen.getByTestId('cancel-membership-dialog')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Historical records are retained for auditing; no automated refund is issued/i,
        ),
      ).toBeInTheDocument();

      const reasonInput = screen.getByTestId('input-cancel-reason');
      fireEvent.change(reasonInput, { target: { value: 'Client moved abroad permanently' } });

      fireEvent.click(screen.getByTestId('confirm-cancel-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.cancelMembership).toHaveBeenCalledWith(
          'mem_act_01',
          expect.objectContaining({
            reason: 'Client moved abroad permanently',
          }),
        );
      });
    });
  });

  // =========================================================================
  // 4. Role Authorization & Permissions
  // =========================================================================
  describe('4. Role Authorization & Permissions', () => {
    it('permits receptionist role to perform enrollment and manage lifecycle', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_act_01'], MOCK_RECEPTIONIST_USER);

      await waitFor(() => {
        expect(screen.getByTestId('membership-detail-page')).toBeInTheDocument();
      });

      // Receptionist has permissions to renew, freeze, and cancel
      expect(screen.getByTestId('renew-detail-button')).toBeInTheDocument();
      expect(screen.getByTestId('freeze-detail-button')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-detail-button')).toBeInTheDocument();
    });

    it('restricts lifecycle mutations for unprivileged viewer client role', async () => {
      mockedMembershipsApi.getMembershipById.mockResolvedValue(MOCK_ACTIVE_MEMBERSHIP);

      renderMembershipsModule(['/gym/memberships/mem_act_01'], MOCK_VIEWER_USER);

      await waitFor(() => {
        expect(screen.getByTestId('membership-detail-page')).toBeInTheDocument();
      });

      // Viewer cannot perform lifecycle actions
      expect(screen.queryByTestId('renew-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('freeze-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-detail-button')).not.toBeInTheDocument();
    });
  });
});
