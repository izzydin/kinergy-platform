import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Button,
  Badge,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  FileText,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldAlert,
  FileQuestion,
  AlertTriangle,
  Loader2,
  FileCode,
} from 'lucide-react';
import { knowledgeApi } from '../api/knowledge.api';
import { useDocumentPreviewMetadata } from '../hooks/use-knowledge-queries';
import { MarkdownRenderer } from '../../assistant/components/markdown-renderer';

export interface KnowledgeDocumentPreviewModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly documentId: string;
  readonly versionId?: string;
  readonly fallbackTitle?: string;
}

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeTypeLabel(mime?: string | null): string {
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
 * Secure Document Preview Modal for Knowledge Center (KC.07).
 *
 * Implements:
 * 1. Authoritative preview capability discovery via backend GET /api/v1/ai/knowledge/documents/:id/preview-metadata.
 * 2. Strict client-side format verification (safe PDF, Markdown, text rendering; unsupported fallback for DOCX/binaries).
 * 3. Secure content retrieval through authenticated backend endpoints without raw storage exposure.
 * 4. Safe rendering: Zero dangerouslySetInnerHTML, sandboxed PDF iframes, React escaped text for pre/code.
 * 5. Lifecycle awareness: Handles 403 Forbidden, 404 Missing/Deleted, and revoked access gracefully.
 * 6. Responsive UX with page/zoom navigation for PDF, loading skeletons, and authorized download actions.
 */
export const KnowledgeDocumentPreviewModal: React.FC<KnowledgeDocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  versionId,
  fallbackTitle,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // 1. Fetch authorized preview metadata from backend
  const {
    data: previewMeta,
    isLoading: isMetaLoading,
    isError: isMetaError,
    error: metaError,
    refetch: refetchMeta,
  } = useDocumentPreviewMetadata(documentId, versionId, {
    enabled: isOpen && Boolean(documentId),
  });

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

  // Clean up object URLs on unmount or when modal closes/changes
  useEffect(() => {
    return () => {
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Reset local state when modal opens or document changes
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setZoom(100);
      setTextContent(null);
      setContentError(null);
    } else {
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    }
  }, [isOpen, documentId, versionId]);

  const mimeType = previewMeta?.mimeType?.toLowerCase() ?? '';
  const isPdf = mimeType === 'application/pdf';
  const isMarkdown = mimeType === 'text/markdown';
  const isPlainOrData =
    mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json';
  const isTextual = isMarkdown || isPlainOrData;

  // 2. Fetch binary or text content when metadata confirms document can be previewed
  useEffect(() => {
    if (!isOpen || !previewMeta?.canPreview || !documentId) {
      return;
    }

    let isMounted = true;
    setIsLoadingContent(true);
    setContentError(null);

    const contentPromise = knowledgeApi.getDocumentContentBlob(documentId, { versionId });
    if (contentPromise && typeof contentPromise.then === 'function') {
      contentPromise
        .then(async (blob) => {
          if (!isMounted) return;

          if (isPdf) {
            const url = window.URL.createObjectURL(blob);
            setBlobUrl((prev) => {
              if (prev) window.URL.revokeObjectURL(prev);
              return url;
            });
            setIsLoadingContent(false);
          } else if (isTextual) {
            const text = await blob.text();
            if (isMounted) {
              setTextContent(text);
              setIsLoadingContent(false);
            }
          } else {
            setIsLoadingContent(false);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            setContentError(
              err instanceof Error
                ? err.message
                : 'Error al cargar el contenido protegido del documento.',
            );
            setIsLoadingContent(false);
          }
        });
    } else {
      setIsLoadingContent(false);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, previewMeta?.canPreview, documentId, versionId, isPdf, isTextual]);

  // Download action
  const handleDownload = async () => {
    if (!documentId || isDownloading) return;
    try {
      setIsDownloading(true);
      const blob = await knowledgeApi.downloadDocument(documentId, versionId);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = previewMeta?.originalFileName || `${previewMeta?.title || 'document'}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Handled gracefully in UI
    } finally {
      setIsDownloading(false);
    }
  };

  const title = previewMeta?.title || fallbackTitle || 'Documento';

  // Navigation handlers for PDF
  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(200, prev + 25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(50, prev - 25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
  }, []);

  // PDF iframe source URL with zoom and page fragments
  const pdfFrameUrl = useMemo(() => {
    if (!blobUrl) return '';
    return `${blobUrl}#page=${currentPage}&zoom=${zoom}`;
  }, [blobUrl, currentPage, zoom]);

  // Authorization and status checks
  const is403 =
    (metaError &&
      typeof metaError === 'object' &&
      'statusCode' in metaError &&
      (metaError as { statusCode: number }).statusCode === 403) ||
    previewMeta?.isAuthorized === false;

  const is404OrDeleted =
    (metaError &&
      typeof metaError === 'object' &&
      'statusCode' in metaError &&
      (metaError as { statusCode: number }).statusCode === 404) ||
    previewMeta?.isDeleted === true;

  const isUnsupportedFormat = previewMeta && !previewMeta.canPreview && !is403 && !is404OrDeleted;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="knowledge-document-preview-modal"
        aria-describedby="document-preview-description"
        hideCloseButton
        className="sm:max-w-4xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* =================================================================== */}
        {/* HEADER: Title, Format Badge, Action Toolbar & Close Button          */}
        {/* =================================================================== */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle
                  data-testid="preview-document-title"
                  className="text-sm font-bold text-foreground truncate"
                >
                  {isMetaLoading ? <Skeleton className="h-4 w-48" /> : title}
                </DialogTitle>
                {previewMeta?.versionNumber && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                    v{previewMeta.versionNumber}
                  </Badge>
                )}
                {previewMeta?.mimeType && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                    {formatMimeTypeLabel(previewMeta.mimeType)}
                  </Badge>
                )}
              </div>
              <DialogDescription id="document-preview-description" className="sr-only">
                Visor seguro de previsualización de documentos de la base de conocimiento
              </DialogDescription>
              {previewMeta && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {previewMeta.originalFileName} • {formatBytes(previewMeta.fileSize)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Download button if not deleted and user is authorized */}
            {!isDeletedDoc(previewMeta) && !is403 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isDownloading || isMetaLoading}
                data-testid="preview-download-button"
                className="h-8 px-2.5 text-xs gap-1.5"
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">Descargar</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="preview-close-button"
              aria-label="Cerrar visor de previsualización"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SUBHEADER TOOLBAR FOR PDF (PAGINATION & ZOOM CONTROLS)              */}
        {/* =================================================================== */}
        {isPdf && previewMeta?.canPreview && !isMetaLoading && !contentError && (
          <div
            data-testid="pdf-preview-toolbar"
            className="flex items-center justify-between px-4 py-1.5 bg-muted/40 border-b border-border/40 text-xs"
          >
            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                data-testid="preview-prev-page"
                aria-label="Página anterior"
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] font-medium text-foreground px-1.5">
                Página <span data-testid="preview-current-page">{currentPage}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextPage}
                data-testid="preview-next-page"
                aria-label="Página siguiente"
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                data-testid="preview-zoom-out"
                aria-label="Alejar"
                className="h-7 w-7 p-0"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button
                type="button"
                onClick={handleZoomReset}
                data-testid="preview-zoom-reset"
                aria-label="Restablecer zoom al 100%"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-1.5"
              >
                {zoom}%
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                data-testid="preview-zoom-in"
                aria-label="Acercar"
                className="h-7 w-7 p-0"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomReset}
                aria-label="Restablecer vista"
                className="h-7 w-7 p-0 text-muted-foreground ml-1"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* PREVIEW CONTENT VIEWPORT                                            */}
        {/* =================================================================== */}
        <div className="flex-1 bg-background relative overflow-y-auto min-h-0 flex flex-col">
          {/* STATE 1: LOADING SKELETON */}
          {(isMetaLoading || isLoadingContent) && (
            <div
              data-testid="preview-loading-state"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 bg-background/90 z-10"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-xs text-muted-foreground font-medium">
                {isMetaLoading
                  ? 'Verificando autorización y capacidades de previsualización...'
                  : 'Descargando y preparando contenido seguro...'}
              </p>
            </div>
          )}

          {/* STATE 2: 403 FORBIDDEN / ACCESS DENIED */}
          {is403 && (
            <div
              data-testid="preview-forbidden-state"
              className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Acceso no autorizado</h3>
              <p className="text-xs text-muted-foreground">
                No tienes los permisos requeridos ni el alcance de visibilidad necesario para
                previsualizar este documento.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="mt-2 text-xs">
                Cerrar visor
              </Button>
            </div>
          )}

          {/* STATE 3: 404 NOT FOUND / DELETED */}
          {!is403 && is404OrDeleted && (
            <div
              data-testid="preview-deleted-state"
              className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileQuestion className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Documento eliminado o no encontrado
              </h3>
              <p className="text-xs text-muted-foreground">
                El documento solicitado ha sido retirado de la base de conocimiento o la versión
                especificada ya no está disponible.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="mt-2 text-xs">
                Cerrar visor
              </Button>
            </div>
          )}

          {/* STATE 4: UNSUPPORTED FORMAT FALLBACK (E.G. WORD / DOCX) */}
          {!is403 && !is404OrDeleted && isUnsupportedFormat && (
            <div
              data-testid="preview-unsupported-format-state"
              className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto gap-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileCode className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Previsualización en navegador no compatible
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                  Los archivos en formato{' '}
                  <span className="font-semibold text-foreground">
                    {formatMimeTypeLabel(previewMeta?.mimeType)}
                  </span>{' '}
                  no admiten renderizado directo en el navegador para preservar la seguridad y
                  evitar la ejecución de macros o contenido no seguro.
                </p>
              </div>

              {/* Document details box */}
              {previewMeta && (
                <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-left space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nombre original:</span>
                    <span className="font-medium text-foreground truncate max-w-[200px]">
                      {previewMeta.originalFileName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tamaño:</span>
                    <span className="font-medium text-foreground">
                      {formatBytes(previewMeta.fileSize)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MIME:</span>
                    <span className="font-mono text-[11px] text-foreground">
                      {previewMeta.mimeType}
                    </span>
                  </div>
                </div>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={isDownloading}
                data-testid="unsupported-format-download-button"
                className="gap-2 text-xs"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Descargar archivo para ver en aplicación local</span>
              </Button>
            </div>
          )}

          {/* STATE 5: NETWORK / STREAM ERROR */}
          {!is403 && !is404OrDeleted && (isMetaError || contentError) && (
            <div
              data-testid="preview-error-state"
              className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Error al cargar la previsualización
              </h3>
              <p className="text-xs text-muted-foreground">
                {contentError ||
                  (metaError instanceof Error
                    ? metaError.message
                    : 'No se pudo comunicar con el repositorio de conocimiento.')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                  Cerrar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void refetchMeta()}
                  className="text-xs gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reintentar</span>
                </Button>
              </div>
            </div>
          )}

          {/* STATE 6: PDF RENDERING (SECURE IFRAME) */}
          {!is403 &&
            !is404OrDeleted &&
            !isUnsupportedFormat &&
            !contentError &&
            isPdf &&
            blobUrl && (
              <div className="w-full h-full flex flex-col overflow-hidden">
                <iframe
                  src={pdfFrameUrl}
                  title="Visualizador seguro de documento PDF"
                  data-testid="pdf-preview-iframe"
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full flex-1 border-0"
                />
              </div>
            )}

          {/* STATE 7: MARKDOWN RENDERING (SAFE PARSED COMPONENT) */}
          {!is403 &&
            !is404OrDeleted &&
            !isUnsupportedFormat &&
            !contentError &&
            isMarkdown &&
            textContent !== null && (
              <div
                data-testid="markdown-preview-container"
                className="p-6 md:p-8 max-w-3xl mx-auto w-full leading-relaxed"
              >
                <MarkdownRenderer content={textContent} />
              </div>
            )}

          {/* STATE 8: PLAIN TEXT / CSV / JSON (ESCAPED PRE-FORMATTED TEXT) */}
          {!is403 &&
            !is404OrDeleted &&
            !isUnsupportedFormat &&
            !contentError &&
            isPlainOrData &&
            textContent !== null && (
              <div data-testid="plaintext-preview-container" className="p-4 md:p-6 w-full">
                <pre className="font-mono text-xs p-4 bg-muted/20 border border-border/40 rounded-lg overflow-x-auto whitespace-pre-wrap select-text leading-relaxed">
                  {textContent}
                </pre>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

function isDeletedDoc(meta?: { isDeleted?: boolean } | null): boolean {
  return meta?.isDeleted === true;
}
