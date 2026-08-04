import { QueryClient } from '@tanstack/react-query';
import { getAppConfig } from '../../app/config/app-config';

/**
 * Shared QueryClient Factory Function
 *
 * Constructs a TanStack QueryClient instance configured with the platform's
 * authoritative query and mutation defaults, retry policies, and caching strategy.
 */
export function createQueryClient(overrides?: {
  staleTimeMs?: number;
  gcTimeMs?: number;
  maxRetries?: number;
}): QueryClient {
  const appConfig = getAppConfig();

  const staleTime = overrides?.staleTimeMs ?? appConfig.queryDefaultStaleTimeMs;
  const gcTime = overrides?.gcTimeMs ?? 1000 * 60 * 10; // 10 minutes cache garbage collection
  const maxRetries = overrides?.maxRetries ?? appConfig.queryMaxRetries;

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime,
        gcTime,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: (failureCount, error: unknown) => {
          // Extract HTTP status code if error is structured
          const statusCode =
            error && typeof error === 'object' && 'statusCode' in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : undefined;

          // Rule 1: Do NOT retry 4xx Client Errors (400, 401, 403, 404)
          if (statusCode && statusCode >= 400 && statusCode < 500) {
            return false;
          }

          // Rule 2: Retry 5xx Server Errors & Network Failures up to maxRetries
          return failureCount < maxRetries;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff capped at 30s
      },
      mutations: {
        retry: false, // Rule: Mutations are non-idempotent by default; do not auto-retry
      },
    },
  });
}
