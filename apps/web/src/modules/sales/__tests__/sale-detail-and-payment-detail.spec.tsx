import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { PaymentDetailPage } from '../pages/payment-detail-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { SaleDTO } from '../types/sales.types';
import type { PaymentDetailDTO } from '../types/payments.types';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    getSaleById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
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

const mockNoAccessUser: AuthUser = {
  id: 'usr_guest_1',
  email: 'guest@kinergy.test',
  name: 'Guest',
  roles: ['Guest'],
  permissions: [],
  tenantId: 'tenant_1',
};

const mockCashierUser: AuthUser = {
  id: 'usr_cashier_1',
  email: 'cashier@kinergy.test',
  name: 'Front Desk Cashier',
  roles: ['Receptionist'],
  permissions: ['sales.read', 'sales.create', 'payments.read', 'payments.create'],
  tenantId: 'tenant_1',
};

// Fixture: Settled Sale with Source Reference and Order Discount
const mockSettledSale: SaleDTO = {
  id: 'sale_01jsettled1234567890abcdef',
  tenantId: 'tenant_1',
  clientId: 'client_alpha_99',
  currency: 'USD',
  status: 'COMPLETED',
  sourceReference: {
    type: 'MEMBERSHIP_PLAN',
    referenceId: 'plan_vip_gold',
    referenceCode: 'VIP-GOLD-2026',
  },
  subtotal: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  discountTotal: { amount: 20.0, currency: 'USD', formatted: '$20.00' },
  total: { amount: 180.0, currency: 'USD', formatted: '$180.00' },
  subtotalAmount: 200.0,
  discountTotalAmount: 20.0,
  totalAmount: 180.0,
  orderDiscount: {
    type: 'PERCENTAGE',
    value: 10,
    reason: 'VIP_MEMBER_DISCOUNT',
  },
  itemCount: 2,
  items: [
    {
      id: 'item_1',
      saleId: 'sale_01jsettled1234567890abcdef',
      description: 'Annual VIP Gym Pass',
      skuOrCode: 'PASS-VIP-01',
      sourceType: 'MEMBERSHIP_PLAN',
      sourceId: 'plan_vip_gold',
      unitPrice: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
      unitPriceAmount: 150.0,
      quantity: 1,
      discountTotal: { amount: 15.0, currency: 'USD', formatted: '$15.00' },
      discountTotalAmount: 15.0,
      subtotal: { amount: 150.0, currency: 'USD', formatted: '$150.00' },
      total: { amount: 135.0, currency: 'USD', formatted: '$135.00' },
      totalAmount: 135.0,
    },
    {
      id: 'item_2',
      saleId: 'sale_01jsettled1234567890abcdef',
      description: 'Locker Rental 12M',
      skuOrCode: 'LOCK-01',
      sourceType: 'CUSTOM_SERVICE',
      sourceId: 'srv_lock',
      unitPrice: { amount: 50.0, currency: 'USD', formatted: '$50.00' },
      unitPriceAmount: 50.0,
      quantity: 1,
      discountTotal: { amount: 5.0, currency: 'USD', formatted: '$5.00' },
      discountTotalAmount: 5.0,
      subtotal: { amount: 50.0, currency: 'USD', formatted: '$50.00' },
      total: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
      totalAmount: 45.0,
    },
  ],
  version: 3,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:15:00.000Z',
  completedAt: '2026-09-20T10:15:00.000Z',
};

// Fixture: Draft Sale for Anonymous Walk-in Customer
const mockDraftWalkInSale: SaleDTO = {
  id: 'sale_01jdraft1234567890walkin',
  tenantId: 'tenant_1',
  clientId: undefined,
  currency: 'USD',
  status: 'DRAFT',
  sourceReference: null,
  subtotal: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
  discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
  subtotalAmount: 45.0,
  discountTotalAmount: 0.0,
  totalAmount: 45.0,
  itemCount: 1,
  items: [
    {
      id: 'item_w1',
      saleId: 'sale_01jdraft1234567890walkin',
      description: 'Electrolyte Energy Drink',
      skuOrCode: 'DRINK-01',
      sourceType: 'INVENTORY_ITEM',
      sourceId: 'inv_item_88',
      unitPrice: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
      unitPriceAmount: 45.0,
      quantity: 1,
      discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
      discountTotalAmount: 0.0,
      subtotal: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
      total: { amount: 45.0, currency: 'USD', formatted: '$45.00' },
      totalAmount: 45.0,
    },
  ],
  version: 1,
  createdAt: '2026-09-21T08:00:00.000Z',
  updatedAt: '2026-09-21T08:00:00.000Z',
};

