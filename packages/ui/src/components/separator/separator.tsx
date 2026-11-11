import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {
  /** Orientation of the separator line */
  orientation?: 'horizontal' | 'vertical';
  /** Whether the element is purely decorative (uses role="none" instead of role="separator") */
  decorative?: boolean;
}

/**
 * Separator Primitive Component
 *
 * Accessible visual or semantic boundary line separating content blocks.
 */
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={decorative ? 'none' : 'separator'}
        aria-orientation={decorative ? undefined : orientation}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
          className,
        )}
        {...props}
      />
    );
  },
);

Separator.displayName = 'Separator';
