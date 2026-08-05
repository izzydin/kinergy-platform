import * as React from 'react';
import type {
  BaseComponentProps,
  LoadingStateProps,
  PolymorphicProps,
  SemanticStateProps,
} from '../../contracts';
import { cn } from '../../primitives/cn';
import { Slot } from '../../primitives/slot';
import {
  cva,
  DISABLED_CLASSES,
  FOCUS_RING_CLASSES,
  type VariantProps,
} from '../../primitives/variants';

export const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors select-none',
    FOCUS_RING_CLASSES,
    DISABLED_CLASSES,
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-10 px-4 py-2 text-sm',
        lg: 'h-11 rounded-md px-8 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    BaseComponentProps,
    PolymorphicProps,
    SemanticStateProps,
    LoadingStateProps,
    VariantProps<typeof buttonVariants> {}

/**
 * Button Primitive Component
 *
 * Provides themed, accessible, polymorphic interactive button triggers.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Component = asChild ? Slot : 'button';
    const isControlDisabled = disabled || isLoading;

    return (
      <Component
        ref={ref}
        disabled={isControlDisabled}
        aria-busy={isLoading ? true : undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
            {loadingText ? <span>{loadingText}</span> : children}
          </>
        ) : (
          children
        )}
      </Component>
    );
  },
);

Button.displayName = 'Button';
