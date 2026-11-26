import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  Edit3,
  Trash2,
  RotateCcw,
  Ban,
  Clock,
  Shield,
  Layers,
  Copy,
  Check,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  FileQuestion,
  Loader2,
  Calendar,
  User,
  HardDrive,
  Eye,
  Info,
  GitCompare,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { Button, Badge, Skeleton, Alert } from '@kinergy-platform/ui';
import { IntelligencePageContainer } from '../../components/intelligence-page-container';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { useNotification } from '../../../../app/providers/notification-provider';
import {
  useKnowledgeDocument,
  useDocumentIngestionHistory,
  useDocumentRetrievalStatus,
} from '../hooks/use-knowledge-queries';
import {
  useRetryDocumentIngestion,
  useCancelDocumentIngestion,
} from '../hooks/use-knowledge-mutations';
import { triggerDocumentDownload, knowledgeApi } from '../api/knowledge.api';
import { IngestionStatusBadge } from '../components/ingestion-status-badge';
import { IngestionLifecycleTimeline } from '../components/ingestion-lifecycle-timeline';
import { ProcessingHistoryDiagnostics } from '../components/processing-history-diagnostics';
import { DocumentEditMetadataModal } from '../components/document-edit-metadata-modal';
import { DocumentDeleteDialog } from '../components/document-delete-dialog';
import { DocumentRestoreDialog } from '../components/document-restore-dialog';
import { DocumentReprocessDialog } from '../components/document-reprocess-dialog';
import { DocumentRetryDialog } from '../components/document-retry-dialog';
import { KnowledgeDocumentPreviewModal } from '../components/knowledge-document-preview-modal';
import { VersionDetailModal } from '../components/version-detail-modal';
import { VersionComparisonModal } from '../components/version-comparison-modal';
import { DocumentUploadModal } from '../components/document-upload-modal';
import type {
  KnowledgeDocumentItem,
  DocumentVersionItem,
  IngestionJobItem,
  VisibilityScope,
} from '../types/knowledge-contract.types';

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
    }).format(d);
  } catch {
    return isoString;
  }
}

function getVisibilityLabel(scope?: VisibilityScope): { label: string; description: string } {
  switch (scope) {
    case 'CLINICAL_STAFF':
      return {
        label: 'Personal Clínico',
        description: 'Acceso restringido a terapeutas, kinesiólogos y personal de salud.',
      };
    case 'MANAGEMENT':
      return {
        label: 'Dirección / Gestión',
        description: 'Acceso restringido exclusivamente a coordinadores y administradores.',
      };
    case 'ALL_STAFF':
    default:
      return {
        label: 'Toda la organización',
        description: 'Visible para todos los colaboradores autorizados de la organización.',
      };
  }
}

/**
 * Knowledge Center Document Detail & Metadata Page.
 * Conforms to KC.06 requirements:
 * - Exposes verified backend metadata without leaking internal storage references or raw paths.
 * - Displays separate lifecycle representations for document status vs indexing progress.
 * - Permission-aware actions (download, edit metadata, retry/cancel ingestion, delete).
 * - Full version history and historical ingestion attempt inspection.
 * - Handles 404 Not Found, 403 Forbidden, and loading skeleton states.
 */
