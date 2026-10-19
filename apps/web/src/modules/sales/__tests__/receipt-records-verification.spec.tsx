import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
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

const mockOwnerUser: AuthUser = {
  id: 'usr_owner_01',
  email: 'owner@kinergy.test',
  name: 'Gym Owner',
  roles: ['Owner'],
  permissions: ['sales.read', 'sales.manage', 'payments.read', 'receipts.read', 'receipts.manage'],
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

const mockSettledReceiptWithDiscount: ReceiptDTO = {
  id: 'rec_uuid_0001',
  tenantId: 'tenant_kinergy_prime',
  saleId: 'sale_uuid_7001',
  receiptNumber: 'REC-2026-000888',
  saleReference: 'ORD-2026-000888',
  issuedAt: '2026-10-18T16:00:00.000Z',
  clientSnapshot: {
    clientId: 'cli_registered_99',
    referenceNumber: 'MEM-99001',
    fullName: 'Carlos Rodriguez',
    email: 'carlos.rodriguez@example.com',
    phone: '+1 555-0144',
  },
  items: [
    {
      itemId: 'item_line_1',
      sourceType: 'INVENTORY_PRODUCT',
      sourceId: 'inv_protein_vanilla',
      description: 'Whey Protein Isolate - Vanilla 1kg',
      skuOrCode: 'SKU-WPI-VAN',
      quantity: 1,
      unitPrice: { amount: 60, currency: 'USD' },
      discountTotal: { amount: 6, currency: 'USD' },
      subtotal: { amount: 60, currency: 'USD' },
      total: { amount: 54, currency: 'USD' },
    },
    {
      itemId: 'item_line_2',
      sourceType: 'SERVICE',
      sourceId: 'srv_physio_session',
      description: 'Physiotherapy Consultation (45 min)',
      skuOrCode: 'SKU-PHYSIO-45',
      quantity: 1,
      unitPrice: { amount: 40, currency: 'USD' },
      discountTotal: { amount: 4, currency: 'USD' },
      subtotal: { amount: 40, currency: 'USD' },
      total: { amount: 36, currency: 'USD' },
    },
  ],
  itemCount: 2,
  subtotal: { amount: 100, currency: 'USD' },
  discountTotal: { amount: 10, currency: 'USD' },
  total: { amount: 90, currency: 'USD' },
  currency: 'USD',
  payments: [
    {
      paymentId: 'pay_tender_1',
      method: 'QR',
      amount: { amount: 90, currency: 'USD' },
      status: 'COMPLETED',
      reference: 'QR_TENDER_REF_8819',
      paidAt: '2026-10-18T15:59:50.000Z',
    },
  ],
  paymentMethod: 'QR',
  paymentStatus: 'COMPLETED',
  status: 'ISSUED',
  reprintCount: 0,
};

describe('Receipt Records Verification (Senior Financial Records & Receipt Engineer)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_uuid_7001' });
  });

  describe('1. Authoritative Receipt Rendering for Settled Sale', () => {
    it('accurately renders complete receipt voucher matching persisted financial transaction', async () => {
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockSettledReceiptWithDiscount);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      // 1. Wait for authoritative voucher data
      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toHaveTextContent('REC-2026-000888');
      });

      // 2. Order reference & voucher header
      expect(screen.getByText(/Order Reference: ORD-2026-000888/i)).toBeInTheDocument();
      expect(screen.getByText('ISSUED')).toBeInTheDocument();
      expect(screen.getByText('Official Proof of Purchase')).toBeInTheDocument();

      // 3. Client snapshot representation
      const clientBox = screen.getByTestId('receipt-client-snapshot');
      expect(clientBox).toHaveTextContent('Carlos Rodriguez');
      expect(clientBox).toHaveTextContent('Member #MEM-99001');
      expect(clientBox).toHaveTextContent('carlos.rodriguez@example.com');
      expect(clientBox).toHaveTextContent('+1 555-0144');

      // 4. Line items table with frozen descriptions, quantities, unit prices, and line totals
      const itemsTable = screen.getByTestId('receipt-items-table');
      expect(itemsTable).toHaveTextContent('Whey Protein Isolate - Vanilla 1kg');
      expect(itemsTable).toHaveTextContent('SKU-WPI-VAN');
      expect(itemsTable).toHaveTextContent('$60.00');
      expect(itemsTable).toHaveTextContent('$54.00');

      expect(itemsTable).toHaveTextContent('Physiotherapy Consultation (45 min)');
      expect(itemsTable).toHaveTextContent('SKU-PHYSIO-45');
      expect(itemsTable).toHaveTextContent('$40.00');
      expect(itemsTable).toHaveTextContent('$36.00');

      // 5. Monetary totals breakdown
      const totalsBox = screen.getByTestId('receipt-totals-breakdown');
      expect(totalsBox).toHaveTextContent('Subtotal:');
      expect(totalsBox).toHaveTextContent('$100.00');
      expect(totalsBox).toHaveTextContent('Total Discount Applied:');
      expect(totalsBox).toHaveTextContent('-$10.00');
      expect(totalsBox).toHaveTextContent('Total Paid (USD):');
      expect(totalsBox).toHaveTextContent('$90.00');

      // 6. Settled tender payment record (QR tender method and transaction reference)
      const paymentsBox = screen.getByTestId('receipt-payments-snapshot');
      expect(paymentsBox).toHaveTextContent('QR');
      expect(paymentsBox).toHaveTextContent('Ref: QR_TENDER_REF_8819');
      expect(paymentsBox).toHaveTextContent('$90.00');

      // 7. Audit & legal disclaimer confirming read-only proof-of-purchase
      expect(screen.getByTestId('receipt-audit-disclaimer')).toHaveTextContent(
        /Official proof-of-purchase voucher snapshotted upon settlement/i,
      );
    });

    it('renders Walk-in Customer when receipt has no registered client association', async () => {
      const walkinReceipt: ReceiptDTO = {
        ...mockSettledReceiptWithDiscount,
        clientSnapshot: null,
      };
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(walkinReceipt);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toBeInTheDocument();
      });

      expect(screen.getByText('Walk-in Customer')).toBeInTheDocument();
      expect(screen.queryByText('Carlos Rodriguez')).not.toBeInTheDocument();
    });
  });

  describe('2. Historical Value Preservation & Zero Recalculation', () => {
    it('preserves historical snapshot without mutating or creating duplicate financial records', async () => {
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockSettledReceiptWithDiscount);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-number')).toHaveTextContent('REC-2026-000888');
      });

      // Assert zero mutation calls were triggered by viewing
      expect(salesApi.issueReceipt).not.toHaveBeenCalled();

      // Verify print trigger functions cleanly without financial mutations
      const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
      const printBtn = screen.getByTestId('receipt-print-button');
      fireEvent.click(printBtn);

      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(salesApi.issueReceipt).not.toHaveBeenCalled();
      printSpy.mockRestore();
    });
  });

  describe('3. Unavailable Receipt Handling (Unsettled or Non-Existent Sale)', () => {
    it('handles 404 receipt-not-found cleanly without fabricating content', async () => {
      const notFoundError = Object.assign(
        new Error('Receipt for sale sale_uuid_7001 was not found'),
        {
          statusCode: 404,
        },
      );
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(notFoundError);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-not-issued')).toBeInTheDocument();
      });

      expect(screen.getByText('Receipt Not Issued Yet')).toBeInTheDocument();
      expect(
        screen.getByText(/No official receipt voucher has been issued for sale "sale_uuid_7001"/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /official receipts are generated only after a sale order is fully settled/i,
        ),
      ).toBeInTheDocument();

      // Return to Sale navigation
      const returnLink = screen.getByRole('link', { name: /Return to Sale/i });
      expect(returnLink).toHaveAttribute('href', '/sales/sale_uuid_7001');

      // Issue Receipt button available for staff with receipts.manage
      expect(screen.getByTestId('issue-receipt-btn')).toBeInTheDocument();
    });

    it('triggers idempotent issueReceipt mutation when owner clicks Generate Receipt Now', async () => {
      const notFoundError = Object.assign(new Error('Receipt not found'), { statusCode: 404 });
      (salesApi.getReceiptBySale as jest.Mock)
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValue(mockSettledReceiptWithDiscount);

      (salesApi.issueReceipt as jest.Mock).mockResolvedValue(mockSettledReceiptWithDiscount);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('issue-receipt-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('issue-receipt-btn'));

      await waitFor(() => {
        expect(salesApi.issueReceipt).toHaveBeenCalledWith('sale_uuid_7001', undefined);
      });
    });
  });

  describe('4. Loading & Server Failure States', () => {
    it('renders loading skeleton while fetching receipt data', () => {
      (salesApi.getReceiptBySale as jest.Mock).mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      expect(screen.getByTestId('receipt-view-loading')).toBeInTheDocument();
    });

    it('handles 500 internal server failure with actionable retry action', async () => {
      const serverError = Object.assign(new Error('Database connectivity error 500'), {
        statusCode: 500,
      });
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(serverError);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockOwnerUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-view-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to Load Receipt Voucher')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });

  describe('5. Security & Permission Boundaries', () => {
    it('renders 403 ForbiddenView when user lacks receipts.read permission', () => {
      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialSessionOverride: mockUnauthorizedUser,
        initialRoute: '/sales/sale_uuid_7001/receipt',
      });

      expect(
        screen.getByText(/Missing required permission 'receipts.read' to view receipt vouchers/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('receipt-view-page')).not.toBeInTheDocument();
    });
  });
});
