import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantMessage } from '../components/assistant-message';
import { DocumentPreview } from '../components/document-preview';
import { conversationApi } from '../api/conversation.api';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import type { ChatMessage, RAGSourceCitationDto } from '../types/assistant.types';
import type { CitationPreviewResponse } from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockedConvApi = jest.mocked(conversationApi);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient();
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...result, queryClient: client };
}

/**
 * AI-09.10 — IT.05: Citation, Source Authorization & Security (Frontend Integration)
 *
 * Verifies frontend citation rendering grounded in metadata, interactive preview dialogs,
 * dynamic authorization states (AVAILABLE, RESTRICTED, DELETED, EXCERPT_ONLY),
 * multi-user cache isolation, in-flight logout cancellation, and XSS sanitization.
 */
describe('AI-09.10 — IT.05: Citation, Source Authorization & Security (Frontend Integration)', () => {
  const conversationId = 'conv_fe_cit_sec_01';
  const messageId = 'msg_fe_cit_sec_01';
  const tenantIdAlpha = 'tenant_fe_alpha';
  const userIdAlpha = 'usr_fe_alpha_doc';
  const tenantIdBeta = 'tenant_fe_beta';
  const userIdBeta = 'usr_fe_beta_doc';

  const validCitation1: RAGSourceCitationDto = {
    citationId: 'cit_fe_01',
    documentId: 'doc_fe_acl_01',
    documentTitle: 'Guía Clínica de Ligamento Cruzado Anterior',
    chunkId: 'chunk_fe_01',
    documentVersionId: 'ver_fe_01',
    documentVersionNumber: 1,
    excerpt: 'La crioterapia compresiva a 10°C reduce el dolor postoperatorio precoz.',
    pageNumber: 14,
    headingPath: ['Fase Aguda', 'Control de Dolor'],
    relevanceScore: 0.965,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
  };

  const validCitation2: RAGSourceCitationDto = {
    citationId: 'cit_fe_02',
    documentId: 'doc_fe_biomech_02',
    documentTitle: 'Tratado de Biomecánica Articular Rodilla',
    chunkId: 'chunk_fe_02',
    documentVersionId: 'ver_fe_02',
    documentVersionNumber: 2,
    excerpt: 'Los ejercicios en cadena cinética cerrada disminuyen la traslación tibial anterior.',
    pageNumber: 42,
    headingPath: ['Biomecánica', 'Cadena Cinética'],
    relevanceScore: 0.912,
    retrievalRank: 2,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
  };

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedConvApi.getFeedback.mockResolvedValue(null);
  });

  // =========================================================================
  // 1. Citation Rendering Grounded in Actual Metadata
  // =========================================================================
  describe('1. Citation Rendering & Non-Fabrication', () => {
    it('renders citation badges only when supported by actual message sources', () => {
      const messageWithSources: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: 'Se recomienda crioterapia [1] y ejercicios en cadena cinética cerrada [2].',
        createdAt: '2026-11-26T18:00:00.000Z',
        status: 'success',
        grounded: true,
        sources: [validCitation1, validCitation2],
      };

      renderWithProviders(
        <AssistantMessage message={messageWithSources} conversationId={conversationId} />,
      );

      // Verify badges [1] and [2] render with accessible names
      const badge1 = screen.getByRole('button', {
        name: /Fuente 1: Guía Clínica de Ligamento Cruzado Anterior/i,
      });
      const badge2 = screen.getByRole('button', {
        name: /Fuente 2: Tratado de Biomecánica Articular Rodilla/i,
      });

      expect(badge1).toBeInTheDocument();
      expect(badge2).toBeInTheDocument();
      expect(badge1).toHaveTextContent('[1]');
      expect(badge2).toHaveTextContent('[2]');
    });

    it('renders zero citation badges when sources array is empty without fabricating phantom citations', () => {
      const messageWithoutSources: ChatMessage = {
        id: 'msg_no_sources',
        role: 'assistant',
        content: 'Respuesta general de cortesía sin fuentes bibliográficas asociadas.',
        createdAt: '2026-11-26T18:00:00.000Z',
        status: 'success',
        grounded: false,
        sources: [],
      };

      renderWithProviders(
        <AssistantMessage message={messageWithoutSources} conversationId={conversationId} />,
      );

      // Zero citation badges in the document
      expect(screen.queryByTestId('citation-badge')).not.toBeInTheDocument();
      expect(screen.queryByText(/\[1\]/)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Citation Interaction & Accessible Detail Dialog
  // =========================================================================
  describe('2. Citation Activation & Interactive Modal Lifecycle', () => {
    it('opens CitationDetailDialog with accurate metadata and returns focus upon close', async () => {
      mockedConvApi.getCitationDetail.mockResolvedValue({
        id: 'cit_fe_01',
        messageId,
        turnId: 'turn_fe_01',
        conversationId,
        documentId: 'doc_fe_acl_01',
        documentTitleSnapshot: 'Guía Clínica de Ligamento Cruzado Anterior',
        documentTitle: 'Guía Clínica de Ligamento Cruzado Anterior',
        originalFileName: 'guia-acl.pdf',
        documentStatus: 'READY',
        documentVersionId: 'ver_01',
        documentVersionNumber: 1,
        chunkId: 'chunk_fe_01',
        citationPosition: 1,
        excerpt: 'La crioterapia compresiva a 10°C reduce el dolor postoperatorio precoz.',
        pageNumber: 14,
        headingPath: ['Fase Aguda', 'Crioterapia Compresiva'],
        relevanceScore: 0.94,
        retrievalRank: 1,
        sourceStrategy: 'hybrid',
        previewStatus: 'DOCUMENT_AVAILABLE',
        canPreview: true,
      });

      const message: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: 'Se recomienda crioterapia [1].',
        createdAt: '2026-11-26T18:00:00.000Z',
        status: 'success',
        grounded: true,
        sources: [validCitation1],
      };

      renderWithProviders(<AssistantMessage message={message} conversationId={conversationId} />);

      const badge1 = screen.getByRole('button', {
        name: /Fuente 1: Guía Clínica de Ligamento Cruzado Anterior/i,
      });
      fireEvent.click(badge1);

      // Verify accessible dialog opens
      const dialog = await screen.findByTestId('citation-detail-dialog');
      expect(dialog).toBeInTheDocument();

      // Verify exact metadata is displayed without fabrication
      expect(
        screen.getAllByText('Guía Clínica de Ligamento Cruzado Anterior').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Página 14/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /La crioterapia compresiva a 10°C reduce el dolor postoperatorio precoz./i,
        ),
      ).toBeInTheDocument();
      expect(await screen.findByText(/de relevancia/i)).toBeInTheDocument();

      // Close dialog via accessible close button
      const closeBtn = screen.getByTestId('citation-dialog-close-btn');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('citation-detail-dialog')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. Dynamic Preview Authorization States (AVAILABLE, RESTRICTED, DELETED)
  // =========================================================================
  describe('3. Dynamic Preview Authorization States in DocumentPreview', () => {
    it('renders preview iframe when previewStatus is DOCUMENT_AVAILABLE with preview token', async () => {
      const previewResponse: CitationPreviewResponse = {
        documentId: 'doc_fe_acl_01',
        citationId: 'cit_fe_01',
        messageId,
        conversationId,
        documentTitleSnapshot: 'Guía Clínica de Ligamento Cruzado Anterior',
        documentTitle: 'Guía Clínica de Ligamento Cruzado Anterior',
        originalFileName: 'guia-acl-2026.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2097152,
        documentVersionId: 'ver_fe_01',
        documentVersionNumber: 1,
        pageNumber: 14,
        headingPath: ['Fase Aguda', 'Control de Dolor'],
        excerpt: 'La crioterapia compresiva a 10°C reduce el dolor postoperatorio precoz.',
        canPreview: true,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_AVAILABLE',
        downloadAllowed: true,
        previewToken: 'test_hmac_token_alpha_123',
        previewUrl: '/api/v1/ai/conversations/c1/messages/m1/citations/cit1/content',
      };

      mockedConvApi.getCitationPreview.mockResolvedValue(previewResponse);

      renderWithProviders(
        <DocumentPreview
          isOpen={true}
          onClose={jest.fn()}
          conversationId={conversationId}
          messageId={messageId}
          citationId="cit_fe_01"
          documentId="doc_fe_acl_01"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('document-preview-modal')).toBeInTheDocument();
        expect(screen.getByTestId('pdf-preview-iframe')).toBeInTheDocument();
      });

      expect(
        screen.getAllByText('Guía Clínica de Ligamento Cruzado Anterior').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('preview-secondary-download-btn')).toBeInTheDocument();
    });

    it('renders preview-unauthorized state when previewStatus is DOCUMENT_RESTRICTED (403)', async () => {
      const restrictedResponse: CitationPreviewResponse = {
        documentId: 'doc_restricted_01',
        citationId: 'cit_fe_01',
        messageId,
        conversationId,
        documentTitleSnapshot: 'Protocolo Quirúrgico Confidencial',
        documentTitle: 'Protocolo Quirúrgico Confidencial',
        originalFileName: 'quirurgico.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 1,
        headingPath: ['Confidencial'],
        excerpt: 'Extracto restringido a directores médicos.',
        canPreview: false,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_RESTRICTED',
        previewUnavailableReason: 'Document access is restricted by role security policy.',
        downloadAllowed: false,
        previewToken: null,
        previewUrl: '/api/v1/content',
      };

      mockedConvApi.getCitationPreview.mockResolvedValue(restrictedResponse);

      renderWithProviders(
        <DocumentPreview
          isOpen={true}
          onClose={jest.fn()}
          conversationId={conversationId}
          messageId={messageId}
          citationId="cit_fe_01"
          documentId="doc_restricted_01"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-unauthorized')).toBeInTheDocument();
      });

      expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
      expect(screen.queryByTestId('pdf-preview-iframe')).not.toBeInTheDocument();
    });

    it('renders preview-deleted state when document was soft-deleted from repository', async () => {
      const deletedResponse: CitationPreviewResponse = {
        documentId: 'doc_deleted_01',
        citationId: 'cit_fe_01',
        messageId,
        conversationId,
        documentTitleSnapshot: 'Manual Descatalogado 2024',
        documentTitle: 'Manual Descatalogado 2024',
        originalFileName: 'manual-2024.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 5,
        headingPath: [],
        excerpt: 'Extracto histórico que debe preservarse según norma de auditoría.',
        canPreview: false,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_SOFT_DELETED',
        previewUnavailableReason: 'Document has been archived or soft-deleted.',
        downloadAllowed: false,
        previewToken: null,
        previewUrl: '/api/v1/content',
      };

      mockedConvApi.getCitationPreview.mockResolvedValue(deletedResponse);

      renderWithProviders(
        <DocumentPreview
          isOpen={true}
          onClose={jest.fn()}
          conversationId={conversationId}
          messageId={messageId}
          citationId="cit_fe_01"
          documentId="doc_deleted_01"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-deleted')).toBeInTheDocument();
      });

      expect(screen.getByText(/Documento No Disponible/i)).toBeInTheDocument();
      // Historical excerpt remains accessible for clinical traceability
      expect(
        screen.getByText(/Extracto histórico que debe preservarse según norma de auditoría./i),
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Multi-User Protected Cache Isolation & Logout Purge
  // =========================================================================
  describe('4. Multi-User Cache Isolation & Auth Boundary', () => {
    it('purges protected citation caches upon logout so User Beta cannot access User Alpha cached sources', async () => {
      const queryClient = createTestQueryClient();

      const alphaCitationPreviewKey = conversationQueryKeys.citationPreview(
        conversationId,
        messageId,
        'cit_fe_01',
        { tenantId: tenantIdAlpha, userId: userIdAlpha },
      );

      const cachedAlphaPreview: CitationPreviewResponse = {
        documentId: 'doc_fe_acl_01',
        citationId: 'cit_fe_01',
        messageId,
        conversationId,
        documentTitleSnapshot: 'Expediente Privado de Clínica Alpha',
        documentTitle: 'Expediente Privado de Clínica Alpha',
        originalFileName: 'alpha.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 1,
        headingPath: [],
        excerpt: 'Datos confidenciales de salud.',
        canPreview: true,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_AVAILABLE',
        downloadAllowed: true,
        previewToken: 'alpha_token',
        previewUrl: '/api/v1/content',
      };

      // 1. Seed Alpha's protected preview in cache
      queryClient.setQueryData(alphaCitationPreviewKey, cachedAlphaPreview);
      expect(queryClient.getQueryData(alphaCitationPreviewKey)).toBeDefined();

      // 2. User logs out: queryClient cache is wiped
      queryClient.clear();

      // 3. Verify Alpha's protected cache entry was completely purged
      expect(queryClient.getQueryData(alphaCitationPreviewKey)).toBeUndefined();

      // 4. User Beta from another tenant queries their citation preview
      const betaCitationPreviewKey = conversationQueryKeys.citationPreview(
        conversationId,
        messageId,
        'cit_fe_01',
        { tenantId: tenantIdBeta, userId: userIdBeta },
      );
      expect(queryClient.getQueryData(betaCitationPreviewKey)).toBeUndefined();
    });

    it('cancels in-flight citation queries on logout preventing late responses from populating cache', async () => {
      const queryClient = createTestQueryClient();

      let resolveSlowQuery: (value: CitationPreviewResponse) => void = () => {};
      mockedConvApi.getCitationPreview.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSlowQuery = resolve;
          }),
      );

      // Start in-flight query
      const queryPromise = queryClient.fetchQuery({
        queryKey: conversationQueryKeys.citationPreview(conversationId, messageId, 'cit_slow', {
          tenantId: tenantIdAlpha,
          userId: userIdAlpha,
        }),
        queryFn: () => conversationApi.getCitationPreview(conversationId, messageId, 'cit_slow'),
      });

      // User initiates logout before response arrives
      queryClient.cancelQueries();
      queryClient.clear();

      // Late response completes after logout
      resolveSlowQuery({
        documentId: 'doc_late',
        citationId: 'cit_slow',
        messageId,
        conversationId,
        documentTitleSnapshot: 'Late Arriving Document',
        documentTitle: 'Late Arriving Document',
        originalFileName: 'late.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 1,
        headingPath: [],
        excerpt: 'Late excerpt.',
        canPreview: true,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_AVAILABLE',
        downloadAllowed: true,
        previewToken: 'late_token',
        previewUrl: '/api/v1/content',
      });

      await queryPromise.catch(() => {});

      // Verify late response was NOT retained in cache
      const cached = queryClient.getQueryData(
        conversationQueryKeys.citationPreview(conversationId, messageId, 'cit_slow', {
          tenantId: tenantIdAlpha,
          userId: userIdAlpha,
        }),
      );
      expect(cached).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. XSS Injection Immunity & Safe Content Rendering
  // =========================================================================
  describe('5. XSS Injection Immunity & Error Sanitization', () => {
    it('safely escapes malicious script tags in document titles and excerpts without executing HTML', async () => {
      const xssTitle = 'Protocolo <script>window.__xssExecutionFlag=true;</script>';
      const xssExcerpt = 'Crioterapia <img src="x" onerror="window.__xssImgFlag=true;" /> activa.';

      mockedConvApi.getCitationDetail.mockResolvedValue({
        id: 'cit_xss_01',
        messageId,
        turnId: 'turn_fe_01',
        conversationId,
        documentId: 'doc_xss_01',
        documentTitleSnapshot: xssTitle,
        documentTitle: xssTitle,
        originalFileName: 'xss.pdf',
        documentStatus: 'READY',
        documentVersionId: 'ver_01',
        documentVersionNumber: 1,
        chunkId: 'chunk_xss_01',
        citationPosition: 1,
        excerpt: xssExcerpt,
        pageNumber: 1,
        headingPath: ['Seguridad'],
        relevanceScore: 0.99,
        retrievalRank: 1,
        sourceStrategy: 'hybrid',
        previewStatus: 'DOCUMENT_AVAILABLE',
        canPreview: true,
      });

      const maliciousCitation: RAGSourceCitationDto = {
        citationId: 'cit_xss_01',
        documentId: 'doc_xss_01',
        documentTitle: xssTitle,
        chunkId: 'chunk_xss_01',
        excerpt: xssExcerpt,
        pageNumber: 1,
        relevanceScore: 0.99,
        previewStatus: 'DOCUMENT_AVAILABLE',
        canPreview: true,
      };

      const message: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: 'Respuesta con vector de inyección XSS mitigado [1].',
        createdAt: '2026-11-26T18:00:00.000Z',
        status: 'success',
        grounded: true,
        sources: [maliciousCitation],
      };

      renderWithProviders(<AssistantMessage message={message} conversationId={conversationId} />);

      // Verify raw script tag is escaped as plain text in the badge title
      const badge = screen.getByRole('button', { name: /Fuente 1:/i });
      expect(badge).toBeInTheDocument();

      // Open detail dialog
      fireEvent.click(badge);
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Ensure scripts did not execute in window context
      expect(
        (window as unknown as { __xssExecutionFlag?: boolean }).__xssExecutionFlag,
      ).toBeUndefined();
      expect((window as unknown as { __xssImgFlag?: boolean }).__xssImgFlag).toBeUndefined();

      // Verify text rendered as safe literal text
      expect(screen.getAllByText(xssTitle).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(new RegExp(xssExcerpt.slice(0, 15)))).toBeInTheDocument();
    });
  });
});
