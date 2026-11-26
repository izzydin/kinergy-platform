import React, { useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Ban,
  Copy,
  Check,
} from 'lucide-react';
import { Button, Badge, Skeleton } from '@kinergy-platform/ui';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type {
  IngestionJobItem,
  IngestionFailureCategory,
  IngestionStageId,
} from '../types/knowledge-contract.types';

export interface ProcessingHistoryDiagnosticsProps {
  readonly documentId: string;
  readonly jobs?: readonly IngestionJobItem[] | null;
  readonly selectedJobId?: string | null;
  readonly onSelectJob?: (jobId: string) => void;
  readonly isLoading?: boolean;
  readonly isRefreshing?: boolean;
  readonly error?: Error | null;
  readonly canManage?: boolean;
  readonly onRefresh?: () => void;
  readonly onRetry?: () => void;
  readonly isRetryPending?: boolean;
  readonly className?: string;
}

const FAILURE_CATEGORY_LABELS: Record<IngestionFailureCategory, string> = {
  VALIDATION: 'Validación de Formato y Estructura',
  PARSING: 'Extracción y Análisis de Texto',
  CHUNKING: 'Fragmentación Semántica',
  INDEXING: 'Indexación Vectorial / Embeddings',
  STORAGE: 'Almacenamiento de Archivos',
  INFRASTRUCTURE: 'Infraestructura y Red',
  TIMEOUT: 'Tiempo de Procesamiento Agotado',
  CANCELLATION: 'Cancelación Operativa',
  UNKNOWN: 'Fallo No Clasificado',
};

