import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { DocumentDetailPage } from '../routes/document-detail-page';
import { VersionComparisonModal } from '../components/version-comparison-modal';
import type {
  KnowledgeDocumentItem,
  DocumentVersionItem,
  DocumentPreviewMetadataResponse,
} from '../types/knowledge-contract.types';

// Mock knowledgeApi and download triggers
jest.mock('../api/knowledge.api', () => ({
  knowledgeApi: {
    getCapabilities: jest.fn(),
    listDocuments: jest.fn(),
    getDocument: jest.fn(),
    getDocumentVersions: jest.fn(),
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
  },
  triggerDocumentDownload: jest.fn(),
}));

const mockedApi = knowledgeApi as jest.Mocked<typeof knowledgeApi>;

// Setup URL.createObjectURL and URL.revokeObjectURL
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;

const createObjectURLMock = jest.fn(() => 'blob:http://localhost/test-blob-version');
const revokeObjectURLMock = jest.fn();

beforeAll(() => {
  window.URL.createObjectURL = createObjectURLMock;
  window.URL.revokeObjectURL = revokeObjectURLMock;

  // Polyfill Blob.prototype.text
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

// 3 versions in non-chronological order to test deterministic sorting
const mockVersion1: DocumentVersionItem = {
  id: 'ver_v1',
  versionNumber: 1,
  originalFileName: 'guia_kine_v1_inicial.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 1048576, // 1.0 MB
  checksum: '1111111111111111111111111111111111111111111111111111111111111111',
  language: 'es',
  uploadedBy: 'dr_soto',
  storageReference: 'doc-storage:ver_v1',
  ingestionStatus: 'READY',
  createdAt: '2026-11-10T10:00:00.000Z',
};

const mockVersion2: DocumentVersionItem = {
  id: 'ver_v2',
  versionNumber: 2,
  originalFileName: 'guia_kine_v2_revisada.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 1572864, // 1.5 MB (+500 KB)
  checksum: '2222222222222222222222222222222222222222222222222222222222222222',
  language: 'es',
  uploadedBy: 'lic_mendoza',
  storageReference: 'doc-storage:ver_v2',
  ingestionStatus: 'READY',
  createdAt: '2026-11-18T14:30:00.000Z',
};

const mockVersion3: DocumentVersionItem = {
  id: 'ver_v3',
  versionNumber: 3,
  originalFileName: 'guia_kine_v3_final.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 2097152, // 2.0 MB (+500 KB)
  checksum: '3333333333333333333333333333333333333333333333333333333333333333',
  language: 'es',
  uploadedBy: 'dr_soto',
  storageReference: 'doc-storage:ver_v3',
  ingestionStatus: 'READY',
  createdAt: '2026-11-25T11:00:00.000Z',
};

const multiVersionDocument: KnowledgeDocumentItem = {
  id: 'doc_versions_100',
  title: 'Guía Clínica de Rehabilitación Funcional',
  description: 'Documento con evolución histórica de tres versiones.',
  visibilityScope: 'CLINICAL_STAFF',
  currentVersionId: 'ver_v3',
  uploadedBy: 'dr_soto',
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-25T11:00:00.000Z',
  originalFileName: 'guia_kine_v3_final.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 2097152,
  checksum: '3333333333333333333333333333333333333333333333333333333333333333',
  versionNumber: 3,
  versionCount: 3,
  storageReference: 'doc-storage:doc_versions_100:ver_v3',
  ingestionStatus: 'READY',
  status: 'ACTIVE',
  isDeleted: false,
  deletedAt: null,
  // Given in unsorted order (v2, v1, v3) to verify deterministic sorting
  versions: [mockVersion2, mockVersion1, mockVersion3],
};

const mockPreviewMetaV2: DocumentPreviewMetadataResponse = {
  documentId: 'doc_versions_100',
  versionId: 'ver_v2',
  versionNumber: 2,
  title: 'Guía Clínica de Rehabilitación Funcional',
  originalFileName: 'guia_kine_v2_revisada.pdf',
  mimeType: 'application/pdf',
  fileSize: 1572864,
  checksum: '2222222222222222222222222222222222222222222222222222222222222222',
  canPreview: true,
  visibilityScope: 'CLINICAL_STAFF',
  isAuthorized: true,
  isDeleted: false,
};

function renderDetailPage(docId = 'doc_versions_100', user: AuthUser | null = ADMIN_USER) {
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

describe('KC.08 — Document Version History Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createObjectURLMock.mockReturnValue('blob:http://localhost/test-blob-version');
    mockedApi.getDocument.mockResolvedValue(multiVersionDocument);
    mockedApi.getDocumentVersions.mockResolvedValue([mockVersion3, mockVersion2, mockVersion1]);
    mockedApi.getIngestionHistory.mockResolvedValue([]);
    mockedApi.downloadDocument.mockResolvedValue(
      new Blob(['mock downloaded version payload'], { type: 'application/pdf' }),
    );
    mockedApi.getPreviewMetadata.mockResolvedValue(mockPreviewMetaV2);
    mockedApi.getDocumentContentBlob.mockResolvedValue(
      new Blob(['%PDF-1.4 mock v2 content'], { type: 'application/pdf' }),
    );
    mockedApi.getCapabilities.mockResolvedValue({
      maxFileSizeBytes: 10485760,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf', 'text/markdown'],
      allowedExtensions: ['.pdf', '.md'],
      supportedVisibilityScopes: ['ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT'],
    });
  });

  describe('1. Version History Listing & Deterministic Ordering', () => {
    it('renders all actual versions returned by backend with complete attributes', async () => {
      renderDetailPage();

      // Wait for document to load
      expect(await screen.findByTestId('document-detail-title')).toHaveTextContent(
        'Guía Clínica de Rehabilitación Funcional',
      );

      // Section header contains total versions count
      const historySection = screen.getByTestId('version-history-section');
      expect(historySection).toBeInTheDocument();
      expect(screen.getByText(/Historial de Versiones \(3\)/)).toBeInTheDocument();

      // Check all 3 versions are rendered in table
      expect(screen.getByTestId('version-row-3')).toBeInTheDocument();
      expect(screen.getByTestId('version-row-2')).toBeInTheDocument();
      expect(screen.getByTestId('version-row-1')).toBeInTheDocument();

      // Check attributes for version 2
      const row2 = screen.getByTestId('version-row-2');
      expect(row2).toHaveTextContent('v2');
      expect(row2).toHaveTextContent('guia_kine_v2_revisada.pdf');
      expect(row2).toHaveTextContent('.pdf');
      expect(row2).toHaveTextContent('1.5 MB');
      expect(row2).toHaveTextContent('lic_mendoza');
    });

    it('orders versions deterministically in descending order (highest version number at top)', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      const rows = screen.getAllByTestId(/^version-row-\d+$/);
      expect(rows).toHaveLength(3);

      // Even though document.versions had [v2, v1, v3], table must sort [v3, v2, v1]
      expect(rows[0]).toHaveAttribute('data-testid', 'version-row-3');
      expect(rows[1]).toHaveAttribute('data-testid', 'version-row-2');
      expect(rows[2]).toHaveAttribute('data-testid', 'version-row-1');
    });

    it('clearly identifies the current version using the authoritative currentVersionId', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      // Version 3 is currentVersionId: must display "Actual" badge
      const row3 = screen.getByTestId('version-row-3');
      expect(row3).toContainElement(screen.getByTestId('current-version-badge'));

      // Version 2 and 1 must display "Histórico" badge
      expect(screen.getByTestId('historical-version-badge-2')).toBeInTheDocument();
      expect(screen.getByTestId('historical-version-badge-1')).toBeInTheDocument();
    });

    it('renders empty version history fallback when versions array is empty', async () => {
      mockedApi.getDocument.mockResolvedValueOnce({
        ...multiVersionDocument,
        versions: [],
      });

      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      expect(screen.getByTestId('empty-version-history')).toHaveTextContent(
        'No se encontraron versiones registradas para este documento.',
      );
    });
  });

  describe('2. Historical Version Metadata Inspection (VersionDetailModal)', () => {
    it('opens VersionDetailModal with full immutable metadata when clicking Detalles', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      const detailsBtnV2 = screen.getByTestId('version-details-2-button');
      expect(detailsBtnV2).toBeInTheDocument();

      fireEvent.click(detailsBtnV2);

      // Modal appears
      expect(await screen.findByTestId('version-detail-modal')).toBeInTheDocument();
      expect(screen.getByTestId('version-detail-modal-title')).toHaveTextContent('Versión v2');
      expect(screen.getByTestId('version-detail-historical-badge')).toHaveTextContent(
        'Versión Histórica',
      );

      // Inspect immutable technical fields
      expect(screen.getByTestId('version-detail-filename')).toHaveTextContent(
        'guia_kine_v2_revisada.pdf',
      );
      expect(screen.getByTestId('version-detail-mimetype')).toHaveTextContent('application/pdf');
      expect(screen.getByTestId('version-detail-filesize')).toHaveTextContent('1.5 MB');
      expect(screen.getByTestId('version-detail-uploaded-by')).toHaveTextContent('lic_mendoza');
      expect(screen.getByTestId('version-detail-id')).toHaveTextContent('ver_v2');
      expect(screen.getByTestId('version-detail-checksum')).toHaveTextContent(
        '2222222222222222222222222222222222222222222222222222222222222222',
      );
    });

    it('copies SHA-256 checksum to clipboard from VersionDetailModal', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      renderDetailPage();
      await screen.findByTestId('document-detail-title');

      fireEvent.click(screen.getByTestId('version-details-2-button'));
      await screen.findByTestId('version-detail-modal');

      const copyHashBtn = screen.getByTestId('copy-version-checksum-button');
      fireEvent.click(copyHashBtn);

      expect(writeTextMock).toHaveBeenCalledWith(
        '2222222222222222222222222222222222222222222222222222222222222222',
      );
    });
  });

  describe('3. Historical Version Preview & Download Access', () => {
    it('triggers authorized download for a specific historical version from the table', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      const downloadV2Btn = screen.getByTestId('download-version-2-button');
      fireEvent.click(downloadV2Btn);

      await waitFor(() => {
        expect(mockedApi.downloadDocument).toHaveBeenCalledWith('doc_versions_100', 'ver_v2');
      });
    });

    it('opens secure preview modal for a specific historical version', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      const previewV2Btn = screen.getByTestId('preview-version-2-button');
      fireEvent.click(previewV2Btn);

      await waitFor(() => {
        expect(screen.getByTestId('knowledge-document-preview-modal')).toBeInTheDocument();
      });

      expect(mockedApi.getPreviewMetadata).toHaveBeenCalledWith(
        'doc_versions_100',
        { versionId: 'ver_v2' },
        expect.any(Object),
      );
    });
  });

  describe('4. Version Comparison (VersionComparisonModal)', () => {
    it('displays the compare versions button when document has multiple versions', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      const compareBtn = screen.getByTestId('compare-versions-button');
      expect(compareBtn).toBeInTheDocument();

      fireEvent.click(compareBtn);

      expect(await screen.findByTestId('version-comparison-modal')).toBeInTheDocument();
      expect(screen.getByTestId('version-comparison-modal-title')).toHaveTextContent(
        'Comparación de Versiones de Metadatos',
      );

      // Default comparison is v3 vs v2
      expect(screen.getByTestId('comparison-row-version')).toHaveTextContent('v3');
      expect(screen.getByTestId('comparison-row-version')).toHaveTextContent('v2');

      // Check size delta (+512 KB)
      expect(screen.getByTestId('comparison-size-delta')).toHaveTextContent('+512 KB');

      // Check checksum comparison indicates modified content
      expect(screen.getByTestId('comparison-checksum-diff')).toHaveTextContent(
        'Contenido modificado',
      );
    });

    it('updates comparison dynamically when changing selected versions in dropdowns', async () => {
      renderDetailPage();

      await screen.findByTestId('document-detail-title');

      fireEvent.click(screen.getByTestId('compare-versions-button'));
      await screen.findByTestId('version-comparison-modal');

      const selectB = screen.getByTestId('version-b-select');
      // Change Version B from v2 to v1
      fireEvent.change(selectB, { target: { value: 'ver_v1' } });

      // Comparison row now reflects v3 vs v1 (diff is 2.0 MB vs 1.0 MB = +1.0 MB)
      expect(screen.getByTestId('comparison-row-version')).toHaveTextContent('v1');
      expect(screen.getByTestId('comparison-size-delta')).toHaveTextContent('+1 MB');
    });

    it('indicates identical binary when checksums match', () => {
      const versionA: DocumentVersionItem = { ...mockVersion1, id: 'ver_a', versionNumber: 2 };
      const versionB: DocumentVersionItem = { ...mockVersion1, id: 'ver_b', versionNumber: 1 };

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={ADMIN_USER}>
            <NotificationProvider>
              <VersionComparisonModal
                isOpen={true}
                onClose={jest.fn()}
                documentId="doc_1"
                documentTitle="Doc Test"
                versions={[versionA, versionB]}
                currentVersionId="ver_a"
              />
            </NotificationProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('comparison-checksum-match')).toHaveTextContent('Binario idéntico');
    });
  });

  describe('5. Upload New Version Action & Permissions', () => {
    it('shows the upload new version button for administrator users', async () => {
      renderDetailPage('doc_versions_100', ADMIN_USER);

      await screen.findByTestId('document-detail-title');

      const uploadVersionBtn = screen.getByTestId('upload-new-version-button');
      expect(uploadVersionBtn).toBeInTheDocument();

      fireEvent.click(uploadVersionBtn);

      // DocumentUploadModal opens in version mode
      expect(await screen.findByTestId('document-upload-modal')).toBeInTheDocument();
      expect(screen.getAllByText('Subir nueva versión').length).toBeGreaterThanOrEqual(1);
    });

    it('hides the upload new version button for operator users lacking management permissions', async () => {
      renderDetailPage('doc_versions_100', OPERATOR_USER);

      await screen.findByTestId('document-detail-title');

      expect(screen.queryByTestId('upload-new-version-button')).not.toBeInTheDocument();
    });

    it('hides the upload new version button when the document is soft-deleted', async () => {
      mockedApi.getDocument.mockResolvedValueOnce({
        ...multiVersionDocument,
        isDeleted: true,
        deletedAt: '2026-11-25T12:00:00.000Z',
      });

      renderDetailPage('doc_versions_100', ADMIN_USER);

      await screen.findByTestId('document-detail-title');

      expect(screen.queryByTestId('upload-new-version-button')).not.toBeInTheDocument();
    });
  });
});
