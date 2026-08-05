import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {}

/**
 * Skeleton Primitive Component
 *
 * Content placeholder primitive used during loading states to prevent layout shift (CLS).
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn('animate-pulse rounded-md bg-muted/70', className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = 'Skeleton';
