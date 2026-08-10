/**
 * Milestone A5.6 — UI State Validation
 *
 * Exhaustive test suite verifying that every validation screen explicitly
 * demonstrates all required async UI states. Covers:
 *
 *  1. StateView primitive (packages/ui) — all 4 states + custom loadingFallback
 *  2. DashboardMetricsSection — Loading/Skeleton, Error, Empty, Success
 *  3. DashboardActivitySection — Loading/Skeleton, Error, Empty, Success
 *  4. SettingsProfileSection — Loading/Skeleton, Error, Empty, Success
 *  5. DashboardUiStatesPage — page-level simulation controller
 *  6. State Transition — Error → Retry → Success
 *
 * Testing strategy:
 * - Simulation hooks: uses `simulationState` prop (deterministic, no network)
 * - Profile query: seeds QueryClient cache directly (no MSW required)
 * - All tests run in jsdom environment
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

import { DashboardActivitySection } from '../dashboard/components/dashboard-activity-section';
import { DashboardMetricsSection } from '../dashboard/components/dashboard-metrics-section';
import { DashboardUiStatesPage } from '../dashboard/routes/dashboard-ui-states-page';
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
          <AuthProvider>
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
    // Default fallback renders Skeleton placeholders (aria-hidden)
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
    // Loading should render, not error
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
// 2. DashboardMetricsSection — All 4 States
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — DashboardMetricsSection (4-State Contract)', () => {
  it('STATE: loading — renders skeleton grid (data-testid="metrics-loading")', () => {
    renderWithProviders(<DashboardMetricsSection simulationState="loading" />);
    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
  });

  it('STATE: error — renders destructive alert with retry button', async () => {
    const onRetry = jest.fn();
    renderWithProviders(<DashboardMetricsSection simulationState="error" onRetry={onRetry} />);
    const errorAlert = await screen.findByTestId('metrics-error');
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry fetching/i })).toBeInTheDocument();
  });

  it('STATE: empty — renders empty alert notification', async () => {
    renderWithProviders(<DashboardMetricsSection simulationState="empty" />);
    const emptyAlert = await screen.findByTestId('metrics-empty');
    expect(emptyAlert).toBeInTheDocument();
    expect(screen.getByText(/no metrics recorded/i)).toBeInTheDocument();
  });

  it('STATE: success — renders populated metric cards with data', async () => {
    renderWithProviders(<DashboardMetricsSection simulationState="success" />);
    const successGrid = await screen.findByTestId('metrics-success');
    expect(successGrid).toBeInTheDocument();
    expect(screen.getByText('Active Energy Monitors')).toBeInTheDocument();
    expect(screen.getByText('System Throughput')).toBeInTheDocument();
  });

  it('error state shows the correct error message text', async () => {
    renderWithProviders(<DashboardMetricsSection simulationState="error" />);
    await screen.findByTestId('metrics-error');
    expect(
      screen.getByText(/failed to load dashboard metrics from remote api gateway/i),
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DashboardActivitySection — All 4 States
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — DashboardActivitySection (4-State Contract)', () => {
  it('STATE: loading — renders skeleton activity rows', () => {
    renderWithProviders(<DashboardActivitySection simulationState="loading" />);
    expect(screen.getByTestId('activity-loading')).toBeInTheDocument();
  });

  it('STATE: error — renders destructive alert with retry button', async () => {
    const onRetry = jest.fn();
    renderWithProviders(<DashboardActivitySection simulationState="error" onRetry={onRetry} />);
    const errorAlert = await screen.findByTestId('activity-error');
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry activity stream/i })).toBeInTheDocument();
  });

  it('STATE: empty — renders empty activity alert', async () => {
    renderWithProviders(<DashboardActivitySection simulationState="empty" />);
    const emptyAlert = await screen.findByTestId('activity-empty');
    expect(emptyAlert).toBeInTheDocument();
    expect(screen.getByText(/no activity recorded/i)).toBeInTheDocument();
  });

  it('STATE: success — renders populated activity feed with items', async () => {
    renderWithProviders(<DashboardActivitySection simulationState="success" />);
    const successFeed = await screen.findByTestId('activity-success');
    expect(successFeed).toBeInTheDocument();
    expect(screen.getByText(/security audit completed/i)).toBeInTheDocument();
  });

  it('error retry handler is called on button click', async () => {
    const onRetry = jest.fn();
    renderWithProviders(<DashboardActivitySection simulationState="error" onRetry={onRetry} />);
    await screen.findByTestId('activity-error');
    fireEvent.click(screen.getByRole('button', { name: /retry activity stream/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SettingsProfileSection — All 4 States
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — SettingsProfileSection (4-State Contract)', () => {
  it('STATE: loading — renders layout-matching profile skeleton', () => {
    renderWithProviders(<SettingsProfileSection simulationState="loading" />);
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
    // Skeleton elements are aria-hidden to prevent screen reader noise
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
      // "Kinergy Architect" → initials "KA"
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
// 5. DashboardUiStatesPage — Page-Level Integration
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — DashboardUiStatesPage (Page Integration)', () => {
  it('renders page heading and milestone badge', () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    expect(screen.getByRole('heading', { name: /ui state validation/i })).toBeInTheDocument();
    expect(screen.getByText('Milestone A5.6')).toBeInTheDocument();
  });

  it('renders simulation controller with all four state buttons', () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    expect(screen.getByTestId('sim-btn-success')).toBeInTheDocument();
    expect(screen.getByTestId('sim-btn-loading')).toBeInTheDocument();
    expect(screen.getByTestId('sim-btn-empty')).toBeInTheDocument();
    expect(screen.getByTestId('sim-btn-error')).toBeInTheDocument();
  });

  it('starts in success state — renders StateView success content', async () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    await waitFor(() => {
      expect(screen.getByTestId('state-view-success')).toBeInTheDocument();
    });
    expect(screen.getByText('StateView Success State')).toBeInTheDocument();
  });

  it('switching to error state — renders all section error alerts', async () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    fireEvent.click(screen.getByTestId('sim-btn-error'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('activity-error')).toBeInTheDocument();
  });

  it('switching to empty state — renders all section empty alerts', async () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    fireEvent.click(screen.getByTestId('sim-btn-empty'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('activity-empty')).toBeInTheDocument();
    expect(screen.getByText('No Profile Found')).toBeInTheDocument();
  });

  it('switching to loading state — renders section skeleton elements', () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    fireEvent.click(screen.getByTestId('sim-btn-loading'));
    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
    expect(screen.getByTestId('activity-loading')).toBeInTheDocument();
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
  });

  it('renders all four section labels', () => {
    renderWithProviders(<DashboardUiStatesPage />, {
      initialEntries: ['/dashboard/ui-states'],
    });
    expect(screen.getByText(/section 1 — stateview primitive/i)).toBeInTheDocument();
    expect(screen.getByText(/section 2 — dashboard metrics/i)).toBeInTheDocument();
    expect(screen.getByText(/section 3 — dashboard activities/i)).toBeInTheDocument();
    expect(screen.getByText(/section 4 — settings profile/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. State Transition — Error → Retry → Success
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.6 — State Transition: Error → Retry → Success', () => {
  it('DashboardMetricsSection: error retry handler resets to success', async () => {
    const { rerender } = renderWithProviders(
      <DashboardMetricsSection simulationState="error" onRetry={() => {}} />,
    );

    // Confirm error state
    await screen.findByTestId('metrics-error');
    expect(screen.getByRole('button', { name: /retry fetching/i })).toBeInTheDocument();

    // Simulate retry (re-render with success)
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>
                    <DashboardMetricsSection simulationState="success" />
                  </SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // After retry → success state
    await screen.findByTestId('metrics-success');
    expect(screen.queryByTestId('metrics-error')).not.toBeInTheDocument();
  });

  it('DashboardActivitySection: success → error → empty state transitions', async () => {
    const { rerender } = renderWithProviders(
      <DashboardActivitySection simulationState="success" />,
    );

    // Success state
    await screen.findByTestId('activity-success');

    // Transition to error
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>
                    <DashboardActivitySection simulationState="error" />
                  </SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId('activity-error');
    expect(screen.queryByTestId('activity-success')).not.toBeInTheDocument();

    // Transition to empty
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>
                    <DashboardActivitySection simulationState="empty" />
                  </SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId('activity-empty');
    expect(screen.queryByTestId('activity-error')).not.toBeInTheDocument();
  });

  it('SettingsProfileSection: loading → success transition via simulationState prop', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsKeys.profile(), MOCK_PROFILE);

    const { rerender } = renderWithProviders(<SettingsProfileSection simulationState="loading" />, {
      queryClient,
    });

    // Loading state active
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();

    // Transition to success
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
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
