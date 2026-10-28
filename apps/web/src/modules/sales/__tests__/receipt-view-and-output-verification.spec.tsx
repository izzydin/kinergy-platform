import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { ReceiptDTO } from '../types/receipts.types';
import type { SaleDTO } from '../types/sales.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    getReceiptBySale: jest.fn(),
    getSaleById: jest.fn(),
    issueReceipt: jest.fn(),
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

const mockManagerUser: AuthUser = {
  id: 'usr_mgr_01',
  email: 'manager@kinergy.test',
  name: 'Gym Manager',
  roles: ['Manager'],
  permissions: ['sales.read', 'payments.read', 'receipts.read', 'receipts.manage'],
  tenantId: 'tenant_kinergy_prime',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_auditor_01',
  email: 'auditor@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['sales.read', 'payments.read', 'receipts.read'],
  tenantId: 'tenant_kinergy_prime',
};

const mockUnauthorizedUser: AuthUser = {
  id: 'usr_guest_01',
  email: 'guest@kinergy.test',
  name: 'Guest User',
  roles: ['Guest'],
  permissions: ['sales.read'],
  tenantId: 'tenant_kinergy_prime',
};

const mockSettledSale: SaleDTO = {
  id: 'sale_settled_500',
  tenantId: 'tenant_kinergy_prime',
  clientId: 'cli_100',
  currency: 'USD',
  status: 'PAID',
  subtotal: { amount: 120, currency: 'USD' },
  subtotalAmount: 120,
  discountTotal: { amount: 20, currency: 'USD' },
  discountTotalAmount: 20,
  total: { amount: 100, currency: 'USD' },
  totalAmount: 100,
  itemCount: 2,
  items: [],
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:05:00.000Z',
  completedAt: '2026-10-20T10:05:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  refundedAt: null,
  version: 2,
};

const mockCancelledSale: SaleDTO = {
  ...mockSettledSale,
  id: 'sale_cancelled_600',
  status: 'CANCELLED',
  cancelledAt: '2026-10-20T10:10:00.000Z',
  cancellationReason: 'Customer walked out before payment tender',
};

const mockPendingSale: SaleDTO = {
  ...mockSettledSale,
  id: 'sale_pending_700',
  status: 'PENDING_PAYMENT',
  completedAt: null,
};

const mockReceiptVoucher: ReceiptDTO = {
  id: 'rec_uuid_9999',
  tenantId: 'tenant_kinergy_prime',
  saleId: 'sale_settled_500',
  receiptNumber: 'REC-2026-000999',
  saleReference: 'ORD-2026-000999',
  issuedAt: '2026-10-20T10:05:00.000Z',
  clientSnapshot: {
    clientId: 'cli_100',
    referenceNumber: 'MEM-00100',
    fullName: 'Elena Rostova',
    email: 'elena@example.com',
    phone: '+1 555-0188',
  },
  items: [
    {
      itemId: 'item_1',
      sourceType: 'SERVICE',
      sourceId: 'srv_kine_45',
      description: 'Kinesiology Active Recovery Session',
      skuOrCode: 'SKU-KINE-45',
      quantity: 1,
      unitPrice: { amount: 100, currency: 'USD' },
      discountTotal: { amount: 20, currency: 'USD' },
      subtotal: { amount: 100, currency: 'USD' },
      total: { amount: 80, currency: 'USD' },
    },
    {
      itemId: 'item_2',
      sourceType: 'INVENTORY_PRODUCT',
      sourceId: 'inv_magnesium',
      description: 'Magnesium Recovery Drink 500ml',
      skuOrCode: 'SKU-MAG-500',
      quantity: 1,
      unitPrice: { amount: 20, currency: 'USD' },
      discountTotal: { amount: 0, currency: 'USD' },
      subtotal: { amount: 20, currency: 'USD' },
      total: { amount: 20, currency: 'USD' },
    },
  ],
  itemCount: 2,
  subtotal: { amount: 120, currency: 'USD' },
  discountTotal: { amount: 20, currency: 'USD' },
  total: { amount: 100, currency: 'USD' },
  currency: 'USD',
  payments: [
    {
      paymentId: 'pay_tender_101',
      method: 'CASH',
      amount: { amount: 100, currency: 'USD' },
      status: 'COMPLETED',
      reference: 'DRAWER-02',
      paidAt: '2026-10-20T10:05:00.000Z',
    },
  ],
  paymentMethod: 'CASH',
  paymentStatus: 'COMPLETED',
  status: 'ISSUED',
  reprintCount: 0,
  lastReprintedAt: null,
};

