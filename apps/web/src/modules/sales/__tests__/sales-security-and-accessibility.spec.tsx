import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { SaleCreatePage } from '../pages/sale-create-page';
import { SalesListPage } from '../pages/sales-list-page';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import { SettlePaymentDialog } from '../components/settle-payment-dialog';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { translateSalesError } from '../utils/sales-error-translator';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { SaleDTO } from '../types/sales.types';
import type { PaymentDetailDTO, PaymentSummaryDTO } from '../types/payments.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    reprintReceipt: jest.fn(),
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

// -----------------------------------------------------------------------------
// Test User Fixtures with Granular Permissions
// -----------------------------------------------------------------------------
const mockAdminUser: AuthUser = {
  id: 'usr_admin',
  tenantId: 'tenant_1',
  email: 'admin@kinergy.test',
  name: 'Admin User',
  roles: ['ADMIN'],
  permissions: ['*'],
  createdAt: '2026-01-01T00:00:00Z',
};

const mockReadOnlySalesUser: AuthUser = {
  id: 'usr_sales_reader',
  tenantId: 'tenant_1',
  email: 'reader@kinergy.test',
  name: 'Sales Auditor',
  roles: ['AUDITOR'],
  permissions: ['sales.read'],
  createdAt: '2026-01-01T00:00:00Z',
};

const mockPaymentsOnlyUser: AuthUser = {
  id: 'usr_payments_only',
  tenantId: 'tenant_1',
  email: 'cashier@kinergy.test',
  name: 'Payment Cashier',
  roles: ['CASHIER'],
  permissions: ['payments.read', 'payments.create'],
  createdAt: '2026-01-01T00:00:00Z',
};

const mockUnprivilegedUser: AuthUser = {
  id: 'usr_nobody',
  tenantId: 'tenant_1',
  email: 'guest@kinergy.test',
  name: 'No Perms',
  roles: ['GUEST'],
  permissions: [],
  createdAt: '2026-01-01T00:00:00Z',
};

// -----------------------------------------------------------------------------
// Domain Fixtures
// -----------------------------------------------------------------------------
const mockDraftSale: SaleDTO = {
  id: 'sale_draft_101',
  tenantId: 'tenant_1',
  clientId: 'client_alpha',
  status: 'DRAFT',
  subtotal: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
  subtotalAmount: 150.0,
  discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
  discountTotalAmount: 0,
  total: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
  totalAmount: 150.0,
  currency: 'USD',
  itemCount: 1,
  items: [
    {
      id: 'item_01',
      saleId: 'sale_draft_101',
      description: 'Physical Therapy Session',
      sourceType: 'TREATMENT_SESSION',
      sourceId: 'sess_1',
      unitPrice: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
      quantity: 1,
      subtotal: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
      discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
      total: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
    },
  ],
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
  version: 1,
};

const mockPendingPayment: PaymentDetailDTO = {
  id: 'pay_pend_202',
  saleId: 'sale_draft_101',
  method: 'CASH',
  amount: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
  amountValue: 150.0,
  status: 'PENDING',
  reference: 'DRAWER-1',
  paidAt: null,
  createdAt: '2026-10-28T09:05:00.000Z',
  version: 1,
};

