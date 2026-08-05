import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { moduleRegistry } from '../../app/routes/module-registry';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';
import { SlotTarget } from '../../shared/ui/slots/SlotTarget';
import { DashboardOverviewPage, DashboardRouter } from '../dashboard';
import { SettingsLayoutPage, SettingsRouter } from '../settings';
import { GeneralSettingsForm } from '../settings/components/general-settings-form';
import { SecuritySettingsForm } from '../settings/components/security-settings-form';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, { initialEntries = ['/'] } = {}) {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <SlotProvider>{ui}</SlotProvider>
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

  describe('2. Dashboard Overview Validation Screen (Milestone A5.2)', () => {
    it('renders DashboardOverviewPage with initial success state and layout slot injections', async () => {
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

      const loadingSkeletons = screen.getAllByTestId('metrics-loading');
      expect(loadingSkeletons.length).toBeGreaterThan(0);

      const metricsCard = await screen.findByTestId('metrics-success');
      expect(metricsCard).toBeInTheDocument();
      expect(screen.getByText('Active Energy Monitors')).toBeInTheDocument();
      expect(screen.getByText('Quick System Check')).toBeInTheDocument();
    });

    it('toggles 4-State UI Simulator controller buttons (Loading, Empty, Error)', async () => {
      renderWithProviders(<DashboardOverviewPage />, { initialEntries: ['/dashboard'] });

      const errorBtn = screen.getByRole('button', { name: /state: error/i });
      fireEvent.click(errorBtn);

      const errorAlert = await screen.findByTestId('metrics-error');
      expect(errorAlert).toBeInTheDocument();

      const emptyBtn = screen.getByRole('button', { name: /state: empty/i });
      fireEvent.click(emptyBtn);

      const emptyAlert = await screen.findByTestId('metrics-empty');
      expect(emptyAlert).toBeInTheDocument();
    });

    it('triggers info and error toasts in system health section', async () => {
      renderWithProviders(<DashboardOverviewPage />, { initialEntries: ['/dashboard'] });

      const infoToastBtn = screen.getByRole('button', { name: /trigger info toast/i });
      fireEvent.click(infoToastBtn);

      expect(await screen.findByText('System Notification')).toBeInTheDocument();
    });

    it('renders DashboardRouter sub-routes correctly', async () => {
      renderWithProviders(<DashboardRouter />, { initialEntries: ['/metrics'] });

      expect(screen.getByRole('heading', { name: /metrics & performance/i })).toBeInTheDocument();
      expect(screen.getByText('Telemetry Throughput')).toBeInTheDocument();
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

      // Fix email
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

    it('renders SettingsRouter sub-routes correctly', () => {
      renderWithProviders(<SettingsRouter />, { initialEntries: ['/general'] });
      expect(screen.getByText('General Workspace Preferences')).toBeInTheDocument();

      renderWithProviders(<SettingsRouter />, { initialEntries: ['/security'] });
      expect(screen.getByText('Security & Password Policy')).toBeInTheDocument();
    });
  });
});
