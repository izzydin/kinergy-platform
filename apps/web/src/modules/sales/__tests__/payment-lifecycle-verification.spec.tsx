import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { PaymentDetailPage } from '../pages/payment-detail-page';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { SettlePaymentDialog } from '../components/settle-payment-dialog';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { PaymentDetailDTO, PaymentSummaryDTO } from '../types/payments.types';
import type { SaleDTO } from '../types/sales.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    getSaleById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    getReceiptBySale: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: jest.fn(),
  };
});

import { useParams } from 'react-router-dom';

const mockOwnerUser: AuthUser = {
  id: 'usr_owner_001',
  email: 'owner@kinergy.test',
  name: 'Platform Owner',
  roles: ['Owner', 'Manager'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.manage',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.read',
  ],
  tenantId: 'tenant_main',
};

const mockPayableSale: SaleDTO = {
  id: 'sale_payable_100',
  tenantId: 'tenant_main',
  clientId: 'client_pt_88',
  currency: 'USD',
  status: 'PENDING_PAYMENT',
  sourceReference: {
    type: 'KINESIOLOGY_SESSION',
    referenceId: 'session_kine_501',
    referenceCode: 'KINE-501',
  },
  subtotal: { amount: 100, currency: 'USD' },
  subtotalAmount: 100,
  discountTotal: { amount: 0, currency: 'USD' },
  discountTotalAmount: 0,
  total: { amount: 100, currency: 'USD' },
  totalAmount: 100,
  itemCount: 1,
  items: [
    {
      id: 'item_001',
      saleId: 'sale_payable_100',
      description: 'Clinical Therapy Session',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'session_kine_501',
      unitPrice: { amount: 100, currency: 'USD' },
      unitPriceAmount: 100,
      discountTotal: { amount: 0, currency: 'USD' },
      discountTotalAmount: 0,
      subtotal: { amount: 100, currency: 'USD' },
      total: { amount: 100, currency: 'USD' },
      totalAmount: 100,
      quantity: 1,
    },
  ],
  version: 2,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:05:00.000Z',
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  refundedAt: null,
};

const mockCashPaymentCompleted: PaymentDetailDTO = {
  id: 'pay_cash_settled_001',
  saleId: 'sale_payable_100',
  method: 'CASH',
  amount: { amount: 100, currency: 'USD' },
  amountValue: 100,
  status: 'COMPLETED',
  reference: 'DRAWER-01',
  paidAt: '2026-10-19T10:10:00.000Z',
  createdAt: '2026-10-19T10:10:00.000Z',
  version: 1,
};

const mockQrPaymentPending: PaymentDetailDTO = {
  id: 'pay_qr_pending_002',
  saleId: 'sale_payable_100',
  method: 'QR',
  amount: { amount: 100, currency: 'USD' },
  amountValue: 100,
  status: 'PENDING',
  reference: 'QR-COUNTER-REF',
  paidAt: null,
  createdAt: '2026-10-19T10:12:00.000Z',
  version: 1,
};

