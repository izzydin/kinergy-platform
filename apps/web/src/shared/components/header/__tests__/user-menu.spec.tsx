/**
 * Track B — Step B4: UserMenu & Header Authentication Integration Test Suite
 *
 * Unit and integration tests for <UserMenu /> and getUserInitials helper.
 * Validates display name, email, role badge, initials calculation, ARIA accessibility,
 * and reactive logout invocation.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserMenu, getUserInitials } from '../user-menu';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import type { AuthUser } from '../../../../modules/auth/domain/auth-state.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const TEST_USER: AuthUser = {
  id: 'usr_user_menu_test',
  email: 'lead.architect@kinergy.io',
  name: 'Lead Architect',
  roles: ['ADMIN', 'OPERATOR'],
  permissions: ['admin:read'],
  tenantId: 'tenant_test',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderUserMenu(userOverride: AuthUser | null = TEST_USER) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={userOverride}>
        <UserMenu />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Track B — Step B4: UserMenu Component & Initials Helper', () => {
  describe('1. getUserInitials Helper', () => {
    it('calculates first and last initials from multi-word names', () => {
      expect(getUserInitials('Lead Architect')).toBe('LA');
      expect(getUserInitials('Jane Mary Doe')).toBe('JD');
    });

    it('calculates first two letters for single-word names', () => {
      expect(getUserInitials('Architect')).toBe('AR');
    });

    it('returns default fallback U for null, undefined, or empty string', () => {
      expect(getUserInitials(null)).toBe('U');
      expect(getUserInitials(undefined)).toBe('U');
      expect(getUserInitials('')).toBe('U');
      expect(getUserInitials('   ')).toBe('U');
    });
  });

  describe('2. UserMenu Component Rendering & Interactivity', () => {
    it('renders initials badge and display name on trigger button', () => {
      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('LA')).toBeInTheDocument();
      expect(screen.getByText('Lead Architect')).toBeInTheDocument();
    });

    it('opens dropdown menu displaying email and role badge when trigger is clicked', () => {
      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByText('lead.architect@kinergy.io')).toBeInTheDocument();
      expect(screen.getByText('ADMIN')).toBeInTheDocument();
    });

    it('closes dropdown menu when Escape key is pressed', () => {
      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape', code: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('invokes logout when Sign Out button is clicked', async () => {
      if (!global.fetch) {
        (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
      }
      jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ status: 'ok' }),
          text: () => Promise.resolve(JSON.stringify({ status: 'ok' })),
        } as Response),
      );

      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);

      const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
      expect(signOutBtn).toBeInTheDocument();

      fireEvent.click(signOutBtn);

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });
});
