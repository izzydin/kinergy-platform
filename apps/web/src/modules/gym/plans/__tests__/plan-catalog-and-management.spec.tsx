import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { plansApi } from '../api/plans-api';
import { PlanDetailPage } from '../routes/plan-detail-page';
import { PlansListPage } from '../routes/plans-list-page';
import type { MembershipPlanVM } from '../types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layer
jest.mock('../api/plans-api', () => ({
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
  id: 'usr_admin_01',
  email: 'admin@kinergy.io',
  name: 'Gym Administrator',
  roles: ['ADMIN'],
  permissions: ['plans.create', 'plans.update', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_RECEPTIONIST_USER: AuthUser = {
  id: 'usr_reception_01',
  email: 'desk@kinergy.io',
  name: 'Front Desk Officer',
  roles: ['RECEPTIONIST'],
  permissions: ['attendance.create', 'attendance.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_ACTIVE_PLAN: MembershipPlanVM = {
  id: 'plan_active_01',
  code: 'STD_MONTHLY',
  name: 'Standard Monthly Pass',
  description: 'Full facility access during peak and off-peak hours',
  durationInDays: 30,
  priceAmount: 4999, // $49.99
  priceCurrency: 'USD',
  visitQuota: undefined,
  status: 'ACTIVE',
  version: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

const MOCK_DRAFT_PLAN: MembershipPlanVM = {
  id: 'plan_draft_01',
  code: 'PRO_SUMMER',
  name: 'Pro Summer Seasonal',
  description: 'Seasonal promotion with personal training session',
  durationInDays: 90,
  priceAmount: 14900, // $149.00
  priceCurrency: 'USD',
  visitQuota: 60,
  status: 'DRAFT',
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const MOCK_ARCHIVED_PLAN: MembershipPlanVM = {
  id: 'plan_archived_01',
  code: 'LEGACY_PUNCH_10',
  name: 'Legacy 10-Punch Card',
  description: 'Retired punch card tier; honored until expiration',
  durationInDays: 180,
  priceAmount: 2500, // $25.00
  priceCurrency: 'USD',
  visitQuota: 10,
  status: 'ARCHIVED',
  version: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPlansModule(initialEntries = ['/gym/plans'], user: AuthUser = MOCK_ADMIN_USER) {
  const queryClient = createTestQueryClient();
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
      <AuthProvider initialSessionOverride={user}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Milestone 6.3: Membership Plan Catalog & Management Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Catalog Presentation: Populated, Empty & Error States
  // =========================================================================
  describe('1. Plan Catalog Presentation', () => {
    it('renders populated catalog with accurate pricing in dollars and server status badges', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_ACTIVE_PLAN, MOCK_DRAFT_PLAN, MOCK_ARCHIVED_PLAN],
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      // Validates exact pricing display (cents converted to dollars without floating precision issues)
      expect(screen.getByText('$49.99')).toBeInTheDocument();
      expect(screen.getByText('STD_MONTHLY')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
      expect(screen.getByText('Unlimited')).toBeInTheDocument();

      expect(screen.getByText('Pro Summer Seasonal')).toBeInTheDocument();
      expect(screen.getByText('$149.00')).toBeInTheDocument();
      expect(screen.getByText('60 visits')).toBeInTheDocument();

      expect(screen.getByText('Legacy 10-Punch Card')).toBeInTheDocument();
      expect(screen.getByText('$25.00')).toBeInTheDocument();

      // Badges
      expect(screen.getByTestId('plan-status-badge-active')).toBeInTheDocument();
      expect(screen.getByTestId('plan-status-badge-draft')).toBeInTheDocument();
      expect(screen.getByTestId('plan-status-badge-archived')).toBeInTheDocument();
    });

    it('renders unpopulated empty state when no plans have been cataloged yet', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText(/No membership plans cataloged/i)).toBeInTheDocument();
      });
      expect(
        screen.getByText(
          /Create a new draft commercial plan to begin building your membership catalog/i,
        ),
      ).toBeInTheDocument();
    });

    it('renders filtered empty state when filter yields zero matches', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByTestId('plan-status-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('plan-status-filter'), {
        target: { value: 'ARCHIVED' },
      });

      await waitFor(() => {
        expect(screen.getByText(/No plans matching search criteria/i)).toBeInTheDocument();
      });
    });

    it('renders accessible error state and allows operator retry upon network error', async () => {
      mockedPlansApi.listPlans
        .mockRejectedValueOnce(new Error('HTTP 502: Bad Gateway connecting to gym catalog service'))
        .mockResolvedValueOnce({
          items: [MOCK_ACTIVE_PLAN],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        });

      renderPlansModule();

      await waitFor(() => {
        expect(
          screen.getByText(/HTTP 502: Bad Gateway connecting to gym catalog service/i),
        ).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. Plan Creation & Modification Invariants
  // =========================================================================
  describe('2. Plan Creation & Price Modification Safeguards', () => {
    beforeEach(() => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_ACTIVE_PLAN],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('enforces required fields and disables submit button to prevent duplicate submissions', async () => {
      let resolvePromise: (val: MembershipPlanVM) => void;
      const deferredPromise = new Promise<MembershipPlanVM>((resolve) => {
        resolvePromise = resolve;
      });
      mockedPlansApi.createPlan.mockReturnValue(deferredPromise);

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByTestId('create-plan-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-plan-button'));

      expect(screen.getByTestId('plan-form-dialog')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('input-plan-code'), {
        target: { value: 'VIP_UNLIMITED' },
      });
      fireEvent.change(screen.getByTestId('input-plan-name'), {
        target: { value: 'VIP Unlimited All-Access' },
      });
      fireEvent.change(screen.getByTestId('input-plan-duration'), {
        target: { value: '365' },
      });
      fireEvent.change(screen.getByTestId('input-plan-price-dollar'), {
        target: { value: '999.00' },
      });

      const submitBtn = screen.getByTestId('submit-plan-button');
      fireEvent.click(submitBtn);

      // Verify button disables during pending mutation
      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
      });
      expect(screen.getByText('Creating Plan...')).toBeInTheDocument();

      // Resolve creation
      resolvePromise!({
        id: 'plan_vip_new',
        code: 'VIP_UNLIMITED',
        name: 'VIP Unlimited All-Access',
        durationInDays: 365,
        priceAmount: 99900,
        priceCurrency: 'USD',
        status: 'DRAFT',
        version: 1,
        createdAt: '2026-10-26T18:00:00.000Z',
        updatedAt: '2026-10-26T18:00:00.000Z',
      });

      await waitFor(() => {
        expect(mockedPlansApi.createPlan).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'VIP_UNLIMITED',
            name: 'VIP Unlimited All-Access',
            durationInDays: 365,
            priceAmount: 99900,
            priceCurrency: 'USD',
          }),
        );
      });
    });

    it('preserves form inputs and displays inline error alert upon backend duplicate code rejection', async () => {
      mockedPlansApi.createPlan.mockRejectedValueOnce(
        new Error("Plan with code 'STD_MONTHLY' already exists in commercial registry."),
      );

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByTestId('create-plan-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-plan-button'));

      const codeInput = screen.getByTestId('input-plan-code');
      const nameInput = screen.getByTestId('input-plan-name');
      fireEvent.change(codeInput, { target: { value: 'STD_MONTHLY' } });
      fireEvent.change(nameInput, { target: { value: 'Duplicate Monthly Plan' } });

      fireEvent.click(screen.getByTestId('submit-plan-button'));

      await waitFor(() => {
        expect(screen.getByTestId('plan-form-error-alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/already exists in commercial registry/i)).toBeInTheDocument();

      // Preserves form values after error so user can adjust code without starting over
      expect(codeInput).toHaveValue('STD_MONTHLY');
      expect(nameInput).toHaveValue('Duplicate Monthly Plan');
    });

    it('submits updated commercial pricing with cents conversion and historical decoupling notice', async () => {
      mockedPlansApi.updatePricing.mockResolvedValueOnce({
        ...MOCK_ACTIVE_PLAN,
        priceAmount: 5499, // $54.99
        version: 3,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      const priceActionBtn = screen.getByRole('button', {
        name: /update pricing for standard monthly pass/i,
      });
      fireEvent.click(priceActionBtn);

      expect(screen.getByTestId('update-pricing-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Historical Decoupling/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Updating the commercial catalog price does not alter or recalculate existing active or historical membership agreements/i,
        ),
      ).toBeInTheDocument();

      const priceInput = screen.getByTestId('input-update-price-dollar');
      fireEvent.change(priceInput, { target: { value: '54.99' } });

      fireEvent.click(screen.getByTestId('submit-update-pricing-button'));

      await waitFor(() => {
        expect(mockedPlansApi.updatePricing).toHaveBeenCalledWith(
          'plan_active_01',
          expect.objectContaining({
            priceAmount: 5499,
          }),
        );
      });
    });
  });

  // =========================================================================
  // 3. Lifecycle Transitions & Restrictions
  // =========================================================================
  describe('3. Plan Lifecycle Actions: Publish & Archive', () => {
    it('publishes a DRAFT plan to ACTIVE status and updates badge', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_DRAFT_PLAN],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      mockedPlansApi.publishPlan.mockResolvedValueOnce({
        ...MOCK_DRAFT_PLAN,
        status: 'ACTIVE',
        version: 2,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText('Pro Summer Seasonal')).toBeInTheDocument();
      });

      const publishBtn = screen.getByRole('button', {
        name: /publish pro summer seasonal/i,
      });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(mockedPlansApi.publishPlan).toHaveBeenCalledWith('plan_draft_01');
      });
    });

    it('requires explicit confirmation before archiving an active plan and explains catalog impact', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_ACTIVE_PLAN],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      mockedPlansApi.archivePlan.mockResolvedValueOnce({
        ...MOCK_ACTIVE_PLAN,
        status: 'ARCHIVED',
        version: 3,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      const archiveBtn = screen.getByRole('button', {
        name: /archive standard monthly pass/i,
      });
      fireEvent.click(archiveBtn);

      expect(screen.getByTestId('archive-plan-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Commercial Catalog Impact/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Archiving removes this plan from future sales and client membership onboarding. Existing active memberships under this plan will continue running uninterrupted/i,
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-archive-plan-button'));

      await waitFor(() => {
        expect(mockedPlansApi.archivePlan).toHaveBeenCalledWith('plan_active_01');
      });
    });

    it('hides edit pricing and archive actions for archived plans in table actions', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_ARCHIVED_PLAN],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansModule();

      await waitFor(() => {
        expect(screen.getByText('Legacy 10-Punch Card')).toBeInTheDocument();
      });

      // Price update and archive buttons must NOT be rendered for archived plans
      expect(
        screen.queryByRole('button', { name: /update pricing for legacy 10-punch card/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /archive legacy 10-punch card/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /publish legacy 10-punch card/i }),
      ).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Enrollment Implications & Policy Presentation
  // =========================================================================
  describe('4. Enrollment Implications & Policy Card', () => {
    it('presents enrollment invariants on active plan detail page', async () => {
      mockedPlansApi.getPlanById.mockResolvedValue(MOCK_ACTIVE_PLAN);

      renderPlansModule(['/gym/plans/plan_active_01']);

      await waitFor(() => {
        expect(screen.getByTestId('plan-detail-page')).toBeInTheDocument();
      });

      const policyCard = screen.getByTestId('enrollment-invariants-card');
      expect(policyCard).toBeInTheDocument();

      // Explains active availability
      expect(
        within(policyCard).getByText(
          /Active and available for new member enrollments and renewals/i,
        ),
      ).toBeInTheDocument();

      // Explains existing membership continuity
      expect(
        within(policyCard).getByText(
          /Active client agreements under this plan remain fully valid and enforceable until their agreed end date/i,
        ),
      ).toBeInTheDocument();

      // Explains price decoupling
      expect(
        within(policyCard).getByText(
          /Modifying commercial price applies only to subsequent sales; existing memberships preserve their initial agreement price/i,
        ),
      ).toBeInTheDocument();

      // Explains duration immutability
      expect(
        within(policyCard).getByText(/duration of 30 days is immutable once published/i),
      ).toBeInTheDocument();
    });

    it('presents draft warning and enrollment restriction on draft plan detail page', async () => {
      mockedPlansApi.getPlanById.mockResolvedValue(MOCK_DRAFT_PLAN);

      renderPlansModule(['/gym/plans/plan_draft_01']);

      await waitFor(() => {
        expect(screen.getByTestId('plan-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('Draft Status')).toBeInTheDocument();
      expect(
        screen.getByText(
          /This plan is in draft mode and cannot be selected when creating client memberships until it is published/i,
        ),
      ).toBeInTheDocument();
    });

    it('presents archived restriction on retired plan detail page', async () => {
      mockedPlansApi.getPlanById.mockResolvedValue(MOCK_ARCHIVED_PLAN);

      renderPlansModule(['/gym/plans/plan_archived_01']);

      await waitFor(() => {
        expect(screen.getByTestId('plan-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText(/Archived Catalog Item/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /This plan has been retired from active sales. Existing client memberships referencing this plan continue under their agreed terms/i,
        ),
      ).toBeInTheDocument();
      // Ensure publish and archive buttons are NOT shown
      expect(screen.queryByTestId('publish-plan-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('archive-plan-detail-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-pricing-detail-button')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. Authorization & Permission Boundaries
  // =========================================================================
  describe('5. Authorization & Role Enforcement', () => {
    it('restricts management operations for unprivileged receptionist user', async () => {
      mockedPlansApi.listPlans.mockResolvedValue({
        items: [MOCK_ACTIVE_PLAN, MOCK_DRAFT_PLAN],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderPlansModule(['/gym/plans'], MOCK_RECEPTIONIST_USER);

      await waitFor(() => {
        expect(screen.getByText('Standard Monthly Pass')).toBeInTheDocument();
      });

      // Receptionist can view plans but cannot create or alter pricing/lifecycle
      expect(screen.queryByTestId('create-plan-button')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /update pricing for/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    });
  });
});