describe('Payment Lifecycle & Cash/QR Workflows Verification (Phase 7.24)', () => {
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

  describe('1. Cash Payment Workflow (Immediate Settlement)', () => {
    it('records a CASH payment with drawer reference and invokes callback upon authoritative success', async () => {
      const handleConfirm = jest.fn().mockResolvedValue(undefined);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={100}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      expect(screen.getByTestId('record-payment-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('tender-lifecycle-notice')).toBeInTheDocument();

      // Tender method is CASH by default
      const methodSelect = screen.getByLabelText(/Tender Method/i);
      expect(methodSelect).toHaveValue('CASH');

      // Amount is populated
      const amountInput = screen.getByLabelText(/Amount/i);
      expect(amountInput).toHaveValue(100);

      // Add drawer tag reference
      const refInput = screen.getByLabelText(/Drawer Tag \/ Trace Reference/i);
      fireEvent.change(refInput, { target: { value: 'DRAWER-01' } });

      // Submit tender
      const submitBtn = screen.getByTestId('confirm-record-payment-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleConfirm).toHaveBeenCalledWith({
          method: 'CASH',
          amount: 100,
          reference: 'DRAWER-01',
        });
      });
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('calculates cash change due in exact integer cents and supports exact amount helper', async () => {
      const handleConfirm = jest.fn().mockResolvedValue(undefined);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={45.5}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      const cashTenderedInput = screen.getByTestId('cash-tendered-input');
      expect(cashTenderedInput).toBeInTheDocument();

      // Enter customer tendered $50.00 for $45.50 payment
      fireEvent.change(cashTenderedInput, { target: { value: '50.00' } });

      const changeDisplay = screen.getByTestId('cash-change-due');
      expect(changeDisplay).toHaveTextContent('Change Due:');
      expect(changeDisplay).toHaveTextContent('USD 4.50');

      // Test short tender (customer tendered $40.00)
      fireEvent.change(cashTenderedInput, { target: { value: '40.00' } });
      expect(screen.getByTestId('cash-change-due')).toHaveTextContent(
        'Short Tender (Remaining Due):',
      );
      expect(screen.getByTestId('cash-change-due')).toHaveTextContent('USD 5.50');

      // Click exact amount button
      const exactBtn = screen.getByTestId('cash-tender-exact-btn');
      fireEvent.click(exactBtn);
      expect(cashTenderedInput).toHaveValue(45.5);
      expect(screen.getByTestId('cash-change-due')).toHaveTextContent('Change Due:');
      expect(screen.getByTestId('cash-change-due')).toHaveTextContent('USD 0.00');
    });

    it('displays settled COMPLETED state with paidAt and hides settle/cancel buttons', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_cash_settled_001' });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockCashPaymentCompleted);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue({
        ...mockPayableSale,
        status: 'PAID',
      });
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockCashPaymentCompleted]);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: '/sales/payments/pay_cash_settled_001',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent('pay_cash_settled_001');
      });

      // Status badge is Completed
      expect(screen.getByTestId('payment-status-banner-completed')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();

      // Paid at timestamp is populated
      expect(screen.getByTestId('payment-paid-at')).not.toHaveTextContent('Unsettled / Pending');

      // Immutable state: settlement and cancellation controls are strictly absent
      expect(screen.queryByTestId('settle-payment-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();

      // View receipt action is offered
      expect(screen.getByTestId('payment-view-receipt-btn')).toBeInTheDocument();
    });
  });

  describe('2. QR Payment Workflow (Pending Initiation & Explicit Settlement)', () => {
    it('records a QR payment tender in PENDING status', async () => {
      const handleConfirm = jest.fn().mockResolvedValue(undefined);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={100}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      // Change tender method to QR
      const methodSelect = screen.getByLabelText(/Tender Method/i);
      fireEvent.change(methodSelect, { target: { value: 'QR' } });

      // QR tender notice is presented
      expect(screen.getByTestId('qr-tender-notice')).toBeInTheDocument();
      expect(screen.getByTestId('qr-tender-notice')).toHaveTextContent(/PENDING/i);

      const refInput = screen.getByLabelText(/Drawer Tag \/ Trace Reference/i);
      fireEvent.change(refInput, { target: { value: 'QR-COUNTER-REF' } });

      const submitBtn = screen.getByTestId('confirm-record-payment-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleConfirm).toHaveBeenCalledWith({
          method: 'QR',
          amount: 100,
          reference: 'QR-COUNTER-REF',
        });
      });
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('displays PENDING QR payment with settle button and executes authoritative settlement', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_qr_pending_002' });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockQrPaymentPending);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockQrPaymentPending]);
      (salesApi.settlePayment as jest.Mock).mockResolvedValue({
        ...mockQrPaymentPending,
        status: 'COMPLETED',
        paidAt: '2026-10-19T10:15:00.000Z',
      });

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: '/sales/payments/pay_qr_pending_002',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent('pay_qr_pending_002');
      });

      // In PENDING state, timestamp shows unsettled and settle button is present
      expect(screen.getByTestId('payment-status-banner-pending')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByTestId('payment-paid-at')).toHaveTextContent('Unsettled / Pending');

      const settleBtn = screen.getByTestId('settle-payment-btn');
      expect(settleBtn).toBeInTheDocument();

      // Open settlement confirmation dialog
      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settle-payment-dialog')).toBeInTheDocument();
      });

      // Confirm settlement
      const confirmBtn = screen.getByTestId('confirm-settle-payment-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(salesApi.settlePayment).toHaveBeenCalledWith('pay_qr_pending_002', {
          reference: 'QR-COUNTER-REF',
        });
      });
    });
  });

  describe('3. Financial Validation & State Machine Invariant Rejections', () => {
    it('rejects invalid payment amounts (zero or negative) at the form boundary', async () => {
      const handleConfirm = jest.fn();
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={100}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      const amountInput = screen.getByLabelText(/Amount/i);
      fireEvent.change(amountInput, { target: { value: '0' } });

      const form = screen.getByTestId('record-payment-dialog').querySelector('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Payment amount must be greater than 0.00')).toBeInTheDocument();
      });

      expect(handleConfirm).not.toHaveBeenCalled();
    });

    it('surfaces backend overpayment rejection (422) without optimistic state modification', async () => {
      const overpaymentErr = new Error(
        'Payment amount exceeds remaining unpaid balance of $100.00 USD.',
      );
      (overpaymentErr as unknown as { status: number }).status = 422;
      const handleConfirm = jest.fn().mockRejectedValueOnce(overpaymentErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={120}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      const submitBtn = screen.getByTestId('confirm-record-payment-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('record-payment-error')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Payment amount exceeds remaining unpaid balance/i),
      ).toBeInTheDocument();
      // Dialog remains open so user can correct the input
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('surfaces 409 conflict error when sale is concurrently settled or updated', async () => {
      const conflictErr = new Error('Conflict: Sale already updated or settled concurrently.');
      (conflictErr as unknown as { status: number }).status = 409;
      const handleConfirm = jest.fn().mockRejectedValueOnce(conflictErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          saleId="sale_payable_100"
          defaultAmount={100}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      const submitBtn = screen.getByTestId('confirm-record-payment-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('record-payment-error')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Conflict: Sale already updated or settled concurrently/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/A concurrency conflict occurred/i)).toBeInTheDocument();
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('surfaces invalid transition rejection (422) when attempting to settle an ineligible tender', async () => {
      const invalidTransitionErr = new Error(
        'Invalid payment transition: Cannot transition from COMPLETED to COMPLETED.',
      );
      (invalidTransitionErr as unknown as { status: number }).status = 422;
      const handleConfirm = jest.fn().mockRejectedValueOnce(invalidTransitionErr);
      const handleOpenChange = jest.fn();

      renderWithProviders(
        <SettlePaymentDialog
          open={true}
          onOpenChange={handleOpenChange}
          payment={mockQrPaymentPending}
          sale={mockPayableSale}
          salePayments={[mockQrPaymentPending]}
          onConfirm={handleConfirm}
        />,
        { queryClient, initialSessionOverride: mockOwnerUser },
      );

      const confirmBtn = screen.getByTestId('confirm-settle-payment-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settle-submission-error')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Cannot transition from COMPLETED to COMPLETED/i),
      ).toBeInTheDocument();
      expect(handleOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('4. Payment History Auditability & Filter Verification', () => {
    it('retrieves and displays chronological payment tenders with accurate status badges and links', async () => {
      const mockPaymentsList: PaymentSummaryDTO[] = [
        {
          id: 'pay_cash_settled_001',
          saleId: 'sale_payable_100',
          method: 'CASH',
          amount: { amount: 100, currency: 'USD' },
          amountValue: 100,
          status: 'COMPLETED',
          reference: 'DRAWER-01',
          paidAt: '2026-10-19T10:10:00.000Z',
          createdAt: '2026-10-19T10:10:00.000Z',
        },
        {
          id: 'pay_qr_pending_002',
          saleId: 'sale_payable_100',
          method: 'QR',
          amount: { amount: 100, currency: 'USD' },
          amountValue: 100,
          status: 'PENDING',
          reference: 'QR-COUNTER-REF',
          paidAt: null,
          createdAt: '2026-10-19T10:12:00.000Z',
        },
      ];

      (salesApi.listPayments as jest.Mock).mockResolvedValue({
        items: mockPaymentsList,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialRoute: '/sales/payments',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByText('pay_cash_settled_001')).toBeInTheDocument();
      });

      // Renders both payments
      expect(screen.getByText('pay_qr_pending_002')).toBeInTheDocument();

      // Displays correct method and status badges
      expect(screen.getByText('Cash')).toBeInTheDocument();
      expect(screen.getByText('QR')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });
});
