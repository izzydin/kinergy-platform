import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { PaginatedPaymentsDTO } from '../types/payments.types';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listPayments: jest.fn(),
    getReceiptBySale: jest.fn(),
    issueReceipt: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useParams: jest.fn(),
  };
});

import { useParams } from 'react-router-dom';

const mockStaffUser: AuthUser = {
  id: 'usr_staff_1',
  email: 'staff@kinergy.test',
  name: 'Staff Member',
  roles: ['Receptionist'],
  permissions: ['sales.read', 'payments.read', 'receipts.read'],
  tenantId: 'tenant_1',
};

const mockNoAccessUser: AuthUser = {
  id: 'usr_no_access_1',
  email: 'guest@kinergy.test',
  name: 'Guest',
  roles: ['Guest'],
  permissions: [],
  tenantId: 'tenant_1',
};

const mockReceipt: ReceiptDTO = {
  id: 'rec_1001',
  tenantId: 'tenant_1',
  saleId: 'sale_9001',
  receiptNumber: 'REC-2026-00421',
  saleReference: 'ORD-2026-0042',
  issuedAt: '2026-10-15T14:30:00.000Z',
  clientSnapshot: {
    clientId: 'cli_555',
    referenceNumber: 'MEM-00555',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+1 555-0199',
  },
  items: [
    {
      itemId: 'item_1',
      sourceType: 'MEMBERSHIP',
      sourceId: 'mem_tier_gold',
      description: 'Gold Annual Membership',
      skuOrCode: 'SKU-GOLD-YR',
      quantity: 1,
      unitPrice: { amount: 100, currency: 'USD' },
      discountTotal: { amount: 10, currency: 'USD' },
      subtotal: { amount: 100, currency: 'USD' },
      total: { amount: 90, currency: 'USD' },
    },
    {
      itemId: 'item_2',
      sourceType: 'INVENTORY_PRODUCT',
      sourceId: 'prod_shake',
      description: 'Whey Protein Shake',
      skuOrCode: 'SKU-SHK-01',
      quantity: 2,
      unitPrice: { amount: 5, currency: 'USD' },
      discountTotal: { amount: 0, currency: 'USD' },
      subtotal: { amount: 10, currency: 'USD' },
      total: { amount: 10, currency: 'USD' },
    },
  ],
  itemCount: 2,
  subtotal: { amount: 110, currency: 'USD' },
  discountTotal: { amount: 10, currency: 'USD' },
  total: { amount: 100, currency: 'USD' },
  currency: 'USD',
  payments: [
    {
      paymentId: 'pay_901',
      method: 'CARD',
      amount: { amount: 100, currency: 'USD' },
      status: 'COMPLETED',
      reference: 'AUTH_CHRG_9921',
      paidAt: '2026-10-15T14:29:55.000Z',
    },
  ],
  paymentMethod: 'CARD',
  paymentStatus: 'COMPLETED',
  status: 'ISSUED',
  reprintCount: 0,
};

