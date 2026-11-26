import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { DocumentDetailPage } from '../routes/document-detail-page';
import type { KnowledgeDocumentItem } from '../types/knowledge-contract.types';

// Mock knowledgeApi
jest.mock('../api/knowledge.api', () => ({
  ...jest.requireActual('../api/knowledge.api'),
  knowledgeApi: {
    getDocument: jest.fn(),
    getIngestionHistory: jest.fn(),
    getRetrievalStatus: jest.fn(),
    deleteDocument: jest.fn(),
    restoreDocument: jest.fn(),
    reprocessDocument: jest.fn(),
    retryIngestion: jest.fn(),
    cancelIngestion: jest.fn(),
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
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['ADMINISTRATOR'],
  permissions: ['ai:documents:manage', 'ai:documents:read'],
  tenantId: 'tenant_kinergy_1',
};

const baseDocument: KnowledgeDocumentItem = {
  id: 'doc_ver_test',
  title: 'Guía Clínica de Ejercicio Terapéutico',
  description: 'Protocolos de prescripción de ejercicio.',
  visibilityScope: 'CLINICAL_STAFF',
  currentVersionId: 'ver_2',
  versionNumber: 2,
  versionCount: 2,
  uploadedBy: 'dr_martinez',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-26T09:00:00.000Z',
  originalFileName: 'guia_ejercicio_v2.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 2048000,
  checksum: 'c2e8b0f4d3a1e5c7a9b0d2e4f6a8b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5',
  ingestionStatus: 'READY',
  versions: [
    {
      id: 'ver_2',
      versionNumber: 2,
      originalFileName: 'guia_ejercicio_v2.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 2048000,
      checksum: 'c2e8b0f4d3a1e5c7a9b0d2e4f6a8b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5',
      language: 'es',
      uploadedBy: 'dr_martinez',
      ingestionStatus: 'READY',
      createdAt: '2026-11-26T09:00:00.000Z',
    },
    {
      id: 'ver_1',
      versionNumber: 1,
      originalFileName: 'guia_ejercicio_v1.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 1536000,
      checksum: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      language: 'es',
      uploadedBy: 'dr_martinez',
      ingestionStatus: 'READY',
      createdAt: '2026-11-20T10:00:00.000Z',
    },
  ],
};

function renderDetailPage(docId = 'doc_ver_test') {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={ADMIN_USER}>
        <NotificationProvider>
          <MemoryRouter initialEntries={[`/intelligence/knowledge/documents/${docId}`]}>
            <Routes>
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<DocumentDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('IM.04 — Document Version & Indexing Status Visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Current Version Fully Indexed in RAG (Consistent State)
  // =========================================================================
  it('displays consistent indexing when current version (v2) is fully indexed in RAG', async () => {
    mockedApi.getDocument.mockResolvedValue(baseDocument);
    mockedApi.getIngestionHistory.mockResolvedValue([
      {
        id: 'job_v2',
        documentId: 'doc_ver_test',
        documentVersionId: 'ver_2',
        versionNumber: 2,
        status: 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-26T09:00:00.000Z',
        completedAt: '2026-11-26T09:01:00.000Z',
      },
    ]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: true,
      overallReady: true,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: true,
      embeddingsCommitted: true,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: 'ver_2',
      indexedVersionNumber: 2,
      hasVersionDiscrepancy: false,
      discrepancyReason: null,
      lastSuccessfulIndexingAt: '2026-11-26T09:01:00.000Z',
      reasons: [],
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

    // No discrepancy alert
    expect(screen.queryByTestId('version-discrepancy-alert')).not.toBeInTheDocument();

    // Header badge indicates v2 is in RAG
    const ragBadge = screen.getByTestId('indexed-version-badge');
    expect(ragBadge).toHaveTextContent('RAG: v2');

    // Card 3 shows v2 in RAG
    expect(screen.getByTestId('metadata-indexed-version')).toHaveTextContent('v2');

    // Version history table: row 2 shows "En RAG"
    const row2Badge = screen.getByTestId('version-2-rag-badge');
    expect(row2Badge).toHaveTextContent('En RAG');

    // Version history table: row 1 shows "Histórico"
    const row1Badge = screen.getByTestId('version-1-rag-badge');
    expect(row1Badge).toHaveTextContent('Histórico');
  });

  // =========================================================================
  // 2. Version Discrepancy: New Version Processing, Old Version Active in RAG
  // =========================================================================
  it('surfaces discrepancy when new version (v2) is processing while v1 remains active in RAG', async () => {
    const docWithProcessingV2: KnowledgeDocumentItem = {
      ...baseDocument,
      ingestionStatus: 'PROCESSING',
      versions: [
        {
          ...baseDocument.versions[0]!,
          ingestionStatus: 'PROCESSING',
        },
        baseDocument.versions[1]!,
      ],
    };

    mockedApi.getDocument.mockResolvedValue(docWithProcessingV2);
    mockedApi.getIngestionHistory.mockResolvedValue([
      {
        id: 'job_v2_proc',
        documentId: 'doc_ver_test',
        documentVersionId: 'ver_2',
        versionNumber: 2,
        status: 'PROCESSING',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-26T09:00:00.000Z',
      },
      {
        id: 'job_v1_ready',
        documentId: 'doc_ver_test',
        documentVersionId: 'ver_1',
        versionNumber: 1,
        status: 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-20T10:00:00.000Z',
        completedAt: '2026-11-20T10:02:00.000Z',
      },
    ]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: false,
      embeddingsCommitted: false,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: 'ver_1',
      indexedVersionNumber: 1,
      hasVersionDiscrepancy: true,
      discrepancyReason:
        'La versión actual (v2) está siendo procesada. La versión anterior (v1) permanece activa en el índice RAG.',
      lastSuccessfulIndexingAt: '2026-11-20T10:02:00.000Z',
      reasons: ['Current version is still processing.'],
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

    // Discrepancy alert banner MUST be rendered with authoritative backend reason
    const discrepancyAlert = screen.getByTestId('version-discrepancy-alert');
    expect(discrepancyAlert).toBeInTheDocument();
    expect(discrepancyAlert).toHaveTextContent(
      'La versión actual (v2) está siendo procesada. La versión anterior (v1) permanece activa en el índice RAG.',
    );

    // Header badge indicates v1 is the one currently in RAG
    const ragBadge = screen.getByTestId('indexed-version-badge');
    expect(ragBadge).toHaveTextContent('RAG: v1');

    // Card 3 shows v1 in RAG, not v2
    expect(screen.getByTestId('metadata-indexed-version')).toHaveTextContent('v1');

    // Version history table: row 2 shows "No en RAG"
    const row2Badge = screen.getByTestId('version-2-rag-badge');
    expect(row2Badge).toHaveTextContent('No en RAG');

    // Version history table: row 1 shows "En RAG"
    const row1Badge = screen.getByTestId('version-1-rag-badge');
    expect(row1Badge).toHaveTextContent('En RAG');
  });

  // =========================================================================
  // 3. Version Discrepancy: New Version Failed, Old Version Active in RAG
  // =========================================================================
  it('surfaces discrepancy when new version (v2) failed indexing while v1 remains active in RAG', async () => {
    const docWithFailedV2: KnowledgeDocumentItem = {
      ...baseDocument,
      ingestionStatus: 'FAILED',
      versions: [
        {
          ...baseDocument.versions[0]!,
          ingestionStatus: 'FAILED',
        },
        baseDocument.versions[1]!,
      ],
    };

    mockedApi.getDocument.mockResolvedValue(docWithFailedV2);
    mockedApi.getIngestionHistory.mockResolvedValue([
      {
        id: 'job_v2_fail',
        documentId: 'doc_ver_test',
        documentVersionId: 'ver_2',
        versionNumber: 2,
        status: 'FAILED',
        attemptCount: 1,
        maxAttempts: 3,
        lastErrorCode: 'PARSING_ERROR',
        lastErrorMessage: 'PDF structure corrupted.',
        createdAt: '2026-11-26T09:00:00.000Z',
      },
    ]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: false,
      embeddingsCommitted: false,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: 'ver_1',
      indexedVersionNumber: 1,
      hasVersionDiscrepancy: true,
      discrepancyReason:
        'La indexación de la versión actual (v2) falló. La versión anterior (v1) continúa activa en el índice RAG.',
      lastSuccessfulIndexingAt: '2026-11-20T10:02:00.000Z',
      reasons: ['Current version failed indexing.'],
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

    const discrepancyAlert = screen.getByTestId('version-discrepancy-alert');
    expect(discrepancyAlert).toBeInTheDocument();
    expect(discrepancyAlert).toHaveTextContent(
      'La indexación de la versión actual (v2) falló. La versión anterior (v1) continúa activa en el índice RAG.',
    );

    // Card 3 shows v1 is indexed
    expect(screen.getByTestId('metadata-indexed-version')).toHaveTextContent('v1');
  });

  // =========================================================================
  // 4. Version Detail Modal Shows Accurate RAG Presence
  // =========================================================================
  it('displays accurate RAG presence in VersionDetailModal for both indexed and unindexed versions', async () => {
    mockedApi.getDocument.mockResolvedValue(baseDocument);
    mockedApi.getIngestionHistory.mockResolvedValue([]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: true,
      embeddingsCommitted: true,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: 'ver_1',
      indexedVersionNumber: 1,
      hasVersionDiscrepancy: true,
      discrepancyReason: 'v1 is active in RAG while v2 is not ready.',
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

    // 1. Open details for Version 1 (which is active in RAG)
    const v1DetailsBtn = screen.getByTestId('version-details-1-button');
    fireEvent.click(v1DetailsBtn);

    expect(await screen.findByTestId('version-detail-modal')).toBeInTheDocument();
    expect(screen.getByTestId('version-detail-rag-active-badge')).toHaveTextContent(
      'Activo en Índice RAG',
    );
    expect(screen.getByTestId('version-detail-rag-status')).toHaveTextContent(
      'Activo en índice de búsqueda',
    );

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));

    // 2. Open details for Version 2 (current version, but NOT in RAG)
    await waitFor(() => {
      expect(screen.queryByTestId('version-detail-modal')).not.toBeInTheDocument();
    });

    const v2DetailsBtn = screen.getByTestId('version-details-2-button');
    fireEvent.click(v2DetailsBtn);

    expect(await screen.findByTestId('version-detail-modal')).toBeInTheDocument();
    expect(screen.getByTestId('version-detail-rag-inactive-badge')).toHaveTextContent(
      'No disponible en RAG',
    );
    expect(screen.getByTestId('version-detail-rag-status')).toHaveTextContent(
      'v1 is active in RAG while v2 is not ready.',
    );
  });

  // =========================================================================
  // 5. Current Version Pending While Previous Version Is Indexed
  // =========================================================================
  it('surfaces discrepancy when new version (v2) is pending (UPLOADED) while v1 is indexed', async () => {
    const docWithPendingV2: KnowledgeDocumentItem = {
      ...baseDocument,
      ingestionStatus: 'UPLOADED',
      versions: [
        {
          ...baseDocument.versions[0]!,
          ingestionStatus: 'UPLOADED',
        },
        baseDocument.versions[1]!,
      ],
    };

    mockedApi.getDocument.mockResolvedValue(docWithPendingV2);
    mockedApi.getIngestionHistory.mockResolvedValue([
      {
        id: 'job_v2_uploaded',
        documentId: 'doc_ver_test',
        documentVersionId: 'ver_2',
        versionNumber: 2,
        status: 'UPLOADED',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-26T09:00:00.000Z',
      },
    ]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: false,
      embeddingsCommitted: false,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: 'ver_1',
      indexedVersionNumber: 1,
      hasVersionDiscrepancy: true,
      discrepancyReason:
        'La versión actual (v2) está en cola. La versión anterior (v1) continúa activa en el índice RAG.',
      lastSuccessfulIndexingAt: '2026-11-20T10:02:00.000Z',
      reasons: ['Current version is queued for processing.'],
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

    const alert = screen.getByTestId('version-discrepancy-alert');
    expect(alert).toHaveTextContent(
      'La versión actual (v2) está en cola. La versión anterior (v1) continúa activa en el índice RAG.',
    );
    expect(screen.getByTestId('version-2-rag-badge')).toHaveTextContent('No en RAG');
    expect(screen.getByTestId('version-1-rag-badge')).toHaveTextContent('En RAG');
  });

  // =========================================================================
  // 6. Safe Handling of Missing Version Ingestion Status
  // =========================================================================
  it('safely handles missing version ingestion status without throwing', async () => {
    const docWithUndefinedStatus: KnowledgeDocumentItem = {
      ...baseDocument,
      versions: [
        {
          ...baseDocument.versions[0]!,
          ingestionStatus: undefined,
        },
        {
          ...baseDocument.versions[1]!,
          ingestionStatus: undefined,
        },
      ],
    };

    mockedApi.getDocument.mockResolvedValue(docWithUndefinedStatus);
    mockedApi.getIngestionHistory.mockResolvedValue([]);
    mockedApi.getRetrievalStatus.mockResolvedValue({
      documentId: 'doc_ver_test',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: false,
      embeddingsCommitted: false,
      activeGenerationId: 'gen_active_01',
      currentVersionId: 'ver_2',
      currentVersionNumber: 2,
      indexedVersionId: null,
      indexedVersionNumber: null,
      hasVersionDiscrepancy: true,
      discrepancyReason:
        'Ninguna versión de este documento está actualmente indexada en la generación activa de RAG.',
      evaluatedAt: '2026-11-26T09:05:00.000Z',
    });

    renderDetailPage();

    expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();
    expect(screen.getByTestId('version-discrepancy-alert')).toHaveTextContent(
      'Ninguna versión de este documento está actualmente indexada',
    );
    expect(screen.getByTestId('metadata-indexed-version')).toHaveTextContent('Ninguna');
  });
});
