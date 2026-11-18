import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeneralSettingsPage } from '../routes/general-settings-page';
import { SettingsLayoutPage } from '../routes/settings-layout-page';
import { settingsKeys } from '../api/settings-query-keys';
import { LocaleProvider } from '../../../app/providers/locale-provider';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { ThemeProvider } from '../../../app/providers/theme-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_AUTH_USER: AuthUser = {
  id: 'usr-corp-999',
  name: 'Valeria Morales',
  email: 'valeria@kinergy-platform.io',
  roles: ['OWNER', 'ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-enterprise-hq',
  status: 'ACTIVE',
  createdAt: '2026-01-15T09:00:00.000Z',
};

const MOCK_PROFILE: UserProfileViewModel = {
  id: 'usr-corp-999',
  email: 'valeria@kinergy-platform.io',
  displayName: 'Valeria Morales',
  status: 'ACTIVE',
  roles: ['OWNER', 'ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-enterprise-hq',
  avatarUrl: null,
  role: 'OWNER',
  createdAt: '2026-01-15T09:00:00.000Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  user?: AuthUser;
  profile?: UserProfileViewModel;
  initialEntries?: string[];
  theme?: 'light' | 'dark' | 'system';
}

function renderGeneralSettings(ui: React.ReactElement, options: RenderOptions = {}) {
  const queryClient = createTestQueryClient();
  if (options.profile) {
    queryClient.setQueryData(settingsKeys.profile(), options.profile);
  }

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={options.initialEntries ?? ['/settings/general']}>
          <AuthProvider initialSessionOverride={options.user ?? MOCK_AUTH_USER} skipBootstrap>
            <ThemeProvider defaultTheme={options.theme ?? 'light'}>
              <LocaleProvider>{ui}</LocaleProvider>
            </ThemeProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('General Settings Page — Productization & Artifact Removal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Artifact Removal Verification
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Removal of Development & Testing Artifacts', () => {
    it('does NOT render Step A5.3 or architectural validation text in SettingsLayoutPage', () => {
      renderGeneralSettings(<SettingsLayoutPage />);

      expect(screen.queryByText(/Step A5\.3/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Validation/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Architectural validation screen verifying Form Foundation/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('React Hook Form')).not.toBeInTheDocument();
      expect(screen.queryByText('Zod Validation')).not.toBeInTheDocument();
      expect(screen.queryByText('Radix UI')).not.toBeInTheDocument();
    });

    it('does NOT render A5.6 Profile State or 4-State demo text in GeneralSettingsPage', async () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.queryByText(/A5\.6 Profile State/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Demonstrates async 4-State Contract/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Form Validation Spec/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Simulate Server Submission Failure/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Form Architecture Verification/i)).not.toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Page Header & Production Navigation
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Professional Page Header & Structure', () => {
    it('renders the official General settings title and description', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(
        screen.getByRole('heading', { level: 2, name: 'General settings' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Manage your organization's profile and general application preferences."),
      ).toBeInTheDocument();
    });

    it('renders all professional settings cards in cohesive hierarchy', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByTestId('organization-profile-card')).toBeInTheDocument();
      expect(screen.getByTestId('settings-language-card')).toBeInTheDocument();
      expect(screen.getByTestId('regional-standards-card')).toBeInTheDocument();
      expect(screen.getByTestId('application-preferences-card')).toBeInTheDocument();
      expect(screen.getByTestId('operational-standards-card')).toBeInTheDocument();
      expect(screen.getByTestId('profile-success')).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Organization Profile & Tenant Context
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Organization Profile & Multi-Tenant Isolation', () => {
    it('displays authoritative tenant scope without hardcoding or invented mutation', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByTestId('org-tenant-id')).toHaveTextContent('tenant-enterprise-hq');
      expect(screen.getByTestId('org-contact-email')).toHaveTextContent(
        'support@kinergy-platform.io',
      );
      expect(screen.getByTestId('org-status-badge')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Organization profile and facility parameters are provisioned at the platform level/i,
        ),
      ).toBeInTheDocument();
    });

    it('displays tenant-specific organization title for custom tenants', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });
      expect(screen.getByTestId('org-display-name')).toHaveTextContent(
        'Kinergy Facility (tenant-enterprise-hq)',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Regional Preferences & Interactive Previews
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Regional Preferences & Format Standards', () => {
    it('displays system timezone and USD currency standard', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByTestId('regional-timezone-value')).toHaveTextContent(
        'America/New_York (UTC-5)',
      );
      expect(screen.getByTestId('regional-currency-value')).toHaveTextContent('USD ($)');
    });

    it('renders dynamic live format previews that adapt to locale switching', async () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      // In English default (en-US)
      expect(screen.getByTestId('preview-date')).toHaveTextContent('Nov 18, 2026');
      expect(screen.getByTestId('preview-number')).toHaveTextContent('1,250,000.5');
      expect(screen.getByTestId('preview-currency')).toHaveTextContent('$49.99');

      // Switch to Spanish
      const spanishOption = screen.getByTestId('lang-option-es');
      fireEvent.click(spanishOption);

      await waitFor(() => {
        expect(screen.getByTestId('active-locale-badge')).toHaveTextContent('Español (es-419)');
        expect(screen.getByTestId('preview-date')).toHaveTextContent('18 nov 2026');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Application Preferences & Theme Persistence
  // ───────────────────────────────────────────────────────────────────────────

  describe('5. Application Preferences & Theme Mode Selection', () => {
    it('renders accessible theme radio group and shows active theme badge', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByTestId('application-preferences-card')).toBeInTheDocument();
      expect(screen.getByTestId('active-theme-badge')).toHaveTextContent(/Active Theme:\s*light/i);
      expect(screen.getByTestId('theme-option-light')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'false');
    });

    it('updates theme selection, root document class, and localStorage on selection', async () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      const darkOption = screen.getByTestId('theme-option-dark');
      fireEvent.click(darkOption);

      await waitFor(() => {
        expect(screen.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('active-theme-badge')).toHaveTextContent(/Active Theme:\s*dark/i);
      });

      expect(localStorage.getItem('kinergy_theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Operational Standards Section
  // ───────────────────────────────────────────────────────────────────────────

  describe('6. Operational Standards & Module Governance', () => {
    it('provides clear navigation links to dedicated domain modules', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByTestId('op-link-scheduling')).toHaveAttribute('href', '/scheduling/rooms');
      expect(screen.getByTestId('op-link-resources')).toHaveAttribute(
        'href',
        '/resources/inventory',
      );
      expect(screen.getByTestId('op-link-security')).toHaveAttribute('href', '/settings/security');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Authenticated Employee Profile (4-State Contract)
  // ───────────────────────────────────────────────────────────────────────────

  describe('7. Authenticated Employee Profile Section', () => {
    it('renders populated employee profile with status and role badges', () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      expect(screen.getByText('Valeria Morales')).toBeInTheDocument();
      expect(screen.getByText('valeria@kinergy-platform.io')).toBeInTheDocument();
      expect(screen.getByTestId('profile-status-badge')).toHaveTextContent('ACTIVE');
      expect(screen.getByTestId('profile-role-badge')).toHaveTextContent('OWNER');
      expect(screen.getByText(/Facility Tenant:/i)).toBeInTheDocument();
      expect(screen.getAllByText('tenant-enterprise-hq').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(
          /Employee role assignments and identity attributes are managed by your facility administrator/i,
        ),
      ).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Spanish Localization
  // ───────────────────────────────────────────────────────────────────────────

  describe('8. Latin American Spanish Localization (es-419)', () => {
    it('translates all general settings titles and descriptions in Spanish', async () => {
      renderGeneralSettings(<GeneralSettingsPage />, { profile: MOCK_PROFILE });

      // Click Spanish
      fireEvent.click(screen.getByTestId('lang-option-es'));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: 'Configuración general' }),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'Administra el perfil de tu organización y las preferencias generales de la aplicación.',
          ),
        ).toBeInTheDocument();
        expect(screen.getByText('Perfil de la organización')).toBeInTheDocument();
        expect(screen.getByText('Preferencias de la aplicación')).toBeInTheDocument();
        expect(screen.getByText('Estándares y políticas operativas')).toBeInTheDocument();
        expect(screen.getByText('Perfil del empleado autenticado')).toBeInTheDocument();
      });
    });
  });
});
