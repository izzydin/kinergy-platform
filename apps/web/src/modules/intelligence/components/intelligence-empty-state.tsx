import React from 'react';

export interface IntelligenceEmptyStateProps {
  /** Headline title */
  readonly title: string;
  /** Descriptive guidance */
  readonly description?: string;
  /** Optional visual icon component */
  readonly icon?: React.ComponentType<{ className?: string }>;
  /** Optional status or feature badge */
  readonly badge?: React.ReactNode;
  /** Primary action CTA button or control */
  readonly action?: React.ReactNode;
  /** Optional secondary action */
  readonly secondaryAction?: React.ReactNode;
  /** Additional container CSS classes */
  readonly className?: string;
  /** Custom test identifier */
  readonly testId?: string;
}

/**
 * Reusable Empty State Primitive for Kynergy Intelligence.
 *
 * Provides a standardized visual primitive for:
 * - Empty conversational history / New session state (Assistant)
 * - Empty document libraries / Empty search results (Knowledge Center)
 * - Unselected conversational thread
 *
 * Architecture Invariant:
 * Contains zero mock conversations, mock documents, or business assumptions.
 */
export const IntelligenceEmptyState: React.FC<IntelligenceEmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  badge,
  action,
  secondaryAction,
  className = '',
  testId = 'intelligence-empty-state',
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      data-testid={testId}
      className={`flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 sm:p-12 text-center transition-colors min-w-0 ${className}`}
    >
      {/* Icon Pill */}
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs mb-4 shrink-0">
          <Icon className="h-7 w-7" />
        </div>
      )}

      {/* Title & Badge */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-2 max-w-lg min-w-0">
        <h3 className="text-base font-bold tracking-tight text-foreground break-words">{title}</h3>
        {badge}
      </div>

      {/* Description */}
      {description && (
        <p className="max-w-md text-xs sm:text-sm text-muted-foreground mb-6 leading-relaxed break-words">
          {description}
        </p>
      )}

      {/* Action Controls */}
      {(action || secondaryAction) && (
        <div
          data-testid={`${testId}-actions`}
          className="flex flex-wrap items-center justify-center gap-3 shrink-0"
        >
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