describe('Receipt View & Output Hardening (Auditable Transaction Verification)', () => {
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

  describe('1. Authoritative Receipt Rendering & Frozen Snapshot Fidelity', () => {
    it('renders complete immutable proof-of-purchase voucher with client, items, discounts, and tenders', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toHaveTextContent('REC-2026-000999');
      });

      // Proof of purchase headers
      expect(screen.getByText('Official Proof of Purchase')).toBeInTheDocument();
      expect(screen.getByText(/Order Reference: ORD-2026-000999/i)).toBeInTheDocument();
      expect(screen.getByText('ISSUED')).toBeInTheDocument();

      // Customer snapshot
      const clientBox = screen.getByTestId('receipt-client-snapshot');
      expect(clientBox).toHaveTextContent('Elena Rostova');
      expect(clientBox).toHaveTextContent('Member #MEM-00100');
      expect(clientBox).toHaveTextContent('elena@example.com');
      expect(clientBox).toHaveTextContent('+1 555-0188');

      // Line items with frozen snapshots
      const itemsTable = screen.getByTestId('receipt-items-table');
      expect(itemsTable).toHaveTextContent('Kinesiology Active Recovery Session');
      expect(itemsTable).toHaveTextContent('SKU-KINE-45');
      expect(itemsTable).toHaveTextContent('$100.00');
      expect(itemsTable).toHaveTextContent('$80.00');

      expect(itemsTable).toHaveTextContent('Magnesium Recovery Drink 500ml');
      expect(itemsTable).toHaveTextContent('SKU-MAG-500');
      expect(itemsTable).toHaveTextContent('$20.00');

      // Totals breakdown
      const totalsBox = screen.getByTestId('receipt-totals-breakdown');
      expect(totalsBox).toHaveTextContent('Subtotal:');
      expect(totalsBox).toHaveTextContent('$120.00');
      expect(totalsBox).toHaveTextContent('Total Discount Applied:');
      expect(totalsBox).toHaveTextContent('-$20.00');
      expect(totalsBox).toHaveTextContent('Total Paid (USD):');
      expect(totalsBox).toHaveTextContent('$100.00');

      // Settled tender breakdown
      const tendersBox = screen.getByTestId('receipt-payments-snapshot');
      expect(tendersBox).toHaveTextContent('Cash');
      expect(tendersBox).toHaveTextContent('Ref: DRAWER-02');
      expect(tendersBox).toHaveTextContent('$100.00');

      // Legal disclaimer
      expect(screen.getByTestId('receipt-audit-disclaimer')).toBeInTheDocument();
    });

    it('faithfully renders Walk-in Customer when clientSnapshot is null', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue({
        ...mockReceiptVoucher,
        clientSnapshot: null,
      });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      expect(screen.getByText('Walk-in Customer')).toBeInTheDocument();
    });
  });

  describe('2. Receipt Eligibility & Status Guards', () => {
    it('displays explicit ineligibility banner for CANCELLED sale orders without offering issuance', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_cancelled_600' });
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Receipt not found'), { statusCode: 404 }),
      );
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockCancelledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_cancelled_600/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-ineligible-cancelled')).toBeInTheDocument();
      });

      expect(screen.getByText('Receipt Ineligible (Sale Cancelled)')).toBeInTheDocument();
      expect(
        screen.getByText(
          /proof-of-purchase receipts cannot be generated for cancelled agreements/i,
        ),
      ).toBeInTheDocument();

      // Generate Receipt button must strictly NOT be offered
      expect(screen.queryByTestId('issue-receipt-btn')).not.toBeInTheDocument();
    });

    it('displays ineligibility banner for unsettled (PENDING_PAYMENT) sale orders without offering issuance', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_pending_700' });
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Receipt not found'), { statusCode: 404 }),
      );
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPendingSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_pending_700/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-ineligible-unsettled')).toBeInTheDocument();
      });

      expect(screen.getByText('Receipt Not Issued Yet')).toBeInTheDocument();
      expect(
        screen.getByText(/generated only after a sale order is fully settled/i),
      ).toBeInTheDocument();

      expect(screen.queryByTestId('issue-receipt-btn')).not.toBeInTheDocument();
    });

    it('surfaces inline error when backend rejects receipt generation with 422', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      const notFoundError = Object.assign(new Error('Receipt not found'), { statusCode: 404 });
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(notFoundError);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      const unprocessableErr = Object.assign(
        new Error('Sale is not PAID or COMPLETED, or payment tenders are insufficient'),
        { statusCode: 422 },
      );
      (salesApi.issueReceipt as jest.Mock).mockRejectedValueOnce(unprocessableErr);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('issue-receipt-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('issue-receipt-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('issue-receipt-error')).toBeInTheDocument();
      });

      const alert = screen.getByTestId('issue-receipt-error');
      expect(within(alert).getByText('Receipt Issuance Rejected')).toBeInTheDocument();
      expect(
        within(alert).getByText(
          /Sale is not PAID or COMPLETED, or payment tenders are insufficient/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('3. Output Formats (Standard, 80mm POS Thermal, 58mm Thermal)', () => {
    it('defaults to standard format and supports 80mm POS thermal and 58mm thermal switching', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      const container = screen.getByTestId('receipt-paper-container');
      expect(container).toHaveAttribute('data-format', 'standard');

      const formatSelect = screen.getByTestId('receipt-format-selector');
      expect(formatSelect).toHaveValue('standard');

      // Switch to 80mm POS Thermal
      fireEvent.change(formatSelect, { target: { value: '80mm' } });
      expect(container).toHaveAttribute('data-format', '80mm');
      expect(container.className).toContain('w-[80mm]');

      // Switch to 58mm Compact Thermal
      fireEvent.change(formatSelect, { target: { value: '58mm' } });
      expect(container).toHaveAttribute('data-format', '58mm');
      expect(container.className).toContain('w-[58mm]');
    });

    it('triggers window.print when print button is clicked', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-print-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('receipt-print-button'));
      expect(printSpy).toHaveBeenCalledTimes(1);

      printSpy.mockRestore();
    });
  });

  describe('4. Official Duplicate Reprint & Backend Audit Tracking', () => {
    it('does not display duplicate watermark when reprintCount is 0', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue({
        ...mockReceiptVoucher,
        reprintCount: 0,
      });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('receipt-duplicate-watermark')).not.toBeInTheDocument();
    });

    it('invokes backend reprint endpoint and displays audited duplicate watermark', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      const reprintedReceipt: ReceiptDTO = {
        ...mockReceiptVoucher,
        reprintCount: 1,
        lastReprintedAt: '2026-10-20T10:15:00.000Z',
      };
      (salesApi.reprintReceipt as jest.Mock).mockResolvedValue(reprintedReceipt);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-reprint-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('receipt-reprint-button'));

      await waitFor(() => {
        expect(salesApi.reprintReceipt).toHaveBeenCalledWith('rec_uuid_9999');
      });
    });

    it('renders duplicate watermark with reprint sequence and timestamp when reprintCount > 0', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue({
        ...mockReceiptVoucher,
        reprintCount: 2,
        lastReprintedAt: '2026-10-20T10:20:00.000Z',
      });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-duplicate-watermark')).toBeInTheDocument();
      });

      expect(screen.getByTestId('receipt-duplicate-watermark')).toHaveTextContent(
        /COPY \/ DUPLICATE VOUCHER — REPRINT #2/i,
      );
    });
  });

  describe('5. Authorization Boundaries & Immutability Verification', () => {
    it('blocks access with ForbiddenView when user lacks receipts.read', () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockUnauthorizedUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      expect(screen.getByText(/Missing required permission 'receipts.read'/i)).toBeInTheDocument();
      expect(screen.queryByTestId('receipt-view-page')).not.toBeInTheDocument();
    });

    it('hides reprint button for read-only auditors lacking receipts.manage', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      // User has receipts.read, so receipt renders
      expect(screen.getByTestId('receipt-view-page')).toBeInTheDocument();

      // Read-only user lacks receipts.manage, so reprint button is hidden
      expect(screen.queryByTestId('receipt-reprint-button')).not.toBeInTheDocument();

      // Print is still available for physical presentation
      expect(screen.getByTestId('receipt-print-button')).toBeInTheDocument();
    });

    it('asserts zero financial mutations occur upon receipt viewing', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_settled_500' });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceiptVoucher);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockSettledSale);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/sale_settled_500/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      expect(salesApi.issueReceipt).not.toHaveBeenCalled();
      expect(salesApi.reprintReceipt).not.toHaveBeenCalled();
    });
  });
});
