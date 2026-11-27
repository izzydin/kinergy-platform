import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeDocumentTable } from '../components/knowledge-document-table';
import {
  createMockKnowledgeDocument,
  resetFactoryCounters,
} from '../../../../test/factories/intelligence-test.factories';

// Mock AuthProvider to control user roles for deletion tests
const mockUseOptionalAuth = jest.fn();
jest.mock('../../../../app/providers/auth-provider', () => ({
  useOptionalAuth: () => mockUseOptionalAuth(),
}));

describe('AI-09.10-IT.03 — Knowledge Center Table Component Specification', () => {
  const defaultSort = { field: 'updatedAt' as const, desc: true };

  beforeEach(() => {
    resetFactoryCounters();
    jest.clearAllMocks();
    mockUseOptionalAuth.mockReturnValue({
      currentUser: { id: 'usr_admin', roles: ['ADMIN'] },
    });
  });

  const renderTable = (
    props: Partial<React.ComponentProps<typeof KnowledgeDocumentTable>> = {},
  ) => {
    return render(
      <MemoryRouter>
        <KnowledgeDocumentTable
          documents={[]}
          totalCount={0}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={defaultSort}
          onToggleSort={jest.fn()}
          {...props}
        />
      </MemoryRouter>,
    );
  };

  describe('1. Document Listing & Attribute Presentation', () => {
    it('renders document titles, formatted size, chunk counts, and MIME type icons', () => {
      const doc1 = createMockKnowledgeDocument({
        id: 'doc_clinical_01',
        title: 'Guía Clínica de Artroplastia de Cadera',
        originalFileName: 'artroplastia_cadera.pdf',
        mimeType: 'application/pdf',
        fileExtension: 'pdf',
        fileSize: 2097152, // 2.0 MB
        ingestionStatus: 'READY',
      });

      renderTable({
        documents: [doc1],
        totalCount: 1,
      });

      expect(screen.getByText('Guía Clínica de Artroplastia de Cadera')).toBeInTheDocument();
      expect(screen.getByText('2 MB')).toBeInTheDocument();
      expect(screen.getByLabelText('PDF')).toBeInTheDocument();
      expect(screen.getByText('Indexado')).toBeInTheDocument(); // IngestionStatusBadge READY label
    });

    it('renders Word and Markdown format icons properly based on mimeType/filename', () => {
      const docWord = createMockKnowledgeDocument({
        title: 'Protocolo Fisioterapia Word',
        originalFileName: 'protocolo.docx',
        fileExtension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const docMd = createMockKnowledgeDocument({
        title: 'Notas Clínicas Markdown',
        originalFileName: 'notas.md',
        fileExtension: 'md',
        mimeType: 'text/markdown',
      });

      renderTable({
        documents: [docWord, docMd],
        totalCount: 2,
      });

      expect(screen.getByLabelText('Word')).toBeInTheDocument();
      expect(screen.getByLabelText('Markdown')).toBeInTheDocument();
    });
  });

  describe('2. Ingestion Statuses & Action Triggers', () => {
    it('displays retry ingestion action exclusively for documents in FAILED status', () => {
      const onRetryIngestionMock = jest.fn();
      const readyDoc = createMockKnowledgeDocument({
        id: 'doc_ready',
        title: 'Documento Listo',
        ingestionStatus: 'READY',
      });
      const failedDoc = createMockKnowledgeDocument({
        id: 'doc_failed',
        title: 'Documento Fallido',
        ingestionStatus: 'FAILED',
      });

      renderTable({
        documents: [readyDoc, failedDoc],
        totalCount: 2,
        onRetryIngestion: onRetryIngestionMock,
      });

      // Ready doc should not have retry action
      expect(screen.queryByTestId('action-retry-doc_ready')).not.toBeInTheDocument();

      // Failed doc should display retry button
      const retryBtn = screen.getByTestId('action-retry-doc_failed');
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);
      expect(onRetryIngestionMock).toHaveBeenCalledWith(failedDoc);
    });

    it('dispatches onDownload callback when download action is clicked', () => {
      const onDownloadMock = jest.fn();
      const doc = createMockKnowledgeDocument({
        id: 'doc_dl',
        title: 'Documento para Descargar',
      });

      renderTable({
        documents: [doc],
        totalCount: 1,
        onDownload: onDownloadMock,
      });

      const downloadBtn = screen.getByTestId('action-download-doc_dl');
      fireEvent.click(downloadBtn);

      expect(onDownloadMock).toHaveBeenCalledWith(doc);
    });

    it('respects role-gating for deletion (visible for ADMIN, hidden for standard CLINICIAN)', () => {
      const onDeleteMock = jest.fn();
      const doc = createMockKnowledgeDocument({
        id: 'doc_del_role',
        title: 'Documento Privado',
      });

      // 1. With ADMIN role
      const { unmount } = renderTable({
        documents: [doc],
        totalCount: 1,
        onDelete: onDeleteMock,
      });
      expect(screen.getByTestId('action-delete-doc_del_role')).toBeInTheDocument();
      unmount();

      // 2. With CLINICAL_STAFF / non-admin role
      mockUseOptionalAuth.mockReturnValue({
        currentUser: { id: 'usr_staff', roles: ['CLINICAL_STAFF'] },
      });
      renderTable({
        documents: [doc],
        totalCount: 1,
        onDelete: onDeleteMock,
      });
      expect(screen.queryByTestId('action-delete-doc_del_role')).not.toBeInTheDocument();
    });
  });

  describe('3. Sorting and Column Header Interactions', () => {
    it('invokes onToggleSort when clicking sortable column headers', () => {
      const onToggleSortMock = jest.fn();
      const doc = createMockKnowledgeDocument({
        id: 'doc_sort_01',
        title: 'Documento Ordenable',
      });

      renderTable({
        documents: [doc],
        totalCount: 1,
        currentSort: { field: 'title', desc: false },
        onToggleSort: onToggleSortMock,
      });

      const titleHeader = screen.getByTestId('sort-title-header');
      fireEvent.click(titleHeader);

      expect(onToggleSortMock).toHaveBeenCalledWith('title');
    });
  });

  describe('4. Empty Library vs Filtered No-Results States', () => {
    it('shows empty library state with upload trigger when totalCount is 0 and no filters active', () => {
      const onUploadClickMock = jest.fn();

      renderTable({
        documents: [],
        totalCount: 0,
        isFiltered: false,
        searchTerm: '',
        onUploadClick: onUploadClickMock,
      });

      expect(screen.getByText('No hay documentos en la biblioteca')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Comienza subiendo el primer documento institucional para habilitar la búsqueda semántica y consultas RAG.',
        ),
      ).toBeInTheDocument();

      const uploadBtn = screen.getByTestId('empty-library-upload-button');
      expect(uploadBtn).toBeInTheDocument();

      fireEvent.click(uploadBtn);
      expect(onUploadClickMock).toHaveBeenCalledTimes(1);
    });

    it('shows filtered no-results state with reset filters button when isFiltered is true', () => {
      const onResetFiltersMock = jest.fn();

      renderTable({
        documents: [],
        totalCount: 0,
        isFiltered: true,
        searchTerm: 'Fibromialgia',
        onResetFilters: onResetFiltersMock,
      });

      expect(screen.getByText('No se encontraron documentos')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Ningún documento coincide con los criterios de búsqueda o filtros seleccionados.',
        ),
      ).toBeInTheDocument();

      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);
      expect(onResetFiltersMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Loading and Error Handling', () => {
    it('renders accessible error alert with retry button when isError is true', () => {
      const onRetryMock = jest.fn();

      renderTable({
        documents: [],
        totalCount: 0,
        isError: true,
        errorMessage: 'Fallo de conexión con el servicio de conocimiento.',
        onRetry: onRetryMock,
      });

      expect(
        screen.getByText('Fallo de conexión con el servicio de conocimiento.'),
      ).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });
  });
});
