import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import React, { useState } from 'react';
import { getAppConfig } from '../config/app-config';

interface QueryProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({
  children,
  queryClient: customQueryClient,
}) => {
  const config = getAppConfig();

  const [queryClient] = useState(
    () =>
      customQueryClient ||
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: config.queryDefaultStaleTimeMs,
            refetchOnWindowFocus: false,
            retry: (failureCount, error: unknown) => {
              // Extract status code from error object if present
              const statusCode =
                error && typeof error === 'object' && 'statusCode' in error
                  ? Number((error as { statusCode?: unknown }).statusCode)
                  : undefined;

              // Do not retry 4xx client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found)
              if (statusCode && statusCode >= 400 && statusCode < 500) {
                return false;
              }

              // Retry 5xx server or network errors up to max retries
              return failureCount < config.queryMaxRetries;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff capped at 30s
          },
          mutations: {
            retry: false, // Mutations are non-idempotent by default; do not retry automatically
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>{() => children}</QueryErrorResetBoundary>
    </QueryClientProvider>
  );
};
