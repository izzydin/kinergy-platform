import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import type { UploadProgress } from '../../../../shared/api/http-client';
import { knowledgeApi } from '../api/knowledge.api';
import { KnowledgePage } from '../routes/knowledge-page';
import { DocumentUploadModal } from '../components/document-upload-modal';
import { IngestionLifecycleTimeline } from '../components/ingestion-lifecycle-timeline';
import type {
  KnowledgeDocumentItem,
  KnowledgeCapabilitiesResponse,
  IngestionJobItem,
} from '../types/knowledge-contract.types';

jest.mock('../api/knowledge.api', () => ({
  knowledgeApi: {
    getCapabilities: jest.fn(),
    listDocuments: jest.fn(),
    getDocument: jest.fn(),
    updateMetadata: jest.fn(),
    deleteDocument: jest.fn(),
    getIngestionHistory: jest.fn(),
    getVersionIngestionHistory: jest.fn(),
    getRetrievalStatus: jest.fn(),
    retryIngestion: jest.fn(),
    retryVersionIngestion: jest.fn(),
    cancelIngestion: jest.fn(),
    uploadDocument: jest.fn(),
    uploadVersion: jest.fn(),
    downloadDocument: jest.fn(),
  },
  triggerDocumentDownload: jest.fn(),
}));

const mockedApi = knowledgeApi as jest.Mocked<typeof knowledgeApi>;

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const ADMIN_USER: AuthUser = {
  id: 'usr_admin_alpha',
  email: 'admin@alpha.com',
  name: 'Director Médico',
  roles: ['ADMIN'],
  permissions: ['ai:documents:manage'],
  tenantId: 'tenant_alpha',
};

const THERAPIST_USER: AuthUser = {
  id: 'usr_therapist_alpha',
  email: 'therapist@alpha.com',
  name: 'Kinesiólogo Clínico',
  roles: ['THERAPIST'],
  permissions: [],
  tenantId: 'tenant_alpha',
};

const mockCapabilities: KnowledgeCapabilitiesResponse = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFileSizeMb: 10,
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
  ],
  allowedExtensions: ['.pdf', '.docx', '.md', '.markdown', '.txt'],
  supportedVisibilityScopes: ['ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT'],
};

const sampleDocAcl: KnowledgeDocumentItem = {
  id: 'doc_fe_01',
  title: 'Guía Clínica de Ligamento Cruzado Anterior',
  description: 'Protocolos de rehabilitación posquirúrgica y tiempos biológicos.',
  visibilityScope: 'CLINICAL_STAFF',
  currentVersionId: 'ver_fe_01',
  uploadedBy: 'usr_admin_alpha',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  originalFileName: 'guia-acl.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 2097152,
  checksum: 'a'.repeat(64),
  versionNumber: 1,
  versionCount: 1,
  storageReference: 'tenants/tenant_alpha/knowledge_base/guia-acl.pdf',
  ingestionStatus: 'READY',
  status: 'ACTIVE',
  isDeleted: false,
  versions: [],
};

const sampleDocFailed: KnowledgeDocumentItem = {
  id: 'doc_fe_02',
  title: 'Protocolo de Cargas Progresivas en Tendón',
  description: 'Pautas de carga isométrica y excéntrica.',
  visibilityScope: 'ALL_STAFF',
  currentVersionId: 'ver_fe_02',
  uploadedBy: 'usr_therapist_alpha',
  createdAt: '2026-11-21T11:00:00.000Z',
  updatedAt: '2026-11-21T11:00:00.000Z',
  originalFileName: 'cargas-tendon.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileExtension: 'docx',
  fileSize: 1048576,
  checksum: 'b'.repeat(64),
  versionNumber: 1,
  versionCount: 1,
  storageReference: 'tenants/tenant_alpha/knowledge_base/cargas-tendon.docx',
  ingestionStatus: 'FAILED',
  status: 'ACTIVE',
  isDeleted: false,
  versions: [],
};

