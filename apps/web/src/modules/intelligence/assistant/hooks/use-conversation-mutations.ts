import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import { useResolvedConversationScope, type QueryScopeOptions } from './use-conversation-queries';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  ReserveTurnRequest,
  ReserveTurnResponse,
  UpdateConversationTitleRequest,
  UpdateTitleResponse,
  ArchiveConversationResponse,
  ConversationDetailResponse,
  ConversationListResponse,
} from '../types/conversation-contract.types';

/**
 * Options for configuring conversation mutation hooks.
 */
export interface UseConversationMutationOptions<TData, TVariables> extends QueryScopeOptions {
  readonly onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  readonly onError?: (error: Error, variables: TVariables) => void | Promise<void>;
  readonly onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
  ) => void | Promise<void>;
}

/**
 * Custom TanStack Query Hook: Mutation for creating a new persistent conversation.
 *
 * Automatically invalidates conversation list caches on success.
 */
export function useCreatePersistentConversationMutation(
  options?: UseConversationMutationOptions<CreateConversationResponse, CreateConversationRequest>,
): UseMutationResult<CreateConversationResponse, Error, CreateConversationRequest> {
  const queryClient = useQueryClient();
  const scope = useResolvedConversationScope(options?.scope);

  return useMutation({
    mutationFn: (request: CreateConversationRequest) => conversationApi.createConversation(request),
    onSuccess: async (data, variables) => {
      await conversationCachePolicies.invalidateConversationLists(queryClient, scope);
      if (options?.onSuccess) {
        await options.onSuccess(data, variables);
      }
    },
    onError: (error, variables) => {
      if (options?.onError) {
        void options.onError(error, variables);
      }
    },
    onSettled: (data, error, variables) => {
      if (options?.onSettled) {
        void options.onSettled(data, error, variables);
      }
    },
  });
}

/** Alias for useCreatePersistentConversationMutation */
export const useCreateConversationMutation = useCreatePersistentConversationMutation;

/**
 * Variables for updating a conversation title.
 */
export interface RenameConversationVariables {
  readonly conversationId: string;
  readonly request: UpdateConversationTitleRequest;
}

/**
 * Mutation context for optimistic rollback during conversation title renaming.
 */
export interface RenameConversationContext {
  readonly previousDetail?: ConversationDetailResponse;
  readonly previousLists?: Array<[readonly unknown[], ConversationListResponse | undefined]>;
}

/**
 * Custom TanStack Query Hook: Mutation for renaming an active conversation.
 *
 * Implements safe optimistic updates:
 * - Immediately updates detail cache and list summaries with the pending title.
 * - Snapshots previous state and rolls back automatically if the API request fails.
 * - Reconciles with the authoritative backend response title and timestamp on success.
 * - Invalidates affected query keys on settlement to ensure canonical consistency.
 */
export function useRenameConversationMutation(
  options?: UseConversationMutationOptions<UpdateTitleResponse, RenameConversationVariables>,
): UseMutationResult<
  UpdateTitleResponse,
  Error,
  RenameConversationVariables,
  RenameConversationContext
> {
  const queryClient = useQueryClient();
  const scope = useResolvedConversationScope(options?.scope);

  return useMutation<
    UpdateTitleResponse,
    Error,
    RenameConversationVariables,
    RenameConversationContext
  >({
    mutationFn: ({ conversationId, request }: RenameConversationVariables) =>
      conversationApi.updateTitle(conversationId, request),
    onMutate: async ({ conversationId, request }) => {
      // 1. Cancel outgoing queries to prevent overwriting optimistic state
      await queryClient.cancelQueries({
        queryKey: conversationQueryKeys.detail(conversationId, scope),
      });
      await queryClient.cancelQueries({
        queryKey: conversationQueryKeys.lists(scope),
      });

      // 2. Snapshot current caches for rollback
      const previousDetail = queryClient.getQueryData<ConversationDetailResponse>(
        conversationQueryKeys.detail(conversationId, scope),
      );
      const previousLists = queryClient.getQueriesData<ConversationListResponse>({
        queryKey: conversationQueryKeys.lists(scope),
      });

      const optimisticTitle = request.title.trim();

      // 3. Optimistically update detail cache if present
      if (previousDetail) {
        queryClient.setQueryData<ConversationDetailResponse>(
          conversationQueryKeys.detail(conversationId, scope),
          {
            ...previousDetail,
            title: optimisticTitle,
          },
        );
      }

      // 4. Optimistically update list caches
      queryClient.setQueriesData<ConversationListResponse>(
        { queryKey: conversationQueryKeys.lists(scope) },
        (previous) => {
          if (!previous?.items) return previous;
          return {
            ...previous,
            items: previous.items.map((item) =>
              item.id === conversationId ? { ...item, title: optimisticTitle } : item,
            ),
          };
        },
      );

      return { previousDetail, previousLists };
    },
    onError: (error, variables, context) => {
      // Rollback detail cache to snapshot
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(
          conversationQueryKeys.detail(variables.conversationId, scope),
          context.previousDetail,
        );
      }
      // Rollback all list query caches to snapshots
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
      if (options?.onError) {
        void options.onError(error, variables);
      }
    },
    onSuccess: async (data, variables) => {
      // Authoritative reconciliation
      conversationCachePolicies.updateConversationTitleInCache(
        queryClient,
        variables.conversationId,
        data.title,
        scope,
        data.updatedAt,
      );
      if (options?.onSuccess) {
        await options.onSuccess(data, variables);
      }
    },
    onSettled: async (data, error, variables) => {
      // Invalidate to guarantee canonical consistency
      await Promise.all([
        conversationCachePolicies.invalidateConversationLists(queryClient, scope),
        variables?.conversationId
          ? conversationCachePolicies.invalidateConversationDetail(
              queryClient,
              variables.conversationId,
              scope,
            )
          : Promise.resolve(),
      ]);
      if (options?.onSettled) {
        await options.onSettled(data, error, variables!);
      }
    },
  });
}

