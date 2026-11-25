import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Cpu, Database, Search, Sparkles } from 'lucide-react';
import { useKnowledgeDocuments, useKnowledgeCapabilities } from '../hooks/use-knowledge-queries';
import { KnowledgeOverviewHeader } from './knowledge-overview-header';
import { KnowledgeMetricCards } from './knowledge-metric-cards';
import { RecentDocumentsList } from './recent-documents-list';

export interface KnowledgeOverviewViewProps {
  readonly onOpenUploadModal?: () => void;
  readonly onNavigateToLibrary?: () => void;
}

export const KnowledgeOverviewView: React.FC<KnowledgeOverviewViewProps> = ({
  onOpenUploadModal,
  onNavigateToLibrary,
}) => {
  const navigate = useNavigate();

  // Fetch recent documents (5 items for overview, ordered by creation date descending)
  const {
    data: paginatedData,
    isLoading: isDocsLoading,
    isError: isDocsError,
    refetch: refetchDocs,
  } = useKnowledgeDocuments({
    limit: 5,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });

  // Fetch authoritative capabilities and constraints
  const { data: capabilities, isLoading: isCapsLoading } = useKnowledgeCapabilities();

  const handleBrowseClick = () => {
    if (onNavigateToLibrary) {
      onNavigateToLibrary();
    } else {
      // In upcoming KC.03/KC.04, this links to the library tab or table view
      navigate('/intelligence/knowledge?view=library');
    }
  };

  const handleUploadClick = () => {
    if (onOpenUploadModal) {
      onOpenUploadModal();
    } else {
      // In upcoming KC.04, this triggers the upload modal
      navigate('/intelligence/knowledge?action=upload');
    }
  };

  return (
    <div
      data-testid="knowledge-overview-view"
      className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-8"
    >
      {/* 1. Module Overview Header */}
      <KnowledgeOverviewHeader
        onUploadClick={handleUploadClick}
        onBrowseClick={handleBrowseClick}
      />

      {/* 2. Metric & Status Cards */}
      <KnowledgeMetricCards
        totalDocuments={paginatedData?.total ?? 0}
        sampleDocuments={paginatedData?.items ?? []}
        capabilities={capabilities}
        isLoading={isDocsLoading || isCapsLoading}
      />

      {/* 3. Recent Documents List */}
      <RecentDocumentsList
        documents={paginatedData?.items ?? []}
        isLoading={isDocsLoading}
        isError={isDocsError}
        onRetry={() => void refetchDocs()}
        onBrowseClick={handleBrowseClick}
        onUploadClick={handleUploadClick}
      />

      {/* 4. RAG Ingestion Pipeline Operational Banner */}
      <div
        data-testid="knowledge-architecture-banner"
        className="rounded-xl border border-border/50 bg-card/30 p-5 md:p-6 shadow-2xs flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Pipeline de Ingesta & Recuperación RAG</span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
          Los documentos cargados se procesan de forma asíncrona mediante un pipeline de 4 etapas
          para garantizar aislamiento por sede y fundamentación clínica verificada:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/30 bg-card/20">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-foreground block">1. Validación Segura</span>
              <span className="text-muted-foreground text-[11px]">
                Inspección de firmas binarias magic-bytes y hash SHA-256.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/30 bg-card/20">
            <Cpu className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-foreground block">2. Chunking Estructural</span>
              <span className="text-muted-foreground text-[11px]">
                Normalización de texto y partición con ventanas de contexto.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/30 bg-card/20">
            <Database className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-foreground block">3. pgvector HNSW</span>
              <span className="text-muted-foreground text-[11px]">
                Generación de incrustaciones BGE-M3 (1024 dims) e índices vectoriales.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/30 bg-card/20">
            <Search className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-foreground block">4. Síntesis Grounded</span>
              <span className="text-muted-foreground text-[11px]">
                Respuestas asistidas citando páginas y extractos oficiales.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
