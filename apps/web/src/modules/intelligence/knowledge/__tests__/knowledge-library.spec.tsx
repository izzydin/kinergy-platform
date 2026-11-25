import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { KnowledgePage } from '../routes/knowledge-page';
import type {
  KnowledgeDocumentItem,
  PaginatedDocumentsResponse,
  KnowledgeCapabilitiesResponse,
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
  roles: ['ADMIN'],
  permissions: ['admin:all'],
  tenantId: 'tenant_alpha',
};

const RESTRICTED_USER: AuthUser = {
  id: 'usr_op_1',
  email: 'op@kinergy.io',
  name: 'Operator User',
  roles: ['OPERATOR'],
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

const mockSampleDocuments: KnowledgeDocumentItem[] = [
  {
    id: 'doc_1',
    title: 'Protocolo Cervical 2026',
    description: 'Guía de tratamiento para columna cervical',
    visibilityScope: 'CLINICAL_STAFF',
    currentVersionId: 'ver_1',
    uploadedBy: 'usr_therapist_1',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    originalFileName: 'cervical-protocol.pdf',
    mimeType: 'application/pdf',
    fileExtension: 'pdf',
    fileSize: 2097152, // 2 MB
    checksum: 'a'.repeat(64),
    versionNumber: 1,
    versionCount: 1,
    storageReference: 'doc-storage:doc_1:ver_1',
    ingestionStatus: 'READY',
    status: 'ACTIVE',
    isDeleted: false,
    versions: [],
  },
  {
    id: 'doc_2',
    title: 'Manual de Procedimientos',
    description: 'Protocolos operativos para kinesiología',
    visibilityScope: 'ALL_STAFF',
    currentVersionId: 'ver_2',
    uploadedBy: 'usr_admin_1',
    createdAt: '2026-11-21T14:30:00.000Z',
    updatedAt: '2026-11-21T14:30:00.000Z',
    originalFileName: 'procedimientos-kine.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileExtension: 'docx',
    fileSize: 1048576, // 1 MB
    checksum: 'b'.repeat(64),
    versionNumber: 2,
    versionCount: 2,
    storageReference: 'doc-storage:doc_2:ver_2',
    ingestionStatus: 'PROCESSING',
    status: 'ACTIVE',
    isDeleted: false,
    versions: [],
  },
  {
    id: 'doc_3',
    title: 'Guía de Ejercicios Lumbares',
    description: 'Pautas para rehabilitación lumbar activa',
    visibilityScope: 'MANAGEMENT',
    currentVersionId: 'ver_3',
    uploadedBy: 'usr_manager_1',
    createdAt: '2026-11-22T08:15:00.000Z',
    updatedAt: '2026-11-22T08:15:00.000Z',
    originalFileName: 'lumbar-exercises.md',
    mimeType: 'text/markdown',
    fileExtension: 'md',
    fileSize: 51200, // 50 KB
    checksum: 'c'.repeat(64),
    versionNumber: 1,
    versionCount: 1,
    storageReference: 'doc-storage:doc_3:ver_3',
    ingestionStatus: 'FAILED',
    status: 'ACTIVE',
    isDeleted: false,
    versions: [],
  },
];

const mockPaginatedResponse: PaginatedDocumentsResponse = {
  items: mockSampleDocuments,
  page: 1,
  limit: 20,
  total: 3,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

function renderWithProviders(
  ui: React.ReactElement,
  {
    initialEntries = ['/intelligence/knowledge?view=library'],
    user = ADMIN_USER,
  }: {
    initialEntries?: string[];
    user?: AuthUser;
  } = {},
) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider initialSessionOverride={user}>
          <NotificationProvider>
            <Routes>
              <Route path="/intelligence/knowledge" element={ui} />
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<div>Detalle del documento</div>}
              />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Knowledge Center Document Library (KC.04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getCapabilities.mockResolvedValue(mockCapabilities);
    mockedApi.listDocuments.mockResolvedValue(mockPaginatedResponse);
    mockedApi.deleteDocument.mockResolvedValue(undefined);
    mockedApi.retryIngestion.mockResolvedValue({
      id: 'job_retry_1',
      documentId: 'doc_3',
      documentVersionId: 'ver_3',
      status: 'INDEXING',
      attemptCount: 2,
      maxAttempts: 3,
      createdAt: '2026-11-25T12:00:00.000Z',
    });
  });

  describe('1. Document Listing & Metadata Rendering', () => {
    it('renders real documents returned by the backend with metadata, format badges, and action controls', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      // Verify Library View container is active
      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();
      expect(screen.getByTestId('knowledge-document-table-container')).toBeInTheDocument();

      // Verify Document Items after TanStack query loads
      expect(await screen.findByText('Protocolo Cervical 2026')).toBeInTheDocument();
      expect(screen.getByText('cervical-protocol.pdf')).toBeInTheDocument();
      expect(screen.getByText('Manual de Procedimientos')).toBeInTheDocument();
      expect(screen.getByText('Guía de Ejercicios Lumbares')).toBeInTheDocument();

      // Verify Visibility Badges
      expect(screen.getAllByText('Personal Clínico').length).toBeGreaterThan(0);
      expect(screen.getAllByText('General').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Dirección').length).toBeGreaterThan(0);

      // Verify Ingestion Status Badges
      expect(screen.getByTestId('ingestion-status-ready')).toHaveTextContent('Indexado');
      expect(screen.getByTestId('ingestion-status-processing')).toHaveTextContent('Procesando');
      expect(screen.getByTestId('ingestion-status-failed')).toHaveTextContent('Error');

      // Verify Action buttons
      expect(screen.getByTestId('action-view-doc_1')).toBeInTheDocument();
      expect(screen.getByTestId('action-download-doc_1')).toBeInTheDocument();
      expect(screen.getByTestId('action-delete-doc_1')).toBeInTheDocument();

      // Verify Retry Ingestion action appears only for failed doc_3
      expect(screen.queryByTestId('action-retry-doc_1')).not.toBeInTheDocument();
      expect(screen.getByTestId('action-retry-doc_3')).toBeInTheDocument();
    });

    it('navigates between Overview and Library tabs seamlessly', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge'],
      });

      // Initially in Overview
      expect(await screen.findByTestId('knowledge-overview-view')).toBeInTheDocument();

      // Click on Library tab
      const libraryTab = screen.getByTestId('tab-knowledge-library');
      fireEvent.click(libraryTab);

      // Now Library view is rendered
      expect(await screen.findByTestId('knowledge-library-view')).toBeInTheDocument();

      // Click on Overview tab to switch back
      const overviewTab = screen.getByTestId('tab-knowledge-overview');
      fireEvent.click(overviewTab);

      expect(await screen.findByTestId('knowledge-overview-view')).toBeInTheDocument();
    });
  });

  describe('2. Server-side Pagination & Range Metrics', () => {
    it('calls backend with page and limit parameters and displays accurate result range', async () => {
      const mockMultiPageResponse: PaginatedDocumentsResponse = {
        items: mockSampleDocuments.slice(0, 2),
        page: 1,
        limit: 10,
        total: 50,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: false,
      };
      mockedApi.listDocuments.mockResolvedValue(mockMultiPageResponse);

      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&limit=10'],
      });

      expect(await screen.findByText('Protocolo Cervical 2026')).toBeInTheDocument();

      // Verify range metric text (DataTablePagination)
      expect(screen.getByText(/showing|mostrando/i)).toBeInTheDocument();
      expect(screen.getAllByText('50')[0]).toBeInTheDocument(); // totalCount

      // Verify next button is enabled
      const nextButton = screen.getByRole('button', { name: /Go to next page/i });
      expect(nextButton).not.toBeDisabled();

      // Click next page
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2 }),
          expect.anything(),
        );
      });
    });

    it('changes page size and resets to page 1', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&page=3&limit=20'],
      });

      expect(await screen.findByText('Protocolo Cervical 2026')).toBeInTheDocument();

      const pageSizeSelect = screen.getByLabelText(/Select number of rows per page/i);
      fireEvent.change(pageSizeSelect, { target: { value: '50' } });

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 50, page: 1 }),
          expect.anything(),
        );
      });
    });
  });

  describe('3. Search with Debounce & Input Clearing', () => {
    it('debounces search input and calls backend with search parameter', async () => {
      jest.useFakeTimers();

      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('library-search-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('library-search-input');
      fireEvent.change(searchInput, { target: { value: 'cervical' } });

      // Fast-forward debounce timer (300ms)
      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'cervical' }),
          expect.anything(),
        );
      });

      jest.useRealTimers();
    });

    it('clears search input via clear button and resets search parameter', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&q=cervical'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('clear-search-button')).toBeInTheDocument();
      });

      const clearBtn = screen.getByTestId('clear-search-button');
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ search: undefined }),
          expect.anything(),
        );
      });
    });
  });

  describe('4. Server-Side Filtering (Visibility Scope & MIME Type)', () => {
    it('filters by visibility scope and passes parameter to backend', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('filter-visibility-scope')).toBeInTheDocument();
      });

      const scopeSelect = screen.getByTestId('filter-visibility-scope');
      fireEvent.change(scopeSelect, { target: { value: 'CLINICAL_STAFF' } });

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ visibilityScope: 'CLINICAL_STAFF', page: 1 }),
          expect.anything(),
        );
      });
    });

    it('filters by MIME type and passes parameter to backend', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('filter-mime-type')).toBeInTheDocument();
      });

      const mimeSelect = screen.getByTestId('filter-mime-type');
      fireEvent.change(mimeSelect, { target: { value: 'application/pdf' } });

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ mimeType: 'application/pdf', page: 1 }),
          expect.anything(),
        );
      });
    });

    it('displays reset filters button when filtered and clears all active filters on click', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: [
          '/intelligence/knowledge?view=library&visibilityScope=CLINICAL_STAFF&mimeType=application/pdf',
        ],
      });

      await waitFor(() => {
        expect(screen.getByTestId('reset-filters-button')).toBeInTheDocument();
      });

      const resetBtn = screen.getByTestId('reset-filters-button');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({
            visibilityScope: undefined,
            mimeType: undefined,
            page: 1,
          }),
          expect.anything(),
        );
      });
    });
  });

  describe('5. Sorting Controls', () => {
    it('toggles sort order by title and calls backend with orderBy and orderDirection', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&sort=title.asc'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('sort-title-header')).toBeInTheDocument();
      });

      const titleSortBtn = screen.getByTestId('sort-title-header');
      fireEvent.click(titleSortBtn);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: 'title', orderDirection: 'desc' }),
          expect.anything(),
        );
      });
    });

    it('toggles sort order by createdAt and calls backend with orderBy and orderDirection', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&sort=createdAt.desc'],
      });

      await waitFor(() => {
        expect(screen.getByTestId('sort-created-at-header')).toBeInTheDocument();
      });

      const dateSortBtn = screen.getByTestId('sort-created-at-header');
      fireEvent.click(dateSortBtn);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: 'createdAt', orderDirection: 'asc' }),
          expect.anything(),
        );
      });
    });
  });

  describe('6. URL State Restoration & Direct-Link Hydration', () => {
    it('restores state from deep-link URL parameters on mount without losing criteria', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: [
          '/intelligence/knowledge?view=library&q=protocolo&page=2&limit=50&visibilityScope=CLINICAL_STAFF&mimeType=application/pdf&sort=title.asc',
        ],
      });

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'protocolo',
            page: 2,
            limit: 50,
            visibilityScope: 'CLINICAL_STAFF',
            mimeType: 'application/pdf',
            orderBy: 'title',
            orderDirection: 'asc',
          }),
          expect.anything(),
        );
      });

      // Verify inputs reflect URL state
      expect(screen.getByTestId('library-search-input')).toHaveValue('protocolo');
      expect(screen.getByTestId('filter-visibility-scope')).toHaveValue('CLINICAL_STAFF');
      expect(screen.getByTestId('filter-mime-type')).toHaveValue('application/pdf');
    });
  });

  describe('7. UX States: Empty Results & API Errors', () => {
    it('renders empty library state with upload CTA when repository has 0 documents', async () => {
      mockedApi.listDocuments.mockResolvedValue({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      await waitFor(() => {
        expect(screen.getByText('No hay documentos en la biblioteca')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Comienza subiendo el primer documento institucional/i),
      ).toBeInTheDocument();
    });

    it('renders filtered empty state with reset filters button when search yields no matches', async () => {
      mockedApi.listDocuments.mockResolvedValue({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library&q=inexistente'],
      });

      await waitFor(() => {
        expect(screen.getByText('No se encontraron documentos')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Ningún documento coincide con los criterios de búsqueda/i),
      ).toBeInTheDocument();
    });

    it('renders error state and triggers refetch on retry click', async () => {
      mockedApi.listDocuments.mockRejectedValue(new Error('Network connection failure'));

      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
      });

      expect(await screen.findByText(/Network connection failure/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Retry|Reintentar/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockedApi.listDocuments).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('8. Actions & Permission-Aware Controls', () => {
    it('hides delete action for restricted Operator role', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
        user: RESTRICTED_USER,
      });

      await waitFor(() => {
        expect(screen.getByText('Protocolo Cervical 2026')).toBeInTheDocument();
      });

      // View details and download are visible, but delete is hidden
      expect(screen.getByTestId('action-view-doc_1')).toBeInTheDocument();
      expect(screen.getByTestId('action-download-doc_1')).toBeInTheDocument();
      expect(screen.queryByTestId('action-delete-doc_1')).not.toBeInTheDocument();
    });

    it('opens confirmation modal and triggers delete mutation for authorized Admin', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
        user: ADMIN_USER,
      });

      await waitFor(() => {
        expect(screen.getByTestId('action-delete-doc_1')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByTestId('action-delete-doc_1');
      fireEvent.click(deleteBtn);

      // Verify Delete Modal opens
      expect(await screen.findByTestId('delete-document-modal')).toBeInTheDocument();
      expect(screen.getByText(/Confirmar eliminación/i)).toBeInTheDocument();

      // Click Confirm Delete
      const confirmBtn = screen.getByTestId('confirm-delete-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockedApi.deleteDocument).toHaveBeenCalledWith('doc_1');
      });
    });

    it('triggers retry ingestion mutation when clicking retry on a failed document', async () => {
      renderWithProviders(<KnowledgePage />, {
        initialEntries: ['/intelligence/knowledge?view=library'],
        user: ADMIN_USER,
      });

      await waitFor(() => {
        expect(screen.getByTestId('action-retry-doc_3')).toBeInTheDocument();
      });

      const retryBtn = screen.getByTestId('action-retry-doc_3');
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockedApi.retryIngestion).toHaveBeenCalledWith('doc_3');
      });
    });
  });
});
