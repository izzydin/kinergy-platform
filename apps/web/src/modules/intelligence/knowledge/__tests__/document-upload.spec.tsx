import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { knowledgeApi } from '../api/knowledge.api';
import { knowledgeQueryKeys } from '../api/knowledge-query-keys';
import { DocumentUploadModal } from '../components/document-upload-modal';
import { KnowledgePage } from '../routes/knowledge-page';
import { validateFileAgainstCapabilities } from '../hooks/use-document-upload';
import type {
  KnowledgeCapabilitiesResponse,
  UploadDocumentResponse,
  PaginatedDocumentsResponse,
} from '../types/knowledge-contract.types';
import { ConflictError } from '../../../../shared/api/api-error';

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

const mockCapabilities: KnowledgeCapabilitiesResponse = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
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

const mockUploadedDoc: UploadDocumentResponse = {
  documentId: 'doc_new_123',
  versionId: 'ver_new_123',
  versionNumber: 1,
  title: 'Guia Clinica Protocolo 2026',
  originalFileName: 'guia_clinica_protocolo_2026.pdf',
  fileSize: 2048576,
  mimeType: 'application/pdf',
  checksum: 'abc123hash',
  visibilityScope: 'ALL_STAFF',
  ingestionJobId: 'job_new_123',
  ingestionStatus: 'UPLOADED',
  createdAt: '2026-11-25T14:00:00.000Z',
};

const mockEmptyPaginatedResponse: PaginatedDocumentsResponse = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

interface RenderOptions {
  readonly queryClient?: QueryClient;
  readonly initialEntries?: string[];
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
  readonly onSuccess?: (doc: UploadDocumentResponse) => void;
}

function renderUploadModal(options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const initialEntries = options.initialEntries ?? ['/'];
  const onClose = options.onClose ?? jest.fn();
  const onSuccess = options.onSuccess ?? jest.fn();
  const isOpen = options.isOpen ?? true;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={ADMIN_USER}>
        <NotificationProvider>
          <MemoryRouter initialEntries={initialEntries}>
            <DocumentUploadModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />
          </MemoryRouter>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient, onClose, onSuccess };
}

