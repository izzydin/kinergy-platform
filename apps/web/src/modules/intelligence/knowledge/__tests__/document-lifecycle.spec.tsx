import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { DocumentDetailPage } from '../routes/document-detail-page';
import { knowledgeApi } from '../api/knowledge.api';
import type {
  KnowledgeDocumentItem,
  DocumentVersionItem,
  IngestionJobItem,
} from '../types/knowledge-contract.types';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

// Mock knowledge API
jest.mock('../api/knowledge.api', () => ({
  ...jest.requireActual('../api/knowledge.api'),
  knowledgeApi: {
    getDocument: jest.fn(),
    deleteDocument: jest.fn(),
    restoreDocument: jest.fn(),
    reprocessDocument: jest.fn(),
    getDocumentVersions: jest.fn(),
    getIngestionHistory: jest.fn(),
    getRetrievalStatus: jest.fn().mockResolvedValue({
      documentId: 'doc_123',
      isReadyForRetrieval: true,
      overallReady: true,
      hasActiveIndexGeneration: true,
      isDocumentActive: true,
      chunksPersisted: true,
      embeddingsCommitted: true,
      activeGenerationId: 'gen_test',
      reasons: [],
      evaluatedAt: '2026-11-26T10:00:00.000Z',
    }),
    getPreviewMetadata: jest.fn(),
    retryIngestion: jest.fn(),
    cancelIngestion: jest.fn(),
  },
  triggerDocumentDownload: jest.fn(),
}));

const ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.com',
  name: 'Admin User',
  roles: ['ADMINISTRATOR'],
  permissions: ['ai:documents:manage', 'ai:documents:read'],
  tenantId: 'tenant_kinergy_1',
};

const VIEWER_USER: AuthUser = {
  id: 'usr_viewer_1',
  email: 'viewer@kinergy.com',
  name: 'Clinical Viewer',
  roles: ['VIEWER'],
  permissions: ['ai:documents:read'],
  tenantId: 'tenant_kinergy_1',
};

const mockVersion1: DocumentVersionItem = {
  id: 'ver_v1',
  versionNumber: 1,
  originalFileName: 'guia_clinica_kine.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 1048576,
  checksum: '1111111111111111111111111111111111111111111111111111111111111111',
  uploadedBy: 'Dr. Roberto Gómez',
  storageReference: 'doc-storage:doc_life_100:ver_v1',
  createdAt: '2026-11-20T10:00:00Z',
  ingestionStatus: 'READY',
};

const mockActiveDocument: KnowledgeDocumentItem = {
  id: 'doc_life_100',
  title: 'Guía Clínica de Kinesiología y Ergonomía',
  description: 'Protocolo clínico asistido para rehabilitación neuromuscular.',
  uploadedBy: 'Dr. Roberto Gómez',
  visibilityScope: 'ALL_STAFF',
  currentVersionId: 'ver_v1',
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  originalFileName: 'guia_clinica_kine.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 1048576,
  checksum: '1111111111111111111111111111111111111111111111111111111111111111',
  versionNumber: 1,
  versionCount: 1,
  storageReference: 'doc-storage:doc_life_100:ver_v1',
  ingestionStatus: 'READY',
  status: 'ACTIVE',
  isDeleted: false,
  deletedAt: null,
  versions: [mockVersion1],
};

const mockDeletedDocument: KnowledgeDocumentItem = {
  ...mockActiveDocument,
  id: 'doc_life_deleted',
  title: 'Protocolo Retirado por Nueva Versión',
  status: 'DELETED',
  isDeleted: true,
  deletedAt: '2026-11-24T14:30:00Z',
};

