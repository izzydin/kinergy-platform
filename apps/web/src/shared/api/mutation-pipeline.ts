import { QueryKey, UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { notificationService } from '../../app/providers/notification-provider';
import { logger } from '../logger/platform-logger';
import { ApiError, RequestCanceledError, normalizeApiError } from './api-error';

export interface NotificationMessageConfig {
  title: string;
  description?: string;
}

export type SuccessNotificationOption<TData, TVariables> =
  | string
  | NotificationMessageConfig
  | ((data: TData, variables: TVariables) => string | NotificationMessageConfig);

export type ErrorNotificationOption<TError, TVariables> =
  | string
  | NotificationMessageConfig
  | ((error: TError, variables: TVariables) => string | NotificationMessageConfig);

export interface MutationNotificationConfig<TData, TVariables, TError = ApiError> {
  /** Success toast configuration or message generator */
  success?: SuccessNotificationOption<TData, TVariables>;
  /** Error toast configuration or message generator */
  error?: ErrorNotificationOption<TError, TVariables>;
  /** Disables automatic success toast notification */
  disableSuccessToast?: boolean;
  /** Disables automatic error toast notification */
  disableErrorToast?: boolean;
}

export interface OptimisticConfig<TVariables, TQueryData = unknown> {
  /** Target query key(s) affected by the optimistic update */
  queryKey: QueryKey | ((variables: TVariables) => QueryKey);
  /** Mutates current cache data to return the optimistic new state */
  update: (currentData: TQueryData | undefined, variables: TVariables) => TQueryData;
}

export interface StandardMutationOptions<
  TData = unknown,
  TVariables = void,
  TError = ApiError,
  TContext = unknown,
> {
  /** Transport execution function returning a Promise */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Query keys to automatically invalidate upon successful mutation */
  invalidates?: QueryKey[] | ((data: TData, variables: TVariables) => QueryKey[]);
  /** Opt-in optimistic cache update configuration */
  optimistic?: OptimisticConfig<TVariables, unknown>;

  /** Toast notification configuration for success and error events */
  notifications?: MutationNotificationConfig<TData, TVariables, TError>;
  /** Optional custom logger context name (defaults to 'StandardMutation') */
  loggerContext?: string;
  /** Callback fired before mutation execution */
  onMutate?: (variables: TVariables) => Promise<TContext | undefined> | TContext | undefined;
  /** Callback fired on successful mutation response */
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | void;
  /** Callback fired on mutation error failure */
  onError?: (
    error: TError,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | void;
  /** Callback fired when mutation completes (either success or error) */
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | void;
}

export interface PipelineContext<TContext> {
  userContext?: TContext;
  optimisticKey?: QueryKey;
  previousData?: unknown;
}

/**
 * Standard Application Mutation Hook (`shared/api/mutation-pipeline.ts`)
 *
 * Provides standardized lifecycle orchestration for asynchronous mutations:
 * - API execution & normalized error handling
 * - Automatic & opt-in cache updates / invalidations
 * - Opt-in optimistic updates with automatic rollback
 * - Toast notification dispatching (suppressing cancellation errors)
 * - Structured logger diagnostics
 */
export function useStandardMutation<
  TData = unknown,
  TVariables = void,
  TError extends ApiError = ApiError,
  TContext = unknown,
>(
  options: StandardMutationOptions<TData, TVariables, TError, TContext>,
): UseMutationResult<TData, TError, TVariables, PipelineContext<TContext>> {
  const queryClient = useQueryClient();
  const log = logger.withContext(options.loggerContext || 'StandardMutation');

  return useMutation<TData, TError, TVariables, PipelineContext<TContext>>({
    mutationFn: async (variables: TVariables): Promise<TData> => {
      try {
        return await options.mutationFn(variables);
      } catch (err) {
        throw normalizeApiError(err) as TError;
      }
    },

    onMutate: async (variables: TVariables): Promise<PipelineContext<TContext>> => {
      let previousData: unknown;
      let optimisticKey: QueryKey | undefined;

      // 1. Handle Opt-In Optimistic Update
      if (options.optimistic) {
        optimisticKey =
          typeof options.optimistic.queryKey === 'function'
            ? options.optimistic.queryKey(variables)
            : options.optimistic.queryKey;

        // Cancel outgoing queries for target key to prevent race conditions
        await queryClient.cancelQueries({ queryKey: optimisticKey });

        // Snapshot current cache data for rollback
        previousData = queryClient.getQueryData(optimisticKey);

        // Apply optimistic cache update
        const updateFn = options.optimistic.update;
        queryClient.setQueryData(optimisticKey, (oldData: unknown) => updateFn(oldData, variables));

        log.debug('Applied optimistic update', { queryKey: optimisticKey });
      }

      // 2. Execute user onMutate hook
      const userContext = options.onMutate ? await options.onMutate(variables) : undefined;

      return {
        userContext,
        optimisticKey,
        previousData,
      };
    },

    onSuccess: async (data: TData, variables: TVariables, context?: PipelineContext<TContext>) => {
      log.info('Mutation succeeded');

      // 1. Invalidate Target Query Keys
      if (options.invalidates) {
        const keysToInvalidate =
          typeof options.invalidates === 'function'
            ? options.invalidates(data, variables)
            : options.invalidates;

        for (const key of keysToInvalidate) {
          await queryClient.invalidateQueries({ queryKey: key });
        }
      }

      // 2. Success Toast Notification Dispatching
      if (!options.notifications?.disableSuccessToast && options.notifications?.success) {
        const conf = options.notifications.success;
        let title: string;
        let description: string | undefined;

        if (typeof conf === 'function') {
          const resolved = conf(data, variables);
          if (typeof resolved === 'string') {
            title = resolved;
          } else {
            title = resolved.title;
            description = resolved.description;
          }
        } else if (typeof conf === 'string') {
          title = conf;
        } else {
          title = conf.title;
          description = conf.description;
        }

        notificationService.success(title, description);
      }

      // 3. User onSuccess Callback
      if (options.onSuccess) {
        await options.onSuccess(data, variables, context?.userContext);
      }
    },

    onError: async (error: TError, variables: TVariables, context?: PipelineContext<TContext>) => {
      const normalizedError = normalizeApiError(error) as TError;

      log.warn('Mutation failed', {
        errorName: normalizedError.name,
        errorMessage: normalizedError.message,
      });

      // 1. Rollback Optimistic State if Applicable
      if (context?.optimisticKey) {
        queryClient.setQueryData(context.optimisticKey, context.previousData);
        // Ensure cache synchronization after failure
        await queryClient.invalidateQueries({ queryKey: context.optimisticKey });
        log.debug('Rolled back optimistic update and invalidated cache', {
          queryKey: context.optimisticKey,
        });
      }

      // 2. Toast Notification Dispatching (Suppress on Cancellation)
      const isCanceled = normalizedError instanceof RequestCanceledError;
      if (!isCanceled && !options.notifications?.disableErrorToast) {
        if (options.notifications?.error) {
          const conf = options.notifications.error;
          let title: string;
          let description: string | undefined;

          if (typeof conf === 'function') {
            const resolved = conf(normalizedError, variables);
            if (typeof resolved === 'string') {
              title = resolved;
            } else {
              title = resolved.title;
              description = resolved.description;
            }
          } else if (typeof conf === 'string') {
            title = conf;
          } else {
            title = conf.title;
            description = conf.description;
          }

          notificationService.error(title, description);
        } else {
          // Default error notification using formatNotificationError via notificationService
          notificationService.error(normalizedError);
        }
      }

      // 3. User onError Callback
      if (options.onError) {
        await options.onError(normalizedError, variables, context?.userContext);
      }
    },

    onSettled: async (
      data: TData | undefined,
      error: TError | null,
      variables: TVariables,
      context?: PipelineContext<TContext>,
    ) => {
      if (options.onSettled) {
        const normalizedError = error ? (normalizeApiError(error) as TError) : null;
        await options.onSettled(data, normalizedError, variables, context?.userContext);
      }
    },
  });
}
