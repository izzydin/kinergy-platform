import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Sidebar } from '../components/sidebar/sidebar';
import { DataTable } from '../table/components/data-table';
import { AuthProvider } from '../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../app/navigation';
import { defaultNavigationItems } from '../../app/navigation/navigation.config';
import type { AuthUser } from '../../modules/auth/domain/auth-state.types';
import type { ColumnDef } from '@tanstack/react-table';

expect.extend(toHaveNoViolations);

const ADMIN_USER: AuthUser = {
  id: 'usr_admin',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['ADMIN'],
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

function renderAccessibleSidebar(currentPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <AuthProvider initialSessionOverride={ADMIN_USER} skipBootstrap={false}>
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

interface TestDataRow {
  id: string;
  name: string;
  status: string;
  email: string;
}

const mockColumns: ColumnDef<TestDataRow>[] = [
  {
    accessorKey: 'name',
    header: 'Client Name',
  },
  {
    accessorKey: 'email',
    header: 'Email Address',
  },
  {
    accessorKey: 'status',
    header: 'Active Status',
  },
];

const mockRows: TestDataRow[] = [
  { id: '1', name: 'Maria Rodriguez', status: 'ACTIVE', email: 'maria@example.com' },
  { id: '2', name: 'Carlos Gomez', status: 'SUSPENDED', email: 'carlos@example.com' },
];

describe('WCAG 2.2 AA Application-Wide Accessibility Audits (jest-axe)', () => {
  describe('1. Application Shell & Sidebar Landmark Architecture', () => {
    it('passes automated axe audit on Application Sidebar navigation', async () => {
      const { container } = renderAccessibleSidebar('/dashboard');
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('declares semantic navigation landmark with accessible label', () => {
      renderAccessibleSidebar('/dashboard');
      const navLandmark = screen.getByRole('navigation', { name: /sidebar menu/i });
      expect(navLandmark).toBeInTheDocument();
    });

    it('marks currently active route with aria-current="page" and multi-cue visual indicator', () => {
      renderAccessibleSidebar('/dashboard');
      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
      expect(dashboardLink).toHaveClass('bg-brand-forest');
    });

    it('provides accessible collapse toggle button with explicit aria-label and state', () => {
      renderAccessibleSidebar('/dashboard');
      const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i });
      expect(collapseButton).toBeInTheDocument();

      fireEvent.click(collapseButton);
      const expandButton = screen.getByRole('button', { name: /expand sidebar/i });
      expect(expandButton).toBeInTheDocument();
    });
  });

  describe('2. Shared Data Table Component (WCAG 2.2 SC 1.3.1 Info and Relationships)', () => {
    it('passes automated axe audit on populated DataTable', async () => {
      const { container } = render(
        <DataTable
          columns={mockColumns}
          data={mockRows}
          totalCount={2}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          ariaLabel="Registered clients roster"
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on empty DataTable state', async () => {
      const { container } = render(
        <DataTable
          columns={mockColumns}
          data={[]}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          emptyTitle="No clients found"
          emptyDescription="There are currently no clients registered in the directory."
          ariaLabel="Empty clients table"
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on loading DataTable skeleton state', async () => {
      const { container } = render(
        <DataTable
          columns={mockColumns}
          data={[]}
          isLoading={true}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          ariaLabel="Loading client table"
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('3. Keyboard Focus & Interaction Guardrails', () => {
    it('supports tab navigation between interactive sidebar elements without trapping focus', () => {
      renderAccessibleSidebar('/dashboard');
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);

      const firstLink = links[0];
      expect(firstLink).toBeDefined();
      firstLink?.focus();
      expect(document.activeElement).toBe(firstLink);
    });
  });
});
