import * as React from 'react';
import type { BaseComponentProps, SemanticStateProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { DISABLED_CLASSES, FOCUS_RING_CLASSES } from '../../primitives/variants';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>, BaseComponentProps, SemanticStateProps {}

/**
 * Input Primitive Component
 *
 * Theme-aware, accessible native text input primitive supporting validation state indicators.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', isInvalid = false, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
          FOCUS_RING_CLASSES,
          DISABLED_CLASSES,
          isInvalid && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
