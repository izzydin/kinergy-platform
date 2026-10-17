import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSalesList,
  useSaleDetail,
  useCreateSale,
  useFinalizeSale,
  useRecordPayment,
} from '../hooks';
import { salesApi } from '../api';
import { NotificationProvider } from '../../../app/providers/notification-provider';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest.fn(),
    getSaleById: jest.fn(),
    listPayments: jest.fn(),
    createSale: jest.fn(),
    finalizeSale: jest.fn(),
    recordPayment: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    ),
  };
}

describe('Sales Queries & Mutations Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('useSalesList fetches paginated sales data', async () => {
    (salesApi.listSales as jest.Mock).mockResolvedValueOnce({
      items: [{ id: 'sale_1', status: 'DRAFT', totalAmount: 50.0 }],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSalesList({ page: 1, limit: 20 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items?.[0]?.id).toBe('sale_1');
  });

  it('useSaleDetail fetches individual sale by ID', async () => {
    (salesApi.getSaleById as jest.Mock).mockResolvedValueOnce({
      id: 'sale_target',
      status: 'PAID',
      subtotalAmount: 100,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaleDetail('sale_target'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe('sale_target');
    expect(result.current.data?.status).toBe('PAID');
  });

  it('useCreateSale triggers API, invalidates queries, and updates state', async () => {
    (salesApi.createSale as jest.Mock).mockResolvedValueOnce({
      id: 'sale_newly_created',
      status: 'DRAFT',
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        input: { currency: 'USD', items: [] },
      });
    });

    expect(salesApi.createSale).toHaveBeenCalledWith({ currency: 'USD', items: [] }, undefined);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sales', 'list'] });
  });

  it('useFinalizeSale transitions status and invalidates sale detail cache', async () => {
    (salesApi.finalizeSale as jest.Mock).mockResolvedValueOnce({
      id: 'sale_final',
      status: 'PENDING_PAYMENT',
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useFinalizeSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('sale_final');
    });

    expect(salesApi.finalizeSale).toHaveBeenCalledWith('sale_final');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sales', 'detail', 'sale_final'] });
  });

  it('useRecordPayment invalidates both sale and payment caches', async () => {
    (salesApi.recordPayment as jest.Mock).mockResolvedValueOnce({
      id: 'pay_rec',
      saleId: 'sale_target',
      amountValue: 50,
      status: 'COMPLETED',
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRecordPayment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        saleId: 'sale_target',
        input: { method: 'CASH', amount: 50 },
      });
    });

    expect(salesApi.recordPayment).toHaveBeenCalledWith('sale_target', {
      method: 'CASH',
      amount: 50,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['sales', 'detail', 'sale_target', 'payments'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['sales', 'detail', 'sale_target'],
    });
  });
});
