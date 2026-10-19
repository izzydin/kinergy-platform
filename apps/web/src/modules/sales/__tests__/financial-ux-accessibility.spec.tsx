import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../../../test/test-utils';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import { CancelPaymentDialog } from '../components/cancel-payment-dialog';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { SettlePaymentDialog } from '../components/settle-payment-dialog';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { SaleCreatePage } from '../pages/sale-create-page';
import { salesApi } from '../api';
import type { SaleDTO } from '../types/sales.types';
import type {
  PaymentDetailDTO,
  PaymentSummaryDTO,
  PaginatedPaymentsDTO,
} from '../types/payments.types';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    getSaleById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    listPayments: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    createSale: jest.fn(),
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

const mockManagerUser: AuthUser = {
  id: 'usr_mgr_1',
  email: 'manager@kinergy.test',
  name: 'Store Manager',
  roles: ['Manager'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.read',
  ],
  tenantId: 'tenant_1',
};

const sampleSale: SaleDTO = {
  id: 'sale_acc_100',
  clientId: 'cli_999',
  version: 1,
  status: 'PENDING_PAYMENT',
  currency: 'USD',
  subtotal: { amount: 150.0, formatted: '$150.00', currency: 'USD' },
  subtotalAmount: 150.0,
  discountTotal: { amount: 0, formatted: '$0.00', currency: 'USD' },
  discountTotalAmount: 0,
  total: { amount: 150.0, formatted: '$150.00', currency: 'USD' },
  totalAmount: 150.0,
  itemCount: 1,
  items: [
    {
      id: 'item_1',
      saleId: 'sale_acc_100',
      sourceType: 'INVENTORY_ITEM',
      sourceId: 'inv_1',
      description: 'Optimum Nutrition Gold Standard Whey',
      skuOrCode: 'WHEY-01',
      unitPrice: { amount: 150.0, formatted: '$150.00', currency: 'USD' },
      quantity: 1,
      discountTotal: { amount: 0, formatted: '$0.00', currency: 'USD' },
      subtotal: { amount: 150.0, formatted: '$150.00', currency: 'USD' },
      total: { amount: 150.0, formatted: '$150.00', currency: 'USD' },
    },
  ],
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
};

const samplePaymentSummary: PaymentSummaryDTO = {
  id: 'pay_sum_1',
  saleId: 'sale_acc_100',
  method: 'CASH',
  status: 'COMPLETED',
  amount: { amount: 50.0, formatted: '$50.00', currency: 'USD' },
  amountValue: 50.0,
  reference: 'DRAWER-01',
  paidAt: '2026-10-19T10:05:00Z',
  createdAt: '2026-10-19T10:05:00Z',
};

const samplePendingPayment: PaymentDetailDTO = {
  id: 'pay_pend_200',
  saleId: 'sale_acc_100',
  version: 1,
  method: 'CARD',
  status: 'PENDING',
  amount: { amount: 100.0, formatted: '$100.00', currency: 'USD' },
  amountValue: 100.0,
  reference: 'GATEWAY-TRACE-88',
  paidAt: null,
  createdAt: '2026-10-19T10:10:00Z',
};

const sampleReceipt: ReceiptDTO = {
  id: 'rcpt_777',
  tenantId: 'tenant_1',
  saleId: 'sale_acc_100',
  receiptNumber: 'RCP-2026-00777',
  saleReference: 'ORD-2026-0042',
  status: 'ISSUED',
  issuedAt: '2026-10-19T10:15:00Z',
  currency: 'USD',
  subtotal: { amount: 150.0, currency: 'USD' },
  discountTotal: { amount: 0, currency: 'USD' },
  total: { amount: 150.0, currency: 'USD' },
  itemCount: 1,
  paymentMethod: 'CASH',
  paymentStatus: 'COMPLETED',
  clientSnapshot: null,
  reprintCount: 0,
  items: [
    {
      itemId: 'rcpt_item_1',
      sourceType: 'INVENTORY_PRODUCT',
      sourceId: 'inv_1',
      description: 'Optimum Nutrition Gold Standard Whey',
      skuOrCode: 'WHEY-01',
      quantity: 1,
      unitPrice: { amount: 150.0, currency: 'USD' },
      discountTotal: { amount: 0, currency: 'USD' },
      subtotal: { amount: 150.0, currency: 'USD' },
      total: { amount: 150.0, currency: 'USD' },
    },
  ],
  payments: [
    {
      paymentId: 'pay_sum_1',
      method: 'CASH',
      status: 'COMPLETED',
      reference: 'DRAWER-01',
      amount: { amount: 150.0, currency: 'USD' },
      paidAt: '2026-10-19T10:12:00Z',
    },
  ],
};