/**
 * Mutation context for optimistic rollback during conversation archival/deletion.
 */
export interface ArchiveConversationContext {
  readonly previousLists?: Array<[readonly unknown[], ConversationListResponse | undefined]>;
  readonly previousDetail?: ConversationDetailResponse;
}

/**
 * Custom TanStack Query Hook: Mutation for archiving (soft-deleting) a conversation.
 *
 * Implements safe optimistic deletion with snapshot rollback:
 * - Cancels in-flight detail, messages, and list queries.
 * - Optimistically removes conversation from list caches.
 * - Restores snapshot if backend call fails (e.g. 409 conflict while turn is generating).
 * - Purges detail and message caches and invalidates list queries on success.
 */
export function useArchiveConversationMutation(
  options?: UseConversationMutationOptions<ArchiveConversationResponse, string>,
): UseMutationResult<ArchiveConversationResponse, Error, string, ArchiveConversationContext> {
  const queryClient = useQueryClient();
  const scope = useResolvedConversationScope(options?.scope);

  return useMutation<ArchiveConversationResponse, Error, string, ArchiveConversationContext>({
    mutationFn: (conversationId: string) => conversationApi.archiveConversation(conversationId),
    onMutate: async (conversationId: string) => {
      // 1. Cancel in-flight queries
      await queryClient.cancelQueries({
        queryKey: conversationQueryKeys.detail(conversationId, scope),
      });
      await queryClient.cancelQueries({
        queryKey: conversationQueryKeys.messages(conversationId, scope),
      });
      await queryClient.cancelQueries({
        queryKey: conversationQueryKeys.lists(scope),
      });

      // 2. Snapshot current caches for rollback
      const previousDetail = queryClient.getQueryData<ConversationDetailResponse>(
        conversationQueryKeys.detail(conversationId, scope),
      );
      const previousLists = queryClient.getQueriesData<ConversationListResponse>({
        queryKey: conversationQueryKeys.lists(scope),
      });

      // 3. Optimistically filter conversation out of list caches
      queryClient.setQueriesData<ConversationListResponse>(
        { queryKey: conversationQueryKeys.lists(scope) },
        (previous) => {
          if (!previous?.items) return previous;
          return {
            ...previous,
            items: previous.items.filter((item) => item.id !== conversationId),
          };
        },
      );

      return { previousLists, previousDetail };
    },
    onError: (error, conversationId, context) => {
      // Rollback detail and lists if deletion fails
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(
          conversationQueryKeys.detail(conversationId, scope),
          context.previousDetail,
        );
      }
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
      if (options?.onError) {
        void options.onError(error, conversationId);
      }
    },
    onSuccess: async (data, conversationId) => {
      conversationCachePolicies.removeConversationFromCache(queryClient, conversationId, scope);
      if (options?.onSuccess) {
        await options.onSuccess(data, conversationId);
      }
    },
    onSettled: async (data, error, conversationId) => {
      await conversationCachePolicies.invalidateConversationLists(queryClient, scope);
      if (options?.onSettled) {
        await options.onSettled(data, error, conversationId!);
      }
    },
  });
}

/**
 * Variables for reserving a subsequent turn.
 */
export interface ReserveTurnVariables {
  readonly conversationId: string;
  readonly request: ReserveTurnRequest;
}

/**
 * Custom TanStack Query Hook: Mutation for reserving a subsequent turn.
 *
 * Informs detail and message history caches on turn completion.
 */
export function useReserveTurnMutation(
  options?: UseConversationMutationOptions<ReserveTurnResponse, ReserveTurnVariables>,
): UseMutationResult<ReserveTurnResponse, Error, ReserveTurnVariables> {
  const queryClient = useQueryClient();
  const scope = useResolvedConversationScope(options?.scope);

  return useMutation({
    mutationFn: ({ conversationId, request }: ReserveTurnVariables) =>
      conversationApi.reserveTurn(conversationId, request),
    onSuccess: async (data, variables) => {
      await conversationCachePolicies.invalidateEntireConversation(
        queryClient,
        variables.conversationId,
        scope,
      );
      if (options?.onSuccess) {
        await options.onSuccess(data, variables);
      }
    },
    onError: (error, variables) => {
      if (options?.onError) {
        void options.onError(error, variables);
      }
    },
    onSettled: (data, error, variables) => {
      if (options?.onSettled) {
        void options.onSettled(data, error, variables);
      }
    },
  });
}
