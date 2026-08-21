import * as React from 'react';
import type { CrudStateViewProps } from '../types/crud-state.types';
import { CrudLoading } from './crud-loading';
import { CrudEmpty } from './crud-empty';
import { CrudError } from './crud-error';
import { Spinner } from '@kinergy-platform/ui';

export const CrudStateView: React.FC<CrudStateViewProps> = ({
  isLoading = false,
  isRefetching = false,
  loadingProps,
  isError = false,
  errorProps,
  isEmpty = false,
  isFiltered = false,
  emptyProps,
  children,
  className = '',
}) => {
  // 1. Initial Load State
  if (isLoading) {
    return <CrudLoading className={className} {...loadingProps} />;
  }

  // 2. Error State
  if (isError) {
    return <CrudError className={className} {...errorProps} />;
  }

  // 3. Empty State (System vs Filtered)
  if (isEmpty) {
    return (
      <CrudEmpty type={isFiltered ? 'filtered' : 'dataset'} className={className} {...emptyProps} />
    );
  }

  // 4. Populated State (with non-blocking background refetch indicator)
  return (
    <div className={`relative w-full ${className}`}>
      {isRefetching && (
        <div
          className="absolute -top-3 right-0 flex items-center gap-1.5 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/40 shadow-xs z-10"
          role="status"
          aria-live="polite"
        >
          <Spinner size="sm" className="text-primary h-3.5 w-3.5" />
          <span>Refreshing...</span>
        </div>
      )}
      {children}
    </div>
  );
};

CrudStateView.displayName = 'CrudStateView';
