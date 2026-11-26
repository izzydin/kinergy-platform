import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarkdownRenderer } from '../assistant/components/markdown-renderer';
import { CodeBlock } from '../assistant/components/code-block';
import { AssistantMessage } from '../assistant/components/assistant-message';
import { UserMessage } from '../assistant/components/user-message';
import { ChatMessageFeed } from '../assistant/components/chat-message-feed';
import { SourceDetailsDrawer } from '../assistant/components/source-details-drawer';
import { CitationDetailDialog } from '../assistant/components/citation-detail-dialog';
import { VersionComparisonModal } from '../knowledge/components/version-comparison-modal';
import type { ChatMessage, RAGSourceCitationDto } from '../assistant/types/assistant.types';
import type { DocumentVersionItem } from '../knowledge/types/knowledge-contract.types';

expect.extend(toHaveNoViolations);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DS.09 — Conversation, Citation, and Overflow Hardening Suite', () => {
  describe('1. Complex Markdown & Unbroken String Rendering', () => {
    it('renders unbroken URLs and long tokens with break-all and max-w-full', () => {
      const unbrokenUrl =
        'https://kynergy-internal-api.service.local/v1/auth/tokens/diagnostic/verify?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.unbrokenstringthatdoesnotcontainanyspaceswhatsoeverandmustbreakgracefully';
      const markdown = `Consulta la documentación en [Enlace Extenso](${unbrokenUrl}).`;

      render(<MarkdownRenderer content={markdown} />);

      const link = screen.getByRole('link', { name: /enlace extenso/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', unbrokenUrl);
      expect(link.className).toContain('break-all');
      expect(link.className).toContain('max-w-full');
    });

    it('renders inline code with break-all to prevent horizontal blowout', () => {
      const longPath =
        '`/var/log/kynergy/production/cluster/application-service-error-telemetry-audit-trace.log`';
      render(<MarkdownRenderer content={longPath} />);

      const code = screen.getByText(/application-service-error-telemetry-audit-trace/i);
      expect(code.tagName.toLowerCase()).toBe('code');
      expect(code.className).toContain('break-all');
    });

    it('renders structured tables with overflow-x-auto, keyboard tabIndex, and cell break-words', () => {
      const tableMarkdown = `
| Parámetro Clínico | Protocolo Fase 1 | Protocolo Fase 2 | Evidencia Científica Recomendada |
| :--- | :--- | :--- | :--- |
| Rango de Movilidad | Crioterapia 15 min | Ejercicio isométrico | Nivel A - Guías Clínicas de Fisioterapia 2026 |
| Umbral de Dolor EVA | Reposo relativo | Carga progresiva | Nivel B - Evidencia controlada aleatorizada |
`;

      render(<MarkdownRenderer content={tableMarkdown} />);

      const tableRegion = screen.getByRole('region', { name: /tabla de datos markdown/i });
      expect(tableRegion).toBeInTheDocument();
      expect(tableRegion).toHaveAttribute('tabIndex', '0');
      expect(tableRegion.className).toContain('overflow-x-auto');

      const cells = screen.getAllByRole('cell');
      expect(cells.length).toBeGreaterThan(0);
      expect(cells[0]?.className).toContain('break-words');
    });

    it('renders headings and list items with break-words', () => {
      const content = `
### DiagnósticoClínicoDiferencialExtremadamenteLargoSinEspaciosNiSeparadores
- PautaClínicaDeAtenciónPrimariaParaCasosAgudosDeLumbociatalgiaSinPausas
1. PrimerPasoDeEvaluaciónPosturalYMovilidadArticularEnCaderaYColumna
`;

      render(<MarkdownRenderer content={content} />);

      const heading = screen.getByRole('heading', { level: 5 });
      expect(heading.className).toContain('break-words');

      const listItems = screen.getAllByRole('listitem');
      expect(listItems[0]?.className).toContain('break-words');
      expect(listItems[1]?.className).toContain('break-words');
    });
  });

  describe('2. CodeBlock Horizontal Scroll & Header Truncation', () => {
    it('contains wide code blocks with overflow-x-auto and keyboard tabIndex', () => {
      const longCode =
        'const veryLongNestedObject = { diagnosticId: "1234567890", timestamp: "2026-11-26T14:00:00Z", patientData: { vitalSigns: { systolic: 120, diastolic: 80, pulseRate: 72 } } };';
      render(<CodeBlock language="typescript" code={longCode} />);

      const pre = screen.getByLabelText(/contenido de código typescript/i);
      expect(pre).toBeInTheDocument();
      expect(pre).toHaveAttribute('tabIndex', '0');
      expect(pre.className).toContain('overflow-x-auto');
      expect(pre.className).toContain('whitespace-pre');
    });

    it('truncates excessively long language tags in code header', () => {
      const longLang =
        'very-long-custom-language-name-that-could-otherwise-blow-out-the-header-container';
      render(<CodeBlock language={longLang} code="echo 'test'" />);

      const langSpan = screen.getByText(longLang);
      expect(langSpan.className).toContain('truncate');
      expect(langSpan.className).toContain('max-w-[200px]');
    });
  });

  describe('3. Message Bubble Flexbox Containment & Layout Boundaries', () => {
    it('applies min-w-0 to AssistantMessage container and card to prevent flex blowout', () => {
      const mockMessage: ChatMessage = {
        id: 'msg-assistant-1',
        role: 'assistant',
        content: 'Respuesta clínica con contenido estructurado.',
        status: 'success',
        createdAt: '2026-11-26T14:00:00Z',
      };

      renderWithClient(<AssistantMessage message={mockMessage} />);

      const article = screen.getByTestId('chat-message-msg-assistant-1');
      expect(article).toBeInTheDocument();

      // Find the message bubble container
      const bubbleContainer = article.querySelector('.min-w-0');
      expect(bubbleContainer).toBeInTheDocument();
      expect(bubbleContainer?.className).toContain('min-w-0');
    });

    it('applies min-w-0 and [overflow-wrap:anywhere] to UserMessage for long continuous queries', () => {
      const unbrokenPrompt = 'A'.repeat(300);
      const mockMessage: ChatMessage = {
        id: 'msg-user-1',
        role: 'user',
        content: unbrokenPrompt,
        status: 'success',
        createdAt: '2026-11-26T14:00:00Z',
      };

      render(<UserMessage message={mockMessage} />);

      const article = screen.getByTestId('chat-message-msg-user-1');
      const textContainer = article.querySelector('.whitespace-pre-wrap');
      expect(textContainer).toBeInTheDocument();
      expect(textContainer?.className).toContain('break-words');
    });
  });

  describe('4. Citations Tray & Badge Overflow Handling', () => {
    it('renders multiple citations in flex-wrap container with truncated titles', () => {
      const longTitle =
        'Protocolo Clínico Oficial de Rehabilitación Kinésica para Lesiones de Rodilla y Cadera en Atletas de Alto Rendimiento 2026';
      const mockSources: RAGSourceCitationDto[] = [
        {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          documentTitle: longTitle,
          pageNumber: 12,
          relevanceScore: 0.94,
        },
        {
          documentId: 'doc-2',
          chunkId: 'chunk-2',
          documentTitle: 'Guía Rápida de Crioterapia',
          pageNumber: 3,
          relevanceScore: 0.88,
        },
      ];

      const mockMessage: ChatMessage = {
        id: 'msg-with-sources',
        role: 'assistant',
        content: 'Respuesta fundamentada en evidencia clínica verificada.',
        status: 'success',
        sources: mockSources,
        createdAt: '2026-11-26T14:00:00Z',
      };

      renderWithClient(<AssistantMessage message={mockMessage} />);

      const citationList = screen.getByTestId('citations-badge-list');
      expect(citationList).toBeInTheDocument();
      expect(citationList.className).toContain('flex-wrap');

      const badge1 = screen.getByTestId('citation-badge-1');
      expect(badge1).toBeInTheDocument();
      const titleSpan = badge1.querySelector('.truncate');
      expect(titleSpan).toBeInTheDocument();
    });
  });

  describe('5. Source Details Drawer & Citation Dialog Overflow Containment', () => {
    it('renders verbatim evidence excerpt with keyboard scroll region and break-words in SourceDetailsDrawer', () => {
      const veryLongExcerpt = 'Extracto clínico continuo de evidencia '.repeat(60);
      const mockCitation: RAGSourceCitationDto = {
        documentId: 'doc-101',
        chunkId: 'chunk-101',
        documentTitle: 'Tratado de Kinesiología y Terapia Manual',
        excerpt: veryLongExcerpt,
        pageNumber: 45,
        relevanceScore: 0.92,
      };

      renderWithClient(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          citation={mockCitation}
          citationIndex={0}
        />,
      );

      const excerptBox = screen.getByTestId('drawer-verbatim-excerpt');
      expect(excerptBox).toBeInTheDocument();
      expect(excerptBox).toHaveAttribute('tabIndex', '0');
      expect(excerptBox).toHaveAttribute('role', 'region');
      expect(excerptBox).toHaveAttribute('aria-label', 'Extracto textual de evidencia');
      expect(excerptBox.className).toContain('overflow-y-auto');
      expect(excerptBox.className).toContain('break-words');
    });

    it('renders CitationDetailDialog with keyboard scrollable excerpt region', () => {
      const longExcerpt = 'Pautas clínicas de vendaje funcional '.repeat(50);
      const mockCitation: RAGSourceCitationDto = {
        documentId: 'doc-202',
        chunkId: 'chunk-202',
        documentTitle: 'Manual de Vendaje Neuromuscular',
        excerpt: longExcerpt,
        pageNumber: 8,
        relevanceScore: 0.85,
      };

      renderWithClient(
        <CitationDetailDialog
          open={true}
          onOpenChange={jest.fn()}
          citation={mockCitation}
          citationIndex={0}
        />,
      );

      const excerptText = screen.getByTestId('citation-excerpt-text');
      expect(excerptText).toBeInTheDocument();
      expect(excerptText).toHaveAttribute('tabIndex', '0');
      expect(excerptText).toHaveAttribute('role', 'region');
      expect(excerptText.className).toContain('overflow-y-auto');
      expect(excerptText.className).toContain('break-words');
    });
  });

  describe('6. Knowledge Center Modals Overflow Containment', () => {
    it('renders VersionComparisonModal matrix table with keyboard scroll container', () => {
      const mockVersions: DocumentVersionItem[] = [
        {
          id: 'ver-1',
          versionNumber: 2,
          originalFileName: 'protocolo_v2.pdf',
          fileSize: 1048576,
          mimeType: 'application/pdf',
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          createdAt: '2026-11-26T10:00:00Z',
          ingestionStatus: 'READY',
          uploadedBy: 'Dra. Silva',
        },
        {
          id: 'ver-2',
          versionNumber: 1,
          originalFileName: 'protocolo_v1.pdf',
          fileSize: 948576,
          mimeType: 'application/pdf',
          checksum: 'ca978112ca1bbdcafac231b39a23dc4da786081cd1e14eed647d4e4495e4e83a',
          createdAt: '2026-11-20T10:00:00Z',
          ingestionStatus: 'READY',
          uploadedBy: 'Dr. Rossi',
        },
      ];

      renderWithClient(
        <VersionComparisonModal
          isOpen={true}
          onClose={jest.fn()}
          documentId="doc-1"
          documentTitle="Protocolo de Cervicalgia"
          versions={mockVersions}
        />,
      );

      const comparisonRegion = screen.getByRole('region', {
        name: /matriz comparativa de versiones/i,
      });
      expect(comparisonRegion).toBeInTheDocument();
      expect(comparisonRegion).toHaveAttribute('tabIndex', '0');
      expect(comparisonRegion.className).toContain('overflow-x-auto');
    });
  });

  describe('7. ChatMessageFeed Scrolling & Pagination Dynamics', () => {
    it('renders scrollable feed with role="log" and preserves scroll position on load more', () => {
      const onLoadMoreMock = jest.fn();
      const messages: ChatMessage[] = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Mensaje de prueba número ${i + 1}`,
        status: 'success',
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      }));

      renderWithClient(
        <ChatMessageFeed
          messages={messages}
          hasMoreMessages={true}
          onLoadMoreMessages={onLoadMoreMock}
        />,
      );

      const feed = screen.getByTestId('chat-message-feed');
      expect(feed).toBeInTheDocument();
      expect(feed).toHaveAttribute('role', 'log');
      expect(feed).toHaveAttribute('tabIndex', '0');
      expect(feed.className).toContain('overflow-y-auto');

      const loadMoreBtn = screen.getByTestId('load-more-messages-button');
      expect(loadMoreBtn).toBeInTheDocument();
      fireEvent.click(loadMoreBtn);
      expect(onLoadMoreMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('8. Automated WCAG 2.2 AA Audits (jest-axe)', () => {
    it('passes automated accessibility audit on MarkdownRenderer with tables and code', async () => {
      const markdown = `
### Protocolo de Atención
Consulta la guía oficial en [Enlace](https://example.com).

| Fase | Duración | Criterio |
| :--- | :--- | :--- |
| Fase 1 | 7 días | Movilidad pasiva |

\`\`\`typescript
const protocol = "rehab";
\`\`\`
`;
      const { container } = render(<MarkdownRenderer content={markdown} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated accessibility audit on CodeBlock', async () => {
      const { container } = render(
        <CodeBlock language="json" code='{ "status": "ok", "retries": 0 }' />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated accessibility audit on AssistantMessage with citations', async () => {
      const mockMessage: ChatMessage = {
        id: 'msg-axe-assistant',
        role: 'assistant',
        content: 'Respuesta clínica con referencia a protocolo.',
        status: 'success',
        sources: [
          {
            documentId: 'doc-axe-1',
            chunkId: 'chunk-axe-1',
            documentTitle: 'Guía Clínica de Atención Temprana',
            pageNumber: 5,
            relevanceScore: 0.9,
          },
        ],
        createdAt: '2026-11-26T14:00:00Z',
      };

      const { container } = renderWithClient(<AssistantMessage message={mockMessage} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
