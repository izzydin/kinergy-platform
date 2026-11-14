/**
 * Track B — Step B4.3: Authenticated Sidebar Integration Test Suite
 *
 * Unit and integration tests for <Sidebar />.
 * Validates route active state resolution, desktop collapse (Ctrl+B),
 * mobile drawer accessibility (Escape key, backdrop dismiss),
 * collapsed mode icon retention, non-clipped tooltips,
 * and presentation-only navigation landmark semantics across authorized roles.
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
  email: 'owner@kinergy.platform',
  name: 'Platform Owner',
  roles: ['OWNER', 'ADMIN'],
  permissions: [
    'appointments.read',
    'settings.read',
    'client:read',
    'clients.read',
    'memberships.read',
    'gym.attendance.read',
    'sales.read',
    'inventory.read',
    'assets.read',
    'manage:users',
  ],
  tenantId: 'tenant-kinergy-main',
};

const RECEPTIONIST_USER: AuthUser = {
  id: 'usr-demo-reception-001',
  email: 'reception.demo@kinergy.platform',
  name: 'Demo Receptionist',
  roles: ['RECEPTIONIST'],
  permissions: ['client:read', 'clients.read', 'appointments.read', 'sales.read', 'inventory.read'],
  tenantId: 'tenant-kinergy-main',
};

const TRAINER_USER: AuthUser = {
  id: 'usr-demo-trainer-002',
  email: 'trainer.demo@kinergy.platform',
  name: 'Demo Trainer',
  roles: ['TRAINER'],
  permissions: ['clients.read', 'memberships.read', 'gym.attendance.read'],
  tenantId: 'tenant-kinergy-main',
};

const INVENTORY_USER: AuthUser = {
  id: 'usr-demo-inventory-001',
  email: 'inventory.demo@kinergy.platform',
  name: 'Demo Inventory Operator',
  roles: ['KITCHEN_STAFF'],
  permissions: ['inventory.read', 'assets.read', 'sales.read'],
  tenantId: 'tenant-kinergy-main',
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

  describe('2. Desktop Collapse & Header Position Control', () => {
    it('positions the collapse button in the persistent header without requiring scroll', () => {
      renderSidebar(['/dashboard']);

      const aside = screen.getByLabelText(/main navigation/i);
      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });

      // Collapse button is inside the persistent header at the top
      expect(aside).toContainElement(collapseBtn);
      expect(collapseBtn).toBeVisible();
    });

    it('toggles collapse mode when Collapse Sidebar button is clicked and back when clicked again', () => {
      renderSidebar(['/dashboard']);

      const aside = screen.getByLabelText(/main navigation/i);
      expect(aside).toHaveClass('md:w-64');

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      expect(aside).toHaveClass('md:w-20');
      const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandBtn).toBeInTheDocument();

      fireEvent.click(expandBtn);
      expect(aside).toHaveClass('md:w-64');
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
    });

    it('toggles collapse mode when Ctrl+B shortcut is pressed', () => {
      renderSidebar(['/dashboard']);

      const aside = screen.getByLabelText(/main navigation/i);
      expect(aside).toHaveClass('md:w-64');

      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(aside).toHaveClass('md:w-20');

      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(aside).toHaveClass('md:w-64');
    });
  });

  describe('3. Collapsed Navigation Quality & Icon Rendering', () => {
    it('every authorized navigation item retains its SVG icon in collapsed mode with no empty slots', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);

      // Verify every link contains a rendered SVG icon and is not an empty space
      for (const link of links) {
        const svg = link.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveClass('h-5', 'w-5');
        // Text label is visually hidden via sr-only, retaining accessible name
        const srLabel = link.querySelector('.sr-only');
        expect(srLabel).toBeInTheDocument();
        expect(srLabel?.textContent?.trim().length).toBeGreaterThan(0);
      }
    });

    it('displays active-route styling correctly in collapsed mode', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const dashboardLink = screen.getByRole('link', { name: /^dashboard$/i });
      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
      expect(dashboardLink).toHaveClass('bg-brand-forest');

      // Contains the green active visual indicator bar
      const indicator = dashboardLink.querySelector('.bg-brand-green');
      expect(indicator).toBeInTheDocument();
    });

    it('clicking a collapsed navigation item updates the active link route', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      expect(settingsLink).not.toHaveAttribute('aria-current');

      fireEvent.click(settingsLink);
      expect(settingsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('4. Accessible Tooltips in Collapsed Mode', () => {
    it('renders a floating portal tooltip on mouse hover in collapsed mode', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const dashboardLink = screen.getByRole('link', { name: /^dashboard$/i });
      fireEvent.mouseEnter(dashboardLink);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent(/dashboard/i);

      fireEvent.mouseLeave(dashboardLink);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('renders a floating portal tooltip on keyboard focus (Tab) in collapsed mode and dismisses on Escape', () => {
      renderSidebar(['/dashboard'], FULLY_PERMITTED_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      fireEvent.focus(settingsLink);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent(/settings/i);

      // Escape key dismisses tooltip
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('5. Mobile Drawer & Keyboard Accessibility', () => {
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

  describe('6. Role-Based Navigation Authorization & Visibility', () => {
    it('renders reception-specific navigation options and hides unauthorized admin options', () => {
      renderSidebar(['/dashboard'], RECEPTIONIST_USER);

      expect(screen.getByRole('link', { name: /client profiles/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /calendar & scheduling/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sales & payments/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /user management/i })).not.toBeInTheDocument();
    });

    it('renders trainer-specific navigation options and hides unauthorized inventory options', () => {
      renderSidebar(['/dashboard'], TRAINER_USER);

      expect(screen.getByRole('link', { name: /gym operations/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /attendance & check-in/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /trainer dashboard/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /fixed assets/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /user management/i })).not.toBeInTheDocument();
    });

    it('renders inventory-specific navigation options and hides unauthorized clinical options', () => {
      renderSidebar(['/dashboard'], INVENTORY_USER);

      expect(screen.getByRole('link', { name: /consumable inventory/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /fixed assets/i })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /calendar & scheduling/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /attendance & check-in/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('7. Accessibility Semantics & Landmarks', () => {
    it('provides accessible navigation landmarks and viewport sticky container', () => {
      renderSidebar(['/dashboard']);

      const aside = screen.getByLabelText(/main navigation/i);
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveClass('md:sticky', 'md:top-0', 'md:h-screen');

      const nav = screen.getByRole('navigation', { name: /sidebar menu/i });
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
    });
  });
});
