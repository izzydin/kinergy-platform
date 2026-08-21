import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import { SlotProvider } from '../../ui/slots/SlotProvider';
import { SlotTarget } from '../../ui/slots/SlotTarget';
import { CrudListHeader } from '../components/crud-list-header';
import { CrudListLayout } from '../components/crud-list-layout';
import { DataTable } from '../../table/components/data-table';
import { DataTableToolbar } from '../../table/components/data-table-toolbar';
import { DataTableSearch } from '../../table/components/data-table-search';
import { DataTableColumnHeader } from '../../table/components/data-table-column-header';
import { DataTableRowActions } from '../../table/components/data-table-row-actions';
import { useTableUrlState } from '../../table/hooks/use-table-url-state';
import type { DataTableRowAction } from '../../table/types/data-table-actions.types';

interface TestItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
}

const MOCK_ITEMS: readonly TestItem[] = [
  { id: '1', name: 'Item Alpha', category: 'Category A', status: 'ACTIVE' },
  { id: '2', name: 'Item Beta', category: 'Category B', status: 'ARCHIVED' },
  { id: '3', name: 'Item Gamma', category: 'Category A', status: 'ACTIVE' },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

interface TestFilters {
  readonly status?: string;
}

function RepresentativeCrudListView({
  queryFn = () => Promise.resolve({ items: MOCK_ITEMS, total: 3 }),
  onCreateClick = jest.fn(),
  onEditClick = jest.fn(),
  onArchiveClick = jest.fn(),
}: {
  queryFn?: () => Promise<{ items: readonly TestItem[]; total: number }>;
  onCreateClick?: () => void;
  onEditClick?: (item: TestItem) => void;
  onArchiveClick?: (item: TestItem) => void;
}) {
  const { state: tableState, actions: tableActions } = useTableUrlState<TestFilters>({
    filterParsers: {
      status: (val) => val ?? undefined,
    },
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['test-items', tableState],
    queryFn,
  });

  const rowActions: DataTableRowAction<TestItem>[] = [
    {
      id: 'edit',
      label: 'Edit Item',
      onClick: onEditClick,
    },
    {
      id: 'archive',
      label: 'Archive Item',
      isDestructive: true,
      onClick: onArchiveClick,
    },
  ];

  const columns: ColumnDef<TestItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    },
    {
      accessorKey: 'category',
      header: 'Category',
    },
    {
      accessorKey: 'status',
      header: 'Status',
    },
    {
      id: 'actions',
      cell: ({ row }) => <DataTableRowActions row={row.original} actions={rowActions} />,
    },
  ];

  return (
    <CrudListLayout
      header={
        <CrudListHeader
          title="Inventory Items"
          description="Manage catalog items and inventory lifecycle."
          action={
            <Button onClick={onCreateClick} aria-label="Create new inventory item">
              + Create Item
            </Button>
          }
        />
      }
      toolbar={
        <DataTableToolbar
          search={
            <DataTableSearch
              value={tableState.q}
              onChange={tableActions.setQ}
              placeholder="Search items..."
            />
          }
          onResetFilters={tableActions.resetFilters}
          isFiltered={Boolean(tableState.q || tableState.filters.status)}
        />
      }
    >
      <DataTable<TestItem>
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onRetry={refetch}
        emptyTitle={tableState.q ? 'No items matching search' : 'No inventory items'}
        emptyDescription={
          tableState.q
            ? 'Try adjusting your search criteria.'
            : 'Get started by creating your first inventory item.'
        }
        emptyAction={
          tableState.q ? (
            <Button onClick={() => tableActions.resetFilters()}>Reset Filters</Button>
          ) : (
            <Button onClick={onCreateClick}>+ Create Item</Button>
          )
        }

        page={tableState.page}
        pageSize={tableState.limit}
        totalCount={data?.total}
        onPageChange={tableActions.setPage}
        onPageSizeChange={tableActions.setLimit}
      />
    </CrudListLayout>
  );
}

