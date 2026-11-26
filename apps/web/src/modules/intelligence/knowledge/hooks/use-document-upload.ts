import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RequestCanceledError } from '../../../../shared/api/api-error';
import type { UploadProgress } from '../../../../shared/api/http-client';
import { knowledgeApi } from '../api/knowledge.api';
import { knowledgeQueryKeys } from '../api/knowledge-query-keys';
import { useKnowledgeCapabilities } from './use-knowledge-queries';
import type {
  UploadDocumentResponse,
  VisibilityScope,
  KnowledgeCapabilitiesResponse,
} from '../types/knowledge-contract.types';

export type UploadLifecycleState =
  | 'IDLE'
  | 'FILE_SELECTED'
  | 'VALIDATING'
  | 'READY'
  | 'UPLOADING'
  | 'UPLOAD_SUCCEEDED'
  | 'UPLOAD_FAILED'
  | 'CANCELLED';

export type UploadFailureCategory =
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_CONTENT'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'DUPLICATE_UPLOAD'
  | 'STORAGE_FAILURE'
  | 'NETWORK_INTERRUPTION'
  | 'REQUEST_TIMEOUT'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN_OUTCOME'
  | 'GENERIC_ERROR';

export interface UploadFailureDetails {
  readonly category: UploadFailureCategory;
  readonly message: string;
  readonly backendConfirmedStored: boolean | 'UNKNOWN';
  readonly canRetry: boolean;
  readonly resumeSupported: boolean;
  readonly reconciliationSupported: boolean;
}

export interface FileValidationError {
  readonly code:
    'FILE_TOO_LARGE' | 'UNSUPPORTED_EXTENSION' | 'EMPTY_FILE' | 'INVALID_FILENAME' | 'NO_FILE';
  readonly message: string;
}

export interface DocumentUploadFormValues {
  readonly title: string;
  readonly description: string;
  readonly visibilityScope: VisibilityScope;
}

export interface UseDocumentUploadReturn {
  readonly lifecycleState: UploadLifecycleState;
  readonly selectedFile: File | null;
  readonly formValues: DocumentUploadFormValues;
  readonly validationError: FileValidationError | null;
  readonly errorMessage: string | null;
  readonly failureDetails: UploadFailureDetails | null;
  readonly progress: UploadProgress | null;
  readonly uploadedDocument: UploadDocumentResponse | null;
  readonly capabilities: KnowledgeCapabilitiesResponse | undefined;
  readonly isUploading: boolean;
  readonly canSubmit: boolean;
  readonly actions: {
    readonly selectFile: (file: File) => void;
    readonly removeFile: () => void;
    readonly setTitle: (title: string) => void;
    readonly setDescription: (description: string) => void;
    readonly setVisibilityScope: (scope: VisibilityScope) => void;
    readonly startUpload: () => Promise<UploadDocumentResponse | null>;
    readonly cancelUpload: () => void;
    readonly reset: () => void;
  };
}

function deriveCleanTitleFromFilename(fileName: string): string {
  const lastDotIdx = fileName.lastIndexOf('.');
  const base = lastDotIdx > 0 ? fileName.substring(0, lastDotIdx) : fileName;
  return base
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export const FALLBACK_KNOWLEDGE_CAPABILITIES: KnowledgeCapabilitiesResponse = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxFileSizeMb: 50,
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/json',
  ],
  allowedExtensions: ['.pdf', '.docx', '.md', '.markdown', '.txt', '.csv', '.json'],
  supportedVisibilityScopes: ['ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT'],
};

