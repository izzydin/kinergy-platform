import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SalesOverviewPage } from '../pages/sales-overview-page';
import { SalesListPage } from '../pages/sales-list-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { PaginatedSalesDTO, SaleSummaryDTO } from '../types/sales.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    calculateSaleTotals: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    getReceiptById: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    applyOrderDiscount: jest.fn(),
    recordPayment: jest.fn(),
  },
}));

const mockStaffUser: AuthUser = {
  id: 'usr_staff_1',
  email: 'reception@kinergy.test',
  name: 'Reception Staff',
  roles: ['Receptionist'],
  permissions: ['sales.read', 'sales.create'],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_readonly_1',
  email: 'readonly@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['sales.read'],
  tenantId: 'tenant_1',
};

const sampleSale1: SaleSummaryDTO = {
  id: 'sale_01j9876543210abcdef00001',
  tenantId: 'tenant_1',
  clientId: 'cli_100',
  currency: 'USD',
  status: 'PENDING_PAYMENT',
  sourceReference: {
    type: 'POINT_OF_SALE',
    referenceId: 'pos_1',
    referenceCode: 'TERM_01',
  },
  subtotal: { amount: 120.0, currency: 'USD', formatted: '$120.00' },
  discountTotal: { amount: 20.0, currency: 'USD', formatted: '$20.00' },
  total: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
  subtotalAmount: 120.0,
  discountTotalAmount: 20.0,
  totalAmount: 100.0,
  itemCount: 3,
  createdAt: '2026-10-15T14:30:00.000Z',
  updatedAt: '2026-10-15T14:35:00.000Z',
};

const sampleSale2: SaleSummaryDTO = {
  id: 'sale_01j9876543210abcdef00002',
  tenantId: 'tenant_1',
  clientId: null,
  currency: 'USD',
  status: 'PAID',
  sourceReference: {
    type: 'INVENTORY_ITEM',
    referenceId: 'inv_item_2',
    referenceCode: 'PROT_BAR',
  },
  subtotal: { amount: 15.0, currency: 'USD', formatted: '$15.00' },
  discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 15.0, currency: 'USD', formatted: '$15.00' },
  subtotalAmount: 15.0,
  discountTotalAmount: 0,
  totalAmount: 15.0,
  itemCount: 1,
  createdAt: '2026-10-16T09:15:00.000Z',
  updatedAt: '2026-10-16T09:20:00.000Z',
};

const sampleSale3: SaleSummaryDTO = {
  id: 'sale_01j9876543210abcdef00003',
  tenantId: 'tenant_1',
  clientId: 'cli_200',
  currency: 'USD',
  status: 'DRAFT',
  subtotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
  discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 0, currency: 'USD', formatted: '$0.00' },
  subtotalAmount: 0,
  discountTotalAmount: 0,
  totalAmount: 0,
  itemCount: 0,
  createdAt: '2026-10-17T11:00:00.000Z',
  updatedAt: '2026-10-17T11:00:00.000Z',
};

