import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import { StockMovementType, type ListStockMovementsFilterParams } from '../types';

export interface MovementFiltersState {
  readonly movementType?: StockMovementType;
}

/**
 * URL-driven filter and pagination state hook for the stock movement ledger.
 * Synchronizes movementType, page, and limit with URLSearchParams.
 */
export function useMovementFilters() {
  const { state, actions } = useTableUrlState<MovementFiltersState>({
    paramNames: {
      page: 'page',
      limit: 'limit',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
    filterParsers: {
      movementType: (val) => (val as StockMovementType) || undefined,
    },
    filterSerializers: {
      movementType: (val) => val ?? undefined,
    },
  });

  const queryParams: ListStockMovementsFilterParams = useMemo(() => {
    return {
      movementType: state.filters.movementType,
      page: state.page,
      limit: state.limit,
    };
  }, [state.filters.movementType, state.page, state.limit]);

  return {
    params: queryParams,
    movementType: state.filters.movementType,
    page: state.page,
    limit: state.limit,
    isFiltered: Boolean(state.filters.movementType),
    setMovementType: (type?: StockMovementType) => actions.setFilter('movementType', type),
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    resetFilters: actions.resetFilters,
  };
}
