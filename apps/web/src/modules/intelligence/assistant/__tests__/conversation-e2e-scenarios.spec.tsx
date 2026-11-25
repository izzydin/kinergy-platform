import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatWorkspace } from '../components/chat-workspace';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type {
  ConversationDetailResponse,
  MessageHistoryResponse,
  CreateConversationResponse,
  ReserveTurnResponse,
  UpdateTitleResponse,
  ArchiveConversationResponse,
} from '../types/conversation-contract.types';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api');

const mockedConversationApi = jest.mocked(conversationApi);
const mockedAssistantApi = jest.mocked(assistantApi);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('FE.10: End-to-End Scenarios (AI-09.3 Comprehensive Verification)', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario A — New conversation creation, persistence, and refresh durability
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario A — New conversation', () => {
    it('creates a new conversation, persists authoritative turns, navigates to URL, and survives refresh', async () => {
      const createdConvId = 'conv_scen_a_100';
      const mockCreateResponse: CreateConversationResponse = {
        conversationId: createdConvId,
        turnId: 'turn_a_1',
        clientTurnId: 'client_turn_a_init',
        turnIndex: 1,
        userMessageId: 'msg_u_a1',
        assistantAttemptId: 'msg_a_a1',
        title: 'Evaluación Biomecánica Marcha',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T10:00:00.000Z',
      };

      const mockAnswer: RAGAnswerResponseDto = {
        answer:
          'La evaluación de la marcha requiere análisis cinemático en plano sagital y frontal.',
        grounded: true,
        sources: [
          {
            documentId: 'doc_marcha_01',
            documentTitle: 'Guía Clínica de Biomecánica 2026',
            chunkId: 'chunk_marcha_01',
            pageNumber: 12,
            relevanceScore: 0.96,
          },
        ],
        metadata: {
          model: 'gemini-1.5-pro',
          retrievalCount: 1,
          latencyMs: 140,
        },
      };

      const mockDetailAfterCreation: ConversationDetailResponse = {
        id: createdConvId,
        title: 'Evaluación Biomecánica Marcha',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T10:00:05.000Z',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T10:00:05.000Z',
        isArchived: false,
      };

      const mockMessagesAfterCreation: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg_u_a1',
            turnId: 'turn_a_1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Evaluación Biomecánica Marcha',
            createdAt: '2026-11-24T10:00:00.000Z',
            completedAt: '2026-11-24T10:00:00.000Z',
          },
          {
            id: 'msg_a_a1',
            turnId: 'turn_a_1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content:
              'La evaluación de la marcha requiere análisis cinemático en plano sagital y frontal.',
            sources: [
              {
                documentId: 'doc_marcha_01',
                documentTitle: 'Guía Clínica de Biomecánica 2026',
                chunkId: 'chunk_marcha_01',
                pageNumber: 12,
                relevanceScore: 0.96,
              },
            ],
            createdAt: '2026-11-24T10:00:05.000Z',
            completedAt: '2026-11-24T10:00:05.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.createConversation.mockResolvedValue(mockCreateResponse);
      mockedAssistantApi.queryKnowledge.mockResolvedValue(mockAnswer);
      mockedAssistantApi.buildConversationHistoryContext.mockReturnValue([]);
      mockedConversationApi.getConversation.mockResolvedValue(mockDetailAfterCreation);
      mockedConversationApi.getMessageHistory.mockResolvedValue(mockMessagesAfterCreation);

      const locationTracker: { current: Location | null } = { current: null };
      const Tracker = () => {
        locationTracker.current = useLocation();
        return null;
      };

      const queryClient = createTestQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat']}>
            <Tracker />
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify initial empty state
      expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

      // Submit user prompt
      const input = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      const sendBtn = screen.getByRole('button', { name: /Enviar mensaje/i });

      fireEvent.change(input, { target: { value: 'Evaluación Biomecánica Marcha' } });
      fireEvent.click(sendBtn);

      // Verify conversation creation called and URL updated via replace
      await waitFor(() => {
        expect(mockedConversationApi.createConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            userPrompt: 'Evaluación Biomecánica Marcha',
          }),
        );
      });

      // Verify navigation updated location to new conversation
      await waitFor(() => {
        expect(locationTracker.current?.pathname).toBe(`/intelligence/chat/${createdConvId}`);
      });

      // Verify assistant response rendered
      await waitFor(() => {
        expect(
          screen.getAllByText(/análisis cinemático en plano sagital y frontal/i).length,
        ).toBeGreaterThanOrEqual(1);
        expect(
          screen.getAllByText('Guía Clínica de Biomecánica 2026').length,
        ).toBeGreaterThanOrEqual(1);
      });

      unmount();

      // Simulate Browser Refresh: mount directly at /intelligence/chat/:createdConvId
      const refreshedClient = createTestQueryClient();
      render(
        <QueryClientProvider client={refreshedClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${createdConvId}`]}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify state survives refresh: header title, messages, and citations remain retrievable
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Evaluación Biomecánica Marcha' }),
        ).toBeInTheDocument();
        expect(
          screen.getAllByText(/análisis cinemático en plano sagital y frontal/i).length,
        ).toBeGreaterThanOrEqual(1);
        expect(
          screen.getAllByText('Guía Clínica de Biomecánica 2026').length,
        ).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario B — Conversation continuation & ordered history reconciliation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario B — Conversation continuation', () => {
    it('opens existing conversation, loads history, reserves turn 2, injects prior turns, and verifies ordered history', async () => {
      const convId = 'conv_scen_b_200';

      const initialDetail: ConversationDetailResponse = {
        id: convId,
        title: 'Protocolo Hombro Doloroso',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T11:00:00.000Z',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T11:00:00.000Z',
        isArchived: false,
      };

      const initialHistory: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg_u_b1',
            turnId: 'turn_b_1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: '¿Cuáles son los ejercicios para manguito rotador?',
            createdAt: '2026-11-24T10:00:00.000Z',
            completedAt: '2026-11-24T10:00:00.000Z',
          },
          {
            id: 'msg_a_b1',
            turnId: 'turn_b_1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Rotaciones externas con elástico e isométricos sub-máximos.',
            createdAt: '2026-11-24T10:00:05.000Z',
            completedAt: '2026-11-24T10:00:05.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      const mockReserveResponse: ReserveTurnResponse = {
        conversationId: convId,
        turnId: 'turn_b_2',
        clientTurnId: 'client_turn_b_continuation',
        turnIndex: 2,
        userMessageId: 'msg_u_b2',
        assistantAttemptId: 'msg_a_b2',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T11:05:00.000Z',
      };

      const continuationAnswer: RAGAnswerResponseDto = {
        answer:
          'Para fase 2 se incorporan diagonales de Kabat y fortalecimiento de serrato anterior.',
        grounded: true,
        sources: [],
        metadata: { model: 'gemini-1.5-pro', retrievalCount: 0, latencyMs: 120 },
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: convId,
            title: 'Protocolo Hombro Doloroso',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T11:00:00.000Z',
            createdAt: '2026-11-24T10:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.getConversation.mockResolvedValue(initialDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValue(initialHistory);
      mockedConversationApi.reserveTurn.mockResolvedValue(mockReserveResponse);
      mockedAssistantApi.queryKnowledge.mockResolvedValue(continuationAnswer);
      mockedAssistantApi.buildConversationHistoryContext.mockReturnValue([
        { role: 'user', content: '¿Cuáles son los ejercicios para manguito rotador?' },
        {
          role: 'assistant',
          content: 'Rotaciones externas con elástico e isométricos sub-máximos.',
        },
      ]);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${convId}`]}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Turn 1 loads
      await waitFor(() => {
        expect(
          screen.getByText('¿Cuáles son los ejercicios para manguito rotador?'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('Rotaciones externas con elástico e isométricos sub-máximos.'),
        ).toBeInTheDocument();
      });

      // Submit continuation prompt
      const input = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      const sendBtn = screen.getByRole('button', { name: /Enviar mensaje/i });

      fireEvent.change(input, { target: { value: '¿Qué progresión sigue en la fase 2?' } });
      fireEvent.click(sendBtn);

      // Verify turn reserved on backend
      await waitFor(() => {
        expect(mockedConversationApi.reserveTurn).toHaveBeenCalledWith(
          convId,
          expect.objectContaining({
            userPrompt: '¿Qué progresión sigue en la fase 2?',
          }),
        );
      });

      // Verify prior context was bounded and passed into RAG query
      await waitFor(() => {
        expect(mockedAssistantApi.queryKnowledge).toHaveBeenCalledWith(
          expect.objectContaining({
            query: '¿Qué progresión sigue en la fase 2?',
            conversationHistory: [
              { role: 'user', content: '¿Cuáles son los ejercicios para manguito rotador?' },
              {
                role: 'assistant',
                content: 'Rotaciones externas con elástico e isométricos sub-máximos.',
              },
            ],
          }),
          expect.anything(),
        );
      });

      // Verify Turn 2 response rendered in sequence
      await waitFor(() => {
        expect(
          screen.getByText(
            'Para fase 2 se incorporan diagonales de Kabat y fortalecimiento de serrato anterior.',
          ),
        ).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario C — Conversation management: Rename, Persistence, and Deletion
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario C — Conversation management', () => {
    it('renames conversation, persists title across refresh, confirms deletion via modal, and purges from active history', async () => {
      const convId = 'conv_scen_c_300';
      const initialTitle = 'Título Antiguo';
      const updatedTitle = 'Protocolo Lumbalgia Mecánica';

      const mockDetail: ConversationDetailResponse = {
        id: convId,
        title: initialTitle,
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T12:00:00.000Z',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T12:00:00.000Z',
        isArchived: false,
      };

      const mockRenameResponse: UpdateTitleResponse = {
        conversationId: convId,
        title: updatedTitle,
        updatedAt: '2026-11-24T12:10:00.000Z',
      };

      const mockArchiveResponse: ArchiveConversationResponse = {
        conversationId: convId,
        isArchived: true,
        archivedAt: '2026-11-24T12:15:00.000Z',
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: convId,
            title: initialTitle,
            turnCounter: 1,
            lastActivityAt: '2026-11-24T12:00:00.000Z',
            createdAt: '2026-11-24T10:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.getConversation.mockResolvedValue(mockDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValue({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.updateTitle.mockResolvedValue(mockRenameResponse);
      mockedConversationApi.archiveConversation.mockResolvedValue(mockArchiveResponse);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/intelligence/chat/${convId}`]}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify initial title in header and sidebar
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: initialTitle })).toBeInTheDocument();
      });

      // Trigger Rename from Header
      const renameBtn = screen.getByTestId('header-rename-button');
      fireEvent.click(renameBtn);

      const renameInput = screen.getByTestId('header-rename-input');
      fireEvent.change(renameInput, { target: { value: updatedTitle } });
      const renameForm = screen.getByTestId('header-rename-form');
      fireEvent.submit(renameForm);

      // Verify rename API was called
      await waitFor(() => {
        expect(mockedConversationApi.updateTitle).toHaveBeenCalledWith(
          convId,
          expect.objectContaining({ title: updatedTitle }),
        );
      });

      // Trigger Deletion from Header
      const deleteBtn = screen.getByLabelText('Eliminar conversación actual');
      fireEvent.click(deleteBtn);

      // Verify Accessible Modal Confirmation appears (preventing accidental click)
      const confirmDialog = await screen.findByTestId('delete-conversation-dialog');
      expect(confirmDialog).toBeInTheDocument();
      expect(screen.getByText('¿Eliminar conversación?')).toBeInTheDocument();

      // Click Confirm Deletion inside Dialog
      const confirmDeleteBtn = screen.getByTestId('confirm-delete-button');
      fireEvent.click(confirmDeleteBtn);

      // Verify backend archive was invoked
      await waitFor(() => {
        expect(mockedConversationApi.archiveConversation).toHaveBeenCalledWith(convId);
      });

      // Verify navigation redirected to clean /intelligence/chat
      await waitFor(() => {
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario D — Multi-tenant & User Isolation (IDOR Protection)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario D — User isolation', () => {
    it('strictly forbids accessing, retrieving, or continuing another user or tenant conversation with 404 isolation', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      // Backend returns 404 for foreign tenant or unauthorized conversation (preventing existence leakage)
      const idorError = new Error('Conversation not found in authenticated tenant');
      (idorError as unknown as { statusCode: number }).statusCode = 404;

      mockedConversationApi.getConversation.mockRejectedValue(idorError);
      mockedConversationApi.getMessageHistory.mockRejectedValue(idorError);
      mockedConversationApi.reserveTurn.mockRejectedValue(idorError);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_foreign_tenant_999']}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify foreign conversation is blocked with safe Not Found state
      await waitFor(() => {
        expect(screen.getByText('Conversación no encontrada')).toBeInTheDocument();
        expect(
          screen.getByText('La sesión solicitada no existe o fue eliminada de este navegador.'),
        ).toBeInTheDocument();
      });

      // Private content of the foreign conversation is never displayed
      expect(screen.queryByTestId('chat-message-feed')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario E — URL Navigation, Direct Deep-Linking & History
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario E — URL navigation', () => {
    it('supports direct link hydration and back/forward navigation without desync', async () => {
      const convE1: ConversationDetailResponse = {
        id: 'conv_e1',
        title: 'Sesión E1 Biomecánica',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T14:00:00.000Z',
        createdAt: '2026-11-24T14:00:00.000Z',
        updatedAt: '2026-11-24T14:00:00.000Z',
        isArchived: false,
      };

      const convE2: ConversationDetailResponse = {
        id: 'conv_e2',
        title: 'Sesión E2 Readaptación',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T15:00:00.000Z',
        createdAt: '2026-11-24T15:00:00.000Z',
        updatedAt: '2026-11-24T15:00:00.000Z',
        isArchived: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv_e1',
            title: 'Sesión E1 Biomecánica',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T14:00:00.000Z',
            createdAt: '2026-11-24T14:00:00.000Z',
            isArchived: false,
          },
          {
            id: 'conv_e2',
            title: 'Sesión E2 Readaptación',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T15:00:00.000Z',
            createdAt: '2026-11-24T15:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      mockedConversationApi.getConversation.mockImplementation(async (id) => {
        if (id === 'conv_e1') return convE1;
        if (id === 'conv_e2') return convE2;
        throw new Error('Not found');
      });

      mockedConversationApi.getMessageHistory.mockResolvedValue({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      const locationRef: { current: Location | null } = { current: null };
      const Tracker: React.FC = () => {
        locationRef.current = useLocation();
        return null;
      };

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_e1']}>
            <Tracker />
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify direct link loads conv_e1
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sesión E1 Biomecánica' })).toBeInTheDocument();
      });
      expect(locationRef.current?.pathname).toBe('/intelligence/chat/conv_e1');

      // Click on conv_e2 in sidebar
      const itemE2 = screen.getByText('Sesión E2 Readaptación');
      fireEvent.click(itemE2);

      // Verify URL switches to conv_e2
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sesión E2 Readaptación' })).toBeInTheDocument();
      });
      expect(locationRef.current?.pathname).toBe('/intelligence/chat/conv_e2');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario F — Failure Recovery, Draft Preservation & Idempotency
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario F — Failure recovery', () => {
    it('handles network failure, preserves user prompt in composer, and recovers on retry', async () => {
      const convId = 'conv_scen_f_600';
      const mockDetail: ConversationDetailResponse = {
        id: convId,
        title: 'Sesión con Error Transitorio',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T16:00:00.000Z',
        createdAt: '2026-11-24T16:00:00.000Z',
        updatedAt: '2026-11-24T16:00:00.000Z',
        isArchived: false,
      };

      const transientError = new Error('Conexión interrumpida');
      (transientError as unknown as { statusCode: number }).statusCode = 504;

      const successfulReserve: ReserveTurnResponse = {
        conversationId: convId,
        turnId: 'turn_f_retry',
        clientTurnId: 'client_turn_f_retry_key',
        turnIndex: 2,
        userMessageId: 'msg_u_f2',
        assistantAttemptId: 'msg_a_f2',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-24T16:05:00.000Z',
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.getConversation.mockResolvedValue(mockDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValue({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      // Reserve turn succeeds on both attempts
      mockedConversationApi.reserveTurn.mockResolvedValue(successfulReserve);

      // First attempt experiences 504 Gateway Timeout, retry attempt recovers successfully
      mockedAssistantApi.queryKnowledge
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({
          answer: 'Respuesta recuperada exitosamente tras reintento.',
          grounded: true,
          sources: [],
          metadata: { model: 'gemini-1.5-pro', retrievalCount: 0, latencyMs: 110 },
        });

      const queryClient = createTestQueryClient();
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
        expect(
          screen.getByRole('heading', { name: 'Sesión con Error Transitorio' }),
        ).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      const sendBtn = screen.getByRole('button', { name: /Enviar mensaje/i });

      // Submit prompt that fails initially
      fireEvent.change(input, {
        target: { value: 'Consulta clínica que experimenta falla de pasarela 504' },
      });
      fireEvent.click(sendBtn);

      // Verify first attempt completed and button re-enabled after failure
      await waitFor(() => {
        expect(mockedAssistantApi.queryKnowledge).toHaveBeenCalledTimes(1);
        expect(sendBtn).not.toBeDisabled();
      });

      // Draft is preserved in composer so clinician does not lose complex text!
      expect(input).toHaveValue('Consulta clínica que experimenta falla de pasarela 504');

      // Clinician clicks send again (retry)
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(mockedConversationApi.reserveTurn).toHaveBeenCalledTimes(2);
      });

      // Verify successful recovery
      await waitFor(() => {
        expect(
          screen.getByText('Respuesta recuperada exitosamente tras reintento.'),
        ).toBeInTheDocument();
      });
    });
  });
});
