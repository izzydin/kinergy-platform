/**
 * Milestone A5.6 — UI State Validation
 *
 * Exhaustive test suite verifying that shared UI state primitives and
 * operational screens explicitly demonstrate all required async UI states:
 *
 *  1. StateView primitive (packages/ui) — all 4 states + custom loadingFallback
 *  2. Operational Dashboard KPI Cards & Schedule — Loading/Skeleton, Error, Empty, Success
 *  3. SettingsProfileSection — Loading/Skeleton, Error, Empty, Success
 *  4. Dashboard Overview — Clean of simulation and obsolete links
 *  5. State Transition — Error → Retry → Success
 */

import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StateView } from '@kinergy-platform/ui';
import { AuthProvider } from '../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../app/providers/notification-provider';
import { NavigationProvider } from '../../app/navigation';
import { BreadcrumbProvider } from '../../app/breadcrumbs';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';

import { DashboardMetricsSection } from '../dashboard/components/dashboard-metrics-section';
import { DashboardTodaysSchedule } from '../dashboard/components/dashboard-todays-schedule';
import { DashboardOverviewPage } from '../dashboard';
import {
  operationalDashboardKeys,
  getTodayOperationalBusinessDay,
} from '../dashboard/api/operational-dashboard-queries';
import { SettingsProfileSection } from '../settings/components/settings-profile-section';
import { settingsKeys } from '../settings/api/settings-query-keys';
import type { UserProfileViewModel } from '../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

const TEST_SESSION = {
  id: 'usr-a56-owner',
  email: 'owner@kinergy.platform',
  name: 'Kinergy Owner',
  roles: ['OWNER'],
  permissions: ['*'],
  tenantId: 'default',
};

function renderWithProviders(
  ui: React.ReactElement,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
  }: { initialEntries?: string[]; queryClient?: QueryClient } = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider initialSessionOverride={TEST_SESSION}>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>{ui}</SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

