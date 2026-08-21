import * as React from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { CrudErrorProps } from '../types/crud-state.types';

function sanitizeErrorMessage(rawError?: string | Error | null): string {
  if (!rawError) {
    return 'An unexpected error occurred while communicating with the server. Please try again.';
  }

  const message = typeof rawError === 'string' ? rawError : rawError.message;

  // Filter out internal technical/stack details
  const sensitivePatterns = [
    /prisma/i,
    /sql/i,
    /syntaxerror/i,
    /typeerror/i,
    /nullpointer/i,
    /database/i,
    /connection refused/i,
    /econnrefused/i,
    /stack\s*trace/i,
  ];

  const hasSensitiveDetails = sensitivePatterns.some((pattern) => pattern.test(message));
  if (hasSensitiveDetails) {
    return 'Unable to load data due to a temporary server issue. Please try again shortly.';
  }

  return message;
}

export const CrudError: React.FC<CrudErrorProps> = ({
  title = 'Failed to load data',
  error,
  correlationId,
  onRetry,
  retryLabel = 'Retry',
  secondaryAction,
  className = '',
}) => {
  const displayMessage = sanitizeErrorMessage(error);

  return (
    <div className={`w-full ${className}`}>
      <Alert
        variant="destructive"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5"
      >
        <div className="flex items-start gap-3.5">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <AlertTitle className="text-base font-semibold">{title}</AlertTitle>
            <AlertDescription className="text-sm text-destructive/90 leading-relaxed">
              {displayMessage}
            </AlertDescription>
            {correlationId && (
              <p className="text-xs font-mono text-destructive/70 pt-1">Ref ID: {correlationId}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          {secondaryAction}
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="border-destructive/40 hover:bg-destructive/10 text-destructive shadow-sm"
              aria-label={`${retryLabel} operation`}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              {retryLabel}
            </Button>
          )}
        </div>
      </Alert>
    </div>
  );
};

CrudError.displayName = 'CrudError';
