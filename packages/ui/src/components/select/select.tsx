import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { BaseComponentProps, SemanticStateProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { DISABLED_CLASSES, FOCUS_RING_CLASSES } from '../../primitives/variants';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>, BaseComponentProps, SemanticStateProps {}

/**
 * Select Primitive Component
 *
 * Theme-aware, accessible native select component with stylized indicator and validation states.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, isInvalid = false, disabled, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          disabled={disabled}
          aria-invalid={isInvalid ? true : undefined}
          className={cn(
            'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground shadow-sm transition-colors',
            FOCUS_RING_CLASSES,
            DISABLED_CLASSES,
            isInvalid && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  },
);

Select.displayName = 'Select';
