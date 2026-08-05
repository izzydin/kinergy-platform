import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../providers/auth-provider';
import { useFeatureFlags } from '../providers/feature-flag-provider';
import { navigationRegistry } from './navigation-registry';
import { NavigationBuilder } from './navigation.builder';
import type { NavigationItem, NavigationSection } from './navigation.types';

export interface NavigationContextState {
  sections: NavigationSection[];
  items: NavigationItem[];
  activeItem: NavigationItem | undefined;
  registerNavItem: (item: NavigationItem) => void;
}

const NavigationContext = createContext<NavigationContextState | undefined>(undefined);

export interface NavigationProviderProps {
  children: React.ReactNode;
  initialItems?: NavigationItem[];
}

/**
 * Navigation Provider Component
 *
 * Configuration-driven React Context provider that consumes active user permissions
 * and tenant feature flags to compute authorized NavigationSections dynamically.
 */
export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialItems,
}) => {
  const location = useLocation();
  const { hasPermission } = useAuth();
  const { isEnabled } = useFeatureFlags();

  // Track dynamic registrations state version
  const [registryVersion, setRegistryVersion] = useState(0);

  // Initialize custom baseline navigation configuration if explicitly provided
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      navigationRegistry.registerMany(initialItems);
    }
  }, [initialItems]);

  // Subscribe to navigationRegistry changes (dynamic registrations, module additions)
  useEffect(() => {
    const unsubscribe = navigationRegistry.subscribe(() => {
      setRegistryVersion((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  const registerNavItem = (item: NavigationItem) => {
    navigationRegistry.register(item);
  };

  // Re-build navigation tree whenever auth, feature flags, or registry version updates
  const sections = useMemo(() => {
    const rawItems = navigationRegistry.getItems();
    return NavigationBuilder.build({
      items: rawItems,
      hasPermission,
      hasTenantFeature: isEnabled,
    });
  }, [hasPermission, isEnabled, registryVersion]);

  // Flatten all authorized items across sections
  const items = useMemo(() => {
    return sections.flatMap((section) => section.items);
  }, [sections]);

  // Determine active item based on current URL path matching
  const activeItem = useMemo(() => {
    return items.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
    );
  }, [items, location.pathname]);

  return (
    <NavigationContext.Provider
      value={{
        sections,
        items,
        activeItem,
        registerNavItem,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextState => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
