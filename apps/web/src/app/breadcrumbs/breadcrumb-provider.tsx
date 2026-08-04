import React, { createContext, useContext, useMemo, useState } from 'react';
import { useLocation, useMatches } from 'react-router-dom';
import { useNavigation } from '../navigation';
import { BreadcrumbGenerator } from './breadcrumb-generator';
import type { BreadcrumbContextState, BreadcrumbItem } from './breadcrumb.types';

const BreadcrumbContext = createContext<BreadcrumbContextState | undefined>(undefined);

export interface BreadcrumbProviderProps {
  children: React.ReactNode;
  homeLabel?: string;
  homePath?: string;
}

/**
 * Safe wrapper for React Router `useMatches()`
 * Prevents runtime exceptions when running under standard `<BrowserRouter>` vs Data Routers.
 */
const useSafeMatches = () => {
  try {
    return useMatches();
  } catch {
    return [];
  }
};

/**
 * Breadcrumb Provider Component
 *
 * Automatically computes breadcrumbs from route metadata, navigation registry configuration,
 * and current URL location. Provides runtime custom breadcrumb override capabilities.
 */
export const BreadcrumbProvider: React.FC<BreadcrumbProviderProps> = ({
  children,
  homeLabel = 'Dashboard',
  homePath = '/',
}) => {
  const location = useLocation();
  const matches = useSafeMatches();
  const { items: navigationItems } = useNavigation();

  // Allow dynamic runtime overrides (e.g. detailed entity names set by sub-views)
  const [customBreadcrumbs, setCustomBreadcrumbs] = useState<BreadcrumbItem[] | null>(null);

  // Re-generate breadcrumbs whenever location or matches update
  const breadcrumbs = useMemo(() => {
    if (customBreadcrumbs) {
      return customBreadcrumbs;
    }

    return BreadcrumbGenerator.generate({
      pathname: location.pathname,
      matches,
      navigationItems,
      homeLabel,
      homePath,
    });
  }, [customBreadcrumbs, location.pathname, matches, navigationItems, homeLabel, homePath]);

  return (
    <BreadcrumbContext.Provider
      value={{
        breadcrumbs,
        setCustomBreadcrumbs,
      }}
    >
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbs = (): BreadcrumbContextState => {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbs must be used within a BreadcrumbProvider');
  }
  return context;
};
