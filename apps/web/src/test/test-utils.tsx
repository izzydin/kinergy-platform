import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  AuthProvider,
  FeatureFlagProvider,
  LocaleProvider,
  NotificationProvider,
  ThemeProvider,
} from '../app/providers';
import { createQueryClient } from '../shared/query/query-client.factory';

export interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  initialRoute?: string;
  queryClient?: QueryClient;
}

/**
 * Custom Testing Library Render Wrapper
 *
 * Wraps target UI components in the complete shared provider stack for unit & integration testing.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    initialRoute = '/',
    queryClient = createQueryClient({ maxRetries: 0 }),
    ...renderOptions
  }: ExtendedRenderOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <NotificationProvider>
            <AuthProvider>
              <LocaleProvider>
                <FeatureFlagProvider>
                  <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
                </FeatureFlagProvider>
              </LocaleProvider>
            </AuthProvider>
          </NotificationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from '@testing-library/react';
