import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SalesOverviewPage } from '../pages/sales-overview-page';
import { SalesListPage } from '../pages/sales-list-page';
import { SaleCreatePage } from '../pages/sale-create-page';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { PaymentDetailPage } from '../pages/payment-detail-page';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { SaleDTO, SaleSummaryDTO } from '../types/sales.types';
import type { PaymentDTO, PaginatedPaymentsDTO } from '../types/payments.types';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    createSale: jest.fn(),
    addSaleItem: jest.fn(),
    removeSaleItem: jest.fn(),
    applyOrderDiscount: jest.fn(),
    removeOrderDiscount: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    failPayment: jest.fn(),
    getReceiptBySale: jest.fn(),
    getReceiptById: jest.fn(),
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
  id: 'usr_mgr_100',
  email: 'manager@kinergy.test',
  name: 'Operations Manager',
  roles: ['Manager'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.read',
    'receipts.manage',
  ],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_view_1',
  email: 'viewer@kinergy.test',
  name: 'Read Only Viewer',
  roles: ['Auditor'],
  permissions: ['sales.read'],
  tenantId: 'tenant_1',
};

const mockNoAccessUser: AuthUser = {
  id: 'usr_none_1',
  email: 'guest@kinergy.test',
  name: 'Guest User',
  roles: ['Guest'],
  permissions: [],
  tenantId: 'tenant_1',
};

// Fixture: Commercial Sale
const mockSale: SaleDTO = {
  id: 'sale_wf_001',
  tenantId: 'tenant_1',
  clientId: 'client_alpha_99',
  currency: 'USD',
  status: 'PAID',
  sourceReference: {
    type: 'MEMBERSHIP',
    referenceId: 'mem_gold_99',
    referenceCode: 'MEM-99',
  },
  subtotal: { amount: 150, currency: 'USD' },
  subtotalAmount: 150,
  discountTotal: { amount: 15, currency: 'USD' },
  discountTotalAmount: 15,
  total: { amount: 135, currency: 'USD' },
  totalAmount: 135,
  itemCount: 1,
  items: [
    {
      id: 'item_wf_1',
      saleId: 'sale_wf_001',
      description: 'Gold Annual Membership',
      skuOrCode: 'MEM-GOLD-YR',
      sourceType: 'MEMBERSHIP',
      sourceId: 'mem_gold_99',
      quantity: 1,
      unitPrice: { amount: 150, currency: 'USD' },
      unitPriceAmount: 150,
      discountTotal: { amount: 15, currency: 'USD' },
      discountTotalAmount: 15,
      subtotal: { amount: 150, currency: 'USD' },
      total: { amount: 135, currency: 'USD' },
      totalAmount: 135,
    },
  ],
  version: 2,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:05:00.000Z',
  completedAt: '2026-10-17T10:05:00.000Z',
};

// Fixture: Sale Summary
const mockSaleSummary: SaleSummaryDTO = {
  id: 'sale_wf_001',
  tenantId: 'tenant_1',
  clientId: 'client_alpha_99',
  currency: 'USD',
  status: 'PAID',
  sourceReference: {
    type: 'MEMBERSHIP',
    referenceId: 'mem_gold_99',
  },
  subtotal: { amount: 150, currency: 'USD', formatted: '$150.00' },
  discountTotal: { amount: 15, currency: 'USD', formatted: '$15.00' },
  total: { amount: 135, currency: 'USD', formatted: '$135.00' },
  subtotalAmount: 150,
  discountTotalAmount: 15,
  totalAmount: 135,
  itemCount: 1,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:05:00.000Z',
  completedAt: '2026-10-17T10:05:00.000Z',
};

// Fixture: Payment
const mockPayment: PaymentDTO = {
  id: 'pay_wf_001',
  saleId: 'sale_wf_001',
  method: 'CARD',
  amount: { amount: 135, currency: 'USD' },
  amountValue: 135,
  status: 'COMPLETED',
  reference: 'STRIPE_CH_9999',
  paidAt: '2026-10-17T10:05:00.000Z',
  createdAt: '2026-10-17T10:02:00.000Z',
  version: 1,
};