function renderCrudList(
  ui: React.ReactNode,
  initialEntries = ['/items'],
  queryClient = createTestQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SlotProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/items" element={ui} />
          </Routes>
        </MemoryRouter>
      </SlotProvider>
    </QueryClientProvider>,
  );
}

describe('Track C Step C3.2: Standard CRUD List Experience', () => {
  describe('1. Header & Slot Injection Composition', () => {
    it('renders page header title, description, and primary action', () => {
      const handleCreate = jest.fn();
      render(
        <CrudListHeader
          title="Client Registrations"
          description="Manage client records and profiles."
          action={<button onClick={handleCreate}>+ New Client</button>}
        />,
      );

      expect(screen.getByRole('heading', { name: 'Client Registrations' })).toBeInTheDocument();
      expect(screen.getByText('Manage client records and profiles.')).toBeInTheDocument();

      const btn = screen.getByRole('button', { name: '+ New Client' });
      fireEvent.click(btn);
      expect(handleCreate).toHaveBeenCalledTimes(1);
    });

    it('injects primary action into shell slot target when slotTarget is specified', () => {
      render(
        <SlotProvider>
          <header data-testid="shell-header">
            <SlotTarget name="header-actions" />
          </header>
          <CrudListHeader
            title="Telemetric Hub"
            action={<button>Export CSV</button>}
            slotTarget="header-actions"
          />
        </SlotProvider>,
      );

      const shellHeader = screen.getByTestId('shell-header');
      expect(shellHeader).toHaveTextContent('Export CSV');
    });
  });

  describe('2. Representative CRUD List 4-State Lifecycle', () => {
    it('renders populated list view with table headers, items, and row actions', async () => {
      const handleEdit = jest.fn();
      renderCrudList(<RepresentativeCrudListView onEditClick={handleEdit} />);

      await waitFor(() => {
        expect(screen.getByText('Item Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Item Beta')).toBeInTheDocument();
      expect(screen.getByText('Item Gamma')).toBeInTheDocument();

      // Row action trigger
      const actionTriggers = screen.getAllByRole('button', { name: /open actions menu/i });
      fireEvent.click(actionTriggers[0]!);

      const editMenuItem = screen.getByRole('menuitem', { name: 'Edit Item' });
      fireEvent.click(editMenuItem);
      expect(handleEdit).toHaveBeenCalledWith(MOCK_ITEMS[0]);
    });

    it('renders loading skeleton state during initial query fetch', async () => {
      renderCrudList(
        <RepresentativeCrudListView
          queryFn={() => new Promise(() => {})} // Never resolves
        />,
      );

      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByText('Item Alpha')).not.toBeInTheDocument();
    });

    it('renders system empty state with create action when 0 records exist', async () => {
      const handleCreate = jest.fn();
      renderCrudList(
        <RepresentativeCrudListView
          queryFn={() => Promise.resolve({ items: [], total: 0 })}
          onCreateClick={handleCreate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('No inventory items')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Get started by creating your first inventory item.'),
      ).toBeInTheDocument();
    });

    it('renders filtered empty state when search matches 0 records and allows filter reset', async () => {
      renderCrudList(
        <RepresentativeCrudListView queryFn={() => Promise.resolve({ items: [], total: 0 })} />,
        ['/items?q=NonExistentItem'],
      );

      await waitFor(() => {
        expect(screen.getByText('No items matching search')).toBeInTheDocument();
      });

      const resetBtn = screen.getByRole('button', { name: 'Reset Filters' });
      expect(resetBtn).toBeInTheDocument();
    });

    it('renders error state when query fails and allows retry', async () => {
      const failingQuery = jest
        .fn()
        .mockRejectedValueOnce(new Error('Gateway timeout'))
        .mockResolvedValueOnce({ items: MOCK_ITEMS, total: 3 });

      renderCrudList(<RepresentativeCrudListView queryFn={failingQuery} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Item Alpha')).toBeInTheDocument();
      });
    });
  });
});
