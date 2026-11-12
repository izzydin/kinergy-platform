import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { moduleRegistry } from '../../app/routes/module-registry';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';
import { SlotTarget } from '../../shared/ui/slots/SlotTarget';
import { DashboardOverviewPage, DashboardRouter } from '../dashboard';
import {
  operationalDashboardKeys,
  getTodayOperationalBusinessDay,
} from '../dashboard/api/operational-dashboard-queries';
import { SettingsLayoutPage, SettingsRouter } from '../settings';
import { GeneralSettingsForm } from '../settings/components/general-settings-form';
import { SecuritySettingsForm } from '../settings/components/security-settings-form';

import { NavigationProvider } from '../../app/navigation';
import { AuthProvider } from '../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../app/providers/feature-flag-provider';
import { BreadcrumbProvider } from '../../app/breadcrumbs';

const TEST_OWNER_SESSION = {
  id: 'usr-owner-validation',
  email: 'owner@kinergy.platform',
  name: 'Owner Validation',
  roles: ['OWNER'],
  permissions: ['*'],
  tenantId: 'default',
};

function createTestQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const businessDay = getTodayOperationalBusinessDay();
  qc.setQueryData(operationalDashboardKeys.todayCheckIns(), {
    grantedCount: 4,
    uniqueClientsCount: 4,
    deniedCount: 0,
    totalCheckIns: 4,
    gymDay: `${businessDay.dateStr}@main(UTC)`,
  });
  qc.setQueryData(operationalDashboardKeys.lowStock(), {
    count: 1,
    outOfStockCount: 0,
    lowStockOnlyCount: 1,
    items: [],
  });
  qc.setQueryData(operationalDashboardKeys.todayAppointments(businessDay.dateStr), {
    dateStr: businessDay.dateStr,
    activeCount: 2,
    totalCount: 2,
    statusBreakdown: {
      scheduled: 1,
      confirmed: 1,
      checkedIn: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
    },
    scheduleItems: [],
    needsAttentionItems: [],
  });
  qc.setQueryData(operationalDashboardKeys.dailySalesTotal(businessDay.dateStr), {
    dateStr: businessDay.dateStr,
    totalCents: 9500,
    formattedTotal: '$95.00',
    currency: 'USD',
    completedPaymentsCount: 1,
  });
  qc.setQueryData(operationalDashboardKeys.pendingSalesFollowUp(), {
    count: 0,
    items: [],
  });
  return qc;
}

