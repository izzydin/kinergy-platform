import React from 'react';

export interface IntelligencePageHeaderProps {
  /** Primary page title */
  readonly title: string;
  /** Optional descriptive subtitle */
  readonly description?: string;
  /** Optional status or feature badge node */
  readonly badge?: React.ReactNode;
  /** Optional icon rendered beside the title */
  readonly icon?: React.ComponentType<{ className?: string }>;
  /** Optional right-aligned action buttons or controls slot */
  readonly actions?: React.ReactNode;
  /** Additional container CSS classes */
  readonly className?: string;
}

/**
 * Reusable Page Header for Kynergy Intelligence Subviews.
 *
 * Establishes a consistent visual hierarchy:
 * - Responsive typography adapting gracefully down to 360px
 * - Dedicated flex-wrap action controls slot
 * - Accessible heading semantics
 * - Long text wrapping without breaking layout
 */
export const IntelligencePageHeader: React.FC<IntelligencePageHeaderProps> = ({
  title,
  description,
  badge,
  icon: Icon,
  actions,
  className = '',
}) => {
  return (
    <div
      data-testid="intelligence-page-header"
      className={`flex shrink-0 flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between border-b border-border/40 min-w-0 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary mt-0.5">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-foreground break-words">
              {title}
            </h2>
            {badge}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed break-words">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div
          data-testid="intelligence-page-header-actions"
          className="flex flex-wrap shrink-0 items-center gap-2"
        >
          {actions}
        </div>
      )}
    </div>
  );
};
