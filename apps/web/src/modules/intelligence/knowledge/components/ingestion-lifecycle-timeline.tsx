import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Ban,
  RotateCcw,
  RefreshCw,
  Layers,
  Database,
  Cpu,
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type {
  IngestionJobItem,
  IngestionStageInfo,
  IngestionStageId,
  IngestionRetrievalStatus,
  IngestionFailureCategory,
} from '../types/knowledge-contract.types';

export interface IngestionLifecycleTimelineProps {
  readonly documentId: string;
  readonly versionId?: string;
  readonly job?: IngestionJobItem | null;
  readonly retrievalStatus?: IngestionRetrievalStatus | null;
  readonly isLoading?: boolean;
  readonly isRefreshing?: boolean;
  readonly error?: Error | null;
  readonly canManage?: boolean;
  readonly onRefresh?: () => void;
  readonly onRetry?: () => void;
  readonly onCancel?: () => void;
  readonly isRetryPending?: boolean;
  readonly isCancelPending?: boolean;
  readonly className?: string;
}

// Stage descriptive dictionary matching backend IngestionStageId
const STAGE_META: Record<
  IngestionStageId,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  VALIDATING: {
    title: 'Validación de Documento',
    description: 'Verificación de integridad, tipo MIME y formato de archivo.',
    icon: FileCheck2,
  },
  PROCESSING: {
    title: 'Extracción y Fragmentación',
    description: 'Extracción de texto estructurado y división en fragmentos semánticos.',
    icon: Cpu,
  },
  INDEXING: {
    title: 'Indexación Vectorial',
    description: 'Cálculo de embeddings densos y registro en el índice activo.',
    icon: Database,
  },
};

const FAILURE_CATEGORY_LABELS: Record<IngestionFailureCategory, string> = {
  VALIDATION: 'Error de Validación',
  PARSING: 'Error de Extracción de Texto',
  CHUNKING: 'Error de Fragmentación',
  INDEXING: 'Error de Indexación Vectorial',
  STORAGE: 'Error de Almacenamiento',
  INFRASTRUCTURE: 'Error de Infraestructura / Red',
  TIMEOUT: 'Tiempo de Espera Agotado',
  CANCELLATION: 'Cancelación Operativa',
  UNKNOWN: 'Error No Clasificado',
};

