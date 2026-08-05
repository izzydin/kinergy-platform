import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { cva, type VariantProps } from '../../primitives/variants';

export const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground border-border',
        destructive:
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive bg-destructive/10',
        warning:
          'border-yellow-500/50 text-yellow-600 dark:text-yellow-400 [&>svg]:text-yellow-600 bg-yellow-500/10',
        success:
          'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 [&>svg]:text-emerald-600 bg-emerald-500/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    BaseComponentProps,
    VariantProps<typeof alertVariants> {}

/**
 * Alert Primitive Component
 *
 * Accessible status alert container following WAI-ARIA standards.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, role = 'alert', ...props }, ref) => (
    <div ref={ref} role={role} className={cn(alertVariants({ variant, className }))} {...props} />
  ),
);
Alert.displayName = 'Alert';

export interface AlertTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement>, BaseComponentProps {}

/**
 * Alert Title Primitive
 */
export const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProps>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-semibold leading-none tracking-tight text-current', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export interface AlertDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement>, BaseComponentProps {}

/**
 * Alert Description Primitive
 */
export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-sm [&_p]:leading-relaxed text-current/90', className)}
      {...props}
    />
  ),
);
AlertDescription.displayName = 'AlertDescription';
