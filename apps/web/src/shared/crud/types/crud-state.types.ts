import type { ReactNode } from 'react';

/**
 * Standard 4-State UI Status Taxonomy for CRUD Operations
 */
export type CrudStateStatus = 'loading' | 'empty' | 'filtered-empty' | 'error' | 'populated';

/**
 * Loading Skeleton Layout Presets
 */
export type CrudSkeletonVariant = 'table' | 'detail' | 'card' | 'form' | 'custom';

/**
 * Props for CrudLoading presentation
 */
export interface CrudLoadingProps {
  /** Layout preset for skeleton structure */
  readonly variant?: CrudSkeletonVariant;
  /** Number of skeleton rows/cards to render (default 5 for tables, 3 for cards) */
  readonly count?: number;
  /** Custom fallback component if variant is 'custom' */
  readonly customFallback?: ReactNode;
  /** Custom CSS class names */
  readonly className?: string;
}

/**
 * Props for CrudEmpty presentation
 */
export interface CrudEmptyProps {
  /** Empty state classification: system empty vs search/filter empty */
  readonly type?: 'dataset' | 'filtered';
  /** Primary headline title */
  readonly title?: string;
  /** Explanatory description */
  readonly description?: string;
  /** Contextual action button (e.g. '+ Create Item' or 'Reset Filters') */
  readonly action?: ReactNode;
  /** Callback for default filter reset button when type is 'filtered' */
  readonly onResetFilters?: () => void;
  /** Custom CSS class names */
  readonly className?: string;
}

/**
 * Props for CrudError presentation
 */
export interface CrudErrorProps {
  /** Headline title of the error */
  readonly title?: string;
  /** Error message string or Error object */
  readonly error?: string | Error | null;
  /** Technical correlation ID / request ID for operational tracing */
  readonly correlationId?: string;
  /** Callback executed when user initiates retry */
  readonly onRetry?: () => void;
  /** Text label for retry button (default: "Retry") */
  readonly retryLabel?: string;
  /** Optional secondary action (e.g. "Contact Support", "Back to List") */
  readonly secondaryAction?: ReactNode;
  /** Custom CSS class names */
  readonly className?: string;
}

/**
 * Unified CrudStateView Container Props
 */
export interface CrudStateViewProps {
  /** Whether the view is performing its initial data load */
  readonly isLoading?: boolean;
  /** Whether data is currently being refetched in background while preserving existing view */
  readonly isRefetching?: boolean;
  /** Loading configuration */
  readonly loadingProps?: CrudLoadingProps;
  /** Whether the query resulted in an error */
  readonly isError?: boolean;
  /** Error configuration */
  readonly errorProps?: CrudErrorProps;
  /** Whether the resolved dataset contains 0 records */
  readonly isEmpty?: boolean;
  /** Whether the empty state is due to active search queries or filters */
  readonly isFiltered?: boolean;
  /** Empty state configuration */
  readonly emptyProps?: CrudEmptyProps;
  /** Populated content rendered when data is loaded successfully */
  readonly children: ReactNode;
  /** Custom CSS class names */
  readonly className?: string;
}
