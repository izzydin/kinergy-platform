/**
 * Track B — Step B4.3: Authenticated Sidebar Integration Test Suite
 *
 * Unit and integration tests for <Sidebar />.
 * Validates route active state resolution, desktop collapse (Ctrl+B),
 * mobile drawer accessibility (Escape key, backdrop dismiss),
 * and presentation-only navigation landmark semantics.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from '../sidebar';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../../app/providers/feature-flag-provider';
import type { AuthUser } from '../../../../modules/auth/domain/auth-state.types';
import { NavigationProvider } from '../../../../app/navigation';
import { defaultNavigationItems } from '../../../../app/navigation/navigation.config';

function renderSidebar(initialEntries: string[] = ['/dashboard'], userOverride?: AuthUser) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialSessionOverride={userOverride} skipBootstrap={!userOverride}>
        <FeatureFlagProvider>
          <NavigationProvider initialItems={defaultNavigationItems}>
            <Routes>
              <Route path="*" element={<Sidebar />} />
            </Routes>
          </NavigationProvider>
        </FeatureFlagProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const FULLY_PERMITTED_USER: AuthUser = {
  id: 'usr_full_perm',
  email: 'staff@kinergy.io',
  name: 'Full Staff Member',
  roles: ['OPERATOR', 'ADMIN'],
  permissions: [
    'client:read',
    'memberships.read',
    'gym.attendance.read',
    'sales.read',
    'inventory.read',
    'assets.read',
    'manage:users',
  ],
  tenantId: 'tenant_main',
};

describe('Track B — Step B4.3: Authenticated Sidebar Integration', () => {
  describe('1. Route Navigation & Active State Resolution', () => {
    it('renders navigation links for Dashboard and Settings', () => {
      renderSidebar(['/dashboard']);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      const settingsLink = screen.getByRole('link', { name: /settings/i });

      expect(dashboardLink).toBeInTheDocument();
      expect(settingsLink).toBeInTheDocument();
    });

    it('renders authoritative links for Gym Operations, Attendance, and User Management when permitted', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      expect(screen.getByRole('link', { name: /gym operations/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /attendance & check-in/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sales & payments/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /user management/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^administration$/i })).not.toBeInTheDocument();
    });

    it('sets aria-current="page" on Dashboard link when active on /dashboard', () => {
      renderSidebar(['/dashboard']);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      const settingsLink = screen.getByRole('link', { name: /settings/i });

      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
      expect(settingsLink).not.toHaveAttribute('aria-current');
    });

    it('sets aria-current="page" on Gym link when active on nested route /gym/memberships', () => {
      renderSidebar(['/gym/memberships'], FULLY_PERMITTED_USER);

      const gymLink = screen.getByRole('link', { name: /gym operations/i });
      expect(gymLink).toHaveAttribute('aria-current', 'page');
    });

    it('sets aria-current="page" on Settings link when active on /settings', () => {
      renderSidebar(['/settings']);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      const settingsLink = screen.getByRole('link', { name: /settings/i });

      expect(settingsLink).toHaveAttribute('aria-current', 'page');
      expect(dashboardLink).not.toHaveAttribute('aria-current');
    });
  });

  describe('2. Desktop Collapse & Keyboard Shortcut (Ctrl+B)', () => {
    it('toggles collapse mode when Collapse Sidebar button is clicked', () => {
      renderSidebar(['/dashboard']);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(collapseBtn).toBeInTheDocument();

      fireEvent.click(collapseBtn);

      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandBtn).toBeInTheDocument();
    });

    it('toggles collapse mode when Ctrl+B shortcut is pressed', () => {
      renderSidebar(['/dashboard']);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(collapseBtn).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandBtn).toBeInTheDocument();
    });
  });

  describe('3. Mobile Drawer & Keyboard Accessibility', () => {
    it('opens mobile drawer when mobile trigger button is clicked', () => {
      renderSidebar(['/dashboard']);

      const openDrawerBtn = screen.getByRole('button', { name: /open navigation drawer/i });
      expect(openDrawerBtn).toBeInTheDocument();

      fireEvent.click(openDrawerBtn);

      const closeDrawerBtn = screen.getByRole('button', { name: /close navigation drawer/i });
      expect(closeDrawerBtn).toBeInTheDocument();
    });

    it('closes mobile drawer when Escape key is pressed', () => {
      renderSidebar(['/dashboard']);

      const openDrawerBtn = screen.getByRole('button', { name: /open navigation drawer/i });
      fireEvent.click(openDrawerBtn);

      expect(screen.getByRole('button', { name: /close navigation drawer/i })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

      expect(
        screen.queryByRole('button', { name: /close navigation drawer/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('4. Accessibility Semantics & Landmarks', () => {
    it('provides accessible navigation landmarks', () => {
      renderSidebar(['/dashboard']);

      expect(screen.getByLabelText(/main navigation/i)).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: /sidebar menu/i })).toBeInTheDocument();
    });
  });
});
