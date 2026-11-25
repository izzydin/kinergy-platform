import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChatWorkspace } from '../components/chat-workspace';
import { ChatMessageFeed } from '../components/chat-message-feed';
import { conversationApi } from '../api/conversation.api';
import type {
  ConversationDetailResponse,
  MessageHistoryResponse,
  CitationPreviewResponse,
  CitationDetailResponse,
} from '../types/conversation-contract.types';
import type { ChatMessage } from '../types/assistant.types';

jest.mock('../api/conversation.api');
const mockedConversationApi = jest.mocked(conversationApi);

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ['/intelligence/chat/conv-hist-1'] }: { initialEntries?: string[] } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/intelligence/chat" element={ui} />
          <Route path="/intelligence/chat/:conversationId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AI-09.4-CIT.07 — Citation Navigation & Historical Reconstruction Tests', () => {
  const conversationId = 'conv-hist-1';

  const mockConversationDetail: ConversationDetailResponse = {
    id: conversationId,
    title: 'Evaluación Articular y Tendinopatías',
    turnCounter: 2,
    messageCounter: 4,
    lastActivityAt: '2026-11-25T10:00:00.000Z',
    createdAt: '2026-11-25T09:30:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    isArchived: false,
    turns: [
      {
        id: 'turn-1',
        turnIndex: 1,
        status: 'COMPLETED',
        clientTurnId: 'ct-1',
        activeAttemptId: 'msg-ast-1',
        activeAttemptNumber: 1,
        createdAt: '2026-11-25T09:30:00.000Z',
        completedAt: '2026-11-25T09:30:05.000Z',
      },
      {
        id: 'turn-2',
        turnIndex: 2,
        status: 'COMPLETED',
        clientTurnId: 'ct-2',
        activeAttemptId: 'msg-ast-2',
        activeAttemptNumber: 1,
        createdAt: '2026-11-25T09:45:00.000Z',
        completedAt: '2026-11-25T09:45:05.000Z',
      },
    ],
  };

  const mockMessageHistory: MessageHistoryResponse = {
    messages: [
      {
        id: 'msg-usr-1',
        turnId: 'turn-1',
        role: 'USER',
        sequenceNumber: 1,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: '¿Cuál es el protocolo de carga progresiva para tendinopatía rotuliana?',
        createdAt: '2026-11-25T09:30:00.000Z',
        completedAt: '2026-11-25T09:30:00.000Z',
        sources: null,
      },
      {
        id: 'msg-ast-1',
        turnId: 'turn-1',
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content:
          'Se recomienda iniciar con contracciones isométricas de 45 segundos para analgesia [1], seguido de carga isotónica lenta pesada [2].',
        createdAt: '2026-11-25T09:30:02.000Z',
        completedAt: '2026-11-25T09:30:05.000Z',
        sources: [
          {
            citationId: 'cite-001',
            documentId: 'doc-patella-101',
            documentTitle: 'Protocolo Clínico de Tendinopatía Patelar',
            chunkId: 'chk-pat-01',
            excerpt:
              'Los ejercicios isométricos mantenidos a 60 grados de flexión reducen el dolor cortical inmediato.',
            pageNumber: 12,
            headingPath: ['Fase 1: Manejo del Dolor', 'Isométricos Analgésicos'],
            relevanceScore: 0.96,
            retrievalRank: 1,
            canPreview: true,
          },
          {
            citationId: 'cite-002',
            documentId: 'doc-heavy-slow-202',
            documentTitle: 'Entrenamiento con Carga Lenta y Pesada',
            chunkId: 'chk-hsl-04',
            excerpt:
              'El protocolo HSR estimula la síntesis de colágeno tipo I con 3 series de 6 repeticiones.',
            pageNumber: 45,
            headingPath: ['Fase 2: Adaptación Estructural'],
            relevanceScore: 0.89,
            retrievalRank: 2,
            canPreview: true,
          },
        ],
      },
      {
        id: 'msg-usr-2',
        turnId: 'turn-2',
        role: 'USER',
        sequenceNumber: 3,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: '¿Cuándo se permite el retorno a saltos pliométricos?',
        createdAt: '2026-11-25T09:45:00.000Z',
        completedAt: '2026-11-25T09:45:00.000Z',
        sources: null,
      },
      {
        id: 'msg-ast-2',
        turnId: 'turn-2',
        role: 'ASSISTANT',
        sequenceNumber: 4,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content:
          'El retorno a actividades de almacenamiento de energía elástica requiere simetría de fuerza superior al 85% [1].',
        createdAt: '2026-11-25T09:45:02.000Z',
        completedAt: '2026-11-25T09:45:05.000Z',
        sources: [
          {
            citationId: 'cite-003',
            documentId: 'doc-rts-303',
            documentTitle: 'Criterios de Retorno al Deporte en Kinesiología',
            chunkId: 'chk-rts-09',
            excerpt:
              'La fase pliométrica no debe iniciarse si existe dolor matutino residual o LSI menor al 85%.',
            pageNumber: 88,
            headingPath: ['Fase 3: Almacenamiento de Energía y Retorno'],
            relevanceScore: 0.93,
            retrievalRank: 1,
            canPreview: true,
          },
        ],
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const mockCitationDetail: CitationDetailResponse = {
    id: 'cite-001',
    messageId: 'msg-ast-1',
    turnId: 'turn-1',
    conversationId,
    documentId: 'doc-patella-101',
    documentTitleSnapshot: 'Protocolo Clínico de Tendinopatía Patelar',
    documentTitle: 'Protocolo Clínico de Tendinopatía Patelar',
    citationPosition: 1,
    excerpt:
      'Los ejercicios isométricos mantenidos a 60 grados de flexión reducen el dolor cortical inmediato.',
    pageNumber: 12,
    headingPath: ['Fase 1: Manejo del Dolor', 'Isométricos Analgésicos'],
    relevanceScore: 0.96,
    retrievalRank: 1,
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
    mimeType: 'application/pdf',
    fileSizeBytes: 2048500,
  };

  const mockCitationPreview: CitationPreviewResponse = {
    documentId: 'doc-patella-101',
    citationId: 'cite-001',
    messageId: 'msg-ast-1',
    conversationId,
    documentTitleSnapshot: 'Protocolo Clínico de Tendinopatía Patelar',
    documentTitle: 'Protocolo Clínico de Tendinopatía Patelar',
    originalFileName: 'guia_tendinopatia_patelar.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 2048500,
    pageNumber: 12,
    headingPath: ['Fase 1: Manejo del Dolor', 'Isométricos Analgésicos'],
    excerpt:
      'Los ejercicios isométricos mantenidos a 60 grados de flexión reducen el dolor cortical inmediato.',
    canPreview: true,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_AVAILABLE',
    downloadAllowed: true,
    previewToken: 'mock_token_hmac_123',
    previewUrl:
      '/api/v1/ai/conversations/conv-hist-1/messages/msg-ast-1/citations/cite-001/content',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedConversationApi.listConversations.mockResolvedValue({
      items: [
        {
          id: conversationId,
          title: 'Evaluación Articular y Tendinopatías',
          turnCounter: 2,
          lastActivityAt: '2026-11-25T10:00:00.000Z',
          createdAt: '2026-11-25T09:30:00.000Z',
          isArchived: false,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    mockedConversationApi.getConversation.mockResolvedValue(mockConversationDetail);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockMessageHistory);
    mockedConversationApi.getCitationDetail.mockResolvedValue(mockCitationDetail);
    mockedConversationApi.getCitationPreview.mockResolvedValue(mockCitationPreview);
    mockedConversationApi.getCitationDocumentContentUrl.mockImplementation(
      (cId, mId, citId, token) =>
        `/api/v1/ai/conversations/${cId}/messages/${mId}/citations/${citId}/content?token=${token}`,
    );
  });

  it('1. historical messages reconstruct and render their persisted citations', async () => {
    renderWithProviders(<ChatWorkspace />);

    // Assert messages are rendered
    await waitFor(() => {
      expect(
        screen.getByText(/protocolo de carga progresiva para tendinopatía rotuliana/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/iniciar con contracciones isométricas de 45 segundos/i),
    ).toBeInTheDocument();

    // Assert citations tray is rendered for assistant message 1
    const tray1 = screen.getAllByTestId('message-citations')[0];
    expect(tray1).toBeInTheDocument();
    expect(tray1).toHaveTextContent(/Fuentes verificadas \(2\):/i);

    // Assert badges with numbering [1], [2] and titles
    const badge1 = screen.getAllByTestId('citation-badge-1')[0]!;
    expect(badge1).toHaveTextContent('[1]');
    expect(badge1).toHaveTextContent('Protocolo Clínico de Tendinopatía Patelar');
    expect(badge1).toHaveTextContent('p.12');

    const badge2 = screen.getByTestId('citation-badge-2');
    expect(badge2).toHaveTextContent('[2]');
    expect(badge2).toHaveTextContent('Entrenamiento con Carga Lenta y Pesada');
    expect(badge2).toHaveTextContent('p.45');
  });

  it('2. multiple assistant messages each maintain their independent citation sets', async () => {
    renderWithProviders(<ChatWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByTestId('message-citations')).toHaveLength(2);
    });

    const trays = screen.getAllByTestId('message-citations');

    // Message 1 tray has 2 citations
    expect(trays[0]).toHaveTextContent(/Fuentes verificadas \(2\):/i);
    expect(trays[0]).toHaveTextContent('Protocolo Clínico de Tendinopatía Patelar');
    expect(trays[0]).toHaveTextContent('Entrenamiento con Carga Lenta y Pesada');

    // Message 2 tray has 1 citation
    expect(trays[1]).toHaveTextContent(/Fuentes verificadas \(1\):/i);
    expect(trays[1]).toHaveTextContent('Criterios de Retorno al Deporte en Kinesiología');
    expect(trays[1]).toHaveTextContent('p.88');
  });

  it('3. pagination compatibility: loading older messages into feed preserves citations without duplication', async () => {
    const olderUserMessage: ChatMessage = {
      id: 'msg-older-usr',
      role: 'user',
      content: 'Consulta más antigua sobre rodilla.',
      createdAt: '2026-11-25T08:00:00.000Z',
      sequenceNumber: 0,
      status: 'success',
    };

    const olderAssistantMessage: ChatMessage = {
      id: 'msg-older-ast',
      role: 'assistant',
      content: 'Respuesta más antigua basada en guía inicial [1].',
      createdAt: '2026-11-25T08:00:05.000Z',
      sequenceNumber: 0.5,
      status: 'success',
      sources: [
        {
          citationId: 'cite-older-001',
          documentId: 'doc-older-999',
          documentTitle: 'Guía Anatómica de Rodilla',
          chunkId: 'chk-old-1',
          pageNumber: 3,
          relevanceScore: 0.9,
          canPreview: true,
        },
      ],
    };

    const currentMessages: ChatMessage[] = [
      {
        id: 'msg-ast-1',
        role: 'assistant',
        content: 'Respuesta actual [1].',
        createdAt: '2026-11-25T09:30:00.000Z',
        sequenceNumber: 2,
        status: 'success',
        sources: [
          {
            citationId: 'cite-001',
            documentId: 'doc-patella-101',
            documentTitle: 'Protocolo Clínico de Tendinopatía Patelar',
            chunkId: 'chk-pat-01',
            pageNumber: 12,
            relevanceScore: 0.95,
            canPreview: true,
          },
        ],
      },
    ];

    const onLoadMoreMock = jest.fn();

    const { rerender } = render(
      <ChatMessageFeed
        messages={currentMessages}
        conversationId={conversationId}
        hasMoreMessages={true}
        onLoadMoreMessages={onLoadMoreMock}
      />,
    );

    expect(screen.getByText('Cargar mensajes anteriores')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cargar mensajes anteriores'));
    expect(onLoadMoreMock).toHaveBeenCalledTimes(1);

    // Simulate page reconciliation with older messages prepended
    rerender(
      <ChatMessageFeed
        messages={[olderUserMessage, olderAssistantMessage, ...currentMessages]}
        conversationId={conversationId}
        hasMoreMessages={false}
        onLoadMoreMessages={onLoadMoreMock}
      />,
    );

    // Older citation is now present
    expect(screen.getByText('Guía Anatómica de Rodilla')).toBeInTheDocument();
    // Current citation is still present without duplicate IDs
    expect(screen.getByText('Protocolo Clínico de Tendinopatía Patelar')).toBeInTheDocument();
    expect(screen.getAllByTestId('message-citations')).toHaveLength(2);
  });

  it('4. clicking a citation badge opens the detail dialog with message context', async () => {
    renderWithProviders(<ChatWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByTestId('citation-badge-1')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByTestId('citation-badge-1')[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('citation-open-document-link')).toBeInTheDocument();
    });

    expect(
      screen.getAllByText(/Protocolo Clínico de Tendinopatía Patelar/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('citation-open-document-link')).toHaveTextContent(
      'Ver documento original',
    );
  });

  it('5. document preview navigation updates URL search params and return-to-message closes modal', async () => {
    renderWithProviders(<ChatWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByTestId('citation-badge-1')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByTestId('citation-badge-1')[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('citation-open-document-link')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('citation-open-document-link'));

    // Document preview modal opens and loads preview data
    await waitFor(() => {
      expect(screen.getByTestId('return-to-message-button')).toBeInTheDocument();
    });

    expect(mockedConversationApi.getCitationPreview).toHaveBeenCalledWith(
      conversationId,
      'msg-ast-1',
      'cite-001',
      expect.anything(),
    );

    // Return to message button is present in the context banner
    const returnBtn = screen.getByTestId('return-to-message-button');
    expect(returnBtn).toBeInTheDocument();
    expect(returnBtn).toHaveTextContent('Volver al mensaje');

    // Click return to message
    fireEvent.click(returnBtn);

    // Preview modal closes
    await waitFor(() => {
      expect(screen.queryByTestId('document-preview-modal')).not.toBeInTheDocument();
    });
  });

  it('6. browser refresh / direct link simulation: initial preview search params automatically restore preview dialog', async () => {
    // Initial entry has citation preview query params
    const initialUrl = `/intelligence/chat/${conversationId}?preview=cite-001&messageId=msg-ast-1&doc=doc-patella-101&page=12`;

    renderWithProviders(<ChatWorkspace />, { initialEntries: [initialUrl] });

    // Preview dialog mounts and loads automatically
    await waitFor(() => {
      expect(screen.getByTestId('document-preview-modal')).toBeInTheDocument();
    });

    expect(mockedConversationApi.getCitationPreview).toHaveBeenCalledWith(
      conversationId,
      'msg-ast-1',
      'cite-001',
      expect.anything(),
    );
  });

  it('7. historical messages without citations render cleanly without errors', async () => {
    const ungroundedHistory: MessageHistoryResponse = {
      messages: [
        {
          id: 'msg-simple-1',
          turnId: 'turn-simple',
          role: 'ASSISTANT',
          sequenceNumber: 1,
          attemptNumber: 1,
          isCanonical: true,
          status: 'SUCCESS',
          content: 'Hola, ¿en qué puedo ayudarte hoy?',
          createdAt: '2026-11-25T09:00:00.000Z',
          completedAt: '2026-11-25T09:00:01.000Z',
          sources: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    mockedConversationApi.getMessageHistory.mockResolvedValueOnce(ungroundedHistory);

    renderWithProviders(<ChatWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Hola, ¿en qué puedo ayudarte hoy?')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();
  });
});
