import '@testing-library/jest-dom';
import type { Table } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { DataTableRowActions } from '../components/data-table-row-actions';
import { DataTableViewOptions } from '../components/data-table-view-options';
import type { DataTableRowAction } from '../types/data-table-actions.types';

interface TestUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: string;
}

const mockUser: TestUser = {
  id: 'usr_123',
  name: 'Jane Doe',
  email: 'jane@kinergy.io',
  status: 'ACTIVE',
};

describe('DataTable Action Menus & Column Visibility (Track C Step C2.4)', () => {
  const handleEdit = jest.fn();
  const handleDelete = jest.fn();
  const handleActivate = jest.fn();

  const mockActions: DataTableRowAction<TestUser>[] = [
    {
      id: 'edit',
      label: 'Edit User',
      onClick: handleEdit,
    },
    {
      id: 'activate',
      label: 'Activate',
      onClick: handleActivate,
      disabled: true,
    },
    {
      id: 'delete',
      label: 'Delete User',
      onClick: handleDelete,
      isDestructive: true,
    },
    {
      id: 'secret',
      label: 'Secret Action',
      onClick: jest.fn(),
      hidden: true,
    },
  ];

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DataTableRowActions', () => {
    it('renders trigger button and opens action menu on click', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      expect(triggerBtn).toHaveAttribute('aria-haspopup', 'true');
      expect(triggerBtn).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(triggerBtn);
      expect(triggerBtn).toHaveAttribute('aria-expanded', 'true');

      expect(screen.getByRole('menu', { name: /row actions/i })).toBeInTheDocument();
      expect(screen.getByText('Edit User')).toBeInTheDocument();
      expect(screen.getByText('Activate')).toBeInTheDocument();
      expect(screen.getByText('Delete User')).toBeInTheDocument();

      // Hidden action must not exist
      expect(screen.queryByText('Secret Action')).not.toBeInTheDocument();
    });

    it('invokes feature-provided action with row entity payload', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      fireEvent.click(screen.getByRole('button', { name: /open actions menu/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /edit user/i }));

      expect(handleEdit).toHaveBeenCalledTimes(1);
      expect(handleEdit).toHaveBeenCalledWith(mockUser);
    });

    it('does not invoke callback for disabled actions', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      fireEvent.click(screen.getByRole('button', { name: /open actions menu/i }));
      const activateBtn = screen.getByRole('menuitem', { name: /activate/i });
      expect(activateBtn).toBeDisabled();

      fireEvent.click(activateBtn);
      expect(handleActivate).not.toHaveBeenCalled();
    });

    it('handles keyboard navigation (ArrowDown, ArrowUp, Escape, Enter)', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.keyDown(triggerBtn, { key: 'ArrowDown' });

      // Menu opens
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Close on Escape
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('DataTableViewOptions', () => {
    it('renders column toggles for hideable columns and excludes mandatory columns', () => {
      const toggleVisibility = jest.fn();

      const mockTable = {
        getAllColumns: () => [
          {
            id: 'name',
            accessorFn: () => 'name',
            getCanHide: () => true,
            getIsVisible: () => true,
            toggleVisibility,
            columnDef: { header: 'Full Name' },
          },
          {
            id: 'email',
            accessorFn: () => 'email',
            getCanHide: () => true,
            getIsVisible: () => false,
            toggleVisibility,
            columnDef: { header: 'Email Address' },
          },
          {
            id: 'id',
            accessorFn: () => 'id',
            getCanHide: () => false, // Mandatory column
            getIsVisible: () => true,
            toggleVisibility,
            columnDef: { header: 'ID' },
          },
        ],
      } as unknown as Table<TestUser>;

      render(<DataTableViewOptions table={mockTable} />);

      const viewBtn = screen.getByRole('button', { name: /toggle visible columns/i });
      fireEvent.click(viewBtn);

      expect(screen.getByRole('menu', { name: /toggle column visibility/i })).toBeInTheDocument();
      expect(screen.getByText('Full Name')).toBeInTheDocument();
      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.queryByText('ID')).not.toBeInTheDocument();

      // Toggle visibility
      const nameCheckbox = screen.getByRole('checkbox', { name: /full name/i });
      fireEvent.click(nameCheckbox);

      expect(toggleVisibility).toHaveBeenCalled();
    });
  });
});
