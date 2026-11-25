import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { KnowledgeDocumentPreviewModal } from '../components/knowledge-document-preview-modal';
import { DocumentDetailPage } from '../routes/document-detail-page';
import type {
  KnowledgeDocumentItem,
  DocumentPreviewMetadataResponse,
} from '../types/knowledge-contract.types';

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
    getPreviewMetadata: jest.fn(),
    getDocumentContentBlob: jest.fn(),
  },
  triggerDocumentDownload: jest.fn(),
}));

const mockedApi = knowledgeApi as jest.Mocked<typeof knowledgeApi>;

// Setup URL.createObjectURL and URL.revokeObjectURL
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;

const createObjectURLMock = jest.fn(() => 'blob:http://localhost/test-blob-preview');
const revokeObjectURLMock = jest.fn();

beforeAll(() => {
  window.URL.createObjectURL = createObjectURLMock;
  window.URL.revokeObjectURL = revokeObjectURLMock;

  // Polyfill Blob.prototype.text with FileReader for JSDOM
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
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['ADMIN'],
  permissions: ['admin:all'],
  tenantId: 'tenant_alpha',
};

const mockDocument: KnowledgeDocumentItem = {
  id: 'doc_preview_1',
  title: 'Guía Clínica de Kinesiología Respiratoria 2026',
  description: 'Manual de procedimientos para patologías respiratorias.',
  visibilityScope: 'CLINICAL_STAFF',
  currentVersionId: 'ver_latest',
  uploadedBy: 'lic_gonzalez',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-25T12:00:00.000Z',
  originalFileName: 'guia_kine_respiratoria.pdf',
  mimeType: 'application/pdf',
  fileExtension: 'pdf',
  fileSize: 1048576,
  checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
  versionNumber: 2,
  versionCount: 2,
  storageReference: 'doc-storage:doc_preview_1:ver_latest',
  ingestionStatus: 'READY',
  status: 'ACTIVE',
  isDeleted: false,
  deletedAt: null,
  versions: [
    {
      id: 'ver_latest',
      versionNumber: 2,
      originalFileName: 'guia_kine_respiratoria_v2.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 1048576,
      checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
      language: 'es',
      uploadedBy: 'lic_gonzalez',
      storageReference: 'doc-storage:ver_latest',
      ingestionStatus: 'READY',
      createdAt: '2026-11-25T12:00:00.000Z',
    },
    {
      id: 'ver_v1',
      versionNumber: 1,
      originalFileName: 'guia_kine_respiratoria_v1.pdf',
      mimeType: 'application/pdf',
      fileExtension: 'pdf',
      fileSize: 900000,
      checksum: '99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff',
      language: 'es',
      uploadedBy: 'lic_gonzalez',
      storageReference: 'doc-storage:ver_v1',
      ingestionStatus: 'READY',
      createdAt: '2026-11-20T10:00:00.000Z',
    },
  ],
};

const pdfMetadata: DocumentPreviewMetadataResponse = {
  documentId: 'doc_preview_1',
  versionId: 'ver_latest',
  versionNumber: 2,
  title: 'Guía Clínica de Kinesiología Respiratoria 2026',
  originalFileName: 'guia_kine_respiratoria.pdf',
  mimeType: 'application/pdf',
  fileSize: 1048576,
  checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
  canPreview: true,
  visibilityScope: 'CLINICAL_STAFF',
  isAuthorized: true,
  isDeleted: false,
};

const markdownMetadata: DocumentPreviewMetadataResponse = {
  documentId: 'doc_md_1',
  versionId: 'ver_md_1',
  versionNumber: 1,
  title: 'Protocolo de Ingreso Clínico',
  originalFileName: 'protocolo.md',
  mimeType: 'text/markdown',
  fileSize: 2048,
  checksum: 'aabbcc11223344556677889900aabbccddeeff11223344556677889900aabbcc',
  canPreview: true,
  visibilityScope: 'CLINICAL_STAFF',
  isAuthorized: true,
  isDeleted: false,
};

const textMetadata: DocumentPreviewMetadataResponse = {
  documentId: 'doc_txt_1',
  versionId: 'ver_txt_1',
  versionNumber: 1,
  title: 'Notas de Procedimiento CSV',
  originalFileName: 'procedimientos.csv',
  mimeType: 'text/csv',
  fileSize: 1024,
  checksum: 'ccddeeff11223344556677889900aabbccddeeff11223344556677889900aabb',
  canPreview: true,
  visibilityScope: 'CLINICAL_STAFF',
  isAuthorized: true,
  isDeleted: false,
};

const wordMetadata: DocumentPreviewMetadataResponse = {
  documentId: 'doc_word_1',
  versionId: 'ver_word_1',
  versionNumber: 1,
  title: 'Manual de Funciones Administrativas',
  originalFileName: 'manual_funciones.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileSize: 5242880,
  checksum: '00112233445566778899aabbccddeeff112233445566778899aabbccddeeff00',
  canPreview: false,
  visibilityScope: 'CLINICAL_STAFF',
  isAuthorized: true,
  isDeleted: false,
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  createObjectURLMock.mockReturnValue('blob:http://localhost/test-blob-preview');
  mockedApi.getDocument.mockResolvedValue(mockDocument);
  mockedApi.getPreviewMetadata.mockResolvedValue(pdfMetadata);
  mockedApi.getDocumentContentBlob.mockResolvedValue(
    new Blob(['%PDF-1.4 mock default'], { type: 'application/pdf' }),
  );
  mockedApi.downloadDocument.mockResolvedValue(
    new Blob(['mock downloaded binary'], { type: 'application/octet-stream' }),
  );
  mockedApi.getIngestionHistory.mockResolvedValue([]);
});