function renderWithProviders(ui: React.ReactElement, { initialEntries = ['/'] } = {}) {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider initialSessionOverride={TEST_OWNER_SESSION}>
          <FeatureFlagProvider>
            <NavigationProvider>
              <BreadcrumbProvider>
                <SlotProvider>{ui}</SlotProvider>
              </BreadcrumbProvider>
            </NavigationProvider>
          </FeatureFlagProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Step A5 Architectural Validation Modules', () => {
  describe('1. Module Route Registration', () => {
    it('registers dashboard and settings modules with central moduleRegistry', () => {
      const registered = moduleRegistry.getRegisteredModules();
      const dashboardModule = registered.find((m) => m.id === 'dashboard');
      const settingsModule = registered.find((m) => m.id === 'settings');

      expect(dashboardModule).toBeDefined();
      expect(dashboardModule?.prefix).toBe('/dashboard');
      expect(dashboardModule?.isProtected).toBe(true);

      expect(settingsModule).toBeDefined();
      expect(settingsModule?.prefix).toBe('/settings');
      expect(settingsModule?.isProtected).toBe(true);
    });
  });

  describe('2. Operational Dashboard Overview Screen', () => {
    it('renders DashboardOverviewPage with operational KPIs, sections, and header quick-action slot', async () => {
      renderWithProviders(
        <div>
          <div data-testid="header-target">
            <SlotTarget name="header-actions" />
          </div>
          <DashboardOverviewPage />
        </div>,
        { initialEntries: ['/dashboard'] },
      );

      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();

      expect(await screen.findByText('Gym Check-ins Today')).toBeInTheDocument();
      expect(screen.getByText('Low-Stock Alerts')).toBeInTheDocument();
      expect(screen.getByText("Today's Appointments")).toBeInTheDocument();
      expect(screen.getByText('Daily Sales Total')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-todays-schedule')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-needs-attention')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-quick-actions')).toBeInTheDocument();
    });

    it('renders DashboardRouter sub-routes correctly and handles obsolete sub-routes with 404', async () => {
      renderWithProviders(<DashboardRouter />, { initialEntries: ['/'] });
      expect(
        await screen.findByRole('heading', { name: /dashboard overview/i }, { timeout: 5000 }),
      ).toBeInTheDocument();

      renderWithProviders(<DashboardRouter />, { initialEntries: ['/metrics'] });
      expect(
        await screen.findByRole('heading', { name: /404 — View Not Found/i }, { timeout: 5000 }),
      ).toBeInTheDocument();
    });
  });

  describe('3. Settings Validation Screen (Milestone A5.3)', () => {
    it('renders SettingsLayoutPage with navigation tab controls', () => {
      renderWithProviders(<SettingsLayoutPage />, { initialEntries: ['/settings/general'] });

      expect(screen.getByRole('heading', { name: /platform settings/i })).toBeInTheDocument();
      expect(screen.getByText('General Preferences')).toBeInTheDocument();
      expect(screen.getByText('Security Controls')).toBeInTheDocument();
    });

    it('validates GeneralSettingsForm React Hook Form + Zod submit & error state', async () => {
      const { container } = renderWithProviders(<GeneralSettingsForm />);

      const emailInput = screen.getByTestId('contact-email-input');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });

      fireEvent.change(emailInput, { target: { value: 'valid@kinergy-platform.io' } });
      fireEvent.submit(form);

      await waitFor(
        () => {
          expect(screen.getByTestId('general-form-success')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('handles simulated server error state in GeneralSettingsForm', async () => {
      const { container } = renderWithProviders(<GeneralSettingsForm />);

      const simulateErrorCheckbox = screen.getByTestId('simulate-error-checkbox');
      fireEvent.click(simulateErrorCheckbox);

      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(
        () => {
          expect(screen.getByTestId('general-form-error')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('validates SecuritySettingsForm password mismatch Zod refinement', async () => {
      const { container } = renderWithProviders(<SecuritySettingsForm />);

      const currentPasswordInput = screen.getByTestId('current-password-input');
      const newPasswordInput = screen.getByTestId('new-password-input');
      const confirmPasswordInput = screen.getByTestId('confirm-password-input');

      fireEvent.change(currentPasswordInput, { target: { value: 'CurrentPassword123' } });
      fireEvent.change(newPasswordInput, { target: { value: 'ValidPass123' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'MismatchPass123' } });

      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/new passwords do not match/i)).toBeInTheDocument();
      });
    });

    it('opens session revocation modal dialog in SecuritySettingsForm', async () => {
      renderWithProviders(<SecuritySettingsForm />);

      const revokeModalBtn = screen.getByRole('button', { name: /revoke all sessions/i });
      fireEvent.click(revokeModalBtn);

      expect(await screen.findByText(/confirm global session revocation/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
      fireEvent.click(confirmBtn);

      expect(
        await screen.findByText(/all active platform refresh tokens have been revoked/i),
      ).toBeInTheDocument();
    });

    it('renders SettingsRouter sub-routes correctly (lazy pages resolve via Suspense)', async () => {
      renderWithProviders(<SettingsRouter />, { initialEntries: ['/general'] });
      expect(await screen.findByText('General Workspace Preferences')).toBeInTheDocument();

      renderWithProviders(<SettingsRouter />, { initialEntries: ['/security'] });
      expect(await screen.findByText('Security & Password Policy')).toBeInTheDocument();
    });
  });
});
