import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../../../test/test-utils';
import { salesApi } from '../api';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import type { SaleDTO } from '../types/sales.types';
import type { PaymentSummaryDTO } from '../types/payments.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

// Mock sales API
jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    getReceiptBySale: jest.fn(),
    getReceiptById: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
  },
}));

// Mock router navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: jest.fn(),
    useLocation: () => ({ pathname: '/sales/sale_cancel_test', search: '' }),
  };
});

import { useParams } from 'react-router-dom';

const mockManagerUser: AuthUser = {
  id: 'usr_mgr_001',
  email: 'manager@kinergy.test',
  name: 'Sales Manager',
  roles: ['Manager'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.manage',
    'sales.cancel',
    'payments.read',
    'receipts.read',
  ],
  tenantId: 'tenant_main',
};

const mockAuditorUser: AuthUser = {
  id: 'usr_auditor_002',
  email: 'auditor@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['sales.read', 'payments.read'],
  tenantId: 'tenant_main',
};

const mockPendingSale: SaleDTO = {
  id: 'sale_cancel_pending_01',
  tenantId: 'tenant_main',
  clientId: 'client_101',
  currency: 'USD',
  status: 'PENDING_PAYMENT',
  sourceReference: {
    type: 'KINESIOLOGY_SESSION',
    referenceId: 'REF-MANUAL-01',
    referenceCode: 'KINE-101',
  },
  subtotal: { amount: 150.0, currency: 'USD' },
  subtotalAmount: 150.0,
  discountTotal: { amount: 0, currency: 'USD' },
  discountTotalAmount: 0,
  total: { amount: 150.0, currency: 'USD' },
  totalAmount: 150.0,
  itemCount: 2,
  items: [
    {
      id: 'item_1',
      saleId: 'sale_cancel_pending_01',
      description: 'Physiotherapy Consultation (Initial)',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'session_1',
      quantity: 1,
      unitPrice: { amount: 100.0, currency: 'USD' },
      unitPriceAmount: 100.0,
      discountTotal: { amount: 0, currency: 'USD' },
      discountTotalAmount: 0,
      subtotal: { amount: 100.0, currency: 'USD' },
      total: { amount: 100.0, currency: 'USD' },
      totalAmount: 100.0,
    },
    {
      id: 'item_2',
      saleId: 'sale_cancel_pending_01',
      description: 'Electrolyte Hydration Drink',
      sourceType: 'INVENTORY_ITEM',
      sourceId: 'drink_1',
      quantity: 1,
      unitPrice: { amount: 50.0, currency: 'USD' },
      unitPriceAmount: 50.0,
      discountTotal: { amount: 0, currency: 'USD' },
      discountTotalAmount: 0,
      subtotal: { amount: 50.0, currency: 'USD' },
      total: { amount: 50.0, currency: 'USD' },
      totalAmount: 50.0,
    },
  ],
  createdAt: '2026-10-19T09:00:00.000Z',
  updatedAt: '2026-10-19T09:05:00.000Z',
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  refundedAt: null,
  version: 2,
};

const mockPartiallyPaidSale: SaleDTO = {
  ...mockPendingSale,
  id: 'sale_cancel_partial_02',
  status: 'PARTIALLY_PAID',
};

const mockSettledSale: SaleDTO = {
  ...mockPendingSale,
  id: 'sale_settled_03',
  status: 'PAID',
  completedAt: '2026-10-19T09:20:00.000Z',
};

const mockCancelledSale: SaleDTO = {
  ...mockPendingSale,
  id: 'sale_already_cancelled_04',
  status: 'CANCELLED',
  cancelledAt: '2026-10-19T09:15:00.000Z',
  cancellationReason: 'Customer walked out before payment tender',
};

const mockPendingPaymentTender: PaymentSummaryDTO = {
  id: 'pay_qr_pending_99',
  saleId: 'sale_cancel_pending_01',
  method: 'QR',
  amount: { amount: 150.0, currency: 'USD' },
  amountValue: 150.0,
  status: 'PENDING',
  reference: 'QR-EXPIRED-CODE',
  paidAt: null,
  createdAt: '2026-10-19T09:02:00.000Z',
};

const mockHistoricalCompletedPayment: PaymentSummaryDTO = {
  id: 'pay_cash_historical_88',
  saleId: 'sale_cancel_partial_02',
  method: 'CASH',
  amount: { amount: 50.0, currency: 'USD' },
  amountValue: 50.0,
  status: 'COMPLETED',
  reference: 'DRAWER-01',
  paidAt: '2026-10-19T09:03:00.000Z',
  createdAt: '2026-10-19T09:03:00.000Z',
};