export function validateFileAgainstCapabilities(
  file: File | null,
  capabilities?: KnowledgeCapabilitiesResponse,
): FileValidationError | null {
  if (!file) {
    return { code: 'NO_FILE', message: 'No se ha seleccionado ningún archivo.' };
  }

  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      message: 'El archivo seleccionado está vacío (0 bytes).',
    };
  }

  if (!file.name || file.name.trim().length === 0) {
    return {
      code: 'INVALID_FILENAME',
      message: 'El nombre del archivo no es válido.',
    };
  }

  const activeCaps = capabilities || FALLBACK_KNOWLEDGE_CAPABILITIES;

  if (file.size > activeCaps.maxFileSizeBytes) {
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      code: 'FILE_TOO_LARGE',
      message: `El archivo (${fileMb} MB) supera el tamaño máximo permitido de ${activeCaps.maxFileSizeMb} MB.`,
    };
  }

  const lastDotIndex = file.name.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? file.name.substring(lastDotIndex).toLowerCase() : '';
  const normFileExt = (extension.startsWith('.') ? extension.slice(1) : extension).toLowerCase();

  const isAllowedExt = activeCaps.allowedExtensions.some((allowed) => {
    const normAllowed = (allowed.startsWith('.') ? allowed.slice(1) : allowed).toLowerCase();
    return normAllowed === normFileExt;
  });

  if (!isAllowedExt) {
    return {
      code: 'UNSUPPORTED_EXTENSION',
      message: `La extensión '${extension || '(sin extensión)'}' no está permitida. Formatos admitidos: ${activeCaps.allowedExtensions.join(', ')}.`,
    };
  }

  return null;
}

