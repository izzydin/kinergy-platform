import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { DashboardLayout } from '../../app/layouts/dashboard-layout';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';
import { DashboardOverviewPage } from '../dashboard';
import { DashboardMetricsPage } from '../dashboard/routes/dashboard-metrics-page';
import { GeneralSettingsForm } from '../settings/components/general-settings-form';
import { SecuritySettingsForm } from '../settings/components/security-settings-form';
import { SettingsLayoutPage } from '../settings/routes/settings-layout-page';

import { AuthProvider } from '../../app/providers/auth-provider';
import { NavigationProvider } from '../../app/navigation';

expect.extend(toHaveNoViolations);

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
        <AuthProvider>
          <NavigationProvider>
            <SlotProvider>{ui}</SlotProvider>
          </NavigationProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Milestone A5.5 — Responsive & Accessibility Validation Suite', () => {
  describe('1. Automated WCAG Accessibility Audit (jest-axe)', () => {
    it('passes WCAG accessibility checks on Dashboard Overview Page', async () => {
      const { container } = renderWithProviders(<DashboardOverviewPage />, {
        initialEntries: ['/dashboard'],
      });

      // Wait for async metric cards to resolve to success state
      await screen.findByTestId('metrics-success');

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes WCAG accessibility checks on Dashboard Metrics Page', async () => {
      const { container } = renderWithProviders(<DashboardMetricsPage />, {
        initialEntries: ['/dashboard/metrics'],
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes WCAG accessibility checks on General Settings Form', async () => {
      const { container } = renderWithProviders(<GeneralSettingsForm />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes WCAG accessibility checks on Security Settings Form', async () => {
      const { container } = renderWithProviders(<SecuritySettingsForm />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes WCAG accessibility checks on Full Dashboard Layout Shell', async () => {
      const { container } = renderWithProviders(
        <DashboardLayout>
          <DashboardOverviewPage />
        </DashboardLayout>,
        { initialEntries: ['/dashboard'] },
      );

      await screen.findByTestId('metrics-success');

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('2. WAI-ARIA Landmark & Screen Reader Compatibility', () => {
    it('verifies standard HTML5 and ARIA landmark roles', () => {
      renderWithProviders(
        <DashboardLayout>
          <DashboardOverviewPage />
        </DashboardLayout>,
      );

      // Header landmark
      expect(screen.getByRole('banner')).toBeInTheDocument();

      // Navigation landmarks (Sidebar drawer and menu)
      const navElements = screen.getAllByRole('navigation');
      expect(navElements.length).toBeGreaterThan(0);

      // Main landmark
      expect(screen.getByRole('main')).toBeInTheDocument();

      // Aside navigation landmark
      const aside = screen.getByRole('complementary', { name: /main navigation/i }) ||
        document.querySelector('aside[aria-label="Main Navigation"]');
      expect(aside).toBeInTheDocument();
    });

    it('verifies live region toast notifications and error alert attributes', async () => {
      renderWithProviders(<DashboardOverviewPage />);

      const infoBtn = screen.getByRole('button', { name: /trigger info toast/i });
      fireEvent.click(infoBtn);

      const toastStatus = await screen.findByRole('status');
      expect(toastStatus).toHaveAttribute('aria-live', 'polite');

      const errBtn = screen.getByRole('button', { name: /trigger error toast/i });
      fireEvent.click(errBtn);

      const errStatus = (await screen.findAllByRole('status'))[1];
      expect(errStatus).toHaveAttribute('aria-live', 'assertive');
    });

    it('verifies form input error linking (aria-invalid, aria-describedby, role="alert")', async () => {
      const { container } = renderWithProviders(<GeneralSettingsForm />);

      const emailInput = screen.getByTestId('contact-email-input');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      const form = container.querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        const errorAlert = screen.getByText(/please enter a valid email address/i);
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveAttribute('role', 'alert');
        expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        expect(emailInput).toHaveAttribute('aria-describedby');
      });
    });
  });

  describe('3. Keyboard Navigation & Focus Management', () => {
    it('supports Ctrl+B / Cmd+B shortcut for desktop sidebar collapse/expand', () => {
      renderWithProviders(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>,
      );

      const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

      // Trigger Ctrl+B
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

      const expandButton = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');

      // Trigger Ctrl+B again to toggle back
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('handles mobile navigation drawer focus management and Escape key closing', async () => {
      renderWithProviders(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>,
      );

      const mobileOpenBtn = screen.getByRole('button', { name: /open navigation drawer/i });
      expect(mobileOpenBtn).toHaveAttribute('aria-expanded', 'false');

      // Open mobile drawer
      fireEvent.click(mobileOpenBtn);
      expect(mobileOpenBtn).toHaveAttribute('aria-expanded', 'true');

      // Body scroll locked
      expect(document.body.style.overflow).toBe('hidden');

      // Press Escape key to close
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('');
      });
    });
  });

  describe('4. Modal Dialog Behavior & Focus Trapping', () => {
    it('opens Quick System Check diagnostic dialog and verifies modal properties', async () => {
      renderWithProviders(<DashboardOverviewPage />);

      const diagBtn = screen.getByRole('button', { name: /quick system check/i });
      fireEvent.click(diagBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText('System Diagnostic Verification')).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close diagnostic/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('opens session revocation dialog in SecuritySettingsForm and executes confirm action', async () => {
      renderWithProviders(<SecuritySettingsForm />);

      const revokeTrigger = screen.getByRole('button', { name: /revoke all sessions/i });
      fireEvent.click(revokeTrigger);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(/confirm global session revocation/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
      fireEvent.click(confirmBtn);

      expect(
        await screen.findByText(/all active platform refresh tokens have been revoked/i),
      ).toBeInTheDocument();
    });
  });

  describe('5. Responsive Layout & Theme Token Verification', () => {
    it('verifies responsive classes on Dashboard Layout and Cards', () => {
      renderWithProviders(
        <DashboardLayout>
          <DashboardOverviewPage />
        </DashboardLayout>,
      );

      const main = screen.getByRole('main');
      expect(main).toHaveClass('flex-1', 'p-4', 'md:p-6');

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('bg-background/80', 'backdrop-blur-md');
    });

    it('verifies SettingsNavTabs responsive scrolling and focus rings', () => {
      renderWithProviders(<SettingsLayoutPage />);

      const nav = screen.getByRole('navigation', { name: /settings navigation/i });
      expect(nav).toHaveClass('overflow-x-auto');

      const generalTab = screen.getByText('General Preferences');
      expect(generalTab).toHaveClass('focus-visible:ring-ring');
    });
  });
});
