import '@testing-library/jest-dom';
import { screen, fireEvent, render } from '@testing-library/react';
import { ClientStatusBadge } from '../components/client-status-badge';
import { ClientTableToolbar } from '../components/client-table-toolbar';
import { renderWithProviders } from '../../../test/test-utils';
import type { AuthUser } from '../../auth/domain/auth-state.types';

const mockStaffUser: AuthUser = {
  id: 'usr_staff_1',
  email: 'reception@kinergy.test',
  name: 'Reception Staff',
  roles: ['Receptionist'],
  permissions: ['client:write'],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_readonly_1',
  email: 'readonly@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['client:read'],
  tenantId: 'tenant_1',
};

describe('Client Management Component Primitives', () => {
  describe('ClientStatusBadge', () => {
    it('renders Active badge with accessible aria-label and green variant style', () => {
      render(<ClientStatusBadge status="ACTIVE" />);
      const badge = screen.getByLabelText('Client status: Active');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Active');
    });

    it('renders Archived badge with accessible aria-label and muted style', () => {
      render(<ClientStatusBadge status="ARCHIVED" />);
      const badge = screen.getByLabelText('Client status: Archived');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Archived');
    });
  });

  describe('ClientTableToolbar', () => {
    it('renders search input, status faceted filter, and refresh button', () => {
      const handleSearch = jest.fn();
      const handleStatus = jest.fn();
      const handleReset = jest.fn();
      const handleRefresh = jest.fn();

      renderWithProviders(
        <ClientTableToolbar
          search="Jane"
          status="ACTIVE"
          isFiltered={true}
          onSearchChange={handleSearch}
          onStatusChange={handleStatus}
          onResetFilters={handleReset}
          onRefresh={handleRefresh}
          isRefreshing={false}
        />,
        { initialSessionOverride: mockStaffUser },
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('Jane');

      const statusFilterBtn = screen.getByRole('button', { name: /filter by status/i });
      expect(statusFilterBtn).toBeInTheDocument();

      const refreshBtn = screen.getByRole('button', { name: /refresh client list/i });
      fireEvent.click(refreshBtn);
      expect(handleRefresh).toHaveBeenCalledTimes(1);

      const resetBtn = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });

    it('shows Create Client button only when permission client:write is present', () => {
      const { unmount } = renderWithProviders(
        <ClientTableToolbar
          search=""
          isFiltered={false}
          onSearchChange={jest.fn()}
          onStatusChange={jest.fn()}
          onResetFilters={jest.fn()}
        />,
        { initialSessionOverride: mockReadOnlyUser },
      );

      expect(screen.queryByTestId('create-client-button')).not.toBeInTheDocument();
      unmount();

      renderWithProviders(
        <ClientTableToolbar
          search=""
          isFiltered={false}
          onSearchChange={jest.fn()}
          onStatusChange={jest.fn()}
          onResetFilters={jest.fn()}
        />,
        { initialSessionOverride: mockStaffUser },
      );

      expect(screen.getByTestId('create-client-button')).toBeInTheDocument();
    });
  });
});
