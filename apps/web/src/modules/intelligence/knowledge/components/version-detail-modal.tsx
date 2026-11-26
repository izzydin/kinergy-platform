import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@kinergy-platform/ui';
import {
  Layers,
  FileText,
  Download,
  Eye,
  Copy,
  Check,
  Calendar,
  User,
  Shield,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type {
  DocumentVersionItem,
  IngestionRetrievalStatus,
} from '../types/knowledge-contract.types';

export interface VersionDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly version: DocumentVersionItem | null;
  readonly isCurrent: boolean;
  readonly isIndexedInRag?: boolean;
  readonly retrievalStatus?: IngestionRetrievalStatus | null;
  readonly onPreview?: (version: DocumentVersionItem) => void;
  readonly onDownload?: (version: DocumentVersionItem) => void;
  readonly canManage?: boolean;
  readonly onRetry?: (version: DocumentVersionItem) => void;
  readonly isRetryPending?: boolean;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * VersionDetailModal
 *
 * Displays immutable technical metadata for a specific document version.
 * Conforms to KC.08 requirements:
 * - Exposes filename, file size, media type, uploader, upload timestamp, and SHA-256 checksum.
 * - Shows current-version indicator versus historical version status.
 * - Shows version-specific processing / RAG ingestion state.
 * - Provides authorized preview and download actions.
 */
export const VersionDetailModal: React.FC<VersionDetailModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  version,
  isCurrent,
  isIndexedInRag = false,
  retrievalStatus,
  onPreview,
  onDownload,
  canManage = false,
  onRetry,
  isRetryPending = false,
}) => {
  const [copiedChecksum, setCopiedChecksum] = useState(false);

  if (!version) return null;

  const handleCopyChecksum = async () => {
    if (!version.checksum) return;
    try {
      await navigator.clipboard.writeText(version.checksum);
      setCopiedChecksum(true);
      setTimeout(() => setCopiedChecksum(false), 2000);
    } catch {
      // Fallback or ignore
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="version-detail-modal"
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle
                  data-testid="version-detail-modal-title"
                  className="text-base font-bold text-foreground"
                >
                  Versión v{version.versionNumber}
                </DialogTitle>
                {isCurrent ? (
                  <Badge
                    variant="default"
                    className="bg-emerald-600 text-white text-[10px] font-semibold"
                    data-testid="version-detail-current-badge"
                  >
                    Versión Actual (Vigente)
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium bg-muted/40"
                    data-testid="version-detail-historical-badge"
                  >
                    Versión Histórica
                  </Badge>
                )}
                {isIndexedInRag ? (
                  <Badge
                    variant="default"
                    className="bg-emerald-600 text-white text-[10px] font-semibold gap-1 inline-flex items-center"
                    data-testid="version-detail-rag-active-badge"
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    <span>Activo en Índice RAG</span>
                  </Badge>
                ) : isCurrent ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-medium gap-1 inline-flex items-center"
                    data-testid="version-detail-rag-inactive-badge"
                  >
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    <span>No disponible en RAG</span>
                  </Badge>
                ) : null}
                {version.fileExtension && (
                  <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase px-1.5 py-0.2 rounded bg-muted/60">
                    .{version.fileExtension}
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                {documentTitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Metadata Details Grid */}
        <div className="flex flex-col gap-4 py-2 text-xs">
          {/* File attributes card */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Propiedades del Archivo Inmutable</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <span className="text-muted-foreground block text-[11px]">Nombre de archivo:</span>
                <span
                  data-testid="version-detail-filename"
                  className="font-medium text-foreground truncate block"
                  title={version.originalFileName}
                >
                  {version.originalFileName}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Tipo de medio (MIME):
                </span>
                <span
                  data-testid="version-detail-mimetype"
                  className="font-medium text-foreground font-mono text-[11px]"
                >
                  {version.mimeType}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Tamaño del archivo:</span>
                <span
                  data-testid="version-detail-filesize"
                  className="font-medium text-foreground font-mono"
                >
                  {formatBytes(version.fileSize)}{' '}
                  <span className="text-muted-foreground text-[10px]">
                    ({version.fileSize.toLocaleString()} bytes)
                  </span>
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Idioma registrado:</span>
                <span
                  data-testid="version-detail-language"
                  className="font-medium text-foreground uppercase"
                >
                  {version.language || 'es'}
                </span>
              </div>
            </div>
          </div>

          {/* Lifecycle & Attribution card */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Atribución y Registro</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Fecha y hora de subida:
                </span>
                <span
                  data-testid="version-detail-created-at"
                  className="font-medium text-foreground"
                >
                  {formatDate(version.createdAt)}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Subido por:</span>
                <span
                  data-testid="version-detail-uploaded-by"
                  className="font-medium text-foreground flex items-center gap-1"
                >
                  <User className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span>{version.uploadedBy || 'Sistema'}</span>
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Estado de procesamiento:
                </span>
                <div className="mt-1" data-testid="version-detail-ingestion-status">
                  <IngestionStatusBadge status={version.ingestionStatus} />
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Identificador de versión:
                </span>
                <span
                  data-testid="version-detail-id"
                  className="font-mono text-[11px] text-muted-foreground truncate block"
                >
                  {version.id}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Disponibilidad en RAG:
                </span>
                <span
                  data-testid="version-detail-rag-status"
                  className="font-medium text-foreground block mt-0.5"
                >
                  {isIndexedInRag ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Activo en índice de búsqueda
                    </span>
                  ) : isCurrent ? (
                    <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {retrievalStatus?.discrepancyReason || 'Aún no indexado'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Versión histórica no activa</span>
                  )}
                </span>
              </div>

              {version.ingestionStatus === 'FAILED' && (
                <div
                  data-testid="version-detail-failure-banner"
                  className="sm:col-span-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-800 dark:text-rose-300 text-[11px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>Fallo de Ingesta Registrado</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-rose-700/90 dark:text-rose-300/90 leading-tight">
                      El procesamiento de esta versión falló durante la extracción o indexación.
                    </p>
                  </div>
                  {canManage && onRetry && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(version)}
                      disabled={isRetryPending}
                      data-testid="version-detail-retry-button"
                      className="h-7 text-xs border-rose-500/40 text-rose-800 dark:text-rose-200 hover:bg-rose-500/20 shrink-0 self-start sm:self-auto gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reintentar versión</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Checksum SHA-256 Integrity Card */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Integridad Criptográfica (SHA-256)</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyChecksum}
                data-testid="copy-version-checksum-button"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
              >
                {copiedChecksum ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copiar hash</span>
                  </>
                )}
              </Button>
            </div>
            <div
              data-testid="version-detail-checksum"
              className="rounded bg-background/80 p-2 font-mono text-[11px] text-foreground break-all border border-border/40 select-all"
            >
              {version.checksum}
            </div>
          </div>

          {/* RAG Context Notice */}
          <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
            {isCurrent ? (
              <span>
                <strong>Versión activa para RAG:</strong> Esta versión es la referencia canónica
                actualmente indexada para consultas y respuestas del asistente de inteligencia.
              </span>
            ) : (
              <span>
                <strong>Versión archivada:</strong> Esta versión se conserva como histórico
                inmutable. Sus vectores fueron reemplazados por la versión vigente, pero el archivo
                y sus metadatos permanecen accesibles para auditoría.
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cerrar
            </Button>

            <div className="flex items-center gap-2">
              {onPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onPreview(version);
                  }}
                  data-testid="version-detail-preview-button"
                  className="text-xs gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Previsualizar</span>
                </Button>
              )}

              {onDownload && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onDownload(version)}
                  data-testid="version-detail-download-button"
                  className="text-xs gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Descargar</span>
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
