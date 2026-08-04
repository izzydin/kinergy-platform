/**
 * Generic Hierarchical Query Key Factory
 *
 * Enforces the Query Key Factory Pattern (ADR-FE-0018) across all feature modules.
 * Standardizes query key generation to prevent string key collisions and guarantee
 * deterministic cache invalidation.
 */
export interface StandardQueryKeys<TFilter = Record<string, unknown>, TId = string> {
  all: readonly [string];
  lists: () => readonly [string, 'list'];
  list: (filters?: TFilter) => readonly [string, 'list', { filters: TFilter | undefined }];
  details: () => readonly [string, 'detail'];
  detail: (id: TId) => readonly [string, 'detail', TId];
  custom: <TScope extends string>(
    scope: TScope,
    ...args: unknown[]
  ) => readonly [string, TScope, ...unknown[]];
}

/**
 * Creates a domain-scoped Query Key Factory.
 *
 * @param domain Domain feature name (e.g. 'clients', 'energy', 'analytics')
 */
export function createQueryKeyFactory<TFilter = Record<string, unknown>, TId = string>(
  domain: string,
): StandardQueryKeys<TFilter, TId> {
  const all = [domain] as const;

  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (filters?: TFilter) => [...all, 'list', { filters }] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: TId) => [...all, 'detail', id] as const,
    custom: <TScope extends string>(scope: TScope, ...args: unknown[]) =>
      [...all, scope, ...args] as const,
  };
}
