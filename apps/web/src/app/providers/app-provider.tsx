import type { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { SlotProvider } from '../../shared/ui/slots';
import { BreadcrumbProvider } from '../breadcrumbs';
import { NavigationProvider } from '../navigation';
import { AuthProvider } from './auth-provider';
import { FeatureFlagProvider } from './feature-flag-provider';
import { LocaleProvider } from './locale-provider';
import { NotificationProvider } from './notification-provider';
import { QueryProvider } from './query-provider';
import { RootErrorBoundaryProvider } from './root-error-boundary-provider';
import { RouterProvider } from './router-provider';
import { ThemeProvider } from './theme-provider';

export interface AppProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

/**
 * Application Provider Composition Root
 *
 * Master Provider Hierarchy Ordering:
 * 1. RootErrorBoundaryProvider (Outermost: Prevents application crashes from unhandled runtime errors)
 * 2. QueryProvider              (Server State: TanStack Query client & cache reset boundary)
 * 3. ThemeProvider              (UI Visual State: HSL tokens & dark mode class management)
 * 4. SlotProvider               (UI Portal Context: Teleportation architecture for layout slot injection)
 * 5. NotificationProvider       (Ephemeral Alerts: Toast & alert notification channel)
 * 6. AuthProvider               (Identity Context: User session & permission claims placeholder)
 * 7. LocaleProvider             (Localization: i18n multi-language locale placeholder)
 * 8. FeatureFlagProvider        (SaaS Feature Flags: Dynamic flag evaluation placeholder)
 * 9. RouterProvider             (Browser Navigation Context)
 * 10. NavigationProvider         (Navigation Framework & dynamic section registry)
 * 11. BreadcrumbProvider        (Innermost: Auto-generated route metadata breadcrumb context)
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children, queryClient }) => {
  return (
    <RootErrorBoundaryProvider>
      <QueryProvider queryClient={queryClient}>
        <ThemeProvider>
          <SlotProvider>
            <NotificationProvider>
              <AuthProvider>
                <LocaleProvider>
                  <FeatureFlagProvider>
                    <RouterProvider>
                      <NavigationProvider>
                        <BreadcrumbProvider>{children}</BreadcrumbProvider>
                      </NavigationProvider>
                    </RouterProvider>
                  </FeatureFlagProvider>
                </LocaleProvider>
              </AuthProvider>
            </NotificationProvider>
          </SlotProvider>
        </ThemeProvider>
      </QueryProvider>
    </RootErrorBoundaryProvider>
  );
};