// Fixture: Receipt
const mockReceipt: ReceiptDTO = {
  id: 'rec_wf_001',
  tenantId: 'tenant_1',
  saleId: 'sale_wf_001',
  receiptNumber: 'REC-2026-00099',
  saleReference: 'ORD-2026-00099',
  issuedAt: '2026-10-17T10:05:05.000Z',
  clientSnapshot: {
    clientId: 'client_alpha_99',
    referenceNumber: 'MEM-0099',
    fullName: 'Alice Member',
    email: 'alice@example.com',
    phone: '+1 555-0100',
  },
  items: [
    {
      itemId: 'item_wf_1',
      sourceType: 'MEMBERSHIP',
      sourceId: 'mem_gold_99',
      description: 'Gold Annual Membership',
      skuOrCode: 'MEM-GOLD-YR',
      quantity: 1,
      unitPrice: { amount: 150, currency: 'USD' },
      discountTotal: { amount: 15, currency: 'USD' },
      subtotal: { amount: 150, currency: 'USD' },
      total: { amount: 135, currency: 'USD' },
    },
  ],
  itemCount: 1,
  subtotal: { amount: 150, currency: 'USD' },
  discountTotal: { amount: 15, currency: 'USD' },
  total: { amount: 135, currency: 'USD' },
  currency: 'USD',
  payments: [
    {
      paymentId: 'pay_wf_001',
      method: 'CARD',
      amount: { amount: 135, currency: 'USD' },
      status: 'COMPLETED',
      reference: 'STRIPE_CH_9999',
      paidAt: '2026-10-17T10:05:00.000Z',
    },
  ],
  paymentMethod: 'CARD',
  paymentStatus: 'COMPLETED',
  status: 'ISSUED',
  reprintCount: 0,
};

