import * as React from 'react';
import { Button } from '@kinergy-platform/ui';
import { FolderOpen, SearchX, RotateCcw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { CrudEmptyProps } from '../types/crud-state.types';

export const CrudEmpty: React.FC<CrudEmptyProps> = ({
  type = 'dataset',
  title,
  description,
  action,
  onResetFilters,
  className = '',
}) => {
  const isFiltered = type === 'filtered';
  const isUnauthorized = type === 'unauthorized';
  const isHealthy = type === 'healthy';

  const defaultTitle = isFiltered
    ? 'No matching records found'
    : isUnauthorized
      ? 'Access restricted'
      : isHealthy
        ? 'All items operational'
        : 'No records found';

  const defaultDescription = isFiltered
    ? 'No records match your active search or filter criteria. Try clearing search or resetting filters.'
    : isUnauthorized
      ? 'You do not have sufficient permissions to view the contents of this section.'
      : isHealthy
        ? 'All records meet operational baselines. No attention or corrective action required.'
        : 'There are currently no records available. Create your first record to get started.';

  const displayTitle = title ?? defaultTitle;
  const displayDescription = description ?? defaultDescription;

  const renderIcon = () => {
    if (isFiltered) {
      return <SearchX className="h-6 w-6" aria-hidden="true" />;
    }
    if (isUnauthorized) {
      return <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />;
    }
    if (isHealthy) {
      return (
        <CheckCircle2
          className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
      );
    }
    return <FolderOpen className="h-6 w-6" aria-hidden="true" />;
  };

  const iconBgClass = isUnauthorized
    ? 'bg-destructive/10 text-destructive'
    : isHealthy
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : 'bg-muted text-muted-foreground';

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 p-8 sm:p-12 text-center bg-card/40 ${className}`}
      role="status"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full mb-4 ${iconBgClass}`}
      >
        {renderIcon()}
      </div>

      <h3 className="text-base font-semibold text-foreground mb-1.5">{displayTitle}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
        {displayDescription}
      </p>

      {action ? (
        action
      ) : isFiltered && onResetFilters ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetFilters}
          aria-label="Reset active search and filters"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Reset Filters
        </Button>
      ) : null}
    </div>
  );
};

CrudEmpty.displayName = 'CrudEmpty';
