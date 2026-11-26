import React, { useRef, useState, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FolderOpen,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Select,
  Alert,
} from '@kinergy-platform/ui';
import { cn } from '../../../../shared/lib/utils';
import { useDocumentUpload } from '../hooks/use-document-upload';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type { UploadDocumentResponse, VisibilityScope } from '../types/knowledge-contract.types';

export interface DocumentUploadModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: (document: UploadDocumentResponse) => void;
  readonly targetDocumentId?: string;
  readonly targetDocumentTitle?: string;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  targetDocumentId,
  targetDocumentTitle,
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const titleInputId = useId();
  const descriptionInputId = useId();
  const scopeSelectId = useId();

  const isVersionMode = Boolean(targetDocumentId);

  const {
    lifecycleState,
    selectedFile,
    formValues,
    validationError,
    errorMessage,
    failureDetails,
    progress,
    uploadedDocument,
    capabilities,
    isUploading,
    canSubmit,
    actions,
  } = useDocumentUpload({
    targetDocumentId,
    onUploadSuccess: (doc) => {
      if (onSuccess) {
        onSuccess(doc);
      }
    },
  });

  const handleClose = useCallback(() => {
    if (isUploading) return;
    actions.reset();
    onClose();
  }, [isUploading, actions, onClose]);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isUploading) {
        setIsDragOver(true);
      }
    },
    [isUploading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isUploading) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0 && files[0]) {
        actions.selectFile(files[0]);
      }
    },
    [isUploading, actions],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      actions.selectFile(files[0]);
    }
  };

  const handleDropzoneClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isUploading) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || validationError) return;
    await actions.startUpload();
  };

  const handleNavigateToDetails = () => {
    if (!uploadedDocument) return;
    handleClose();
    navigate(`/intelligence/knowledge/documents/${uploadedDocument.documentId}`);
  };

  const handleNavigateToLibrary = () => {
    handleClose();
    navigate('/intelligence/knowledge?view=library');
  };

  const acceptString =
    capabilities?.allowedExtensions?.join(',') || '.pdf,.docx,.md,.markdown,.txt';
  const maxMb = capabilities?.maxFileSizeMb ?? 10;
  const progressPercentage = Math.min(
    progress?.percentage ?? (isUploading ? 5 : 0),
    isUploading ? 99 : 100,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        data-testid="document-upload-modal"
        aria-describedby="upload-dialog-description"
        hideCloseButton={isUploading}
        onPointerDownOutside={(e) => {
          if (isUploading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isUploading) e.preventDefault();
        }}
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
      >
        {/* ========================================================================= */}
        {/* STATE: UPLOAD_SUCCEEDED                                                   */}
        {/* ========================================================================= */}
        {lifecycleState === 'UPLOAD_SUCCEEDED' && uploadedDocument ? (
          <div data-testid="upload-success-view" className="flex flex-col gap-5 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {isVersionMode
                    ? `Versión v${uploadedDocument.versionNumber} subida correctamente`
                    : 'Documento subido correctamente'}
                </DialogTitle>
                <DialogDescription
                  id="upload-dialog-description"
                  className="text-xs text-muted-foreground"
                >
                  {isVersionMode
                    ? `La versión v${uploadedDocument.versionNumber} se ha registrado e indexado como la versión activa del documento.`
                    : 'El archivo se ha transferido y registrado en la base de conocimiento.'}
                </DialogDescription>
              </div>
            </div>

            {/* Document summary card */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4
                    data-testid="uploaded-document-title"
                    className="text-sm font-semibold text-foreground truncate"
                  >
                    {uploadedDocument.title}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {uploadedDocument.originalFileName}
                  </p>
                </div>
                <IngestionStatusBadge status={uploadedDocument.ingestionStatus} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                <div>
                  <span className="text-muted-foreground">Tamaño: </span>
                  <span className="font-medium text-foreground">
                    {formatBytes(uploadedDocument.fileSize)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Versión inicial: </span>
                  <span className="font-medium text-foreground">
                    v{uploadedDocument.versionNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Asynchronous vector indexing notice */}
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-300">
              <div className="flex items-start gap-2">
                <FolderOpen className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  <strong>Indexación asíncrona en curso:</strong> La extracción de texto y
                  generación de fragmentos vectoriales continuará en segundo plano. Podrás consultar
                  este documento en la biblioteca una vez completado el procesamiento.
                </p>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={actions.reset}
                data-testid="upload-another-button"
                className="text-xs"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Subir otro documento
              </Button>
              <Button
                variant="outline"
                onClick={handleNavigateToLibrary}
                data-testid="navigate-to-library-button"
                className="text-xs"
              >
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Ir a la biblioteca
              </Button>
              <Button
                variant="default"
                onClick={handleNavigateToDetails}
                data-testid="view-document-details-button"
                className="text-xs gap-1.5"
              >
                <span>Ver detalles</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ========================================================================= */
          /* FORM VIEW: IDLE, FILE_SELECTED, VALIDATING, READY, UPLOADING, ERROR       */
          /* ========================================================================= */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader className="gap-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {isVersionMode ? 'Subir nueva versión' : 'Subir nuevo documento'}
                </DialogTitle>
              </div>
              <DialogDescription
                id="upload-dialog-description"
                className="text-xs text-muted-foreground"
              >
                {isVersionMode
                  ? `Carga un archivo actualizado para generar una nueva versión inmutable de "${targetDocumentTitle || 'este documento'}". La versión previa se conservará en el historial y la nueva versión pasará a ser la versión activa para búsquedas y consultas RAG.`
                  : 'Sube un archivo técnico, clínico o normativo para indexarlo en la base de conocimiento de Kynergy Intelligence.'}
              </DialogDescription>
            </DialogHeader>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptString}
              onChange={handleFileInputChange}
              disabled={isUploading}
              className="sr-only"
              data-testid="document-file-input"
              aria-label="Seleccionar archivo"
            />

            {/* Dropzone or Selected File Preview */}
            {!selectedFile ? (
              <div
                role="button"
                tabIndex={0}
                data-testid="document-dropzone"
                aria-label="Área para arrastrar o seleccionar archivo"
                onClick={handleDropzoneClick}
                onKeyDown={handleDropzoneKeyDown}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isDragOver
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border/70 hover:border-primary/50 hover:bg-muted/40 bg-muted/20 text-muted-foreground',
                )}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                  <Upload className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Arrastra y suelta tu archivo aquí, o{' '}
                  <span className="text-primary underline underline-offset-2">
                    examina tu equipo
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Formatos autorizados:{' '}
                  <span className="font-mono font-medium">
                    {capabilities?.allowedExtensions?.join(', ') || '.pdf, .docx, .md, .txt'}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tamaño máximo permitido: <span className="font-medium">{maxMb} MB</span>
                </p>
              </div>
            ) : (
              <div
                data-testid="selected-file-card"
                className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-card shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p
                      data-testid="selected-file-name"
                      className="text-xs sm:text-sm font-medium text-foreground truncate"
                    >
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(selectedFile.size)} •{' '}
                      {selectedFile.type || 'Tipo de archivo detectado'}
                    </p>
                  </div>
                </div>

                {!isUploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={actions.removeFile}
                    data-testid="remove-file-button"
                    aria-label="Quitar archivo seleccionado"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* Validation Error Alert */}
            {validationError && (
              <Alert
                variant="destructive"
                data-testid="upload-validation-error"
                className="text-xs py-2.5"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <div className="ml-2 space-y-1.5 w-full">
                  <p className="font-semibold text-foreground">
                    {failureDetails?.category === 'FILE_TOO_LARGE'
                      ? 'Archivo demasiado grande'
                      : failureDetails?.category === 'EMPTY_FILE'
                        ? 'Archivo vacío'
                        : failureDetails?.category === 'UNSUPPORTED_FORMAT'
                          ? 'Formato no admitido'
                          : 'Validación de archivo fallida'}
                  </p>
                  <p className="font-medium text-foreground/90">{validationError.message}</p>
                  <div
                    data-testid="upload-backend-storage-status"
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-background/60 border border-border/40 text-foreground"
                  >
                    <span>
                      Estado en servidor: No almacenado (la operación no modificó la base de datos
                      ni el almacenamiento)
                    </span>
                  </div>
                </div>
              </Alert>
            )}

            {/* Form Fields: Title, Description, Visibility */}
            {selectedFile && !validationError && (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={titleInputId}
                    className="text-xs font-semibold text-foreground flex items-center justify-between"
                  >
                    <span>Título del documento *</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      Derivado automáticamente
                    </span>
                  </label>
                  <Input
                    id={titleInputId}
                    data-testid="upload-title-input"
                    value={formValues.title}
                    onChange={(e) => actions.setTitle(e.target.value)}
                    disabled={isUploading}
                    placeholder="Título del documento..."
                    className="h-9 text-xs"
                    required
                    aria-required="true"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={descriptionInputId}
                    className="text-xs font-semibold text-foreground"
                  >
                    Descripción (opcional)
                  </label>
                  <Textarea
                    id={descriptionInputId}
                    data-testid="upload-description-input"
                    value={formValues.description}
                    onChange={(e) => actions.setDescription(e.target.value)}
                    disabled={isUploading}
                    placeholder="Breve resumen del contenido para contextualización..."
                    className="text-xs min-h-[60px]"
                    rows={2}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={scopeSelectId} className="text-xs font-semibold text-foreground">
                    Alcance de visibilidad
                  </label>
                  <Select
                    id={scopeSelectId}
                    data-testid="upload-visibility-select"
                    value={formValues.visibilityScope}
                    onChange={(e) => actions.setVisibilityScope(e.target.value as VisibilityScope)}
                    disabled={isUploading}
                    className="h-9 text-xs"
                  >
                    <option value="ALL_STAFF">Toda la organización (General)</option>
                    <option value="CLINICAL_STAFF">Personal Clínico</option>
                    <option value="MANAGEMENT">Dirección / Gestión</option>
                  </Select>
                </div>
              </div>
            )}

            {/* Active Upload Progress Bar */}
            {isUploading && (
              <div
                data-testid="upload-progress-container"
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3.5"
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                    {progressPercentage < 99
                      ? 'Transfiriendo archivo cifrado...'
                      : 'Procesando y registrando documento...'}
                  </span>
                  <span data-testid="upload-progress-percentage" className="text-primary font-bold">
                    {progressPercentage}%
                  </span>
                </div>

                {/* Accessible Progress Bar */}
                <div
                  role="progressbar"
                  aria-valuenow={progressPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progreso de subida del documento"
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-all duration-200 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatBytes(progress?.loaded ?? 0)} de{' '}
                    {formatBytes(progress?.total ?? selectedFile?.size ?? 0)}
                  </span>
                  <span>No cierres esta ventana</span>
                </div>

                {/* Screen reader live region */}
                <div className="sr-only" aria-live="polite" role="status">
                  Subiendo documento {formValues.title}: {progressPercentage} por ciento completado.
                </div>
              </div>
            )}

            {/* Upload Error Banner (Server/Network/Storage failures) */}
            {errorMessage && !validationError && (
              <Alert
                variant="destructive"
                data-testid="upload-error-alert"
                className="text-xs py-3"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <div className="ml-2 space-y-1.5 w-full">
                  <p className="font-semibold text-foreground">
                    {failureDetails?.category === 'UNKNOWN_OUTCOME'
                      ? 'Resultado de subida no confirmado'
                      : failureDetails?.category === 'STORAGE_FAILURE'
                        ? 'Fallo en el servicio de almacenamiento'
                        : failureDetails?.category === 'NETWORK_INTERRUPTION'
                          ? 'Conexión de red interrumpida'
                          : failureDetails?.category === 'REQUEST_TIMEOUT'
                            ? 'Tiempo de espera agotado'
                            : failureDetails?.category === 'AUTH_EXPIRED'
                              ? 'Sesión de autenticación expirada'
                              : failureDetails?.category === 'PERMISSION_DENIED'
                                ? 'Permisos insuficientes'
                                : failureDetails?.category === 'DUPLICATE_UPLOAD'
                                  ? 'Documento duplicado'
                                  : failureDetails?.category === 'FILE_TOO_LARGE'
                                    ? 'Archivo demasiado grande'
                                    : failureDetails?.category === 'UNSUPPORTED_FORMAT'
                                      ? 'Formato no admitido'
                                      : 'Error en la subida'}
                  </p>
                  <p className="text-muted-foreground leading-relaxed">{errorMessage}</p>

                  {/* Authoritative backend storage confirmation status */}
                  <div
                    data-testid="upload-backend-storage-status"
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-background/60 border border-border/40 text-foreground"
                  >
                    <span>
                      {failureDetails?.backendConfirmedStored === 'UNKNOWN'
                        ? 'Estado en servidor: No confirmado (el servidor podría haber completado la creación; verifica antes de reintentar)'
                        : 'Estado en servidor: No almacenado (la operación no modificó la base de datos ni el almacenamiento)'}
                    </span>
                  </div>

                  {/* Transport restart explanation */}
                  <p
                    data-testid="upload-restart-explanation"
                    className="text-[11px] text-muted-foreground/90 italic"
                  >
                    Nota de transporte: Las subidas HTTP multiparte no admiten reanudación por
                    fragmentos. El reintento iniciará la transferencia desde el 0%, conservando el
                    archivo seleccionado y los metadatos.
                  </p>

                  {/* Safe reconciliation action when outcome is unknown */}
                  {failureDetails?.reconciliationSupported && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleNavigateToLibrary}
                        data-testid="upload-reconcile-button"
                        className="h-7 text-xs gap-1.5"
                      >
                        <FolderOpen className="h-3 w-3" />
                        <span>Verificar en biblioteca</span>
                      </Button>
                    </div>
                  )}
                </div>
              </Alert>
            )}

            {/* Upload Cancelled Banner */}
            {lifecycleState === 'CANCELLED' && (
              <div
                data-testid="upload-cancelled-banner"
                className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  La subida fue cancelada por el usuario. Puedes reintentar cuando desees.
                </span>
              </div>
            )}

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              {isUploading ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={actions.cancelUpload}
                    data-testid="cancel-upload-button"
                    className="text-xs"
                  >
                    Cancelar subida
                  </Button>
                  <Button type="button" disabled variant="default" className="text-xs gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Subiendo ({progressPercentage}%)</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    data-testid="close-upload-modal-button"
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    disabled={
                      !canSubmit ||
                      Boolean(validationError) ||
                      (failureDetails ? !failureDetails.canRetry : false)
                    }
                    data-testid="submit-upload-button"
                    className="text-xs gap-1.5"
                  >
                    {lifecycleState === 'UPLOAD_FAILED' ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Reintentar subida
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        {isVersionMode ? 'Subir nueva versión' : 'Subir documento'}
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
