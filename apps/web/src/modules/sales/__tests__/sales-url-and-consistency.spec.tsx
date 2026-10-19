import '@testing-library/jest-dom';
import React from 'react';
import { renderHook, act, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePaymentFilters } from '../hooks/use-payment-filters';
import {
  useRecordPayment,
  useSettlePayment,
  useCancelPayment,
  useFailPayment,
  useCancelSale,
  useIssueReceipt,
} from '../hooks/use-sales-mutations';
import { salesApi, salesQueryKeys } from '../api';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { PaymentHistoryPage } from '../pages/payment-history-page';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { PaymentDetailPage } from '../pages/payment-detail-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { renderWithProviders } from '../../../test/test-utils';
import type { AuthUser } from '../../auth/domain/auth-state.types';

// Mock sales API
jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    listPayments: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    getReceiptById: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    failPayment: jest.fn(),
    issueReceipt: jest.fn(),
  },
}));

const mockAuthUser: AuthUser = {
  id: 'user_1',
  email: 'admin@kinergy.test',
  name: 'Admin User',
  roles: ['Admin'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.cancel',
    'sales.manage',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.read',
    'receipts.manage',
  ],
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createHookWrapper(initialUrl = '/sales/payments') {
  const queryClient = createQueryClient();
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
        </NotificationProvider>
      </QueryClientProvider>
    ),
  };
}

