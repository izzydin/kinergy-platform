import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SaleCreatePage } from '../pages/sale-create-page';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { SalesListPage } from '../pages/sales-list-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { SaleDTO, SaleSummaryDTO } from '../types/sales.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
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
    'receipts.read',
  ],
  tenantId: 'tenant_main',
};

const mockDraftSale: SaleDTO = {
  id: 'sale_draft_001',
  tenantId: 'tenant_main',
  clientId: 'client_pt_88',
  currency: 'USD',
  status: 'DRAFT',
  sourceReference: {
    type: 'KINESIOLOGY_SESSION',
    referenceId: 'session_kine_501',
    referenceCode: 'KINE-501',
  },
  subtotal: { amount: 100, currency: 'USD' },
  subtotalAmount: 100,
  discountTotal: { amount: 10, currency: 'USD' },
  discountTotalAmount: 10,
  total: { amount: 90, currency: 'USD' },
  totalAmount: 90,
  itemCount: 1,
  items: [
    {
      id: 'item_1',
      saleId: 'sale_draft_001',
      description: 'Clinical Kinesiology Assessment',
      skuOrCode: 'KINE-ASSESS',
      sourceType: 'KINESIOLOGY_SESSION',
      sourceId: 'session_kine_501',
      quantity: 1,
      unitPrice: { amount: 100, currency: 'USD' },
      unitPriceAmount: 100,
      discountTotal: { amount: 10, currency: 'USD' },
      discountTotalAmount: 10,
      subtotal: { amount: 100, currency: 'USD' },
      total: { amount: 90, currency: 'USD' },
      totalAmount: 90,
    },
  ],
  version: 1,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  refundedAt: null,
};

const mockPaidSale: SaleDTO = {
  ...mockDraftSale,
  id: 'sale_paid_002',
  status: 'PAID',
  version: 3,
  completedAt: '2026-10-19T10:15:00.000Z',
};

const mockWalkInSale: SaleDTO = {
  ...mockDraftSale,
  id: 'sale_walkin_003',
  clientId: null,
  sourceReference: {
    type: 'DRINK',
    referenceId: 'drink_smoothie_12',
    referenceCode: 'SMOOTH-01',
  },
};

