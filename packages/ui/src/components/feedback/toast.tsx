import * as React from 'react';
import { X } from 'lucide-react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { cva, type VariantProps } from '../../primitives/variants';

export interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Toast Provider Infrastructure Wrapper
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  return <>{children}</>;
};

export interface ToastViewportProps
  extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {}

/**
 * Toast Viewport Container
 * Positioned fixed at bottom-right of viewport for non-disruptive feedback.
 */
export const ToastViewport = React.forwardRef<HTMLDivElement, ToastViewportProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
        className,
      )}
      {...props}
    />
  ),
);
ToastViewport.displayName = 'ToastViewport';

export const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        success: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100 dark:border-emerald-500',
        warning: 'border-yellow-500/50 bg-yellow-950/90 text-yellow-100 dark:border-yellow-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface ToastProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    BaseComponentProps,
    VariantProps<typeof toastVariants> {
  onClose?: () => void;
}

/**
 * Presentational Toast Notification Primitive
 */
export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant, role = 'status', ...props }, ref) => {
    const isAssertive = variant === 'destructive';
    return (
      <div
        ref={ref}
        role={role}
        aria-live={isAssertive ? 'assertive' : 'polite'}
        className={cn(toastVariants({ variant, className }))}
        {...props}
      />
    );
  },
);
Toast.displayName = 'Toast';

export interface ToastTitleProps extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {}

/**
 * Toast Title Primitive
 */
export const ToastTitle = React.forwardRef<HTMLDivElement, ToastTitleProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm font-semibold [&+div]:text-xs', className)} {...props} />
  ),
);
ToastTitle.displayName = 'ToastTitle';

export interface ToastDescriptionProps
  extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {}

/**
 * Toast Description Primitive
 */
export const ToastDescription = React.forwardRef<HTMLDivElement, ToastDescriptionProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm opacity-90', className)} {...props} />
  ),
);
ToastDescription.displayName = 'ToastDescription';

export interface ToastCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, BaseComponentProps {}

/**
 * Toast Close Trigger Primitive
 */
export const ToastClose = React.forwardRef<HTMLButtonElement, ToastCloseProps>(
  ({ className, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label="Close notification"
      className={cn(
        'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100',
        className,
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  ),
);
ToastClose.displayName = 'ToastClose';
