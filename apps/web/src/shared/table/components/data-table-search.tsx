import { Button, Input } from '@kinergy-platform/ui';
import { Search, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { DataTableSearchProps } from '../types/data-table-toolbar.types';

/**
 * DataTableSearch Component
 *
 * Implements accessible, debounced search input synchronized with URL state.
 * - Internal state enables fluid typing feedback.
 * - Automatic debounce pushes canonical query parameter to URL.
 * - Immediate reset via clear button (X) or Escape key.
 */
export function DataTableSearch({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  ariaLabel = 'Search table records',
  className,
}: DataTableSearchProps): React.ReactElement {
  const [internalValue, setInternalValue] = useState(value);

  // Sync internal state if URL state changes externally (e.g., browser back/forward or reset)
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Debounced commit to URL state
  useEffect(() => {
    if (internalValue === value) return;

    const timer = setTimeout(() => {
      onChange(internalValue);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [internalValue, value, onChange, debounceMs]);

  const handleClear = () => {
    setInternalValue('');
    onChange('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClear();
    }
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 w-48 pl-8 pr-8 text-xs sm:w-64 focus-visible:ring-1"
      />
      {internalValue && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          aria-label="Clear search query"
          className="absolute right-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