describe('End-to-End Sales & Payments Workflow Integration', () => {
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

  describe('Workflow 1 & 2: Overview -> Sales List -> Sale Detail navigation', () => {
    it('verifies navigation contract from Sales Overview to Directory and Sale Detail', async () => {
      (salesApi.listSales as jest.Mock).mockResolvedValue({
        items: [mockSaleSummary],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      // 1. Render Overview
      const { unmount } = renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/overview',
      });

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Sales & Payments Overview/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(mockSaleSummary.id)).toBeInTheDocument();
      });

      // Overview provides link to Sales Directory
      const directoryLink = screen.getByRole('link', { name: /View Full Directory/i });
      expect(directoryLink).toHaveAttribute('href', '/sales/list');

      // Recent sales row links to Sale Detail
      const saleRowLink = screen.getByText(mockSaleSummary.id).closest('a');
      expect(saleRowLink).toHaveAttribute('href', `/sales/${mockSaleSummary.id}`);

      unmount();

      // 2. Render Sales List
      const listQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      (salesApi.listSales as jest.Mock).mockResolvedValue({
        items: [mockSaleSummary],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderWithProviders(<SalesListPage />, {
        queryClient: listQueryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/list',
      });

      await waitFor(() => {
        expect(screen.getByText(mockSaleSummary.id)).toBeInTheDocument();
      });

      const listSaleLink = screen.getByText(mockSaleSummary.id).closest('a');
      expect(listSaleLink).toHaveAttribute('href', `/sales/${mockSaleSummary.id}`);
    });
  });

  describe('Workflow 3: Sale Create -> Newly Created Sale Detail navigation', () => {
    it('initializes draft sale and redirects to the canonical sale detail route', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockSale);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/new',
      });

      expect(screen.getByRole('heading', { name: /Create Commercial Sale/i })).toBeInTheDocument();

      // Check Back to Directory link
      const backLink = screen.getByRole('link', { name: /Back to Directory/i });
      expect(backLink).toHaveAttribute('href', '/sales/list');

      // Fill in description and price
      const descInput = screen.getByPlaceholderText(/Whey Protein 1kg/i);
      fireEvent.change(descInput, { target: { value: 'Gold Annual Membership' } });

      const priceInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(priceInput, { target: { value: '150.00' } });

      // Submit
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Workflow 4 & 5: Sale Detail -> Payment Detail & Payment History', () => {
    it('verifies bidirectional navigation between Sale Detail and Payment Detail', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockPayment]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);

      // Render Sale Detail
      const { unmount } = renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: `/sales/${mockSale.id}`,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockSale.id);
      });

      // Payment in payments table links to Payment Detail
      const paymentLink = screen.getByText(mockPayment.id).closest('a');
      expect(paymentLink).toHaveAttribute('href', `/sales/payments/${mockPayment.id}`);

      // Receipt banner button links to Receipt View
      const receiptBtn = screen.getByTestId('view-receipt-btn');
      expect(receiptBtn).toHaveAttribute('href', `/sales/${mockSale.id}/receipt`);

      unmount();

      // Render Payment Detail
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPayment);

      const paymentQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      renderWithProviders(<PaymentDetailPage />, {
        queryClient: paymentQueryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: `/sales/payments/${mockPayment.id}`,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockPayment.id);
      });

      // Related sale link navigates back to Sale Detail
      const relatedSaleLink = screen.getByText(mockSale.id).closest('a');
      expect(relatedSaleLink).toHaveAttribute('href', `/sales/${mockSale.id}`);

      // View Receipt button links to Receipt View
      const paymentReceiptBtn = screen.getByTestId('payment-view-receipt-btn');
      expect(paymentReceiptBtn).toHaveAttribute('href', `/sales/${mockSale.id}/receipt`);
    });

    it('verifies Payment History navigation to Payment Detail and related Sale Detail', async () => {
      const paymentsListResponse: PaginatedPaymentsDTO = {
        items: [mockPayment],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      (salesApi.listPayments as jest.Mock).mockResolvedValue(paymentsListResponse);

      renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/payments',
      });

      await waitFor(() => {
        expect(screen.getByText(mockPayment.id)).toBeInTheDocument();
      });

      // Link to Payment Detail
      const payDetailLink = screen.getByText(mockPayment.id).closest('a');
      expect(payDetailLink).toHaveAttribute('href', `/sales/payments/${mockPayment.id}`);

      // Link to Sale Detail
      const relatedSaleLink = screen.getByText(mockPayment.saleId).closest('a');
      expect(relatedSaleLink).toHaveAttribute('href', `/sales/${mockPayment.saleId}`);
    });
  });

  describe('Workflow 6 & 7: Sale Detail -> Receipt View -> Return to Sale Detail', () => {
    it('verifies Receipt View displays authoritative snapshot and returns to Sale Detail', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSale.id });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: `/sales/${mockSale.id}/receipt`,
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toHaveTextContent(mockReceipt.receiptNumber);
      });

      // Back to Sale navigation link
      const backLink = screen.getByRole('link', { name: /Back to Sale/i });
      expect(backLink).toHaveAttribute('href', `/sales/${mockSale.id}`);

      // Frozen snapshot values verified
      expect(screen.getByText('Alice Member')).toBeInTheDocument();
      expect(screen.getAllByText('$135.00')[0]).toBeInTheDocument();
    });
  });

  describe('Authorization & Permission Integrity', () => {
    it('renders 403 ForbiddenView when user lacks permission for each protected screen', () => {
      // 1. Sales Overview without sales.read
      const { unmount: u1 } = renderWithProviders(<SalesOverviewPage />, {
        queryClient,
        initialSessionOverride: mockNoAccessUser,
        initialRoute: '/sales/overview',
      });
      expect(screen.getByText(/Missing required permission 'sales.read'/i)).toBeInTheDocument();
      u1();

      // 2. Sales List without sales.read
      const { unmount: u2 } = renderWithProviders(<SalesListPage />, {
        queryClient,
        initialSessionOverride: mockNoAccessUser,
        initialRoute: '/sales/list',
      });
      expect(screen.getByText(/Missing required permission 'sales.read'/i)).toBeInTheDocument();
      u2();

      // 3. Sale Create without sales.create
      const { unmount: u3 } = renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser, // has sales.read, lacks sales.create
        initialRoute: '/sales/new',
      });
      expect(screen.getByText(/Missing required permission 'sales.create'/i)).toBeInTheDocument();
      u3();

      // 4. Payment History without payments.read
      const { unmount: u4 } = renderWithProviders(<PaymentHistoryPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser, // has sales.read, lacks payments.read
        initialRoute: '/sales/payments',
      });
      expect(screen.getByText(/Missing required permission 'payments.read'/i)).toBeInTheDocument();
      u4();

      // 5. Payment Detail without payments.read
      (useParams as jest.Mock).mockReturnValue({ paymentId: 'pay_99' });
      const { unmount: u5 } = renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser, // lacks payments.read
        initialRoute: '/sales/payments/pay_99',
      });
      expect(screen.getByText(/Missing required permission 'payments.read'/i)).toBeInTheDocument();
      u5();

      // 6. Receipt View without receipts.read
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_99' });
      const { unmount: u6 } = renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser, // lacks receipts.read
        initialRoute: '/sales/sale_99/receipt',
      });
      expect(screen.getByText(/Missing required permission 'receipts.read'/i)).toBeInTheDocument();
      u6();
    });

    it('hides destructive/management actions from users possessing only read permission', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue({
        ...mockSale,
        status: 'DRAFT',
      });
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(null);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser, // only sales.read
        initialRoute: `/sales/${mockSale.id}`,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockSale.id);
      });

      // Management buttons must NOT appear for read-only staff
      expect(screen.queryByTestId('finalize-sale-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-sale-trigger-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('record-payment-trigger-btn')).not.toBeInTheDocument();
    });
  });
});
