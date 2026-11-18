/**
 * Track B — Step B4.2: UserMenu & Logout Integration Test Suite
 *
 * Unit and integration tests for <UserMenu /> and getUserInitials helper.
 * Validates display name, email fallback, ARIA accessibility (aria-busy, aria-disabled),
 * duplicate logout submission prevention, and reactive logout invocation.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { Header } from '../header';
import { UserMenu, getUserInitials } from '../user-menu';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { LocaleProvider } from '../../../../app/providers/locale-provider';
import { SlotProvider } from '../../../ui/slots';
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

const USER_NO_NAME: AuthUser = {
  id: 'usr_no_name',
  email: 'developer@kinergy.io',
  name: '',
  roles: ['OPERATOR'],
  permissions: [],
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

describe('Track B — Step B4.2: UserMenu Component & Logout Integration', () => {
  describe('1. getUserInitials Helper', () => {
    it('calculates first and last initials from multi-word names', () => {
      expect(getUserInitials('Lead Architect', 'test@kinergy.io')).toBe('LA');
      expect(getUserInitials('Jane Mary Doe', 'test@kinergy.io')).toBe('JD');
    });

    it('calculates first two letters for single-word names', () => {
      expect(getUserInitials('Architect', 'test@kinergy.io')).toBe('AR');
    });

    it('falls back to email prefix initials when name is null, undefined, or empty', () => {
      expect(getUserInitials(null, 'developer@kinergy.io')).toBe('DE');
      expect(getUserInitials(undefined, 'architect@kinergy.io')).toBe('AR');
      expect(getUserInitials('', 'john@kinergy.io')).toBe('JO');
    });

    it('returns default fallback U when both name and email are missing', () => {
      expect(getUserInitials(null, null)).toBe('U');
      expect(getUserInitials(undefined, undefined)).toBe('U');
      expect(getUserInitials('', '')).toBe('U');
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

    it('uses email as deterministic display name fallback when user name is empty', () => {
      renderUserMenu(USER_NO_NAME);

      const trigger = screen.getByRole('button', {
        name: /user account menu for developer@kinergy.io/i,
      });

      expect(trigger).toBeInTheDocument();
      expect(screen.getByText('DE')).toBeInTheDocument();
      expect(screen.getByText('developer@kinergy.io')).toBeInTheDocument();
    });

    it('opens dropdown menu displaying email and role badge when trigger is clicked', () => {
      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();
      expect(screen.getByText('lead.architect@kinergy.io')).toBeInTheDocument();
      expect(screen.getByText('ADMIN')).toBeInTheDocument();
    });

    it('closes dropdown menu when Escape key is pressed', () => {
      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole('menu', { name: /user account options/i }), {
        key: 'Escape',
        code: 'Escape',
      });

      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('invokes logout when Sign Out button is clicked and prevents duplicate submissions', async () => {
      let fetchCallCount = 0;
      if (!global.fetch) {
        (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
      }
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ status: 'ok' }),
          text: () => Promise.resolve(JSON.stringify({ status: 'ok' })),
        } as Response);
      });

      renderUserMenu(TEST_USER);

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);

      const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
      expect(signOutBtn).toBeInTheDocument();

      // Trigger first logout click
      fireEvent.click(signOutBtn);

      // Trigger rapid second logout click to test duplicate submission prevention
      fireEvent.click(signOutBtn);

      await waitFor(() => {
        expect(
          screen.queryByRole('menu', { name: /user account options/i }),
        ).not.toBeInTheDocument();
      });

      expect(fetchCallCount).toBeLessThanOrEqual(1);
    });
  });

  describe('3. Header Shell Layout & Non-Functional Control Removal', () => {
    it('renders Header with breadcrumbs and UserMenu while omitting non-functional global search and notification bell controls', () => {
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={TEST_USER}>
            <SlotProvider>
              <Header />
            </SlotProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Banner landmark and responsive alignment classes
      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass(
        'flex',
        'h-16',
        'w-full',
        'items-center',
        'justify-between',
        'gap-4',
        'pl-14',
        'pr-4',
        'md:px-6',
      );

      // Breadcrumbs and UserMenu are rendered
      expect(
        screen.getByRole('navigation', { name: /breadcrumbs placeholder/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /user account menu for lead architect/i }),
      ).toBeInTheDocument();

      // Global search ("Search platform...") and notification bell are absent
      expect(screen.queryByText(/search platform/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/global search placeholder/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/notifications placeholder/i)).not.toBeInTheDocument();
    });
  });

  describe('4. Outside-Click Dismissal & Interaction Boundary Contract', () => {
    it('toggles dropdown closed when clicking the trigger while open', () => {
      renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      // 1st click: open
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // 2nd click: close
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
    });

    it('closes dropdown when clicking outside on page content or another button', () => {
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={TEST_USER}>
            <div>
              <UserMenu />
              <button data-testid="outside-button">Outside Button</button>
              <div data-testid="outside-content">Page Content</div>
            </div>
          </AuthProvider>
        </QueryClientProvider>,
      );

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      // Open menu
      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Pointer down on outside button dismisses menu
      fireEvent.pointerDown(screen.getByTestId('outside-button'));
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // Re-open and verify mousedown on page content also dismisses menu
      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside-content'));
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
    });

    it('keeps dropdown open when clicking inside dropdown profile details or badge', () => {
      renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Click on role badge inside menu
      fireEvent.pointerDown(screen.getByText('ADMIN'));
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Click on user email inside menu
      fireEvent.pointerDown(screen.getByText('lead.architect@kinergy.io'));
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();
    });

    it('keeps dropdown open and switches language when clicking language selector buttons', () => {
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={TEST_USER}>
            <LocaleProvider>
              <UserMenu />
            </LocaleProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Click Spanish button inside language selector
      const esBtn = screen.getByTestId('user-menu-lang-es');
      fireEvent.pointerDown(esBtn);
      fireEvent.click(esBtn);

      // Menu remains open and Spanish is selected
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();
      expect(esBtn).toHaveAttribute('aria-checked', 'true');

      // Click English button
      const enBtn = screen.getByTestId('user-menu-lang-en');
      fireEvent.pointerDown(enBtn);
      fireEvent.click(enBtn);

      // Menu still open and English is selected
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();
      expect(enBtn).toHaveAttribute('aria-checked', 'true');
    });

    it('supports portal-rendered content within interaction boundary without dismissing', () => {
      // Simulate portal-rendered content attached to document.body
      const portalRoot = document.createElement('div');
      portalRoot.setAttribute('data-user-menu-portal', 'true');
      document.body.appendChild(portalRoot);

      const portalItem = document.createElement('button');
      portalItem.setAttribute('data-testid', 'portal-nested-item');
      portalItem.textContent = 'Portal Language Option';
      portalRoot.appendChild(portalItem);

      renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Interaction with portal-rendered content does NOT close menu
      fireEvent.pointerDown(portalItem);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Interaction outside both menu and portal closes menu
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();

      document.body.removeChild(portalRoot);
    });

    it('closes dropdown on window-level Escape key and returns focus to trigger', () => {
      renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Fire Escape key globally on window
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('closes dropdown on route navigation when rendered inside Router context', () => {
      const queryClient = createTestQueryClient();

      const NavigationFixture: React.FC = () => {
        const navigate = useNavigate();
        return (
          <div>
            <UserMenu />
            <button data-testid="nav-link-btn" onClick={() => navigate('/settings/security')}>
              Go to Security
            </button>
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={TEST_USER}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <NavigationFixture />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      // Open menu
      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      // Navigate to another route
      act(() => {
        fireEvent.click(screen.getByTestId('nav-link-btn'));
      });

      // Menu automatically closed on route transition
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('handles repeated outside clicks cleanly without errors when already closed', () => {
      renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      // Open then close via outside click
      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();

      // Repeated outside clicks while closed execute without errors
      expect(() => {
        fireEvent.pointerDown(document.body);
        fireEvent.mouseDown(document.body);
        fireEvent.pointerDown(document.body);
      }).not.toThrow();

      expect(screen.queryByRole('menu', { name: /user account options/i })).not.toBeInTheDocument();
    });

    it('cleans up global listeners on unmount', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = renderUserMenu(TEST_USER);
      const trigger = screen.getByRole('button', {
        name: /user account menu for lead architect/i,
      });

      fireEvent.click(trigger);
      expect(screen.getByRole('menu', { name: /user account options/i })).toBeInTheDocument();

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'pointerdown',
        expect.any(Function),
        true,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), true);

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });
});
