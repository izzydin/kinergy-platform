import React from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { RAGSourceCitationDto } from '../types/assistant.types';

export interface MessageCitationsProps {
  sources: readonly RAGSourceCitationDto[];
}

/**
 * Message Citations Tray Component.
 *
 * Displays verified source citations:
 * - Document title and chunk index
 * - Optional page number
 * - Direct secure reference link
 */
export const MessageCitations: React.FC<MessageCitationsProps> = React.memo(({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <aside
      data-testid="message-citations"
      aria-label={`Fuentes verificadas (${sources.length})`}
      className="mt-3 border-t border-border/40 pt-2 flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span>Fuentes verificadas ({sources.length}):</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, idx) => (
          <span
            key={`${source.documentId}-${source.chunkId}-${idx}`}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            <span className="font-semibold text-primary">[{idx + 1}]</span>
            <span className="truncate max-w-[160px]">{source.documentTitle}</span>
            {source.pageNumber !== undefined && (
              <span className="text-muted-foreground/70">p.{source.pageNumber}</span>
            )}
            <a
              href={`/api/v1/ai/knowledge/documents/${source.documentId}/content`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 hover:text-foreground inline-flex items-center rounded-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary"
              title={`Ver documento original: ${source.documentTitle}`}
              aria-label={`Ver documento original: ${source.documentTitle}`}
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </span>
        ))}
      </div>
    </aside>
  );
});
