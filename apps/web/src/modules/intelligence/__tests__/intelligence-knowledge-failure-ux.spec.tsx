import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { UploadOptions } from '../../../shared/api/http-client';
import { knowledgeApi } from '../knowledge/api/knowledge.api';
import { DocumentUploadModal } from '../knowledge/components/document-upload-modal';
import { KnowledgeDocumentPreviewModal } from '../knowledge/components/knowledge-document-preview-modal';
import { IngestionLifecycleTimeline } from '../knowledge/components/ingestion-lifecycle-timeline';
import { KnowledgeDocumentTable } from '../knowledge/components/knowledge-document-table';
import { RecentDocumentsList } from '../knowledge/components/recent-documents-list';
import type {
  KnowledgeCapabilitiesResponse,
  DocumentPreviewMetadataResponse,
  IngestionJobItem,
  IngestionRetrievalStatus,
  UploadDocumentResponse,
} from '../knowledge/types/knowledge-contract.types';

// Mock knowledgeApi methods
jest.mock('../knowledge/api/knowledge.api', () => ({
  knowledgeApi: {
    getCapabilities: jest.fn(),
    listDocuments: jest.fn(),
    getDocument: jest.fn(),
    updateMetadata: jest.fn(),
    deleteDocument: jest.fn(),
    getIngestionHistory: jest.fn(),
    retryIngestion: jest.fn(),
    cancelIngestion: jest.fn(),
    uploadDocument: jest.fn(),
    uploadVersion: jest.fn(),
    downloadDocument: jest.fn(),
    getPreviewMetadata: jest.fn(),
    getDocumentContentBlob: jest.fn(),
    getRetrievalStatus: jest.fn(),
  },
  triggerDocumentDownload: jest.fn(),
}));

const mockedApi = jest.mocked(knowledgeApi);

// Polyfills for JSDOM
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;

beforeAll(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-blob-url');
  window.URL.revokeObjectURL = jest.fn();

  Blob.prototype.text = function () {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
});

afterAll(() => {
  window.URL.createObjectURL = originalCreateObjectURL;
  window.URL.revokeObjectURL = originalRevokeObjectURL;
});

const ADMIN_USER: AuthUser = {
  id: 'usr_admin_kc',
  email: 'admin@kinergy.io',
  name: 'Admin KC',
  roles: ['ADMIN'],
  permissions: ['admin:all'],
  tenantId: 'tenant_alpha',
};

