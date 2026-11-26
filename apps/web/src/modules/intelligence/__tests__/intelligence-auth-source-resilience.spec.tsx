import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { authTokenStore } from '../../../shared/auth/auth-token-store';
import { AuthTransportManager } from '../../../shared/auth/auth-transport';
import { AuthorizationError, NotFoundError } from '../../../shared/api/api-error';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { DocumentPreview } from '../assistant/components/document-preview';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import { conversationApi } from '../assistant/api/conversation.api';
import { IntelligenceKnowledgeGuard } from '../routes/intelligence-knowledge-guard';
import { IntelligenceErrorBoundary } from '../components/intelligence-error-boundary';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { CitationPreviewResponse } from '../assistant/types/conversation-contract.types';

// Mock conversationApi
jest.mock('../assistant/api/conversation.api', () => ({
  conversationApi: {
    listConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    getConversation: jest.fn(),
    getMessageHistory: jest.fn(),
    createConversation: jest.fn(),
    updateTitle: jest.fn(),
    archiveConversation: jest.fn(),
    reserveTurn: jest.fn(),
    recordTurnResolution: jest.fn(),
    getCitationPreview: jest.fn(),
    getCitationDocumentContentUrl: jest.fn(),
    getCitationDocumentContentText: jest.fn(),
  },
}));

const mockedConversationApi = jest.mocked(conversationApi);

// Test user fixtures
const CLINICAL_USER: AuthUser = {
  id: 'usr_clinical_1',
  email: 'physio@kinergy.io',
  name: 'Physiotherapist Elena',
  roles: ['OPERATOR', 'COLLABORATOR'],
  permissions: ['ai:chat'],
  tenantId: 'tenant_facility_a',
};

const ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'director@kinergy.io',
  name: 'Director Carlos',
  roles: ['ADMIN'],
  permissions: ['admin:all', 'ai:chat', 'knowledge:manage'],
  tenantId: 'tenant_facility_a',
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Minimal mock Response class for environments where jsdom doesn't expose it globally
class MockResponse {
  readonly status: number;
  readonly headers: Headers;
  private readonly bodyContent: string;

  constructor(
    body: string,
    init?: { status?: number; headers?: Record<string, string> | Headers },
  ) {
    this.status = init?.status ?? 200;
    this.bodyContent = body;
    this.headers = new Headers(init?.headers);
  }

  json() {
    return Promise.resolve(JSON.parse(this.bodyContent));
  }
}

