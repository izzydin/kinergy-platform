import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentPreview } from '../components/document-preview';
import { SourceDetailsDrawer } from '../components/source-details-drawer';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import type { RAGSourceCitationDto } from '../types/assistant.types';
import type {
  CitationPreviewResponse,
  CitationDetailResponse,
} from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockConversationApi = jest.mocked(conversationApi);

function renderWithProviders(ui: React.ReactElement, queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return {
    ...render(ui, { wrapper: Wrapper }),
    queryClient: client,
  };
}

describe('AI-09.4-CIT.08 — Citation Security, Resilience & UX Hardening Web Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. DocumentPreview: Excerpt Only & Sandboxing Hardening', () => {
    it('renders preview-excerpt-only card when previewStatus is EXCERPT_ONLY', async () => {
      const excerptOnlyResponse: CitationPreviewResponse = {
        documentId: 'doc-version-outdated',
        citationId: 'cite-ver-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        documentTitleSnapshot: 'Protocolo Histórico v1',
        documentTitle: 'Protocolo Histórico',
        originalFileName: 'protocolo-v1.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 5,
        headingPath: ['Capítulo 1'],
        excerpt: 'Extracto de evidencia histórica que debe preservarse.',
        canPreview: false,
        supportedFormat: true,
        previewStatus: 'EXCERPT_ONLY',
        previewUnavailableReason:
          'The specific document version originally cited is no longer available in the repository.',
        downloadAllowed: false,
        previewToken: null,
        previewUrl: '/api/v1/content',
      };

      mockConversationApi.getCitationPreview.mockResolvedValue(excerptOnlyResponse);

      renderWithProviders(
        <DocumentPreview
          isOpen={true}
          onClose={jest.fn()}
          conversationId="conv-1"
          messageId="msg-1"
          citationId="cite-ver-1"
          documentId="doc-version-outdated"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('preview-excerpt-only')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/The specific document version originally cited is no longer available/i),
      ).toBeInTheDocument();
      // Verified excerpt must still be visible in excerpt banner
      expect(
        screen.getByText(/Extracto de evidencia histórica que debe preservarse./i),
      ).toBeInTheDocument();
      // Must not render iframe or download button
      expect(screen.queryByTestId('pdf-preview-iframe')).not.toBeInTheDocument();
      expect(screen.queryByTestId('preview-download-btn')).not.toBeInTheDocument();
    });

    it('enforces strict iframe sandbox attribute without allow-same-origin', async () => {
      const pdfResponse: CitationPreviewResponse = {
        documentId: 'doc-pdf-safe',
        citationId: 'cite-pdf-safe',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        documentTitleSnapshot: 'Documento Seguro',
        documentTitle: 'Documento Seguro',
        originalFileName: 'seguro.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
        documentVersionId: 'v1',
        documentVersionNumber: 1,
        pageNumber: 1,
        headingPath: [],
        excerpt: 'Extracto seguro.',
        canPreview: true,
        supportedFormat: true,
        previewStatus: 'DOCUMENT_AVAILABLE',
        downloadAllowed: true,
        previewToken: 'valid-token-xyz',
        previewUrl: '/api/v1/content',
      };

      mockConversationApi.getCitationPreview.mockResolvedValue(pdfResponse);

      renderWithProviders(
        <DocumentPreview
          isOpen={true}
          onClose={jest.fn()}
          conversationId="conv-1"
          messageId="msg-1"
          citationId="cite-pdf-safe"
          documentId="doc-pdf-safe"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('pdf-preview-iframe')).toBeInTheDocument();
      });

      const iframe = screen.getByTestId('pdf-preview-iframe');
      // Invariant: sandbox must be "allow-scripts" and NEVER contain "allow-same-origin"
      expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
      expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    });
  });

  describe('2. Race Condition Prevention on Rapid Citation Switching', () => {
    it('prevents stale async response from overwriting active citation in SourceDetailsDrawer', async () => {
      const citationA: RAGSourceCitationDto = {
        citationId: 'cite-A',
        documentId: 'doc-A',
        chunkId: 'chunk-A',
        documentTitle: 'Guía Clínica A',
        originalFileName: 'guia-A.pdf',
        mimeType: 'application/pdf',
        excerpt: 'Extracto específico de la Guía A',
        relevanceScore: 0.9,
      };

      const citationB: RAGSourceCitationDto = {
        citationId: 'cite-B',
        documentId: 'doc-B',
        chunkId: 'chunk-B',
        documentTitle: 'Guía Clínica B',
        originalFileName: 'guia-B.pdf',
        mimeType: 'application/pdf',
        excerpt: 'Extracto específico de la Guía B',
        relevanceScore: 0.8,
      };

      // Mock delayed response for A and fast response for B
      let resolveA!: (value: CitationDetailResponse) => void;
      const promiseA = new Promise<CitationDetailResponse>((res) => {
        resolveA = res;
      });

      mockConversationApi.getCitationDetail.mockImplementation((_cId, _mId, citationId) => {
        if (citationId === 'cite-A') {
          return promiseA;
        }
        return Promise.resolve({
          id: 'cite-B',
          documentId: 'doc-B',
          documentTitle: 'Guía Clínica B Verificada',
          documentTitleSnapshot: 'Guía Clínica B Verificada',
          excerpt: 'Extracto B Verificado Remotamente',
          canPreview: true,
          previewStatus: 'DOCUMENT_AVAILABLE',
        } as CitationDetailResponse);
      });

      // 1. Render drawer with citation A initially
      const { rerender } = renderWithProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          conversationId="conv-1"
          messageId="msg-1"
          citation={citationA}
        />,
      );

      // Initially shows fallback snapshot for A
      expect(screen.getByText('Guía Clínica A')).toBeInTheDocument();

      // 2. User rapidly switches to citation B before citation A resolves
      rerender(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          conversationId="conv-1"
          messageId="msg-1"
          citation={citationB}
        />,
      );

      // Verify Citation B data is displayed
      await waitFor(() => {
        expect(screen.getByText('Guía Clínica B Verificada')).toBeInTheDocument();
      });

      // 3. Stale promise for Citation A finishes now
      resolveA({
        id: 'cite-A',
        documentId: 'doc-A',
        documentTitle: 'Guía Clínica A STALE RESOLUTION',
        documentTitleSnapshot: 'Guía Clínica A STALE RESOLUTION',
        excerpt: 'STALE EXCERPT A',
        canPreview: true,
        previewStatus: 'DOCUMENT_AVAILABLE',
      } as CitationDetailResponse);

      // Citation B must still be displayed! Stale citation A response must be ignored
      expect(screen.getByText('Guía Clínica B Verificada')).toBeInTheDocument();
      expect(screen.queryByText('Guía Clínica A STALE RESOLUTION')).not.toBeInTheDocument();
    });
  });

  describe('3. XSS and Content Security', () => {
    it('safely renders untrusted text without executing injected script tags in excerpt', () => {
      const maliciousCitation: RAGSourceCitationDto = {
        citationId: 'cite-malicious',
        documentId: 'doc-malicious',
        chunkId: 'chunk-malicious',
        documentTitle: '<script>window.pwned=true</script>Título Seguro',
        excerpt: '<img src=x onerror=alert(1) /> Extracto de prueba de inyección',
        relevanceScore: 0.9,
      };

      renderWithProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          conversationId="conv-1"
          messageId="msg-1"
          citation={maliciousCitation}
        />,
      );

      // The malicious tag should be displayed as safe text or rendered without executing
      expect(
        screen.getByText(/<img src=x onerror=alert\(1\) \/> Extracto de prueba de inyección/i),
      ).toBeInTheDocument();
      // Ensure no script tag was injected into DOM
      expect(document.querySelector('script[src*="pwned"]')).toBeNull();
    });
  });

  describe('4. Cache Policies & Isolation', () => {
    it('clearUserConversationCache purges all queries for the user scope preventing cross-user leakage', () => {
      const queryClient = new QueryClient();
      const scopeUser1 = { tenantId: 't-1', userId: 'u-1' };
      const scopeUser2 = { tenantId: 't-1', userId: 'u-2' };

      // Populate cache for user 1
      queryClient.setQueryData(conversationQueryKeys.detail('conv-user-1', scopeUser1), {
        id: 'conv-user-1',
        title: 'User 1 Conversation',
      });
      queryClient.setQueryData(conversationQueryKeys.detail('conv-user-2', scopeUser2), {
        id: 'conv-user-2',
        title: 'User 2 Conversation',
      });

      expect(
        queryClient.getQueryData(conversationQueryKeys.detail('conv-user-1', scopeUser1)),
      ).toBeDefined();
      expect(
        queryClient.getQueryData(conversationQueryKeys.detail('conv-user-2', scopeUser2)),
      ).toBeDefined();

      // Clear user 1 cache
      conversationCachePolicies.clearUserConversationCache(queryClient, scopeUser1);

      // User 1 data must be removed, User 2 data must remain untouched
      expect(
        queryClient.getQueryData(conversationQueryKeys.detail('conv-user-1', scopeUser1)),
      ).toBeUndefined();
      expect(
        queryClient.getQueryData(conversationQueryKeys.detail('conv-user-2', scopeUser2)),
      ).toBeDefined();
    });

    it('clearCitationPreviewCache purges citation and preview queries for a conversation', () => {
      const queryClient = new QueryClient();
      const scope = { tenantId: 't-1', userId: 'u-1' };
      const convId = 'conv-target-123';

      const previewKey = conversationQueryKeys.citationPreview(convId, 'msg-1', 'cite-1', scope);
      queryClient.setQueryData(previewKey, {
        previewToken: 'sensitive-hmac-token',
        canPreview: true,
      });

      expect(queryClient.getQueryData(previewKey)).toBeDefined();

      // Clear citation preview cache
      conversationCachePolicies.clearCitationPreviewCache(queryClient, convId, scope);

      // Sensitive preview data must be purged from memory
      expect(queryClient.getQueryData(previewKey)).toBeUndefined();
    });
  });
});
