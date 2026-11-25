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

  if (!capabilities) {
    // If capabilities are still loading, advisory validation passes to allow backend authoritative checks
    return null;
  }

  if (file.size > capabilities.maxFileSizeBytes) {
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      code: 'FILE_TOO_LARGE',
      message: `El archivo (${fileMb} MB) supera el tamaño máximo permitido de ${capabilities.maxFileSizeMb} MB.`,
    };
  }

  const lastDotIndex = file.name.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? file.name.substring(lastDotIndex).toLowerCase() : '';

  const isAllowedExt = capabilities.allowedExtensions.some(
    (allowed) => allowed.toLowerCase() === extension,
  );

  if (!isAllowedExt) {
    return {
      code: 'UNSUPPORTED_EXTENSION',
      message: `La extensión '${extension || '(sin extensión)'}' no está permitida. Formatos admitidos: ${capabilities.allowedExtensions.join(', ')}.`,
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
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<UploadDocumentResponse | null>(null);

  const [formValues, setFormValues] = useState<DocumentUploadFormValues>({
    title: '',
    description: '',
    visibilityScope: 'ALL_STAFF',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

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

      if (
        status === 409 ||
        rawMessage.toLowerCase().includes('duplicate') ||
        rawMessage.toLowerCase().includes('checksum')
      ) {
        setErrorMessage(
          'Ya existe un documento registrado con el mismo contenido exacto (checksum duplicado). Puedes actualizar su versión o consultarlo en la biblioteca.',
        );
      } else if (status === 403) {
        setErrorMessage('No tienes permisos suficientes para subir documentos a la organización.');
      } else if (status === 413 || rawMessage.toLowerCase().includes('size')) {
        setErrorMessage('El archivo excede el tamaño máximo permitido por el servidor.');
      } else if (status === 400) {
        setErrorMessage(rawMessage || 'El formato o contenido del archivo no es válido.');
      } else {
        setErrorMessage(rawMessage || 'Error de red o comunicación al subir el documento.');
      }

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