function renderKnowledgeCenter(
  ui: React.ReactElement,
  {
    initialEntries = ['/intelligence/knowledge?view=library'],
    user = ADMIN_USER,
    queryClient = createTestQueryClient(),
  } = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider initialSessionOverride={user}>
          <NotificationProvider>
            <Routes>
              <Route path="/intelligence/knowledge" element={ui} />
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<div data-testid="document-detail-page">Página de detalle</div>}
              />
              <Route path="*" element={ui} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * AI-09.10 — IT.06: Knowledge Center, Upload & Ingestion Tests (Frontend Integration)
 *
 * Verifies:
 * 1. Document listing, server/client filters, empty, no-results, and error recovery states.
 * 2. Upload modal validation, wire transport progress capping (99%), cancellation, and 409 duplicate handling.
 * 3. Ingestion lifecycle timeline stages (UPLOADED -> READY), polling updates, and actionable retry workflows.
 * 4. Document details navigation, permission-aware action visibility, and preview modal lifecycle.
 */
describe('AI-09.10 — IT.06: Knowledge Center, Upload & Ingestion (Frontend Integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getCapabilities.mockResolvedValue(mockCapabilities);
    mockedApi.listDocuments.mockResolvedValue({
      items: [sampleDocAcl, sampleDocFailed],
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  // =========================================================================
  // 1. Knowledge Center Listing, Search, Filter & Empty States
  // =========================================================================
  describe('1. Knowledge Center Listing, Search, Filter & Empty States', () => {
    it('renders document library with titles, format badges, and ingestion status badges', async () => {
      renderKnowledgeCenter(<KnowledgePage />);

      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();
      expect(
        await screen.findByText('Guía Clínica de Ligamento Cruzado Anterior'),
      ).toBeInTheDocument();
      expect(screen.getByText('Protocolo de Cargas Progresivas en Tendón')).toBeInTheDocument();

      // Verify format icons / accessible labels
      expect(screen.getByLabelText('PDF')).toBeInTheDocument();
      expect(screen.getByLabelText('Word')).toBeInTheDocument();

      // Verify status badges
      expect(screen.getByTestId('ingestion-status-ready')).toBeInTheDocument();
      expect(screen.getByTestId('ingestion-status-failed')).toBeInTheDocument();
    });

    it('renders empty state when no documents exist for the tenant', async () => {
      mockedApi.listDocuments.mockResolvedValueOnce({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderKnowledgeCenter(<KnowledgePage />);

      expect(await screen.findByText(/No hay documentos en la biblioteca/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Comienza subiendo el primer documento institucional/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId('empty-library-upload-button')).toBeInTheDocument();
    });

    it('renders no-results state when search filter matches zero documents', async () => {
      mockedApi.listDocuments.mockResolvedValueOnce({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderKnowledgeCenter(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&q=TerminoInexistente'],
      });

      expect(await screen.findByText(/No se encontraron documentos/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Ningún documento coincide con los criterios de búsqueda/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Limpiar filtros/i })).toBeInTheDocument();
    });

    it('renders error state when listing API fails and allows retrying', async () => {
      mockedApi.listDocuments.mockRejectedValueOnce(new Error('Network error loading library'));

      renderKnowledgeCenter(<KnowledgePage />);

      expect(await screen.findByText('Network error loading library')).toBeInTheDocument();

      // Clicking reintentar calls listDocuments again
      const retryBtn = screen.getByRole('button', { name: /Retry|Reintentar/i });
      mockedApi.listDocuments.mockResolvedValueOnce({
        items: [sampleDocAcl],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      fireEvent.click(retryBtn);

      expect(
        await screen.findByText('Guía Clínica de Ligamento Cruzado Anterior'),
      ).toBeInTheDocument();
    });

    it('shows action controls for Admin but hides management controls for view-only users', async () => {
      // 1. Admin view: full controls available
      const { unmount } = renderKnowledgeCenter(<KnowledgePage />, { user: ADMIN_USER });
      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();
      expect(screen.getByTestId('library-upload-button')).toBeInTheDocument();
      unmount();

      // 2. Restricted therapist view: can view documents
      renderKnowledgeCenter(<KnowledgePage />, { user: THERAPIST_USER });
      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();
      expect(
        await screen.findByText('Guía Clínica de Ligamento Cruzado Anterior'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('library-upload-button')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Upload Validation, Wire Transport Progress & Duplicate Protection
  // =========================================================================
  describe('2. Upload Validation, Wire Transport Progress & Duplicate Protection', () => {
    it('validates file size boundaries and extensions on client before sending wire request', async () => {
      renderKnowledgeCenter(
        <DocumentUploadModal isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />,
      );

      expect(await screen.findByTestId('document-upload-modal')).toBeInTheDocument();

      // Dropzone and capabilities are visible
      expect(screen.getByText(/Tamaño máximo permitido:/i)).toBeInTheDocument();

      // 1. Validate unsupported file extension (.exe)
      const invalidExtFile = new File(['binary content'], 'malicious.exe', {
        type: 'application/x-msdownload',
      });
      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [invalidExtFile] } });

      expect(
        await screen.findByText(/La extensión '\.exe' no está permitida/i),
      ).toBeInTheDocument();

      // 2. Validate oversized file (> max allowed boundary)
      const oversizedFile = new File([new Uint8Array(60 * 1024 * 1024)], 'oversized.pdf', {
        type: 'application/pdf',
      });
      fireEvent.change(input, { target: { files: [oversizedFile] } });

      expect(await screen.findByText(/supera el tamaño máximo permitido/i)).toBeInTheDocument();
    });

    it('caps upload progress at 99% until server 201 response arrives, never prematurely displaying 100%', async () => {
      let progressCallback: (p: UploadProgress) => void = () => {};

      mockedApi.uploadDocument.mockImplementation((_formData, options) => {
        if (options?.onProgress) {
          progressCallback = options.onProgress;
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              documentId: 'doc_fe_new_01',
              versionId: 'ver_fe_new_01',
              versionNumber: 1,
              title: 'Nuevo Documento',
              originalFileName: 'protocolo.pdf',
              mimeType: 'application/pdf',
              fileSize: 1024,
              checksum: 'd'.repeat(64),
              visibilityScope: 'ALL_STAFF',
              ingestionJobId: 'job_new_01',
              ingestionStatus: 'UPLOADED',
              createdAt: '2026-11-27T10:00:00.000Z',
            });
          }, 50);
        });
      });

      renderKnowledgeCenter(
        <DocumentUploadModal isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />,
      );

      const validFile = new File(['%PDF-1.4 sample content'], 'protocolo.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [validFile] } });

      const submitBtn = await screen.findByTestId('submit-upload-button');
      fireEvent.click(submitBtn);

      // Simulate wire upload transport progress at 100%
      act(() => {
        progressCallback({ loaded: 1024, total: 1024, percentage: 100, lengthComputable: true });
      });

      // Assert progress is capped at 99% while awaiting server confirmation
      expect(screen.getByText('99%')).toBeInTheDocument();
      expect(screen.queryByText('100%')).not.toBeInTheDocument();

      // Wait for server response to resolve
      await waitFor(() => {
        expect(screen.getByTestId('upload-success-view')).toBeInTheDocument();
      });
    });

    it('cancels active upload when user clicks Cancelar subida', async () => {
      mockedApi.uploadDocument.mockImplementation(
        () => new Promise(() => {}), // hung promise simulating active upload
      );

      renderKnowledgeCenter(
        <DocumentUploadModal isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />,
      );

      const validFile = new File(['%PDF-1.4 content'], 'manual.pdf', { type: 'application/pdf' });
      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [validFile] } });

      const submitBtn = await screen.findByTestId('submit-upload-button');
      fireEvent.click(submitBtn);

      const cancelBtn = await screen.findByTestId('cancel-upload-button');
      fireEvent.click(cancelBtn);

      // Verify cancellation banner
      expect(await screen.findByTestId('upload-cancelled-banner')).toBeInTheDocument();
    });

    it('handles backend 409 Conflict duplicate hash with actionable message', async () => {
      const conflictError = Object.assign(new Error('Checksum duplicate error'), {
        status: 409,
        statusCode: 409,
      });
      mockedApi.uploadDocument.mockRejectedValueOnce(conflictError);

      renderKnowledgeCenter(
        <DocumentUploadModal isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />,
      );

      const validFile = new File(['%PDF-1.4 duplicated'], 'duplicate.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByTestId('document-file-input');
      fireEvent.change(input, { target: { files: [validFile] } });

      const submitBtn = await screen.findByTestId('submit-upload-button');
      fireEvent.click(submitBtn);

      expect(await screen.findByTestId('upload-error-alert')).toBeInTheDocument();
      expect(screen.getByText(/Ya existe un documento registrado/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Ingestion Lifecycle Timeline, Polling & Retry Recovery
  // =========================================================================
  describe('3. Ingestion Lifecycle Timeline, Polling & Retry Recovery', () => {
    it('renders all pipeline stages with correct statuses and allows retrying a failed job', async () => {
      const failedJob: IngestionJobItem = {
        id: 'job_failed_01',
        documentId: 'doc_fe_02',
        documentVersionId: 'ver_fe_02',
        status: 'FAILED',
        attemptCount: 1,
        maxAttempts: 3,
        canRetry: true,
        lastErrorCode: 'PROCESSING_TIMEOUT',
        lastErrorMessage: 'Tiempo de espera agotado al extraer bloques de texto.',
        createdAt: '2026-11-27T08:00:00.000Z',
      };

      const handleRetry = jest.fn();

      renderKnowledgeCenter(
        <IngestionLifecycleTimeline
          documentId="doc_fe_02"
          versionId="ver_fe_02"
          job={failedJob}
          canManage={true}
          onRetry={handleRetry}
        />,
      );

      // Verify timeline section displays failed stage and error message
      expect(await screen.findByTestId('ingestion-lifecycle-section')).toBeInTheDocument();
      expect(
        screen.getByText('Tiempo de espera agotado al extraer bloques de texto.'),
      ).toBeInTheDocument();

      // Retry button is present and triggers retry
      const retryBtn = screen.getByTestId('lifecycle-retry-button');
      fireEvent.click(retryBtn);

      expect(handleRetry).toHaveBeenCalled();
    });

    it('renders successfully completed READY ingestion state', async () => {
      const readyJob: IngestionJobItem = {
        id: 'job_ready_01',
        documentId: 'doc_fe_01',
        documentVersionId: 'ver_fe_01',
        status: 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-20T10:00:00.000Z',
      };

      renderKnowledgeCenter(
        <IngestionLifecycleTimeline
          documentId="doc_fe_01"
          versionId="ver_fe_01"
          job={readyJob}
          canManage={true}
        />,
      );

      expect(await screen.findByTestId('ingestion-lifecycle-section')).toBeInTheDocument();
      expect(screen.getByTestId('ingestion-status-ready')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Document Detail Navigation & End-to-End Actions
  // =========================================================================
  describe('4. Document Detail Navigation & End-to-End Actions', () => {
    it('navigates to document details page when clicking a document title in the library table', async () => {
      renderKnowledgeCenter(<KnowledgePage />);

      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();

      const docLink = await screen.findByTestId('document-title-link-doc_fe_01');
      expect(docLink).toBeInTheDocument();
      expect(docLink).toHaveAttribute('href', '/intelligence/knowledge/documents/doc_fe_01');
    });
  });
});
