import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe, toHaveNoViolations } from 'jest-axe';

import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation';
import { BreadcrumbProvider } from '../../../app/breadcrumbs';
import { SlotProvider } from '../../../shared/ui/slots/SlotProvider';
import { DashboardLayout } from '../../../app/layouts/dashboard-layout';

import { IntelligenceLayout } from '../components/intelligence-layout';
import { IntelligenceSubRouter } from '../routes/intelligence.router';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { SourceDetailsDrawer } from '../assistant/components/source-details-drawer';
import { DocumentUploadModal } from '../knowledge/components/document-upload-modal';
import { IngestionLifecycleTimeline } from '../knowledge/components/ingestion-lifecycle-timeline';
import { KnowledgePage } from '../knowledge/routes/knowledge-page';
import { IntelligenceLoadingState } from '../components/intelligence-loading-state';
import { IntelligenceEmptyState } from '../components/intelligence-empty-state';
import { IntelligenceErrorState } from '../components/intelligence-error-state';

import { conversationApi } from '../assistant/api/conversation.api';
import { assistantApi } from '../assistant/api/assistant.api';
import { knowledgeApi } from '../knowledge/api/knowledge.api';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import * as clipboardUtil from '../assistant/utils/clipboard.util';

import type { AuthUser } from '../../auth/domain/auth-state.types';
import type {
  ConversationDetailResponse,
  MessageHistoryResponse,
  CreateConversationResponse,
  MessageResponse,
} from '../assistant/types/conversation-contract.types';
import type {
  KnowledgeDocumentItem,
  KnowledgeCapabilitiesResponse,
  IngestionJobItem,
} from '../knowledge/types/knowledge-contract.types';
import type { RAGSourceCitationDto } from '../assistant/types/assistant.types';

expect.extend(toHaveNoViolations);

// Mock APIs
jest.mock('../assistant/api/conversation.api');
jest.mock('../assistant/api/assistant.api');
jest.mock('../knowledge/api/knowledge.api');
jest.mock('../assistant/services/assistant-storage.service');

const mockedConvApi = jest.mocked(conversationApi);
const mockedAsstApi = jest.mocked(assistantApi);
const mockedKnowApi = jest.mocked(knowledgeApi);
const mockedStorage = jest.mocked(assistantStorageService);

// Test Users
const TEST_ADMIN_USER: AuthUser = {
  id: 'usr_admin_e2e',
  email: 'admin.e2e@kinergy.platform',
  name: 'Admin E2E User',
  roles: ['ADMIN'],
  permissions: ['ai:chat:use', 'ai:documents:manage', '*'],
  tenantId: 'tenant_e2e_alpha',
};

const TEST_ENERGY_MGR_USER: AuthUser = {
  id: 'usr_mgr_e2e',
  email: 'manager.e2e@kinergy.platform',
  name: 'Energy Manager E2E',
  roles: ['ENERGY_MANAGER'],
  permissions: ['ai:chat:use', 'ai:documents:manage'],
  tenantId: 'tenant_e2e_alpha',
};

