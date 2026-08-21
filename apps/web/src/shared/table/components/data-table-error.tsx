import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableErrorProps } from '../types/data-table.types';

/**
 * DataTableError Component
 *
 * Renders an accessible error alert inside the table frame with optional retry trigger.
 */
export function DataTableError({
  errorMessage = 'Failed to load table records from platform API.',
  onRetry,
  className,
}: DataTableErrorProps): React.ReactElement {
  return (
    <div className={cn('p-4', className)}>
      <Alert
        variant="destructive"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <AlertTitle>Failed to load data</AlertTitle>
            <AlertDescription className="mt-1 text-sm">{errorMessage}</AlertDescription>
          </div>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="shrink-0 border-destructive/30 hover:bg-destructive/10"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        )}
      </Alert>
    </div>
  );
}
