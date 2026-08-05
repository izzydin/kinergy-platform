import * as React from 'react';
import type { BaseComponentProps, PolymorphicProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { Slot } from '../../primitives/slot';
import { cva, type VariantProps } from '../../primitives/variants';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline:
          'border border-border text-foreground hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    BaseComponentProps,
    PolymorphicProps,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge Primitive Component
 *
 * Theme-aware status badge primitive supporting polymorphic asChild composition.
 */
export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'div';
    return (
      <Component ref={ref} className={cn(badgeVariants({ variant, size, className }))} {...props} />
    );
  },
);

Badge.displayName = 'Badge';
