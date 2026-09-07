import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@kinergy-platform/ui';

export interface ResourceMetricCardProps {
  /** Metric display title (semantic h3) */
  title: string;
  /** Primary metric value (formatted string or number) */
  value: React.ReactNode;
  /** Optional secondary subtitle or context description */
  description?: string;
  /** Optional decorative / informative icon */
  icon?: React.ReactNode;
  /** Optional status badge or indicator tag */
  badge?: React.ReactNode;
  /** Optional footer action or contextual link */
  footer?: React.ReactNode;
  /** Optional CSS class overrides for card container */
  className?: string;
  /** Optional test identifier */
  dataTestId?: string;
  /** Optional icon background container class */
  iconContainerClassName?: string;
}

/**
 * Standardized Resource Metric Card Primitive
 *
 * Provides responsive, accessible metric visualization adhering to platform conventions:
 * - Semantic h3 CardTitle for screen readers
 * - High-contrast text values
 * - Non-shrinking layout preventing metric cards from becoming unusably narrow
 * - Supports accompanying text badges so information is never conveyed solely through color
 */
export const ResourceMetricCard: React.FC<ResourceMetricCardProps> = ({
  title,
  value,
  description,
  icon,
  badge,
  footer,
  className,
  dataTestId,
  iconContainerClassName = 'bg-primary/10 text-primary',
}) => {
  return (
    <Card
      className={cn('min-w-0 border-border bg-card shadow-sm transition-all', className)}
      data-testid={dataTestId}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle as="h3" className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs text-muted-foreground line-clamp-1">
              {description}
            </CardDescription>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'shrink-0 rounded-full p-2.5 flex items-center justify-center',
              iconContainerClassName,
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {value}
          </span>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {footer && <div className="pt-1 text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
};
