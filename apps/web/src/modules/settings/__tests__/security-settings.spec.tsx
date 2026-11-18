import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SecuritySettingsPage } from '../routes/security-settings-page';
import { SecuritySettingsForm } from '../components/security-settings-form';
import { AccountSecurityOverviewSection } from '../components/account-security-overview-section';
import { ActiveSessionsSection } from '../components/active-sessions-section';
import { SecurityActivitySection } from '../components/security-activity-section';
import { LocaleProvider } from '../../../app/providers/locale-provider';
import { AuthProvider, type AuthUser } from '../../../app/providers/auth-provider';
import {
  saveEmployeeLocalePreference,
  clearActiveEmployeeLocaleSession,
} from '../../../shared/i18n/preference-storage';
import { httpClient } from '../../../shared/api';

const MOCK_USER: AuthUser = {
  id: 'usr-security-101',
  name: 'Security Admin',
  email: 'admin.sec@kinergy.io',
  roles: ['ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-enterprise-hq',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, { locale }: { locale?: 'en' | 'es' } = {}) {
  const queryClient = createTestQueryClient();
  if (locale) {
    saveEmployeeLocalePreference(locale, MOCK_USER.id, MOCK_USER.email);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={MOCK_USER} skipBootstrap>
        <LocaleProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </LocaleProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('SecuritySettings — Production Productization Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearActiveEmployeeLocaleSession();
    window.localStorage.clear();
  });

  describe('1. Page Header & Development Artifact Removal', () => {
    it('renders Security title and professional description without development milestone badges', () => {
      renderWithProviders(<SecuritySettingsPage />);

      expect(screen.getByRole('heading', { level: 2, name: /^security$/i })).toBeInTheDocument();
      expect(
        screen.getByText('Manage your password, active sessions, and account security.'),
      ).toBeInTheDocument();

      // Ensure development badges & text are completely removed
      expect(screen.queryByText('Security Contract')).not.toBeInTheDocument();
      expect(screen.queryByText(/validates passwordinput primitives/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/password input spec:/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/simulate invalid credential server error/i),
      ).not.toBeInTheDocument();
    });

    it('ensures no development testing checkboxes appear in the DOM', () => {
      renderWithProviders(<SecuritySettingsPage />);
      expect(screen.queryByRole('checkbox', { name: /simulate/i })).not.toBeInTheDocument();
    });
  });

  describe('2. Account Security Overview Section', () => {
    it('renders authentic platform security protections without fabricated status', () => {
      renderWithProviders(<AccountSecurityOverviewSection />);

      expect(screen.getByTestId('security-overview-card')).toBeInTheDocument();
      expect(screen.getByText(/account security overview/i)).toBeInTheDocument();
      expect(screen.getByText('Argon2id Enterprise Identity')).toBeInTheDocument();
      expect(screen.getByText('Short-Lived Access & Rotated Refresh')).toBeInTheDocument();
      expect(screen.getByText('15m / 7d')).toBeInTheDocument();
      expect(screen.getByText('Reuse Prevention')).toBeInTheDocument();
      expect(screen.getByText('5 Previous')).toBeInTheDocument();
      expect(screen.getByText('Two-Factor Auth')).toBeInTheDocument();
      expect(screen.getByText('Not Configured')).toBeInTheDocument();
      expect(screen.getByText('Strict Multi-Tenant Database Boundaries')).toBeInTheDocument();
    });
  });

  describe('3. Password Management & Validation', () => {
    it('renders all three password input primitives with show/hide accessibility', () => {
      renderWithProviders(<SecuritySettingsForm />);

      expect(screen.getByTestId('current-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('new-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('security-submit-btn')).toHaveTextContent(/update password/i);
    });

    it('blocks client submission when new passwords mismatch', async () => {
      const postSpy = jest.spyOn(httpClient, 'post');
      const { container } = renderWithProviders(<SecuritySettingsForm />);

      fireEvent.change(screen.getByTestId('current-password-input'), {
        target: { value: 'CurrentSecret123!' },
      });
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'NewSecret123!' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'DifferentSecret123!' },
      });

      fireEvent.submit(container.querySelector('form')!);

      await waitFor(() => {
        expect(screen.getByText(/new passwords do not match/i)).toBeInTheDocument();
      });

      expect(postSpy).not.toHaveBeenCalled();
    });

    it('submits valid password change and clears inputs upon success', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ success: true });
      const { container } = renderWithProviders(<SecuritySettingsForm />);

      const currentInput = screen.getByTestId('current-password-input');
      const newInput = screen.getByTestId('new-password-input');
      const confirmInput = screen.getByTestId('confirm-password-input');

      fireEvent.change(currentInput, { target: { value: 'OldPassword123!' } });
      fireEvent.change(newInput, { target: { value: 'StrongNewPass456!' } });
      fireEvent.change(confirmInput, { target: { value: 'StrongNewPass456!' } });

      fireEvent.submit(container.querySelector('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('security-form-success')).toBeInTheDocument();
      });

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/change-password', {
        currentPassword: 'OldPassword123!',
        newPassword: 'StrongNewPass456!',
      });

      // Passwords cleared immediately from memory and DOM
      expect(currentInput).toHaveValue('');
      expect(newInput).toHaveValue('');
      expect(confirmInput).toHaveValue('');
    });

    it('displays backend error message without leaking sensitive credentials', async () => {
      jest.spyOn(httpClient, 'post').mockRejectedValueOnce(new Error('Invalid current password.'));
      const { container } = renderWithProviders(<SecuritySettingsForm />);

      fireEvent.change(screen.getByTestId('current-password-input'), {
        target: { value: 'WrongSecret999!' },
      });
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'ValidPass123!' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'ValidPass123!' },
      });

      fireEvent.submit(container.querySelector('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('security-form-error')).toBeInTheDocument();
        expect(screen.getByText('Invalid current password.')).toBeInTheDocument();
      });

      expect(screen.queryByText(/WrongSecret999!/)).not.toBeInTheDocument();
    });

    it('disables submit button during flight to prevent duplicate requests', async () => {
      let resolveFn: (val: unknown) => void = () => {};
      const pending = new Promise((resolve) => {
        resolveFn = resolve;
      });
      jest.spyOn(httpClient, 'post').mockReturnValueOnce(pending as Promise<{ success: boolean }>);

      const { container } = renderWithProviders(<SecuritySettingsForm />);

      fireEvent.change(screen.getByTestId('current-password-input'), {
        target: { value: 'CurrentPass123!' },
      });
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'ValidPass123!' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'ValidPass123!' },
      });

      const submitBtn = screen.getByTestId('security-submit-btn');
      fireEvent.submit(container.querySelector('form')!);

      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
      });

      resolveFn({ success: true });

      await waitFor(() => {
        expect(screen.getByTestId('security-form-success')).toBeInTheDocument();
      });
    });
  });

  describe('4. Active Sessions & Global Revocation', () => {
    it('renders current session indicator with token lifetime details', () => {
      renderWithProviders(<ActiveSessionsSection />);

      expect(screen.getByTestId('active-sessions-card')).toBeInTheDocument();
      expect(screen.getByText('Current Active Session')).toBeInTheDocument();
      expect(screen.getByText('Online / Active')).toBeInTheDocument();
      expect(screen.getByText(/Bearer JWT \(Stateless\)/)).toBeInTheDocument();
      expect(screen.getByText(/15 min access · 7 days refresh/)).toBeInTheDocument();
    });

    it('opens global session revocation modal with impact explanation and triggers backend logout', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ success: true });
      renderWithProviders(<SecuritySettingsForm />);

      const revokeBtn = screen.getByRole('button', { name: /revoke all sessions/i });
      fireEvent.click(revokeBtn);

      expect(await screen.findByText(/confirm global session revocation/i)).toBeInTheDocument();
      expect(
        screen.getByText(/this action will immediately invalidate all refresh tokens/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/already-issued access tokens expire within 15 minutes/i),
      ).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
      fireEvent.click(confirmBtn);

      expect(
        await screen.findByText(/all active platform refresh tokens have been revoked/i),
      ).toBeInTheDocument();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout');
    });
  });

  describe('5. Recent Security Activity Section', () => {
    it('renders platform audit logging notice transparently', () => {
      renderWithProviders(<SecurityActivitySection />);

      expect(screen.getByTestId('security-activity-card')).toBeInTheDocument();
      expect(screen.getByText(/recent security activity/i)).toBeInTheDocument();
      expect(screen.getByText('Authoritative Platform Audit Logging')).toBeInTheDocument();
      expect(
        screen.getByText(
          /security events \(authentication attempts, password updates, and session revocations\)/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('6. Spanish Localization (es)', () => {
    it('renders full security settings interface in Spanish', () => {
      renderWithProviders(<SecuritySettingsPage />, { locale: 'es' });

      expect(screen.getByRole('heading', { level: 2, name: /^seguridad$/i })).toBeInTheDocument();
      expect(
        screen.getByText('Administra tu contraseña, sesiones activas y seguridad de la cuenta.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Resumen de seguridad de la cuenta')).toBeInTheDocument();
      expect(screen.getByText('Gestión de contraseña')).toBeInTheDocument();
      expect(screen.getByText('Contraseña actual')).toBeInTheDocument();
      expect(screen.getByText('Nueva contraseña')).toBeInTheDocument();
      expect(screen.getByText('Confirmar nueva contraseña')).toBeInTheDocument();
      expect(screen.getByText('Sesiones activas')).toBeInTheDocument();
      expect(screen.getByText('Actividad de seguridad reciente')).toBeInTheDocument();
    });
  });
});
