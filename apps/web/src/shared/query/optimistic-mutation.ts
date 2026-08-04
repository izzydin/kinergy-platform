import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface OptimisticContext<TData> {
  previousData: TData | undefined;
  queryKey: QueryKey;
}

/**
 * Optimistic Cache Update Infrastructure Helper
 *
 * Executes the standard 3-phase optimistic mutation workflow (ADR-FE-0003 & API ADR):
 * 1. Cancels outgoing refetches on target query keys.
 * 2. Snapshots previous cache state for deterministic rollback.
 * 3. Applies optimistic data update to the query cache.
 *
 * @param queryClient Active QueryClient instance
 * @param queryKey Target query key to optimistically mutate
 * @param updater Transformation function converting previous data into optimistic state
 */
export async function executeOptimisticUpdate<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (previousData: TData | undefined) => TData,
): Promise<OptimisticContext<TData>> {
  // 1. Cancel any outgoing refetches to prevent optimistic state overwrite
  await queryClient.cancelQueries({ queryKey });

  // 2. Snapshot the previous cache value
  const previousData = queryClient.getQueryData<TData>(queryKey);

  // 3. Optimistically update the cache with new value
  queryClient.setQueryData<TData>(queryKey, (old) => updater(old));

  // Return snapshot context for onError rollback
  return { previousData, queryKey };
}

/**
 * Deterministic Cache Rollback Helper
 *
 * Restores query cache to snapshot state captured prior to mutation execution.
 */
export function rollbackOptimisticUpdate<TData>(
  queryClient: QueryClient,
  context: OptimisticContext<TData> | undefined,
): void {
  if (context?.queryKey) {
    queryClient.setQueryData(context.queryKey, context.previousData);
  }
}
