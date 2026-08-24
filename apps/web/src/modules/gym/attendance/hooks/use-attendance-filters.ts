import { useMemo, useCallback } from 'react';
import { useTableUrlState } from '../../../../shared/table';
import type { TodayAttendanceFilterParams } from '../types';

export interface AttendanceFiltersState {
  readonly result?: string;
  readonly method?: string;
  readonly clientId?: string;
  readonly historyClientId?: string;
}

export function useAttendanceFilters() {
  const { state, actions } = useTableUrlState<AttendanceFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 15,
    allowedLimits: [10, 15, 25, 50],
    filterParsers: {
      result: (val) => val || undefined,
      method: (val) => val || undefined,
      clientId: (val) => val || undefined,
      historyClientId: (val) => val || undefined,
    },
    filterSerializers: {
      result: (val) => val ?? undefined,
      method: (val) => val ?? undefined,
      clientId: (val) => val ?? undefined,
      historyClientId: (val) => val ?? undefined,
    },
  });

  const queryParams: TodayAttendanceFilterParams = useMemo(() => {
    return {
      result: state.filters.result,
      method: state.filters.method,
      page: state.page,
      limit: state.limit,
    };
  }, [state.filters.result, state.filters.method, state.page, state.limit]);

  const setResultFilter = useCallback(
    (result?: string) => actions.setFilter('result', result),
    [actions],
  );

  const setMethodFilter = useCallback(
    (method?: string) => actions.setFilter('method', method),
    [actions],
  );

  const setClientId = useCallback(
    (clientId?: string) => actions.setFilter('clientId', clientId),
    [actions],
  );

  const setHistoryClientId = useCallback(
    (historyClientId?: string) => actions.setFilter('historyClientId', historyClientId),
    [actions],
  );

  return {
    params: queryParams,
    page: state.page,
    limit: state.limit,
    result: state.filters.result,
    method: state.filters.method,
    clientId: state.filters.clientId,
    historyClientId: state.filters.historyClientId,
    isFiltered: state.isFiltered,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setResultFilter,
    setMethodFilter,
    setClientId,
    setHistoryClientId,
    resetFilters: actions.resetFilters,
    resetAll: actions.resetAll,
  };
}
