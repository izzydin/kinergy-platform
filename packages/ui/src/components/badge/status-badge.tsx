import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { Badge, type BadgeProps } from './badge';

export type SemanticStatus = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type StatusTone = 'soft' | 'solid' | 'outline';

const STATUS_ICONS: Record<SemanticStatus, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  neutral: MinusCircle,
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'>, BaseComponentProps {
  /** Semantic status category */
  status: SemanticStatus;
  /** Visible label text describing the status (Required by WCAG 1.4.1) */
  label: string;
  /** Visual presentation tone */
  tone?: StatusTone;
  /** Optional custom icon override. Set to null to suppress icon */
  icon?: React.ReactNode;
  /** Optional screen-reader aria label */
  'aria-label'?: string;
}

/**
 * StatusBadge Component
 *
 * Accessible semantic status badge combining color token with iconography and text label
 * in strict compliance with WCAG 2.2 AA SC 1.4.1 (Use of Color).
 */
export const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  (
    {
      className,
      status,
      label,
      tone = 'soft',
      icon: customIcon,
      size = 'sm',
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    const IconComponent = STATUS_ICONS[status];

    // Map status and tone to Badge variant
    let variant: BadgeProps['variant'];
    if (tone === 'solid') {
      variant = status === 'danger' ? 'danger' : status;
    } else if (tone === 'soft') {
      variant = `${status}-soft` as BadgeProps['variant'];
    } else {
      variant = 'outline';
    }

    const renderedIcon =
      customIcon !== undefined ? (
        customIcon
      ) : IconComponent ? (
        <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : null;

    return (
      <Badge
        ref={ref}
        variant={variant}
        size={size}
        className={cn('inline-flex items-center gap-1.5 font-medium select-none', className)}
        aria-label={ariaLabel || label}
        {...props}
      >
        {renderedIcon}
        <span>{label}</span>
      </Badge>
    );
  },
);

StatusBadge.displayName = 'StatusBadge';

export interface StatusIndicatorProps extends BaseComponentProps {
  /** Semantic status category */
  status: SemanticStatus;
  /** Optional accessible label */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Animate a subtle pulse effect */
  pulse?: boolean;
}

/**
 * StatusIndicator Component
 *
 * Accessible status dot for inline table or header status indications.
 */
export const StatusIndicator = React.forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  ({ className, status, label, size = 'md', pulse = false, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-2 w-2',
      md: 'h-2.5 w-2.5',
      lg: 'h-3 w-3',
    };

    const colorClasses: Record<SemanticStatus, string> = {
      success: 'bg-status-success',
      warning: 'bg-status-warning',
      danger: 'bg-status-danger',
      info: 'bg-status-info',
      neutral: 'bg-muted-foreground',
    };

    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center gap-2 select-none', className)}
        role="status"
        aria-label={label}
        {...props}
      >
        <span className="relative flex shrink-0">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                colorClasses[status],
              )}
            />
          )}
          <span
            className={cn(
              'relative inline-flex rounded-full',
              sizeClasses[size],
              colorClasses[status],
            )}
          />
        </span>
        {label && <span className="text-sm font-medium text-foreground">{label}</span>}
      </span>
    );
  },
);

StatusIndicator.displayName = 'StatusIndicator';
