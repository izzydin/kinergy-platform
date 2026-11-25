import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { KnowledgePage } from '../routes/knowledge-page';
import { KnowledgeMetricCards } from '../components/knowledge-metric-cards';
import { RecentDocumentsList } from '../components/recent-documents-list';
import { IngestionStatusBadge } from '../components/ingestion-status-badge';
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
  },
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
    fileSize: 2048576,
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
    description: 'Normas de atención y derivación',
    visibilityScope: 'ALL_STAFF',
    currentVersionId: 'ver_2',
    uploadedBy: 'usr_admin_1',
    createdAt: '2026-11-21T14:30:00.000Z',
    updatedAt: '2026-11-21T14:30:00.000Z',
    originalFileName: 'manual-general.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileExtension: 'docx',
    fileSize: 524288,
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
    title: 'Ejercicios Lumbares',
    description: 'Pautas de fortalecimiento lumbar',
    visibilityScope: 'CLINICAL_STAFF',
    currentVersionId: 'ver_3',
    uploadedBy: 'usr_therapist_2',
    createdAt: '2026-11-22T09:15:00.000Z',
    updatedAt: '2026-11-22T09:15:00.000Z',
    originalFileName: 'lumbar-exercises.md',
    mimeType: 'text/markdown',
    fileExtension: 'md',
    fileSize: 12288,
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
  limit: 5,
  total: 3,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

function renderWithProviders(ui: React.ReactElement, user: AuthUser = ADMIN_USER) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider initialSessionOverride={user}>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Knowledge Center Overview (KC.03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getCapabilities.mockResolvedValue(mockCapabilities);
    mockedApi.listDocuments.mockResolvedValue(mockPaginatedResponse);
  });

  describe('1. Full Page Rendering & Route Integration', () => {
    it('renders Knowledge Center overview header, metrics, recent list, and architecture banner', async () => {
      renderWithProviders(<KnowledgePage />);

      expect(screen.getByTestId('intelligence-knowledge-page')).toBeInTheDocument();

      // Verify Header
      await waitFor(() => {
        expect(screen.getByText('Base de Conocimiento & Documentación')).toBeInTheDocument();
      });

      // Verify Administrative Action Buttons are visible for ADMIN
      expect(screen.getByTestId('knowledge-upload-button')).toBeInTheDocument();
      expect(screen.getByTestId('knowledge-browse-button')).toBeInTheDocument();

      // Verify Metrics loaded after TanStack query resolution
      await waitFor(() => {
        expect(screen.getByTestId('metric-total-documents')).toBeInTheDocument();
      });
      expect(screen.getByTestId('metric-total-documents')).toHaveTextContent('3');
      expect(screen.getByTestId('metric-indexed-documents')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-processing-documents')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-failed-documents')).toHaveTextContent('1');

      // Verify Recent Document Items
      expect(screen.getByText('Protocolo Cervical 2026')).toBeInTheDocument();
      expect(screen.getByText('Manual de Procedimientos')).toBeInTheDocument();
      expect(screen.getByText('Ejercicios Lumbares')).toBeInTheDocument();

      // Verify Architecture Banner
      expect(screen.getByTestId('knowledge-architecture-banner')).toBeInTheDocument();
      expect(screen.getByText('Pipeline de Ingesta & Recuperación RAG')).toBeInTheDocument();
    });

    it('hides administrative action buttons when user lacks required management role', async () => {
      renderWithProviders(<KnowledgePage />, RESTRICTED_USER);

      await waitFor(() => {
        expect(screen.getByText('Base de Conocimiento & Documentación')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('knowledge-upload-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('knowledge-browse-button')).not.toBeInTheDocument();
    });
  });

  describe('2. Ingestion Status Badges & Lifecycle Clarity', () => {
    it('renders distinctive labels, colors, and accessibility attributes for each ingestion state', () => {
      const { rerender } = render(<IngestionStatusBadge status="READY" />);
      expect(screen.getByTestId('ingestion-status-ready')).toHaveTextContent('Indexado');
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Estado de indexación: Indexado',
      );

      rerender(<IngestionStatusBadge status="PROCESSING" />);
      expect(screen.getByTestId('ingestion-status-processing')).toHaveTextContent('Procesando');

      rerender(<IngestionStatusBadge status="INDEXING" />);
      expect(screen.getByTestId('ingestion-status-indexing')).toHaveTextContent('Indexando');

      rerender(<IngestionStatusBadge status="VALIDATING" />);
      expect(screen.getByTestId('ingestion-status-validating')).toHaveTextContent('Validando');

      rerender(<IngestionStatusBadge status="UPLOADED" />);
      expect(screen.getByTestId('ingestion-status-uploaded')).toHaveTextContent('En cola');

      rerender(<IngestionStatusBadge status="FAILED" />);
      expect(screen.getByTestId('ingestion-status-failed')).toHaveTextContent('Error');

      rerender(<IngestionStatusBadge status="CANCELLED" />);
      expect(screen.getByTestId('ingestion-status-cancelled')).toHaveTextContent('Cancelado');
    });
  });

  describe('3. Metric Cards Component', () => {
    it('renders loading skeletons while queries are in-flight', () => {
      render(<KnowledgeMetricCards isLoading={true} />);
      expect(screen.getByTestId('knowledge-metric-cards-loading')).toBeInTheDocument();
    });

    it('accurately renders counts from verified documents without fabricating statistics', () => {
      render(
        <KnowledgeMetricCards
          totalDocuments={3}
          sampleDocuments={mockSampleDocuments}
          capabilities={mockCapabilities}
          isLoading={false}
        />,
      );

      expect(screen.getByTestId('metric-total-documents')).toHaveTextContent('3');
      expect(screen.getByTestId('metric-indexed-documents')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-processing-documents')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-failed-documents')).toHaveTextContent('1');
    });
  });

  describe('4. Recent Documents List Component', () => {
    it('renders empty state when library has zero documents', () => {
      const onUploadMock = jest.fn();
      render(<RecentDocumentsList documents={[]} isLoading={false} onUploadClick={onUploadMock} />);

      expect(screen.getByTestId('recent-documents-empty')).toBeInTheDocument();
      expect(screen.getByText('No hay documentos registrados')).toBeInTheDocument();

      const uploadBtn = screen.getByTestId('empty-upload-action');
      fireEvent.click(uploadBtn);
      expect(onUploadMock).toHaveBeenCalledTimes(1);
    });

    it('renders error state and triggers retry callback on click', () => {
      const onRetryMock = jest.fn();
      render(
        <RecentDocumentsList
          documents={[]}
          isLoading={false}
          isError={true}
          onRetry={onRetryMock}
        />,
      );

      expect(screen.getByTestId('recent-documents-error')).toBeInTheDocument();
      expect(screen.getByText('Error al cargar documentos recientes')).toBeInTheDocument();

      const retryBtn = screen.getByText('Reintentar');
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('renders document items with metadata and link to details page', () => {
      render(
        <MemoryRouter>
          <RecentDocumentsList documents={mockSampleDocuments} isLoading={false} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Protocolo Cervical 2026')).toBeInTheDocument();
      expect(screen.getByText('cervical-protocol.pdf')).toBeInTheDocument();
      expect(screen.getAllByText('v1')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Personal Clínico')[0]).toBeInTheDocument();

      const detailLinks = screen.getAllByRole('link', { name: /Ver detalles/i });
      expect(detailLinks[0]).toHaveAttribute('href', '/intelligence/knowledge/documents/doc_1');
    });
  });
});