const mockPaymentsResponse: PaginatedPaymentsDTO = {
  items: [
    {
      id: 'pay_001',
      saleId: 'sale_101',
      amount: { amount: 50, currency: 'USD' },
      amountValue: 50,
      method: 'CASH',
      status: 'COMPLETED',
      reference: 'CASH-DRAWER-1',
      paidAt: '2026-10-16T10:00:00.000Z',
      createdAt: '2026-10-16T10:00:00.000Z',
    },
    {
      id: 'pay_002',
      saleId: 'sale_102',
      amount: { amount: 75, currency: 'USD' },
      amountValue: 75,
      method: 'CARD',
      status: 'PENDING',
      reference: 'STRIPE-PI-99',
      paidAt: null,
      createdAt: '2026-10-16T11:00:00.000Z',
    },
    {
      id: 'pay_003',
      saleId: 'sale_103',
      amount: { amount: 30, currency: 'USD' },
      amountValue: 30,
      method: 'BANK_TRANSFER',
      status: 'FAILED',
      reference: null,
      paidAt: null,
      createdAt: '2026-10-16T12:00:00.000Z',
    },
    {
      id: 'pay_004',
      saleId: 'sale_104',
      amount: { amount: 20, currency: 'USD' },
      amountValue: 20,
      method: 'OTHER',
      status: 'CANCELLED',
      reference: null,
      paidAt: null,
      createdAt: '2026-10-16T13:00:00.000Z',
    },
  ],
  total: 4,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('Screen 6: Payment History Specification', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  it('renders payment history list with accurate status badges and accounting notice', async () => {
    (salesApi.listPayments as jest.Mock).mockResolvedValue(mockPaymentsResponse);

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    expect(screen.getByRole('heading', { name: /Payment Tenders History/i })).toBeInTheDocument();
    expect(screen.getByText(/Accounting Notice:/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('pay_001')).toBeInTheDocument();
      expect(screen.getByText('pay_002')).toBeInTheDocument();
      expect(screen.getByText('pay_003')).toBeInTheDocument();
      expect(screen.getByText('pay_004')).toBeInTheDocument();
    });

    // Check status differentiation (COMPLETED, PENDING, FAILED, CANCELLED)
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();

    // Check money values displayed correctly
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('provides navigation links to Payment Detail and related Sale Detail', async () => {
    (salesApi.listPayments as jest.Mock).mockResolvedValue(mockPaymentsResponse);

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    await waitFor(() => {
      expect(screen.getByText('pay_001')).toBeInTheDocument();
    });

    const paymentLink = screen.getByText('pay_001').closest('a');
    expect(paymentLink).toHaveAttribute('href', '/sales/payments/pay_001');

    const saleLink = screen.getByText('sale_101').closest('a');
    expect(saleLink).toHaveAttribute('href', '/sales/sale_101');

    const inspectButtons = screen.getAllByRole('link', { name: /Inspect/i });
    expect(inspectButtons[0]).toHaveAttribute('href', '/sales/payments/pay_001');
  });

  it('handles filtering by status, method, saleId, and date range', async () => {
    (salesApi.listPayments as jest.Mock).mockResolvedValue(mockPaymentsResponse);

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-filter')).toBeInTheDocument();
    });

    // Change status filter
    const statusSelect = screen.getByTestId('payment-status-filter');
    fireEvent.change(statusSelect, { target: { value: 'COMPLETED' } });

    // Change method filter
    const methodSelect = screen.getByTestId('payment-method-filter');
    fireEvent.change(methodSelect, { target: { value: 'CASH' } });

    // Change sale ID filter
    const saleIdInput = screen.getByTestId('payment-sale-id-filter');
    fireEvent.change(saleIdInput, { target: { value: 'sale_101' } });

    // Change from date filter
    const fromDateInput = screen.getByTestId('payment-from-date-filter');
    fireEvent.change(fromDateInput, { target: { value: '2026-10-01' } });

    // Clear filters button should appear
    await waitFor(() => {
      expect(screen.getByTestId('payment-clear-filters')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('payment-clear-filters'));
  });

  it('renders pagination controls and respects page changes', async () => {
    const multiPageResponse: PaginatedPaymentsDTO = {
      ...mockPaymentsResponse,
      page: 1,
      totalPages: 3,
      total: 60,
      hasNextPage: true,
      hasPreviousPage: false,
    };
    (salesApi.listPayments as jest.Mock).mockResolvedValue(multiPageResponse);

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments?page=1',
    });

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3 \(60 tenders total\)/i)).toBeInTheDocument();
    });

    const prevButton = screen.getByTestId('payment-pagination-prev');
    const nextButton = screen.getByTestId('payment-pagination-next');

    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
  });

  it('renders empty unfiltered state and filtered empty state', async () => {
    (salesApi.listPayments as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    // Clean URL: unfiltered
    const { unmount } = renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-history-empty')).toBeInTheDocument();
      expect(screen.getByText('No payment tenders recorded yet.')).toBeInTheDocument();
    });

    unmount();

    const secondQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    // Filtered URL
    renderWithProviders(<PaymentHistoryPage />, {
      queryClient: secondQueryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments?status=COMPLETED',
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-history-filtered-empty')).toBeInTheDocument();
      expect(
        screen.getByText('No payment tenders match the selected criteria.'),
      ).toBeInTheDocument();
    });
  });

  it('renders API error state with retry option on server failure', async () => {
    (salesApi.listPayments as jest.Mock).mockRejectedValue(new Error('Gateway timeout'));

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-history-error')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load payments history/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('renders loading indicator while payment tenders history is being fetched', () => {
    (salesApi.listPayments as jest.Mock).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/payments',
    });

    expect(screen.getByTestId('payment-history-loading')).toBeInTheDocument();
  });

  it('renders 403 ForbiddenView when user lacks payments.read permission', () => {
    renderWithProviders(<PaymentHistoryPage />, {
      queryClient,
      initialSessionOverride: mockNoAccessUser,
      initialRoute: '/sales/payments',
    });

    expect(screen.getByText(/Missing required permission 'payments.read'/i)).toBeInTheDocument();
  });
});

