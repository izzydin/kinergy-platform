import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { cva, type VariantProps } from '../../primitives/variants';

export const spinnerVariants = cva('animate-spin text-current shrink-0', {
  variants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface SpinnerProps
  extends
    React.SVGAttributes<SVGSVGElement>,
    BaseComponentProps,
    VariantProps<typeof spinnerVariants> {
  /** Screen reader announcement label */
  label?: string;
}

/**
 * Spinner Primitive Component
 *
 * Accessible SVG loading indicator following WAI-ARIA status rules.
 */
export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size, label = 'Loading...', ...props }, ref) => {
    return (
      <span role="status" aria-busy="true" className="inline-flex items-center justify-center">
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className={cn(spinnerVariants({ size, className }))}
          aria-hidden="true"
          {...props}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="sr-only">{label}</span>
      </span>
    );
  },
);

Spinner.displayName = 'Spinner';