export function useDocumentUpload(options?: {
  readonly onUploadSuccess?: (result: UploadDocumentResponse) => void;
  readonly targetDocumentId?: string;
}): UseDocumentUploadReturn {
  const queryClient = useQueryClient();
  const { data: capabilities } = useKnowledgeCapabilities();

  const [lifecycleState, setLifecycleState] = useState<UploadLifecycleState>('IDLE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<FileValidationError | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failureDetails, setFailureDetails] = useState<UploadFailureDetails | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<UploadDocumentResponse | null>(null);

  const [formValues, setFormValues] = useState<DocumentUploadFormValues>({
    title: '',
    description: '',
    visibilityScope: 'ALL_STAFF',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const lastProgressPercentageRef = useRef<number>(0);

  // Clean up active abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const selectFile = useCallback(
    (file: File) => {
      setErrorMessage(null);
      setFailureDetails(null);
      setUploadedDocument(null);
      setProgress(null);
      setLifecycleState('VALIDATING');

      const error = validateFileAgainstCapabilities(file, capabilities);
      setSelectedFile(file);
      setValidationError(error);

      // Auto-populate title if user hasn't explicitly entered one yet
      setFormValues((prev) => ({
        ...prev,
        title:
          prev.title.trim().length === 0 ? deriveCleanTitleFromFilename(file.name) : prev.title,
      }));

      if (error) {
        setLifecycleState('UPLOAD_FAILED');
        setErrorMessage(error.message);
        const cat: UploadFailureCategory =
          error.code === 'FILE_TOO_LARGE'
            ? 'FILE_TOO_LARGE'
            : error.code === 'EMPTY_FILE'
              ? 'EMPTY_FILE'
              : error.code === 'UNSUPPORTED_EXTENSION'
                ? 'UNSUPPORTED_FORMAT'
                : 'INVALID_CONTENT';

        setFailureDetails({
          category: cat,
          message: error.message,
          backendConfirmedStored: false,
          canRetry: false,
          resumeSupported: false,
          reconciliationSupported: false,
        });
      } else {
        setLifecycleState('READY');
      }
    },
    [capabilities],
  );

  const removeFile = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    setSelectedFile(null);
    setValidationError(null);
    setErrorMessage(null);
    setFailureDetails(null);
    setProgress(null);
    setUploadedDocument(null);
    setLifecycleState('IDLE');
  }, []);

  const setTitle = useCallback((title: string) => {
    setFormValues((prev) => ({ ...prev, title }));
  }, []);

  const setDescription = useCallback((description: string) => {
    setFormValues((prev) => ({ ...prev, description }));
  }, []);

  const setVisibilityScope = useCallback((visibilityScope: VisibilityScope) => {
    setFormValues((prev) => ({ ...prev, visibilityScope }));
  }, []);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    setLifecycleState('CANCELLED');
    setErrorMessage('La subida fue cancelada por el usuario.');
    setFailureDetails(null);
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    setSelectedFile(null);
    setValidationError(null);
    setErrorMessage(null);
    setFailureDetails(null);
    setProgress(null);
    setUploadedDocument(null);
    setFormValues({
      title: '',
      description: '',
      visibilityScope: 'ALL_STAFF',
    });
    setLifecycleState('IDLE');
  }, []);

  const startUpload = useCallback(async (): Promise<UploadDocumentResponse | null> => {
    if (!selectedFile) {
      setValidationError({ code: 'NO_FILE', message: 'No se ha seleccionado ningún archivo.' });
      setLifecycleState('UPLOAD_FAILED');
      return null;
    }

    // Verify validation
    const clientError = validateFileAgainstCapabilities(selectedFile, capabilities);
    if (clientError) {
      setValidationError(clientError);
      setLifecycleState('UPLOAD_FAILED');
      return null;
    }

    // Prevent rapid repeated submissions
    if (isSubmittingRef.current) {
      return null;
    }
    isSubmittingRef.current = true;

    // Reset error state & initialize abort controller
    setErrorMessage(null);
    setLifecycleState('UPLOADING');
    setProgress({
      loaded: 0,
      total: selectedFile.size,
      percentage: 0,
      lengthComputable: true,
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastProgressPercentageRef.current = 0;

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (formValues.title.trim().length > 0) {
      formData.append('title', formValues.title.trim());
    }
    if (formValues.description.trim().length > 0) {
      formData.append('description', formValues.description.trim());
    }
    formData.append('visibilityScope', formValues.visibilityScope);

    try {
      const uploadFn = options?.targetDocumentId
        ? (fd: FormData, opt: Parameters<typeof knowledgeApi.uploadVersion>[2]) =>
            knowledgeApi.uploadVersion(options.targetDocumentId!, fd, opt)
        : (fd: FormData, opt: Parameters<typeof knowledgeApi.uploadDocument>[1]) =>
            knowledgeApi.uploadDocument(fd, opt);

      const response = await uploadFn(formData, {
        signal: abortController.signal,
        onProgress: (p) => {
          lastProgressPercentageRef.current = p.percentage;
          // Defensive progress capping: network wire transfer must never display 100%
          // until backend confirms 201 Created and server-side processing/indexing starts
          const cappedPercentage = Math.min(Math.max(0, p.percentage), 99);
          setProgress({
            ...p,
            percentage: cappedPercentage,
          });
        },
      });

      // Successful upload
      setUploadedDocument(response);
      setLifecycleState('UPLOAD_SUCCEEDED');
      isSubmittingRef.current = false;
      abortControllerRef.current = null;

      // Invalidate query caches to reflect real document counts & items
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });

      options?.onUploadSuccess?.(response);
      return response;
    } catch (err: unknown) {
      isSubmittingRef.current = false;
      abortControllerRef.current = null;

      if (
        err instanceof RequestCanceledError ||
        (err &&
          typeof err === 'object' &&
          (err as { name?: string }).name === 'RequestCanceledError') ||
        abortController.signal.aborted
      ) {
        setLifecycleState('CANCELLED');
        setErrorMessage('La subida fue cancelada.');
        return null;
      }

      setLifecycleState('UPLOAD_FAILED');

      // Map known error statuses to user-friendly guidance
      const status =
        (err as { status?: number; statusCode?: number })?.statusCode ||
        (err as { status?: number })?.status;
      const rawMessage = (err as Error)?.message || '';
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      let category: UploadFailureCategory = 'GENERIC_ERROR';
      let message = rawMessage || 'Error inesperado durante la subida.';
      let backendConfirmedStored: boolean | 'UNKNOWN' = false;
      let canRetry = true;
      let reconciliationSupported = false;

      const reachedFinalWireTransfer = lastProgressPercentageRef.current >= 95;

      if (status === 401) {
        category = 'AUTH_EXPIRED';
        message =
          'Tu sesión ha expirado o no es válida. Inicia sesión nuevamente para completar la subida.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (status === 403) {
        category = 'PERMISSION_DENIED';
        message =
          'No tienes permisos suficientes para subir o versionar documentos en esta organización.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (
        status === 409 ||
        rawMessage.toLowerCase().includes('duplicate') ||
        rawMessage.toLowerCase().includes('checksum')
      ) {
        category = 'DUPLICATE_UPLOAD';
        message =
          'Ya existe un documento registrado con el mismo contenido exacto (checksum duplicado). Puedes actualizar su versión o consultarlo en la biblioteca.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (
        status === 413 ||
        rawMessage.toLowerCase().includes('size') ||
        rawMessage.toLowerCase().includes('demasiado grande')
      ) {
        category = 'FILE_TOO_LARGE';
        message = 'El archivo supera el tamaño máximo permitido por el servidor.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (
        status === 415 ||
        rawMessage.toLowerCase().includes('unsupported') ||
        rawMessage.toLowerCase().includes('extensión no permitida')
      ) {
        category = 'UNSUPPORTED_FORMAT';
        message = rawMessage || 'El formato del archivo no es admitido por el sistema.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (
        status === 400 &&
        (rawMessage.toLowerCase().includes('empty') ||
          rawMessage.toLowerCase().includes('vacío') ||
          rawMessage.toLowerCase().includes('0 bytes'))
      ) {
        category = 'EMPTY_FILE';
        message = 'El archivo seleccionado está vacío (0 bytes) y fue rechazado por el servidor.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (status === 400) {
        category = 'INVALID_CONTENT';
        message = rawMessage || 'El contenido del archivo no es válido o está corrupto.';
        backendConfirmedStored = false;
        canRetry = false;
      } else if (
        reachedFinalWireTransfer &&
        (status === 504 ||
          status === 408 ||
          rawMessage.toLowerCase().includes('timeout') ||
          rawMessage.toLowerCase().includes('network') ||
          rawMessage.toLowerCase().includes('connection') ||
          isOffline ||
          status === 0)
      ) {
        category = 'UNKNOWN_OUTCOME';
        message =
          'La transferencia finalizó pero no se recibió confirmación del servidor. El documento podría haberse registrado exitosamente. Te recomendamos verificar en la biblioteca antes de reintentar para evitar duplicados.';
        backendConfirmedStored = 'UNKNOWN';
        canRetry = false;
        reconciliationSupported = true;
      } else if (status === 504 || status === 408 || rawMessage.toLowerCase().includes('timeout')) {
        category = 'REQUEST_TIMEOUT';
        message =
          'Tiempo de espera agotado al comunicar con el servidor de subida. El archivo no fue procesado.';
        backendConfirmedStored = false;
        canRetry = true;
      } else if (
        isOffline ||
        status === 0 ||
        rawMessage.toLowerCase().includes('network') ||
        rawMessage.toLowerCase().includes('connection') ||
        rawMessage.toLowerCase().includes('failed to fetch')
      ) {
        category = 'NETWORK_INTERRUPTION';
        message =
          'La conexión de red se interrumpió antes de completar la transferencia. El documento no fue guardado en el servidor.';
        backendConfirmedStored = false;
        canRetry = true;
      } else if (status === 500 || status === 502 || status === 503 || status === 507) {
        category = 'STORAGE_FAILURE';
        message =
          'Fallo en el servicio de almacenamiento institucional. El archivo no fue guardado en el servidor.';
        backendConfirmedStored = false;
        canRetry = true;
      }

      setErrorMessage(message);
      setFailureDetails({
        category,
        message,
        backendConfirmedStored,
        canRetry,
        resumeSupported: false,
        reconciliationSupported,
      });

      return null;
    }
  }, [selectedFile, formValues, capabilities, queryClient, options]);

  const isUploading = lifecycleState === 'UPLOADING';
  const canSubmit =
    Boolean(selectedFile) &&
    !validationError &&
    (lifecycleState === 'READY' ||
      lifecycleState === 'UPLOAD_FAILED' ||
      lifecycleState === 'CANCELLED');

  return {
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
    actions: {
      selectFile,
      removeFile,
      setTitle,
      setDescription,
      setVisibilityScope,
      startUpload,
      cancelUpload,
      reset,
    },
  };
}
