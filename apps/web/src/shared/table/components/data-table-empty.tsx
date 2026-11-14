import { Button } from '@kinergy-platform/ui';
import { Inbox, SearchX, ShieldAlert, CheckCircle2 } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';
import type { DataTableEmptyProps } from '../types/data-table.types';
import { useTranslation } from '../../../app/providers/locale-provider';

/**
 * DataTableEmpty Component
 *
 * Renders an accessible empty state view inside or beneath a table.
 * Accurately distinguishes between an empty database, no results matching active filters,
 * unauthorized access, and positive healthy operational states.
 */
export function DataTableEmpty({
  isFiltered = false,
  isUnauthorized = false,
  isHealthy = false,
  title,
  description,
  onResetFilters,
  action,
  className,
}: DataTableEmptyProps): React.ReactElement {
  const { locale, t } = useTranslation();

  const defaultTitle =
    locale === 'es'
      ? isFiltered
        ? t('common.noResults', 'No se encontraron registros coincidentes.')
        : isUnauthorized
          ? t('auth.forbiddenTitle', 'Acceso denegado')
          : isHealthy
            ? 'Todos los registros operativos'
            : t('crud.emptyTitle', 'No se encontraron registros')
      : isFiltered
        ? 'No matching records found'
        : isUnauthorized
          ? 'Access restricted'
          : isHealthy
            ? 'All records operational'
            : 'No records available';

  const defaultDescription =
    locale === 'es'
      ? isFiltered
        ? 'Intenta ajustar tus términos de búsqueda o limpiar los filtros activos.'
        : isUnauthorized
          ? t('auth.forbiddenMessage', 'No tienes permisos para ver esta página.')
          : isHealthy
            ? 'Todos los elementos cumplen con los parámetros operativos.'
            : t('crud.emptyDescription', 'No hay elementos para mostrar en este momento.')
      : isFiltered
        ? 'Try adjusting your search terms or clearing active filters to view available records.'
        : isUnauthorized
          ? 'You do not have the required permissions to view records in this table.'
          : isHealthy
            ? 'All items currently meet operational baselines. No attention or corrective actions required.'
            : 'There are currently no items registered in this section.';

  const resolvedTitle = title ? (locale === 'es' ? t(title, title) : title) : defaultTitle;
  const resolvedDescription = description
    ? locale === 'es'
      ? t(description, description)
      : description
    : defaultDescription;

  const renderIcon = () => {
    if (isFiltered) {
      return <SearchX className="h-6 w-6" aria-hidden="true" />;
    }
    if (isUnauthorized) {
      return <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />;
    }
    if (isHealthy) {
      return <CheckCircle2 className="h-6 w-6 text-status-success" aria-hidden="true" />;
    }
    return <Inbox className="h-6 w-6" aria-hidden="true" />;
  };

  const iconBgClass = isUnauthorized
    ? 'bg-destructive/10 text-destructive'
    : isHealthy
      ? 'bg-status-success-surface text-status-success'
      : 'bg-muted text-muted-foreground';

  return (
    <div
      className={cn(
        'flex min-h-[280px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center',
        className,
      )}
      role="status"
    >
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', iconBgClass)}>
        {renderIcon()}
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{resolvedTitle}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{resolvedDescription}</p>

      <div className="mt-6 flex items-center gap-3">
        {action}
        {isFiltered && onResetFilters && (
          <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
            {locale === 'es' ? t('common.clearFilters', 'Limpiar filtros') : 'Reset Filters'}
          </Button>
        )}
      </div>
    </div>
  );
}
