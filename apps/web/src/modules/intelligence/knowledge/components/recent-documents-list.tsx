import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  FileCode,
  File,
  ArrowRight,
  ExternalLink,
  Upload,
  RotateCcw,
  Clock,
  Layers,
} from 'lucide-react';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type { KnowledgeDocumentItem, VisibilityScope } from '../types/knowledge-contract.types';

export interface RecentDocumentsListProps {
  readonly documents: readonly KnowledgeDocumentItem[];
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly onRetry?: () => void;
  readonly onBrowseClick?: () => void;
  readonly onUploadClick?: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function getFormatIcon(extension?: string, mimeType?: string) {
  const ext = (extension || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return <FileText className="h-4 w-4 text-rose-500" aria-hidden="true" />;
  }
  if (ext === 'md' || ext === 'markdown' || mime.includes('markdown')) {
    return <FileCode className="h-4 w-4 text-blue-500" aria-hidden="true" />;
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    return <FileText className="h-4 w-4 text-sky-600" aria-hidden="true" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function getScopeLabel(scope: VisibilityScope): string {
  switch (scope) {
    case 'CLINICAL_STAFF':
      return 'Personal Clínico';
    case 'MANAGEMENT':
      return 'Dirección';
    case 'ALL_STAFF':
    default:
      return 'Todo el Personal';
  }
}

export const RecentDocumentsList: React.FC<RecentDocumentsListProps> = ({
  documents,
  isLoading = false,
  isError = false,
  onRetry,
  onBrowseClick,
  onUploadClick,
}) => {
  if (isLoading) {
    return (
      <div
        data-testid="recent-documents-loading"
        className="rounded-xl border border-border/50 bg-card/40 p-4 md:p-6 shadow-xs flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/20"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="recent-documents-error"
        className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center flex flex-col items-center gap-3"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <RotateCcw className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Error al cargar documentos recientes
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            No se pudo establecer conexión con el repositorio de conocimiento.
          </p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reintentar</span>
          </Button>
        )}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div
        data-testid="recent-documents-empty"
        className="rounded-xl border border-dashed border-border/70 bg-card/20 p-8 text-center flex flex-col items-center justify-center gap-3 min-h-[220px]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <Layers className="h-6 w-6" />
        </div>
        <div className="max-w-sm">
          <h3 className="text-sm font-semibold text-foreground">No hay documentos registrados</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Comienza subiendo guías clínicas, manuales o protocolos institucionales para habilitar
            la búsqueda semántica.
          </p>
        </div>
        {onUploadClick && (
          <Button
            size="sm"
            onClick={onUploadClick}
            data-testid="empty-upload-action"
            className="gap-2 text-xs font-medium mt-1"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Subir primer documento</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="recent-documents-list"
      className="rounded-xl border border-border/50 bg-card/40 p-4 md:p-6 shadow-xs flex flex-col gap-4 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div>
          <h2 className="text-sm md:text-base font-bold tracking-tight text-foreground">
            Documentos Recientes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Últimos archivos cargados en el repositorio de conocimiento institucional
          </p>
        </div>

        {onBrowseClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBrowseClick}
            data-testid="view-all-documents-link"
            className="gap-1.5 text-xs font-medium text-primary hover:text-primary/90 shrink-0"
          >
            <span>Ver biblioteca completa</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border/30">
        {documents.map((doc) => (
          <div
            key={doc.id}
            data-testid={`recent-document-item-${doc.id}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-2 rounded-lg transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 border border-border/40 mt-0.5">
                {getFormatIcon(doc.fileExtension, doc.mimeType)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/intelligence/knowledge/documents/${encodeURIComponent(doc.id)}`}
                    className="text-xs md:text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
                  >
                    {doc.title}
                  </Link>

                  {doc.versionNumber && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      v{doc.versionNumber}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                  {doc.originalFileName && (
                    <span className="truncate max-w-[180px]">{doc.originalFileName}</span>
                  )}
                  {doc.fileSize !== undefined && (
                    <>
                      <span>•</span>
                      <span>{formatBytes(doc.fileSize)}</span>
                    </>
                  )}
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(doc.createdAt)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
              <Badge variant="secondary" className="text-[10px]">
                {getScopeLabel(doc.visibilityScope)}
              </Badge>

              <IngestionStatusBadge status={doc.ingestionStatus} />

              <Link
                to={`/intelligence/knowledge/documents/${encodeURIComponent(doc.id)}`}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver detalles de ${doc.title}`}
                title="Ver detalles"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