describe('KC.05 — Secure Document Upload Experience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getCapabilities.mockResolvedValue(mockCapabilities);
    mockedApi.listDocuments.mockResolvedValue(mockEmptyPaginatedResponse);
  });

  describe('1. Advisory Client-Side Validation', () => {
    it('rejects files larger than capabilities.maxFileSizeBytes', () => {
      const oversizedFile = new File(['x'.repeat(100)], 'huge-archive.pdf', {
        type: 'application/pdf',
      });
      // Override size property to 15 MB
      Object.defineProperty(oversizedFile, 'size', { value: 15 * 1024 * 1024 });

      const err = validateFileAgainstCapabilities(oversizedFile, mockCapabilities);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('FILE_TOO_LARGE');
      expect(err?.message).toContain('supera el tamaño máximo permitido de 10 MB');
    });

    it('rejects unsupported file extensions', () => {
      const unsupportedFile = new File(['content'], 'malicious-script.exe', {
        type: 'application/x-msdownload',
      });

      const err = validateFileAgainstCapabilities(unsupportedFile, mockCapabilities);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('UNSUPPORTED_EXTENSION');
      expect(err?.message).toContain("La extensión '.exe' no está permitida");
      expect(err?.message).toContain('.pdf, .docx, .md, .markdown, .txt');
    });

    it('rejects 0-byte empty files', () => {
      const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
      Object.defineProperty(emptyFile, 'size', { value: 0 });

      const err = validateFileAgainstCapabilities(emptyFile, mockCapabilities);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('EMPTY_FILE');
      expect(err?.message).toContain('está vacío (0 bytes)');
    });

    it('accepts valid files within bounds and matching allowed extension', () => {
      const validFile = new File(['valid content'], 'guia_clinica.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(validFile, 'size', { value: 2 * 1024 * 1024 });

      const err = validateFileAgainstCapabilities(validFile, mockCapabilities);
      expect(err).toBeNull();
    });
  });

  describe('2. Modal Rendering & File Selection Interface', () => {
    it('renders the upload modal with dropzone, dynamic limits, and instructions', async () => {
      renderUploadModal();

      expect(await screen.findByTestId('document-upload-modal')).toBeInTheDocument();
      expect(screen.getByTestId('document-dropzone')).toBeInTheDocument();
      expect(screen.getByText(/Arrastra y suelta tu archivo aquí/i)).toBeInTheDocument();
      // Verifies capabilities are dynamically rendered once query resolves
      expect(await screen.findByText(/10 MB/i)).toBeInTheDocument();
      expect(
        await screen.findByText(/\.pdf, \.docx, \.md, \.markdown, \.txt/i),
      ).toBeInTheDocument();
    });

    it('handles file selection, auto-derives clean title, and displays selected file card', async () => {
      renderUploadModal();
      await screen.findByText(/\.pdf, \.docx, \.md, \.markdown, \.txt/i);

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['dummy test content'], 'politica-seguridad_2026.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      Object.defineProperty(validFile, 'size', { value: 1024 * 500 }); // 500 KB

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      // Selected file preview card appears
      expect(await screen.findByTestId('selected-file-card')).toBeInTheDocument();
      expect(screen.getByTestId('selected-file-name')).toHaveTextContent(
        'politica-seguridad_2026.docx',
      );

      // Title is auto-derived cleanly from filename
      const titleInput = screen.getByTestId('upload-title-input') as HTMLInputElement;
      expect(titleInput.value).toBe('Politica seguridad 2026');

      // Submit button is enabled
      const submitBtn = screen.getByTestId('submit-upload-button');
      expect(submitBtn).toBeEnabled();
    });

    it('displays validation error alert when selecting an oversized or invalid file', async () => {
      renderUploadModal();
      await screen.findByText(/\.pdf, \.docx, \.md, \.markdown, \.txt/i);

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const invalidFile = new File(['payload'], 'script.exe', { type: 'application/x-exe' });

      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      const alert = await screen.findByTestId('upload-validation-error');
      expect(alert).toHaveTextContent("La extensión '.exe' no está permitida");

      // Submit button is disabled
      const submitBtn = screen.getByTestId('submit-upload-button');
      expect(submitBtn).toBeDisabled();
    });

    it('allows removing selected file and returns to dropzone', async () => {
      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['content'], 'protocolo.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', { value: 1024 * 100 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      expect(await screen.findByTestId('selected-file-card')).toBeInTheDocument();

      const removeBtn = screen.getByTestId('remove-file-button');
      fireEvent.click(removeBtn);

      expect(screen.queryByTestId('selected-file-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('document-dropzone')).toBeInTheDocument();
    });

    it('supports drag and drop onto dropzone', async () => {
      renderUploadModal();
      const dropzone = await screen.findByTestId('document-dropzone');

      const droppedFile = new File(['notes content'], 'notas_tecnicas.md', {
        type: 'text/markdown',
      });
      Object.defineProperty(droppedFile, 'size', { value: 1024 * 20 });

      fireEvent.dragOver(dropzone);
      fireEvent.drop(dropzone, {
        dataTransfer: { files: [droppedFile] },
      });

      expect(await screen.findByTestId('selected-file-card')).toBeInTheDocument();
      expect(screen.getByTestId('selected-file-name')).toHaveTextContent('notas_tecnicas.md');
      const titleInput = screen.getByTestId('upload-title-input') as HTMLInputElement;
      expect(titleInput.value).toBe('Notas tecnicas');
    });
  });

  describe('3. Wire Upload Transport, Progress & Accurate Capping', () => {
    it('submits multipart form-data and handles wire transfer progress', async () => {
      let progressCallback:
        | ((prog: {
            loaded: number;
            total: number;
            percentage: number;
            lengthComputable: boolean;
          }) => void)
        | undefined;

      mockedApi.uploadDocument.mockImplementation(async (_fData, options) => {
        progressCallback = options?.onProgress;
        // Simulate progress tick during wire transfer
        if (progressCallback) {
          progressCallback({
            loaded: 512 * 1024,
            total: 1024 * 1024,
            percentage: 50,
            lengthComputable: true,
          });
        }
        return mockUploadedDoc;
      });

      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['x'.repeat(1024 * 1024)], 'documento_red.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(validFile, 'size', { value: 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      await screen.findByTestId('selected-file-card');

      const submitBtn = screen.getByTestId('submit-upload-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedApi.uploadDocument).toHaveBeenCalledTimes(1);
      });

      // Verify the multipart payload parameters
      expect(mockedApi.uploadDocument).toHaveBeenCalled();
      const callArgs = mockedApi.uploadDocument.mock.calls[0]!;
      const calledFormData = callArgs[0];
      expect(calledFormData.get('file')).toBeDefined();
      expect(calledFormData.get('title')).toBe('Documento red');
      expect(calledFormData.get('visibilityScope')).toBe('ALL_STAFF');
    });

    it('caps progress at 99% until server 201 response arrives, never displaying premature 100%', async () => {
      let resolveUpload!: (value: UploadDocumentResponse) => void;
      const pendingPromise = new Promise<UploadDocumentResponse>((res) => {
        resolveUpload = res;
      });

      mockedApi.uploadDocument.mockImplementation(async (_formData, options) => {
        // Trigger 100% on wire from client socket while server is still validating
        if (options?.onProgress) {
          options.onProgress({
            loaded: 1000,
            total: 1000,
            percentage: 100, // Attempted 100% from browser network socket
            lengthComputable: true,
          });
        }
        return pendingPromise;
      });

      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['content'], 'informe.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', { value: 1000 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      await screen.findByTestId('selected-file-card');

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      // In UPLOADING state, progress should be capped at 99%, never 100%
      await waitFor(() => {
        expect(screen.getByTestId('upload-progress-container')).toBeInTheDocument();
      });

      // Verify progress element aria-valuenow is <= 99
      const progressBar = screen.getByRole('progressbar');
      const val = Number(progressBar.getAttribute('aria-valuenow'));
      expect(val).toBeLessThanOrEqual(99);

      // Now server responds with 201 Created
      act(() => {
        resolveUpload(mockUploadedDoc);
      });

      // Once resolved, state transitions to UPLOAD_SUCCEEDED
      expect(await screen.findByTestId('upload-success-view')).toBeInTheDocument();
    });
  });

  describe('4. Interrupted Uploads & Cancellation', () => {
    it('cancels active upload when user clicks Cancelar subida', async () => {
      let wasAborted = false;

      mockedApi.uploadDocument.mockImplementation(async (_formData, options) => {
        return new Promise<UploadDocumentResponse>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            wasAborted = true;
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        });
      });

      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['large payload'], 'cancelling.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', { value: 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      await screen.findByTestId('selected-file-card');

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      // Progress bar and cancel button appear
      const cancelBtn = await screen.findByTestId('cancel-upload-button');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(wasAborted).toBe(true);
        expect(screen.getByTestId('upload-cancelled-banner')).toBeInTheDocument();
      });
    });
  });

  describe('5. Duplicate Submission Prevention & 409 Conflict Handling', () => {
    it('prevents rapid double-clicks from sending duplicate requests', async () => {
      let resolveUpload!: (value: UploadDocumentResponse) => void;
      const uploadPromise = new Promise<UploadDocumentResponse>((res) => {
        resolveUpload = res;
      });

      mockedApi.uploadDocument.mockImplementation(() => uploadPromise);

      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['test'], 'double-click.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', { value: 500 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      await screen.findByTestId('selected-file-card');

      const submitBtn = screen.getByTestId('submit-upload-button');
      // Rapid double click
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      expect(mockedApi.uploadDocument).toHaveBeenCalledTimes(1);

      act(() => {
        resolveUpload(mockUploadedDoc);
      });
    });

    it('handles backend 409 Conflict (identical file hash) with actionable message and retry button', async () => {
      const conflictError = new ConflictError('Duplicate document checksum detected', undefined, {
        code: 'DUPLICATE_FILE',
        message: 'Un documento idéntico ya existe en el sistema.',
      });

      mockedApi.uploadDocument.mockRejectedValue(conflictError);

      renderUploadModal();
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const duplicateFile = new File(['existing content'], 'duplicate.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(duplicateFile, 'size', { value: 500 });

      fireEvent.change(fileInput, { target: { files: [duplicateFile] } });
      await screen.findByTestId('selected-file-card');

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      const errorAlert = await screen.findByTestId('upload-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveTextContent(/checksum duplicado/i);

      // Reintentar button is rendered in the footer
      const retryBtn = screen.getByTestId('submit-upload-button');
      expect(retryBtn).toHaveTextContent(/Reintentar subida/i);
    });
  });

  describe('6. Success State, Asynchronous Indexing Badge & Cache Invalidation', () => {
    it('displays initial UPLOADED ingestion status badge, metadata, and invalidates knowledge queries', async () => {
      mockedApi.uploadDocument.mockResolvedValue(mockUploadedDoc);
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const onSuccess = jest.fn();
      renderUploadModal({ queryClient, onSuccess });
      await screen.findByTestId('document-dropzone');

      const fileInput = screen.getByTestId('document-file-input') as HTMLInputElement;
      const validFile = new File(['valid'], 'guia_clinica_protocolo_2026.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(validFile, 'size', { value: 2048576 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });
      await screen.findByTestId('selected-file-card');

      fireEvent.click(screen.getByTestId('submit-upload-button'));

      // Success view displayed
      expect(await screen.findByTestId('upload-success-view')).toBeInTheDocument();
      expect(screen.getByTestId('uploaded-document-title')).toHaveTextContent(
        'Guia Clinica Protocolo 2026',
      );

      // Checks initial ingestion badge is UPLOADED (never false READY)
      expect(screen.getByTestId('ingestion-status-uploaded')).toBeInTheDocument();
      expect(screen.getByText('En cola')).toBeInTheDocument();
      expect(screen.getByText(/Indexación asíncrona en curso/i)).toBeInTheDocument();

      // Verifies onSuccess callback was called
      expect(onSuccess).toHaveBeenCalledWith(mockUploadedDoc);

      // Verifies query cache was invalidated
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: knowledgeQueryKeys.all,
      });

      // Actions: "Subir otro documento" resets the view
      const uploadAnotherBtn = screen.getByTestId('upload-another-button');
      fireEvent.click(uploadAnotherBtn);
      expect(screen.queryByTestId('upload-success-view')).not.toBeInTheDocument();
      expect(screen.getByTestId('document-dropzone')).toBeInTheDocument();
    });
  });

  describe('7. Route & URL Query Parameter Integration', () => {
    it('opens upload modal automatically when URL contains ?action=upload', async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={ADMIN_USER}>
            <NotificationProvider>
              <MemoryRouter initialEntries={['/intelligence/knowledge?action=upload']}>
                <Routes>
                  <Route path="/intelligence/knowledge" element={<KnowledgePage />} />
                </Routes>
              </MemoryRouter>
            </NotificationProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Modal is automatically mounted and open
      expect(await screen.findByTestId('document-upload-modal')).toBeInTheDocument();
      expect(screen.getByTestId('document-dropzone')).toBeInTheDocument();
    });
  });
});
