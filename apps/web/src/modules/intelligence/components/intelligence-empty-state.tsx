import React from 'react';

export interface IntelligenceEmptyStateProps {
  /** Headline title */
  readonly title: string;
  /** Descriptive guidance */
  readonly description?: string;
  /** Optional visual icon component */
  readonly icon?: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  /** Optional status or feature badge */
  readonly badge?: React.ReactNode;
  /** Primary action CTA button or control */
  readonly action?: React.ReactNode;
  /** Optional secondary action */
  readonly secondaryAction?: React.ReactNode;
  /** Compact styling for sidebars and small sub-panels */
  readonly compact?: boolean;
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
  compact = false,
  className = '',
  testId = 'intelligence-empty-state',
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      data-testid={testId}
      className={`flex flex-1 flex-col items-center justify-center rounded-xl transition-colors min-w-0 ${
        compact
          ? 'p-4 text-center'
          : 'border border-dashed border-border/80 bg-card/40 p-8 sm:p-12 text-center'
      } ${className}`}
    >
      {/* Icon Pill */}
      {Icon && (
        <div
          className={`flex items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs shrink-0 ${
            compact ? 'h-10 w-10 mb-3 rounded-xl' : 'h-14 w-14 mb-4'
          }`}
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
        </div>
      )}

      {/* Title & Badge */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-1.5 max-w-lg min-w-0">
        <h3
          className={`font-bold tracking-tight text-foreground break-words ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          {title}
        </h3>
        {badge}
      </div>

      {/* Description */}
      {description && (
        <p
          className={`text-muted-foreground leading-relaxed break-words ${
            compact ? 'text-xs mb-3 max-w-xs' : 'text-xs sm:text-sm mb-6 max-w-md'
          }`}
        >
          {description}
        </p>
      )}

      {/* Action Controls */}
      {(action || secondaryAction) && (
        <div
          data-testid={`${testId}-actions`}
          className="flex flex-wrap items-center justify-center gap-2.5 shrink-0"
        >
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
