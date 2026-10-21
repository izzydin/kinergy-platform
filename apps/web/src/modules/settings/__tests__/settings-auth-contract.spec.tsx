/**
 * Prompt 6 — Align Kinergy Settings with Real Authentication APIs
 *
 * Comprehensive contract and component test suite covering:
 *  1. Authoritative Profile Reading (GET /api/v1/auth/me)
 *  2. Safe Password Change (POST /api/v1/auth/change-password)
 *  3. Explicit Profile Update Capability Gap (Unsupported by backend User model)
 *  4. Security & UX Invariants (credential clearing, duplicate submit prevention, no credential leakage)
 *  5. Component integration for SettingsProfileSection and SecuritySettingsForm
 */

import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpClient } from '../../../shared/api';
import {
  changePassword,
  fetchUserProfile,
  updateUserProfile,
  SETTINGS_AUTH_ENDPOINTS,
} from '../api/settings-api';
import { SettingsProfileSection } from '../components/settings-profile-section';
import { SecuritySettingsForm } from '../components/security-settings-form';
import { settingsKeys } from '../api/settings-query-keys';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_BACKEND_USER_PROFILE = {
  id: 'usr-identity-789',
  email: 'chief.operator@kinergy-platform.io',
  status: 'ACTIVE',
  roles: ['OPERATOR', 'ENERGY_ANALYST'],
  permissions: ['client:read', 'energy:read', 'telemetry:write'],
  tenantId: 'tenant-enterprise-1',
  createdAt: '2026-02-15T10:30:00.000Z',
  updatedAt: '2026-03-01T12:00:00.000Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement, queryClient = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authoritative Profile Contract (GET /api/v1/auth/me)
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings Contract — Profile Retrieval (GET /api/v1/auth/me)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the authoritative endpoint path /api/v1/auth/me', () => {
    expect(SETTINGS_AUTH_ENDPOINTS.profile).toBe('/api/v1/auth/me');
  });

  it('correctly requests and parses authoritative UserProfileDto response', async () => {
    const getSpy = jest.spyOn(httpClient, 'get').mockResolvedValueOnce(MOCK_BACKEND_USER_PROFILE);

    const profile = await fetchUserProfile();

    expect(getSpy).toHaveBeenCalledWith('/api/v1/auth/me');
    expect(profile.id).toBe('usr-identity-789');
    expect(profile.email).toBe('chief.operator@kinergy-platform.io');
    expect(profile.status).toBe('ACTIVE');
    expect(profile.roles).toEqual(['OPERATOR', 'ENERGY_ANALYST']);
    expect(profile.permissions).toEqual(['client:read', 'energy:read', 'telemetry:write']);
    expect(profile.tenantId).toBe('tenant-enterprise-1');
    expect(profile.createdAt).toBe('2026-02-15T10:30:00.000Z');
    // Computed fallbacks for UI presentation
    expect(profile.displayName).toBe('chief.operator');
    expect(profile.role).toBe('OPERATOR');
  });

  it('handles server errors and session expiry from /api/v1/auth/me', async () => {
    jest
      .spyOn(httpClient, 'get')
      .mockRejectedValueOnce(new Error('Invalid or expired access token'));

    await expect(fetchUserProfile()).rejects.toThrow('Invalid or expired access token');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Authoritative Password Change Contract (POST /api/v1/auth/change-password)
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings Contract — Password Change (POST /api/v1/auth/change-password)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the authoritative endpoint path /api/v1/auth/change-password', () => {
    expect(SETTINGS_AUTH_ENDPOINTS.changePassword).toBe('/api/v1/auth/change-password');
  });

  it('constructs correct payload containing only currentPassword and newPassword', async () => {
    const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ success: true });

    const result = await changePassword({
      currentPassword: 'CurrentSecret123!',
      newPassword: 'BrandNewSecret456!',
    });

    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/change-password', {
      currentPassword: 'CurrentSecret123!',
      newPassword: 'BrandNewSecret456!',
    });
    expect(result).toEqual({ success: true });
  });

  it('validates minimum password length client-side before network dispatch', async () => {
    const postSpy = jest.spyOn(httpClient, 'post');

    await expect(
      changePassword({
        currentPassword: 'short',
        newPassword: 'ValidPassword123!',
      }),
    ).rejects.toThrow(/current password must be at least 8 characters/i);

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('propagates backend validation error when current password is invalid', async () => {
    jest.spyOn(httpClient, 'post').mockRejectedValueOnce(new Error('Invalid current password.'));

    await expect(
      changePassword({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewValidPassword123!',
      }),
    ).rejects.toThrow('Invalid current password.');
  });

  it('propagates backend error when new password is identical to current', async () => {
    jest
      .spyOn(httpClient, 'post')
      .mockRejectedValueOnce(new Error('New password must differ from current password.'));

    await expect(
      changePassword({
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
      }),
    ).rejects.toThrow('New password must differ from current password.');
  });

  it('propagates backend error when new password was recently used', async () => {
    jest
      .spyOn(httpClient, 'post')
      .mockRejectedValueOnce(
        new Error('Password has been used recently. Please choose a new password.'),
      );

    await expect(
      changePassword({
        currentPassword: 'CurrentSecret123!',
        newPassword: 'RecentUsedSecret123!',
      }),
    ).rejects.toThrow(/password has been used recently/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Documented Capability Gap: Self-Service Profile Update
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings Contract — Profile Update Capability Gap', () => {
  it('throws explicit capability error explaining self-service updates are unsupported', async () => {
    await expect(
      updateUserProfile({
        displayName: 'New Name',
        email: 'newemail@kinergy.io',
      }),
    ).rejects.toThrow(
      'Self-service profile updates are not supported by the platform identity API.',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SettingsProfileSection Component Integration
// ─────────────────────────────────────────────────────────────────────────────

describe('SettingsProfileSection Component', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders loading skeleton when profile query is in progress', () => {
    renderWithClient(<SettingsProfileSection simulationState="loading" />);
    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
  });

  it('renders error state with retry action on failure', () => {
    renderWithClient(<SettingsProfileSection simulationState="error" />);
    expect(screen.getByText('Operation Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders populated user profile card from QueryClient cache with status badge', async () => {
    const queryClient = createTestQueryClient();
    const mockProfile: UserProfileViewModel = {
      id: 'usr-123',
      email: 'alex@kinergy.io',
      displayName: 'Alex Operator',
      status: 'ACTIVE',
      roles: ['OPERATOR'],
      permissions: ['client:read'],
      tenantId: 'tenant-1',
      avatarUrl: null,
      role: 'OPERATOR',
      createdAt: '2026-01-10T08:00:00.000Z',
    };

    queryClient.setQueryData(settingsKeys.profile(), mockProfile);

    renderWithClient(<SettingsProfileSection simulationState="success" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('profile-success')).toBeInTheDocument();
    });

    expect(screen.getByText('Alex Operator')).toBeInTheDocument();
    expect(screen.getByText('alex@kinergy.io')).toBeInTheDocument();
    expect(screen.getByTestId('profile-status-badge')).toHaveTextContent('ACTIVE');
    expect(screen.getByTestId('profile-role-badge')).toHaveTextContent('OPERATOR');
    expect(screen.getByText(/member since/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SecuritySettingsForm Component Integration & Safety Invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('SecuritySettingsForm Component Security & UX Invariants', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates password mismatch client-side and stops request submission', async () => {
    const postSpy = jest.spyOn(httpClient, 'post');
    const { container } = renderWithClient(<SecuritySettingsForm />);

    fireEvent.change(screen.getByTestId('current-password-input'), {
      target: { value: 'CurrentPass123!' },
    });
    fireEvent.change(screen.getByTestId('new-password-input'), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByTestId('confirm-password-input'), {
      target: { value: 'MismatchPassword123!' },
    });

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText(/new passwords do not match/i)).toBeInTheDocument();
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('submits valid password change and clears password inputs on success', async () => {
    const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ success: true });

    const { container } = renderWithClient(<SecuritySettingsForm />);

    const currentInput = screen.getByTestId('current-password-input');
    const newInput = screen.getByTestId('new-password-input');
    const confirmInput = screen.getByTestId('confirm-password-input');

    fireEvent.change(currentInput, { target: { value: 'CurrentPass123!' } });
    fireEvent.change(newInput, { target: { value: 'ValidPass123!' } });
    fireEvent.change(confirmInput, { target: { value: 'ValidPass123!' } });

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('security-form-success')).toBeInTheDocument();
    });

    // Request payload invariant: confirmPassword is omitted
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/change-password', {
      currentPassword: 'CurrentPass123!',
      newPassword: 'ValidPass123!',
    });

    // UX & Security invariant: password fields are cleared on success
    expect(currentInput).toHaveValue('');
    expect(newInput).toHaveValue('');
    expect(confirmInput).toHaveValue('');
  });

  it('displays server error message on failure without leaking credentials', async () => {
    jest.spyOn(httpClient, 'post').mockRejectedValueOnce(new Error('Invalid current password.'));

    const { container } = renderWithClient(<SecuritySettingsForm />);

    fireEvent.change(screen.getByTestId('current-password-input'), {
      target: { value: 'WrongSecret123!' },
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

    // Ensure password values are never included in error messages
    expect(screen.queryByText(/WrongSecret123!/)).not.toBeInTheDocument();
  });

  it('disables submit button while submission is in-flight to prevent duplicate requests', async () => {
    let resolvePost: (val: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    jest
      .spyOn(httpClient, 'post')
      .mockReturnValueOnce(pendingPromise as Promise<{ success: boolean }>);

    const { container } = renderWithClient(<SecuritySettingsForm />);

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
    expect(submitBtn).not.toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);

    // During flight, button must be disabled
    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });

    // Resolve post
    resolvePost({ success: true });

    await waitFor(() => {
      expect(screen.getByTestId('security-form-success')).toBeInTheDocument();
    });
  });
});
