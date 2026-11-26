import React from 'react';
import { FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Card, Skeleton } from '@kinergy-platform/ui';
import type {
  KnowledgeDocumentItem,
  KnowledgeCapabilitiesResponse,
} from '../types/knowledge-contract.types';

export interface KnowledgeMetricCardsProps {
  readonly totalDocuments?: number;
  readonly sampleDocuments?: readonly KnowledgeDocumentItem[];
  readonly capabilities?: KnowledgeCapabilitiesResponse | null;
  readonly isLoading?: boolean;
}

export const KnowledgeMetricCards: React.FC<KnowledgeMetricCardsProps> = ({
  totalDocuments = 0,
  sampleDocuments = [],
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div
        data-testid="knowledge-metric-cards-loading"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Card
            key={i}
            className="rounded-xl border-border/50 bg-card/60 p-4 shadow-2xs flex flex-col gap-2.5"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-36" />
          </Card>
        ))}
      </div>
    );
  }

  // Derive counts from verified documents
  const isSampled = totalDocuments > sampleDocuments.length;
  const sampleCount = sampleDocuments.length;

  const indexedCount = sampleDocuments.filter((d) => d.ingestionStatus === 'READY').length;

  const pendingOrProcessingCount = sampleDocuments.filter(
    (d) =>
      d.ingestionStatus === 'UPLOADED' ||
      d.ingestionStatus === 'VALIDATING' ||
      d.ingestionStatus === 'PROCESSING' ||
      d.ingestionStatus === 'INDEXING',
  ).length;

  const failedCount = sampleDocuments.filter((d) => d.ingestionStatus === 'FAILED').length;

  return (
    <div
      data-testid="knowledge-metric-cards"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {/* 1. Total Documents */}
      <Card
        data-testid="metric-total-documents"
        className="rounded-xl border-border/60 bg-card/60 p-4 shadow-2xs flex flex-col justify-between transition-colors hover:border-border"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Total Documentos</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {totalDocuments}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Archivos registrados en el repositorio
          </p>
        </div>
      </Card>

      {/* 2. Ready / Indexed for RAG */}
      <Card
        data-testid="metric-indexed-documents"
        className="rounded-xl border-border/60 bg-card/60 p-4 shadow-2xs flex flex-col justify-between transition-colors hover:border-border"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Indexados (RAG Listo)</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {indexedCount}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {isSampled
              ? `En muestra de ${sampleCount} recientes`
              : 'Disponibles para consultas asistidas'}
          </p>
        </div>
      </Card>

      {/* 3. In-flight / Processing */}
      <Card
        data-testid="metric-processing-documents"
        className="rounded-xl border-border/60 bg-card/60 p-4 shadow-2xs flex flex-col justify-between transition-colors hover:border-border"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">En Proceso / En Cola</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
            {pendingOrProcessingCount}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            En extracción o incrustación vectorial
          </p>
        </div>
      </Card>

      {/* 4. Attention / Failed */}
      <Card
        data-testid="metric-failed-documents"
        className="rounded-xl border-border/60 bg-card/60 p-4 shadow-2xs flex flex-col justify-between transition-colors hover:border-border"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Errores de Indexación</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
            {failedCount}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {failedCount > 0 ? 'Requieren revisión o reintento' : 'Sin fallos reportados'}
          </p>
        </div>
      </Card>
    </div>
  );
};
