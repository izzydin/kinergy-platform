import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageCitations } from '../components/message-citations';
import { AssistantMessage } from '../components/assistant-message';
import { ChatMessageFeed } from '../components/chat-message-feed';
import type { ChatMessage, RAGSourceCitationDto } from '../types/assistant.types';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AI-09.4-CIT.04 — Citation Rendering Components', () => {
  const sampleCitation1: RAGSourceCitationDto = {
    citationId: 'cit-001',
    documentId: 'doc-knee-101',
    documentTitle: 'Guía de Rehabilitación Meniscal y Ligamentosa',
    chunkId: 'chunk-k-12',
    documentVersionId: 'ver-k-1',
    documentVersionNumber: 1,
    excerpt:
      'En la fase aguda posterior a la meniscectomía, la prioridad es recuperar la extensión pasiva completa.',
    pageNumber: 22,
    headingPath: ['Fase Aguda', 'Control de Edema y Rango'],
    relevanceScore: 0.945,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
  };

  const sampleCitation2: RAGSourceCitationDto = {
    citationId: 'cit-002',
    documentId: 'doc-sports-202',
    documentTitle: 'Tratado de Biomecánica Articular en Kinesiología Deportiva',
    chunkId: 'chunk-sp-45',
    excerpt: 'El descanso activo favorece la reducción de lactato sérico tras esfuerzo submáximo.',
    pageNumber: 110,
    headingPath: ['Capítulo 4', 'Recuperación Metabólica'],
    relevanceScore: 0.88,
    retrievalRank: 2,
    sourceStrategy: 'KEYWORD',
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
  };

  const sampleCitation3: RAGSourceCitationDto = {
    citationId: 'cit-003',
    documentId: 'doc-archived-303',
    documentTitle: 'Manual de Crioterapia y Agentes Físicos en Fisioterapia',
    chunkId: 'chunk-crio-01',
    excerpt: 'La crioterapia debe aplicarse en intervalos no mayores a 15-20 minutos.',
    pageNumber: 5,
    relevanceScore: 0.82,
    retrievalRank: 3,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_SOFT_DELETED',
    canPreview: false,
    previewUnavailableReason: 'El documento original ha sido archivado.',
  };

  describe('1. MessageCitations Tray & CitationBadge', () => {
    it('renders null when sources is undefined or empty', () => {
      const { container } = renderWithProviders(<MessageCitations sources={[]} />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();
    });

    it('renders single citation with accurate numbering, title, and page tag', () => {
      renderWithProviders(<MessageCitations sources={[sampleCitation1]} />);

      const tray = screen.getByTestId('message-citations');
      expect(tray).toBeInTheDocument();
      expect(screen.getByText(/Fuentes verificadas \(1\):/i)).toBeInTheDocument();

      const badge = screen.getByTestId('citation-badge-1');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[1]');
      expect(badge).toHaveTextContent('Guía de Rehabilitación Meniscal y Ligamentosa');
      expect(badge).toHaveTextContent('p.22');
    });

    it('renders multiple citations preserving exact backend ordering', () => {
      renderWithProviders(
        <MessageCitations sources={[sampleCitation1, sampleCitation2, sampleCitation3]} />,
      );

      const badges = screen.getAllByRole('button');
      expect(badges).toHaveLength(3);

      expect(screen.getByTestId('citation-badge-1')).toHaveTextContent('[1]');
      expect(screen.getByTestId('citation-badge-1')).toHaveTextContent(
        'Guía de Rehabilitación Meniscal',
      );

      expect(screen.getByTestId('citation-badge-2')).toHaveTextContent('[2]');
      expect(screen.getByTestId('citation-badge-2')).toHaveTextContent(
        'Tratado de Biomecánica Articular',
      );

      expect(screen.getByTestId('citation-badge-3')).toHaveTextContent('[3]');
      expect(screen.getByTestId('citation-badge-3')).toHaveTextContent(
        'Manual de Crioterapia y Agentes Físicos',
      );
    });

    it('handles missing optional metadata gracefully without rendering NaN or undefined', () => {
      const minimalCitation: RAGSourceCitationDto = {
        documentId: 'doc-minimal',
        documentTitle: 'Documento Clínico Básico',
        chunkId: 'chunk-min',
        relevanceScore: 0.75,
      };

      renderWithProviders(<MessageCitations sources={[minimalCitation]} />);

      const badge = screen.getByTestId('citation-badge-1');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('[1]');
      expect(badge).toHaveTextContent('Documento Clínico Básico');
      // No page tag should be rendered
      expect(screen.queryByText(/p\./i)).not.toBeInTheDocument();
      expect(badge).not.toHaveTextContent('undefined');
      expect(badge).not.toHaveTextContent('NaN');
    });

    it('truncates very long document titles gracefully', () => {
      const longTitle =
        'Protocolo de Evaluación Postural Dinámica y Readaptación Funcional de Cadena Posterior en Deportistas de Alto Rendimiento con Antecedentes de Lesión Mioconectiva';
      const longCitation: RAGSourceCitationDto = {
        documentId: 'doc-long',
        documentTitle: longTitle,
        chunkId: 'chunk-long',
        relevanceScore: 0.9,
      };

      renderWithProviders(<MessageCitations sources={[longCitation]} />);

      const badge = screen.getByTestId('citation-badge-1');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('title', longTitle);
      expect(badge).toHaveAttribute('aria-label', `Fuente 1: ${longTitle}`);
    });
  });

  describe('2. Click Interactions & CitationDetailDialog', () => {
    it('opens detail dialog on badge click and displays full excerpt and metadata', async () => {
      renderWithProviders(<MessageCitations sources={[sampleCitation1]} />);

      const badge = screen.getByTestId('citation-badge-1');
      fireEvent.click(badge);

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByTestId('citation-detail-dialog');
      expect(within(dialog).getByText(/Fuente Verificada \[1\]/i)).toBeInTheDocument();
      expect(within(dialog).getByText(sampleCitation1.documentTitle)).toBeInTheDocument();

      // Check excerpt container
      const excerptContainer = screen.getByTestId('citation-excerpt-container');
      expect(excerptContainer).toBeInTheDocument();
      expect(screen.getByTestId('citation-excerpt-text')).toHaveTextContent(
        sampleCitation1.excerpt!,
      );

      // Check metadata pills
      const metadataPills = screen.getByTestId('citation-metadata-pills');
      expect(metadataPills).toHaveTextContent('Página 22');
      expect(metadataPills).toHaveTextContent('95% de relevancia');
      expect(metadataPills).toHaveTextContent('Rango #1');
      expect(metadataPills).toHaveTextContent('HYBRID');

      // Check heading hierarchy
      const headingContainer = screen.getByTestId('citation-heading-path');
      expect(headingContainer).toHaveTextContent('Fase Aguda');
      expect(headingContainer).toHaveTextContent('Control de Edema y Rango');

      // Check direct document link
      const openDocLink = screen.getByTestId('citation-open-document-link');
      expect(openDocLink).toBeInTheDocument();
      expect(openDocLink).toHaveAttribute(
        'href',
        `/api/v1/ai/knowledge/documents/${sampleCitation1.documentId}/content`,
      );
      expect(openDocLink).toHaveAttribute('target', '_blank');
    });

    it('supports keyboard activation via Enter key on citation badge', async () => {
      renderWithProviders(<MessageCitations sources={[sampleCitation2]} />);

      const badge = screen.getByTestId('citation-badge-1');
      fireEvent.keyDown(badge, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByTestId('citation-detail-dialog');
      expect(within(dialog).getByText(/Fuente Verificada \[1\]/i)).toBeInTheDocument();
      expect(within(dialog).getByText(sampleCitation2.documentTitle)).toBeInTheDocument();
      expect(screen.getByTestId('citation-excerpt-text')).toHaveTextContent(
        sampleCitation2.excerpt!,
      );
    });

    it('dismisses detail dialog when close button is clicked', async () => {
      renderWithProviders(<MessageCitations sources={[sampleCitation1]} />);

      fireEvent.click(screen.getByTestId('citation-badge-1'));
      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      const closeBtn = screen.getByTestId('citation-dialog-close-btn');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('citation-detail-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('3. Unavailable, Soft-Deleted & Restricted Source States', () => {
    it('renders soft-deleted source status with warning alert and suppresses document link', async () => {
      renderWithProviders(<MessageCitations sources={[sampleCitation3]} />);

      fireEvent.click(screen.getByTestId('citation-badge-1'));

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      // Excerpt MUST still be displayed for historical clinical audit
      expect(screen.getByTestId('citation-excerpt-text')).toHaveTextContent(
        sampleCitation3.excerpt!,
      );

      // Warning alert for soft deletion
      const softDeletedAlert = screen.getByTestId('citation-status-soft-deleted');
      expect(softDeletedAlert).toBeInTheDocument();
      expect(softDeletedAlert).toHaveTextContent(sampleCitation3.previewUnavailableReason!);

      // External link to original file must NOT be offered
      expect(screen.queryByTestId('citation-open-document-link')).not.toBeInTheDocument();
    });

    it('renders restricted role status banner when previewStatus is DOCUMENT_RESTRICTED', async () => {
      const restrictedCitation: RAGSourceCitationDto = {
        documentId: 'doc-restricted',
        documentTitle: 'Protocolo de Alta Gerencia Médica',
        chunkId: 'chunk-sec-01',
        excerpt: 'Criterios clínicos de derivación confidencial.',
        relevanceScore: 0.91,
        previewStatus: 'DOCUMENT_RESTRICTED',
        canPreview: false,
        previewUnavailableReason: 'Acceso restringido por política de seguridad.',
      };

      renderWithProviders(<MessageCitations sources={[restrictedCitation]} />);

      fireEvent.click(screen.getByTestId('citation-badge-1'));

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      expect(screen.getByTestId('citation-status-restricted')).toBeInTheDocument();
      expect(screen.getByTestId('citation-status-restricted')).toHaveTextContent(
        'Acceso restringido por política de seguridad.',
      );
      expect(screen.queryByTestId('citation-open-document-link')).not.toBeInTheDocument();
    });

    it('renders excerpt-only banner when previewStatus is EXCERPT_ONLY', async () => {
      const excerptOnlyCitation: RAGSourceCitationDto = {
        documentId: 'doc-excerpt-only',
        documentTitle: 'Nota Clínica Breve',
        chunkId: 'chunk-note',
        excerpt: 'Anotación puntual de evaluación kinésica.',
        relevanceScore: 0.84,
        previewStatus: 'EXCERPT_ONLY',
        canPreview: false,
      };

      renderWithProviders(<MessageCitations sources={[excerptOnlyCitation]} />);

      fireEvent.click(screen.getByTestId('citation-badge-1'));

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });

      expect(screen.getByTestId('citation-status-excerpt-only')).toBeInTheDocument();
      expect(screen.queryByTestId('citation-open-document-link')).not.toBeInTheDocument();
    });
  });

  describe('4. AssistantMessage & ChatMessageFeed Integration', () => {
    it('renders citations inside AssistantMessage only when status is success', () => {
      const successMessage: ChatMessage = {
        id: 'msg-success-1',
        role: 'assistant',
        content: 'La rehabilitación funcional debe comenzar en la fase temprana.',
        status: 'success',
        createdAt: new Date().toISOString(),
        sources: [sampleCitation1, sampleCitation2],
      };

      renderWithProviders(<AssistantMessage message={successMessage} />);

      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByTestId('citation-badge-1')).toBeInTheDocument();
      expect(screen.getByTestId('citation-badge-2')).toBeInTheDocument();
    });

    it('does not render citations when assistant message is pending, failed, or cancelled', () => {
      const pendingMessage: ChatMessage = {
        id: 'msg-pending-1',
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        sources: [sampleCitation1],
      };

      const { rerender } = renderWithProviders(<AssistantMessage message={pendingMessage} />);
      expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();

      const failedMessage: ChatMessage = {
        ...pendingMessage,
        id: 'msg-failed-1',
        status: 'error',
        error: 'Generation failed',
      };
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <AssistantMessage message={failedMessage} />
        </QueryClientProvider>,
      );
      expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();
    });

    it('renders historical message feed with preserved citations and clickability', async () => {
      const historicalMessages: ChatMessage[] = [
        {
          id: 'user-hist-1',
          role: 'user',
          content: '¿Cuáles son las pautas para desgarro de menisco?',
          status: 'success',
          createdAt: new Date(Date.now() - 60000).toISOString(),
          sequenceNumber: 1,
        },
        {
          id: 'asst-hist-2',
          role: 'assistant',
          content: 'El protocolo incluye extensión pasiva completa y control de edema.',
          status: 'success',
          createdAt: new Date(Date.now() - 30000).toISOString(),
          sequenceNumber: 2,
          sources: [sampleCitation1],
        },
      ];

      renderWithProviders(
        <ChatMessageFeed messages={historicalMessages} conversationId="conv-hist-101" />,
      );

      // Verify user message rendered
      expect(
        screen.getByText('¿Cuáles son las pautas para desgarro de menisco?'),
      ).toBeInTheDocument();

      // Verify assistant message and citations rendered
      expect(
        screen.getByText('El protocolo incluye extensión pasiva completa y control de edema.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByTestId('citation-badge-1')).toBeInTheDocument();

      // Click badge from within message feed
      fireEvent.click(screen.getByTestId('citation-badge-1'));

      await waitFor(() => {
        expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      });
      expect(screen.getByTestId('citation-excerpt-text')).toHaveTextContent(
        sampleCitation1.excerpt!,
      );
    });
  });
});
