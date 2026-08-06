import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleActivityBookmark } from './dashboard-api';
import { dashboardKeys } from './dashboard-query-keys';
import type { DashboardActivity } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Bookmark Toggle Mutation
//
// Demonstrates the full optimistic mutation workflow (ADR-FE-0003, ADR-FE-0020):
//  1. Cancel outgoing refetches on the activities cache key
//  2. Snapshot the previous activities array
//  3. Apply an optimistic toggle to the cache immediately
//  4. POST to the API
//  5a. On success → invalidate activities so next render is authoritative
//  5b. On error   → restore previous snapshot (deterministic rollback)
// ─────────────────────────────────────────────────────────────────────────────

interface BookmarkMutationInput {
  /** Activity ID to toggle */
  id: string;
  /** New desired bookmark state */
  bookmarked: boolean;
}

interface BookmarkMutationContext {
  previousActivities: readonly DashboardActivity[] | undefined;
}

/**
 * useToggleActivityBookmarkMutation
 *
 * Optimistically toggles the `bookmarked` flag on a dashboard activity.
 * Rollback is automatic on network failure.
 *
 * Usage:
 * ```tsx
 * const { mutate: bookmark } = useToggleActivityBookmarkMutation();
 * bookmark({ id: activity.id, bookmarked: !activity.bookmarked });
 * ```
 */
export function useToggleActivityBookmarkMutation() {
  const queryClient = useQueryClient();
  const activitiesKey = dashboardKeys.activities();

  return useMutation<
    { id: string; bookmarked: boolean },
    Error,
    BookmarkMutationInput,
    BookmarkMutationContext
  >({
    mutationFn: ({ id, bookmarked }) => toggleActivityBookmark(id, bookmarked),

    // ── Phase 1: Optimistic Update ──────────────────────────────────────────
    onMutate: async ({ id, bookmarked }) => {
      // 1. Cancel any in-flight refetches to avoid overwriting optimistic state
      await queryClient.cancelQueries({ queryKey: activitiesKey });

      // 2. Snapshot previous value for deterministic rollback
      const previousActivities =
        queryClient.getQueryData<readonly DashboardActivity[]>(activitiesKey);

      // 3. Apply optimistic update to the cache
      queryClient.setQueryData<readonly DashboardActivity[]>(activitiesKey, (old) => {
        if (!old) return old;
        return old.map((activity) => (activity.id === id ? { ...activity, bookmarked } : activity));
      });

      return { previousActivities };
    },

    // ── Phase 2a: Error → Rollback ──────────────────────────────────────────
    onError: (_error, _vars, context) => {
      if (context?.previousActivities !== undefined) {
        queryClient.setQueryData<readonly DashboardActivity[]>(
          activitiesKey,
          context.previousActivities,
        );
      }
    },

    // ── Phase 2b: Settled → Invalidate (ensures cache is authoritative) ─────
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: activitiesKey });
    },
  });
}