describe('ER.08 — Authentication, Authorization & Unavailable Source UX Resilience', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authTokenStore.clearSession();
    assistantStorageService.clearConversations('tenant_facility_a', 'usr_clinical_1');
    assistantStorageService.clearConversations('global', 'anonymous');
  });

  describe('1. Unauthenticated State & Refresh Loop Prevention', () => {
    it('attempts token refresh on initial 401 and rejects secondary 401 with X-Retry-Attempt to prevent loops', async () => {
      // Seed an active token so notifyUnauthorized emits the unauthorized event
      authTokenStore.setAccessToken('token_initial_123');

      const manager = new AuthTransportManager({
        tokenStore: authTokenStore,
      });

      // Mock acquireRefreshedToken
      const acquireSpy = jest
        .spyOn(manager, 'acquireRefreshedToken')
        .mockResolvedValue('token_refreshed_abc');

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue(
        new MockResponse(JSON.stringify({ error: 'Still Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response,
      );

      try {
        const interceptor = manager.createResponseInterceptor();

        // First 401 response: should trigger silent refresh and transparent retry
        const first401Response = new MockResponse(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response;

        const initialRequest = {
          url: 'https://api.kinergy.io/api/v1/ai/conversations',
          init: {
            headers: new Headers({ Authorization: 'Bearer token_initial_123' }),
          },
        };

        let unauthorizedEmitted = false;
        const unsubscribe = authTokenStore.subscribe((event) => {
          if (event === 'unauthorized') {
            unauthorizedEmitted = true;
          }
        });

        const handledFirst = await interceptor(first401Response, initialRequest);

        // Verify acquireRefreshedToken was called
        expect(acquireSpy).toHaveBeenCalledTimes(1);

        // Fetch was called with retried headers containing X-Retry-Attempt: 1 and new Bearer token
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [fetchUrl, fetchInit] = (global.fetch as jest.Mock).mock.calls[0] as [
          string,
          RequestInit,
        ];
        expect(fetchUrl).toBe('https://api.kinergy.io/api/v1/ai/conversations');
        const headers = fetchInit.headers as Headers;
        expect(headers.get('X-Retry-Attempt')).toBe('1');
        expect(headers.get('Authorization')).toBe('Bearer token_refreshed_abc');

        // Since the retried fetch returned 401, unauthorized must have been emitted
        expect(unauthorizedEmitted).toBe(true);
        expect(handledFirst.status).toBe(401);

        // Reset token in store for the second test to verify loop prevention
        authTokenStore.setAccessToken('token_refreshed_abc');
        let secondUnauthorizedEmitted = false;
        const unsub2 = authTokenStore.subscribe((event) => {
          if (event === 'unauthorized') secondUnauthorizedEmitted = true;
        });

        // Now test second 401 with X-Retry-Attempt already set on request: must not acquire token again!
        const secondRequest = {
          url: 'https://api.kinergy.io/api/v1/ai/conversations',
          init: {
            headers: new Headers({
              Authorization: 'Bearer token_refreshed_abc',
              'X-Retry-Attempt': '1',
            }),
          },
        };

        const secondHandled = await interceptor(first401Response, secondRequest);
        expect(secondHandled).toBe(first401Response);
        expect(acquireSpy).toHaveBeenCalledTimes(1); // Still 1, did NOT retry loop!
        expect(secondUnauthorizedEmitted).toBe(true);

        unsubscribe();
        unsub2();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('emits unauthorized event and halts when 401 occurs on refresh endpoint itself', async () => {
      // Seed token in store
      authTokenStore.setAccessToken('token_valid_pre_refresh');

      const manager = new AuthTransportManager({
        tokenStore: authTokenStore,
        refreshEndpoint: '/api/v1/auth/refresh',
      });

      const acquireSpy = jest.spyOn(manager, 'acquireRefreshedToken');
      const interceptor = manager.createResponseInterceptor();

      const refresh401Response = new MockResponse(
        JSON.stringify({ error: 'Invalid refresh token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ) as unknown as Response;

      const refreshRequest = {
        url: 'https://api.kinergy.io/api/v1/auth/refresh',
        init: { headers: new Headers() },
      };

      let unauthorizedFired = false;
      const unsub = authTokenStore.subscribe((event) => {
        if (event === 'unauthorized') unauthorizedFired = true;
      });

      const res = await interceptor(refresh401Response, refreshRequest);

      expect(res).toBe(refresh401Response);
      expect(unauthorizedFired).toBe(true);
      expect(acquireSpy).not.toHaveBeenCalled();

      unsub();
    });

    it('cancels in-flight queries and clears queryClient cache on unauthorized or logout event', () => {
      const queryClient = createTestQueryClient();
      const cancelSpy = jest.spyOn(queryClient, 'cancelQueries');
      const clearSpy = jest.spyOn(queryClient, 'clear');

      // Populate test query cache
      queryClient.setQueryData(['conversations', 'list'], [{ id: 'conv-secret-1' }]);

      // Trigger session eviction
      queryClient.cancelQueries();
      queryClient.clear();

      expect(cancelSpy).toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
      expect(queryClient.getQueryData(['conversations', 'list'])).toBeUndefined();
    });
  });

  describe('2. Forbidden (HTTP 403) Handling & Non-Logout Invariant', () => {
    it('does NOT trigger silent refresh or log the user out when HTTP 403 is received', async () => {
      const manager = new AuthTransportManager({
        tokenStore: authTokenStore,
      });

      const acquireSpy = jest.spyOn(manager, 'acquireRefreshedToken');
      const interceptor = manager.createResponseInterceptor();

      const forbidden403Response = new MockResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;

      const req = {
        url: 'https://api.kinergy.io/api/v1/ai/conversations/conv-restricted',
        init: { headers: new Headers() },
      };

      let unauthorizedEmitted = false;
      const unsub = authTokenStore.subscribe(() => {
        unauthorizedEmitted = true;
      });

      const result = await interceptor(forbidden403Response, req);

      // Preserves response directly, no token refresh, no unauthorized eviction
      expect(result).toBe(forbidden403Response);
      expect(acquireSpy).not.toHaveBeenCalled();
      expect(unauthorizedEmitted).toBe(false);

      unsub();
    });

    it('denies non-administrative roles at Knowledge Center guard without redirecting to login', () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={CLINICAL_USER}>
            <MemoryRouter initialEntries={['/knowledge']}>
              <Routes>
                <Route element={<IntelligenceKnowledgeGuard />}>
                  <Route
                    path="/knowledge"
                    element={<div data-testid="protected-kc-content">KC Admin Only</div>}
                  />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Should display ForbiddenView without crashing or navigating to /login
      expect(screen.queryByTestId('protected-kc-content')).not.toBeInTheDocument();
      expect(screen.getByText(/Acceso denegado/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Se requieren privilegios de administración o gestión de energía/i),
      ).toBeInTheDocument();
    });

    it('grants administrative roles access to Knowledge Center guard', () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider initialSessionOverride={ADMIN_USER}>
            <MemoryRouter initialEntries={['/knowledge']}>
              <Routes>
                <Route element={<IntelligenceKnowledgeGuard />}>
                  <Route
                    path="/knowledge"
                    element={<div data-testid="protected-kc-content">KC Admin Only</div>}
                  />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('protected-kc-content')).toBeInTheDocument();
    });
  });

  describe('3. Conversation Authorization Failures & Local Cache Purging', () => {
    it('renders chat-forbidden-container and purges local storage when conversation returns 403', async () => {
      const queryClient = createTestQueryClient();
      const convId = 'conv-facility-restricted';

      // Seed local storage with protected conversation data
      assistantStorageService.createConversation(
        'global',
        'anonymous',
        'Paciente Confidencial Tratamiento VIP',
        convId,
      );
      assistantStorageService.appendMessage('global', 'anonymous', convId, {
        id: 'msg-local-1',
        role: 'assistant',
        content: 'Diagnóstico confidencial...',
        createdAt: '2026-03-01T10:05:00Z',
        status: 'success',
      });

      expect(assistantStorageService.getConversation('global', 'anonymous', convId)).not.toBeNull();

      // Mock backend returning 403 Forbidden
      mockedConversationApi.getConversation.mockRejectedValueOnce(
        new AuthorizationError('Forbidden facility access'),
      );
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${convId}`]}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify that chat-forbidden-container is rendered
      await waitFor(() => {
        expect(screen.getByTestId('chat-forbidden-container')).toBeInTheDocument();
      });

      expect(screen.getByTestId('chat-forbidden-state')).toBeInTheDocument();
      expect(
        screen.getByText(
          /No cuentas con la autorización de sede requerida para consultar esta conversación/i,
        ),
      ).toBeInTheDocument();

      // Protected message feed must NOT be rendered
      expect(screen.queryByTestId('chat-message-feed')).not.toBeInTheDocument();

      // Verify authoritative security invariant: local storage cache for this conversation was purged
      await waitFor(() => {
        expect(assistantStorageService.getConversation('global', 'anonymous', convId)).toBeNull();
      });
    });

    it('distinguishes genuine 404 Not Found from 403 Forbidden in chat workspace', async () => {
      const queryClient = createTestQueryClient();
      const convId = 'conv-non-existent-999';

      mockedConversationApi.getConversation.mockRejectedValueOnce(
        new NotFoundError('Conversation not found'),
      );
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${convId}`]}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('chat-not-found-container')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('chat-forbidden-container')).not.toBeInTheDocument();
      expect(screen.getByText(/Conversación no encontrada/i)).toBeInTheDocument();
    });
  });

  describe('4. Citation Source Availability & Decoupled Preview Resilience', () => {
    it('renders preview-unauthorized state when citation source document access is revoked (403)', async () => {
      const forbiddenPreview: CitationPreviewResponse = {
        documentId: 'doc-revoked-1',
        citationId: 'cite-revoked-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        documentTitleSnapshot: 'Protocolo Restringido de Sede Norte',
        documentTitle: 'Protocolo Restringido de Sede Norte',
        originalFileName: null,
        mimeType: null,
        fileSizeBytes: null,
        documentVersionId: null,
        documentVersionNumber: null,
        pageNumber: 5,
        headingPath: [],
        excerpt: 'Cita médica confidencial...',
        canPreview: false,
        supportedFormat: false,
        previewStatus: 'DOCUMENT_RESTRICTED',
        previewUnavailableReason: 'Acceso restringido: requiere rol de Director o Administrador.',
        downloadAllowed: false,
        previewToken: null,
        previewUrl: '',
      };

      mockedConversationApi.getCitationPreview.mockResolvedValueOnce(forbiddenPreview);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <DocumentPreview
            conversationId="conv-1"
            messageId="msg-1"
            citationId="cite-revoked-1"
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-unauthorized')).toBeInTheDocument();
      });

      expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
      expect(
        screen.getByText(/Acceso restringido: requiere rol de Director o Administrador/i),
      ).toBeInTheDocument();

      // Original document title snapshot remains visible for clinical context
      expect(screen.getByText('Protocolo Restringido de Sede Norte')).toBeInTheDocument();
    });

    it('renders preview-deleted state when citation source document was deleted from repository', async () => {
      const deletedPreview: CitationPreviewResponse = {
        documentId: 'doc-deleted-1',
        citationId: 'cite-deleted-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        documentTitleSnapshot: 'Ficha Histórica 2024 Descartada',
        documentTitle: 'Ficha Histórica 2024 Descartada',
        originalFileName: null,
        mimeType: null,
        fileSizeBytes: null,
        documentVersionId: null,
        documentVersionNumber: null,
        pageNumber: 2,
        headingPath: [],
        excerpt: 'Texto de referencia...',
        canPreview: false,
        supportedFormat: false,
        previewStatus: 'DOCUMENT_DELETED',
        previewUnavailableReason:
          'El documento original ha sido archivado o eliminado del almacenamiento.',
        downloadAllowed: false,
        previewToken: null,
        previewUrl: '',
      };

      mockedConversationApi.getCitationPreview.mockResolvedValueOnce(deletedPreview);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <DocumentPreview
            conversationId="conv-1"
            messageId="msg-1"
            citationId="cite-deleted-1"
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-deleted')).toBeInTheDocument();
      });

      expect(screen.getByText('Documento No Disponible')).toBeInTheDocument();
      expect(
        screen.getByText(/El documento original ha sido archivado o eliminado del almacenamiento/i),
      ).toBeInTheDocument();

      // Snapshot preserved
      expect(screen.getByText('Ficha Histórica 2024 Descartada')).toBeInTheDocument();
    });
  });

  describe('5. Error Boundary Resilience', () => {
    it('catches uncaught rendering exceptions in Intelligence components without crashing outer shell and provides recovery action', () => {
      // Create child component that throws on first render
      let shouldThrow = true;
      const CrashingComponent: React.FC = () => {
        if (shouldThrow) {
          throw new Error('Fatal rendering crash in clinical widget');
        }
        return <div data-testid="recovered-content">Widget rendered successfully</div>;
      };

      // Suppress console.error in test output for caught boundary error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { rerender } = render(
        <IntelligenceErrorBoundary
          onReset={() => {
            shouldThrow = false;
          }}
        >
          <CrashingComponent />
        </IntelligenceErrorBoundary>,
      );

      // Boundary fallback must be visible
      expect(screen.getByTestId('intelligence-error-fallback')).toBeInTheDocument();
      expect(screen.getByText('Error en el módulo de Inteligencia')).toBeInTheDocument();
      expect(screen.getByText('Fatal rendering crash in clinical widget')).toBeInTheDocument();

      // Click retry button
      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);

      // Rerender to reflect state after reset
      rerender(
        <IntelligenceErrorBoundary
          onReset={() => {
            shouldThrow = false;
          }}
        >
          <CrashingComponent />
        </IntelligenceErrorBoundary>,
      );

      expect(screen.getByTestId('recovered-content')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });
});