describe('Owner-Facing Sales Operations Verification Suite (Phase 7.24)', () => {
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

  describe('1. Sale Creation & Validation Rules (Req 1, 2, 4)', () => {
    it('verifies owner can create a valid sale with line item and client association', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValueOnce({
        id: 'sale_created_123',
        status: 'DRAFT',
      });

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockOwnerUser,
      });

      expect(screen.getByTestId('sale-create-page')).toBeInTheDocument();

      // Enter client ID
      const clientInput = screen.getByTestId('sale-client-id-input');
      fireEvent.change(clientInput, { target: { value: 'client_pt_88' } });

      // Enter line item description and unit price
      const descInput = screen.getByTestId('item-desc-0');
      fireEvent.change(descInput, { target: { value: 'Initial Consultation' } });

      const priceInput = screen.getByTestId('item-price-0');
      fireEvent.change(priceInput, { target: { value: '75.00' } });

      // Submit form
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
      });

      const payload = (salesApi.createSale as jest.Mock).mock.calls[0][0];
      expect(payload.clientId).toBe('client_pt_88');
      expect(payload.items).toHaveLength(1);
      expect(payload.items[0].description).toBe('Initial Consultation');
      expect(payload.items[0].unitPrice).toBe(75);
    });

    it('rejects empty line item submission at the form boundary', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockOwnerUser,
      });

      // Submit without entering description (which is required)
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Item description is required')).toBeInTheDocument();
      });

      expect(salesApi.createSale).not.toHaveBeenCalled();
    });
  });

  describe('2. Authoritative Financial Values & Detail Display (Req 3, 5, 8)', () => {
    beforeEach(() => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_draft_001' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(null);
    });

    it('renders authoritative subtotal, order discount, and total from server results', async () => {
      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_draft_001',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-page')).toBeInTheDocument();
      });

      // Subtotal, discount, and total reflect server-derived values ($100.00, $10.00, $90.00)
      expect(screen.getByTestId('sale-subtotal')).toHaveTextContent('100');
      expect(screen.getByTestId('sale-discount')).toHaveTextContent('10');
      expect(screen.getByTestId('sale-total')).toHaveTextContent('90');
    });

    it('displays origin source reference and associated Client ID', async () => {
      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_draft_001',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-source-info')).toBeInTheDocument();
      });

      const sourceInfo = screen.getByTestId('sale-source-info');
      expect(within(sourceInfo).getByText('KINESIOLOGY_SESSION')).toBeInTheDocument();
      expect(within(sourceInfo).getByText('session_kine_501')).toBeInTheDocument();
      expect(within(sourceInfo).getByText('KINE-501')).toBeInTheDocument();
      expect(screen.getByTestId('sale-client-info')).toHaveTextContent('client_pt_88');
    });

    it('displays "Anonymous Walk-in" when client ID is not provided', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_walkin_003' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValueOnce(mockWalkInSale);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_walkin_003',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Anonymous Walk-in')).toBeInTheDocument();
      });
    });
  });

  describe('3. Lifecycle-Aware Cancellation Controls (Req 9)', () => {
    it('offers cancellation button on eligible DRAFT or PENDING sales for authorized owner', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_draft_001' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockDraftSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_draft_001',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-btn')).toBeInTheDocument();
      });
    });

    it('hides cancellation button on settled PAID sales (ineligible transition)', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_paid_002' });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPaidSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_paid_002',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-page')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('cancel-sale-btn')).not.toBeInTheDocument();
    });
  });

  describe('4. Loading, Empty, Error, and Recovery States (Req 10)', () => {
    it('renders loading skeleton while query is in flight', () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_loading' });
      (salesApi.getSaleById as jest.Mock).mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_loading',
        initialSessionOverride: mockOwnerUser,
      });

      expect(screen.getByTestId('sale-detail-loading')).toBeInTheDocument();
    });

    it('renders not-found empty view when sale does not exist (404)', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_non_existent' });
      const notFoundErr = new Error('Sale not found');
      (notFoundErr as unknown as { status: number }).status = 404;
      (salesApi.getSaleById as jest.Mock).mockRejectedValueOnce(notFoundErr);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_non_existent',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Sale Agreement Not Found')).toBeInTheDocument();
      });
    });

    it('renders recoverable error view with retry action on server failure (500)', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_err_500' });
      const serverErr = new Error('Internal Server Error');
      (serverErr as unknown as { status: number }).status = 500;
      (salesApi.getSaleById as jest.Mock).mockRejectedValueOnce(serverErr);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: '/sales/sale_err_500',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-error')).toBeInTheDocument();
        expect(screen.getByText(/Failed to load sale agreement/i)).toBeInTheDocument();
      });

      // Retry button is available
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('5. Unified Sales Ledger Filtering & Search (Req 7)', () => {
    it('retrieves and displays sales list with URL-driven search', async () => {
      const mockSummary: SaleSummaryDTO = {
        id: 'sale_sum_001',
        tenantId: 'tenant_main',
        clientId: 'client_pt_88',
        currency: 'USD',
        status: 'PAID',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'kine_101',
        },
        subtotal: { amount: 100, currency: 'USD' },
        subtotalAmount: 100,
        discountTotal: { amount: 0, currency: 'USD' },
        discountTotalAmount: 0,
        total: { amount: 100, currency: 'USD' },
        totalAmount: 100,
        itemCount: 1,
        createdAt: '2026-10-19T09:30:00.000Z',
        updatedAt: '2026-10-19T10:00:00.000Z',
        completedAt: '2026-10-19T10:00:00.000Z',
        cancelledAt: null,
      };

      (salesApi.listSales as jest.Mock).mockResolvedValueOnce({
        items: [mockSummary],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      renderWithProviders(<SalesListPage />, {
        queryClient,
        initialRoute: '/sales/list?q=kine',
        initialSessionOverride: mockOwnerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sales-list-page')).toBeInTheDocument();
      });

      expect(salesApi.listSales).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'kine',
        }),
      );
    });
  });
});
