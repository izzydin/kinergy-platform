import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Alert,
  AlertDescription,
} from '@kinergy-platform/ui';
import {
  BookOpen,
  ExternalLink,
  FileText,
  FileQuestion,
  Archive,
  ShieldAlert,
  Hash,
  Compass,
  Percent,
  Layers,
  Loader2,
} from 'lucide-react';
import type { RAGSourceCitationDto } from '../types/assistant.types';
import { useCitationDetail } from '../hooks/use-conversation-queries';

export interface CitationDetailDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly citation: RAGSourceCitationDto | null;
  readonly citationIndex?: number;
  readonly conversationId?: string;
  readonly messageId?: string;
}

/**
 * Citation Detail Modal Dialog Component.
 *
 * Provides:
 * - Detailed view of verified evidence chunk retrieved by RAG pipeline.
 * - Snapshot document title and full excerpt without truncation.
 * - Provenance metadata: page numbers, heading breadcrumbs, relevance score, retrieval strategy and rank.
 * - Non-destructive handling of deleted or restricted source documents.
 * - Secure direct navigation link to original document when authorized.
 */
export const CitationDetailDialog: React.FC<CitationDetailDialogProps> = React.memo(
  ({ open, onOpenChange, citation, citationIndex = 0, conversationId, messageId }) => {
    // Attempt to fetch fresh detail from server if citationId, conversationId, and messageId are provided
    const shouldFetch = Boolean(
      open &&
      conversationId &&
      messageId &&
      citation?.citationId &&
      citation.citationId.trim().length > 0,
    );

    const { data: remoteDetail, isLoading } = useCitationDetail(
      conversationId,
      messageId,
      citation?.citationId ?? undefined,
      { enabled: shouldFetch },
    );

    if (!citation) return null;

    // Merge remote verified detail with fallback citation snapshot
    const displayTitle =
      remoteDetail?.documentTitle ||
      remoteDetail?.documentTitleSnapshot ||
      citation.documentTitle ||
      'Documento de conocimiento';

    const documentId = remoteDetail?.documentId || citation.documentId;
    const excerpt =
      remoteDetail?.excerpt || citation.excerpt || 'Extracto de evidencia no disponible.';
    const pageNumber = remoteDetail?.pageNumber ?? citation.pageNumber;
    const headingPath = remoteDetail?.headingPath ?? citation.headingPath;
    const relevanceScore = remoteDetail?.relevanceScore ?? citation.relevanceScore;
    const retrievalRank = remoteDetail?.retrievalRank ?? citation.retrievalRank;
    const sourceStrategy = remoteDetail?.sourceStrategy ?? citation.sourceStrategy;
    const previewStatus =
      remoteDetail?.previewStatus ?? citation.previewStatus ?? 'DOCUMENT_AVAILABLE';

    const canPreview =
      remoteDetail?.canPreview !== undefined
        ? remoteDetail.canPreview
        : citation.canPreview !== undefined
          ? citation.canPreview
          : previewStatus === 'DOCUMENT_AVAILABLE';

    const previewUnavailableReason =
      remoteDetail?.previewUnavailableReason ?? citation.previewUnavailableReason;

    const formattedScore =
      relevanceScore !== undefined && relevanceScore !== null
        ? `${Math.round(relevanceScore * 100)}% de relevancia`
        : null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-lg md:max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden"
          data-testid="citation-detail-dialog"
          aria-label={`Detalle de fuente verificada [${citationIndex + 1}]`}
        >
          {/* Header */}
          <DialogHeader className="shrink-0 space-y-1.5 pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wide uppercase">
              <BookOpen className="h-4 w-4" />
              <span>Fuente Verificada [{citationIndex + 1}]</span>
            </div>
            <DialogTitle className="text-base font-bold text-foreground leading-snug line-clamp-2">
              {displayTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
              {documentId && (
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  ID: {documentId.substring(0, 18)}...
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1 text-xs">
            {isLoading && (
              <div
                className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
                data-testid="citation-detail-loading"
              >
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Cargando metadatos de fuente...</span>
              </div>
            )}

            {/* Provenance Metadata Pills */}
            <div className="flex flex-wrap gap-1.5" data-testid="citation-metadata-pills">
              {pageNumber !== undefined && pageNumber !== null && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  <Hash className="h-3 w-3 text-primary" />
                  <span>Página {pageNumber}</span>
                </span>
              )}

              {formattedScore && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  <Percent className="h-3 w-3 text-emerald-500" />
                  <span>{formattedScore}</span>
                </span>
              )}

              {retrievalRank !== undefined && retrievalRank !== null && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  <Layers className="h-3 w-3 text-primary" />
                  <span>Rango #{retrievalRank}</span>
                </span>
              )}

              {sourceStrategy && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Compass className="h-3 w-3 text-muted-foreground/70" />
                  <span className="uppercase tracking-wider">{sourceStrategy}</span>
                </span>
              )}
            </div>

            {/* Section / Heading Path Hierarchy */}
            {headingPath && headingPath.length > 0 && (
              <div
                className="rounded-lg border border-border/50 bg-muted/30 p-2.5 space-y-1"
                data-testid="citation-heading-path"
              >
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Sección / Jerarquía documental
                </span>
                <p className="text-xs text-foreground/90 font-medium flex items-center flex-wrap gap-1">
                  {headingPath.map((heading, i) => (
                    <React.Fragment key={`${heading}-${i}`}>
                      <span>{heading}</span>
                      {i < headingPath.length - 1 && (
                        <span className="text-muted-foreground/60">/</span>
                      )}
                    </React.Fragment>
                  ))}
                </p>
              </div>
            )}

            {/* Verified Excerpt Box */}
            <div className="space-y-1.5" data-testid="citation-excerpt-container">
              <span className="text-[11px] font-semibold text-foreground/80 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Extracto de evidencia recuperado</span>
              </span>
              <blockquote
                data-testid="citation-excerpt-text"
                className="rounded-lg border border-border/70 bg-card p-3.5 text-xs text-foreground leading-relaxed italic select-text whitespace-pre-wrap shadow-2xs"
              >
                "{excerpt}"
              </blockquote>
            </div>

            {/* Status Feedback Banners for Unavailable / Restricted States */}
            {previewStatus === 'DOCUMENT_SOFT_DELETED' && (
              <Alert
                variant="destructive"
                className="py-2.5 text-xs border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                data-testid="citation-status-soft-deleted"
              >
                <div className="flex items-start gap-2">
                  <Archive className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <AlertDescription className="text-xs leading-normal">
                    {previewUnavailableReason ||
                      'Documento archivado: El documento de origen ha sido despublicado o archivado. El extracto de evidencia histórico se preserva para auditoría y trazabilidad clínica.'}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {previewStatus === 'DOCUMENT_RESTRICTED' && (
              <Alert
                className="py-2.5 text-xs border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                data-testid="citation-status-restricted"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <AlertDescription className="text-xs leading-normal">
                    {previewUnavailableReason ||
                      'Acceso restringido: La visualización completa del documento está restringida según la política de seguridad por roles. El extracto verificado ha sido validado para esta respuesta.'}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {previewStatus === 'EXCERPT_ONLY' && (
              <Alert
                className="py-2.5 text-xs border-border/60 bg-muted/30 text-muted-foreground"
                data-testid="citation-status-excerpt-only"
              >
                <div className="flex items-start gap-2">
                  <FileQuestion className="h-4 w-4 shrink-0 mt-0.5" />
                  <AlertDescription className="text-xs leading-normal">
                    {previewUnavailableReason ||
                      'Visualización completa no disponible para este documento. El extracto verificado se muestra en la sección superior.'}
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </div>

          {/* Footer Actions */}
          <DialogFooter className="shrink-0 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs cursor-pointer"
              data-testid="citation-dialog-close-btn"
            >
              Cerrar
            </Button>

            {canPreview && previewStatus === 'DOCUMENT_AVAILABLE' && documentId && (
              <a
                href={`/api/v1/ai/knowledge/documents/${documentId}/content`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="citation-open-document-link"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Ver documento original</span>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

CitationDetailDialog.displayName = 'CitationDetailDialog';
