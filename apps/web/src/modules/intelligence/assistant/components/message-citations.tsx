import React, { useState, useCallback } from 'react';
import { BookOpen } from 'lucide-react';
import type { RAGSourceCitationDto } from '../types/assistant.types';
import { CitationBadge } from './citation-badge';
import { CitationDetailDialog } from './citation-detail-dialog';
import { SourceDetailsDrawer } from './source-details-drawer';

export interface MessageCitationsProps {
  readonly sources: readonly RAGSourceCitationDto[];
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly displayMode?: 'drawer' | 'dialog';
  readonly onPreviewDocument?: (
    documentId: string,
    pageNumber?: number | null,
    citationId?: string | null,
    messageId?: string | null,
  ) => void;
  readonly className?: string;
}

/**
 * Message Citations Tray Component.
 *
 * Renders verified source citations associated with an assistant message:
 * - Deterministic numbering [1], [2] matching backend retrieval rank
 * - Truncated document title pills with page numbers
 * - Clickable interaction opening comprehensive SourceDetailsDrawer or CitationDetailDialog
 * - Graceful handling of missing metadata and unavailable documents
 * - Renders nothing if no sources exist
 */
export const MessageCitations: React.FC<MessageCitationsProps> = React.memo(
  ({
    sources,
    conversationId,
    messageId,
    displayMode = 'dialog',
    onPreviewDocument,
    className = '',
  }) => {
    const [selectedCitation, setSelectedCitation] = useState<{
      source: RAGSourceCitationDto;
      index: number;
    } | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const handleCitationClick = useCallback((source: RAGSourceCitationDto, index: number) => {
      setSelectedCitation({ source, index });
      setIsOpen(true);
    }, []);

    const handleClose = useCallback(() => {
      setIsOpen(false);
      setSelectedCitation(null);
    }, []);

    const handleSelectCitation = useCallback((source: RAGSourceCitationDto, index: number) => {
      setSelectedCitation({ source, index });
    }, []);

    if (!sources || sources.length === 0) {
      return null;
    }

    return (
      <>
        <aside
          data-testid="message-citations"
          aria-label={`Fuentes verificadas (${sources.length})`}
          className={`mt-3 border-t border-border/40 pt-2 flex flex-col gap-1.5 ${className}`}
        >
          {/* Citation Tray Header */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground select-none">
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Fuentes verificadas ({sources.length}):</span>
          </div>

          {/* Citation Badges Container */}
          <ul className="flex flex-wrap gap-1.5" data-testid="citations-badge-list" role="list">
            {sources.map((source, idx) => (
              <li key={`${source.documentId}-${source.chunkId ?? idx}-${idx}`}>
                <CitationBadge source={source} index={idx} onClick={handleCitationClick} />
              </li>
            ))}
          </ul>
        </aside>

        {/* Detailed Modal Dialog or Slide-Over Drawer */}
        {isOpen &&
          selectedCitation &&
          (displayMode === 'drawer' ? (
            <SourceDetailsDrawer
              isOpen={isOpen}
              onClose={handleClose}
              citation={selectedCitation.source}
              citationIndex={selectedCitation.index}
              allCitations={sources}
              onSelectCitation={handleSelectCitation}
              conversationId={conversationId}
              messageId={messageId}
              onPreviewDocument={onPreviewDocument}
            />
          ) : (
            <CitationDetailDialog
              open={isOpen}
              onOpenChange={(open) => {
                if (!open) handleClose();
                else setIsOpen(true);
              }}
              citation={selectedCitation.source}
              citationIndex={selectedCitation.index}
              conversationId={conversationId}
              messageId={messageId}
              onPreviewDocument={onPreviewDocument}
            />
          ))}
      </>
    );
  },
);

MessageCitations.displayName = 'MessageCitations';
