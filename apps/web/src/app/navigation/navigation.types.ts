import type React from 'react';

/**
 * Navigation Entry Definition Contract
 *
 * Defines the public navigation entry specification exported by feature modules (src/modules/<domain>/).
 */
export interface NavigationItem {
  /** Unique navigation item identifier (e.g., 'client:directory', 'energy:metrics') */
  readonly id: string;
  /** Human-readable display label (or translation key) */
  readonly label: string;
  /** Primary URL path target (e.g., '/clients', '/energy') */
  readonly path: string;
  /** Optional icon identifier or React component */
  readonly icon?: React.ComponentType<{ className?: string }> | string;
  /** Optional badge label or numeric counter */
  readonly badge?: string | number;
  /** Sorting order weight (lower numbers appear first, default: 100) */
  readonly order?: number;
  /** Target navigation section group (e.g., 'overview', 'core', 'admin', 'system') */
  readonly section?: string;
  /** Required user permissions for viewing this entry */
  readonly requiredPermissions?: string[];
  /** Required multi-tenant feature flags for evaluating item visibility */
  readonly requiredTenantFeatures?: string[];
  /** Optional nested sub-navigation items */
  readonly children?: NavigationItem[];
  /** Whether the path points to an external URL */
  readonly isExternal?: boolean;
}

/**
 * Grouped Navigation Section Contract
 */
export interface NavigationSection {
  /** Section identifier (e.g., 'main', 'operations', 'settings') */
  readonly id: string;
  /** Optional section header title */
  readonly title?: string;
  /** Sorting weight for section display */
  readonly order?: number;
  /** List of filtered, authorized navigation items within this section */
  readonly items: NavigationItem[];
}