const samplePaginatedPayments: PaginatedPaymentsDTO = {
  items: [samplePaymentSummary],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('Financial UX Accessibility and Dialog Safety (Prompt 6)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    (useParams as jest.Mock).mockReturnValue({
      saleId: 'sale_acc_100',
      paymentId: 'pay_pend_200',
    });
  });

  describe('1. Non-Color Reliance for Financial Status Badges', () => {
    it('SaleStatusBadge renders distinct semantic icon and aria-label for each status', () => {
      const statuses = [
        { status: 'DRAFT' as const, label: 'Sale status: Draft', text: 'Draft' },
        {
          status: 'PENDING_PAYMENT' as const,
          label: 'Sale status: Pending Payment',
          text: 'Pending Payment',
        },
        {
          status: 'PARTIALLY_PAID' as const,
          label: 'Sale status: Partially Paid',
          text: 'Partially Paid',
        },
        { status: 'PAID' as const, label: 'Sale status: Paid', text: 'Paid' },
        { status: 'COMPLETED' as const, label: 'Sale status: Completed', text: 'Completed' },
        { status: 'CANCELLED' as const, label: 'Sale status: Cancelled', text: 'Cancelled' },
        { status: 'REFUNDED' as const, label: 'Sale status: Refunded', text: 'Refunded' },
      ];

      for (const { status, label, text } of statuses) {
        const { container, unmount } = renderWithProviders(<SaleStatusBadge status={status} />, {
          queryClient,
          initialSessionOverride: mockManagerUser,
        });
        const badge = screen.getByLabelText(label);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(text);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toBeInTheDocument();
        unmount();
      }
    });

    it('PaymentStatusBadge renders distinct semantic icon and aria-label for each status', () => {
      const statuses = [
        { status: 'PENDING' as const, label: 'Payment status: Pending', text: 'Pending' },
        { status: 'COMPLETED' as const, label: 'Payment status: Completed', text: 'Completed' },
        { status: 'FAILED' as const, label: 'Payment status: Failed', text: 'Failed' },
        { status: 'CANCELLED' as const, label: 'Payment status: Cancelled', text: 'Cancelled' },
      ];

      for (const { status, label, text } of statuses) {
        const { container, unmount } = renderWithProviders(<PaymentStatusBadge status={status} />, {
          queryClient,
          initialSessionOverride: mockManagerUser,
        });
        const badge = screen.getByLabelText(label);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(text);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('2. Dialog Focus Management and Premature Dismissal Safety', () => {
    it('CancelSaleDialog blocks Escape and hides close button while mutation isSubmitting', () => {
      const onOpenChange = jest.fn();
      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_acc_100"
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const dialogContent = screen.getByTestId('cancel-sale-dialog');
      expect(dialogContent).toBeInTheDocument();

      // Top-right close button should be hidden during pending submission
      const closeBtn = screen.queryByRole('button', { name: /close/i });
      expect(closeBtn).not.toBeInTheDocument();

      // Pressing Escape during pending operation must NOT dismiss dialog
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Reason input must be marked aria-required="true" and disabled
      const reasonInput = screen.getByTestId('cancellation-reason-input');
      expect(reasonInput).toHaveAttribute('aria-required', 'true');
      expect(reasonInput).toBeDisabled();
    });

    it('CancelPaymentDialog blocks dismissal while mutation isSubmitting', () => {
      const onOpenChange = jest.fn();
      renderWithProviders(
        <CancelPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          paymentId="pay_pend_200"
          amountFormatted="$100.00"
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const dialogContent = screen.getByTestId('cancel-payment-dialog');
      expect(dialogContent).toBeInTheDocument();

      // Close button hidden
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

      // Escape must NOT dismiss
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Reason input marked aria-required="true"
      const voidInput = screen.getByTestId('void-payment-reason-input');
      expect(voidInput).toHaveAttribute('aria-required', 'true');
      expect(voidInput).toBeDisabled();
    });

    it('RecordPaymentDialog blocks dismissal during submission and has accessible inputs', () => {
      const onOpenChange = jest.fn();
      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_acc_100"
          defaultAmount={100}
          currency="USD"
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const dialogContent = screen.getByTestId('record-payment-dialog');
      expect(dialogContent).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

      // Escape key blocked
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Tender inputs must have aria-required="true"
      const methodSelect = screen.getByLabelText(/Tender Method/i);
      expect(methodSelect).toHaveAttribute('aria-required', 'true');
      expect(methodSelect).toBeDisabled();

      const amountInput = screen.getByLabelText(/Amount \(USD\)/i);
      expect(amountInput).toHaveAttribute('aria-required', 'true');
      expect(amountInput).toBeDisabled();
    });

    it('SettlePaymentDialog blocks dismissal during submission and preserves authoritative breakdown', () => {
      const onOpenChange = jest.fn();
      renderWithProviders(
        <SettlePaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          payment={samplePendingPayment}
          sale={sampleSale}
          salePayments={[samplePaymentSummary]}
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const dialogContent = screen.getByTestId('settle-payment-dialog');
      expect(dialogContent).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

      // Escape key blocked
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Submit button shows pending state
      expect(screen.getByTestId('confirm-settle-payment-btn')).toBeDisabled();
      expect(screen.getByTestId('cancel-settle-dialog-btn')).toBeDisabled();
    });
  });

  describe('3. Table Semantics and Accessible Names', () => {
    it('SaleDetailPage renders accessible tables with aria-labels, scope="col", and descriptive row action names', async () => {
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(sampleSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([samplePaymentSummary]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_acc_100',
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-line-items-table')).toBeInTheDocument();
      });

      // Line items table
      const lineItemsTable = screen.getByRole('table', { name: /Order line items/i });
      expect(lineItemsTable).toBeInTheDocument();
      const lineItemHeaders = lineItemsTable.querySelectorAll('th[scope="col"]');
      expect(lineItemHeaders.length).toBe(7);

      // Payments table
      const paymentsTable = screen.getByRole('table', { name: /Payment tenders recorded/i });
      expect(paymentsTable).toBeInTheDocument();
      const paymentHeaders = paymentsTable.querySelectorAll('th[scope="col"]');
      expect(paymentHeaders.length).toBe(6);

      // Inspect action has accessible name with payment id
      const inspectLink = screen.getByRole('link', {
        name: `Inspect payment tender ${samplePaymentSummary.id}`,
      });
      expect(inspectLink).toBeInTheDocument();
    });

    it('PaymentHistoryPage renders table with aria-label, scope="col", and descriptive inspect link', async () => {
      (salesApi.listPayments as jest.Mock).mockResolvedValue(samplePaginatedPayments);

      renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/payments',
      });

      await waitFor(() => {
        expect(screen.getByText(samplePaymentSummary.id)).toBeInTheDocument();
      });

      const table = screen.getByRole('table', { name: /Payment tenders history/i });
      const ths = table.querySelectorAll('th[scope="col"]');
      expect(ths.length).toBe(7);

      const inspectLink = screen.getByRole('link', {
        name: `Inspect payment tender ${samplePaymentSummary.id}`,
      });
      expect(inspectLink).toBeInTheDocument();
    });

    it('ReceiptViewPage renders purchased items table with aria-label and scope="col"', async () => {
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(sampleReceipt);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_acc_100/receipt',
      });

      await waitFor(() => {
        expect(screen.getByRole('table', { name: /Purchased items/i })).toBeInTheDocument();
      });

      const table = screen.getByRole('table', { name: /Purchased items/i });
      const ths = table.querySelectorAll('th[scope="col"]');
      expect(ths.length).toBe(4);
    });
  });

  describe('4. Form Validation Error Discovery & role="alert" Announcements', () => {
    it('SaleCreatePage marks required fields with aria-required and renders validation errors with role="alert"', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/new',
      });

      // First line item description and unit price have aria-required="true"
      const descInput = screen.getByTestId('item-desc-0');
      expect(descInput).toHaveAttribute('aria-required', 'true');

      const priceInput = screen.getByTestId('item-price-0');
      expect(priceInput).toHaveAttribute('aria-required', 'true');

      // Attempt submit without filling description
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(/Description is required/i);
      });

      expect(descInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('CancelSaleDialog displays validation error with role="alert" when empty reason is submitted', async () => {
      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_acc_100"
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const submitBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(/Cancellation reason must be at least 3 characters/i);
      });
    });

    it('CancelPaymentDialog displays validation error with role="alert" when short reason is submitted', async () => {
      renderWithProviders(
        <CancelPaymentDialog
          open={true}
          onOpenChange={jest.fn()}
          paymentId="pay_pend_200"
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const input = screen.getByTestId('void-payment-reason-input');
      fireEvent.change(input, { target: { value: 'ab' } });

      const submitBtn = screen.getByTestId('confirm-void-payment-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(/Void reason must be at least 3 characters/i);
      });
    });
  });
});