const defaultCapabilities: KnowledgeCapabilitiesResponse = {
  maxFileSizeBytes: 52428800, // 50 MB
  maxFileSizeMb: 50,
  allowedMimeTypes: [
    'application/pdf',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  allowedExtensions: ['pdf', 'md', 'txt', 'csv', 'json', 'docx'],
  supportedVisibilityScopes: ['ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT'],
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, user: AuthUser | null = ADMIN_USER) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user ?? undefined}>
        <NotificationProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ER.07 — Knowledge Center & Ingestion Failure UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getCapabilities.mockResolvedValue(defaultCapabilities);
  });

  /* ========================================================================= */
  /* 1. UPLOAD FAILURES & RESILIENCE                                           */
  /* ========================================================================= */
  describe('Upload Failures & Storage Integrity', () => {
    it('rejects oversized file client-side, displaying FILE_TOO_LARGE and No almacenado status', async () => {
      const onClose = jest.fn();
      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('document-file-input')).toBeInTheDocument();
      });

      // Create a 60MB file
      const oversizedFile = new File(['x'.repeat(100)], 'huge-manual.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(oversizedFile, 'size', { value: 60 * 1024 * 1024 });

      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [oversizedFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('upload-validation-error')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/Archivo demasiado grande/i)[0]).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      // Backend upload was never triggered
      expect(mockedApi.uploadDocument).not.toHaveBeenCalled();
    });

    it('rejects empty (0 byte) file client-side with No almacenado status', async () => {
      const onClose = jest.fn();
      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('document-file-input')).toBeInTheDocument();
      });

      const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
      Object.defineProperty(emptyFile, 'size', { value: 0 });

      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [emptyFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('upload-validation-error')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/archivo seleccionado está vacío/i)[0]).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      expect(mockedApi.uploadDocument).not.toHaveBeenCalled();
    });

    it('rejects unsupported file format client-side with UNSUPPORTED_FORMAT category', async () => {
      const onClose = jest.fn();
      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('document-file-input')).toBeInTheDocument();
      });

      const invalidFile = new File(['content'], 'malicious.exe', {
        type: 'application/x-msdownload',
      });

      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('upload-validation-error')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/Formato no admitido/i)[0]).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      expect(mockedApi.uploadDocument).not.toHaveBeenCalled();
    });

    it('handles backend 409 duplicate upload conflict explaining duplicate checksum', async () => {
      const error409 = new Error(
        'El archivo con suma de comprobación sha256:abcd ya existe en la biblioteca.',
      );
      (error409 as unknown as { statusCode: number }).statusCode = 409;
      mockedApi.uploadDocument.mockRejectedValueOnce(error409);

      const onClose = jest.fn();
      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={onClose} />);

      const file = new File(['valid content'], 'protocolo-kine.pdf', { type: 'application/pdf' });
      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('submit-upload-button')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Documento duplicado/i)).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
    });

    it('handles backend 403 Forbidden with No almacenado status and disabled retry', async () => {
      const error403 = new Error('No tienes permisos para subir documentos.');
      (error403 as unknown as { statusCode: number }).statusCode = 403;
      mockedApi.uploadDocument.mockRejectedValueOnce(error403);

      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={jest.fn()} />);

      const file = new File(['valid'], 'protocolo.pdf', { type: 'application/pdf' });
      fireEvent.change(screen.getByTestId('document-file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('submit-upload-button')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Permisos insuficientes/i)).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      // Gated retry button
      expect(screen.getByTestId('submit-upload-button')).toBeDisabled();
    });

    it('handles storage failure (500/507) preserving form values and explaining retry', async () => {
      const error500 = new Error('Error interno del servicio de almacenamiento S3.');
      (error500 as unknown as { statusCode: number }).statusCode = 500;
      mockedApi.uploadDocument.mockRejectedValueOnce(error500);

      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={jest.fn()} />);

      const file = new File(['valid content'], 'procedimiento.pdf', { type: 'application/pdf' });
      fireEvent.change(screen.getByTestId('document-file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('submit-upload-button')).not.toBeDisabled();
      });

      // Type title
      const titleInput = screen.getByTestId('upload-title-input');
      fireEvent.change(titleInput, { target: { value: 'Procedimiento de Ergonomía' } });

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-error-alert')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/Fallo en el servicio de almacenamiento/i)[0]).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      // Title and file preserved
      expect(screen.getByTestId('upload-title-input')).toHaveValue('Procedimiento de Ergonomía');
      // Transport restart note is displayed
      expect(screen.getByTestId('upload-restart-explanation')).toBeInTheDocument();
    });

    it('handles network interruption with restart explanation and preserved form', async () => {
      const netError = new Error('Network error: connection reset by peer');
      mockedApi.uploadDocument.mockRejectedValueOnce(netError);

      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={jest.fn()} />);

      const file = new File(['content'], 'guia.pdf', { type: 'application/pdf' });
      fireEvent.change(screen.getByTestId('document-file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('submit-upload-button')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Conexión de red interrumpida/i)).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /No almacenado/i,
      );
      expect(screen.getByTestId('upload-restart-explanation')).toHaveTextContent(
        /Las subidas HTTP multiparte no admiten reanudación por fragmentos/i,
      );
    });

    it('handles late network drop (>=95%) by flagging UNKNOWN_OUTCOME, No confirmado status, disabling blind retry, and offering reconciliation', async () => {
      // Simulate an error that occurred after wire transfer completed (progress 100%)
      mockedApi.uploadDocument.mockImplementationOnce(
        (_formData: FormData, options?: UploadOptions) =>
          new Promise<UploadDocumentResponse>((_, reject) => {
            if (options?.onProgress) {
              options.onProgress({
                loaded: 1000,
                total: 1000,
                percentage: 100,
                lengthComputable: true,
              });
            }
            setTimeout(() => {
              const err = new Error('Timeout awaiting backend 201 response');
              (err as unknown as { statusCode: number }).statusCode = 504;
              reject(err);
            }, 10);
          }),
      );

      renderWithProviders(<DocumentUploadModal isOpen={true} onClose={jest.fn()} />);

      const file = new File(['content'], 'guia-critica.pdf', { type: 'application/pdf' });
      fireEvent.change(screen.getByTestId('document-file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('submit-upload-button')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Resultado de subida no confirmado/i)).toBeInTheDocument();
      expect(screen.getByTestId('upload-backend-storage-status')).toHaveTextContent(
        /Estado en servidor: No confirmado/i,
      );
      // Safe reconciliation button rendered
      expect(screen.getByTestId('upload-reconcile-button')).toBeInTheDocument();
      // Retry button is disabled to prevent duplicate creation
      expect(screen.getByTestId('submit-upload-button')).toBeDisabled();
    });
  });

  /* ========================================================================= */
  /* 2. INGESTION MONITORING FAILURE UX                                        */
  /* ========================================================================= */
  describe('Ingestion Monitoring Failures & Recovery UX', () => {
    it('renders ingestion-lifecycle-error on query fetch failure without marking job as failed', () => {
      const activeJob: IngestionJobItem = {
        id: 'job_1',
        documentId: 'doc_1',
        documentVersionId: 'ver_1',
        status: 'PROCESSING',
        currentStage: 'INDEXING',
        attemptCount: 1,
        maxAttempts: 3,
        canRetry: false,
        createdAt: '2026-11-26T10:00:00Z',
      };

      const queryError = new Error('503 Service Unavailable');

      renderWithProviders(
        <IngestionLifecycleTimeline
          documentId="doc_1"
          job={activeJob}
          error={queryError}
          onRefresh={jest.fn()}
        />,
      );

      // Renders query error banner
      expect(screen.getByTestId('ingestion-lifecycle-error')).toBeInTheDocument();
      expect(screen.getByText(/503 Service Unavailable/i)).toBeInTheDocument();
      // Job was NOT converted to FAILED banner
      expect(screen.queryByTestId('ingestion-failure-banner')).not.toBeInTheDocument();
    });

    it('renders authoritative ingestion failure banner with stage, code, safe explanation, and retry eligibility', () => {
      const failedJob: IngestionJobItem = {
        id: 'job_failed_1',
        documentId: 'doc_1',
        documentVersionId: 'ver_1',
        status: 'FAILED',
        currentStage: 'INDEXING',
        attemptCount: 2,
        maxAttempts: 3,
        canRetry: true,
        lastErrorCode: 'VECTOR_STORE_TIMEOUT',
        lastErrorMessage: 'Conexión con el índice vectorial agotó el tiempo de espera',
        failureInfo: {
          category: 'INDEXING',
          code: 'VECTOR_STORE_TIMEOUT',
          message: 'Conexión con el índice vectorial agotó el tiempo de espera',
          failedStage: 'INDEXING',
          isTransient: true,
        },
        createdAt: '2026-11-26T10:00:00Z',
      };

      const retrievalStatus: IngestionRetrievalStatus = {
        isReadyForRetrieval: false,
        reason: 'El documento no ha completado la generación de embeddings.',
      };

      renderWithProviders(
        <IngestionLifecycleTimeline
          documentId="doc_1"
          job={failedJob}
          retrievalStatus={retrievalStatus}
          canManage={true}
          onRetry={jest.fn()}
        />,
      );

      expect(screen.getByTestId('ingestion-failure-box')).toBeInTheDocument();
      expect(screen.getByTestId('ingestion-failure-message')).toHaveTextContent(
        /Conexión con el índice vectorial agotó el tiempo de espera/,
      );
      // Retry button is available for admin
      expect(screen.getByTestId('lifecycle-retry-button')).toBeInTheDocument();
      expect(screen.getByTestId('lifecycle-attempts')).toHaveTextContent(/2 \/ 3/);
    });

    it('indicates retry in progress when retrying an ingestion job without prematurely claiming success', () => {
      const failedJob: IngestionJobItem = {
        id: 'job_failed_1',
        documentId: 'doc_1',
        documentVersionId: 'ver_1',
        status: 'FAILED',
        currentStage: 'INDEXING',
        attemptCount: 1,
        maxAttempts: 3,
        canRetry: true,
        createdAt: '2026-11-26T10:00:00Z',
      };

      renderWithProviders(
        <IngestionLifecycleTimeline
          documentId="doc_1"
          job={failedJob}
          canManage={true}
          isRetryPending={true}
          onRetry={jest.fn()}
        />,
      );

      // Retry button shows pending/disabled state
      const retryBtn = screen.getByTestId('lifecycle-retry-button');
      expect(retryBtn).toBeDisabled();
    });
  });

  /* ========================================================================= */
  /* 3. DOCUMENT PREVIEW FAILURES                                              */
  /* ========================================================================= */
  describe('Document Preview Failure Taxonomy', () => {
    const basePreviewMeta: DocumentPreviewMetadataResponse = {
      documentId: 'doc_test_1',
      versionId: 'ver_test_1',
      versionNumber: 1,
      title: 'Documento Clínico de Prueba',
      mimeType: 'application/pdf',
      fileSize: 1024,
      originalFileName: 'documento.pdf',
      checksum: 'sha256-abc',
      canPreview: true,
      visibilityScope: 'CLINICAL_STAFF',
      isAuthorized: true,
      isDeleted: false,
    };

    it('renders preview-archived-state when document is archived', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...basePreviewMeta,
        status: 'ARCHIVED',
        isArchived: true,
      });

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-archived-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Documento archivado/i)).toBeInTheDocument();
      // Download button is not present for archived document
      expect(screen.queryByTestId('preview-download-button')).not.toBeInTheDocument();
    });

    it('renders preview-missing-version-state when requested historical version returns 404', async () => {
      const notFoundError = new Error('Version v3 not found');
      (notFoundError as unknown as { statusCode: number }).statusCode = 404;
      mockedApi.getPreviewMetadata.mockRejectedValueOnce(notFoundError);

      renderWithProviders(
        <KnowledgeDocumentPreviewModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc_test_1"
          versionId="ver_historical_99"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-missing-version-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Versión histórica no disponible/i)).toBeInTheDocument();
    });

    it('renders preview-deleted-state when document is 404 and no versionId is specified', async () => {
      const notFoundError = new Error('Document deleted');
      (notFoundError as unknown as { statusCode: number }).statusCode = 404;
      mockedApi.getPreviewMetadata.mockRejectedValueOnce(notFoundError);

      renderWithProviders(
        <KnowledgeDocumentPreviewModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc_deleted_1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-deleted-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Documento eliminado o no encontrado/i)).toBeInTheDocument();
    });

    it('renders preview-forbidden-state when access is denied (403)', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...basePreviewMeta,
        isAuthorized: false,
      });

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-forbidden-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Acceso no autorizado/i)).toBeInTheDocument();
      expect(screen.queryByTestId('preview-download-button')).not.toBeInTheDocument();
    });

    it('renders preview-expired-state when temporary access token has expired (410)', async () => {
      const expiredError = new Error('Presigned access link has expired');
      (expiredError as unknown as { statusCode: number }).statusCode = 410;
      mockedApi.getPreviewMetadata.mockRejectedValueOnce(expiredError);

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-expired-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Enlace de previsualización expirado/i)).toBeInTheDocument();
    });

    it('renders preview-service-unavailable-state when storage backend returns 503 or 507', async () => {
      const error503 = new Error(
        'El servicio de almacenamiento seguro está temporalmente no disponible',
      );
      (error503 as unknown as { statusCode: number }).statusCode = 503;
      mockedApi.getPreviewMetadata.mockRejectedValueOnce(error503);

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-service-unavailable-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Servicio o almacenamiento no disponible/i)).toBeInTheDocument();
    });

    it('renders preview-unsupported-format-state for Word DOCX with safe download option', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...basePreviewMeta,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        canPreview: false,
      });

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-unsupported-format-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Previsualización en navegador no compatible/i)).toBeInTheDocument();
      expect(screen.getByTestId('unsupported-format-download-button')).toBeInTheDocument();
    });

    it('strips internal storage paths and tokens from generic preview error messages', async () => {
      const sensitiveError = new Error(
        'Fallo de lectura en C:\\var\\data\\storage\\s3://bucket-raw/doc_preview.pdf con token bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
      );
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(basePreviewMeta);
      mockedApi.getDocumentContentBlob.mockRejectedValueOnce(sensitiveError);

      renderWithProviders(
        <KnowledgeDocumentPreviewModal isOpen={true} onClose={jest.fn()} documentId="doc_test_1" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-error-state')).toBeInTheDocument();
      });

      const errorText = screen.getByTestId('preview-error-state').textContent || '';
      // Ensure raw paths and long tokens were stripped
      expect(errorText).not.toContain('C:\\var\\data\\storage');
      expect(errorText).not.toContain('s3://bucket-raw');
      expect(errorText).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  /* ========================================================================= */
  /* 4. KNOWLEDGE CENTER EMPTY VS ERROR STATES                                 */
  /* ========================================================================= */
  describe('Empty vs Error States in Knowledge Center', () => {
    it('KnowledgeDocumentTable renders DataTableError on fetch failure and never presents it as empty collection', () => {
      renderWithProviders(
        <KnowledgeDocumentTable
          documents={[]}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'title', desc: false }}
          onToggleSort={jest.fn()}
          isError={true}
          errorMessage="Error al cargar la biblioteca de documentos."
          onRetry={jest.fn()}
        />,
      );

      // Error state rendered
      expect(screen.getByText(/Error al cargar la biblioteca de documentos/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry|reintentar/i })).toBeInTheDocument();
      // Empty state MUST NOT be rendered
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByText(/No hay documentos en la biblioteca/i)).not.toBeInTheDocument();
    });

    it('KnowledgeDocumentTable renders empty state with upload action when collection is truly empty', () => {
      const onUploadClick = jest.fn();
      renderWithProviders(
        <KnowledgeDocumentTable
          documents={[]}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'title', desc: false }}
          onToggleSort={jest.fn()}
          isError={false}
          isFiltered={false}
          onUploadClick={onUploadClick}
        />,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/No hay documentos en la biblioteca/i)).toBeInTheDocument();
      expect(screen.getByTestId('empty-library-upload-button')).toBeInTheDocument();
    });

    it('KnowledgeDocumentTable renders filtered empty state with reset button when search has no matches', () => {
      const onResetFilters = jest.fn();
      renderWithProviders(
        <KnowledgeDocumentTable
          documents={[]}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'title', desc: false }}
          onToggleSort={jest.fn()}
          isError={false}
          isFiltered={true}
          searchTerm="término-inexistente"
          onResetFilters={onResetFilters}
        />,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/No se encontraron documentos/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /reset filters|limpiar filtros/i }),
      ).toBeInTheDocument();
    });

    it('RecentDocumentsList renders error state on failure, distinct from empty list', () => {
      renderWithProviders(
        <RecentDocumentsList documents={[]} isError={true} onRetry={jest.fn()} />,
      );

      expect(screen.getByTestId('recent-documents-error')).toBeInTheDocument();
      expect(screen.queryByTestId('recent-documents-empty')).not.toBeInTheDocument();
    });
  });
});