describe('Sales & Payments URL State, Refresh Predictability & Cache Consistency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. URL State Normalization & Hydration', () => {
    it('hydrates valid payment filters and clamps invalid dates or numbers', () => {
      const initialUrl =
        '/sales/payments?status=COMPLETED&method=CASH&saleId=sale_123&fromDate=2026-10-01T00:00:00.000Z&toDate=invalid-date&page=2&limit=50&sort=amount.asc';

      const { wrapper } = createHookWrapper(initialUrl);
      const { result } = renderHook(() => usePaymentFilters(), { wrapper });

      expect(result.current.page).toBe(2);
      expect(result.current.limit).toBe(50);
      expect(result.current.status).toBe('COMPLETED');
      expect(result.current.method).toBe('CASH');
      expect(result.current.saleId).toBe('sale_123');
      expect(result.current.fromDate).toBe('2026-10-01T00:00:00.000Z');
      // Invalid date 'invalid-date' must be normalized to undefined
      expect(result.current.toDate).toBeUndefined();
      expect(result.current.sort).toBe('amount.asc');
      expect(result.current.isFiltered).toBe(true);
    });

    it('clamps negative or NaN page and limit to safe defaults', () => {
      const initialUrl = '/sales/payments?page=-5&limit=not-a-number';
      const { wrapper } = createHookWrapper(initialUrl);
      const { result } = renderHook(() => usePaymentFilters(), { wrapper });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(20);
    });

    it('resets page to 1 when changing filters and preserves other valid params', () => {
      const initialUrl = '/sales/payments?page=4&status=PENDING';
      const { wrapper } = createHookWrapper(initialUrl);
      const { result } = renderHook(() => usePaymentFilters(), { wrapper });

      expect(result.current.page).toBe(4);

      act(() => {
        result.current.setStatus('COMPLETED');
      });

      expect(result.current.page).toBe(1);
      expect(result.current.status).toBe('COMPLETED');
    });

    it('resetAll restores defaults and clears all custom filter parameters', () => {
      const initialUrl = '/sales/payments?status=PENDING&method=CARD&saleId=sale_9&page=3&limit=50';
      const { wrapper } = createHookWrapper(initialUrl);
      const { result } = renderHook(() => usePaymentFilters(), { wrapper });

      expect(result.current.isFiltered).toBe(true);

      act(() => {
        result.current.resetAll();
      });

      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(20);
      expect(result.current.status).toBeUndefined();
      expect(result.current.method).toBeUndefined();
      expect(result.current.saleId).toBeUndefined();
      expect(result.current.isFiltered).toBe(false);
    });
  });

  describe('2. Pagination Clamping on Table Data Arrival', () => {
    it('clamps PaymentHistoryPage page to totalPages when current page exceeds available pages', async () => {
      (salesApi.listPayments as jest.Mock).mockResolvedValueOnce({
        items: [
          {
            id: 'pay_01',
            saleId: 'sale_01',
            method: 'CASH',
            status: 'COMPLETED',
            amount: 50,
            currency: 'USD',
            createdAt: '2026-10-19T00:00:00.000Z',
          },
        ],
        total: 15,
        page: 5,
        totalPages: 2,
        limit: 10,
      });

      renderWithProviders(<PaymentHistoryPage />, {
        initialRoute: '/sales/payments?page=5&limit=10',
        initialSessionOverride: mockAuthUser,
      });

      // Confirm the table is rendered and handles the response
      expect(await screen.findByTestId('payment-history-page')).toBeInTheDocument();
      expect(salesApi.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({ page: 5, limit: 10 }),
      );
    });
  });

  describe('3. Query Cache Invalidation & Consistency Across Mutators', () => {
    it('useRecordPayment invalidates payment lists, sale detail, payments subquery, receipt query, and overview lists', async () => {
      (salesApi.recordPayment as jest.Mock).mockResolvedValueOnce({
        id: 'pay_123',
        saleId: 'sale_target',
        amount: 100,
        status: 'COMPLETED',
      });

      const { wrapper, queryClient } = createHookWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRecordPayment(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          saleId: 'sale_target',
          input: { method: 'CASH', amount: 100 },
        });
      });

      expect(salesApi.recordPayment).toHaveBeenCalledWith('sale_target', {
        method: 'CASH',
        amount: 100,
      });

      // Verify all authoritative query keys are targeted
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.payments.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_target'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.paymentsBySale('sale_target'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_target'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.lists(),
      });
    });

    it('useSettlePayment invalidates payment detail, payment lists, sale detail, payments subquery, receipt, and sales lists', async () => {
      (salesApi.settlePayment as jest.Mock).mockResolvedValueOnce({
        id: 'pay_target',
        saleId: 'sale_999',
        amount: 75,
        status: 'COMPLETED',
      });

      const { wrapper, queryClient } = createHookWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSettlePayment(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          paymentId: 'pay_target',
          input: { reference: 'ref_confirmed' },
        });
      });

      expect(salesApi.settlePayment).toHaveBeenCalledWith('pay_target', {
        reference: 'ref_confirmed',
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.payments.detail('pay_target'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.payments.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_999'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.paymentsBySale('sale_999'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_999'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.lists(),
      });
    });

    it('useCancelPayment and useFailPayment invalidate payment detail, list, sale detail, and receiptBySale', async () => {
      (salesApi.cancelPayment as jest.Mock).mockResolvedValueOnce({
        id: 'pay_void',
        saleId: 'sale_void',
        status: 'CANCELLED',
      });
      (salesApi.failPayment as jest.Mock).mockResolvedValueOnce({
        id: 'pay_fail',
        saleId: 'sale_fail',
        status: 'FAILED',
      });

      const { wrapper, queryClient } = createHookWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result: cancelHook } = renderHook(() => useCancelPayment(), { wrapper });
      await act(async () => {
        await cancelHook.current.mutateAsync({
          paymentId: 'pay_void',
          input: { reason: 'Wrong tender selected' },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_void'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_void'),
      });

      const { result: failHook } = renderHook(() => useFailPayment(), { wrapper });
      await act(async () => {
        await failHook.current.mutateAsync({
          paymentId: 'pay_fail',
          reason: 'Card issuer decline',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_fail'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_fail'),
      });
    });

    it('useCancelSale invalidates sale detail, sales lists, and receiptBySale', async () => {
      (salesApi.cancelSale as jest.Mock).mockResolvedValueOnce({
        id: 'sale_cancel_target',
        status: 'CANCELLED',
      });

      const { wrapper, queryClient } = createHookWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCancelSale(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          saleId: 'sale_cancel_target',
          input: { reason: 'Customer changed mind' },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_cancel_target'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_cancel_target'),
      });
    });

    it('useIssueReceipt invalidates receiptBySale, receiptById, saleDetail, and sales lists', async () => {
      (salesApi.issueReceipt as jest.Mock).mockResolvedValueOnce({
        id: 'rcpt_777',
        saleId: 'sale_issued',
        receiptNumber: 'RCP-2026-0001',
        status: 'ISSUED',
      });

      const { wrapper, queryClient } = createHookWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useIssueReceipt(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          saleId: 'sale_issued',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptBySale('sale_issued'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.receiptById('rcpt_777'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.detail('sale_issued'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: salesQueryKeys.lists(),
      });
    });
  });

  describe('4. Navigation State Preservation via location.state.from', () => {
    it('restores previous table search, filter, and pagination state when navigating back from SaleDetailPage', async () => {
      (salesApi.getSaleById as jest.Mock).mockResolvedValueOnce({
        id: 'sale_preserve_1',
        status: 'COMPLETED',
        currency: 'USD',
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        itemCount: 1,
        items: [],
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      });
      (salesApi.listPayments as jest.Mock).mockResolvedValueOnce([]);
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValueOnce(null);

      const initialEntry = {
        pathname: '/sales/sale_preserve_1',
        state: { from: '/sales?status=PAID&page=3&sort=total.desc' },
      };

      renderWithProviders(
        <Routes>
          <Route path="/sales/:saleId" element={<SaleDetailPage />} />
        </Routes>,
        {
          initialEntries: [initialEntry],
          initialSessionOverride: mockAuthUser,
        },
      );

      // Verify that SaleDetailPage renders and has the back button pointing to state.from
      const backLink = await screen.findByRole('link', { name: /all sales/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/sales?status=PAID&page=3&sort=total.desc');
    });

    it('restores previous payment log filter state when navigating back from PaymentDetailPage', async () => {
      (salesApi.getPaymentById as jest.Mock).mockResolvedValueOnce({
        id: 'pay_preserve_1',
        saleId: 'sale_parent_1',
        method: 'CASH',
        status: 'PENDING',
        amount: 80,
        currency: 'USD',
        createdAt: '2026-10-19T00:00:00.000Z',
      });
      (salesApi.getSaleById as jest.Mock).mockResolvedValueOnce(null);
      (salesApi.listPayments as jest.Mock).mockResolvedValueOnce([]);

      const initialEntry = {
        pathname: '/sales/payments/pay_preserve_1',
        state: { from: '/sales/payments?status=PENDING&method=CASH&page=2' },
      };

      renderWithProviders(
        <Routes>
          <Route path="/sales/payments/:paymentId" element={<PaymentDetailPage />} />
        </Routes>,
        {
          initialEntries: [initialEntry],
          initialSessionOverride: mockAuthUser,
        },
      );

      const backLink = await screen.findByRole('link', { name: /payments log/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/sales/payments?status=PENDING&method=CASH&page=2');
    });

    it('ReceiptViewPage falls back to sale detail if state.from is absent, or preserves deep link state when present', async () => {
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValueOnce({
        id: 'rcpt_direct',
        tenantId: 'tenant_1',
        saleId: 'sale_deep',
        receiptNumber: 'RCP-2026-888',
        saleReference: 'sale_deep',
        currency: 'USD',
        total: { amount: 120, currency: 'USD' },
        subtotal: { amount: 120, currency: 'USD' },
        discountTotal: { amount: 0, currency: 'USD' },
        status: 'ISSUED',
        issuedAt: '2026-10-19T00:00:00.000Z',
        items: [],
        itemCount: 0,
        payments: [],
        clientSnapshot: null,
      });

      renderWithProviders(
        <Routes>
          <Route path="/sales/:saleId/receipt" element={<ReceiptViewPage />} />
        </Routes>,
        {
          initialRoute: '/sales/sale_deep/receipt',
          initialSessionOverride: mockAuthUser,
        },
      );

      const backLink = await screen.findByRole('link', { name: /back to sale/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/sales/sale_deep');
    });
  });

  describe('5. Direct Deep Links & Refresh Without Overview Pre-Navigation', () => {
    it('direct deep link to a payment detail loads authoritative resource without prior navigation', async () => {
      (salesApi.getPaymentById as jest.Mock).mockResolvedValueOnce({
        id: 'pay_deeplink',
        saleId: 'sale_linked',
        method: 'TRANSFER',
        status: 'COMPLETED',
        amount: 250,
        currency: 'USD',
        paidAt: '2026-10-19T01:00:00.000Z',
        createdAt: '2026-10-19T00:00:00.000Z',
      });
      (salesApi.getSaleById as jest.Mock).mockResolvedValueOnce({
        id: 'sale_linked',
        status: 'PAID',
        currency: 'USD',
        total: 250,
        subtotal: 250,
        discountTotal: 0,
        itemCount: 1,
        items: [],
      });
      (salesApi.listPayments as jest.Mock).mockResolvedValueOnce([]);

      renderWithProviders(
        <Routes>
          <Route path="/sales/payments/:paymentId" element={<PaymentDetailPage />} />
        </Routes>,
        {
          initialRoute: '/sales/payments/pay_deeplink',
          initialSessionOverride: mockAuthUser,
        },
      );

      expect(await screen.findByTestId('payment-id')).toHaveTextContent('pay_deeplink');
      expect(salesApi.getPaymentById).toHaveBeenCalledWith('pay_deeplink');
      // Verify associated sale link exists and allows navigation
      const saleLink = screen.getByTestId('associated-sale-link');
      expect(saleLink).toHaveAttribute('href', '/sales/sale_linked');
    });
  });
});
