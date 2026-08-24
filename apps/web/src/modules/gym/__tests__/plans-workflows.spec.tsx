import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { plansApi } from '../plans/api/plans-api';
import { PlanDetailPage } from '../plans/routes/plan-detail-page';
import { PlansListPage } from '../plans/routes/plans-list-page';
import type { MembershipPlanVM } from '../plans/types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layer
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

const mockedPlansApi = jest.mocked(plansApi);

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: [
    'plans.create',
    'plans.update',
    'memberships.read',
    'memberships.create',
    'memberships.update',
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
    id: 'plan_01',
    code: 'STD_MONTHLY',
    name: 'Standard Monthly Pass',
    description: 'Full facility access with standard amenities',
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
    id: 'plan_02',
    code: 'DRAFT_ANNUAL',
    name: 'Draft Annual VIP',
    description: 'Upcoming 365 days package',
    durationInDays: 365,
    priceAmount: 49900,
    priceCurrency: 'USD',
    visitQuota: 100,
    status: 'DRAFT',
    version: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'plan_03',
    code: 'LEGACY_PUNCH',
    name: 'Legacy 10-Punch Card',
    description: 'Retired punch card system',
    durationInDays: 90,
    priceAmount: 2500,
    priceCurrency: 'USD',
    visitQuota: 10,
    status: 'ARCHIVED',
    version: 2,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
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

function renderPlansApp(
  initialEntries = ['/gym/plans'],
  authUser: AuthUser = MOCK_ADMIN_USER,
  queryClient = createTestQueryClient(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/gym/plans',
        element: <PlansListPage />,
      },
      {
        path: '/gym/plans/:planId',
        element: <PlanDetailPage />,
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

describe('Phase 5.7-G: Membership Plans Frontend Workflows Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Plan List & Filter States
  // =========================================================================
  describe('1. Plan Catalog List & Filters', () => {
    it('renders loading state while fetching plan catalog', () => {
      mockedPlansApi.listPlans.mockReturnValue(new Promise(() => {}));
      renderPlansApp();

      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('renders populated list with plans, prices, durations, and status badges', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: MOCK_PLANS,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      expect(screen.getByText('STD_MONTHLY')).toBeInTheDocument();
      expect(screen.getByText('$49.99')).toBeInTheDocument();
      expect(screen.getByText('Draft Annual VIP')).toBeInTheDocument();
      expect(screen.getByText('Legacy 10-Punch Card')).toBeInTheDocument();

      // Check status badges
      expect(screen.getByTestId('plan-status-badge-active')).toBeInTheDocument();
      expect(screen.getByTestId('plan-status-badge-draft')).toBeInTheDocument();
      expect(screen.getByTestId('plan-status-badge-archived')).toBeInTheDocument();
    });

    it('filters plans by status using the select dropdown', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_PLANS[0]!],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByTestId('plan-status-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('plan-status-filter'), {
        target: { value: 'ACTIVE' },
      });

      await waitFor(() => {
        expect(mockedPlansApi.listPlans).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'ACTIVE' }),
        );
      });
    });

    it('searches plans by query string', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_PLANS[0]!],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByTestId('plan-search-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('plan-search-input'), {
        target: { value: 'Monthly' },
      });

      await waitFor(() => {
        expect(mockedPlansApi.listPlans).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'Monthly' }),
        );
      });
    });

    it('renders error state and retries on failure', async () => {
      mockedPlansApi.listPlans
        .mockRejectedValueOnce(new Error('Plan Service Unavailable'))
        .mockResolvedValueOnce({
          items: MOCK_PLANS,
          total: 3,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByText('Plan Service Unavailable')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. Plan Creation Workflow
  // =========================================================================
  describe('2. Plan Creation Workflow', () => {
    beforeEach(() => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: MOCK_PLANS,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('opens create modal, validates required fields, and submits plan in draft state', async () => {
      const createdPlan: MembershipPlanVM = {
        id: 'plan_new',
        code: 'PRO_QUARTERLY',
        name: 'Pro Quarterly Pass',
        description: '90 days pro training',
        durationInDays: 90,
        priceAmount: 12900,
        priceCurrency: 'USD',
        visitQuota: undefined,
        status: 'DRAFT',
        version: 1,
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      };

      mockedPlansApi.createPlan.mockResolvedValue(createdPlan);

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByTestId('create-plan-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-plan-button'));

      expect(screen.getByTestId('plan-form-dialog')).toBeInTheDocument();

      // Fill in valid plan data
      fireEvent.change(screen.getByTestId('input-plan-code'), {
        target: { value: 'PRO_QUARTERLY' },
      });
      fireEvent.change(screen.getByTestId('input-plan-name'), {
        target: { value: 'Pro Quarterly Pass' },
      });
      fireEvent.change(screen.getByTestId('input-plan-duration'), {
        target: { value: '90' },
      });
      fireEvent.change(screen.getByTestId('input-plan-price-dollar'), {
        target: { value: '129.00' },
      });

      fireEvent.click(screen.getByTestId('submit-plan-button'));

      await waitFor(() => {
        expect(mockedPlansApi.createPlan).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'PRO_QUARTERLY',
            name: 'Pro Quarterly Pass',
            durationInDays: 90,
            priceAmount: 12900,
            priceCurrency: 'USD',
          }),
        );
      });
    });
  });

  // =========================================================================
  // 3. Plan Pricing Update & Decoupling Notice
  // =========================================================================
  describe('3. Plan Pricing Update Workflow', () => {
    beforeEach(() => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: MOCK_PLANS,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('opens update pricing modal and submits modified price with commercial decoupling banner', async () => {
      const updatedPlan: MembershipPlanVM = {
        ...MOCK_PLANS[0]!,
        priceAmount: 5999,
      };

      mockedPlansApi.updatePricing.mockResolvedValue(updatedPlan);

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      // Click Price quick action button for Standard Monthly Pass
      const priceBtn = screen.getByRole('button', {
        name: /update pricing for standard monthly pass/i,
      });
      fireEvent.click(priceBtn);

      expect(screen.getByTestId('update-pricing-dialog')).toBeInTheDocument();
      expect(screen.getByText(/historical decoupling/i)).toBeInTheDocument();

      // Change price to 59.99
      fireEvent.change(screen.getByTestId('input-update-price-dollar'), {
        target: { value: '59.99' },
      });

      fireEvent.click(screen.getByTestId('submit-update-pricing-button'));

      await waitFor(() => {
        expect(mockedPlansApi.updatePricing).toHaveBeenCalledWith(
          'plan_01',
          expect.objectContaining({
            priceAmount: 5999,
          }),
        );
      });
    });
  });

  // =========================================================================
  // 4. Plan Publish & Archive Lifecycles
  // =========================================================================
  describe('4. Plan Lifecycle Actions: Publish & Archive', () => {
    beforeEach(() => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: MOCK_PLANS,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('publishes a draft plan to active status', async () => {
      mockedPlansApi.publishPlan.mockResolvedValue({
        ...MOCK_PLANS[1]!,
        status: 'ACTIVE',
      });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByText('Draft Annual VIP')).toBeInTheDocument();
      });

      const publishBtn = screen.getByRole('button', { name: /publish draft annual vip/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(mockedPlansApi.publishPlan).toHaveBeenCalledWith('plan_02');
      });
    });

    it('opens archive confirmation dialog and archives active plan', async () => {
      mockedPlansApi.archivePlan.mockResolvedValue({
        ...MOCK_PLANS[0]!,
        status: 'ARCHIVED',
      });

      renderPlansApp();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      const archiveBtn = screen.getByRole('button', { name: /archive standard monthly pass/i });
      fireEvent.click(archiveBtn);

      expect(screen.getByTestId('archive-plan-dialog')).toBeInTheDocument();
      expect(screen.getByText(/commercial catalog impact/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-archive-plan-button'));

      await waitFor(() => {
        expect(mockedPlansApi.archivePlan).toHaveBeenCalledWith('plan_01');
      });
    });
  });

  // =========================================================================
  // 5. Plan Details View
  // =========================================================================
  describe('5. Plan Details Page', () => {
    it('renders plan details with commercial price, duration, quota, and status banner', async () => {
      mockedPlansApi.getPlanById.mockResolvedValue(MOCK_PLANS[0]!);

      renderPlansApp(['/gym/plans/plan_01']);

      await waitFor(() => {
        expect(screen.getByTestId('plan-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      expect(screen.getByText('Code: STD_MONTHLY')).toBeInTheDocument();
      expect(screen.getByText('$49.99')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. Permission Boundaries
  // =========================================================================
  describe('6. Plan Permission Restrictions', () => {
    it('hides create and management buttons for unprivileged viewer', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: MOCK_PLANS,
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansApp(['/gym/plans'], MOCK_VIEWER_USER);

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('create-plan-button')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /update pricing for/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    });
  });
});