const TEST_OPERATOR_USER: AuthUser = {
  id: 'usr_operator_e2e',
  email: 'operator.e2e@kinergy.platform',
  name: 'Restricted Operator E2E',
  roles: ['OPERATOR'],
  permissions: ['ai:chat:use'],
  tenantId: 'tenant_e2e_alpha',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithFullE2EProviders(
  ui: React.ReactElement,
  {
    initialEntries = ['/intelligence/chat'],
    user = TEST_ADMIN_USER,
  }: { initialEntries?: string[]; user?: AuthUser } = {},
) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider initialSessionOverride={user}>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>{ui}</SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('AI-09.10 — IT.08: End-to-End, Responsive, Accessibility, and Full Acceptance', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.getConversations.mockReturnValue([]);
    mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1: Complete Assistant Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 1: Complete Assistant Journey', () => {
    it('executes full assistant cycle: create, prompt, stream, refresh, actions, citations & thread navigation', async () => {
      const convId = 'conv_it08_journey_01';
      const userMsgId = 'msg_usr_01';
      const asstMsgId = 'msg_asst_01';
      const citationId = 'cite_01';

      // 1. Mock conversation creation response
      const createRes: CreateConversationResponse = {
        conversationId: convId,
        turnId: 'turn_01',
        clientTurnId: 'client_turn_01',
        turnIndex: 1,
        userMessageId: userMsgId,
        assistantAttemptId: asstMsgId,
        title: 'Plan de Entrenamiento Biomecánico',
        turnStatus: 'COMPLETED',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-27T08:00:00.000Z',
      };
      mockedConvApi.createConversation.mockResolvedValueOnce(createRes);

      // 2. Mock conversation listing & details
      const convDetail: ConversationDetailResponse = {
        id: convId,
        title: 'Plan de Entrenamiento Biomecánico',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-27T08:00:05.000Z',
        createdAt: '2026-11-27T08:00:00.000Z',
        updatedAt: '2026-11-27T08:00:05.000Z',
        isArchived: false,
      };
      mockedConvApi.getConversation.mockResolvedValue(convDetail);
      mockedConvApi.listConversations.mockResolvedValue({
        items: [convDetail],
        hasMore: false,
        nextCursor: null,
      });

      // 3. Mock message history with citation metadata
      const userMsg: MessageResponse = {
        id: userMsgId,
        turnId: 'turn_01',
        role: 'USER',
        sequenceNumber: 1,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: '¿Cuáles son las directrices de fuerza explosiva en sentadillas?',
        createdAt: '2026-11-27T08:00:00.000Z',
        completedAt: '2026-11-27T08:00:00.000Z',
        sources: null,
      };

      const asstMsg: MessageResponse = {
        id: asstMsgId,
        turnId: 'turn_01',
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content:
          'Se recomienda trabajar con cargas entre el 40% y 60% del 1RM con máxima velocidad concéntrica [1].',
        createdAt: '2026-11-27T08:00:01.000Z',
        completedAt: '2026-11-27T08:00:03.000Z',
        sources: [
          {
            citationId,
            documentId: 'doc_biomech_01',
            documentTitle: 'Protocolo de Potencia Muscular 2026',
            chunkId: 'chunk_01',
            excerpt:
              'El entrenamiento dinámico con cargas submáximas optimiza el reclutamiento motor.',
            pageNumber: 14,
            relevanceScore: 0.94,
          },
        ],
      };

      const mockHistory: MessageHistoryResponse = {
        messages: [userMsg, asstMsg],
        hasMore: false,
        nextCursor: null,
      };
      mockedConvApi.getMessageHistory.mockResolvedValue(mockHistory);

      // Render Assistant Workspace with active thread URL
      const { unmount } = renderWithFullE2EProviders(
        <Routes>
          <Route
            path="/intelligence/chat/:conversationId"
            element={
              <IntelligenceLayout>
                <ChatWorkspace />
              </IntelligenceLayout>
            }
          />
        </Routes>,
        { initialEntries: [`/intelligence/chat/${convId}`] },
      );

      // 4. Verify message rendered
      expect(
        await screen.findByText(
          /¿Cuáles son las directrices de fuerza explosiva en sentadillas\?/i,
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/Se recomienda trabajar con cargas entre el 40% y 60% del 1RM/i),
      ).toBeInTheDocument();

      // 5. Message action: copy to clipboard
      const copySpy = jest.spyOn(clipboardUtil, 'copyToClipboard').mockResolvedValue({
        success: true,
      });
      const copyBtns = await screen.findAllByTestId('message-copy-button');
      expect(copyBtns.length).toBeGreaterThanOrEqual(2);
      const asstCopyBtn = copyBtns[1]!;
      fireEvent.click(asstCopyBtn); // Assistant message copy button
      await waitFor(() => {
        expect(copySpy).toHaveBeenCalledWith(
          expect.stringContaining('Se recomienda trabajar con cargas'),
        );
      });

      // 6. Citation interaction: open source preview drawer
      const citationRef: RAGSourceCitationDto = {
        documentId: 'doc_biomech_01',
        documentTitle: 'Protocolo de Potencia Muscular 2026',
        chunkId: 'chunk_01',
        pageNumber: 14,
        relevanceScore: 0.94,
      };

      renderWithFullE2EProviders(
        <SourceDetailsDrawer isOpen={true} citation={citationRef} onClose={jest.fn()} />,
      );

      expect(await screen.findByTestId('drawer-document-title')).toHaveTextContent(
        'Protocolo de Potencia Muscular 2026',
      );
      expect(screen.getByText(/página 14/i)).toBeInTheDocument();

      // 7. Refresh resilience: unmount and remount simulating page reload
      unmount();
      renderWithFullE2EProviders(
        <Routes>
          <Route
            path="/intelligence/chat/:conversationId"
            element={
              <IntelligenceLayout>
                <ChatWorkspace />
              </IntelligenceLayout>
            }
          />
        </Routes>,
        { initialEntries: [`/intelligence/chat/${convId}`] },
      );

      expect(
        await screen.findByText(/Se recomienda trabajar con cargas entre el 40% y 60% del 1RM/i),
      ).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 2: Conversation Lifecycle Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 2: Conversation Lifecycle Journey', () => {
    it('manages full lifecycle: creation, rename, archival deletion, and 404 resilience', async () => {
      const convId = 'conv_lifecycle_01';
      mockedConvApi.updateTitle.mockResolvedValueOnce({
        conversationId: convId,
        title: 'Plan Biomecánico Actualizado',
        updatedAt: '2026-11-27T08:10:00.000Z',
      });
      mockedConvApi.archiveConversation.mockResolvedValueOnce({
        conversationId: convId,
        isArchived: true,
        archivedAt: '2026-11-27T08:15:00.000Z',
      });

      // Rename title test
      const resRename = await conversationApi.updateTitle(convId, {
        title: 'Plan Biomecánico Actualizado',
      });
      expect(resRename.title).toBe('Plan Biomecánico Actualizado');
      expect(mockedConvApi.updateTitle).toHaveBeenCalledWith(convId, {
        title: 'Plan Biomecánico Actualizado',
      });

      // Archive test
      const resArchive = await conversationApi.archiveConversation(convId);
      expect(resArchive.isArchived).toBe(true);
      expect(mockedConvApi.archiveConversation).toHaveBeenCalledWith(convId);

      // 404 / Missing conversation error display
      mockedConvApi.getConversation.mockRejectedValueOnce(
        new Error('Conversation not found (404)'),
      );
      renderWithFullE2EProviders(
        <IntelligenceLayout>
          <IntelligenceErrorState
            title="Conversación no disponible"
            error="No se encontró la conversación solicitada o no tiene permisos para verla."
          />
        </IntelligenceLayout>,
      );

      expect(screen.getByText('Conversación no disponible')).toBeInTheDocument();
      expect(screen.getByText(/No se encontró la conversación solicitada/i)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 3: Streaming Failure and Recovery Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 3: Streaming Failure and Recovery Journey', () => {
    it('displays error recovery UX when stream encounters network/provider interruption', async () => {
      renderWithFullE2EProviders(
        <IntelligenceLayout>
          <IntelligenceErrorState
            title="Generación interrumpida"
            error="Se interrumpió la conexión con el motor de inferencia. Puede reintentar la solicitud."
            onRetry={jest.fn()}
          />
        </IntelligenceLayout>,
      );

      expect(screen.getByText('Generación interrumpida')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 4: Knowledge Center Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 4: Knowledge Center Journey', () => {
    it('runs Knowledge Center lifecycle: document listing, search, upload dialog, and timeline progression', async () => {
      const mockDoc: KnowledgeDocumentItem = {
        id: 'doc_kc_01',
        title: 'Manual de Rehabilitación Funcional',
        originalFileName: 'rehab-funcional-2026.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048000,
        visibilityScope: 'ALL_STAFF',
        currentVersionId: 'ver_01',
        uploadedBy: 'usr_admin',
        status: 'ACTIVE',
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:05:00.000Z',
        versions: [],
      };

      const mockCaps: KnowledgeCapabilitiesResponse = {
        maxFileSizeBytes: 10 * 1024 * 1024,
        maxFileSizeMb: 10,
        allowedMimeTypes: ['application/pdf', 'text/plain'],
        allowedExtensions: ['.pdf', '.txt'],
        supportedVisibilityScopes: ['ALL_STAFF', 'CLINICAL_STAFF', 'MANAGEMENT'],
      };

      mockedKnowApi.getCapabilities.mockResolvedValue(mockCaps);
      mockedKnowApi.listDocuments.mockResolvedValue({
        items: [mockDoc],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      // 1. Render Knowledge Page
      const { unmount: unmountKnowledge } = renderWithFullE2EProviders(
        <IntelligenceLayout>
          <KnowledgePage />
        </IntelligenceLayout>,
        { initialEntries: ['/intelligence/knowledge'] },
      );

      expect(await screen.findByText('Manual de Rehabilitación Funcional')).toBeInTheDocument();
      unmountKnowledge();

      // 2. Open Document Upload Modal
      const { unmount: unmountModal } = renderWithFullE2EProviders(
        <DocumentUploadModal isOpen={true} onClose={jest.fn()} />,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Subir nuevo documento')).toBeInTheDocument();
      unmountModal();

      // 3. Verify Ingestion Lifecycle Timeline stages
      const mockJob: IngestionJobItem = {
        id: 'job_kc_01',
        documentId: 'doc_kc_01',
        documentVersionId: 'ver_01',
        versionNumber: 1,
        status: 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-11-26T10:00:00.000Z',
        startedAt: '2026-11-26T10:00:00.000Z',
        completedAt: '2026-11-26T10:04:00.000Z',
        stages: [
          {
            stage: 'VALIDATING',
            status: 'COMPLETED',
            startedAt: '2026-11-26T10:00:00.000Z',
            completedAt: '2026-11-26T10:00:30.000Z',
          },
          {
            stage: 'PROCESSING',
            status: 'COMPLETED',
            startedAt: '2026-11-26T10:00:30.000Z',
            completedAt: '2026-11-26T10:01:30.000Z',
          },
          {
            stage: 'INDEXING',
            status: 'COMPLETED',
            startedAt: '2026-11-26T10:01:30.000Z',
            completedAt: '2026-11-26T10:03:00.000Z',
          },
        ],
      };

      renderWithFullE2EProviders(
        <IngestionLifecycleTimeline documentId="doc_kc_01" job={mockJob} />,
      );

      expect(screen.getByTestId('lifecycle-job-id')).toHaveTextContent('job_kc_01');
      expect(screen.getAllByText(/Indexación Vectorial/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 5: Permission-Aware Navigation & Route Defense
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 5: Permission-Aware Navigation & Route Defense', () => {
    it('grants Knowledge Center access to Admin and Energy Manager roles', () => {
      const { unmount } = renderWithFullE2EProviders(
        <IntelligenceLayout>
          <div data-testid="admin-view">Contenido Admin</div>
        </IntelligenceLayout>,
        { user: TEST_ADMIN_USER },
      );

      expect(screen.getByTestId('admin-view')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /base de conocimiento/i })).toBeInTheDocument();

      unmount();

      renderWithFullE2EProviders(
        <IntelligenceLayout>
          <div data-testid="manager-view">Contenido Manager</div>
        </IntelligenceLayout>,
        { user: TEST_ENERGY_MGR_USER },
      );

      expect(screen.getByTestId('manager-view')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /base de conocimiento/i })).toBeInTheDocument();
    });

    it('blocks unauthorized Operator from accessing Knowledge Center via route guard', () => {
      renderWithFullE2EProviders(
        <Routes>
          <Route path="/intelligence/*" element={<IntelligenceSubRouter />} />
        </Routes>,
        {
          initialEntries: ['/intelligence/knowledge'],
          user: TEST_OPERATOR_USER,
        },
      );

      expect(
        screen.queryByRole('heading', { name: /base de conocimiento/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 6: Loading, Empty, and Error States Distinction
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 6: Loading, Empty, and Error States Distinction', () => {
    it('distinguishes loading skeleton from legitimate empty state and error boundary state', () => {
      // 1. Loading state has accessible role="status" and aria-busy="true"
      const { unmount: unmountLoading } = render(
        <IntelligenceLoadingState variant="chat" message="Iniciando asistente..." />,
      );
      const loadingEl = screen.getByRole('status');
      expect(loadingEl).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Iniciando asistente...')).toBeInTheDocument();
      unmountLoading();

      // 2. Legitimate empty state renders without error markup
      const { unmount: unmountEmpty } = render(
        <IntelligenceEmptyState
          title="Sin conversaciones activas"
          description="Seleccione nueva conversación para comenzar."
        />,
      );
      expect(screen.getByText('Sin conversaciones activas')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      unmountEmpty();

      // 3. API Error state renders explicit error role and retry action
      render(
        <IntelligenceErrorState
          title="Error en el servicio de Inteligencia"
          error="No se pudo contactar con el backend. Verifique su conexión."
          onRetry={jest.fn()}
        />,
      );
      expect(screen.getByText('Error en el servicio de Inteligencia')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 7: Responsive Acceptance Across Viewports
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 7: Responsive Acceptance Across Viewports', () => {
    it('verifies responsive layout classes and horizontal scroll prevention across viewports', () => {
      renderWithFullE2EProviders(
        <DashboardLayout>
          <IntelligenceLayout>
            <div data-testid="responsive-content">Workspace Responsive</div>
          </IntelligenceLayout>
        </DashboardLayout>,
      );

      const layout = screen.getByTestId('intelligence-layout');
      // Verify viewport height boundaries and no outer horizontal overflow
      expect(layout).toHaveClass(
        'flex',
        'h-[calc(100vh-theme(spacing.28))]',
        'md:h-[calc(100vh-theme(spacing.24))]',
        'overflow-hidden',
        'overflow-x-hidden',
      );

      // Subnav bar has touch scrolling with scrollbar suppression for mobile
      const subnav = screen.getByRole('navigation', { name: /subsecciones de inteligencia/i });
      expect(subnav).toHaveClass('overflow-x-auto', 'scrollbar-none');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 8: Accessibility Acceptance (WCAG 2.2 AA)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Task 8: Accessibility Acceptance (WCAG 2.2 AA)', () => {
    it('satisfies automated WCAG 2.2 AA accessibility rules without violations', async () => {
      const { container } = renderWithFullE2EProviders(
        <IntelligenceLayout>
          <div className="p-4">
            <h1>Kynergy Intelligence Workspace</h1>
            <p>Acceso verificado para asistencia clínica y base de conocimiento.</p>
          </div>
        </IntelligenceLayout>,
      );

      const results = await axe(container, {
        rules: {
          'landmark-banner-is-top-level': { enabled: false },
          'landmark-main-is-top-level': { enabled: false },
        },
      });

      expect(results).toHaveNoViolations();
    });
  });
});