export const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const notification = useNotification();
  const auth = useOptionalAuth();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isReprocessDialogOpen, setIsReprocessDialogOpen] = useState(false);
  const [isRetryDialogOpen, setIsRetryDialogOpen] = useState(false);
  const [retryTargetVersionId, setRetryTargetVersionId] = useState<string | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | undefined>(undefined);
  const [selectedVersionForDetails, setSelectedVersionForDetails] =
    useState<DocumentVersionItem | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isUploadVersionModalOpen, setIsUploadVersionModalOpen] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState(false);
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const { data: document, isLoading, isError, error, refetch } = useKnowledgeDocument(documentId);

  // Deterministically sort versions descending by versionNumber (latest/current at top)
  const sortedVersions = useMemo(() => {
    return [...(document?.versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
  }, [document?.versions]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const {
    data: ingestionHistory,
    isLoading: isHistoryLoading,
    isRefetching: isHistoryRefetching,
    refetch: refetchIngestionHistory,
    error: historyError,
  } = useDocumentIngestionHistory(documentId);

  const {
    data: retrievalStatus,
    isLoading: isRetrievalLoading,
    refetch: refetchRetrievalStatus,
  } = useDocumentRetrievalStatus(documentId);

  const activeJob = useMemo(() => {
    if (!ingestionHistory || ingestionHistory.length === 0) return null;
    if (selectedJobId) {
      const found = ingestionHistory.find((j) => j.id === selectedJobId);
      if (found) return found;
    }
    return ingestionHistory[0];
  }, [ingestionHistory, selectedJobId]);

  const retryMutation = useRetryDocumentIngestion();
  const cancelMutation = useCancelDocumentIngestion();

  const handleManualRefresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([refetch(), refetchIngestionHistory(), refetchRetrievalStatus()]);
    } catch {
      notification.error('Error al actualizar el estado de procesamiento.');
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // Evaluate user roles for administrative operations
  const roles = (auth?.currentUser?.roles ?? []).map((r) => r.toUpperCase());
  const canManage =
    roles.includes('SUPER_ADMIN') ||
    roles.includes('SUPERADMIN') ||
    roles.includes('ADMIN') ||
    roles.includes('ADMINISTRATOR') ||
    roles.includes('OWNER') ||
    roles.includes('MANAGER') ||
    roles.includes('MANAGEMENT') ||
    roles.includes('GESTOR') ||
    roles.includes('ENERGY_MANAGER');

  const handleCopyChecksum = (checksum?: string) => {
    if (!checksum) return;
    void navigator.clipboard.writeText(checksum);
    setCopiedChecksum(true);
    setTimeout(() => setCopiedChecksum(false), 2000);
  };

  const handleDownloadLatest = async (doc: KnowledgeDocumentItem) => {
    try {
      await triggerDocumentDownload(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al descargar el archivo.';
      notification.error(msg);
    }
  };

  const handleDownloadVersion = async (version: DocumentVersionItem) => {
    if (!document) return;
    try {
      setDownloadingVersionId(version.id);
      const blob = await knowledgeApi.downloadDocument(document.id, version.id);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = version.originalFileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al descargar la versión.';
      notification.error(msg);
    } finally {
      setDownloadingVersionId(null);
    }
  };

  const handleRetryIngestion = () => {
    if (!document) return;
    setRetryTargetVersionId(undefined);
    setIsRetryDialogOpen(true);
  };

  const handleCancelIngestion = () => {
    if (!document) return;
    cancelMutation.mutate({ documentId: document.id, reason: 'Cancelado por el usuario' });
  };

  // =========================================================================
  // 1. LOADING SKELETON STATE
  // =========================================================================
  if (isLoading) {
    return (
      <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
        <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-8">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            {documentId && (
              <span className="text-xs text-muted-foreground font-mono">ID: {documentId}</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-5">
            <div className="space-y-2">
              <Skeleton className="h-7 w-72 rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </IntelligencePageContainer>
    );
  }

  // =========================================================================
  // 2. ERROR & INACCESSIBLE / NOT FOUND STATES
  // =========================================================================
  const is403Forbidden =
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    (error as { statusCode: number }).statusCode === 403;

  const is404NotFound =
    (error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      (error as { statusCode: number }).statusCode === 404) ||
    (!isLoading && !document);

  if (is403Forbidden) {
    return (
      <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
        <div className="max-w-xl mx-auto py-16 flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Acceso no autorizado</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              No posees el nivel de autorización o alcance de visibilidad requerido para consultar
              este documento en la base de conocimiento.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/intelligence/knowledge?view=library')}
            data-testid="forbidden-back-button"
            className="gap-2 mt-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la Biblioteca</span>
          </Button>
        </div>
      </IntelligencePageContainer>
    );
  }

  if (is404NotFound) {
    return (
      <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
        <div className="max-w-xl mx-auto py-16 flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileQuestion className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Documento no encontrado o eliminado
            </h2>
            {documentId && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {documentId}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              El documento solicitado no existe en la base de conocimiento o ha sido eliminado por
              un administrador.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/intelligence/knowledge?view=library')}
            data-testid="not-found-back-button"
            className="gap-2 mt-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la Biblioteca</span>
          </Button>
        </div>
      </IntelligencePageContainer>
    );
  }

  if (isError || !document) {
    return (
      <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
        <div className="max-w-xl mx-auto py-16 flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Error al cargar el documento</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              {error instanceof Error
                ? error.message
                : 'Error inesperado de comunicación con el servidor.'}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/intelligence/knowledge?view=library')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Volver</span>
            </Button>
            <Button variant="default" size="sm" onClick={() => void refetch()} className="gap-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reintentar</span>
            </Button>
          </div>
        </div>
      </IntelligencePageContainer>
    );
  }

  // =========================================================================
  // 3. DOCUMENT METADATA & LIFECYCLE RESOLUTION
  // =========================================================================
  const isDeleted = document.isDeleted || document.status === 'DELETED';
  const scopeInfo = getVisibilityLabel(document.visibilityScope);
  const isInFlightIngestion =
    document.ingestionStatus === 'PROCESSING' ||
    document.ingestionStatus === 'INDEXING' ||
    document.ingestionStatus === 'VALIDATING' ||
    document.ingestionStatus === 'UPLOADED';
  const isFailedIngestion = document.ingestionStatus === 'FAILED';

  // Find latest job failure explanation if available
  const latestFailedJob = (ingestionHistory || []).find(
    (j: IngestionJobItem) => j.status === 'FAILED',
  );
  const failureExplanation =
    latestFailedJob?.lastErrorMessage ||
    'Ocurrió un error inesperado durante la extracción de texto o la vectorización semántica.';

  return (
    <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-8">
        {/* Navigation Breadcrumb / Back Link */}
        <div>
          <Link
            to="/intelligence/knowledge?view=library"
            data-testid="back-to-library-link"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la Biblioteca de Documentos</span>
          </Link>
        </div>

        {/* Deleted Document Warning Banner */}
        {isDeleted && (
          <Alert variant="destructive" data-testid="deleted-document-alert" className="text-xs">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div>
              <strong>Documento eliminado:</strong> Este documento fue retirado de la base de
              conocimiento el {formatDate(document.deletedAt)}. Sus vectores asociados han sido
              purgados del índice y no está disponible para consultas asistidas.
            </div>
          </Alert>
        )}

        {/* Version Discrepancy Alert Banner */}
        {!isDeleted && retrievalStatus?.hasVersionDiscrepancy && (
          <Alert
            variant="warning"
            data-testid="version-discrepancy-alert"
            className="text-xs border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle
              className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
            <div>
              <strong>Discrepancia de Versión en Índice RAG:</strong>{' '}
              {retrievalStatus.discrepancyReason ||
                `La versión actual del documento (v${document.versionNumber ?? 1}) difiere de la versión indexada en el motor de búsqueda asistida (${
                  retrievalStatus.indexedVersionNumber
                    ? `v${retrievalStatus.indexedVersionNumber}`
                    : 'ninguna versión indexada'
                }).`}
            </div>
          </Alert>
        )}

        {/* =================================================================== */}
        {/* HEADER: Title, Badges & Administrative Actions                      */}
        {/* =================================================================== */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border/50 pb-5">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1
                data-testid="document-detail-title"
                className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate"
              >
                {document.title}
              </h1>

              {/* Status and Classification Badges */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {/* Indexing Status Badge */}
                <IngestionStatusBadge status={document.ingestionStatus} />

                {/* Document Lifecycle Badge */}
                {isDeleted ? (
                  <Badge variant="destructive" className="text-[11px] font-medium">
                    Eliminado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px] font-medium bg-muted/40">
                    Activo
                  </Badge>
                )}

                {/* Visibility Scope Badge */}
                <Badge
                  variant="secondary"
                  className="text-[11px] font-medium"
                  data-testid="document-scope-badge"
                >
                  {scopeInfo.label}
                </Badge>

                {/* Version Badge */}
                <span className="text-xs font-semibold text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60">
                  v{document.versionNumber ?? 1}
                </span>

                {/* Indexed Version in RAG Badge */}
                {retrievalStatus?.indexedVersionNumber !== undefined && (
                  <span
                    data-testid="indexed-version-badge"
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                      retrievalStatus.indexedVersionNumber === (document.versionNumber ?? 1)
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    <span>
                      RAG:{' '}
                      {retrievalStatus.indexedVersionNumber
                        ? `v${retrievalStatus.indexedVersionNumber}`
                        : 'Sin indexar'}
                    </span>
                  </span>
                )}

                {/* File Extension Badge */}
                {document.fileExtension && (
                  <span className="text-[11px] font-mono font-medium text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/60">
                    .{document.fileExtension}
                  </span>
                )}

                {/* Document ID */}
                <span className="text-[11px] font-mono text-muted-foreground">
                  ID: {document.id}
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {!isDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewVersionId(undefined);
                  setIsPreviewOpen(true);
                }}
                data-testid="preview-document-button"
                className="h-9 text-xs gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Previsualizar</span>
              </Button>
            )}

            {!isDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadLatest(document)}
                data-testid="download-document-button"
                className="h-9 text-xs gap-1.5"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Descargar</span>
              </Button>
            )}

            {canManage && !isDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                data-testid="edit-metadata-button"
                className="h-9 text-xs gap-1.5"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Editar Metadatos</span>
              </Button>
            )}

            {canManage && isFailedIngestion && !isDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryIngestion}
                disabled={retryMutation.isPending}
                data-testid="retry-ingestion-button"
                className="h-9 text-xs gap-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Reintentar Indexación</span>
              </Button>
            )}

            {canManage && isInFlightIngestion && !isDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelIngestion}
                disabled={cancelMutation.isPending}
                data-testid="cancel-ingestion-button"
                className="h-9 text-xs gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancelar Indexación</span>
              </Button>
            )}

            {canManage && !isDeleted && !isInFlightIngestion && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReprocessDialogOpen(true)}
                data-testid="reprocess-document-button"
                className="h-9 text-xs gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reindexar</span>
              </Button>
            )}

            {canManage && isDeleted && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsRestoreDialogOpen(true)}
                data-testid="restore-document-button"
                className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restaurar Documento</span>
              </Button>
            )}

            {canManage && !isDeleted && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                data-testid="delete-document-button"
                className="h-9 text-xs gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Eliminar</span>
              </Button>
            )}
          </div>
        </div>

        {/* Description Banner if available */}
        {document.description && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed">
            <h3 className="font-semibold text-foreground mb-1 text-xs">Descripción</h3>
            <p data-testid="document-description-text">{document.description}</p>
          </div>
        )}

        {/* =================================================================== */}
        {/* METADATA CARDS GRID                                                 */}
        {/* =================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: File Information */}
          <div
            data-testid="file-metadata-card"
            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs"
          >
            <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
              <HardDrive className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Información del Archivo
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Nombre original</span>
                <span
                  data-testid="metadata-filename"
                  className="font-medium text-foreground truncate block mt-0.5"
                >
                  {document.originalFileName || '—'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Formato</span>
                  <span
                    data-testid="metadata-extension"
                    className="font-medium text-foreground uppercase mt-0.5 block"
                  >
                    {document.fileExtension ? `.${document.fileExtension}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Tamaño</span>
                  <span
                    data-testid="metadata-filesize"
                    className="font-medium text-foreground mt-0.5 block"
                  >
                    {formatBytes(document.fileSize)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Tipo MIME</span>
                <span
                  data-testid="metadata-mimetype"
                  className="font-mono text-[11px] text-foreground truncate block mt-0.5"
                >
                  {document.mimeType || '—'}
                </span>
              </div>

              {document.checksum && (
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Integridad (SHA-256)
                  </span>
                  <div className="flex items-center justify-between gap-1 mt-0.5 bg-muted/40 px-2 py-1 rounded border border-border/40 font-mono text-[10px]">
                    <span
                      data-testid="metadata-checksum"
                      className="truncate text-muted-foreground"
                    >
                      {document.checksum}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyChecksum(document.checksum)}
                      data-testid="copy-checksum-button"
                      aria-label="Copiar checksum SHA-256"
                      className="h-6 w-6 p-0 hover:text-foreground text-muted-foreground shrink-0 rounded transition-colors"
                    >
                      {copiedChecksum ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Ownership & Access Control */}
          <div
            data-testid="ownership-metadata-card"
            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs"
          >
            <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Propiedad y Control de Acceso
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Propietario / Uploader
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span
                    data-testid="metadata-uploaded-by"
                    className="font-medium text-foreground truncate"
                  >
                    {document.uploadedBy || 'Sistema'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Alcance de visibilidad
                </span>
                <span
                  data-testid="metadata-scope-label"
                  className="font-medium text-foreground block mt-0.5"
                >
                  {scopeInfo.label}
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {scopeInfo.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Fecha de subida</span>
                  <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    <span
                      data-testid="metadata-created-at"
                      className="text-[11px] font-medium text-foreground"
                    >
                      {formatDate(document.createdAt)}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Última actualización
                  </span>
                  <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span
                      data-testid="metadata-updated-at"
                      className="text-[11px] font-medium text-foreground"
                    >
                      {formatDate(document.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Ingestion & Vector Lifecycle */}
          <div
            data-testid="lifecycle-metadata-card"
            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs"
          >
            <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ciclo de Vida de Indexación
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Estado del motor vectorial
                </span>
                <div className="mt-1">
                  <IngestionStatusBadge status={document.ingestionStatus} />
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Disponibilidad RAG</span>
                <span className="text-xs font-medium text-foreground block mt-0.5">
                  {retrievalStatus?.overallReady ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <Check className="h-3 w-3" aria-hidden="true" /> Disponible para Citación
                    </span>
                  ) : document.ingestionStatus === 'READY' ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      Sincronizando con índice activo
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No disponible</span>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Versión en RAG</span>
                  <span
                    data-testid="metadata-indexed-version"
                    className="font-medium text-foreground block mt-0.5"
                  >
                    {retrievalStatus?.indexedVersionNumber
                      ? `v${retrievalStatus.indexedVersionNumber}`
                      : retrievalStatus?.isReadyForRetrieval
                        ? `v${document.versionNumber ?? 1}`
                        : 'Ninguna'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Última indexación</span>
                  <span
                    data-testid="metadata-last-indexed-at"
                    className="font-medium text-foreground block mt-0.5 truncate"
                  >
                    {formatDate(retrievalStatus?.lastSuccessfulIndexingAt)}
                  </span>
                </div>
              </div>

              {/* Status Narrative Explanation */}
              <div className="rounded-md p-2.5 text-[11px] leading-relaxed bg-muted/30 border border-border/40">
                {document.ingestionStatus === 'READY' && (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    El documento está completamente indexado y disponible como fuente citada en las
                    consultas asistidas de Kynergy Intelligence.
                  </p>
                )}
                {isInFlightIngestion && (
                  <p className="text-blue-700 dark:text-blue-300">
                    Extrayendo texto y generando representaciones vectoriales en segundo plano. La
                    indexación finalizará de forma asíncrona.
                  </p>
                )}
                {isFailedIngestion && (
                  <p className="text-rose-700 dark:text-rose-400">
                    Falló el proceso de indexación. Puedes consultar el mensaje a continuación o
                    reintentar la ingesta.
                  </p>
                )}
                {document.ingestionStatus === 'CANCELLED' && (
                  <p className="text-amber-700 dark:text-amber-400">
                    La indexación fue cancelada por un operador. No estará disponible para
                    citaciones hasta que sea reintentada.
                  </p>
                )}
              </div>

              {/* Safe Failure Banner if FAILED */}
              {isFailedIngestion && (
                <div
                  data-testid="ingestion-failure-alert"
                  className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2.5 text-[11px] text-rose-700 dark:text-rose-400"
                >
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{failureExplanation}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* VERSION HISTORY TABLE                                               */}
        {/* =================================================================== */}
        <div
          data-testid="version-history-section"
          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Historial de Versiones ({sortedVersions.length})
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {sortedVersions.length >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCompareModalOpen(true)}
                  data-testid="compare-versions-button"
                  className="h-8 text-xs gap-1.5"
                >
                  <GitCompare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Comparar versiones</span>
                </Button>
              )}

              {canManage && !isDeleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadVersionModalOpen(true)}
                  data-testid="upload-new-version-button"
                  className="h-8 text-xs gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Subir nueva versión</span>
                </Button>
              )}
            </div>
          </div>

          {sortedVersions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground text-[11px]">
                    <th className="py-2 px-3 font-semibold">Versión</th>
                    <th className="py-2 px-3 font-semibold">Nombre de archivo</th>
                    <th className="py-2 px-3 font-semibold">Formato</th>
                    <th className="py-2 px-3 font-semibold">Tamaño</th>
                    <th className="py-2 px-3 font-semibold">Subido por</th>
                    <th className="py-2 px-3 font-semibold">Fecha de subida</th>
                    <th className="py-2 px-3 font-semibold">Estado RAG</th>
                    <th className="py-2 px-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedVersions.map((ver) => {
                    const isCurrent =
                      ver.id === document.currentVersionId ||
                      ver.versionNumber === document.versionNumber;
                    const isDownloading = downloadingVersionId === ver.id;
                    const isIndexedInRag =
                      retrievalStatus?.indexedVersionId === ver.id ||
                      retrievalStatus?.indexedVersionNumber === ver.versionNumber ||
                      (isCurrent &&
                        Boolean(retrievalStatus?.isReadyForRetrieval) &&
                        !retrievalStatus?.hasVersionDiscrepancy);

                    return (
                      <tr
                        key={ver.id}
                        data-testid={`version-row-${ver.versionNumber}`}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">
                              v{ver.versionNumber}
                            </span>
                            {isCurrent ? (
                              <span
                                data-testid="current-version-badge"
                                className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full"
                              >
                                Actual
                              </span>
                            ) : (
                              <span
                                data-testid={`historical-version-badge-${ver.versionNumber}`}
                                className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full"
                              >
                                Histórico
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-foreground truncate max-w-[180px]">
                          {ver.originalFileName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/60">
                            .{ver.fileExtension || 'pdf'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono">
                          {formatBytes(ver.fileSize)}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {ver.uploadedBy || 'Sistema'}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {formatDate(ver.createdAt)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <IngestionStatusBadge
                              status={
                                ver.ingestionStatus ||
                                (isCurrent ? document.ingestionStatus : 'READY')
                              }
                            />
                            {isIndexedInRag ? (
                              <span
                                data-testid={`version-${ver.versionNumber}-rag-badge`}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full"
                                title="Esta versión está actualmente representada en el índice activo de RAG"
                              >
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                <span>En RAG</span>
                              </span>
                            ) : isCurrent ? (
                              <span
                                data-testid={`version-${ver.versionNumber}-rag-badge`}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full"
                                title="Versión actual aún no disponible en el índice activo de RAG"
                              >
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                <span>No en RAG</span>
                              </span>
                            ) : (
                              <span
                                data-testid={`version-${ver.versionNumber}-rag-badge`}
                                className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full inline-block"
                                title="Versión histórica no activa en el índice"
                              >
                                Histórico
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedVersionForDetails(ver)}
                              data-testid={`version-details-${ver.versionNumber}-button`}
                              title={`Ver metadatos de versión v${ver.versionNumber}`}
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                              <span className="hidden sm:inline">Detalles</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPreviewVersionId(ver.id);
                                setIsPreviewOpen(true);
                              }}
                              disabled={isDeleted}
                              data-testid={`preview-version-${ver.versionNumber}-button`}
                              className="h-7 px-2 text-xs gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Previsualizar</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadVersion(ver)}
                              disabled={isDownloading || isDeleted}
                              data-testid={`download-version-${ver.versionNumber}-button`}
                              className="h-7 px-2 text-xs gap-1"
                            >
                              {isDownloading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              <span>Descargar</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              data-testid="empty-version-history"
              className="py-6 text-center text-xs text-muted-foreground"
            >
              No se encontraron versiones registradas para este documento.
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* INGESTION LIFECYCLE TIMELINE & RETRIEVAL READINESS                  */}
        {/* =================================================================== */}
        <IngestionLifecycleTimeline
          documentId={document.id}
          versionId={activeJob?.documentVersionId}
          job={activeJob}
          retrievalStatus={retrievalStatus}
          isLoading={isHistoryLoading || isRetrievalLoading}
          isRefreshing={isManualRefreshing || isHistoryRefetching}
          error={historyError as Error | null}
          canManage={canManage}
          onRefresh={handleManualRefresh}
          onRetry={handleRetryIngestion}
          onCancel={handleCancelIngestion}
          isRetryPending={retryMutation.isPending}
          isCancelPending={cancelMutation.isPending}
        />

        {/* =================================================================== */}
        {/* INGESTION PROCESSING HISTORY & FAILURE DIAGNOSTICS (IM.05)         */}
        {/* =================================================================== */}
        <ProcessingHistoryDiagnostics
          documentId={document.id}
          jobs={ingestionHistory}
          selectedJobId={activeJob?.id}
          onSelectJob={(jobId) => setSelectedJobId(jobId)}
          isLoading={isHistoryLoading}
          isRefreshing={isManualRefreshing || isHistoryRefetching}
          error={historyError as Error | null}
          canManage={canManage}
          onRefresh={handleManualRefresh}
          onRetry={handleRetryIngestion}
          isRetryPending={retryMutation.isPending}
        />
      </div>

      {/* Edit Metadata Modal */}
      {isEditModalOpen && (
        <DocumentEditMetadataModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          document={document}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <DocumentDeleteDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onDeleted={() => navigate('/intelligence/knowledge?view=library')}
          document={document}
        />
      )}

      {/* Restore Confirmation Dialog */}
      {isRestoreDialogOpen && (
        <DocumentRestoreDialog
          isOpen={isRestoreDialogOpen}
          onClose={() => setIsRestoreDialogOpen(false)}
          onRestored={() => void refetch()}
          document={{
            id: document.id,
            title: document.title,
            versionNumber: document.versionNumber,
            versionCount: document.versionCount,
          }}
        />
      )}

      {/* Reprocess / Reindex Confirmation Dialog */}
      {isReprocessDialogOpen && (
        <DocumentReprocessDialog
          isOpen={isReprocessDialogOpen}
          onClose={() => setIsReprocessDialogOpen(false)}
          onReprocessed={() => void refetch()}
          document={{
            id: document.id,
            title: document.title,
            versionNumber: document.versionNumber,
          }}
        />
      )}

      {/* Document Preview Modal */}
      {isPreviewOpen && (
        <KnowledgeDocumentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewVersionId(undefined);
          }}
          documentId={document.id}
          versionId={previewVersionId}
          fallbackTitle={document.title}
        />
      )}

      {/* Version Details Modal */}
      {selectedVersionForDetails && (
        <VersionDetailModal
          isOpen={Boolean(selectedVersionForDetails)}
          onClose={() => setSelectedVersionForDetails(null)}
          documentId={document.id}
          documentTitle={document.title}
          version={selectedVersionForDetails}
          isCurrent={
            selectedVersionForDetails.id === document.currentVersionId ||
            selectedVersionForDetails.versionNumber === document.versionNumber
          }
          isIndexedInRag={
            retrievalStatus?.indexedVersionId === selectedVersionForDetails.id ||
            retrievalStatus?.indexedVersionNumber === selectedVersionForDetails.versionNumber ||
            ((selectedVersionForDetails.id === document.currentVersionId ||
              selectedVersionForDetails.versionNumber === document.versionNumber) &&
              Boolean(retrievalStatus?.isReadyForRetrieval) &&
              !retrievalStatus?.hasVersionDiscrepancy)
          }
          retrievalStatus={retrievalStatus}
          onPreview={(ver) => {
            setPreviewVersionId(ver.id);
            setIsPreviewOpen(true);
          }}
          onDownload={(ver) => handleDownloadVersion(ver)}
          canManage={canManage}
          onRetry={(ver) => {
            setSelectedVersionForDetails(null);
            setRetryTargetVersionId(ver.id);
            setIsRetryDialogOpen(true);
          }}
        />
      )}

      {/* Version Comparison Modal */}
      {isCompareModalOpen && sortedVersions.length >= 2 && (
        <VersionComparisonModal
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
          documentId={document.id}
          documentTitle={document.title}
          versions={sortedVersions}
          currentVersionId={document.currentVersionId}
          onPreviewVersion={(verId) => {
            setPreviewVersionId(verId);
            setIsPreviewOpen(true);
          }}
          onDownloadVersion={(ver) => handleDownloadVersion(ver)}
        />
      )}

      {/* Upload New Version Modal */}
      {isUploadVersionModalOpen && (
        <DocumentUploadModal
          isOpen={isUploadVersionModalOpen}
          onClose={() => setIsUploadVersionModalOpen(false)}
          targetDocumentId={document.id}
          targetDocumentTitle={document.title}
          onSuccess={() => {
            void refetch();
          }}
        />
      )}

      {/* Document Ingestion Retry Confirmation Dialog */}
      {isRetryDialogOpen && document && (
        <DocumentRetryDialog
          isOpen={isRetryDialogOpen}
          onClose={() => {
            setIsRetryDialogOpen(false);
            setRetryTargetVersionId(undefined);
          }}
          document={{
            id: document.id,
            title: document.title,
            currentVersionNumber: document.versionNumber,
          }}
          job={activeJob}
          targetVersionId={retryTargetVersionId}
          onRetried={() => {
            void refetchIngestionHistory();
            void refetchRetrievalStatus();
          }}
        />
      )}
    </IntelligencePageContainer>
  );
};