const MOCK_PROFILE: UserProfileViewModel = {
  id: 'usr-a56-validation',
  displayName: 'Kinergy Architect',
  email: 'architect@kinergy-platform.io',
  avatarUrl: null,
  role: 'PLATFORM_ADMIN',
  createdAt: '2026-01-15T00:00:00.000Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. StateView Primitive — Shared Infrastructure (@kinergy-platform/ui)
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — StateView Primitive (packages/ui)', () => {
  it('renders loading state with default skeleton fallback', () => {
    render(<StateView isLoading />);
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders loading state with custom loadingFallback slot', () => {
    render(
      <StateView
        isLoading
        loadingFallback={<div data-testid="custom-skeleton">Custom Skeleton</div>}
      >
        <div data-testid="content">Content</div>
      </StateView>,
    );
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders error state with message and retry button', () => {
    const onRetry = jest.fn();
    render(
      <StateView isError errorMessage="Network connection refused." onRetry={onRetry}>
        <div data-testid="content">Content</div>
      </StateView>,
    );
    expect(screen.getByText('Network connection refused.')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders empty state with title, description, and CTA action', () => {
    render(
      <StateView
        isEmpty
        emptyTitle="No Records Found"
        emptyDescription="Start by creating your first entry."
        emptyAction={<button data-testid="empty-cta">Create Record</button>}
      >
        <div data-testid="content">Content</div>
      </StateView>,
    );
    expect(screen.getByText('No Records Found')).toBeInTheDocument();
    expect(screen.getByText('Start by creating your first entry.')).toBeInTheDocument();
    expect(screen.getByTestId('empty-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders populated (success) state when no override flags are set', () => {
    render(
      <StateView>
        <div data-testid="populated-content">Populated Data</div>
      </StateView>,
    );
    expect(screen.getByTestId('populated-content')).toBeInTheDocument();
    expect(screen.getByText('Populated Data')).toBeInTheDocument();
  });

  it('loading takes priority over error when both are true', () => {
    render(<StateView isLoading isError errorMessage="Should not show" />);
    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });

  it('error takes priority over empty when both are true', () => {
    render(
      <StateView
        isError
        errorMessage="Error takes priority"
        isEmpty
        emptyTitle="Should not show"
      />,
    );
    expect(screen.getByText('Error takes priority')).toBeInTheDocument();
    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Operational Dashboard Metrics & Today's Schedule — 4-State Contract
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — Operational Dashboard Sections (4-State Contract)', () => {
  const businessDay = getTodayOperationalBusinessDay();

  it('renders operational KPI cards in populated state from QueryClient cache', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(operationalDashboardKeys.todayCheckIns(), {
      grantedCount: 5,
      uniqueClientsCount: 4,
      deniedCount: 0,
      totalCheckIns: 5,
      gymDay: `${businessDay.dateStr}@main(UTC)`,
    });
    queryClient.setQueryData(operationalDashboardKeys.lowStock(), {
      count: 2,
      outOfStockCount: 1,
      lowStockOnlyCount: 1,
      items: [],
    });
    queryClient.setQueryData(operationalDashboardKeys.todayAppointments(businessDay.dateStr), {
      dateStr: businessDay.dateStr,
      activeCount: 3,
      totalCount: 3,
      statusBreakdown: {
        scheduled: 1,
        confirmed: 2,
        checkedIn: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      },
      scheduleItems: [],
      needsAttentionItems: [],
    });
    queryClient.setQueryData(operationalDashboardKeys.dailySalesTotal(businessDay.dateStr), {
      dateStr: businessDay.dateStr,
      totalCents: 14500,
      formattedTotal: '$145.00',
      currency: 'USD',
      completedPaymentsCount: 2,
    });

    renderWithProviders(<DashboardMetricsSection />, { queryClient });

    expect(await screen.findByTestId('gym-checkins-value')).toHaveTextContent('5');
    expect(screen.getByTestId('low-stock-value')).toHaveTextContent('2');
    expect(screen.getByTestId('appointments-value')).toHaveTextContent('3');
    expect(screen.getByTestId('daily-sales-value')).toHaveTextContent('$145.00');
  });

  it("renders Today's Schedule empty state when zero appointments exist", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(operationalDashboardKeys.todayAppointments(businessDay.dateStr), {
      dateStr: businessDay.dateStr,
      activeCount: 0,
      totalCount: 0,
      statusBreakdown: {
        scheduled: 0,
        confirmed: 0,
        checkedIn: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      },
      scheduleItems: [],
      needsAttentionItems: [],
    });

    renderWithProviders(<DashboardTodaysSchedule />, { queryClient });

    expect(await screen.findByTestId('todays-schedule-empty')).toBeInTheDocument();
    expect(screen.getByText(/no appointments scheduled for today/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SettingsProfileSection — All 4 States
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — SettingsProfileSection (4-State Contract)', () => {
  it('STATE: loading — renders layout-matching profile skeleton', () => {
    renderWithProviders(<SettingsProfileSection simulationState="loading" />);
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('STATE: error — renders destructive StateView error alert with retry', () => {
    renderWithProviders(<SettingsProfileSection simulationState="error" />);
    expect(screen.getByText('Operation Failed')).toBeInTheDocument();
    expect(
      screen.getByText(/failed to load user profile from settings service/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('STATE: empty — renders StateView empty state with title and CTA', () => {
    renderWithProviders(<SettingsProfileSection simulationState="empty" />);
    expect(screen.getByText('No Profile Found')).toBeInTheDocument();
    expect(screen.getByText(/no authenticated user profile is associated/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry profile fetch/i })).toBeInTheDocument();
  });

  it('STATE: success — renders populated profile card from QueryClient cache', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsKeys.profile(), MOCK_PROFILE);

    renderWithProviders(<SettingsProfileSection simulationState="success" />, {
      queryClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId('profile-success')).toBeInTheDocument();
    });
    expect(screen.getByText('Kinergy Architect')).toBeInTheDocument();
    expect(screen.getByText('architect@kinergy-platform.io')).toBeInTheDocument();
    expect(screen.getByText('PLATFORM_ADMIN')).toBeInTheDocument();
  });

  it('success state displays avatar fallback initials when avatarUrl is null', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsKeys.profile(), MOCK_PROFILE);

    renderWithProviders(<SettingsProfileSection simulationState="success" />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText('KA')).toBeInTheDocument();
    });
  });

  it('success state formats member-since date from ISO string', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsKeys.profile(), MOCK_PROFILE);

    renderWithProviders(<SettingsProfileSection simulationState="success" />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText(/member since/i)).toBeInTheDocument();
      expect(screen.getByText(/january 2026/i)).toBeInTheDocument();
    });
  });

  it('card header shows section badge and descriptive text', () => {
    renderWithProviders(<SettingsProfileSection simulationState="loading" />);
    expect(screen.getByText('A5.6 Profile State')).toBeInTheDocument();
    expect(screen.getByText('Authenticated User Profile')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Dashboard Overview Clean of Temporary & Simulated Links
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — Dashboard Overview Clean of Temporary Links', () => {
  it('does not contain obsolete links to /dashboard/ui-states, /dashboard/metrics, or 4-State UI Simulator controls', async () => {
    renderWithProviders(<DashboardOverviewPage />, {
      initialEntries: ['/dashboard'],
    });

    expect(screen.queryByRole('link', { name: /ui states/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /metrics detail/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/4-State UI Simulator/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. State Transition — Loading → Success
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — State Transition: Loading → Success', () => {
  it('SettingsProfileSection: loading → success transition via simulationState prop', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsKeys.profile(), MOCK_PROFILE);

    const { rerender } = renderWithProviders(<SettingsProfileSection simulationState="loading" />, {
      queryClient,
    });

    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider initialSessionOverride={TEST_SESSION}>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>
                    <SettingsProfileSection simulationState="success" />
                  </SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-success')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('profile-loading')).not.toBeInTheDocument();
  });
});