describe('Screen 7: Receipt View Specification', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_9001' });
  });

  it('retrieves and displays the exact snapshot without recalculating values', async () => {
    (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-number')).toHaveTextContent('REC-2026-00421');
    });

    // Verify order reference and status
    expect(screen.getByText(/Order Reference: ORD-2026-0042/i)).toBeInTheDocument();
    expect(screen.getByText('ISSUED')).toBeInTheDocument();

    // Verify customer snapshot
    const clientSnapshot = screen.getByTestId('receipt-client-snapshot');
    expect(clientSnapshot).toHaveTextContent('Jane Doe');
    expect(clientSnapshot).toHaveTextContent('Member #MEM-00555');
    expect(clientSnapshot).toHaveTextContent('jane.doe@example.com');
    expect(clientSnapshot).toHaveTextContent('+1 555-0199');

    // Verify items snapshot rendered faithfully
    expect(screen.getByText('Gold Annual Membership')).toBeInTheDocument();
    expect(screen.getByText('SKU-GOLD-YR')).toBeInTheDocument();
    expect(screen.getByText('Whey Protein Shake')).toBeInTheDocument();
    expect(screen.getByText('SKU-SHK-01')).toBeInTheDocument();

    // Verify totals breakdown
    const totals = screen.getByTestId('receipt-totals-breakdown');
    expect(totals).toHaveTextContent('Subtotal:');
    expect(totals).toHaveTextContent('$110.00');
    expect(totals).toHaveTextContent('Total Discount Applied:');
    expect(totals).toHaveTextContent('-$10.00');
    expect(totals).toHaveTextContent('Total Paid (USD):');
    expect(totals).toHaveTextContent('$100.00');

    // Verify settled payments breakdown
    const payments = screen.getByTestId('receipt-payments-snapshot');
    expect(payments).toHaveTextContent('Ref: AUTH_CHRG_9921');
    expect(payments).toHaveTextContent('$100.00');
  });

  it('renders Walk-in Customer when clientSnapshot is null', async () => {
    const walkinReceipt: ReceiptDTO = {
      ...mockReceipt,
      clientSnapshot: null,
    };
    (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(walkinReceipt);

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    await waitFor(() => {
      expect(screen.getByText('Walk-in Customer')).toBeInTheDocument();
    });
  });

  it('handles 404 not-yet-available receipt state distinct from server errors', async () => {
    const notFoundError = Object.assign(new Error('Receipt not found'), {
      statusCode: 404,
    });
    (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(notFoundError);

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-not-issued')).toBeInTheDocument();
      expect(screen.getByText('Receipt Not Issued Yet')).toBeInTheDocument();
      expect(
        screen.getByText(/No official receipt voucher has been issued for sale/i),
      ).toBeInTheDocument();
    });

    // Check link to return to Sale
    const returnLink = screen.getByRole('link', { name: /Return to Sale/i });
    expect(returnLink).toHaveAttribute('href', '/sales/sale_9001');
  });

  it('handles genuine server failure (500) distinctly with retry button', async () => {
    const serverError = Object.assign(new Error('Internal server error 500'), {
      statusCode: 500,
    });
    (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(serverError);

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-view-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to Load Receipt Voucher')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('triggers browser window.print on print button click', async () => {
    (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-print-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('receipt-print-button'));
    expect(printSpy).toHaveBeenCalledTimes(1);

    printSpy.mockRestore();
  });

  it('renders loading skeleton while receipt voucher is being fetched', () => {
    (salesApi.getReceiptBySale as jest.Mock).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockStaffUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    expect(screen.getByTestId('receipt-view-loading')).toBeInTheDocument();
  });

  it('renders 403 ForbiddenView when user lacks receipts.read permission', () => {
    renderWithProviders(<ReceiptViewPage />, {
      queryClient,
      initialSessionOverride: mockNoAccessUser,
      initialRoute: '/sales/sale_9001/receipt',
    });

    expect(screen.getByText(/Missing required permission 'receipts.read'/i)).toBeInTheDocument();
  });
});
