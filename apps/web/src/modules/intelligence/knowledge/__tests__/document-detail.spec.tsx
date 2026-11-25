import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi, triggerDocumentDownload } from '../api/knowledge.api';
import { knowledgeQueryKeys } from '../api/knowledge-query-keys';
import { DocumentDetailPage } from '../routes/document-detail-page';
import type { KnowledgeDocumentItem, IngestionJobItem } from '../types/knowledge-contract.types';

// Mock knowledgeApi methods
jest.mock('../api/knowledge.api', () => ({
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
  },
  triggerDocumentDownload: jest.fn(),
}));

const mockedApi = knowledgeApi as jest.Mocked<typeof knowledgeApi>;
const mockedDownload = triggerDocumentDownload as jest.MockedFunction<
  typeof triggerDocumentDownload
>;

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['ADMIN'],
  permissions: ['admin:all'],
  tenantId: 'tenant_alpha',
};

const OPERATOR_USER: AuthUser = {
  id: 'usr_op_1',
  email: 'operator@kinergy.io',
  name: 'Operator User',
  roles: ['OPERATOR'],
  permissions: ['read:all'],
  tenantId: 'tenant_alpha',
};

const mockDocument: KnowledgeDocumentItem = {
  id: 'doc_123',
  title: 'Guía de Rehabilitación Cervical 2026',
  description: 'Protocolos de tratamiento para patologías de la columna cervical.',
  visibilityScope: 'CLINICAL_STAFF',
  currentVersionId: 'ver_2',
  uploadedBy: 'dr_martinez',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-25T12:00:00.000Z',
  originalFileName: 'guia_cervical_2026.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 2097152, // 2 MB
  checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  versionNumber: 2,
  versionCount: 2,
  storageReference: 'doc-storage:doc_123:ver_2',
  ingestionStatus: 'READY',
  status: 'ACTIVE',
  isDeleted: false,
  deletedAt: null,
  versions: [
    {
      id: 'ver_2',
      versionNumber: 2,
      originalFileName: 'guia_cervical_2026.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 2097152,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      language: 'es',
      uploadedBy: 'dr_martinez',
      storageReference: 'doc-storage:ver_2',
      ingestionStatus: 'READY',
      createdAt: '2026-11-25T12:00:00.000Z',
    },
    {
      id: 'ver_1',
      versionNumber: 1,
      originalFileName: 'guia_cervical_v1.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 1572864,
      checksum: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      language: 'es',
      uploadedBy: 'dr_martinez',
      storageReference: 'doc-storage:ver_1',
      ingestionStatus: 'READY',
      createdAt: '2026-11-20T10:00:00.000Z',
    },
  ],
};

const mockIngestionJobs: IngestionJobItem[] = [
  {
    id: 'job_002',
    documentId: 'doc_123',
    documentVersionId: 'ver_2',
    status: 'READY',
    attemptCount: 1,
    maxAttempts: 3,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-11-25T12:00:00.000Z',
    completedAt: '2026-11-25T12:02:00.000Z',
  },
  {
    id: 'job_001',
    documentId: 'doc_123',
    documentVersionId: 'ver_1',
    status: 'READY',
    attemptCount: 1,
    maxAttempts: 3,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    completedAt: '2026-11-20T10:01:30.000Z',
  },
];

interface RenderOptions {
  readonly queryClient?: QueryClient;
  readonly documentId?: string;
  readonly user?: AuthUser;
}

