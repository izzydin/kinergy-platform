import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ShieldAlert,
  Archive,
  FileQuestion,
  AlertTriangle,
  Compass,
  Quote,
  Check,
  Copy,
  ArrowLeft,
} from 'lucide-react';
import { useCitationPreview } from '../hooks/use-conversation-queries';
import { conversationApi } from '../api/conversation.api';
import { MarkdownRenderer } from './markdown-renderer';

export interface DocumentPreviewProps {
  /** Whether the preview modal is visibly open */
  readonly isOpen: boolean;
  /** Callback invoked when closing preview and returning to chat */
  readonly onClose: () => void;
  /** Conversation identifier for authorized verification */
  readonly conversationId?: string;
  /** Assistant message identifier */
  readonly messageId?: string;
  /** Citation identifier being inspected */
  readonly citationId?: string;
  /** Fallback document identifier */
  readonly documentId?: string;
  /** Initial page number cited, if known */
  readonly initialPageNumber?: number | null;
  /** Fallback document title */
  readonly documentTitle?: string;
  /** Fallback section hierarchy breadcrumbs */
  readonly headingPath?: readonly string[];
  /** Fallback verbatim excerpt */
  readonly excerpt?: string;
  /** Custom CSS classes */
  readonly className?: string;
}

/**
 * Format bytes into human-readable size.
 */
