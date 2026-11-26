import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AssistantMessage } from '../assistant/components/assistant-message';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import { conversationApi } from '../assistant/api/conversation.api';
import { ChatMessage } from '../assistant/types/assistant.types';

// Mocks
jest.mock('../assistant/api/assistant.api');
jest.mock('../assistant/api/conversation.api', () => ({
  conversationApi: {
    listConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    getConversation: jest.fn().mockResolvedValue(null),
    getMessageHistory: jest
      .fn()
      .mockResolvedValue({ messages: [], nextCursor: null, hasMore: false }),
    createConversation: jest.fn(),
    reserveTurn: jest.fn(),
    regenerateMessage: jest.fn(),
    cancelTurn: jest.fn(),
    updateTitle: jest.fn(),
    archiveConversation: jest.fn(),
  },
}));

const mockedConversationApi = jest.mocked(conversationApi);

describe('ER.06 — RAG, Retrieval & AI Provider Failure UX', () => {
  const tenantId = 'global';
  const userId = 'anonymous';
  let queryClient: QueryClient;

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockedConversationApi.listConversations.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    mockedConversationApi.getConversation.mockImplementation(async (_id: string) => {
      const err = new Error('Not found on server - using local fallback');
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    });
    mockedConversationApi.getMessageHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    assistantStorageService.clearConversations(tenantId, userId);
    jest.clearAllMocks();
  });

  describe('1. AI Provider Unavailable Failure UX', () => {
    it('renders provider unavailable banner with diagnostic ID, retry button, and no exposed secrets', () => {
      const message: ChatMessage = {
        id: 'msg-prov-err',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'PROVIDER_UNAVAILABLE',
        error: 'El servicio de IA no está disponible temporalmente',
        retryable: true,
        correlationId: 'req-ai-outage-9821',
        createdAt: new Date().toISOString(),
      };

      const handleRetry = jest.fn();

      render(<AssistantMessage message={message} onRetry={handleRetry} />);

      // Verify specific provider unavailable state is shown
      expect(screen.getByTestId('message-provider-unavailable-state')).toBeInTheDocument();
      expect(screen.getByText('Servicio de IA temporalmente no disponible')).toBeInTheDocument();
      expect(
        screen.getByText(
          /El asistente no pudo completar la generación porque el servicio de inferencia de IA/i,
        ),
      ).toBeInTheDocument();

      // Verify diagnostic ID is rendered
      const diagnosticEl = screen.getByTestId('failure-diagnostic-id');
      expect(diagnosticEl).toHaveTextContent('req-ai-outage-9821');

      // Verify retry action
      const retryBtn = screen.getByTestId('message-retry-btn');
      expect(retryBtn).toHaveTextContent('Reintentar generación');
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);

      // Verify no sensitive keys/URLs leaked
      expect(screen.queryByText(/openai\.com/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/sk-/i)).not.toBeInTheDocument();
    });

    it('renders rate limit warning with countdown guidance when rate limited', () => {
      const message: ChatMessage = {
        id: 'msg-rate-limit',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'RATE_LIMITED',
        error: 'Límite de solicitudes de IA excedido',
        retryable: true,
        retryAfterSeconds: 25,
        correlationId: 'req-rate-lim-4412',
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={message} onRetry={jest.fn()} />);

      expect(screen.getByTestId('message-rate-limited-state')).toBeInTheDocument();
      expect(screen.getByText('Límite de capacidad temporal alcanzado')).toBeInTheDocument();
      expect(screen.getByText(/25 segundos/i)).toBeInTheDocument();
    });

    it('renders inference timeout notification on provider timeout', () => {
      const message: ChatMessage = {
        id: 'msg-ai-timeout',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'PROVIDER_TIMEOUT',
        error: 'Tiempo de espera de inferencia agotado',
        retryable: true,
        correlationId: 'req-timeout-0019',
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={message} onRetry={jest.fn()} />);

      expect(screen.getByTestId('message-provider-timeout-state')).toBeInTheDocument();
      expect(screen.getByText('Tiempo de espera del modelo de IA agotado')).toBeInTheDocument();
    });
  });

  describe('2. Retrieval & Knowledge Base Failure UX', () => {
    it('renders retrieval unavailable banner with retry action distinct from provider failure', () => {
      const message: ChatMessage = {
        id: 'msg-retrieval-fail',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'RETRIEVAL_UNAVAILABLE',
        error: 'No se pudo consultar el almacén vectorial de conocimiento',
        retryable: true,
        correlationId: 'req-retrieval-err-1029',
        createdAt: new Date().toISOString(),
      };

      const handleRetry = jest.fn();

      render(<AssistantMessage message={message} onRetry={handleRetry} />);

      expect(screen.getByTestId('message-retrieval-unavailable-state')).toBeInTheDocument();
      expect(screen.getByText('Base de conocimiento no disponible')).toBeInTheDocument();
      expect(
        screen.getByText(/No fue posible consultar la base de documentos clínicos/i),
      ).toBeInTheDocument();

      const retryBtn = screen.getByTestId('message-retry-btn');
      expect(retryBtn).toHaveTextContent('Reintentar búsqueda');
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('handles retrieval timeout and embedding failure codes properly', () => {
      const message: ChatMessage = {
        id: 'msg-embed-fail',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'EMBEDDING_FAILED',
        error: 'Fallo al calcular embeddings',
        retryable: true,
        correlationId: 'req-embed-8891',
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={message} onRetry={jest.fn()} />);

      expect(screen.getByTestId('message-retrieval-unavailable-state')).toBeInTheDocument();
    });
  });

  describe('3. Insufficient Knowledge (Abstention) vs Technical Failure', () => {
    it('presents legitimate knowledge gap as clinical abstention without technical error styling', () => {
      const abstentionMessage: ChatMessage = {
        id: 'msg-abstention',
        role: 'assistant',
        content:
          'No he encontrado evidencia concluyente en la documentación clínica disponible para responder a esta consulta con suficiente certeza.',
        status: 'success',
        grounded: false,
        sources: [],
        metadata: {
          model: 'gpt-4o',
          retrievalCount: 0,
          latencyMs: 420,
          finishReason: 'insufficient_context',
        },
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={abstentionMessage} onRetry={jest.fn()} />);

      // Content is preserved and rendered
      expect(
        screen.getByText(/No he encontrado evidencia concluyente en la documentación clínica/i),
      ).toBeInTheDocument();

      // Renders InsufficientKnowledgeBanner with recommended next actions
      expect(screen.getByTestId('insufficient-knowledge-banner')).toBeInTheDocument();
      expect(screen.getByText('Conocimiento insuficiente en el repositorio')).toBeInTheDocument();
      expect(screen.getByText(/Intenta reformular tu consulta/i)).toBeInTheDocument();
      expect(screen.getByText(/Centro de Conocimiento/i)).toBeInTheDocument();

      // Shows 'Sin evidencia directa' badge
      expect(screen.getByTestId('grounded-badge-abstention')).toBeInTheDocument();
      expect(screen.getByText('Sin evidencia directa')).toBeInTheDocument();

      // MUST NOT render technical failure error states
      expect(screen.queryByTestId('message-error-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-provider-unavailable-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-retrieval-unavailable-state')).not.toBeInTheDocument();
    });

    it('shows verified grounded badge when message has citations and grounded is true', () => {
      const groundedMessage: ChatMessage = {
        id: 'msg-grounded',
        role: 'assistant',
        content: 'El protocolo recomienda flexión progresiva bajo supervisión asistida.',
        status: 'success',
        grounded: true,
        sources: [
          {
            citationId: 'cit-1',
            documentId: 'doc-proto-1',
            documentTitle: 'Protocolo de Rehabilitación Lumbar 2026',
            chunkId: 'chunk-1',
            excerpt: 'Flexión asistida según tolerancia',
            relevanceScore: 0.94,
          },
        ],
        metadata: {
          model: 'gpt-4o',
          retrievalCount: 1,
          latencyMs: 380,
        },
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={groundedMessage} onRetry={jest.fn()} />);

      expect(screen.getByTestId('grounded-badge-verified')).toBeInTheDocument();
      expect(screen.getByText('Fundamentado')).toBeInTheDocument();
      expect(screen.queryByTestId('insufficient-knowledge-banner')).not.toBeInTheDocument();
    });
  });

  describe('4. Generation & Synthesis Failure UX', () => {
    it('renders generation failure state with answer retry button', () => {
      const message: ChatMessage = {
        id: 'msg-gen-fail',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'GENERATION_FAILED',
        error: 'Error de síntesis en el modelo de lenguaje',
        retryable: true,
        correlationId: 'req-gen-err-3321',
        createdAt: new Date().toISOString(),
      };

      const handleRetry = jest.fn();

      render(<AssistantMessage message={message} onRetry={handleRetry} />);

      expect(screen.getByTestId('message-generation-failed-state')).toBeInTheDocument();
      expect(screen.getByText('Error al generar la respuesta')).toBeInTheDocument();
      expect(
        screen.getByText(/Ocurrió un error al procesar y sintetizar la respuesta médica/i),
      ).toBeInTheDocument();

      const retryBtn = screen.getByTestId('message-retry-btn');
      expect(retryBtn).toHaveTextContent('Reintentar respuesta');
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Citation & Document Preview Resilience', () => {
    it('preserves complete assistant message and citations list even if a source cannot be previewed', () => {
      const message: ChatMessage = {
        id: 'msg-citation-resilience',
        role: 'assistant',
        content:
          'Se recomienda reposo relativo y movilización precoz según la guía clínica departamental.',
        status: 'success',
        grounded: true,
        sources: [
          {
            citationId: 'cit-1',
            documentId: 'doc-restricted-88',
            documentTitle: 'Guía Clínica Departamental (Restringida)',
            chunkId: 'chunk-99',
            excerpt: 'Recomendaciones de movilización precoz en dolor lumbar agudo.',
            relevanceScore: 0.91,
            previewStatus: 'DOCUMENT_RESTRICTED',
            canPreview: false,
            previewUnavailableReason: 'Acceso restringido por rol clínico',
          },
        ],
        metadata: {
          model: 'gpt-4o',
          retrievalCount: 1,
          latencyMs: 310,
        },
        createdAt: new Date().toISOString(),
      };

      render(<AssistantMessage message={message} onRetry={jest.fn()} />);

      // Answer is completely visible and valid
      expect(
        screen.getByText(/Se recomienda reposo relativo y movilización precoz/i),
      ).toBeInTheDocument();

      // Citations panel is present and active
      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByText(/Fuentes verificadas/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Guía Clínica Departamental/i).length).toBeGreaterThanOrEqual(1);

      // No error banner on the message itself
      expect(screen.queryByTestId('message-error-state')).not.toBeInTheDocument();
    });
  });

  describe('6. End-to-End Workspace Failure State & Storage Persistence', () => {
    it('persists classified failure state and correlation ID in storage across navigation', async () => {
      const conversationId = 'conv-err-persist';
      assistantStorageService.createConversation(
        tenantId,
        userId,
        'Consulta sobre radiculopatía',
        conversationId,
      );
      assistantStorageService.appendMessage(tenantId, userId, conversationId, {
        id: 'user-m1',
        role: 'user',
        content: '¿Cuál es el tratamiento de primera línea?',
        status: 'success',
        createdAt: new Date().toISOString(),
      });
      assistantStorageService.appendMessage(tenantId, userId, conversationId, {
        id: 'asst-m2',
        role: 'assistant',
        content: '',
        status: 'error',
        errorCode: 'PROVIDER_UNAVAILABLE',
        error: 'Provider timeout or down',
        retryable: true,
        correlationId: 'corr-id-persist-7712',
        createdAt: new Date().toISOString(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${conversationId}`]}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('message-provider-unavailable-state')).toBeInTheDocument();
      });

      expect(screen.getByTestId('failure-diagnostic-id')).toHaveTextContent('corr-id-persist-7712');
      expect(screen.getByTestId('message-retry-btn')).toHaveTextContent('Reintentar generación');
    });
  });
});
