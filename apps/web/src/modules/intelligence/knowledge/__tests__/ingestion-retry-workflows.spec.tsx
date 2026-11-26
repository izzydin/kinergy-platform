import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentRetryDialog } from '../components/document-retry-dialog';
import { VersionDetailModal } from '../components/version-detail-modal';
import { knowledgeApi } from '../api/knowledge.api';
import type { IngestionJobItem, DocumentVersionItem } from '../types/knowledge-contract.types';

jest.mock('../api/knowledge.api', () => ({
  knowledgeApi: {
    retryIngestion: jest.fn(),
    retryVersionIngestion: jest.fn(),
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

function renderWithClient(ui: React.ReactElement, queryClient = createTestQueryClient()) {
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}

describe('IM.07 — Ingestion Retry & Recovery Workflows', () => {
  const mockFailedJob: IngestionJobItem = {
    id: 'job_failed_001',
    documentId: 'doc_123',
    documentVersionId: 'ver_02',
    versionNumber: 2,
    status: 'FAILED',
    attemptCount: 2,
    maxAttempts: 3,
    startedAt: '2026-11-26T10:30:00.000Z',
    completedAt: '2026-11-26T10:30:05.000Z',
    durationMs: 5000,
    isTerminal: false,
    canRetry: true,
    lastErrorCode: 'STORAGE_TIMEOUT',
    lastErrorMessage: 'Conexión con el servicio de almacenamiento agotó el tiempo de espera.',
    createdAt: '2026-11-26T10:30:00.000Z',
  };

  const mockFailedVersion: DocumentVersionItem = {
    id: 'ver_02',
    versionNumber: 2,
    originalFileName: 'guia-operativa-v2.pdf',
    mimeType: 'application/pdf',
    fileSize: 204800,
    checksum: 'a1b2c3d4e5f6',
    ingestionStatus: 'FAILED',
    uploadedBy: 'usr_admin',
    createdAt: '2026-11-26T10:00:00.000Z',
  };

  const mockReadyVersion: DocumentVersionItem = {
    id: 'ver_01',
    versionNumber: 1,
    originalFileName: 'guia-operativa-v1.pdf',
    mimeType: 'application/pdf',
    fileSize: 153600,
    checksum: 'f6e5d4c3b2a1',
    ingestionStatus: 'READY',
    uploadedBy: 'usr_admin',
    createdAt: '2026-11-25T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. DocumentRetryDialog Rendering & Projection
  // =========================================================================
  describe('DocumentRetryDialog component', () => {
    it('renders dialog with document title, version, and attempt progression', () => {
      renderWithClient(
        <DocumentRetryDialog
          isOpen={true}
          onClose={jest.fn()}
          document={{ id: 'doc_123', title: 'Manual de Procedimientos', currentVersionNumber: 2 }}
          job={mockFailedJob}
        />,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirmar Reintento de Ingesta')).toBeInTheDocument();
      expect(screen.getByText('Manual de Procedimientos')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('#3 de 3')).toBeInTheDocument();
      expect(screen.getByText('STORAGE_TIMEOUT')).toBeInTheDocument();
      expect(screen.getByText(/Conexión con el servicio de almacenamiento/)).toBeInTheDocument();
      expect(
        screen.getByText('Los vectores e índices existentes se preservan durante el reintento'),
      ).toBeInTheDocument();
    });

    it('submits retry for entire document when no targetVersionId is provided', async () => {
      mockedApi.retryIngestion.mockResolvedValueOnce({
        id: 'job_failed_001',
        status: 'VALIDATING',
        attemptCount: 3,
        maxAttempts: 3,
        canRetry: false,
      } as unknown as IngestionJobItem);

      const onClose = jest.fn();
      const onRetried = jest.fn();

      renderWithClient(
        <DocumentRetryDialog
          isOpen={true}
          onClose={onClose}
          onRetried={onRetried}
          document={{ id: 'doc_123', title: 'Manual de Procedimientos' }}
          job={mockFailedJob}
        />,
      );

      const confirmButton = screen.getByTestId('confirm-retry-document-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockedApi.retryIngestion).toHaveBeenCalledWith('doc_123');
        expect(onClose).toHaveBeenCalled();
        expect(onRetried).toHaveBeenCalled();
      });
    });

    it('submits retry for specific version when targetVersionId is provided', async () => {
      mockedApi.retryVersionIngestion.mockResolvedValueOnce({
        id: 'job_failed_001',
        status: 'VALIDATING',
        attemptCount: 3,
        maxAttempts: 3,
        canRetry: false,
      } as unknown as IngestionJobItem);

      const onClose = jest.fn();
      const onRetried = jest.fn();

      renderWithClient(
        <DocumentRetryDialog
          isOpen={true}
          onClose={onClose}
          onRetried={onRetried}
          document={{ id: 'doc_123', title: 'Manual de Procedimientos' }}
          job={mockFailedJob}
          targetVersionId="ver_02"
        />,
      );

      const confirmButton = screen.getByTestId('confirm-retry-document-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockedApi.retryVersionIngestion).toHaveBeenCalledWith('doc_123', 'ver_02');
        expect(onClose).toHaveBeenCalled();
        expect(onRetried).toHaveBeenCalled();
      });
    });

    it('prevents multiple simultaneous submissions while retry is pending', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockedApi.retryIngestion.mockReturnValueOnce(
        pendingPromise as unknown as Promise<IngestionJobItem>,
      );

      renderWithClient(
        <DocumentRetryDialog
          isOpen={true}
          onClose={jest.fn()}
          document={{ id: 'doc_123', title: 'Manual de Procedimientos' }}
          job={mockFailedJob}
        />,
      );

      const confirmButton = screen.getByTestId('confirm-retry-document-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Solicitando reintento...')).toBeInTheDocument();
        expect(confirmButton).toBeDisabled();
        expect(screen.getByTestId('cancel-retry-document-button')).toBeDisabled();
      });

      // Second click should be ignored
      fireEvent.click(confirmButton);
      expect(mockedApi.retryIngestion).toHaveBeenCalledTimes(1);

      resolvePromise!({ id: 'job_1', status: 'VALIDATING' });
    });

    it('handles retry rejection gracefully without crashing', async () => {
      mockedApi.retryIngestion.mockRejectedValueOnce(new Error('Terminal status reached'));

      const onClose = jest.fn();

      renderWithClient(
        <DocumentRetryDialog
          isOpen={true}
          onClose={onClose}
          document={{ id: 'doc_123', title: 'Manual de Procedimientos' }}
          job={mockFailedJob}
        />,
      );

      const confirmButton = screen.getByTestId('confirm-retry-document-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockedApi.retryIngestion).toHaveBeenCalledTimes(1);
      });
      // Dialog remains open for inspection if error occurs
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Integration with VersionDetailModal
  // =========================================================================
  describe('VersionDetailModal retry trigger', () => {
    it('shows retry button when version is FAILED and user canManage is true', () => {
      const onRetry = jest.fn();

      renderWithClient(
        <VersionDetailModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc_123"
          documentTitle="Manual de Procedimientos"
          version={mockFailedVersion}
          isCurrent={true}
          isIndexedInRag={false}
          canManage={true}
          onRetry={onRetry}
        />,
      );

      const retryButton = screen.getByTestId('version-detail-retry-button');
      expect(retryButton).toBeInTheDocument();
      expect(screen.getByText('Reintentar versión')).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledWith(mockFailedVersion);
    });

    it('does NOT show retry button when version status is READY', () => {
      renderWithClient(
        <VersionDetailModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc_123"
          documentTitle="Manual de Procedimientos"
          version={mockReadyVersion}
          isCurrent={true}
          isIndexedInRag={true}
          canManage={true}
          onRetry={jest.fn()}
        />,
      );

      expect(screen.queryByTestId('version-detail-retry-button')).not.toBeInTheDocument();
    });

    it('does NOT show retry button when canManage is false even if version is FAILED', () => {
      renderWithClient(
        <VersionDetailModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc_123"
          documentTitle="Manual de Procedimientos"
          version={mockFailedVersion}
          isCurrent={true}
          isIndexedInRag={false}
          canManage={false}
          onRetry={jest.fn()}
        />,
      );

      expect(screen.queryByTestId('version-detail-retry-button')).not.toBeInTheDocument();
    });
  });
});