function formatFileSize(bytes?: number | null): string | null {
  if (bytes === undefined || bytes === null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cleanly format MIME types for display.
 */
function formatMimeType(mime?: string | null): string {
  if (!mime) return 'Desconocido';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'text/plain') return 'Texto Plano';
  if (mime === 'text/markdown') return 'Markdown';
  if (mime === 'text/csv') return 'CSV';
  if (mime === 'application/json') return 'JSON';
  if (mime.includes('officedocument.wordprocessingml') || mime.includes('word'))
    return 'Word (DOCX)';
  return mime.split('/')[1]?.toUpperCase() ?? mime;
}

/**
 * Document Preview Component (CIT.06).
 *
 * Implements secure, authorized document previews accessible through verified citations:
 * 1. Multi-tenant and user authorization validation via backend preview token.
 * 2. PDF rendering with page navigation (Prev/Next, cited page jump, zoom controls).
 * 3. Formatted plain text, markdown, CSV, and JSON rendering.
 * 4. Explicit handling for unsupported formats (metadata display + authorized download if permitted).
 * 5. Lifecycle states: Loading, Ready, Unauthorized, Deleted, Unsupported, and Error.
 * 6. Accessible controls, Escape key handling, and clean return-to-chat behavior.
 */
export const DocumentPreview: React.FC<DocumentPreviewProps> = React.memo(
  ({
    isOpen,
    onClose,
    conversationId,
    messageId,
    citationId,
    documentId: _fallbackDocumentId,
    initialPageNumber,
    documentTitle: fallbackTitle,
    headingPath: fallbackHeadingPath,
    excerpt: fallbackExcerpt,
    className = '',
  }) => {
    // 1. Fetch authorized preview metadata & short-lived token
    const shouldFetch = Boolean(
      isOpen &&
      conversationId &&
      messageId &&
      citationId &&
      conversationId.trim().length > 0 &&
      messageId.trim().length > 0 &&
      citationId.trim().length > 0,
    );

    const {
      data: previewData,
      isLoading,
      isError,
      error,
      refetch,
    } = useCitationPreview(conversationId, messageId, citationId, {
      enabled: shouldFetch,
    });

    // 2. Local State for PDF navigation and Text content
    const citedPage = previewData?.pageNumber ?? initialPageNumber ?? null;
    const [currentPage, setCurrentPage] = useState<number>(citedPage ?? 1);
    const [zoom, setZoom] = useState<number>(100);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
    const [textLoadError, setTextLoadError] = useState<string | null>(null);
    const [copiedExcerpt, setCopiedExcerpt] = useState<boolean>(false);

    // Synchronize page when citation or preview data updates
    useEffect(() => {
      if (citedPage) {
        setCurrentPage(citedPage);
      } else {
        setCurrentPage(1);
      }
      setZoom(100);
      setTextContent(null);
      setTextLoadError(null);
    }, [citedPage, citationId]);

    // Handle Escape key
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

    // 3. Derived metadata (strictly filtered by active citationId to prevent stale async race conditions)
    const isMatchingPreview = Boolean(
      previewData && citationId && previewData.citationId === citationId,
    );
    const activePreviewData = isMatchingPreview ? previewData : null;

    const title =
      activePreviewData?.documentTitle ||
      activePreviewData?.documentTitleSnapshot ||
      fallbackTitle ||
      'Documento de conocimiento';

    const mimeType = activePreviewData?.mimeType ?? null;
    const isPdf = mimeType === 'application/pdf';
    const isTextual =
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      mimeType === 'text/csv' ||
      mimeType === 'application/json';

    const previewStatus =
      activePreviewData?.previewStatus ??
      (isError ? 'ERROR' : isLoading ? 'LOADING' : 'DOCUMENT_AVAILABLE');
    const isUnsupported =
      activePreviewData?.supportedFormat === false ||
      previewStatus === 'UNSUPPORTED_FORMAT' ||
      (!isPdf && !isTextual && activePreviewData?.canPreview === false);
    const isRestricted = previewStatus === 'DOCUMENT_RESTRICTED';
    const isDeleted =
      previewStatus === 'DOCUMENT_DELETED' || previewStatus === 'DOCUMENT_SOFT_DELETED';
    const isExcerptOnly = previewStatus === 'EXCERPT_ONLY';

    const effectiveHeadingPath = activePreviewData?.headingPath ?? fallbackHeadingPath ?? [];
    const effectiveExcerpt = activePreviewData?.excerpt ?? fallbackExcerpt ?? '';

    // 4. Fetch textual content if format is plain text / markdown / csv / json
    useEffect(() => {
      if (
        !isOpen ||
        !activePreviewData?.canPreview ||
        !activePreviewData.supportedFormat ||
        !isTextual ||
        !conversationId ||
        !messageId ||
        !citationId
      ) {
        return;
      }

      let isMounted = true;
      setIsLoadingText(true);
      setTextLoadError(null);

      conversationApi
        .getCitationDocumentContentText(
          conversationId,
          messageId,
          citationId,
          activePreviewData.previewToken,
        )
        .then((text) => {
          if (isMounted) {
            setTextContent(text);
            setIsLoadingText(false);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            setTextLoadError(err instanceof Error ? err.message : 'Error al cargar texto');
            setIsLoadingText(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [
      isOpen,
      activePreviewData?.canPreview,
      activePreviewData?.supportedFormat,
      activePreviewData?.previewToken,
      isTextual,
      conversationId,
      messageId,
      citationId,
    ]);

    // 5. Iframe preview URL with page and zoom parameters
    const streamingUrl = useMemo(() => {
      if (!conversationId || !messageId || !citationId || !activePreviewData?.previewToken)
        return '';
      const base = conversationApi.getCitationDocumentContentUrl(
        conversationId,
        messageId,
        citationId,
        activePreviewData.previewToken,
      );
      return `${base}#page=${currentPage}&zoom=${zoom}`;
    }, [conversationId, messageId, citationId, activePreviewData?.previewToken, currentPage, zoom]);

    // 6. Navigation handlers
    const handlePrevPage = useCallback(() => {
      setCurrentPage((prev) => Math.max(1, prev - 1));
    }, []);

    const handleNextPage = useCallback(() => {
      setCurrentPage((prev) => prev + 1);
    }, []);

    const handleJumpToCitedPage = useCallback(() => {
      if (citedPage) {
        setCurrentPage(citedPage);
      }
    }, [citedPage]);

    const handleZoomIn = useCallback(() => {
      setZoom((prev) => Math.min(200, prev + 25));
    }, []);

    const handleZoomOut = useCallback(() => {
      setZoom((prev) => Math.max(50, prev - 25));
    }, []);

    const handleZoomReset = useCallback(() => {
      setZoom(100);
    }, []);

    const handleCopyExcerpt = useCallback(() => {
      if (effectiveExcerpt) {
        navigator.clipboard.writeText(effectiveExcerpt).then(() => {
          setCopiedExcerpt(true);
          setTimeout(() => setCopiedExcerpt(false), 2000);
        });
      }
    }, [effectiveExcerpt]);

    const handleReturnToMessage = useCallback(() => {
      onClose();
      if (messageId && typeof document !== 'undefined') {
        setTimeout(() => {
          const el = document.getElementById(`message-${messageId}`);
          if (el) {
            el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            el.focus?.();
          }
        }, 50);
      }
    }, [onClose, messageId]);

    if (!isOpen) return null;

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={`sm:max-w-4xl md:max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden ${className}`}
          data-testid="document-preview-modal"
          aria-label={`Previsualización del documento: ${title}`}
        >
          {/* Header */}
          <DialogHeader className="shrink-0 px-6 py-4 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1 pr-6 min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <Badge
                  variant="outline"
                  className="text-[11px] font-medium uppercase tracking-wider"
                >
                  {formatMimeType(mimeType)}
                </Badge>
                {previewData?.originalFileName && (
                  <span className="text-xs text-muted-foreground truncate font-mono">
                    {previewData.originalFileName}
                  </span>
                )}
              </div>
              <DialogTitle
                className="text-base font-bold text-foreground leading-snug truncate"
                title={title}
              >
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2">
                {citedPage && (
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    Página citada: {citedPage}
                  </span>
                )}
                {formatFileSize(previewData?.fileSizeBytes) && (
                  <span>• {formatFileSize(previewData?.fileSizeBytes)}</span>
                )}
                {previewData?.documentVersionNumber && (
                  <span>• v{previewData.documentVersionNumber}</span>
                )}
              </DialogDescription>
            </div>

            {/* Close Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Cerrar vista previa y volver al chat"
              data-testid="preview-close-btn"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {/* Citation Context Bar */}
          {(effectiveHeadingPath.length > 0 || effectiveExcerpt) && (
            <div
              className="shrink-0 bg-muted/40 border-b border-border/40 px-6 py-2.5 text-xs text-muted-foreground"
              data-testid="preview-excerpt-banner"
            >
              {effectiveHeadingPath.length > 0 && (
                <div className="flex items-center gap-1.5 text-foreground/80 font-medium mb-1 truncate">
                  <Compass className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{effectiveHeadingPath.join(' › ')}</span>
                </div>
              )}
              {effectiveExcerpt && (
                <div className="flex items-start justify-between gap-3 bg-background/80 rounded-md p-2 border border-border/50">
                  <div className="flex items-start gap-1.5 italic text-foreground/90 overflow-hidden text-ellipsis line-clamp-2">
                    <Quote className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>&ldquo;{effectiveExcerpt}&rdquo;</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {messageId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleReturnToMessage}
                        className="h-6 px-2 text-[11px] shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                        title="Volver al mensaje de origen en la conversación"
                        data-testid="return-to-message-button"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        <span>Volver al mensaje</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyExcerpt}
                      className="h-6 px-2 text-[11px] shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                      title="Copiar extracto"
                    >
                      {copiedExcerpt ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto p-4 bg-muted/10 flex flex-col justify-center items-center">
            {/* 1. Loading State */}
            {isLoading && (
              <div
                className="w-full h-full flex flex-col items-center justify-center p-8 space-y-4"
                data-testid="preview-loading"
              >
                <Skeleton className="w-3/4 h-8 rounded-md" />
                <Skeleton className="w-full h-64 rounded-md" />
                <Skeleton className="w-5/6 h-24 rounded-md" />
                <p className="text-xs text-muted-foreground animate-pulse">
                  Verificando autorización y resolviendo documento seguro...
                </p>
              </div>
            )}

            {/* 2. Unauthorized State */}
            {!isLoading && isRestricted && (
              <div
                className="w-full max-w-md p-6 bg-background rounded-lg border border-destructive/30 shadow-xs text-center space-y-3"
                data-testid="preview-unauthorized"
              >
                <div className="mx-auto w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Acceso Restringido</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {previewData?.previewUnavailableReason ||
                    'La visualización completa de este documento está restringida para su rol o permisos de usuario. El extracto verificado ha sido preservado como evidencia auditable.'}
                </p>
              </div>
            )}

            {/* 3. Deleted / Archived State */}
            {!isLoading && isDeleted && (
              <div
                className="w-full max-w-md p-6 bg-background rounded-lg border border-border shadow-xs text-center space-y-3"
                data-testid="preview-deleted"
              >
                <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Archive className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Documento No Disponible</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {previewData?.previewUnavailableReason ||
                    'El documento original ha sido archivado o eliminado del almacenamiento. La cita y su extracto se mantienen registrados con fines de trazabilidad.'}
                </p>
              </div>
            )}

            {/* 3b. Excerpt Only (Version mismatch or missing file) State */}
            {!isLoading && !isRestricted && !isDeleted && isExcerptOnly && (
              <div
                className="w-full max-w-md p-6 bg-background rounded-lg border border-border shadow-xs text-center space-y-3"
                data-testid="preview-excerpt-only"
              >
                <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Archive className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Previsualización No Disponible
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {previewData?.previewUnavailableReason ||
                    'El archivo binario original o la versión histórica específica ya no se encuentra en el repositorio de almacenamiento. El extracto verificado se conserva como evidencia auditable.'}
                </p>
              </div>
            )}

            {/* 4. Unsupported Format State */}
            {!isLoading && !isRestricted && !isDeleted && !isExcerptOnly && isUnsupported && (
              <div
                className="w-full max-w-lg p-6 bg-background rounded-lg border border-border shadow-xs space-y-4"
                data-testid="preview-unsupported"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                    <FileQuestion className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Previsualización no disponible para este formato
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      El formato ({formatMimeType(mimeType)}) no admite renderizado visual directo
                      en el navegador.
                    </p>
                  </div>
                </div>

                {/* Metadata Card */}
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nombre original:</span>
                    <span className="font-mono text-foreground font-medium">
                      {previewData?.originalFileName || 'No especificado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo MIME:</span>
                    <span className="font-mono text-foreground">{mimeType || 'Desconocido'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tamaño:</span>
                    <span className="text-foreground">
                      {formatFileSize(previewData?.fileSizeBytes) || 'No reportado'}
                    </span>
                  </div>
                </div>

                {previewData?.downloadAllowed && (
                  <div className="pt-2 flex justify-end">
                    <a
                      href={streamingUrl}
                      download={previewData?.originalFileName || 'document'}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
                      data-testid="preview-download-btn"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Descargar documento original</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 5. Generic Error State */}
            {!isLoading && (isError || textLoadError) && (
              <div
                className="w-full max-w-md p-6 bg-background rounded-lg border border-destructive/30 shadow-xs text-center space-y-3"
                data-testid="preview-error"
              >
                <div className="mx-auto w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Error al cargar el documento
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {textLoadError ||
                    error?.message ||
                    'No fue posible resolver la previsualización del documento.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="text-xs mt-2"
                >
                  Reintentar
                </Button>
              </div>
            )}

            {/* 6. Ready State: PDF Viewer */}
            {!isLoading &&
              !isRestricted &&
              !isDeleted &&
              !isUnsupported &&
              !isExcerptOnly &&
              !isError &&
              isPdf && (
                <div
                  className="w-full h-full flex flex-col bg-background rounded-lg border border-border shadow-xs overflow-hidden"
                  data-testid="preview-ready"
                >
                  {/* PDF Controls Toolbar */}
                  <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/20 text-xs">
                    {/* Page Navigation */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handlePrevPage}
                        disabled={currentPage <= 1}
                        className="h-7 w-7"
                        aria-label="Página anterior"
                        data-testid="pdf-prev-page-btn"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="font-mono text-xs font-medium">Página {currentPage}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleNextPage}
                        className="h-7 w-7"
                        aria-label="Página siguiente"
                        data-testid="pdf-next-page-btn"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>

                      {citedPage && (
                        <Badge
                          variant="secondary"
                          onClick={handleJumpToCitedPage}
                          className="cursor-pointer hover:bg-secondary/80 text-[11px] ml-2"
                          data-testid="cited-page-badge"
                          title="Ir a la página citada"
                        >
                          Ir a cita (Pág. {citedPage})
                        </Badge>
                      )}
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleZoomOut}
                        disabled={zoom <= 50}
                        className="h-7 w-7"
                        aria-label="Reducir zoom"
                        data-testid="pdf-zoom-out-btn"
                      >
                        <ZoomOut className="h-3.5 w-3.5" />
                      </Button>
                      <span
                        className="font-mono text-[11px] w-12 text-center text-muted-foreground"
                        data-testid="pdf-zoom-indicator"
                      >
                        {zoom}%
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleZoomIn}
                        disabled={zoom >= 200}
                        className="h-7 w-7"
                        aria-label="Aumentar zoom"
                        data-testid="pdf-zoom-in-btn"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleZoomReset}
                        className="h-7 w-7"
                        aria-label="Restablecer zoom"
                        data-testid="pdf-zoom-reset-btn"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* PDF Frame */}
                  <div className="flex-1 w-full h-full relative">
                    <iframe
                      src={streamingUrl}
                      title={title}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts"
                      data-testid="pdf-preview-iframe"
                    />
                  </div>
                </div>
              )}

            {/* 7. Ready State: Text / Markdown / CSV / JSON Viewer */}
            {!isLoading &&
              !isRestricted &&
              !isDeleted &&
              !isUnsupported &&
              !isExcerptOnly &&
              !isError &&
              isTextual && (
                <div
                  className="w-full h-full flex flex-col bg-background rounded-lg border border-border shadow-xs overflow-hidden"
                  data-testid="preview-ready"
                >
                  <div className="flex-1 overflow-auto p-6">
                    {isLoadingText ? (
                      <div className="space-y-3">
                        <Skeleton className="w-1/2 h-6" />
                        <Skeleton className="w-full h-32" />
                        <Skeleton className="w-3/4 h-20" />
                      </div>
                    ) : mimeType === 'text/markdown' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownRenderer content={textContent ?? ''} />
                      </div>
                    ) : (
                      <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                        {textContent}
                      </pre>
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Footer Actions */}
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReturnToMessage}
              data-testid="preview-return-to-chat-btn"
              className="text-xs"
            >
              Volver al chat
            </Button>

            {previewData?.downloadAllowed && (
              <a
                href={streamingUrl}
                download={previewData?.originalFileName || 'document'}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium transition-colors shadow-2xs"
                data-testid="preview-secondary-download-btn"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Descargar archivo</span>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

DocumentPreview.displayName = 'DocumentPreview';
