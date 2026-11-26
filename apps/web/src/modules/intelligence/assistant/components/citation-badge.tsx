import React from 'react';
import { FileText, ExternalLink, Archive, ShieldAlert } from 'lucide-react';
import { Badge } from '@kinergy-platform/ui';
import type { RAGSourceCitationDto } from '../types/assistant.types';

export interface CitationBadgeProps {
  readonly source: RAGSourceCitationDto;
  readonly index: number;
  readonly onClick?: (source: RAGSourceCitationDto, index: number) => void;
  readonly className?: string;
}

/**
 * Citation Badge / Reference Pill Component.
 *
 * Renders an accessible, interactive citation pill:
 * - Deterministic numbering [1], [2], etc. matching backend ranking/ordering.
 * - Graceful truncation of document title with responsive max-width.
 * - Page number indicator tag (p. X) when available from retrieval provenance.
 * - Distinct visual status for archived/soft-deleted or restricted source documents.
 * - Keyboard accessible (Enter/Space activation) with clear focus indicators.
 */
export const CitationBadge: React.FC<CitationBadgeProps> = React.memo(
  ({ source, index, onClick, className = '' }) => {
    const handleClick = () => {
      onClick?.(source, index);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(source, index);
      }
    };

    const displayTitle = source.documentTitle || 'Documento sin título';
    const pageLabel =
      source.pageNumber !== undefined && source.pageNumber !== null
        ? `p.${source.pageNumber}`
        : null;

    const accessibleLabel = `Fuente ${index + 1}: ${displayTitle}${pageLabel ? `, ${pageLabel}` : ''}`;

    const isSoftDeleted = source.previewStatus === 'DOCUMENT_SOFT_DELETED';
    const isRestricted = source.previewStatus === 'DOCUMENT_RESTRICTED';

    return (
      <Badge
        asChild
        variant="outline"
        className={`group inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-normal text-muted-foreground hover:bg-accent/60 hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${className}`}
      >
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label={accessibleLabel}
          data-testid={`citation-badge-${index + 1}`}
          title={displayTitle}
          className="inline-flex max-w-full items-center gap-1.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-xs"
        >
          <span className="font-semibold text-primary">[{index + 1}]</span>

          {isSoftDeleted ? (
            <Archive
              className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
          ) : isRestricted ? (
            <ShieldAlert
              className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <FileText
              className="h-2.5 w-2.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors"
              aria-hidden="true"
            />
          )}

          <span className="truncate max-w-[120px] sm:max-w-[160px] md:max-w-[200px] font-medium">
            {displayTitle}
          </span>

          {pageLabel && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded-xs shrink-0">
              {pageLabel}
            </span>
          )}

          <ExternalLink
            className="h-2.5 w-2.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
            aria-hidden="true"
          />
        </button>
      </Badge>
    );
  },
);

CitationBadge.displayName = 'CitationBadge';
