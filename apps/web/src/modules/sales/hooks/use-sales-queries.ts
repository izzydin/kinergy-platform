import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { salesApi, salesQueryKeys } from '../api';
import type { ListSalesQueryParams } from '../types/sales-query.types';
import type { ListPaymentsQueryParams } from '../types/payments.types';

/**
 * Retrieves paginated sales orders with multi-criteria URL state filtering
 */
export function useSalesList(params?: ListSalesQueryParams) {
  return useQuery({
    queryKey: salesQueryKeys.list(params),
    queryFn: () => salesApi.listSales(params),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: keepPreviousData,
  });
}

/**
 * Retrieves a single commercial sale aggregate by ID
 */
export function useSaleDetail(saleId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.detail(saleId ?? ''),
    queryFn: () => salesApi.getSaleById(saleId!),
    enabled: Boolean(saleId),
    staleTime: 15 * 1000,
  });
}

/**
 * Recalculates sale totals (subtotal, discounts, net total) without side effects
 */
export function useSaleTotals(saleId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.calculate(saleId ?? ''),
    queryFn: () => salesApi.calculateSaleTotals(saleId!),
    enabled: Boolean(saleId),
    staleTime: 10 * 1000,
  });
}

/**
 * Retrieves payment tenders recorded against a specific sale order
 */
export function useSalePayments(saleId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.paymentsBySale(saleId ?? ''),
    queryFn: () => salesApi.getSalePaymentHistory(saleId!),
    enabled: Boolean(saleId),
    staleTime: 15 * 1000,
  });
}

/**
 * Retrieves paginated payment transactions log
 */
export function usePaymentsList(params?: ListPaymentsQueryParams) {
  return useQuery({
    queryKey: salesQueryKeys.payments.list(params),
    queryFn: () => salesApi.listPayments(params),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Retrieves single payment transaction details
 */
export function usePaymentDetail(paymentId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.payments.detail(paymentId ?? ''),
    queryFn: () => salesApi.getPaymentById(paymentId!),
    enabled: Boolean(paymentId),
    staleTime: 15 * 1000,
  });
}

/**
 * Retrieves canonical receipt document for a settled sale order
 */
export function useReceiptBySale(saleId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.receiptBySale(saleId ?? ''),
    queryFn: () => salesApi.getReceiptBySale(saleId!),
    enabled: Boolean(saleId),
    staleTime: 60 * 1000,
    retry: false, // 404 indicates receipt not issued yet; do not retry unnecessarily
  });
}

/**
 * Retrieves receipt document directly by receipt UUID
 */
export function useReceiptDetail(receiptId: string | undefined) {
  return useQuery({
    queryKey: salesQueryKeys.receiptById(receiptId ?? ''),
    queryFn: () => salesApi.getReceiptById(receiptId!),
    enabled: Boolean(receiptId),
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * Composes bounded queries to deliver operational financial metrics for the Sales Overview
 * Resolves the backend aggregation gap deterministically without unbacked endpoints.
 */
export function useSalesOverviewMetrics() {
  const pendingPaymentsQuery = useSalesList({
    status: 'PENDING_PAYMENT',
    limit: 1,
    page: 1,
  });

  const draftsQuery = useSalesList({
    status: 'DRAFT',
    limit: 1,
    page: 1,
  });

  const settledSalesQuery = useSalesList({
    status: 'PAID',
    limit: 1,
    page: 1,
  });

  const recentSalesQuery = useSalesList({
    limit: 5,
    page: 1,
    sort: 'createdAt.desc',
  });

  const isLoading =
    pendingPaymentsQuery.isLoading ||
    draftsQuery.isLoading ||
    settledSalesQuery.isLoading ||
    recentSalesQuery.isLoading;

  const isError =
    pendingPaymentsQuery.isError ||
    draftsQuery.isError ||
    settledSalesQuery.isError ||
    recentSalesQuery.isError;

  return {
    isLoading,
    isError,
    pendingPaymentsCount: pendingPaymentsQuery.data?.total ?? 0,
    draftsCount: draftsQuery.data?.total ?? 0,
    settledSalesCount: settledSalesQuery.data?.total ?? 0,
    recentSales: recentSalesQuery.data?.items ?? [],
    refetchAll: () =>
      Promise.all([
        pendingPaymentsQuery.refetch(),
        draftsQuery.refetch(),
        settledSalesQuery.refetch(),
        recentSalesQuery.refetch(),
      ]),
  };
}