// Fixture: Pending Payment Sale
const mockPendingSale: SaleDTO = {
  id: 'sale_01jpending1234567890pay',
  tenantId: 'tenant_1',
  clientId: 'client_beta_12',
  currency: 'USD',
  status: 'PENDING_PAYMENT',
  sourceReference: null,
  subtotal: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
  discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
  subtotalAmount: 100.0,
  discountTotalAmount: 0.0,
  totalAmount: 100.0,
  itemCount: 1,
  items: [
    {
      id: 'item_p1',
      saleId: 'sale_01jpending1234567890pay',
      description: 'Personal Training Session',
      sourceType: 'TREATMENT_SESSION',
      sourceId: 'sess_pt_1',
      unitPrice: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
      unitPriceAmount: 100.0,
      quantity: 1,
      discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
      discountTotalAmount: 0.0,
      subtotal: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
      total: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
      totalAmount: 100.0,
    },
  ],
  version: 2,
  createdAt: '2026-09-21T09:00:00.000Z',
  updatedAt: '2026-09-21T09:05:00.000Z',
};

// Fixture: Completed Payment Record
const mockCompletedPayment: PaymentDetailDTO = {
  id: 'pay_01jcompleted1234567890abc',
  saleId: 'sale_01jsettled1234567890abcdef',
  method: 'CARD',
  amount: { amount: 180.0, currency: 'USD', formatted: '$180.00' },
  amountValue: 180.0,
  status: 'COMPLETED',
  reference: 'TXN-VISA-987654',
  paidAt: '2026-09-20T10:15:00.000Z',
  createdAt: '2026-09-20T10:14:30.000Z',
  version: 2,
};

// Fixture: Pending Payment Record
const mockPendingPayment: PaymentDetailDTO = {
  id: 'pay_01jpending1234567890xyz',
  saleId: 'sale_01jpending1234567890pay',
  method: 'QR',
  amount: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
  amountValue: 100.0,
  status: 'PENDING',
  reference: 'QR-COUNTER-01',
  paidAt: null,
  createdAt: '2026-09-21T09:05:00.000Z',
  version: 1,
};

// Fixture: Cancelled Payment Record
const mockCancelledPayment: PaymentDetailDTO = {
  id: 'pay_01jcancelled1234567890void',
  saleId: 'sale_01jpending1234567890pay',
  method: 'CASH',
  amount: { amount: 50.0, currency: 'USD', formatted: '$50.00' },
  amountValue: 50.0,
  status: 'CANCELLED',
  reference: 'VOID-TENDER-01',
  paidAt: null,
  createdAt: '2026-09-21T09:06:00.000Z',
  version: 2,
};

// Fixture: Failed Payment Record
const mockFailedPayment: PaymentDetailDTO = {
  id: 'pay_01jfailed1234567890err',
  saleId: 'sale_01jpending1234567890pay',
  method: 'CARD',
  amount: { amount: 100.0, currency: 'USD', formatted: '$100.00' },
  amountValue: 100.0,
  status: 'FAILED',
  reference: 'DECLINED-INSUFFICIENT-FUNDS',
  paidAt: null,
  createdAt: '2026-09-21T09:07:00.000Z',
  version: 1,
};

// Fixture: Receipt Record
const mockReceipt: ReceiptDTO = {
  id: 'rec_01jreceipt1234567890',
  tenantId: 'tenant_1',
  saleId: 'sale_01jsettled1234567890abcdef',
  receiptNumber: 'RCP-2026-00042',
  saleReference: 'sale_01jsettled1234567890abcdef',
  issuedAt: '2026-09-20T10:15:05.000Z',
  clientSnapshot: null,
  subtotal: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  discountTotal: { amount: 20.0, currency: 'USD', formatted: '$20.00' },
  total: { amount: 180.0, currency: 'USD', formatted: '$180.00' },
  currency: 'USD',
  itemCount: 2,
  items: [],
  payments: [],
  paymentMethod: 'CARD',
  paymentStatus: 'COMPLETED',
};

