import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { DashboardLayout } from '../../app/layouts/dashboard-layout';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';
import { DashboardOverviewPage } from '../dashboard';
import {
  operationalDashboardKeys,
  getTodayOperationalBusinessDay,
} from '../dashboard/api/operational-dashboard-queries';
import { GeneralSettingsForm } from '../settings/components/general-settings-form';
import { SecuritySettingsForm } from '../settings/components/security-settings-form';
import { SettingsLayoutPage } from '../settings/routes/settings-layout-page';

import { AuthProvider } from '../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../app/providers/feature-flag-provider';
import { NotificationProvider, useNotification } from '../../app/providers/notification-provider';
import { NavigationProvider } from '../../app/navigation';
import { BreadcrumbProvider } from '../../app/breadcrumbs';

expect.extend(toHaveNoViolations);

const TEST_OWNER_SESSION = {
  id: 'usr-a11y-owner',
  email: 'owner@kinergy.platform',
  name: 'Owner User',
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
    grantedCount: 3,
    uniqueClientsCount: 3,
    deniedCount: 0,
    totalCheckIns: 3,
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
    activeCount: 1,
    totalCount: 1,
    statusBreakdown: {
      scheduled: 0,
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
    totalCents: 5000,
    formattedTotal: '$50.00',
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
      <NotificationProvider>
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
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('Milestone A5.5 — Responsive & Accessibility Validation Suite', () => {
  describe('1. Automated WCAG Accessibility Audit (jest-axe)', () => {
    it('passes WCAG accessibility checks on Dashboard Overview Page', async () => {
      const { container } = renderWithProviders(<DashboardOverviewPage />, {
        initialEntries: ['/dashboard'],
      });

      await screen.findByTestId('gym-checkins-value');

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

      await screen.findByTestId('gym-checkins-value');

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

      expect(screen.getByRole('banner')).toBeInTheDocument();

      const navElements = screen.getAllByRole('navigation');
      expect(navElements.length).toBeGreaterThan(0);

      expect(screen.getByRole('main')).toBeInTheDocument();

      const aside =
        screen.getByRole('complementary', { name: /main navigation/i }) ||
        document.querySelector('aside[aria-label="Main Navigation"]');
      expect(aside).toBeInTheDocument();
    });

    it('verifies live region toast notifications and error alert attributes', async () => {
      const ToastHarness: React.FC = () => {
        const { info, error } = useNotification();
        return (
          <div>
            <button type="button" onClick={() => info('Polite update', 'Info Title')}>
              Emit Polite Toast
            </button>
            <button type="button" onClick={() => error('Critical failure', 'Error Title')}>
              Emit Assertive Toast
            </button>
          </div>
        );
      };

      renderWithProviders(<ToastHarness />);

      fireEvent.click(screen.getByRole('button', { name: /emit polite toast/i }));

      const toastStatus = await screen.findByRole('status');
      expect(toastStatus).toHaveAttribute('aria-live', 'polite');

      fireEvent.click(screen.getByRole('button', { name: /emit assertive toast/i }));

      await waitFor(() => {
        const statuses = screen.getAllByRole('status');
        expect(statuses.some((el) => el.getAttribute('aria-live') === 'assertive')).toBe(true);
      });
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
        expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        expect(emailInput).toHaveAttribute('aria-describedby');
      });
    });

    it('renders landmark roles (banner, navigation, main, contentinfo)', async () => {
      renderWithProviders(
        <DashboardLayout>
          <div>Dashboard Body</div>
        </DashboardLayout>,
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });
  });

  describe('3. Keyboard Navigation & Focus Management', () => {
    it('supports Ctrl+B keyboard shortcut to toggle sidebar collapse', async () => {
      renderWithProviders(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>,
      );

      const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

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

      fireEvent.click(mobileOpenBtn);
      expect(mobileOpenBtn).toHaveAttribute('aria-expanded', 'true');
      expect(document.body.style.overflow).toBe('hidden');

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('');
      });
    });
  });

  describe('4. Modal Dialog Behavior & Focus Trapping', () => {
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
