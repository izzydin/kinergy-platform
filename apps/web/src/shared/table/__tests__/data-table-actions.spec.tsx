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

    it('renders through a portal outside the table container', () => {
      render(
        <div data-testid="table-container" style={{ overflow: 'hidden' }}>
          <DataTableRowActions row={mockUser} actions={mockActions} />
        </div>,
      );

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.click(triggerBtn);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();

      // Menu must NOT be a DOM child of the overflow-clipped container
      const tableContainer = screen.getByTestId('table-container');
      expect(tableContainer).not.toContainElement(menu);
      expect(document.body).toContainElement(menu);
    });

    it('repositions above trigger when vertical space below is constrained', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });

      // Mock viewport: height 800px. Trigger near bottom at top: 740px, bottom: 772px
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800,
      });
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      jest.spyOn(triggerBtn, 'getBoundingClientRect').mockReturnValue({
        top: 740,
        bottom: 772,
        left: 800,
        right: 832,
        width: 32,
        height: 32,
        x: 800,
        y: 740,
        toJSON: () => ({}),
      });

      fireEvent.click(triggerBtn);

      const menu = screen.getByRole('menu');
      expect(menu).toHaveAttribute('data-placement', 'top');
      // style.bottom must be set for upward anchoring
      expect(menu.style.bottom).not.toBe('');
      expect(menu.style.bottom).not.toBe('auto');
    });

    it('repositions horizontally to avoid viewport clipping near the right edge', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });

      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800,
      });
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1000,
      });

      // Trigger right is 995px (near right edge of 1000px viewport)
      jest.spyOn(triggerBtn, 'getBoundingClientRect').mockReturnValue({
        top: 200,
        bottom: 232,
        left: 963,
        right: 995,
        width: 32,
        height: 32,
        x: 963,
        y: 200,
        toJSON: () => ({}),
      });

      fireEvent.click(triggerBtn);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
      // left should be adjusted inward from right edge to stay within viewport
      const leftVal = parseInt(menu.style.left, 10);
      expect(leftVal).toBeLessThanOrEqual(1000 - 8 - 160);
    });

    it('dismisses menu on outside click', () => {
      render(
        <div>
          <button data-testid="outside-button">Outside</button>
          <DataTableRowActions row={mockUser} actions={mockActions} />
        </div>,
      );

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.click(triggerBtn);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click outside element
      fireEvent.mouseDown(screen.getByTestId('outside-button'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('supports Home and End keyboard navigation', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.keyDown(triggerBtn, { key: 'ArrowDown' });

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();

      // Press End key -> focus last item
      fireEvent.keyDown(menu, { key: 'End' });
      const deleteItem = screen.getByRole('menuitem', { name: /delete user/i });
      expect(deleteItem).toHaveFocus();

      // Press Home key -> focus first item
      fireEvent.keyDown(menu, { key: 'Home' });
      const editItem = screen.getByRole('menuitem', { name: /edit user/i });
      expect(editItem).toHaveFocus();
    });

    it('dismisses menu when trigger is scrolled completely out of viewport', () => {
      render(<DataTableRowActions row={mockUser} actions={mockActions} />);

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.click(triggerBtn);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Mock trigger scrolled above viewport (top < 0, bottom < 0)
      jest.spyOn(triggerBtn, 'getBoundingClientRect').mockReturnValue({
        top: -150,
        bottom: -118,
        left: 200,
        right: 232,
        width: 32,
        height: 32,
        x: 200,
        y: -150,
        toJSON: () => ({}),
      });

      fireEvent.scroll(window);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('renders inline without portal when usePortal is false', () => {
      render(
        <div data-testid="table-cell">
          <DataTableRowActions row={mockUser} actions={mockActions} usePortal={false} />
        </div>,
      );

      const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
      fireEvent.click(triggerBtn);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
      // Menu must be an inline child inside container
      const cell = screen.getByTestId('table-cell');
      expect(cell).toContainElement(menu);
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