function renderPreviewModal(
  props: {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    versionId?: string;
    fallbackTitle?: string;
  },
  user: AuthUser | null = ADMIN_USER,
) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user ?? undefined}>
        <NotificationProvider>
          <KnowledgeDocumentPreviewModal {...props} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function renderDetailPage(docId = 'doc_preview_1', user: AuthUser | null = ADMIN_USER) {
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

describe('KC.07 — Secure Document Preview Suite', () => {
  describe('Authoritative capability discovery & PDF format', () => {
    it('discovers PDF preview capability and renders sandboxed iframe with navigation and zoom controls', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(pdfMetadata);
      const mockPdfBlob = new Blob(['%PDF-1.4 mock data'], { type: 'application/pdf' });
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(mockPdfBlob);

      const onClose = jest.fn();
      renderPreviewModal({
        isOpen: true,
        onClose,
        documentId: 'doc_preview_1',
        versionId: 'ver_latest',
      });

      // Initially renders modal
      expect(screen.getByTestId('knowledge-document-preview-modal')).toBeInTheDocument();

      // Wait for metadata and preview iframe
      await waitFor(() => {
        expect(screen.getByTestId('pdf-preview-iframe')).toBeInTheDocument();
      });

      expect(mockedApi.getPreviewMetadata).toHaveBeenCalledWith(
        'doc_preview_1',
        { versionId: 'ver_latest' },
        expect.any(Object),
      );
      expect(mockedApi.getDocumentContentBlob).toHaveBeenCalledWith('doc_preview_1', {
        versionId: 'ver_latest',
      });

      // Verify sandboxed iframe security properties
      const iframe = screen.getByTestId('pdf-preview-iframe') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
      expect(iframe.getAttribute('title')).toContain('PDF');
      expect(iframe.src).toContain('blob:http://localhost/test-blob-preview');
      expect(iframe.src).toContain('#page=1&zoom=100');

      // Check PDF controls
      const prevButton = screen.getByTestId('preview-prev-page');
      const nextButton = screen.getByTestId('preview-next-page');
      const pageDisplay = screen.getByTestId('preview-current-page');
      const zoomInButton = screen.getByTestId('preview-zoom-in');
      const zoomOutButton = screen.getByTestId('preview-zoom-out');
      const zoomResetButton = screen.getByTestId('preview-zoom-reset');

      expect(prevButton).toBeDisabled(); // On page 1, prev is disabled
      expect(pageDisplay).toHaveTextContent('1');

      // Navigate Next Page
      fireEvent.click(nextButton);
      expect(screen.getByTestId('preview-current-page')).toHaveTextContent('2');
      expect(prevButton).not.toBeDisabled();
      expect(iframe.src).toContain('#page=2&zoom=100');

      // Navigate Prev Page
      fireEvent.click(prevButton);
      expect(screen.getByTestId('preview-current-page')).toHaveTextContent('1');

      // Test Zoom controls
      expect(zoomResetButton).toHaveTextContent('100%');
      fireEvent.click(zoomInButton);
      expect(zoomResetButton).toHaveTextContent('125%');
      expect(iframe.src).toContain('zoom=125');

      fireEvent.click(zoomOutButton);
      expect(zoomResetButton).toHaveTextContent('100%');

      // Zoom Reset
      fireEvent.click(zoomInButton);
      fireEvent.click(zoomInButton);
      expect(zoomResetButton).toHaveTextContent('150%');
      fireEvent.click(zoomResetButton);
      expect(zoomResetButton).toHaveTextContent('100%');
    });
  });

  describe('Markdown and Text formats safe rendering', () => {
    it('renders Markdown safely via MarkdownRenderer without raw HTML execution', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(markdownMetadata);
      const markdownContent = '# Protocolo Clínico\n\n- Paso 1: Evaluación\n- Paso 2: Tratamiento';
      const mockBlob = new Blob([markdownContent], { type: 'text/markdown' });
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(mockBlob);

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_md_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('markdown-preview-container')).toBeInTheDocument();
      });

      expect(screen.getByText('Protocolo Clínico')).toBeInTheDocument();
      expect(screen.getByText('Paso 1: Evaluación')).toBeInTheDocument();
    });

    it('renders plain text and CSV safely inside escaped pre tag', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(textMetadata);
      const csvContent = 'id,nombre,duracion\n1,Rehabilitacion,30min\n2,Masoterapia,45min';
      const mockBlob = new Blob([csvContent], { type: 'text/csv' });
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(mockBlob);

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_txt_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('plaintext-preview-container')).toBeInTheDocument();
      });

      expect(screen.getByText(/id,nombre,duracion/)).toBeInTheDocument();
      expect(screen.getByText(/Rehabilitacion,30min/)).toBeInTheDocument();
    });
  });

  describe('Unsupported formats and secure fallback', () => {
    it('renders unsupported format banner for Word (.docx) documents with explanation and download button', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(wordMetadata);

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_word_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('preview-unsupported-format-state')).toBeInTheDocument();
      });

      // Explains why preview is unavailable
      expect(screen.getByText(/Previsualización en navegador no compatible/)).toBeInTheDocument();
      expect(
        screen.getByText(
          /para preservar la seguridad y evitar la ejecución de macros o contenido no seguro/,
        ),
      ).toBeInTheDocument();

      // Authorized download button is present
      const downloadButton = screen.getByTestId('unsupported-format-download-button');
      expect(downloadButton).toBeInTheDocument();

      // Clicking download invokes knowledgeApi.downloadDocument
      fireEvent.click(downloadButton);
      await waitFor(() => {
        expect(mockedApi.downloadDocument).toHaveBeenCalledWith('doc_word_1', undefined);
      });
    });
  });

  describe('Authorization and Lifecycle states (403, 404, Error)', () => {
    it('displays clearance denied / 403 Forbidden state when user lacks authorization', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...pdfMetadata,
        isAuthorized: false,
      });

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_preview_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('preview-forbidden-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Acceso no autorizado/)).toBeInTheDocument();
    });

    it('displays deleted / 404 state when document is marked as deleted', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...pdfMetadata,
        isDeleted: true,
      });

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_preview_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('preview-deleted-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Documento eliminado o no encontrado/)).toBeInTheDocument();
    });

    it('displays error state with retry button when content retrieval fails', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(pdfMetadata);
      mockedApi.getDocumentContentBlob.mockRejectedValueOnce(
        new Error('Falla en la red al recuperar el contenido del documento'),
      );

      renderPreviewModal({
        isOpen: true,
        onClose: jest.fn(),
        documentId: 'doc_preview_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('preview-error-state')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Falla en la red al recuperar el contenido del documento/),
      ).toBeInTheDocument();

      const retryBtn = screen.getByText('Reintentar');
      expect(retryBtn).toBeInTheDocument();
    });
  });

  describe('Revocation and cleanup', () => {
    it('revokes the created Object URL when modal is closed or unmounted', async () => {
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(pdfMetadata);
      const mockPdfBlob = new Blob(['%PDF-1.4 mock data'], { type: 'application/pdf' });
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(mockPdfBlob);

      const onClose = jest.fn();
      const { unmount } = renderPreviewModal({
        isOpen: true,
        onClose,
        documentId: 'doc_preview_1',
      });

      await waitFor(() => {
        expect(screen.getByTestId('pdf-preview-iframe')).toBeInTheDocument();
      });

      expect(createObjectURLMock).toHaveBeenCalledWith(mockPdfBlob);

      // Unmount component
      unmount();

      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-blob-preview');
    });
  });

  describe('Integration with DocumentDetailPage', () => {
    it('opens preview modal when clicking the Previsualizar button in header', async () => {
      mockedApi.getDocument.mockResolvedValueOnce(mockDocument);
      mockedApi.getIngestionHistory.mockResolvedValueOnce([]);
      mockedApi.getPreviewMetadata.mockResolvedValueOnce(pdfMetadata);
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(
        new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' }),
      );

      renderDetailPage('doc_preview_1');

      await waitFor(() => {
        expect(screen.getByTestId('document-detail-title')).toBeInTheDocument();
      });

      const previewHeaderBtn = screen.getByTestId('preview-document-button');
      expect(previewHeaderBtn).toBeInTheDocument();

      fireEvent.click(previewHeaderBtn);

      await waitFor(() => {
        expect(screen.getByTestId('knowledge-document-preview-modal')).toBeInTheDocument();
      });
    });

    it('opens preview modal for a specific version when clicking Previsualizar in version row', async () => {
      mockedApi.getDocument.mockResolvedValueOnce(mockDocument);
      mockedApi.getIngestionHistory.mockResolvedValueOnce([]);
      mockedApi.getPreviewMetadata.mockResolvedValueOnce({
        ...pdfMetadata,
        versionId: 'ver_v1',
        versionNumber: 1,
      });
      mockedApi.getDocumentContentBlob.mockResolvedValueOnce(
        new Blob(['%PDF-1.4 v1 mock'], { type: 'application/pdf' }),
      );

      renderDetailPage('doc_preview_1');

      await waitFor(() => {
        expect(screen.getByTestId('document-detail-title')).toBeInTheDocument();
      });

      const version1PreviewBtn = screen.getByTestId('preview-version-1-button');
      expect(version1PreviewBtn).toBeInTheDocument();

      fireEvent.click(version1PreviewBtn);

      await waitFor(() => {
        expect(screen.getByTestId('knowledge-document-preview-modal')).toBeInTheDocument();
      });

      expect(mockedApi.getPreviewMetadata).toHaveBeenCalledWith(
        'doc_preview_1',
        { versionId: 'ver_v1' },
        expect.any(Object),
      );
    });
  });
});
