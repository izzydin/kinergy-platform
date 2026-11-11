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
        danger:
          'border-status-danger-border text-status-danger [&>svg]:text-status-danger bg-status-danger-surface',
        warning:
          'border-status-warning-border text-status-warning [&>svg]:text-status-warning bg-status-warning-surface',
        success:
          'border-status-success-border text-status-success [&>svg]:text-status-success bg-status-success-surface',
        info: 'border-status-info-border text-status-info [&>svg]:text-status-info bg-status-info-surface',
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
  extends React.HTMLAttributes<HTMLHeadingElement>, BaseComponentProps {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

/**
 * Alert Title Primitive
 */
export const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProps>(
  ({ className, as: Component = 'h5', ...props }, ref) => (
    <Component
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
