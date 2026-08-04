import type { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { RootErrorBoundaryProvider } from './root-error-boundary-provider';
import { QueryProvider } from './query-provider';
import { RouterProvider } from './router-provider';
import { ThemeProvider } from './theme-provider';
import { ToastProvider } from './toast-provider';

export interface AppProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

/**
 * Application Provider Composition Root
 *
 * Enforces the authoritative Provider Hierarchy Order:
 * 1. RootErrorBoundaryProvider (Outermost: Catches uncaught runtime exceptions across all providers)
 * 2. QueryProvider              (Server State: Manages TanStack Query client & cache reset boundaries)
 * 3. ThemeProvider              (UI State: Manages visual theme HSL tokens & dark mode class)
 * 4. ToastProvider              (Notification State: Provides non-blocking alert context)
 * 5. RouterProvider             (URL Navigation: Provides browser routing context for views & links)
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children, queryClient }) => {
  return (
    <RootErrorBoundaryProvider>
      <QueryProvider queryClient={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <RouterProvider>{children}</RouterProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryProvider>
    </RootErrorBoundaryProvider>
  );
};