const samplePaginatedResponse: PaginatedSalesDTO = {
  items: [sampleSale1, sampleSale2, sampleSale3],
  total: 3,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('Sales Overview and Sales List Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    jest.clearAllMocks();
  });

  describe('Screen 1: Sales Overview Page', () => {
    it('renders overview with loading skeletons when fetching', async () => {
      // Mock long-running list query
      (salesApi.listSales as jest.Mock).mockReturnValue(new Promise(() => {}));

      renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('sales-overview-page')).toBeInTheDocument();
      expect(screen.getByTestId('sales-overview-loading')).toBeInTheDocument();
    });

    it('renders operational KPI counts and recent sales without calculating fake aggregate revenue', async () => {
      (salesApi.listSales as jest.Mock).mockImplementation((params) => {
        if (params?.status === 'PENDING_PAYMENT') {
          return Promise.resolve({ items: [sampleSale1], total: 7, page: 1, limit: 1 });
        }
        if (params?.status === 'DRAFT') {
          return Promise.resolve({ items: [sampleSale3], total: 4, page: 1, limit: 1 });
        }
        if (params?.status === 'PAID') {
          return Promise.resolve({ items: [sampleSale2], total: 25, page: 1, limit: 1 });
        }
        // Recent sales query
        return Promise.resolve(samplePaginatedResponse);
      });

      renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockStaffUser,
      });

      // Operational KPI counts are displayed
      await waitFor(() => {
        expect(screen.getByTestId('kpi-pending-payments')).toHaveTextContent('7');
      });
      expect(screen.getByTestId('kpi-draft-sales')).toHaveTextContent('4');
      expect(screen.getByTestId('kpi-settled-sales')).toHaveTextContent('25');

      // Disclosure note ensuring no fabricated business-wide revenue is displayed
      expect(screen.getByText(/Authoritative Financial Reporting Disclosure/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /business-wide gross revenue, tax reporting, and net cash flow are never aggregated/i,
        ),
      ).toBeInTheDocument();

      // Recent sales items are displayed
      expect(screen.getByTestId(`recent-sale-row-${sampleSale1.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`recent-sale-row-${sampleSale2.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`recent-sale-row-${sampleSale3.id}`)).toBeInTheDocument();

      // Formatted monetary amount
      expect(screen.getByText('$100.00')).toBeInTheDocument();
      expect(screen.getByText('$15.00')).toBeInTheDocument();

      // Links navigate to filtered list views
      const pendingLink = screen.getByRole('link', { name: /view pending orders/i });
      expect(pendingLink).toHaveAttribute('href', '/sales/list?status=PENDING_PAYMENT');

      const draftLink = screen.getByRole('link', { name: /view draft orders/i });
      expect(draftLink).toHaveAttribute('href', '/sales/list?status=DRAFT');

      const paidLink = screen.getByRole('link', { name: /view paid orders/i });
      expect(paidLink).toHaveAttribute('href', '/sales/list?status=PAID');
    });

    it('renders empty state when no sales exist in facility', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sales-overview-empty')).toBeInTheDocument();
      });

      expect(screen.getByText(/No sales recorded yet/i)).toBeInTheDocument();
    });

    it('renders error alert with retry button on query failure', async () => {
      (salesApi.listSales as jest.Mock).mockRejectedValue(new Error('Network connection timeout'));

      renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sales-overview-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Failed to retrieve sales records/i)).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it('respects permission sensitivity for Create Sale button', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      // Render with read-only user lacking sales.create
      const { unmount } = renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockReadOnlyUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sales-overview-page')).toBeInTheDocument();
      });

      // "Create Sale" button should NOT be rendered
      expect(screen.queryByRole('link', { name: /create sale/i })).not.toBeInTheDocument();

      unmount();

      // Render with staff user having sales.create
      const freshQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      renderWithProviders(<SalesOverviewPage />, {
        queryClient: freshQueryClient,
        initialRoute: '/sales',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /create sale/i })).toBeInTheDocument();
      });
    });
  });

  describe('Screen 2: Sales List Page', () => {
    it('renders populated DataTable with server-side columns, formatters, and links', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId(`sale-row-id-${sampleSale1.id}`)).toBeInTheDocument();
      });

      // Verify column headers exist
      expect(screen.getByRole('button', { name: /sort by date & time/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Sale ID/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Client/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Source/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sort by status/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Items/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sort by total/i })).toBeInTheDocument();

      // Verify row items rendered
      expect(screen.getByTestId(`sale-row-id-${sampleSale1.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`sale-row-id-${sampleSale2.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`sale-row-id-${sampleSale3.id}`)).toBeInTheDocument();

      // Formatted totals
      expect(screen.getByText('$100.00')).toBeInTheDocument();
      expect(screen.getByText('$15.00')).toBeInTheDocument();
      expect(screen.getByText('$0.00')).toBeInTheDocument();

      // Row detail link
      const rowDetailLink = screen.getByRole('link', { name: `View sale ${sampleSale1.id}` });
      expect(rowDetailLink).toHaveAttribute('href', `/sales/${sampleSale1.id}`);
    });

    it('hydrates and synchronizes URL parameters for search and filters', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list?q=TERM_01&status=PENDING_PAYMENT',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(salesApi.listSales).toHaveBeenCalledWith(
          expect.objectContaining({
            q: 'TERM_01',
            status: 'PENDING_PAYMENT',
          }),
        );
      });

      // Search input is prefilled from URL
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('TERM_01');

      // Reset button is visible when filtered
      const resetBtn = screen.getByTestId('sales-reset-filters-btn');
      expect(resetBtn).toBeInTheDocument();

      // Clicking reset triggers URL cleanup
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(salesApi.listSales).toHaveBeenCalledWith(
          expect.objectContaining({
            q: undefined,
            status: undefined,
          }),
        );
      });
    });

    it('differentiates filtered empty state vs unfiltered empty state', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      // 1. Unfiltered empty state
      const { unmount } = renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText('No sales orders yet')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Start by creating your first commercial sale agreement/i),
      ).toBeInTheDocument();

      unmount();

      // 2. Filtered empty state
      const freshQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      renderWithProviders(<SalesListPage />, {
        queryClient: freshQueryClient,
        initialRoute: '/sales/list?q=NONEXISTENT_QUERY',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText('No sales found')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/No commercial sales match the specified filter criteria/i),
      ).toBeInTheDocument();
    });

    it('handles query error state with retry button', async () => {
      (salesApi.listSales as jest.Mock).mockRejectedValue(new Error('Gateway 502 Bad Gateway'));

      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText(/Gateway 502 Bad Gateway/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it('adjusts pagination automatically when current page exceeds totalPages', async () => {
      // User deep links to page 5, but totalPages is 2
      (salesApi.listSales as jest.Mock).mockResolvedValue({
        items: [sampleSale1],
        total: 35,
        page: 5,
        limit: 20,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });

      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list?page=5',
        initialSessionOverride: mockStaffUser,
      });

      // The safety effect triggers adjustment to totalPages (page 2)
      await waitFor(() => {
        expect(salesApi.listSales).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
          }),
        );
      });
    });
  });
});