function formatIso(isoString?: string | null): string {
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

function formatDuration(durationMs?: number | null): string {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs) || durationMs < 0) {
    return '—';
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function computeLiveElapsed(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '—';
  try {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const diff = end - start;
    return diff >= 0 ? formatDuration(diff) : '—';
  } catch {
    return '—';
  }
}

export const IngestionLifecycleTimeline: React.FC<IngestionLifecycleTimelineProps> = ({
  documentId,
  versionId,
  job,
  retrievalStatus,
  isLoading = false,
  isRefreshing = false,
  error = null,
  canManage = false,
  onRefresh,
  onRetry,
  onCancel,
  isRetryPending = false,
  isCancelPending = false,
  className = '',
}) => {
  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div
        data-testid="ingestion-lifecycle-loading"
        className={`flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-xs ${className}`}
        aria-busy="true"
        aria-label="Cargando ciclo de vida de ingesta"
      >
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-8 w-24 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="space-y-3 pt-2">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // 2. Backend Error State
  if (error) {
    return (
      <div
        data-testid="ingestion-lifecycle-error"
        className={`flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 ${className}`}
        role="alert"
      >
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-semibold">
            No se pudo cargar la información de ciclo de vida
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {error.message ||
            'Ocurrió un error al consultar el estado de ingesta e indexación. Intenta actualizar nuevamente.'}
        </p>
        {onRefresh && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              data-testid="retry-fetch-lifecycle-button"
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reintentar consulta</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 3. Empty State (No jobs registered)
  if (!job) {
    return (
      <div
        data-testid="ingestion-lifecycle-empty"
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground ${className}`}
      >
        <Layers className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="font-medium text-foreground">Sin registros de ingesta</p>
        <p className="max-w-md">
          Este documento aún no tiene trabajos de ingesta o procesamiento registrados en el motor de
          conocimiento.
        </p>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="mt-2 h-8 text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Consultar estado</span>
          </Button>
        )}
      </div>
    );
  }

  // 4. Job Lifecycle & Stage Resolution
  const isInFlight =
    job.status === 'PROCESSING' ||
    job.status === 'INDEXING' ||
    job.status === 'VALIDATING' ||
    job.status === 'UPLOADED';

  const isFailed = job.status === 'FAILED';
  const isCancelled = job.status === 'CANCELLED';
  const isReady = job.status === 'READY';
  const canRetryJob = canManage && (job.canRetry || isFailed) && !isInFlight;
  const canCancelJob = canManage && isInFlight;

  // Stages deterministically ordered by order (or 1: VALIDATING, 2: PROCESSING, 3: INDEXING)
  const sortedStages: IngestionStageInfo[] = useMemo(() => {
    if (!job.stages || job.stages.length === 0) return [];
    const stageOrderMap: Record<IngestionStageId, number> = {
      VALIDATING: 1,
      PROCESSING: 2,
      INDEXING: 3,
    };
    return [...job.stages].sort((a, b) => {
      const orderA = a.order ?? stageOrderMap[a.stage] ?? 99;
      const orderB = b.order ?? stageOrderMap[b.stage] ?? 99;
      return orderA - orderB;
    });
  }, [job.stages]);

  // Find active or latest stage
  const currentStage = useMemo(() => {
    if (sortedStages.length === 0) return null;
    const inProgressStage = sortedStages.find((s) => s.status === 'IN_PROGRESS');
    if (inProgressStage) return inProgressStage;
    const failedStage = sortedStages.find((s) => s.status === 'FAILED');
    if (failedStage) return failedStage;
    return sortedStages[sortedStages.length - 1];
  }, [sortedStages]);

  // Aggregate duration: either durationMs or computed from authentic timestamps
  const displayDuration = job.durationMs
    ? formatDuration(job.durationMs)
    : computeLiveElapsed(job.startedAt, job.completedAt);

  // Failure metadata resolution (safe & sanitized)
  const failureInfo = job.failureInfo;
  const failureCategoryLabel = failureInfo?.category
    ? FAILURE_CATEGORY_LABELS[failureInfo.category] || failureInfo.category
    : 'Error de Ingesta';
  const failureMessage =
    failureInfo?.message ||
    job.lastErrorMessage ||
    'Ocurrió un error inesperado durante el procesamiento del documento.';

  return (
    <section
      data-testid="ingestion-lifecycle-section"
      aria-label="Línea de tiempo del ciclo de vida de ingesta"
      className={`flex flex-col gap-5 rounded-xl border border-border/70 bg-card p-5 shadow-xs ${className}`}
    >
      {/* ===================================================================== */}
      {/* 1. HEADER: Title, Refresh, and Overall Status                         */}
      {/* ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Ciclo de Vida de Ingesta e Indexación
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {currentStage ? (
                <span>
                  Etapa actual:{' '}
                  <strong className="text-foreground font-medium">
                    {STAGE_META[currentStage.stage]?.title || currentStage.stage}
                  </strong>
                  {versionId ? ` • Versión: ${versionId}` : ''}
                </span>
              ) : (
                <span>
                  Monitoreo del procesamiento vectorial y disponibilidad para recuperación asistida.
                  {documentId ? ` • ID: ${documentId.substring(0, 8)}…` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Global Status Badge & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <IngestionStatusBadge status={job.status} />

          {isInFlight && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full"
            >
              <Loader2
                className="h-3 w-3 animate-spin motion-safe:animate-spin"
                aria-hidden="true"
              />
              <span>En ejecución</span>
            </span>
          )}

          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              data-testid="refresh-lifecycle-button"
              title="Actualizar estado del trabajo"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin motion-safe:animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sr-only">Actualizar estado</span>
            </Button>
          )}

          {canRetryJob && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetryPending}
              data-testid="lifecycle-retry-button"
              className="h-8 text-xs gap-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              {isRetryPending ? (
                <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
              )}
              <span>Reintentar</span>
            </Button>
          )}

          {canCancelJob && onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isCancelPending}
              data-testid="lifecycle-cancel-button"
              className="h-8 text-xs gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              {isCancelPending ? (
                <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="h-3 w-3" aria-hidden="true" />
              )}
              <span>Cancelar</span>
            </Button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. SUMMARY METRICS / ACTIVE STAGE SUMMARY                             */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Metric 1: Job ID */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
          <span className="text-[11px] text-muted-foreground block">ID Trabajo</span>
          <span
            data-testid="lifecycle-job-id"
            className="font-mono text-[11px] font-medium text-foreground truncate block mt-0.5"
            title={job.id}
          >
            {job.id.length > 12 ? `${job.id.substring(0, 12)}…` : job.id}
          </span>
        </div>

        {/* Metric 2: Intentos */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
          <span className="text-[11px] text-muted-foreground block">Intentos</span>
          <span
            data-testid="lifecycle-attempts"
            className="font-medium text-foreground block mt-0.5"
          >
            {job.attemptCount} / {job.maxAttempts}
          </span>
        </div>

        {/* Metric 3: Hora de Inicio */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
          <span className="text-[11px] text-muted-foreground block">Inicio</span>
          <span
            data-testid="lifecycle-started-at"
            className="text-[11px] font-medium text-foreground truncate block mt-0.5"
          >
            {formatIso(job.startedAt || job.createdAt)}
          </span>
        </div>

        {/* Metric 4: Duración Real */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
          <span className="text-[11px] text-muted-foreground block">Duración</span>
          <span
            data-testid="lifecycle-duration"
            className="font-mono text-[11px] font-medium text-foreground block mt-0.5"
          >
            {displayDuration}
          </span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. RETRIEVAL READINESS BANNER (RAG Readiness Check)                  */}
      {/* ===================================================================== */}
      <div
        data-testid="retrieval-readiness-card"
        className={`rounded-lg border p-3.5 text-xs transition-colors ${
          retrievalStatus?.overallReady
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : isReady
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-border/60 bg-muted/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            {retrievalStatus?.overallReady ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : isReady ? (
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <h4 className="font-semibold text-foreground text-xs">
              Disponibilidad para Recuperación Asistida (RAG)
            </h4>
          </div>

          <div>
            {retrievalStatus?.overallReady ? (
              <Badge
                variant="default"
                data-testid="retrieval-ready-badge"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold"
              >
                Disponible en RAG
              </Badge>
            ) : (
              <Badge
                variant="outline"
                data-testid="retrieval-not-ready-badge"
                className="text-[10px] font-medium text-muted-foreground bg-muted/40"
              >
                No disponible en RAG
              </Badge>
            )}
          </div>
        </div>

        {/* Readiness Detailed Checklist */}
        <div className="pt-2.5 space-y-1.5 text-[11px]">
          <p className="text-muted-foreground leading-relaxed">
            {retrievalStatus?.overallReady
              ? 'El documento ha completado la ingesta y sus representaciones vectoriales están confirmadas en la generación de índice activa.'
              : isReady
                ? 'La ingesta finalizó, pero el documento aún no está completamente activo en el índice vectorial o requiere sincronización.'
                : 'El documento no está disponible para consultas asistidas mientras se procesa o si ocurrió un error.'}
          </p>

          {/* Granular verification invariants */}
          {retrievalStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 font-mono text-[10px]">
              <div className="flex items-center gap-1.5">
                {retrievalStatus.hasActiveIndexGeneration ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-muted-foreground">Generación activa de índice</span>
              </div>

              <div className="flex items-center gap-1.5">
                {retrievalStatus.chunksPersisted ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-muted-foreground">
                  Fragmentos persistidos en base de datos
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {retrievalStatus.embeddingsCommitted ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-muted-foreground">
                  Embeddings vinculados al índice activo
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {retrievalStatus.isDocumentActive ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="text-muted-foreground">Documento activo (no eliminado)</span>
              </div>
            </div>
          )}

          {retrievalStatus?.activeGenerationId && (
            <div className="text-[10px] text-muted-foreground pt-0.5">
              Generación de índice:{' '}
              <span className="font-mono text-foreground font-medium">
                {retrievalStatus.activeGenerationId}
              </span>
            </div>
          )}

          {/* Diagnostic reasons if not ready */}
          {retrievalStatus?.reasons && retrievalStatus.reasons.length > 0 && (
            <ul
              data-testid="retrieval-reasons-list"
              className="list-disc list-inside text-[10px] text-amber-700 dark:text-amber-400 pt-1 space-y-0.5"
            >
              {retrievalStatus.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. CHRONOLOGICAL STAGE TIMELINE                                       */}
      {/* ===================================================================== */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Etapas de Procesamiento
        </h4>

        {sortedStages.length > 0 ? (
          <ol
            data-testid="stages-timeline-list"
            aria-label="Etapas de procesamiento de ingesta"
            className="relative border-l border-border/60 ml-3 space-y-4 py-1"
          >
            {sortedStages.map((stage, idx) => {
              const meta = STAGE_META[stage.stage] || {
                title: stage.stage,
                description: 'Etapa de procesamiento del motor de ingesta.',
                icon: Layers,
              };

              const StageIcon = meta.icon;
              const isStageInProgress = stage.status === 'IN_PROGRESS';
              const isStageCompleted = stage.status === 'COMPLETED';
              const isStageFailed = stage.status === 'FAILED';
              const isStageCancelled = stage.status === 'CANCELLED';
              const isStageSkipped = stage.status === 'SKIPPED';

              return (
                <li
                  key={stage.stage || idx}
                  data-testid={`stage-item-${stage.stage.toLowerCase()}`}
                  aria-current={isStageInProgress ? 'step' : undefined}
                  className="ml-6 relative"
                >
                  {/* Timeline Node Bullet */}
                  <span
                    className={`absolute -left-[31px] top-1 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-xs transition-colors ${
                      isStageCompleted
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                        : isStageInProgress
                          ? 'border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10 ring-2 ring-sky-500/20'
                          : isStageFailed
                            ? 'border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10'
                            : isStageCancelled
                              ? 'border-border/60 text-muted-foreground bg-muted'
                              : 'border-border/60 text-muted-foreground/60 bg-muted/40'
                    }`}
                  >
                    {isStageCompleted ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : isStageInProgress ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    ) : isStageFailed ? (
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : isStageCancelled ? (
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Clock className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>

                  {/* Stage Card */}
                  <div className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <StageIcon
                          className="h-3.5 w-3.5 text-primary shrink-0"
                          aria-hidden="true"
                        />
                        <h5 className="font-semibold text-foreground text-xs">{meta.title}</h5>
                      </div>

                      {/* Stage Status Badge */}
                      <span
                        data-testid={`stage-status-badge-${stage.stage.toLowerCase()}`}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          isStageCompleted
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : isStageInProgress
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : isStageFailed
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : isStageCancelled
                                  ? 'bg-muted text-muted-foreground'
                                  : isStageSkipped
                                    ? 'bg-muted text-muted-foreground'
                                    : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isStageCompleted && 'Completado'}
                        {isStageInProgress && 'En progreso'}
                        {isStageFailed && 'Fallido'}
                        {isStageCancelled && 'Cancelado'}
                        {isStageSkipped && 'Omitido'}
                        {stage.status === 'PENDING' && 'Pendiente'}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {meta.description}
                    </p>

                    {/* Stage Metrics & Authentic Timestamps */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-mono mt-2 pt-1 border-t border-border/30">
                      {stage.startedAt && <span>Inicio: {formatIso(stage.startedAt)}</span>}
                      {stage.completedAt && <span>Fin: {formatIso(stage.completedAt)}</span>}
                      {stage.durationMs !== undefined && (
                        <span>Duración: {formatDuration(stage.durationMs)}</span>
                      )}
                      {stage.metrics?.totalChunks !== undefined && (
                        <span className="text-foreground font-semibold">
                          Fragmentos: {stage.metrics.totalChunks}
                        </span>
                      )}
                      {stage.metrics?.embeddedChunks !== undefined && (
                        <span className="text-foreground font-semibold">
                          Vectorizados: {stage.metrics.embeddedChunks}
                        </span>
                      )}
                      {stage.error && (
                        <span className="text-rose-600 dark:text-rose-400">
                          Error: {stage.error}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          /* Honest fallback when backend does not provide granular stage breakdown */
          <div
            data-testid="legacy-aggregate-stages-notice"
            className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs text-muted-foreground leading-relaxed"
          >
            <div className="flex items-center gap-2 text-foreground font-medium mb-1">
              <Info className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Estado Consolidado del Motor de Ingesta</span>
            </div>
            <p className="text-[11px]">
              El backend expone un estado consolidado para este registro de procesamiento. Todas las
              operaciones de extracción, vectorización y almacenamiento se informan mediante el
              estado general:{' '}
              <span className="font-semibold text-foreground uppercase">{job.status}</span>.
            </p>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 5. SAFE FAILURE & CANCELLATION DETAILS                                */}
      {/* ===================================================================== */}
      {isFailed && (
        <div
          data-testid="ingestion-failure-box"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-800 dark:text-rose-300 space-y-2"
          role="alert"
        >
          <div className="flex items-center justify-between gap-2 border-b border-rose-500/20 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <h5 className="font-bold text-xs">{failureCategoryLabel}</h5>
            </div>
            {failureInfo?.code && (
              <span className="font-mono text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded text-rose-900 dark:text-rose-200">
                Código: {failureInfo.code}
              </span>
            )}
          </div>

          <p data-testid="ingestion-failure-message" className="text-[11px] leading-relaxed">
            {failureMessage}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-rose-700 dark:text-rose-400">
            <span>
              {failureInfo?.isTransient
                ? 'El fallo parece transitorio; se recomienda reintentar la operación.'
                : 'El fallo requiere revisión o sustitución del archivo antes de reintentar.'}
            </span>

            {canRetryJob && onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={isRetryPending}
                className="h-7 text-xs gap-1 border-rose-500/40 text-rose-700 hover:bg-rose-500/20"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reintentar ahora</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cancellation Banner */}
      {isCancelled && (
        <div
          data-testid="ingestion-cancellation-box"
          className="rounded-lg border border-border/70 bg-muted/40 p-3.5 text-xs text-muted-foreground space-y-1.5"
        >
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Ban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>Trabajo de Ingesta Cancelado</span>
          </div>
          <p className="text-[11px]">
            La indexación fue detenida por un operador
            {job.cancelledAt ? ` el ${formatIso(job.cancelledAt)}` : ''}.
          </p>
          {job.cancellationReason && (
            <div className="text-[11px] pt-1">
              Motivo: <span className="font-medium text-foreground">{job.cancellationReason}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
