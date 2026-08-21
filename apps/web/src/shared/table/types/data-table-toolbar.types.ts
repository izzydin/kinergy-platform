import type React from 'react';

/**
 * DataTable Toolbar & Filter Contracts
 *
 * Enforces Track C — Step C2.3 DataTable Toolbar, Search & Filters Architecture:
 * Declarative, composable, and URL-driven interaction controls.
 */

export interface DataTableSearchProps {
  /** Committed value from URL state */
  readonly value: string;
  /** Callback fired when debounced value changes */
  readonly onChange: (value: string) => void;
  /** Placeholder text (default: 'Search...') */
  readonly placeholder?: string;
  /** Debounce delay in milliseconds (default: 300) */
  readonly debounceMs?: number;
  /** Accessible label for screen readers */
  readonly ariaLabel?: string;
  /** Custom className */
  readonly className?: string;
}

export interface DataTableFilterOption<TValue = string> {
  readonly label: string;
  readonly value: TValue;
  readonly icon?: React.ComponentType<{ readonly className?: string }>;
  readonly count?: number;
}

export interface DataTableFacetedFilterProps<TValue = string> {
  /** Filter facet title (e.g., 'Status', 'Role') */
  readonly title: string;
  /** List of selectable options */
  readonly options: readonly DataTableFilterOption<TValue>[];
  /** Selected value(s) from URL state */
  readonly selectedValues?: readonly TValue[] | TValue;
  /** Callback when selections change */
  readonly onSelect: (selected: TValue[] | TValue | undefined) => void;
  /** Whether multiple items can be selected simultaneously (default: false) */
  readonly multiSelect?: boolean;
  /** Custom className */
  readonly className?: string;
}

export interface DataTableToolbarProps {
  /** Search control node */
  readonly search?: React.ReactNode;
  /** Filter facets node */
  readonly filters?: React.ReactNode;
  /** Whether any filters or search query are active */
  readonly isFiltered?: boolean;
  /** Callback to clear all active filters & search query */
  readonly onResetFilters?: () => void;
  /** Column visibility view options node */
  readonly viewOptions?: React.ReactNode;
  /** Custom action buttons (e.g., '+ Create User', 'Export') */
  readonly actions?: React.ReactNode;
  /** Custom container className */
  readonly className?: string;
}
