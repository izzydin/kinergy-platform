import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Badge, Alert, AlertDescription } from '@kinergy-platform/ui';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Archive,
  ShieldAlert,
  Hash,
  Compass,
  ChevronLeft,
  ChevronRight,
  X,
  Copy,
  Check,
  RefreshCw,
  FolderTree,
  FileQuestion,
} from 'lucide-react';
import type { RAGSourceCitationDto } from '../types/assistant.types';
import { useCitationDetail } from '../hooks/use-conversation-queries';

export interface SourceDetailsDrawerProps {
  /** Whether the drawer is visibly open */
  readonly isOpen: boolean;
  /** Callback invoked when the user dismisses the drawer (backdrop, Esc, close button) */
  readonly onClose: () => void;
  /** Active citation snapshot to display */
  readonly citation: RAGSourceCitationDto | null;
  /** 0-based index of the active citation */
  readonly citationIndex?: number;
  /** Optional full list of citations for the message to enable Next/Previous cycling */
  readonly allCitations?: readonly RAGSourceCitationDto[];
  /** Callback to switch active citation from inside the drawer */
  readonly onSelectCitation?: (citation: RAGSourceCitationDto, index: number) => void;
  /** Parent conversation ID for remote verification */
  readonly conversationId?: string;
  /** Parent assistant message ID for remote verification */
  readonly messageId?: string;
  /** Callback when user clicks 'Abrir documento completo' */
  readonly onPreviewDocument?: (documentId: string, pageNumber?: number | null) => void;
  /** Custom CSS classes */
  readonly className?: string;
}

/**
 * Format raw bytes into human-readable unit (B, KB, MB).
 */
