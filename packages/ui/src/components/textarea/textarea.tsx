import * as React from 'react';
import type { BaseComponentProps, SemanticStateProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { DISABLED_CLASSES, FOCUS_RING_CLASSES } from '../../primitives/variants';

export interface TextareaProps
  extends
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    BaseComponentProps,
    SemanticStateProps {}

/**
 * Textarea Primitive Component
 *
 * Theme-aware, accessible multi-line text input primitive supporting validation state indicators.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid = false, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground',
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

Textarea.displayName = 'Textarea';
