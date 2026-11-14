import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableErrorProps } from '../types/data-table.types';
import { useTranslation } from '../../../app/providers/locale-provider';

/**
 * DataTableError Component
 *
 * Renders an accessible error alert inside the table frame with optional retry trigger.
 */
export function DataTableError({
  errorMessage,
  onRetry,
  className,
}: DataTableErrorProps): React.ReactElement {
  const { locale, t, translateError } = useTranslation();
  const resolvedMessage =
    errorMessage !== undefined
      ? locale === 'es' && typeof errorMessage === 'string'
        ? translateError(errorMessage, errorMessage)
        : errorMessage
      : locale === 'es'
        ? t('crud.errorDescription', 'Ocurrió un error al obtener la información del servidor.')
        : 'Failed to load table records from platform API.';

  return (
    <div className={cn('p-4', className)}>
      <Alert
        variant="destructive"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <AlertTitle>
              {locale === 'es'
                ? t('crud.errorTitle', 'No se pudieron cargar los datos')
                : 'Failed to load data'}
            </AlertTitle>
            <AlertDescription className="mt-1 text-sm">{resolvedMessage}</AlertDescription>
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
            {locale === 'es' ? t('common.retry', 'Reintentar') : 'Retry'}
          </Button>
        )}
      </Alert>
    </div>
  );
}