const STAGE_LABELS: Record<IngestionStageId, string> = {
  VALIDATING: 'Validación de Documento',
  PROCESSING: 'Extracción y Fragmentación',
  INDEXING: 'Indexación Vectorial',
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

export const ProcessingHistoryDiagnostics: React.FC<ProcessingHistoryDiagnosticsProps> = ({
  documentId,
  jobs,
  selectedJobId,
  onSelectJob,
  isLoading = false,
  isRefreshing = false,
  error = null,
  canManage = false,
  onRefresh,
  onRetry,
  isRetryPending = false,
  className = '',
}) => {
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Deterministically sort jobs descending by createdAt
  const sortedJobs = useMemo(() => {
    if (!jobs || jobs.length === 0) return [];
    return [...jobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [jobs]);

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedJobs.slice(start, start + pageSize);
  }, [sortedJobs, currentPage]);

  // Determine active job for inspection
  const activeJob = useMemo(() => {
    if (sortedJobs.length === 0) return null;
    if (selectedJobId) {
      const found = sortedJobs.find((j) => j.id === selectedJobId);
      if (found) return found;
    }
    return sortedJobs[0];
  }, [sortedJobs, selectedJobId]);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // =========================================================================
  // 1. Loading State
  // =========================================================================
  if (isLoading) {
    return (
      <section
        data-testid="processing-history-loading"
        aria-busy="true"
        aria-label="Cargando historial de procesamiento y diagnósticos"
        className={`flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs ${className}`}
      >
        <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-48 rounded" />
          </div>
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </section>
    );
  }

  // =========================================================================
  // 2. Error State
  // =========================================================================
  if (error) {
    return (
      <section
        data-testid="processing-history-error"
        className={`flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs shadow-xs ${className}`}
        role="alert"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Error al cargar historial de procesamiento</span>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="h-7 text-xs gap-1 border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Reintentar</span>
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-[11px]">{error.message}</p>
      </section>
    );
  }

  const isSelectedFailed = activeJob?.status === 'FAILED';
  const isSelectedProcessing =
    activeJob?.status === 'PROCESSING' ||
    activeJob?.status === 'VALIDATING' ||
    activeJob?.status === 'INDEXING' ||
    activeJob?.status === 'UPLOADED';
  const isSelectedReady = activeJob?.status === 'READY';
  const isSelectedCancelled = activeJob?.status === 'CANCELLED';

  const failureInfo = activeJob?.failureInfo;
  const failureCategoryLabel = failureInfo?.category
    ? FAILURE_CATEGORY_LABELS[failureInfo.category] || 'Fallo de Procesamiento'
    : 'Fallo de Procesamiento';

  const failedStageLabel = failureInfo?.failedStage
    ? STAGE_LABELS[failureInfo.failedStage] || failureInfo.failedStage
    : activeJob?.currentStage
      ? activeJob.currentStage
      : 'Etapa desconocida';

  const failureMessage =
    failureInfo?.message ||
    activeJob?.lastErrorMessage ||
    'Ocurrió un error inesperado durante el procesamiento del documento.';

  const canRetryJob = Boolean(
    activeJob &&
    (activeJob.canRetry ||
      failureInfo?.isRetryable ||
      failureInfo?.canRetry ||
      (activeJob.status === 'FAILED' && activeJob.attemptCount < activeJob.maxAttempts)),
  );

  return (
    <section
      data-testid="ingestion-history-section"
      data-document-id={documentId}
      className={`flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-xs ${className}`}
      aria-label="Historial de procesamiento y diagnóstico de fallos"
    >
      {/* ---------------- Header ---------------- */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Historial de Procesamiento e Intentos ({sortedJobs.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isRefreshing && (
            <span
              data-testid="processing-history-refreshing"
              aria-live="polite"
              className="text-[11px] text-muted-foreground flex items-center gap-1"
            >
              <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> Actualizando...
            </span>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Actualizar registro de procesamiento"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`}
              />
            </Button>
          )}
        </div>
      </div>

      {/* ---------------- Processing History Table / List ---------------- */}
      {sortedJobs.length > 0 ? (
        <div className="overflow-x-auto space-y-2">
          <table
            data-testid="processing-history-table"
            className="w-full text-left text-xs border-collapse"
          >
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground text-[11px]">
                <th scope="col" className="py-2 px-3 font-semibold">
                  Intento
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  ID Trabajo
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Versión
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Inicio
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Fin
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Duración
                </th>
                <th scope="col" className="py-2 px-3 font-semibold">
                  Diagnóstico
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {paginatedJobs.map((job) => {
                const isSelected = activeJob?.id === job.id;
                const isFailed = job.status === 'FAILED';
                const isReady = job.status === 'READY';
                return (
                  <tr
                    key={job.id}
                    data-testid={`ingestion-job-row-${job.id}`}
                    onClick={() => onSelectJob?.(job.id)}
                    className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                      isSelected ? 'bg-primary/5 font-medium ring-1 ring-primary/20' : ''
                    }`}
                    title="Haz clic para inspeccionar los diagnósticos de este intento"
                  >
                    <td className="py-2.5 px-3 text-muted-foreground">
                      <span className="font-semibold text-foreground">#{job.attemptCount}</span>{' '}
                      <span className="text-[10px]">/ {job.maxAttempts}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{job.id.length > 10 ? `${job.id.substring(0, 10)}…` : job.id}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(job.id);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copiar ID de trabajo"
                        >
                          {copiedId === job.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {job.versionNumber ? (
                        <span className="font-semibold text-foreground">v{job.versionNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {job.documentVersionId.length > 8
                            ? `${job.documentVersionId.substring(0, 8)}…`
                            : job.documentVersionId}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <IngestionStatusBadge status={job.status} />
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                      {formatIso(job.startedAt || job.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                      {job.completedAt
                        ? formatIso(job.completedAt)
                        : job.cancelledAt
                          ? formatIso(job.cancelledAt)
                          : 'En curso'}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                      {formatDuration(job.durationMs)}
                    </td>
                    <td className="py-2.5 px-3 max-w-[220px] truncate">
                      {isFailed ? (
                        <span
                          data-testid={`job-failed-summary-${job.id}`}
                          className="text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1"
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {job.failureInfo?.category
                              ? FAILURE_CATEGORY_LABELS[job.failureInfo.category]
                              : job.lastErrorMessage || 'Fallo registrado'}
                          </span>
                        </span>
                      ) : isReady ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>Completado</span>
                        </span>
                      ) : job.status === 'CANCELLED' ? (
                        <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                          <Ban className="h-3 w-3 shrink-0" />
                          <span>Cancelado</span>
                        </span>
                      ) : (
                        <span className="text-sky-600 dark:text-sky-400 text-[11px] flex items-center gap-1">
                          <Loader2 className="h-3 w-3 motion-safe:animate-spin shrink-0" />
                          <span>En curso</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Client-side Pagination for Large Processing Histories */}
          {totalPages > 1 && (
            <div
              data-testid="history-pagination"
              className="flex items-center justify-between border-t border-border/40 pt-2 px-1 text-[11px] text-muted-foreground"
            >
              <span>
                Página {currentPage} de {totalPages} ({sortedJobs.length} intentos)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="history-pagination-prev"
                  className="h-6 px-2 text-[10px]"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="history-pagination-next"
                  className="h-6 px-2 text-[10px]"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty history state */
        <div
          data-testid="processing-history-empty"
          className="py-8 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border/60 bg-muted/10 p-4"
        >
          <FileText className="h-7 w-7 text-muted-foreground/60 mx-auto mb-2" aria-hidden="true" />
          <p className="font-medium text-foreground">Sin historial de procesamiento registrado</p>
          <p className="text-[11px] mt-0.5">
            No se han registrado intentos de ingesta previos para este documento en el sistema.
          </p>
        </div>
      )}

      {/* ---------------- Active Job Diagnostic Inspection ---------------- */}
      {activeJob && (
        <div
          data-testid="active-job-diagnostics-panel"
          className="mt-1 flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5 text-xs"
        >
          {/* Header of selected job inspection */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="font-semibold text-foreground text-xs">
                Diagnóstico del Intento #{activeJob.attemptCount} ({activeJob.id})
              </span>
              <IngestionStatusBadge status={activeJob.status} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {activeJob.versionNumber ? `Versión v${activeJob.versionNumber}` : ''} • Duración:{' '}
              {formatDuration(activeJob.durationMs)}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* ADMINISTRATIVE VIEW (Standard Operational Information)                    */}
          {/* ========================================================================= */}
          <div data-testid="administrative-diagnostics-view" className="space-y-3">
            {isSelectedFailed && (
              <div
                data-testid="failure-administrative-box"
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-rose-800 dark:text-rose-300 space-y-2"
                role="alert"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-rose-500/20 pb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span data-testid="failure-category-badge" className="font-bold text-xs">
                      {failureCategoryLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-rose-500/15 border-rose-500/30 text-rose-800 dark:text-rose-200"
                    >
                      Etapa: {failedStageLabel}
                    </Badge>
                    {activeJob.lastErrorCode && (
                      <span
                        data-testid="failure-error-code-badge"
                        className="font-mono text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded text-rose-900 dark:text-rose-100"
                      >
                        {activeJob.lastErrorCode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Safe Human-Readable Explanation */}
                <p
                  data-testid="failure-explanation-message"
                  className="text-[11px] leading-relaxed font-normal"
                >
                  {failureMessage}
                </p>

                {/* Retryability & Next Retry Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-rose-500/20 text-[10px]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">Recuperabilidad:</span>
                      <span data-testid="failure-retryability-indicator">
                        {canRetryJob
                          ? 'Fallo transitorio/recuperable. Se permite el reintento de la operación.'
                          : 'Fallo no recuperable. Corrija o reemplace el documento antes de intentar una nueva versión.'}
                      </span>
                    </div>
                    {activeJob.nextRetryAt && (
                      <div
                        data-testid="failure-next-retry-info"
                        className="text-rose-700/80 dark:text-rose-300/80"
                      >
                        Próximo reintento programado:{' '}
                        <span className="font-mono">{formatIso(activeJob.nextRetryAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Retry Action */}
                  {canRetryJob && onRetry && canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRetry}
                      disabled={isRetryPending}
                      data-testid="history-retry-button"
                      className="h-7 text-xs gap-1 border-rose-500/40 text-rose-800 dark:text-rose-200 hover:bg-rose-500/20 self-start sm:self-auto shrink-0"
                    >
                      {isRetryPending ? (
                        <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      <span>Reintentar ahora</span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {isSelectedReady && (
              <div
                data-testid="success-administrative-box"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-xs">
                      Procesamiento e indexación completados exitosamente
                    </p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      El contenido de esta versión ha sido validado, fragmentado y registrado para
                      recuperación semántica.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isSelectedProcessing && (
              <div
                data-testid="processing-administrative-box"
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sky-800 dark:text-sky-300 flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 text-sky-600 dark:text-sky-400 motion-safe:animate-spin shrink-0" />
                <div>
                  <p className="font-semibold text-xs">Procesamiento de ingesta en curso</p>
                  <p className="text-[11px] text-sky-700 dark:text-sky-400">
                    La versión se encuentra ejecutando la fase de{' '}
                    <span className="font-semibold uppercase">{activeJob.status}</span>.
                  </p>
                  <p className="text-[10px] text-sky-700/80 dark:text-sky-400/80 mt-0.5">
                    Supervisión activa: El servicio watchdog supervisa trabajos en ejecución y
                    recupera automáticamente procesos interrumpidos.
                  </p>
                </div>
              </div>
            )}

            {isSelectedCancelled && (
              <div
                data-testid="cancelled-administrative-box"
                className="rounded-lg border border-border/70 bg-muted/30 p-3 text-muted-foreground flex items-center gap-2"
              >
                <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-semibold text-foreground text-xs">
                    Trabajo cancelado por el operador
                  </p>
                  <p className="text-[11px]">
                    {activeJob.cancellationReason
                      ? `Motivo: ${activeJob.cancellationReason}`
                      : 'La ejecución fue interrumpida antes de su finalización.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* TECHNICAL DETAIL VIEW (Collapsible & Permission Gated)                    */}
          {/* ========================================================================= */}
          <div className="border-t border-border/40 pt-2.5">
            <button
              type="button"
              onClick={() => setIsTechnicalExpanded(!isTechnicalExpanded)}
              data-testid="toggle-technical-diagnostics-button"
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={isTechnicalExpanded}
            >
              {isTechnicalExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Diagnóstico Técnico Avanzado</span>
            </button>

            {isTechnicalExpanded && (
              <div
                data-testid="technical-diagnostics-view"
                className="mt-3 rounded-lg border border-border/60 bg-card p-3 space-y-3"
              >
                {/* Role Authorization Check */}
                {!canManage ? (
                  <div
                    data-testid="technical-diagnostics-restricted"
                    className="p-3 rounded border border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-2"
                  >
                    <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      Acceso restringido: Los diagnósticos técnicos detallados y códigos de error
                      avanzados están reservados para usuarios con permisos administrativos.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Código de Error Técnico:
                        </span>
                        <span
                          data-testid="tech-error-code"
                          className="font-mono font-medium text-foreground"
                        >
                          {activeJob.lastErrorCode || failureInfo?.code || 'SIN_ERROR'}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Identificador del Trabajo:
                        </span>
                        <span
                          data-testid="tech-job-id"
                          className="font-mono text-muted-foreground block truncate"
                          title={activeJob.id}
                        >
                          {activeJob.id}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Documento / Versión:
                        </span>
                        <span data-testid="tech-version-info" className="font-mono text-foreground">
                          doc:{activeJob.documentId.substring(0, 8)}… / ver:
                          {activeJob.documentVersionId.substring(0, 8)}…
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Fecha de Creación:
                        </span>
                        <span className="font-mono text-foreground">
                          {formatIso(activeJob.createdAt)}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Fecha de Inicio:
                        </span>
                        <span className="font-mono text-foreground">
                          {formatIso(activeJob.startedAt)}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Fecha de Conclusión:
                        </span>
                        <span className="font-mono text-foreground">
                          {formatIso(activeJob.completedAt || activeJob.cancelledAt)}
                        </span>
                      </div>
                    </div>

                    {/* Sensitive protection audit disclaimer */}
                    <div
                      data-testid="sensitive-info-protection-notice"
                      className="flex items-center gap-1.5 pt-2 border-t border-border/40 text-[10px] text-muted-foreground"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Protección de seguridad activa: Este panel excluye credenciales, claves API,
                        trazas de pila completas y rutas de almacenamiento internas.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