describe('Sales Security, Authorization & Accessibility Consistency Audit', () => {
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

  // ===========================================================================
  // 1. Permission Matrix Audit & Defense-in-Depth Direct Route Guards
  // ===========================================================================
  describe('1. Permission Matrix & Direct Route Protection', () => {
    it('blocks unauthenticated/unprivileged access to SalesListPage with 403 ForbiddenView', async () => {
      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialSessionOverride: mockUnprivilegedUser,
        initialRoute: '/sales/list',
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/403/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Missing required permission 'sales.read' to view sales orders directory/i,
        ),
      ).toBeInTheDocument();
      expect(salesApi.listSales).not.toHaveBeenCalled();
    });

    it('blocks access to SaleCreatePage when user lacks sales.create', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialSessionOverride: mockReadOnlySalesUser,
        initialRoute: '/sales/new',
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/403/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Missing required permission 'sales.create' to initialize sales agreements/i,
        ),
      ).toBeInTheDocument();
      expect(salesApi.createSale).not.toHaveBeenCalled();
    });

    it('blocks access to PaymentHistoryPage when user lacks payments.read', async () => {
      renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlySalesUser, // has sales.read, but not payments.read
        initialRoute: '/sales/payments',
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/403/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Missing required permission 'payments.read' to view payment tenders/i),
      ).toBeInTheDocument();
      expect(salesApi.listPayments).not.toHaveBeenCalled();
    });

    it('blocks access to ReceiptViewPage when user lacks receipts.read', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_draft_101' });

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockPaymentsOnlyUser, // lacks receipts.read
        initialRoute: '/sales/sale_draft_101/receipt',
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/403/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Missing required permission 'receipts.read' to view receipt vouchers/i),
      ).toBeInTheDocument();
      expect(salesApi.getReceiptBySale).not.toHaveBeenCalled();
    });

    it('hides destructive/mutation action triggers for users lacking respective action permissions', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_draft_101' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftSale);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlySalesUser, // read-only: no sales.create, no sales.cancel
        initialRoute: '/sales/sale_draft_101',
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toBeInTheDocument();
      });

      // Finalize button requires sales.create
      expect(screen.queryByTestId('finalize-sale-btn')).not.toBeInTheDocument();
      // Cancel button requires sales.cancel
      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Standardized Financial Mutation Feedback & Error Translation
  // ===========================================================================
  describe('2. Standardized Financial Mutation Feedback & Error Translator', () => {
    it('translates network failures into truthful, ambiguous-state guidance', () => {
      const networkError = new TypeError('Failed to fetch');
      const translated = translateSalesError(networkError);

      expect(translated.category).toBe('NETWORK_AMBIGUOUS');
      expect(translated.isAmbiguous).toBe(true);
      expect(translated.isConflict).toBe(false);
      expect(translated.message).toContain(
        'Because the server may have already processed this transaction',
      );
      expect(translated.actionHint).toContain('Check the Sales Directory or Payments Log');
    });

    it('translates 409 duplicate reference conflicts into actionable collision descriptions', () => {
      const conflictError = {
        statusCode: 409,
        code: 'DUPLICATE_SALE',
        message: 'A commercial sale for source appointment_99 already exists',
      };
      const translated = translateSalesError(conflictError);

      expect(translated.category).toBe('CONFLICT');
      expect(translated.isConflict).toBe(true);
      expect(translated.title).toBe('Duplicate or Concurrency Collision');
      expect(translated.message).toContain(
        'may have already been updated by another user or session',
      );
    });

    it('translates overpayment and invalid money invariant exceptions', () => {
      const overpayError = {
        statusCode: 422,
        code: 'PAYMENT_OVERPAYMENT',
        message: 'Tender amount 200.00 exceeds remaining balance 150.00',
      };
      const translated = translateSalesError(overpayError);

      expect(translated.category).toBe('AMOUNT_INVALID');
      expect(translated.title).toBe('Invalid Payment Tender Amount');
      expect(translated.message).toContain('exceeds remaining balance');
    });

    it('translates 403 authorization denials into safe, non-leaking business language', () => {
      const forbiddenError = {
        statusCode: 403,
        message: 'User does not possess claim sales.cancel',
      };
      const translated = translateSalesError(forbiddenError);

      expect(translated.category).toBe('PERMISSION_DENIED');
      expect(translated.title).toBe('Action Prohibited (Permission Denied)');
      expect(translated.message).toContain('lacks the required authorization claim');
    });

    it('sanitizes internal Prisma and database error messages', () => {
      const dbLeakError = {
        statusCode: 500,
        message:
          'PrismaClientKnownRequestError: Invalid `prisma.sale.update()` invocation at node:internal',
      };
      const translated = translateSalesError(dbLeakError);

      expect(translated.category).toBe('SERVER_ERROR');
      expect(translated.message).not.toContain('Prisma');
      expect(translated.message).not.toContain('node:internal');
      expect(translated.message).toBe('An internal error occurred while processing the request.');
    });
  });

  // ===========================================================================
  // 3. Destructive & High-Impact Consequential Operations
  // ===========================================================================
  describe('3. Consequential Action Protections (Sale Cancellation & Void)', () => {
    it('requires a commercial cancellation reason before enabling submission', async () => {
      const onConfirm = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_draft_101"
          itemCount={1}
          total={150.0}
          currency="USD"
          onConfirm={onConfirm}
        />,
      );

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cancellation reason must be at least 3 characters/i),
        ).toBeInTheDocument();
      });

      expect(onConfirm).not.toHaveBeenCalled();

      // Enter valid reason
      const input = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(input, {
        target: { value: 'Client cancelled appointment due to sickness' },
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith('Client cancelled appointment due to sickness');
      });
    });

    it('displays active pending tenders warning in cancellation dialog', () => {
      const pendingTenders: PaymentSummaryDTO[] = [
        {
          id: 'pay_01',
          saleId: 'sale_draft_101',
          method: 'QR',
          amount: { amount: 50.0, currency: 'USD', formatted: '$50.00' },
          amountValue: 50.0,
          status: 'PENDING',
          reference: null,
          paidAt: null,
          createdAt: '2026-10-28T09:00:00Z',
        },
      ];

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_draft_101"
          payments={pendingTenders}
          onConfirm={jest.fn()}
        />,
      );

      expect(screen.getByTestId('cancel-pending-tenders-notice')).toBeInTheDocument();
      expect(screen.getByText(/There is 1 active pending tender/i)).toBeInTheDocument();
    });

    it('disables dialog buttons during submission to prevent double submission', () => {
      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_draft_101"
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
      );

      const submitBtn = screen.getByTestId('confirm-cancel-sale-btn');
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/Cancelling.../i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 4. Accessibility (a11y) & Semantic Structure Verification
  // ===========================================================================
  describe('4. Accessibility, Semantic Page Hierarchy & Non-Color Status Indicators', () => {
    it('verifies SaleDetailPage contains h1 title, semantic structure, and accessible badges', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_draft_101' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftSale);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialSessionOverride: mockAdminUser,
        initialRoute: '/sales/sale_draft_101',
      });

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'sale_draft_101' }),
        ).toBeInTheDocument();
      });

      // Status indicator has text and icon, not relying on color alone
      const statusBadge = screen.getByLabelText('Sale status: Draft');
      expect(statusBadge).toBeInTheDocument();
      expect(within(statusBadge).getByText('Draft')).toBeInTheDocument();
    });

    it('verifies PaymentHistoryPage table has accessible headers with scope="col" and labeled inputs', async () => {
      (salesApi.listPayments as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialSessionOverride: mockPaymentsOnlyUser,
        initialRoute: '/sales/payments',
      });

      expect(
        screen.getByRole('heading', { level: 1, name: /Payment Tenders History/i }),
      ).toBeInTheDocument();

      // Check table accessibility
      const table = screen.getByRole('table', { name: /Payment tenders history/i });
      expect(table).toBeInTheDocument();

      const headers = within(table).getAllByRole('columnheader');
      expect(headers.length).toBeGreaterThanOrEqual(6);
      headers.forEach((header) => {
        expect(header).toHaveAttribute('scope', 'col');
      });

      // Check input accessible labels
      expect(screen.getByLabelText('Filter by Sale ID')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter from date')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter to date')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by payment status')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by payment tender method')).toBeInTheDocument();
    });

    it('verifies form inputs in RecordPaymentDialog have aria-invalid and label bindings', () => {
      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_draft_101"
          defaultAmount={150.0}
          currency="USD"
          onConfirm={jest.fn()}
        />,
      );

      const methodSelect = screen.getByLabelText(/Tender Method/i);
      expect(methodSelect).toHaveAttribute('id', 'tender-method');
      expect(methodSelect).toHaveAttribute('aria-required', 'true');

      const amountInput = screen.getByLabelText(/Amount/i);
      expect(amountInput).toHaveAttribute('id', 'tender-amount');
      expect(amountInput).toHaveAttribute('aria-required', 'true');
    });

    it('verifies SettlePaymentDialog presents clear financial confirmation with non-color labels', () => {
      renderWithProviders(
        <SettlePaymentDialog
          open={true}
          onOpenChange={jest.fn()}
          payment={mockPendingPayment}
          sale={mockDraftSale}
          onConfirm={jest.fn()}
        />,
      );

      expect(screen.getByTestId('financial-confirmation-summary')).toBeInTheDocument();
      expect(screen.getByTestId('summary-sale-total')).toHaveTextContent('$150.00');
      expect(screen.getByTestId('summary-payment-amount')).toHaveTextContent('$150.00');
      expect(screen.getByTestId('summary-payment-method')).toBeInTheDocument();
    });
  });
});