describe('Screen 4 & Screen 5: Sale Detail & Payment Detail Contracts', () => {
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

  describe('Screen 4: Sale Detail Page', () => {
    it('renders authoritative monetary values, items, discounts, source reference, and payments', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSettledSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockCompletedPayment]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockSettledSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      // Loading is replaced by content
      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockSettledSale.id);
      });

      // Status badge is rendered
      expect(screen.getAllByText('Completed')[0]).toBeInTheDocument();

      // Authoritative financial totals rendered faithfully (no browser tampering)
      expect(screen.getByTestId('sale-subtotal')).toHaveTextContent('$200.00');
      expect(screen.getByTestId('sale-discount')).toHaveTextContent('$20.00');
      expect(screen.getByTestId('sale-total')).toHaveTextContent('$180.00');

      // Order discount details are clear and understandable
      expect(screen.getByText(/10% order-level discount/i)).toBeInTheDocument();
      expect(screen.getByText(/VIP_MEMBER_DISCOUNT/i)).toBeInTheDocument();

      // Origin source reference is displayed
      const sourceCard = screen.getByTestId('sale-source-info');
      expect(sourceCard).toBeInTheDocument();
      expect(within(sourceCard).getByText('MEMBERSHIP_PLAN')).toBeInTheDocument();
      expect(within(sourceCard).getByText('plan_vip_gold')).toBeInTheDocument();
      expect(within(sourceCard).getByText('VIP-GOLD-2026')).toBeInTheDocument();

      // Client info
      expect(screen.getByTestId('sale-client-info')).toHaveTextContent('client_alpha_99');

      // Line items table
      expect(screen.getByTestId('sale-line-items-table')).toBeInTheDocument();
      expect(screen.getByText('Annual VIP Gym Pass')).toBeInTheDocument();
      expect(screen.getByText('Locker Rental 12M')).toBeInTheDocument();
      expect(screen.getByText('PASS-VIP-01')).toBeInTheDocument();

      // Payments table and row link
      expect(screen.getByTestId('sale-payments-table')).toBeInTheDocument();
      expect(screen.getByText(mockCompletedPayment.id)).toBeInTheDocument();
      expect(screen.getByText('TXN-VISA-987654')).toBeInTheDocument();

      // Receipt navigation: distinct receipt button available for settled sale
      const receiptBtn = screen.getByTestId('view-receipt-btn');
      expect(receiptBtn).toBeInTheDocument();
      expect(receiptBtn).toHaveTextContent(/Receipt RCP-2026-00042/i);
    });

    it('renders missing optional fields gracefully for anonymous walk-in sales without upstream source', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockDraftWalkInSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftWalkInSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(null);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockDraftWalkInSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockDraftWalkInSale.id);
      });

      // Walk-in client label
      expect(screen.getByTestId('sale-client-info')).toHaveTextContent(
        /Anonymous Walk-in Customer/i,
      );

      // No upstream source reference callout
      expect(screen.getByTestId('sale-source-none')).toBeInTheDocument();
      expect(screen.getByText(/Direct Walk-in \/ POS Session/i)).toBeInTheDocument();

      // Empty payments message
      expect(screen.getByTestId('no-payments-msg')).toBeInTheDocument();

      // DRAFT state: Finalize button is present for staff with sales.create
      expect(screen.getByTestId('finalize-sale-btn')).toBeInTheDocument();

      // Receipt button is NOT present for un-settled DRAFT sale (receipt distinctness guarantee)
      expect(screen.queryByTestId('view-receipt-btn')).not.toBeInTheDocument();
    });

    it('supports finalizing draft sale and invalidates queries without stale state', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockDraftWalkInSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftWalkInSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockDraftWalkInSale,
        status: 'PENDING_PAYMENT',
      });

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockDraftWalkInSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('finalize-sale-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('finalize-sale-btn'));

      await waitFor(() => {
        expect(salesApi.finalizeSale).toHaveBeenCalledWith(mockDraftWalkInSale.id);
      });
    });

    it('renders record payment and cancel actions for pending sales, protecting immutable sales', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPendingSale.id);
      });

      // Actions permitted for PENDING_PAYMENT
      expect(screen.getByTestId('record-payment-btn')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-sale-btn')).toBeInTheDocument();

      // Finalize button is not exposed (sale is already finalized)
      expect(screen.queryByTestId('finalize-sale-btn')).not.toBeInTheDocument();
    });

    it('cancels sale agreement only after confirmation in CancelSaleDialog with audit reason', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.cancelSale as jest.Mock).mockResolvedValue({
        ...mockPendingSale,
        status: 'CANCELLED',
      });

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cancel-sale-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-dialog')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('cancellation-reason-input'), {
        target: { value: 'Customer cancelled transaction' },
      });

      fireEvent.click(screen.getByTestId('confirm-cancel-sale-btn'));

      await waitFor(() => {
        expect(salesApi.cancelSale).toHaveBeenCalledWith(mockPendingSale.id, {
          reason: 'Customer cancelled transaction',
        });
      });
    });

    it('records tender payment via RecordPaymentDialog and calls authoritative API', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.recordPayment as jest.Mock).mockResolvedValue(mockCompletedPayment);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('record-payment-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('record-payment-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('record-payment-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-record-payment-btn'));

      await waitFor(() => {
        expect(salesApi.recordPayment).toHaveBeenCalledWith(
          mockPendingSale.id,
          expect.objectContaining({
            method: 'CASH',
            amount: 100,
          }),
        );
      });
    });

    it('hides cancel-sale-btn if user lacks sales.cancel permission', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPendingSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPendingSale.id}`,
        initialSessionOverride: mockCashierUser, // has sales.read, sales.create, but lacks sales.cancel
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPendingSale.id);
      });

      expect(screen.getByTestId('record-payment-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();
    });

    it('renders 404 error state when sale does not exist', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_non_existent' });
      (salesApi.getSaleById as jest.Mock).mockRejectedValue(new Error('Sale not found'));

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_non_existent',
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Sale Agreement Not Found')).toBeInTheDocument();
    });

    it('renders loading skeleton while sale details are being fetched', () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_101' });
      (salesApi.getSaleById as jest.Mock).mockReturnValue(new Promise(() => {}));

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_101',
        initialSessionOverride: mockManagerUser,
      });

      expect(screen.getByTestId('sale-detail-loading')).toBeInTheDocument();
    });

    it('renders server error with retry option on unexpected 500 error', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_101' });
      const serverError = Object.assign(new Error('Internal Server Error 500'), {
        statusCode: 500,
      });
      (salesApi.getSaleById as jest.Mock).mockRejectedValue(serverError);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_101',
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to load sale agreement')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('renders 403 ForbiddenView when user lacks sales.read permission', () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSettledSale.id });

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockSettledSale.id}`,
        initialSessionOverride: mockNoAccessUser,
      });

      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(screen.getByText(/sales.read/i)).toBeInTheDocument();
      expect(screen.queryByTestId('sale-detail-page')).not.toBeInTheDocument();
    });
  });

  describe('Screen 5: Payment Detail Page', () => {
    it('renders authoritative details for a COMPLETED payment with receipt link and no unsupported actions', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockCompletedPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockCompletedPayment);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockCompletedPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockCompletedPayment.id);
      });

      // Accurate amount and currency display
      expect(screen.getByTestId('payment-amount')).toHaveTextContent('$180.00');

      // Tender method and status
      expect(screen.getByTestId('payment-method')).toHaveTextContent(/card/i);
      expect(screen.getByTestId('payment-status-banner-completed')).toBeInTheDocument();

      // Navigation link to associated sale agreement
      const saleLink = screen.getByTestId('associated-sale-link');
      expect(saleLink).toHaveTextContent(mockCompletedPayment.saleId);
      expect(saleLink).toHaveAttribute('href', `/sales/${mockCompletedPayment.saleId}`);

      // Settlement timestamp is shown
      expect(screen.getByTestId('payment-paid-at')).not.toHaveTextContent('Unsettled / Pending');

      // Trace tag
      expect(screen.getByTestId('payment-reference')).toHaveTextContent('TXN-VISA-987654');

      // Direct link to sale receipt is available for completed payment
      expect(screen.getByTestId('payment-view-receipt-btn')).toBeInTheDocument();

      // No mutation actions permitted for completed payment (immutable state)
      expect(screen.queryByTestId('settle-payment-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();
    });

    it('renders PENDING payment with settlement and cancellation controls for authorized cashier', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPendingPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPendingPayment);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockPendingPayment]);
      (salesApi.settlePayment as jest.Mock).mockResolvedValue({
        ...mockPendingPayment,
        status: 'COMPLETED',
        paidAt: '2026-09-21T09:10:00.000Z',
      });

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockPendingPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockPendingPayment.id);
      });

      // Pending announcement banner
      expect(screen.getByTestId('payment-status-banner-pending')).toBeInTheDocument();
      expect(screen.getByTestId('payment-paid-at')).toHaveTextContent('Unsettled / Pending');

      // Transition actions exposed for PENDING status
      const settleBtn = screen.getByTestId('settle-payment-btn');
      const cancelBtn = screen.getByTestId('cancel-payment-btn');
      expect(settleBtn).toBeInTheDocument();
      expect(cancelBtn).toBeInTheDocument();

      // Settle payment opens SettlePaymentDialog with authoritative financial confirmation summary
      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settle-payment-dialog')).toBeInTheDocument();
      });

      // Verifies all 4 values: Sale Total, Payment Amount, Payment Method, Remaining Balance
      expect(screen.getByTestId('financial-confirmation-summary')).toBeInTheDocument();
      expect(screen.getByTestId('summary-sale-total')).toHaveTextContent('$100.00');
      expect(screen.getByTestId('summary-payment-amount')).toHaveTextContent('$100.00');
      expect(screen.getByTestId('summary-payment-method')).toBeInTheDocument();
      expect(screen.getByTestId('summary-remaining-balance')).toHaveTextContent('$0.00');

      // Confirms settlement
      fireEvent.click(screen.getByTestId('confirm-settle-payment-btn'));

      await waitFor(() => {
        expect(salesApi.settlePayment).toHaveBeenCalledWith(mockPendingPayment.id, {
          reference: mockPendingPayment.reference,
        });
      });
    });

    it('cancels pending payment only after explicit confirmation in CancelPaymentDialog', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPendingPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPendingPayment);
      (salesApi.cancelPayment as jest.Mock).mockResolvedValue({
        ...mockPendingPayment,
        status: 'CANCELLED',
      });

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockPendingPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('cancel-payment-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cancel-payment-btn'));

      // Confirmation dialog is rendered with irreversible warning
      await waitFor(() => {
        expect(screen.getByTestId('cancel-payment-dialog')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/permanent and irreversible in accordance with financial audit controls/i),
      ).toBeInTheDocument();

      // Enter custom void reason
      fireEvent.change(screen.getByTestId('void-payment-reason-input'), {
        target: { value: 'Customer switched to cash tender' },
      });

      fireEvent.click(screen.getByTestId('confirm-void-payment-btn'));

      await waitFor(() => {
        expect(salesApi.cancelPayment).toHaveBeenCalledWith(mockPendingPayment.id, {
          reason: 'Customer switched to cash tender',
        });
      });
    });

    it('hides cancel-payment-btn if user lacks payments.manage permission even with payments.create', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPendingPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPendingPayment);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockPendingPayment.id}`,
        initialSessionOverride: mockCashierUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockPendingPayment.id);
      });

      // Settle is visible for payments.create
      expect(screen.getByTestId('settle-payment-btn')).toBeInTheDocument();
      // Cancel is HIDDEN for lack of payments.manage
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();
    });

    it('renders CANCELLED payment with void banner and no transition actions', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockCancelledPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockCancelledPayment);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockCancelledPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockCancelledPayment.id);
      });

      expect(screen.getByTestId('payment-status-banner-cancelled')).toBeInTheDocument();
      expect(screen.queryByTestId('settle-payment-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();
    });

    it('renders FAILED payment with failure banner and no transition actions', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockFailedPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockFailedPayment);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockFailedPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockFailedPayment.id);
      });

      expect(screen.getByTestId('payment-status-banner-failed')).toBeInTheDocument();
      expect(screen.queryByTestId('settle-payment-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();
    });

    it('renders 404 error view when payment record is not found', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_non_existent' });
      (salesApi.getPaymentById as jest.Mock).mockRejectedValue(new Error('Payment not found'));

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: '/sales/payments/pay_non_existent',
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-detail-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Payment Record Not Found')).toBeInTheDocument();
    });

    it('renders loading skeleton while payment transaction is being fetched', () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_101' });
      (salesApi.getPaymentById as jest.Mock).mockReturnValue(new Promise(() => {}));

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: '/sales/payments/pay_101',
        initialSessionOverride: mockManagerUser,
      });

      expect(screen.getByTestId('payment-detail-loading')).toBeInTheDocument();
    });

    it('renders server error with retry option on unexpected 500 error', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_101' });
      const serverError = Object.assign(new Error('Internal Server Error 500'), {
        statusCode: 500,
      });
      (salesApi.getPaymentById as jest.Mock).mockRejectedValue(serverError);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: '/sales/payments/pay_101',
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-detail-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to load payment transaction')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('renders 403 ForbiddenView when user lacks payments.read permission', () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockCompletedPayment.id });

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockCompletedPayment.id}`,
        initialSessionOverride: mockNoAccessUser,
      });

      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(screen.getByText(/payments.read/i)).toBeInTheDocument();
      expect(screen.queryByTestId('payment-detail-page')).not.toBeInTheDocument();
    });
  });
});
