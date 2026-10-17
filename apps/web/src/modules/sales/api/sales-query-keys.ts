import type { ListSalesQueryParams } from '../types/sales-query.types';
import type { ListPaymentsQueryParams } from '../types/payments.types';

/**
 * Authoritative TanStack Query Key Factory for Sales, Payments, and Receipts
 *
 * Guarantees precise cache targeting and invalidation following ADR-FE-0013.
 */
export const salesQueryKeys = {
  all: ['sales'] as const,

  // Sales Orders List Collection
  lists: () => [...salesQueryKeys.all, 'list'] as const,
  list: (params?: ListSalesQueryParams) => [...salesQueryKeys.lists(), params ?? {}] as const,

  // Single Sale Order Hierarchy
  details: () => [...salesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...salesQueryKeys.details(), id] as const,
  calculate: (id: string) => [...salesQueryKeys.detail(id), 'calculate'] as const,
  paymentsBySale: (saleId: string) => [...salesQueryKeys.detail(saleId), 'payments'] as const,

  // Receipts
  receipts: () => ['receipts'] as const,
  receiptBySale: (saleId: string) => [...salesQueryKeys.receipts(), 'sale', saleId] as const,
  receiptById: (receiptId: string) => [...salesQueryKeys.receipts(), 'id', receiptId] as const,

  // Standalone Payments Registry
  payments: {
    all: ['payments'] as const,
    lists: () => ['payments', 'list'] as const,
    list: (params?: ListPaymentsQueryParams) => ['payments', 'list', params ?? {}] as const,
    details: () => ['payments', 'detail'] as const,
    detail: (id: string) => ['payments', 'detail', id] as const,
  },
};
