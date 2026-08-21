import { Badge, Button } from '@kinergy-platform/ui';
import { Check, PlusCircle, X } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import type { DataTableFacetedFilterProps } from '../types/data-table-toolbar.types';

/**
 * DataTableFacetedFilter Component
 *
 * Renders an accessible faceted filter dropdown for tabular datasets.
 * Supports both single-selection and multi-selection modes with active badge count pills.
 */
export function DataTableFacetedFilter<TValue extends string = string>({
  title,
  options,
  selectedValues,
  onSelect,
  multiSelect = false,
  className,
}: DataTableFacetedFilterProps<TValue>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  // Normalize selected values to an array
  const selectedArray: readonly TValue[] = Array.isArray(selectedValues)
    ? (selectedValues as readonly TValue[])
    : selectedValues !== undefined && selectedValues !== ''
      ? [selectedValues as TValue]
      : [];

  const isSelected = (value: TValue) => selectedArray.includes(value);

  const handleToggle = (value: TValue) => {
    if (multiSelect) {
      if (isSelected(value)) {
        const next = selectedArray.filter((v) => v !== value);
        onSelect(next.length > 0 ? (next as TValue[]) : undefined);
      } else {
        const next = [...selectedArray, value];
        onSelect(next as TValue[]);
      }
    } else {
      if (isSelected(value)) {
        onSelect(undefined);
      } else {
        onSelect(value);
      }
      setIsOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(undefined);
  };

  return (
    <div className={cn('relative inline-block text-left', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Filter by ${title}`}
        className={cn(
          'h-8 border-dashed text-xs font-medium',
          selectedArray.length > 0 && 'border-solid bg-accent/50',
        )}
      >
        <PlusCircle className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span>{title}</span>

        {selectedArray.length > 0 && (
          <>
            <div className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
            <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
              {selectedArray.length}
            </Badge>
            <div className="hidden space-x-1 lg:flex">
              {selectedArray.length > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {selectedArray.length} selected
                </Badge>
              ) : (
                options
                  .filter((option) => isSelected(option.value))
                  .map((option) => (
                    <Badge
                      variant="secondary"
                      key={String(option.value)}
                      className="rounded-sm px-1 font-normal"
                    >
                      {option.label}
                    </Badge>
                  ))
              )}
            </div>
          </>
        )}
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label={`${title} filter options`}
            className="absolute left-0 z-50 mt-2 w-48 rounded-md border border-border bg-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
          >
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </div>
            <div className="mt-1 space-y-0.5">
              {options.map((option) => {
                const selected = isSelected(option.value);
                const Icon = option.icon;

                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={selected}
                    onClick={() => handleToggle(option.value)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus:bg-muted focus:outline-none',
                      selected && 'bg-muted/70',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-xs border border-primary',
                          selected ? 'bg-primary text-primary-foreground' : 'opacity-50',
                        )}
                      >
                        {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                      </div>
                      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span>{option.label}</span>
                    </div>

                    {typeof option.count === 'number' && (
                      <span className="ml-auto text-xs font-mono text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedArray.length > 0 && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex w-full items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  <span>Clear filter</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
