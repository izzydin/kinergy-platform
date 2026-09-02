import { useMemo } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { ListStockMovementsFilterParams } from '../types';

export type MovementFiltersState = Record<string, never>;

export function useMovementFilters() {
  const { state, actions } = useTableUrlState<MovementFiltersState>({
    paramNames: {
      page: 'movPage',
      limit: 'movLimit',
    },
    defaultLimit: 10,
    allowedLimits: [5, 10, 20, 50],
  });

  const queryParams: ListStockMovementsFilterParams = useMemo(() => {
    return {
      page: state.page,
      limit: state.limit,
    };
  }, [state.page, state.limit]);

  return {
    params: queryParams,
    page: state.page,
    limit: state.limit,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    resetFilters: actions.resetFilters,
  };
}