function renderDetailPage(options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const documentId = options.documentId ?? 'doc_123';
  const user = options.user ?? ADMIN_USER;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user}>
        <NotificationProvider>
          <MemoryRouter initialEntries={[`/intelligence/knowledge/documents/${documentId}`]}>
            <Routes>
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<DocumentDetailPage />}
              />
              <Route
                path="/intelligence/knowledge"
                element={<div data-testid="knowledge-library-stub">Library Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

describe('KC.06 — Document Details & Metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getDocument.mockResolvedValue(mockDocument);
    mockedApi.getIngestionHistory.mockResolvedValue(mockIngestionJobs);
  });

  describe('1. Details Retrieval & Metadata Presentation', () => {
    it('fetches and renders full document metadata accurately', async () => {
      renderDetailPage();

      // Title & description
      expect(await screen.findByTestId('document-detail-title')).toHaveTextContent(
        'Guía de Rehabilitación Cervical 2026',
      );
      expect(screen.getByTestId('document-description-text')).toHaveTextContent(
        'Protocolos de tratamiento para patologías de la columna cervical.',
      );

      // File information card
      expect(screen.getByTestId('file-metadata-card')).toBeInTheDocument();
      expect(screen.getByTestId('metadata-filename')).toHaveTextContent('guia_cervical_2026.pdf');
      expect(screen.getByTestId('metadata-extension')).toHaveTextContent('.pdf');
      expect(screen.getByTestId('metadata-filesize')).toHaveTextContent('2 MB');
      expect(screen.getByTestId('metadata-mimetype')).toHaveTextContent('application/pdf');
      expect(screen.getByTestId('metadata-checksum')).toHaveTextContent(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );

      // Invariant: Never expose internal storage paths to user
      expect(screen.queryByText(/doc-storage:doc_123/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/doc-storage:ver_2/i)).not.toBeInTheDocument();
    });

    it('copies SHA-256 checksum to clipboard when clicking copy button', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      const copyBtn = screen.getByTestId('copy-checksum-button');
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledWith(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('triggers document download when clicking the download button in the header', async () => {
      mockedDownload.mockResolvedValue(undefined);

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      const downloadBtn = screen.getByTestId('download-document-button');
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(mockedDownload).toHaveBeenCalledWith(mockDocument);
      });
    });
  });

  describe('2. Ownership & Access Classification', () => {
    it('displays owner, visibility scope label and explanation', async () => {
      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('ownership-metadata-card')).toBeInTheDocument();
      expect(screen.getByTestId('metadata-uploaded-by')).toHaveTextContent('dr_martinez');
      expect(screen.getByTestId('metadata-scope-label')).toHaveTextContent('Personal Clínico');
      expect(
        screen.getByText(/Acceso restringido a terapeutas, kinesiólogos/i),
      ).toBeInTheDocument();
    });

    it('shows administrative action buttons (edit, delete) to ADMIN users', async () => {
      renderDetailPage({ user: ADMIN_USER });
      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('edit-metadata-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-document-button')).toBeInTheDocument();
    });

    it('hides administrative action buttons from regular OPERATOR users', async () => {
      renderDetailPage({ user: OPERATOR_USER });
      await screen.findByTestId('document-detail-title');

      // Operator can download, but cannot edit metadata or delete
      expect(screen.getByTestId('download-document-button')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-metadata-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-document-button')).not.toBeInTheDocument();
    });
  });

  describe('3. Lifecycle & Indexing State Presentation', () => {
    it('renders separate lifecycles for document status (Activo) and indexing status (Indexado)', async () => {
      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      // Document status badge
      expect(screen.getByText('Activo')).toBeInTheDocument();
      // Indexing status badge
      expect(screen.getAllByTestId('ingestion-status-ready').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Indexado').length).toBeGreaterThanOrEqual(1);
      // Success narrative
      expect(
        screen.getByText(
          /El documento está completamente indexado y disponible como fuente citada/i,
        ),
      ).toBeInTheDocument();
    });

    it('renders failed ingestion alert with user-safe explanation and retry button when status is FAILED', async () => {
      const failedDoc: KnowledgeDocumentItem = {
        ...mockDocument,
        ingestionStatus: 'FAILED',
      };
      const failedJobs: IngestionJobItem[] = [
        {
          id: 'job_failed_01',
          documentId: 'doc_123',
          documentVersionId: 'ver_2',
          status: 'FAILED',
          attemptCount: 3,
          maxAttempts: 3,
          lastErrorCode: 'PARSER_CORRUPTED_STREAM',
          lastErrorMessage:
            'No se pudo extraer texto del PDF porque está dañado o protegido con contraseña.',
          createdAt: '2026-11-25T12:00:00.000Z',
          completedAt: '2026-11-25T12:01:00.000Z',
        },
      ];

      mockedApi.getDocument.mockResolvedValue(failedDoc);
      mockedApi.getIngestionHistory.mockResolvedValue(failedJobs);

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      // Failure banner
      expect(screen.getByTestId('ingestion-failure-alert')).toBeInTheDocument();
      expect(
        screen.getAllByText(/No se pudo extraer texto del PDF porque está dañado/i).length,
      ).toBeGreaterThanOrEqual(1);

      // Retry button is available
      const retryBtn = screen.getByTestId('retry-ingestion-button');
      expect(retryBtn).toBeInTheDocument();

      // Clicking retry triggers knowledgeApi.retryIngestion
      mockedApi.retryIngestion.mockResolvedValue({
        id: 'job_retry_1',
        documentId: 'doc_123',
        documentVersionId: 'ver_2',
        status: 'PROCESSING',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-25T12:05:00.000Z',
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockedApi.retryIngestion).toHaveBeenCalledWith('doc_123');
      });
    });

    it('renders cancel ingestion button when ingestion is in flight', async () => {
      const inFlightDoc: KnowledgeDocumentItem = {
        ...mockDocument,
        ingestionStatus: 'PROCESSING',
      };
      mockedApi.getDocument.mockResolvedValue(inFlightDoc);

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      const cancelBtn = screen.getByTestId('cancel-ingestion-button');
      expect(cancelBtn).toBeInTheDocument();

      mockedApi.cancelIngestion.mockResolvedValue({
        id: 'job_cancel_1',
        documentId: 'doc_123',
        documentVersionId: 'ver_2',
        status: 'CANCELLED',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-25T12:05:00.000Z',
      });

      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(mockedApi.cancelIngestion).toHaveBeenCalledWith('doc_123', {
          reason: 'Cancelado por el usuario',
        });
      });
    });

    it('displays deleted alert banner when document is marked as deleted', async () => {
      const deletedDoc: KnowledgeDocumentItem = {
        ...mockDocument,
        status: 'DELETED',
        isDeleted: true,
        deletedAt: '2026-11-25T15:00:00.000Z',
      };
      mockedApi.getDocument.mockResolvedValue(deletedDoc);

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('deleted-document-alert')).toBeInTheDocument();
      expect(screen.getByText('Eliminado')).toBeInTheDocument();
      // Download and edit buttons are hidden for deleted document
      expect(screen.queryByTestId('download-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-metadata-button')).not.toBeInTheDocument();
    });
  });

  describe('4. Version History & Ingestion Jobs Log', () => {
    it('renders version history table with version rows and active badge', async () => {
      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('version-history-section')).toBeInTheDocument();
      expect(screen.getByTestId('version-row-2')).toBeInTheDocument();
      expect(screen.getByTestId('version-row-1')).toBeInTheDocument();

      // Row 2 is current version
      const row2 = screen.getByTestId('version-row-2');
      expect(row2).toHaveTextContent('Actual');
      expect(row2).toHaveTextContent('guia_cervical_2026.pdf');
    });

    it('triggers specific version download when clicking download on a version row', async () => {
      const dummyBlob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
      mockedApi.downloadDocument.mockResolvedValue(dummyBlob);

      // Mock createObjectURL & revokeObjectURL
      const createObjectURLMock = jest.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURLMock = jest.fn();
      window.URL.createObjectURL = createObjectURLMock;
      window.URL.revokeObjectURL = revokeObjectURLMock;

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      const downloadV1Btn = screen.getByTestId('download-version-1-button');
      fireEvent.click(downloadV1Btn);

      await waitFor(() => {
        expect(mockedApi.downloadDocument).toHaveBeenCalledWith('doc_123', 'ver_1');
      });
    });

    it('renders historical ingestion jobs table with status, attempts, and completion timestamp', async () => {
      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('ingestion-history-section')).toBeInTheDocument();
      expect(screen.getByTestId('ingestion-job-row-job_002')).toBeInTheDocument();
      expect(screen.getByTestId('ingestion-job-row-job_001')).toBeInTheDocument();
    });
  });

  describe('5. Metadata Editing Modal Mutation', () => {
    it('opens edit metadata modal and saves updated title and visibility scope', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const updatedDoc: KnowledgeDocumentItem = {
        ...mockDocument,
        title: 'Guía Cervical 2026 - Edición Revisada',
        visibilityScope: 'ALL_STAFF',
      };
      mockedApi.updateMetadata.mockResolvedValue(updatedDoc);

      renderDetailPage({ queryClient });
      await screen.findByTestId('document-detail-title');

      // Click Edit Metadata
      fireEvent.click(screen.getByTestId('edit-metadata-button'));
      expect(await screen.findByTestId('document-edit-metadata-modal')).toBeInTheDocument();

      // Change title
      const titleInput = screen.getByTestId('edit-document-title-input');
      fireEvent.change(titleInput, {
        target: { value: 'Guía Cervical 2026 - Edición Revisada' },
      });

      // Change scope
      const scopeSelect = screen.getByTestId('edit-document-scope-select');
      fireEvent.change(scopeSelect, { target: { value: 'ALL_STAFF' } });

      // Submit form
      fireEvent.click(screen.getByTestId('save-edit-metadata-button'));

      await waitFor(() => {
        expect(mockedApi.updateMetadata).toHaveBeenCalledWith('doc_123', {
          title: 'Guía Cervical 2026 - Edición Revisada',
          description: 'Protocolos de tratamiento para patologías de la columna cervical.',
          visibilityScope: 'ALL_STAFF',
        });
      });

      // Verifies query cache invalidation
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: knowledgeQueryKeys.detail('doc_123'),
      });
    });
  });

  describe('6. Document Deletion Dialog & Navigation', () => {
    it('opens delete confirmation dialog and deletes document, redirecting to library', async () => {
      mockedApi.deleteDocument.mockResolvedValue(undefined);

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      fireEvent.click(screen.getByTestId('delete-document-button'));
      expect(await screen.findByTestId('document-delete-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-delete-document-button'));

      await waitFor(() => {
        expect(mockedApi.deleteDocument).toHaveBeenCalledWith('doc_123');
        expect(screen.getByTestId('knowledge-library-stub')).toBeInTheDocument();
      });
    });
  });

  describe('7. Error Handling, 404 Not Found & 403 Forbidden States', () => {
    it('renders 404 Not Found state when document does not exist', async () => {
      const notFoundError = new Error('Document not found');
      Object.assign(notFoundError, { statusCode: 404 });
      mockedApi.getDocument.mockRejectedValue(notFoundError);

      renderDetailPage();

      expect(await screen.findByText('Documento no encontrado o eliminado')).toBeInTheDocument();
      expect(screen.getByTestId('not-found-back-button')).toBeInTheDocument();
    });

    it('renders 403 Forbidden state when user lacks clearance', async () => {
      const forbiddenError = new Error('Forbidden clearance');
      Object.assign(forbiddenError, { statusCode: 403 });
      mockedApi.getDocument.mockRejectedValue(forbiddenError);

      renderDetailPage();

      expect(await screen.findByText('Acceso no autorizado')).toBeInTheDocument();
      expect(screen.getByTestId('forbidden-back-button')).toBeInTheDocument();
    });
  });
});
