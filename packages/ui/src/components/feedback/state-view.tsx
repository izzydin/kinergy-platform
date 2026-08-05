import * as React from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { Alert, AlertDescription, AlertTitle } from '../alert/alert';
import { Button } from '../button/button';
import { Skeleton } from './skeleton';

export interface StateViewProps extends BaseComponentProps {
  /** Indicates active asynchronous loading state */
  isLoading?: boolean;
  /** Custom Skeleton or Spinner node to display during loading state */
  loadingFallback?: React.ReactNode;
  /** Indicates empty dataset resolved successfully */
  isEmpty?: boolean;
  /** Empty state headline title */
  emptyTitle?: string;
  /** Empty state description message */
  emptyDescription?: string;
  /** Optional CTA button or element to display in empty state */
  emptyAction?: React.ReactNode;
  /** Indicates query or operation failure state */
  isError?: boolean;
  /** Error message displayed in Alert banner */
  errorMessage?: string;
  /** Callback executed when user clicks Try Again retry button */
  onRetry?: () => void;
  /** Populated content node rendered when operation resolves successfully */
  children?: React.ReactNode;
}

/**
 * StateView Primitive Component
 *
 * Implements the mandatory 4-State UI Contract (Loading, Empty, Error, Populated)
 * to eliminate blank screen crashes and unhandled UI flickers across the platform.
 */
export const StateView: React.FC<StateViewProps> = ({
  className,
  isLoading = false,
  loadingFallback,
  isEmpty = false,
  emptyTitle = 'No data available',
  emptyDescription = 'There are no records matching your current request.',
  emptyAction,
  isError = false,
  errorMessage = 'An unexpected error occurred while loading data.',
  onRetry,
  children,
}) => {
  // 1. Loading State
  if (isLoading) {
    if (loadingFallback) {
      return <div className={cn('w-full', className)}>{loadingFallback}</div>;
    }
    return (
      <div className={cn('w-full space-y-3 p-4', className)}>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-1/4" />
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className={cn('w-full p-4', className)}>
        <Alert
          variant="destructive"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div>
              <AlertTitle>Operation Failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </div>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="border-destructive/30 hover:bg-destructive/10 text-destructive shrink-0"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  // 3. Empty State
  if (isEmpty) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center bg-card/50',
          className,
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">{emptyTitle}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{emptyDescription}</p>
        {emptyAction}
      </div>
    );
  }

  // 4. Populated State (Success)
  return <div className={cn('w-full', className)}>{children}</div>;
};

StateView.displayName = 'StateView';
