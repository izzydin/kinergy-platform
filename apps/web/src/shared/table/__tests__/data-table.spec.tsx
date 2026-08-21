import '@testing-library/jest-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable } from '../components/data-table';
import { DataTableColumnHeader } from '../components/data-table-column-header';

interface TestUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

const mockUsers: readonly TestUser[] = [
  { id: 'usr_1', name: 'Alice Smith', email: 'alice@kinergy.io', role: 'ADMIN' },
  { id: 'usr_2', name: 'Bob Jones', email: 'bob@kinergy.io', role: 'OPERATOR' },
  { id: 'usr_3', name: 'Charlie Brown', email: 'charlie@kinergy.io', role: 'MEMBER' },
];

describe('DataTable Component (Track C Step C2.2)', () => {
  const handleEdit = jest.fn();
  const handlePageChange = jest.fn();
  const handlePageSizeChange = jest.fn();
  const handleSortingChange = jest.fn();
  const handleResetFilters = jest.fn();
  const handleRetry = jest.fn();

  const testColumns: ColumnDef<TestUser, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User Name" />,
      cell: ({ row }) => (
        <div>
          <span className="font-semibold">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.email}</span>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => <span>{String(getValue() ?? '')}</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => handleEdit(row.original)}
          aria-label={`Edit ${row.original.name}`}
        >
          Edit
        </button>
      ),
    },
  ];

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders table headers, data rows, and pagination bar correctly', () => {
    render(
      <DataTable
        columns={testColumns}
        data={mockUsers}
        totalCount={30}
        page={1}
        pageSize={10}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        ariaLabel="User Accounts Table"
      />,
    );

    expect(screen.getByRole('table', { name: /user accounts table/i })).toBeInTheDocument();
    expect(screen.getByText('User Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Data rows
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@kinergy.io')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();

    // Pagination metrics
    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing 1 to 10 of 30 results');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('renders custom row actions and triggers callback with row entity', () => {
    render(
      <DataTable
        columns={testColumns}
        data={mockUsers}
        totalCount={3}
        page={1}
        pageSize={10}
        onPageChange={handlePageChange}
      />,
    );

    const editBobBtn = screen.getByRole('button', { name: /edit bob jones/i });
    fireEvent.click(editBobBtn);

    expect(handleEdit).toHaveBeenCalledTimes(1);
    expect(handleEdit).toHaveBeenCalledWith(mockUsers[1]);
  });

  it('handles sorting header click and reflects aria-sort states', () => {
    render(
      <DataTable
        columns={testColumns}
        data={mockUsers}
        sorting={[{ id: 'name', desc: false }]}
        onSortingChange={handleSortingChange}
        totalCount={3}
        page={1}
        pageSize={10}
        onPageChange={handlePageChange}
      />,
    );

    const sortButton = screen.getByRole('button', { name: /sort by user name/i });
    expect(sortButton).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(sortButton);
    expect(handleSortingChange).toHaveBeenCalled();
  });

  it('renders skeleton loading state without displaying table rows', () => {
    render(
      <DataTable columns={testColumns} data={mockUsers} isLoading={true} skeletonRowCount={4} />,
    );

    expect(screen.getByRole('table', { name: /loading table data/i })).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('renders error state with retry trigger', () => {
    render(
      <DataTable
        columns={testColumns}
        data={mockUsers}
        isError={true}
        errorMessage="Network connection timed out."
        onRetry={handleRetry}
      />,
    );

    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    expect(screen.getByText('Network connection timed out.')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty database state when data is empty and not filtered', () => {
    render(<DataTable columns={testColumns} data={[]} isFiltered={false} />);

    expect(screen.getByText('No records available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });

  it('renders filtered empty state with "Reset Filters" action button', () => {
    render(
      <DataTable
        columns={testColumns}
        data={[]}
        isFiltered={true}
        onResetFilters={handleResetFilters}
      />,
    );

    expect(screen.getByText('No matching records found')).toBeInTheDocument();
    const resetBtn = screen.getByRole('button', { name: /reset filters/i });
    fireEvent.click(resetBtn);
    expect(handleResetFilters).toHaveBeenCalledTimes(1);
  });

  it('handles pagination navigation and page size adjustments', () => {
    render(
      <DataTable
        columns={testColumns}
        data={mockUsers}
        totalCount={50}
        page={2}
        pageSize={10}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />,
    );

    // Next page
    const nextBtn = screen.getByRole('button', { name: /go to next page/i });
    fireEvent.click(nextBtn);
    expect(handlePageChange).toHaveBeenCalledWith(3);

    // Previous page
    const prevBtn = screen.getByRole('button', { name: /go to previous page/i });
    fireEvent.click(prevBtn);
    expect(handlePageChange).toHaveBeenCalledWith(1);

    // First page
    const firstBtn = screen.getByRole('button', { name: /go to first page/i });
    fireEvent.click(firstBtn);
    expect(handlePageChange).toHaveBeenCalledWith(1);

    // Last page (50 total / 10 page size = 5)
    const lastBtn = screen.getByRole('button', { name: /go to last page/i });
    fireEvent.click(lastBtn);
    expect(handlePageChange).toHaveBeenCalledWith(5);

    // Page size select
    const pageSizeSelect = screen.getByLabelText(/select number of rows per page/i);
    fireEvent.change(pageSizeSelect, { target: { value: '25' } });
    expect(handlePageSizeChange).toHaveBeenCalledWith(25);
  });
});
