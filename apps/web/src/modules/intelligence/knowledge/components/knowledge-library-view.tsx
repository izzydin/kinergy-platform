import React, { useState } from 'react';
import { FolderOpen, ArrowLeft, AlertTriangle } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kinergy-platform/ui';
import { useNotification } from '../../../../app/providers/notification-provider';
import { useKnowledgeLibraryFilters } from '../hooks/use-knowledge-library-filters';
import { useKnowledgeDocuments } from '../hooks/use-knowledge-queries';
import {
  useDeleteKnowledgeDocument,
  useRetryDocumentIngestion,
} from '../hooks/use-knowledge-mutations';
import { triggerDocumentDownload } from '../api/knowledge.api';
import { KnowledgeLibraryToolbar } from './knowledge-library-toolbar';
import { KnowledgeDocumentTable } from './knowledge-document-table';
import type { KnowledgeDocumentItem } from '../types/knowledge-contract.types';

export interface KnowledgeLibraryViewProps {
  readonly onNavigateToOverview?: () => void;
  readonly onOpenUploadModal?: () => void;
}

export const KnowledgeLibraryView: React.FC<KnowledgeLibraryViewProps> = ({
  onNavigateToOverview,
  onOpenUploadModal,
}) => {
  const notification = useNotification();
  const { state, queryParams, resolvedSort, isFiltered, actions } = useKnowledgeLibraryFilters();

  const {
    data: paginatedData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useKnowledgeDocuments(queryParams);

  const deleteMutation = useDeleteKnowledgeDocument();
  const retryMutation = useRetryDocumentIngestion();

  // State for document deletion confirmation dialog
  const [docToDelete, setDocToDelete] = useState<KnowledgeDocumentItem | null>(null);

  const handleDownload = async (doc: KnowledgeDocumentItem) => {
    try {
      await triggerDocumentDownload(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al descargar el archivo.';
      notification.error(msg);
    }
  };

  const handleRetryIngestion = (doc: KnowledgeDocumentItem) => {
    retryMutation.mutate(doc.id);
  };

  const confirmDelete = () => {
    if (!docToDelete) return;
    deleteMutation.mutate(docToDelete.id, {
      onSettled: () => setDocToDelete(null),
    });
  };

  const totalDocuments = paginatedData?.total ?? 0;
  const items = paginatedData?.items ?? [];

  return (
    <div
      data-testid="knowledge-library-view"
      className="flex flex-col gap-5 max-w-7xl mx-auto w-full pb-8"
    >
      {/* 1. Header with back link & count badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-4">
        <div className="flex items-start gap-3">
          {onNavigateToOverview && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToOverview}
              className="h-9 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
              data-testid="back-to-overview-button"
              aria-label="Volver al Resumen"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Resumen</span>
            </Button>
          )}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <FolderOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground truncate">
                Biblioteca de Documentos
              </h1>
              <span
                data-testid="library-total-count-badge"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border/50"
              >
                {totalDocuments} {totalDocuments === 1 ? 'documento' : 'documentos'}
              </span>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Búsqueda, filtrado y administración del repositorio documental indexado en el motor
              vectorial.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Toolbar (Search, Filters, Reset, Upload) */}
      <KnowledgeLibraryToolbar
        searchTerm={state.q}
        onSearchChange={actions.setSearch}
        onSearchClear={actions.clearSearch}
        visibilityScope={state.filters.visibilityScope}
        onVisibilityScopeChange={actions.setVisibilityScope}
        mimeType={state.filters.mimeType}
        onMimeTypeChange={actions.setMimeType}
        isFiltered={isFiltered}
        onResetFilters={actions.resetAllFilters}
        onUploadClick={onOpenUploadModal}
        isFetching={isFetching}
        isLoading={isLoading}
      />

      {/* 3. Document Data Table with Server-side Pagination & Sorting */}
      <KnowledgeDocumentTable
        documents={items}
        totalCount={totalDocuments}
        page={state.page}
        pageSize={state.limit}
        onPageChange={actions.setPage}
        onPageSizeChange={actions.setLimit}
        currentSort={resolvedSort}
        onToggleSort={actions.toggleSort}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        errorMessage={error?.message}
        onRetry={() => void refetch()}
        isFiltered={isFiltered}
        onResetFilters={actions.resetAllFilters}
        onDownload={handleDownload}
        onRetryIngestion={handleRetryIngestion}
        onDelete={(doc) => setDocToDelete(doc)}
        onUploadClick={onOpenUploadModal}
      />

      {/* 4. Delete Confirmation Dialog */}
      <Dialog open={Boolean(docToDelete)} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent data-testid="delete-document-modal" className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <DialogTitle className="text-base font-bold">Confirmar eliminación</DialogTitle>
            </div>
            <DialogDescription className="text-xs md:text-sm text-muted-foreground pt-2">
              ¿Estás seguro de que deseas eliminar el documento{' '}
              <strong className="text-foreground font-semibold">
                &ldquo;{docToDelete?.title}&rdquo;
              </strong>
              ? Esta acción deshabilitará el documento para la búsqueda semántica y consultas del
              asistente RAG.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDocToDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="confirm-delete-button"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="gap-1.5"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar documento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
