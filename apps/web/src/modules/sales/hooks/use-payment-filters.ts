import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ListPaymentsQueryParams,
  PaymentMethod,
  PaymentStatus,
} from '../types/payments.types';
import { VALID_PAYMENT_METHODS, VALID_PAYMENT_STATUSES } from '../types/payments.types';

export interface UsePaymentFiltersReturn {
  readonly params: ListPaymentsQueryParams;
  readonly page: number;
  readonly limit: number;
  readonly sort?: string;
  readonly status?: PaymentStatus;
  readonly method?: PaymentMethod;
  readonly saleId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly isFiltered: boolean;

  readonly setPage: (page: number) => void;
  readonly setLimit: (limit: number) => void;
  readonly setSort: (sort?: string) => void;
  readonly setStatus: (status?: PaymentStatus | 'ALL') => void;
  readonly setMethod: (method?: PaymentMethod | 'ALL') => void;
  readonly setSaleId: (saleId?: string) => void;
  readonly setDateRange: (fromDate?: string, toDate?: string) => void;
  readonly resetFilters: () => void;
  readonly resetAll: () => void;
}

export function usePaymentFilters(): UsePaymentFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const limit = [10, 20, 50, 100].includes(rawLimit) ? rawLimit : 20;

  const sort = searchParams.get('sort') || 'createdAt.desc';

  const rawStatus = searchParams.get('status')?.toUpperCase() as PaymentStatus | undefined;
  const status = rawStatus && VALID_PAYMENT_STATUSES.includes(rawStatus) ? rawStatus : undefined;

  const rawMethod = searchParams.get('method')?.toUpperCase() as PaymentMethod | undefined;
  const method = rawMethod && VALID_PAYMENT_METHODS.includes(rawMethod) ? rawMethod : undefined;

  const saleId = searchParams.get('saleId') || undefined;
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;

  const isFiltered = Boolean(status || method || saleId || fromDate || toDate);

  const updateParams = useCallback(
    (updater: (prev: URLSearchParams) => URLSearchParams) => {
      setSearchParams((prev) => {
        const next = updater(new URLSearchParams(prev));
        return next;
      });
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (newPage: number) => {
      updateParams((prev) => {
        if (newPage <= 1) prev.delete('page');
        else prev.set('page', String(newPage));
        return prev;
      });
    },
    [updateParams],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      updateParams((prev) => {
        if (newLimit === 20) prev.delete('limit');
        else prev.set('limit', String(newLimit));
        prev.delete('page');
        return prev;
      });
    },
    [updateParams],
  );

  const setSort = useCallback(
    (newSort?: string) => {
      updateParams((prev) => {
        if (!newSort || newSort === 'createdAt.desc') prev.delete('sort');
        else prev.set('sort', newSort);
        return prev;
      });
    },
    [updateParams],
  );

  const setStatus = useCallback(
    (newStatus?: PaymentStatus | 'ALL') => {
      updateParams((prev) => {
        if (!newStatus || newStatus === 'ALL') prev.delete('status');
        else prev.set('status', newStatus);
        prev.delete('page');
        return prev;
      });
    },
    [updateParams],
  );

  const setMethod = useCallback(
    (newMethod?: PaymentMethod | 'ALL') => {
      updateParams((prev) => {
        if (!newMethod || newMethod === 'ALL') prev.delete('method');
        else prev.set('method', newMethod);
        prev.delete('page');
        return prev;
      });
    },
    [updateParams],
  );

  const setSaleId = useCallback(
    (newSaleId?: string) => {
      updateParams((prev) => {
        if (!newSaleId?.trim()) prev.delete('saleId');
        else prev.set('saleId', newSaleId.trim());
        prev.delete('page');
        return prev;
      });
    },
    [updateParams],
  );

  const setDateRange = useCallback(
    (newFrom?: string, newTo?: string) => {
      updateParams((prev) => {
        if (!newFrom) prev.delete('fromDate');
        else prev.set('fromDate', newFrom);

        if (!newTo) prev.delete('toDate');
        else prev.set('toDate', newTo);

        prev.delete('page');
        return prev;
      });
    },
    [updateParams],
  );

  const resetFilters = useCallback(() => {
    updateParams((prev) => {
      prev.delete('status');
      prev.delete('method');
      prev.delete('saleId');
      prev.delete('fromDate');
      prev.delete('toDate');
      prev.delete('page');
      return prev;
    });
  }, [updateParams]);

  const resetAll = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const params: ListPaymentsQueryParams = useMemo(
    () => ({
      page,
      limit,
      sort,
      status,
      method,
      saleId,
      fromDate,
      toDate,
    }),
    [page, limit, sort, status, method, saleId, fromDate, toDate],
  );

  return {
    params,
    page,
    limit,
    sort,
    status,
    method,
    saleId,
    fromDate,
    toDate,
    isFiltered,
    setPage,
    setLimit,
    setSort,
    setStatus,
    setMethod,
    setSaleId,
    setDateRange,
    resetFilters,
    resetAll,
  };
}
