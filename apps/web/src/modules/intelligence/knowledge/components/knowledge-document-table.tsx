import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  FileText,
  FileCode,
  File,
  Eye,
  Download,
  RotateCcw,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  User,
} from 'lucide-react';
import { Badge, Button } from '@kinergy-platform/ui';
import { DataTable } from '../../../../shared/table';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type { KnowledgeDocumentItem, VisibilityScope } from '../types/knowledge-contract.types';
import type { KnowledgeSortField } from '../hooks/use-knowledge-library-filters';

export interface KnowledgeDocumentTableProps {
  readonly documents: readonly KnowledgeDocumentItem[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly onPageChange: (newPage: number) => void;
  readonly onPageSizeChange: (newPageSize: number) => void;
  readonly currentSort: { readonly field: KnowledgeSortField; readonly desc: boolean };
  readonly onToggleSort: (field: KnowledgeSortField) => void;
  readonly isLoading?: boolean;
  readonly isFetching?: boolean;
  readonly isError?: boolean;
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
  readonly isFiltered?: boolean;
  readonly onResetFilters?: () => void;
  readonly onDownload?: (doc: KnowledgeDocumentItem) => void;
  readonly onRetryIngestion?: (doc: KnowledgeDocumentItem) => void;
  readonly onDelete?: (doc: KnowledgeDocumentItem) => void;
  readonly onUploadClick?: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

function getFormatIcon(mime?: string, ext?: string): React.ReactElement {
  const normalizedExt = (ext || '').toLowerCase().replace(/^\./, '');
  const normalizedMime = (mime || '').toLowerCase();

  if (normalizedMime.includes('pdf') || normalizedExt === 'pdf') {
    return <FileText className="h-4 w-4 text-red-500 shrink-0" aria-label="PDF" />;
  }
  if (
    normalizedMime.includes('word') ||
    normalizedMime.includes('docx') ||
    normalizedExt === 'docx'
  ) {
    return <FileText className="h-4 w-4 text-blue-500 shrink-0" aria-label="Word" />;
  }
  if (
    normalizedMime.includes('markdown') ||
    normalizedExt === 'md' ||
    normalizedExt === 'markdown'
  ) {
    return <FileCode className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Markdown" />;
  }
  return <File className="h-4 w-4 text-muted-foreground shrink-0" aria-label="Documento" />;
}

function formatScopeBadge(scope?: VisibilityScope): React.ReactElement {
  switch (scope) {
    case 'CLINICAL_STAFF':
      return (
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
          Personal Clínico
        </Badge>
      );
    case 'MANAGEMENT':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-2 py-0.5 border-amber-500/40 text-amber-500"
        >
          Dirección
        </Badge>
      );
    case 'ALL_STAFF':
    default:
      return (
        <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">
          General
        </Badge>
      );
  }
}

export const KnowledgeDocumentTable: React.FC<KnowledgeDocumentTableProps> = ({
  documents,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  currentSort,
  onToggleSort,
  isLoading = false,
  isFetching = false,
  isError = false,
  errorMessage,
  onRetry,
  isFiltered = false,
  onResetFilters,
  onDownload,
  onRetryIngestion,
  onDelete,
  onUploadClick,
}) => {
  const auth = useOptionalAuth();
  const roles = auth?.currentUser?.roles ?? [];
  const canDelete =
    roles.includes('SUPER_ADMIN') || roles.includes('ADMIN') || roles.includes('OWNER');

  const sortingState: SortingState = useMemo(() => {
    return [{ id: currentSort.field, desc: currentSort.desc }];
  }, [currentSort]);

  const columns = useMemo<ColumnDef<KnowledgeDocumentItem>[]>(() => {
    return [
      {
        id: 'title',
        accessorKey: 'title',
        header: () => (
          <button
            type="button"
            className="flex items-center gap-1.5 font-semibold text-xs text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 py-0.5"
            onClick={() => onToggleSort('title')}
            data-testid="sort-title-header"
            aria-label={`Ordenar por título: actualmente ${
              currentSort.field === 'title'
                ? currentSort.desc
                  ? 'descendente'
                  : 'ascendente'
                : 'sin ordenar'
            }`}
          >
            <span>Documento</span>
            {currentSort.field === 'title' ? (
              currentSort.desc ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const doc = row.original;
          return (
            <div className="flex items-start gap-2.5 min-w-[220px] max-w-sm py-1">
              <div className="mt-0.5">{getFormatIcon(doc.mimeType, doc.fileExtension)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    to={`/intelligence/knowledge/documents/${encodeURIComponent(doc.id)}`}
                    className="text-xs md:text-sm font-semibold text-foreground hover:text-primary hover:underline transition-colors truncate"
                    title={doc.title}
                    data-testid={`document-title-link-${doc.id}`}
                  >
                    {doc.title}
                  </Link>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    v{doc.versionNumber ?? 1}
                  </Badge>
                </div>
                {doc.originalFileName && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                    {doc.originalFileName}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'visibilityScope',
        accessorKey: 'visibilityScope',
        header: () => <span className="text-xs font-semibold">Visibilidad</span>,
        cell: ({ row }) => (
          <div className="py-1">{formatScopeBadge(row.original.visibilityScope)}</div>
        ),
      },
      {
        id: 'ingestionStatus',
        accessorKey: 'ingestionStatus',
        header: () => <span className="text-xs font-semibold">Estado RAG</span>,
        cell: ({ row }) => (
          <div className="py-1">
            <IngestionStatusBadge status={row.original.ingestionStatus} />
          </div>
        ),
      },
      {
        id: 'fileSize',
        accessorKey: 'fileSize',
        header: () => <span className="text-xs font-semibold">Tamaño</span>,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {formatBytes(row.original.fileSize)}
          </span>
        ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: () => (
          <button
            type="button"
            className="flex items-center gap-1.5 font-semibold text-xs text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 py-0.5"
            onClick={() => onToggleSort('createdAt')}
            data-testid="sort-created-at-header"
            aria-label={`Ordenar por fecha: actualmente ${
              currentSort.field === 'createdAt'
                ? currentSort.desc
                  ? 'descendente'
                  : 'ascendente'
                : 'sin ordenar'
            }`}
          >
            <span>Fecha de Subida</span>
            {currentSort.field === 'createdAt' ? (
              currentSort.desc ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 text-muted-foreground/70" />
            <span>{formatDate(row.original.createdAt)}</span>
          </div>
        ),
      },
      {
        id: 'uploadedBy',
        accessorKey: 'uploadedBy',
        header: () => <span className="text-xs font-semibold">Uploader</span>,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-xs text-muted-foreground max-w-[120px] truncate">
            <User className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span className="truncate">{row.original.uploadedBy || 'Sistema'}</span>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="text-xs font-semibold text-right block pr-2">Acciones</span>,
        cell: ({ row }) => {
          const doc = row.original;
          const isFailed = doc.ingestionStatus === 'FAILED';

          return (
            <div className="flex items-center justify-end gap-1">
              {/* Ver detalles */}
              <Link
                to={`/intelligence/knowledge/documents/${encodeURIComponent(doc.id)}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Ver detalles del documento"
                aria-label={`Ver detalles de ${doc.title}`}
                data-testid={`action-view-${doc.id}`}
              >
                <Eye className="h-4 w-4" />
              </Link>

              {/* Descargar */}
              {onDownload && (
                <button
                  type="button"
                  onClick={() => onDownload(doc)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Descargar archivo"
                  aria-label={`Descargar ${doc.title}`}
                  data-testid={`action-download-${doc.id}`}
                >
                  <Download className="h-4 w-4" />
                </button>
              )}

              {/* Reintentar indexación RAG si falló */}
              {isFailed && onRetryIngestion && (
                <button
                  type="button"
                  onClick={() => onRetryIngestion(doc)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Reintentar indexación RAG"
                  aria-label={`Reintentar indexación de ${doc.title}`}
                  data-testid={`action-retry-${doc.id}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}

              {/* Eliminar (role-gated) */}
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(doc)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Eliminar documento"
                  aria-label={`Eliminar ${doc.title}`}
                  data-testid={`action-delete-${doc.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        },
      },
    ];
  }, [currentSort, onToggleSort, canDelete, onDownload, onRetryIngestion, onDelete]);

  return (
    <div data-testid="knowledge-document-table-container" className="w-full">
      <DataTable
        columns={columns}
        data={documents}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[10, 20, 50, 100]}
        sorting={sortingState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        errorMessage={errorMessage || 'Error al cargar la biblioteca de documentos.'}
        onRetry={onRetry}
        isFiltered={isFiltered}
        emptyTitle={
          isFiltered ? 'No se encontraron documentos' : 'No hay documentos en la biblioteca'
        }
        emptyDescription={
          isFiltered
            ? 'Ningún documento coincide con los criterios de búsqueda o filtros seleccionados.'
            : 'Comienza subiendo el primer documento institucional para habilitar la búsqueda semántica y consultas RAG.'
        }
        onResetFilters={onResetFilters}
        emptyAction={
          !isFiltered && onUploadClick ? (
            <Button
              size="sm"
              onClick={onUploadClick}
              data-testid="empty-library-upload-button"
              className="gap-2 text-xs font-semibold"
            >
              <FileText className="h-4 w-4" />
              <span>Subir primer documento</span>
            </Button>
          ) : undefined
        }
        ariaLabel="Tabla de documentos de la base de conocimiento"
        className="border border-border/50 rounded-xl bg-card/40 backdrop-blur-xs overflow-hidden"
      />
    </div>
  );
};