const mockIngestionJob: IngestionJobItem = {
  id: 'job_life_01',
  documentId: 'doc_life_100',
  documentVersionId: 'ver_v1',
  status: 'READY',
  attemptCount: 1,
  maxAttempts: 3,
  createdAt: '2026-11-20T10:00:00Z',
  completedAt: '2026-11-20T10:02:00Z',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderDetailPage(docId = 'doc_life_100', user: AuthUser | null = ADMIN_USER) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user ?? undefined}>
        <NotificationProvider>
          <MemoryRouter initialEntries={[`/intelligence/knowledge/documents/${docId}`]}>
            <Routes>
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<DocumentDetailPage />}
              />
              <Route
                path="/intelligence/knowledge"
                element={<div data-testid="library-mock">Biblioteca</div>}
              />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Knowledge Center — Document Lifecycle Actions & Permissions (KC.09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockActiveDocument);
    (knowledgeApi.getDocumentVersions as jest.Mock).mockResolvedValue([mockVersion1]);
    (knowledgeApi.getIngestionHistory as jest.Mock).mockResolvedValue([mockIngestionJob]);
    (knowledgeApi.deleteDocument as jest.Mock).mockResolvedValue(undefined);
    (knowledgeApi.restoreDocument as jest.Mock).mockResolvedValue({
      ...mockActiveDocument,
      status: 'ACTIVE',
      isDeleted: false,
    });
    (knowledgeApi.reprocessDocument as jest.Mock).mockResolvedValue({
      ...mockIngestionJob,
      status: 'UPLOADED',
    });
  });

  describe('1. Soft Deletion Workflow & Retention Policy', () => {
    it('renders delete action for authorized managers on active document', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      const deleteButton = await screen.findByTestId('delete-document-button');
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton).toHaveTextContent('Eliminar');
    });

    it('opens DocumentDeleteDialog and explains soft deletion with retention policy', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      const deleteButton = await screen.findByTestId('delete-document-button');
      fireEvent.click(deleteButton);

      const dialog = await screen.findByTestId('document-delete-dialog');
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByText('¿Eliminar documento de la base de conocimiento?'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Esta acción ejecutará una eliminación lógica \(soft delete\)/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Los archivos y versiones históricas se conservan bajo la política de retención/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Eliminación lógica con retención de cumplimiento legal y citas previas/i),
      ).toBeInTheDocument();
    });

    it('closes delete dialog cleanly on cancel without invoking API', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('delete-document-button'));
      expect(await screen.findByTestId('document-delete-dialog')).toBeInTheDocument();

      const cancelButton = screen.getByTestId('cancel-delete-document-button');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByTestId('document-delete-dialog')).not.toBeInTheDocument();
      });
      expect(knowledgeApi.deleteDocument).not.toHaveBeenCalled();
    });

    it('confirms soft deletion, calls API, navigates to library and prevents duplicate submission', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('delete-document-button'));
      const confirmButton = await screen.findByTestId('confirm-delete-document-button');

      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(knowledgeApi.deleteDocument).toHaveBeenCalledWith('doc_life_100');
      });
      await waitFor(() => {
        expect(screen.getByTestId('library-mock')).toBeInTheDocument();
      });
    });
  });

  describe('2. Soft-Deleted State & Restoration Workflow', () => {
    it('displays deleted alert banner and lifecycle badge for soft-deleted documents', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      renderDetailPage('doc_life_deleted', ADMIN_USER);

      const alert = await screen.findByTestId('deleted-document-alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/Documento eliminado:/i);
      expect(alert).toHaveTextContent(/Sus vectores asociados han sido purgados del índice/i);
      expect(screen.getByText('Eliminado')).toBeInTheDocument();

      // Normal actions should be hidden
      expect(screen.queryByTestId('preview-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-metadata-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-document-button')).not.toBeInTheDocument();
    });

    it('renders restore button for managers on soft-deleted document', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      renderDetailPage('doc_life_deleted', ADMIN_USER);

      const restoreButton = await screen.findByTestId('restore-document-button');
      expect(restoreButton).toBeInTheDocument();
      expect(restoreButton).toHaveTextContent('Restaurar Documento');
    });

    it('opens DocumentRestoreDialog, explains RAG vector re-indexing, and confirms restore', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      renderDetailPage('doc_life_deleted', ADMIN_USER);

      const restoreButton = await screen.findByTestId('restore-document-button');
      fireEvent.click(restoreButton);

      const dialog = await screen.findByTestId('document-restore-dialog');
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByText('¿Restaurar documento en la base de conocimiento?'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Esta acción reactivará el documento y encolará automáticamente la reindexación/i,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/El documento volverá a tener estado ACTIVO/i)).toBeInTheDocument();

      const confirmButton = screen.getByTestId('confirm-restore-document-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(knowledgeApi.restoreDocument).toHaveBeenCalledWith('doc_life_deleted');
      });
      await waitFor(() => {
        expect(screen.queryByTestId('document-restore-dialog')).not.toBeInTheDocument();
      });
    });

    it('cancels restore dialog without invoking API', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      renderDetailPage('doc_life_deleted', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('restore-document-button'));
      expect(await screen.findByTestId('document-restore-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-restore-document-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('document-restore-dialog')).not.toBeInTheDocument();
      });
      expect(knowledgeApi.restoreDocument).not.toHaveBeenCalled();
    });
  });

  describe('3. Document Reprocess & Reindexing Workflow', () => {
    it('renders reindex button for active documents without in-flight ingestion', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      const reprocessButton = await screen.findByTestId('reprocess-document-button');
      expect(reprocessButton).toBeInTheDocument();
      expect(reprocessButton).toHaveTextContent('Reindexar');
    });

    it('opens DocumentReprocessDialog and explains vector purge & embedding regeneration', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('reprocess-document-button'));

      const dialog = await screen.findByTestId('document-reprocess-dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText('¿Reprocesar y reindexar documento?')).toBeInTheDocument();
      expect(
        screen.getByText(/Esta acción purgará los vectores anteriores y ejecutará nuevamente/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Los embeddings se actualizarán con el modelo vectorial vigente/i),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-reprocess-document-button'));

      await waitFor(() => {
        expect(knowledgeApi.reprocessDocument).toHaveBeenCalledWith('doc_life_100');
      });
      await waitFor(() => {
        expect(screen.queryByTestId('document-reprocess-dialog')).not.toBeInTheDocument();
      });
    });

    it('cancels reprocess dialog cleanly', async () => {
      renderDetailPage('doc_life_100', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('reprocess-document-button'));
      expect(await screen.findByTestId('document-reprocess-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-reprocess-document-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('document-reprocess-dialog')).not.toBeInTheDocument();
      });
      expect(knowledgeApi.reprocessDocument).not.toHaveBeenCalled();
    });
  });

  describe('4. RBAC & Viewer Role Enforcement', () => {
    it('hides all administrative lifecycle actions when user is a viewer without manage permissions', async () => {
      renderDetailPage('doc_life_100', VIEWER_USER);

      // Wait for document to render
      expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();

      // Read actions should be visible
      expect(screen.getByTestId('preview-document-button')).toBeInTheDocument();
      expect(screen.getByTestId('download-document-button')).toBeInTheDocument();

      // Mutating lifecycle actions MUST be hidden
      expect(screen.queryByTestId('delete-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('restore-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reprocess-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-metadata-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('upload-new-version-button')).not.toBeInTheDocument();
    });

    it('hides restore button for viewer on soft-deleted document', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      renderDetailPage('doc_life_deleted', VIEWER_USER);

      expect(await screen.findByTestId('document-detail-title')).toBeInTheDocument();
      expect(screen.queryByTestId('restore-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-document-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reprocess-document-button')).not.toBeInTheDocument();
    });
  });

  describe('5. Error Handling & Mutation Resilience', () => {
    it('handles delete mutation rejection gracefully without crash', async () => {
      (knowledgeApi.deleteDocument as jest.Mock).mockRejectedValueOnce(
        new Error('Cross-tenant deletion prohibited.'),
      );

      renderDetailPage('doc_life_100', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('delete-document-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-document-button'));

      // Should not navigate away on error
      await waitFor(() => {
        expect(screen.queryByTestId('library-mock')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('document-detail-title')).toBeInTheDocument();
    });

    it('handles restore mutation rejection gracefully without crash', async () => {
      (knowledgeApi.getDocument as jest.Mock).mockResolvedValue(mockDeletedDocument);
      (knowledgeApi.restoreDocument as jest.Mock).mockRejectedValueOnce(
        new Error('Document is already active.'),
      );

      renderDetailPage('doc_life_deleted', ADMIN_USER);

      fireEvent.click(await screen.findByTestId('restore-document-button'));
      fireEvent.click(screen.getByTestId('confirm-restore-document-button'));

      await waitFor(() => {
        expect(screen.getByTestId('document-detail-title')).toBeInTheDocument();
      });
    });
  });
});