describe('Sale Cancellation & History Preservation (Domain Correctness & Auditability)', () => {
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

  describe('1. Permitted Cancellation Workflows (DRAFT, PENDING_PAYMENT, PARTIALLY_PAID)', () => {
    it('cancels an active PENDING_PAYMENT sale with valid audit reason and transitions UI to CANCELLED', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.cancelSale as jest.Mock).mockResolvedValue({
        ...mockPendingSale,
        status: 'CANCELLED',
        cancelledAt: '2026-10-19T09:10:00.000Z',
        cancellationReason: 'Customer walked out before payment tender',
      });

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPendingSale.id);
      });

      // Cancellation action is available
      const cancelBtn = screen.getByTestId('cancel-sale-btn');
      expect(cancelBtn).toBeInTheDocument();

      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-dialog')).toBeInTheDocument();
      });

      // Reason input
      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, {
        target: { value: 'Customer walked out before payment tender' },
      });

      // Confirm cancellation
      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(salesApi.cancelSale).toHaveBeenCalledWith(mockPendingSale.id, {
          reason: 'Customer walked out before payment tender',
        });
      });
    });

    it('cancels a PARTIALLY_PAID sale with audit reason preserving existing financial snapshot', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPartiallyPaidSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPartiallyPaidSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([
        mockHistoricalCompletedPayment,
      ]);
      (salesApi.cancelSale as jest.Mock).mockResolvedValue({
        ...mockPartiallyPaidSale,
        status: 'CANCELLED',
        cancelledAt: '2026-10-19T09:12:00.000Z',
        cancellationReason: 'Client split tender abandoned midway',
      });

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPartiallyPaidSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPartiallyPaidSale.id);
      });

      const cancelBtn = screen.getByTestId('cancel-sale-btn');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-dialog')).toBeInTheDocument();
      });

      // Dialog presents historical payment preservation notice
      expect(screen.getByTestId('cancel-completed-tenders-notice')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-completed-tenders-notice')).toHaveTextContent(
        /will not be automatically refunded/i,
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Client split tender abandoned midway' } });

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(salesApi.cancelSale).toHaveBeenCalledWith(mockPartiallyPaidSale.id, {
          reason: 'Client split tender abandoned midway',
        });
      });
    });
  });

  describe('2. Rejected Cancellation & Invariant Explanations', () => {
    it('hides Cancel button and displays explanation badge for settled (PAID) sales', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSettledSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([
        mockHistoricalCompletedPayment,
      ]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockSettledSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockSettledSale.id);
      });

      // Cancellation control is strictly absent
      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();

      // Explanatory badge is rendered
      expect(screen.getByTestId('cancellation-unavailable-settled')).toBeInTheDocument();
      expect(screen.getByTestId('cancellation-unavailable-settled')).toHaveTextContent(
        /Cancellation unavailable \(fully settled\)/i,
      );
    });

    it('hides Cancel button and displays audit notice for already CANCELLED sales', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockCancelledSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockCancelledSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockCancelledSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockCancelledSale.id);
      });

      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();

      // Displays audit justification banner
      const notice = screen.getByTestId('cancellation-notice');
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveTextContent(/Agreement Cancelled/i);
      expect(notice).toHaveTextContent('Customer walked out before payment tender');
    });

    it('surfaces 422 Invalid Lifecycle Transition in CancelSaleDialog when server rejects settlement race', async () => {
      const invalidTransitionErr = new Error(
        "Sale in status 'PAID' cannot be cancelled. Only DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID sales can be cancelled.",
      );
      (invalidTransitionErr as unknown as { status: number }).status = 422;
      const handleConfirm = jest.fn().mockRejectedValueOnce(invalidTransitionErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_settled_race"
          total={150.0}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Late cancellation request' } });

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Invalid Lifecycle Transition')).toBeInTheDocument();
      expect(
        screen.getByText(/Only DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID sales can be cancelled/i),
      ).toBeInTheDocument();
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('3. Form Validation & Safety Guards', () => {
    it('rejects empty or whitespace cancellation reason at the form boundary', async () => {
      const handleConfirm = jest.fn();
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_val_01"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(handleConfirm).not.toHaveBeenCalled();
    });

    it('blocks Escape key and hides close button while cancellation is submitting', () => {
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_submitting_01"
          isSubmitting={true}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const dialogContent = screen.getByTestId('cancel-sale-dialog');
      expect(dialogContent).toBeInTheDocument();

      // Close button is hidden
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

      // Escape key does not trigger onOpenChange
      fireEvent.keyDown(dialogContent, { key: 'Escape', code: 'Escape' });
      expect(handleOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('4. Consequential Action Notices & Financial History Preservation', () => {
    it('displays notice for active PENDING tenders that will be cascaded into cancellation', () => {
      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_with_pending_tender"
          payments={[mockPendingPaymentTender]}
          total={150.0}
          currency="USD"
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const pendingNotice = screen.getByTestId('cancel-pending-tenders-notice');
      expect(pendingNotice).toBeInTheDocument();
      expect(pendingNotice).toHaveTextContent(/Active Pending Payment Tenders/i);
      expect(pendingNotice).toHaveTextContent(
        /Cascading cancellation will cancel it immediately to prevent orphaned payment records/i,
      );
    });

    it('displays notice that original line items and price snapshots are permanently preserved', () => {
      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_history_preservation"
          total={150.0}
          currency="USD"
          itemCount={2}
          onConfirm={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const historyNotice = screen.getByTestId('cancel-history-preservation-notice');
      expect(historyNotice).toBeInTheDocument();
      expect(historyNotice).toHaveTextContent(/Financial History Preservation/i);
      expect(historyNotice).toHaveTextContent(
        /Original line item snapshots.*discounts, and order total/i,
      );
      expect(historyNotice).toHaveTextContent('USD 150.00');
    });

    it('preserves line items, unit prices, subtotal, and total on SaleDetailPage after cancellation', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockCancelledSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockCancelledSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockCancelledSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockCancelledSale.id);
      });

      // Line items are preserved and displayed
      expect(screen.getByText('Physiotherapy Consultation (Initial)')).toBeInTheDocument();
      expect(screen.getByText('Electrolyte Hydration Drink')).toBeInTheDocument();

      // Authoritative financial totals remain intact
      expect(screen.getByTestId('sale-subtotal')).toBeInTheDocument();
      expect(screen.getByTestId('sale-total')).toBeInTheDocument();
    });
  });

  describe('5. Concurrency Collisions & Ambiguous Network Outcomes', () => {
    it('surfaces 409 Concurrency Conflict when sale is concurrently modified', async () => {
      const conflictErr = new Error(
        'Conflict: Sale was concurrently updated or cancelled by another user.',
      );
      (conflictErr as unknown as { status: number }).status = 409;
      const handleConfirm = jest.fn().mockRejectedValueOnce(conflictErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_conflict_01"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Cancel due to walkout' } });

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Concurrency Conflict')).toBeInTheDocument();
      expect(
        screen.getByText(
          /This sale agreement may have already been modified or cancelled concurrently/i,
        ),
      ).toBeInTheDocument();
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('surfaces Ambiguous Network Outcome when transport times out and warns against immediate resubmission', async () => {
      const networkErr = new Error('Network timeout during cancellation request');
      (networkErr as unknown as { status: number }).status = 0;
      const handleConfirm = jest.fn().mockRejectedValueOnce(networkErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <CancelSaleDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_timeout_01"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockManagerUser },
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Cancel due to walkout' } });

      const confirmBtn = screen.getByTestId('confirm-cancel-sale-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Ambiguous Network Outcome')).toBeInTheDocument();
      expect(
        screen.getByText(/Because the server may have already committed the cancellation/i),
      ).toBeInTheDocument();
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('6. Authorization Boundaries & Receipt Ineligibility', () => {
    it('hides Cancel button when user lacks sales.cancel permission', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockAuditorUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPendingSale.id);
      });

      // User has sales.read but lacks sales.cancel
      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();
    });

    it('strictly forbids receipt voucher access for cancelled sales', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockCancelledSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockCancelledSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockCancelledSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockCancelledSale.id);
      });

      // Receipt action is strictly absent
      expect(screen.queryByTestId('view-receipt-btn')).not.toBeInTheDocument();

      // Ineligible indicator is displayed
      expect(screen.getByTestId('receipt-ineligible-cancelled')).toBeInTheDocument();
      expect(screen.getByTestId('receipt-ineligible-cancelled')).toHaveTextContent(
        /Receipt ineligible \(cancelled\)/i,
      );
    });
  });
});