function formatFileSize(bytes?: number | null): string | null {
  if (bytes === undefined || bytes === null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format MIME type into readable badge label.
 */
function formatMimeType(mime?: string | null): string | null {
  if (!mime) return null;
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('officedocument')) return 'DOCX';
  if (mime.includes('markdown')) return 'Markdown';
  if (mime.includes('text')) return 'Texto';
  return mime.split('/')[1]?.toUpperCase() ?? mime;
}

/**
 * Source Details Drawer Component.
 *
 * Implements a slide-over panel for verifying RAG evidence provenance:
 * 1. Document Identity: Title, original filename, format, version, lifecycle status.
 * 2. Location & Hierarchy: Page number, section breadcrumbs, chunk sequence.
 * 3. Verbatim Evidence Excerpt: Paragraph-preserved, strictly escaped, copyable.
 * 4. Retrieval Provenance: Relevance score, retrieval rank, strategy.
 * 5. Dynamic Preview & Access: Server-authoritative role verification handling deleted/restricted states.
 */
export const SourceDetailsDrawer: React.FC<SourceDetailsDrawerProps> = React.memo(
  ({
    isOpen,
    onClose,
    citation,
    citationIndex = 0,
    allCitations,
    onSelectCitation,
    conversationId,
    messageId,
    onPreviewDocument,
    className = '',
  }) => {
    const [copied, setCopied] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Reset copied status when active citation changes
    useEffect(() => {
      setCopied(false);
    }, [citation?.citationId, citation?.documentId, citationIndex]);

    // Handle Escape key to close
    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Remote authoritative fetch
    const shouldFetch = Boolean(
      isOpen &&
      conversationId &&
      messageId &&
      citation?.citationId &&
      citation.citationId.trim().length > 0,
    );

    const {
      data: remoteDetail,
      isLoading,
      isError,
      refetch,
    } = useCitationDetail(conversationId, messageId, citation?.citationId ?? undefined, {
      enabled: shouldFetch,
    });

    // Merge remote verified detail with fallback citation snapshot
    const displayTitle =
      remoteDetail?.documentTitle ||
      remoteDetail?.documentTitleSnapshot ||
      citation?.documentTitle ||
      'Documento de conocimiento';

    const documentId = remoteDetail?.documentId || citation?.documentId || '';
    const originalFileName = remoteDetail?.originalFileName || citation?.originalFileName || null;
    const mimeType = remoteDetail?.mimeType || citation?.mimeType || null;
    const fileSizeBytes = remoteDetail?.fileSizeBytes ?? citation?.fileSizeBytes ?? null;
    const versionNumber =
      remoteDetail?.documentVersionNumber ?? citation?.documentVersionNumber ?? null;

    const excerpt =
      remoteDetail?.excerpt || citation?.excerpt || 'Extracto de evidencia no disponible.';
    const pageNumber = remoteDetail?.pageNumber ?? citation?.pageNumber;
    const headingPath = remoteDetail?.headingPath ?? citation?.headingPath;
    const relevanceScore = remoteDetail?.relevanceScore ?? citation?.relevanceScore;
    const retrievalRank = remoteDetail?.retrievalRank ?? citation?.retrievalRank;
    const sourceStrategy = remoteDetail?.sourceStrategy ?? citation?.sourceStrategy;
    const chunkId = remoteDetail?.chunkId || citation?.chunkId;

    const previewStatus =
      remoteDetail?.previewStatus ?? citation?.previewStatus ?? 'DOCUMENT_AVAILABLE';

    const canPreview =
      remoteDetail?.canPreview !== undefined
        ? remoteDetail.canPreview
        : citation?.canPreview !== undefined
          ? citation.canPreview
          : previewStatus === 'DOCUMENT_AVAILABLE';

    const previewUnavailableReason =
      remoteDetail?.previewUnavailableReason ?? citation?.previewUnavailableReason;

    const formattedScore =
      relevanceScore !== undefined && relevanceScore !== null
        ? `${Math.round(relevanceScore * 100)}% de relevancia`
        : null;

    // Copy excerpt action
    const handleCopyExcerpt = useCallback(() => {
      if (!excerpt) return;
      navigator.clipboard.writeText(excerpt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }, [excerpt]);

    // Cycling through citations
    const hasPrevious = Boolean(allCitations && citationIndex > 0);
    const hasNext = Boolean(allCitations && citationIndex < allCitations.length - 1);

    const handlePrev = useCallback(() => {
      const prevCitation = allCitations?.[citationIndex - 1];
      if (prevCitation) {
        onSelectCitation?.(prevCitation, citationIndex - 1);
      }
    }, [allCitations, citationIndex, onSelectCitation]);

    const handleNext = useCallback(() => {
      const nextCitation = allCitations?.[citationIndex + 1];
      if (nextCitation) {
        onSelectCitation?.(nextCitation, citationIndex + 1);
      }
    }, [allCitations, citationIndex, onSelectCitation]);

    const handlePreviewClick = useCallback(() => {
      if (canPreview && documentId) {
        onPreviewDocument?.(documentId, pageNumber);
      }
    }, [canPreview, documentId, pageNumber, onPreviewDocument]);

    if (!isOpen || !citation) {
      return null;
    }

    return (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-details-title"
        aria-describedby="source-details-description"
        data-testid="source-details-drawer"
      >
        {/* Backdrop click dismiss */}
        <div
          className="fixed inset-0 -z-10"
          onClick={onClose}
          aria-hidden="true"
          data-testid="source-details-backdrop"
        />

        {/* Drawer Slide-Over Panel */}
        <div
          ref={panelRef}
          className={`relative flex h-full w-full max-w-lg flex-col bg-background border-l border-border shadow-2xl overflow-y-auto duration-200 animate-in slide-in-from-right ${className}`}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/80 bg-background/95 px-5 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                [{citationIndex + 1}]
              </span>
              <div>
                <h2 id="source-details-title" className="text-sm font-semibold text-foreground">
                  Detalles de la fuente
                </h2>
                <p id="source-details-description" className="text-[11px] text-muted-foreground">
                  Verificación de procedencia y evidencia RAG
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Pagination controls if multiple citations */}
              {allCitations && allCitations.length > 1 && (
                <div className="flex items-center mr-2 border rounded-md border-border/70 p-0.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!hasPrevious}
                    aria-label="Fuente anterior"
                    data-testid="prev-citation-btn"
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] px-1 font-mono text-muted-foreground">
                    {citationIndex + 1}/{allCitations.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!hasNext}
                    aria-label="Siguiente fuente"
                    data-testid="next-citation-btn"
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar panel de fuente"
                data-testid="close-drawer-btn"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 space-y-5 p-5">
            {/* Loading Indicator */}
            {isLoading && (
              <div
                className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
                data-testid="drawer-loading-skeleton"
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                <span>Verificando metadatos y permisos en el servidor...</span>
              </div>
            )}

            {/* Error Banner */}
            {isError && (
              <Alert variant="destructive" className="py-2.5">
                <AlertDescription className="text-xs flex items-center justify-between">
                  <span>No se pudieron sincronizar los metadatos más recientes del servidor.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    className="h-7 text-xs ml-2 gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Reintentar
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* 1. Document Identity Card */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Documento fuente</span>
                  </div>
                  <h3
                    className="text-base font-semibold leading-snug text-foreground break-words"
                    data-testid="drawer-document-title"
                  >
                    {displayTitle}
                  </h3>
                </div>

                {/* Status Badges */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {previewStatus === 'DOCUMENT_AVAILABLE' && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px]"
                    >
                      Activo
                    </Badge>
                  )}
                  {previewStatus === 'DOCUMENT_SOFT_DELETED' && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-[10px] gap-1"
                    >
                      <Archive className="h-3 w-3" /> Archivado
                    </Badge>
                  )}
                  {previewStatus === 'DOCUMENT_RESTRICTED' && (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 text-destructive bg-destructive/10 text-[10px] gap-1"
                    >
                      <ShieldAlert className="h-3 w-3" /> Restringido
                    </Badge>
                  )}
                  {previewStatus === 'EXCERPT_ONLY' && (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                      Solo extracto
                    </Badge>
                  )}
                </div>
              </div>

              {/* Identity Metadata Pills */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                {originalFileName && (
                  <div
                    className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted/60 px-2 py-0.5 rounded-sm truncate max-w-full"
                    title={originalFileName}
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{originalFileName}</span>
                  </div>
                )}
                {mimeType && (
                  <div className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-sm">
                    <span>Formato:</span>
                    <strong className="text-foreground">{formatMimeType(mimeType)}</strong>
                  </div>
                )}
                {fileSizeBytes !== null && (
                  <div className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-sm">
                    <span>Tamaño:</span>
                    <strong className="text-foreground">{formatFileSize(fileSizeBytes)}</strong>
                  </div>
                )}
                {versionNumber !== null && (
                  <div className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-sm">
                    <span>Versión:</span>
                    <strong className="text-foreground">v{versionNumber}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Location & Hierarchy */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Ubicación en el documento
              </h4>

              <div className="flex flex-wrap items-center gap-2">
                {pageNumber !== undefined && pageNumber !== null ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md">
                    <Hash className="h-3 w-3 text-primary" />
                    <span>Página {pageNumber}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
                    <span>Sin número de página</span>
                  </div>
                )}

                {chunkId && (
                  <div className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-1 rounded-md">
                    <span>Fragmento:</span>
                    <span className="truncate max-w-[140px]" title={chunkId}>
                      {chunkId}
                    </span>
                  </div>
                )}
              </div>

              {/* Heading Hierarchy Breadcrumbs */}
              {headingPath && headingPath.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <div className="text-[11px] font-medium text-muted-foreground mb-1">
                    Jerarquía de secciones:
                  </div>
                  <nav
                    aria-label="Jerarquía de secciones"
                    className="flex flex-wrap items-center gap-1 text-xs text-foreground"
                  >
                    {headingPath.map((heading, idx) => (
                      <React.Fragment key={`${heading}-${idx}`}>
                        {idx > 0 && (
                          <ChevronRight
                            className="h-3 w-3 text-muted-foreground/60 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="bg-muted/50 px-1.5 py-0.5 rounded-xs font-medium text-[11px]">
                          {heading}
                        </span>
                      </React.Fragment>
                    ))}
                  </nav>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Sección principal / sin encabezados jerárquicos registrados.
                </p>
              )}
            </div>

            {/* 3. Verbatim Evidence Excerpt */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Extracto recuperado (evidencia)
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyExcerpt}
                  aria-label="Copiar extracto al portapapeles"
                  data-testid="copy-excerpt-btn"
                  className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-500 font-medium">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Verbatim Excerpt Card (Strictly Text-Escaped & Whitespace Preserved) */}
              <div
                data-testid="drawer-verbatim-excerpt"
                className="rounded-md border border-border/70 bg-muted/30 p-3.5 text-xs text-foreground font-sans leading-relaxed whitespace-pre-wrap select-text max-h-64 overflow-y-auto"
              >
                {excerpt}
              </div>

              <p className="text-[10px] text-muted-foreground leading-normal italic">
                Este extracto corresponde al fragmento exacto provisto al modelo de IA durante la
                generación y no ha sido modificado.
              </p>
            </div>

            {/* 4. Retrieval Provenance Metadata */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Métricas de recuperación
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Score */}
                <div className="rounded-md bg-muted/40 p-2 border border-border/50">
                  <div className="text-[10px] text-muted-foreground">Relevancia clínica</div>
                  <div className="font-semibold text-foreground mt-0.5">
                    {formattedScore ?? 'No computada'}
                  </div>
                </div>

                {/* Rank */}
                <div className="rounded-md bg-muted/40 p-2 border border-border/50">
                  <div className="text-[10px] text-muted-foreground">Posición recuperada</div>
                  <div className="font-semibold text-foreground mt-0.5">
                    {retrievalRank !== undefined && retrievalRank !== null
                      ? `#${retrievalRank} en ranking`
                      : 'Posición no registrada'}
                  </div>
                </div>

                {/* Strategy */}
                <div className="col-span-2 rounded-md bg-muted/40 p-2 border border-border/50 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Estrategia de búsqueda</span>
                  <span className="font-mono text-[11px] font-medium text-foreground">
                    {sourceStrategy ?? 'Híbrida'}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Status Warnings & Document Preview Actions */}
            {previewStatus === 'DOCUMENT_SOFT_DELETED' && (
              <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
                <Archive className="h-4 w-4 shrink-0 text-amber-600" />
                <AlertDescription className="text-xs">
                  {previewUnavailableReason ||
                    'El documento fuente ha sido archivado o eliminado. El extracto histórico se mantiene como evidencia auditable.'}
                </AlertDescription>
              </Alert>
            )}

            {previewStatus === 'DOCUMENT_RESTRICTED' && (
              <Alert className="border-destructive/40 bg-destructive/5 text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                <AlertDescription className="text-xs">
                  {previewUnavailableReason ||
                    'El acceso al documento completo está restringido por políticas de seguridad de roles.'}
                </AlertDescription>
              </Alert>
            )}

            {previewStatus === 'EXCERPT_ONLY' && (
              <Alert className="border-border bg-muted/40 text-muted-foreground">
                <FileQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />
                <AlertDescription className="text-xs">
                  {previewUnavailableReason ||
                    'El documento completo no se encuentra disponible para previsualización directa.'}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Drawer Sticky Footer / Action Bar */}
          <div className="sticky bottom-0 border-t border-border/80 bg-background/95 px-5 py-3 backdrop-blur-sm flex items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cerrar
            </Button>

            {canPreview ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handlePreviewClick}
                data-testid="open-full-document-btn"
                className="gap-1.5 text-xs font-medium"
              >
                <span>Abrir documento completo</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled
                className="opacity-50 text-xs cursor-not-allowed"
                title={previewUnavailableReason ?? 'Previsualización no disponible'}
              >
                Vista previa no disponible
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

SourceDetailsDrawer.displayName = 'SourceDetailsDrawer';
