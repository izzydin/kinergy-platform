import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { useState } from 'react';
import { createQueryClient } from '../../shared/query/query-client.factory';
import { getAppConfig } from '../config/app-config';

interface QueryProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
  showDevtools?: boolean;
}

/**
 * TanStack Query Provider Component
 *
 * Configures the platform-wide QueryClient instance, default query/mutation options,
 * exponential backoff retry strategies, and QueryErrorResetBoundary.
 * Conditionally mounts ReactQueryDevtools in development environments.
 */
export const QueryProvider: React.FC<QueryProviderProps> = ({
  children,
  queryClient: customQueryClient,
  showDevtools,
}) => {
  const config = getAppConfig();
  const [queryClient] = useState(() => customQueryClient || createQueryClient());

  const shouldRenderDevtools = showDevtools ?? config.isDev;

  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>{() => children}</QueryErrorResetBoundary>
      {shouldRenderDevtools && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  );
};
