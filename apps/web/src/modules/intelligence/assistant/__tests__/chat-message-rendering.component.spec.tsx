import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatMessageItem } from '../components/chat-message-item';
import { AssistantMessage } from '../components/assistant-message';
import { MessageCitations } from '../components/message-citations';
import {
  createMockCitation,
  createMockMessage,
  createMockGenerationMetadata,
  resetFactoryCounters,
} from '../../../../test/factories/intelligence-test.factories';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AI-09.10-IT.03 — Chat Message Rendering Component Specification', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    resetFactoryCounters();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
  });

  describe('1. Semantic Distinction & Identity', () => {
    it('renders user message with distinct user landmark, styling, and XSS safety', () => {
      const userMsg = createMockMessage({
        role: 'user',
        content: '<img src=x onerror=alert(1)> Tratamiento conservador de esguince',
      });

      renderWithProviders(<ChatMessageItem message={userMsg} />);

      const article = screen.getByRole('article', { name: /mensaje de usuario/i });
      expect(article).toBeInTheDocument();
      expect(article).toHaveAttribute('data-testid', `chat-message-${userMsg.id}`);

      // XSS check: content must be rendered as raw text without executing script/img tag
      expect(
        screen.getByText('<img src=x onerror=alert(1)> Tratamiento conservador de esguince'),
      ).toBeInTheDocument();
      expect(document.querySelector('img[src="x"]')).toBeNull();
    });

    it('renders assistant message with distinct assistant landmark and avatar', () => {
      const asstMsg = createMockMessage({
        role: 'assistant',
        content: 'El tratamiento inicial recomendado es el protocolo PEACE & LOVE.',
      });

      renderWithProviders(<ChatMessageItem message={asstMsg} />);

      const article = screen.getByRole('article', { name: /mensaje de asistente/i });
      expect(article).toBeInTheDocument();
      expect(article).toHaveAttribute('data-testid', `chat-message-${asstMsg.id}`);
      expect(
        screen.getByText('El tratamiento inicial recomendado es el protocolo PEACE & LOVE.'),
      ).toBeInTheDocument();
    });
  });

  describe('2. Markdown Content & Complex Elements', () => {
    it('renders structured markdown with headings, bold text, bullet lists, and links', () => {
      const markdownContent = `
### Fase Aguda de Rehabilitación
- **Crioterapia**: Aplicación de frío durante 15 minutos.
- **Compresión**: Vendaje elástico funcional.

Para más detalles, consulte la [Guía Clínica SERMEF](https://sermef.es/protocolo).
      `.trim();

      const msg = createMockMessage({
        role: 'assistant',
        content: markdownContent,
      });

      renderWithProviders(<AssistantMessage message={msg} />);

      // Heading level in MarkdownRenderer (### -> h5)
      expect(
        screen.getByRole('heading', { level: 5, name: /fase aguda de rehabilitación/i }),
      ).toBeInTheDocument();

      // Bold text inside list item
      expect(screen.getByText('Crioterapia')).toBeInTheDocument();
      expect(screen.getByText('Compresión')).toBeInTheDocument();

      // Accessible, safe external link
      const link = screen.getByRole('link', { name: /guía clínica sermef/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://sermef.es/protocolo');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders code blocks with copy button functionality', async () => {
      const codeContent =
        '```python\ndef calcular_eva(score):\n    return min(max(score, 0), 10)\n```';
      const msg = createMockMessage({
        role: 'assistant',
        content: codeContent,
      });

      renderWithProviders(<AssistantMessage message={msg} />);

      expect(screen.getByText(/calcular_eva/i)).toBeInTheDocument();

      const copyCodeBtn = screen.getByRole('button', {
        name: /copiar código al portapapeles/i,
      });
      expect(copyCodeBtn).toBeInTheDocument();

      fireEvent.click(copyCodeBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('def calcular_eva(score):'),
      );
    });
  });

  describe('3. Grounded Citation Attribution & Dialog Interaction', () => {
    it('renders verified citation pills and displays snippet details upon interaction', () => {
      const citation1 = createMockCitation({
        citationId: 'cit_ortho_01',
        documentTitle: 'Guía Clínica de Artroplastia Total de Rodilla',
        documentId: 'doc_artro_99',
        pageNumber: 14,
        excerpt: 'Se recomienda iniciar flexión pasiva continua dentro de las primeras 24 horas.',
        relevanceScore: 0.95,
      });

      const msg = createMockMessage({
        role: 'assistant',
        content: 'La movilización temprana disminuye el riesgo de rigidez articular.',
        sources: [citation1],
      });

      renderWithProviders(<AssistantMessage message={msg} conversationId="conv_cit_test" />);

      // Citation pill renders with index 1
      const citationButton = screen.getByTestId('citation-badge-1');
      expect(citationButton).toBeInTheDocument();

      // Clicking opens the detail dialog
      fireEvent.click(citationButton);

      expect(screen.getByTestId('citation-detail-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('citation-excerpt-text')).toHaveTextContent(
        /Se recomienda iniciar flexión pasiva continua dentro de las primeras 24 horas/i,
      );
      expect(screen.getByText(/95% de relevancia/i)).toBeInTheDocument();
    });

    it('renders nothing when sources array is empty or undefined', () => {
      const { container } = renderWithProviders(
        <MessageCitations sources={[]} conversationId="conv_empty" />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('4. Message Actions, Copying, and Regeneration Dispatch', () => {
    it('copies assistant message markdown content to clipboard', async () => {
      const msg = createMockMessage({
        role: 'assistant',
        content: 'Respuesta clínica para copiar',
      });

      renderWithProviders(<AssistantMessage message={msg} />);

      const copyBtn = screen.getByTestId('message-copy-button');
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Respuesta clínica para copiar'),
      );
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mensaje copiado/i })).toBeInTheDocument();
      });
    });

    it('triggers onRegenerate callback when regenerate button is clicked', () => {
      const handleRegenerate = jest.fn();
      const msg = createMockMessage({
        id: 'msg_asst_regen',
        role: 'assistant',
        content: 'Respuesta inicial a regenerar',
      });

      renderWithProviders(
        <ChatMessageItem message={msg} onRegenerate={handleRegenerate} isRegenerating={false} />,
      );

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeInTheDocument();

      fireEvent.click(regenBtn);
      expect(handleRegenerate).toHaveBeenCalledWith('msg_asst_regen');
    });

    it('disables regenerate button and presents loading state when isRegenerating is true', () => {
      const msg = createMockMessage({
        id: 'msg_asst_regen',
        role: 'assistant',
        content: 'Generando nueva respuesta...',
      });

      renderWithProviders(
        <ChatMessageItem message={msg} onRegenerate={jest.fn()} isRegenerating={true} />,
      );

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeDisabled();
    });
  });

  describe('5. In-flight, Interrupted, and Abstention Failure States', () => {
    it('renders pending status indicator when assistant generation is starting', () => {
      const msg = createMockMessage({
        role: 'assistant',
        content: '',
        status: 'pending',
      });

      renderWithProviders(<AssistantMessage message={msg} />);

      expect(screen.getByTestId('message-pending-state')).toBeInTheDocument();
      expect(screen.getByText(/sintetizando respuesta fundamentada/i)).toBeInTheDocument();
    });

    it('renders error state with retry action button on failure', () => {
      const handleRetry = jest.fn();
      const msg = createMockMessage({
        id: 'msg_err_01',
        role: 'assistant',
        content: 'No fue posible completar la generación.',
        status: 'error',
      });

      renderWithProviders(<ChatMessageItem message={msg} onRetry={handleRetry} />);

      const retryBtn = screen.getByTestId('message-retry-btn');
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledWith('msg_err_01');
    });

    it('displays grounded abstention notice when clinical context is insufficient (ER.06 Condition C)', () => {
      const abstentionMsg = createMockMessage({
        role: 'assistant',
        content: 'No se encontraron evidencias clínicas suficientes en la base de conocimientos.',
        grounded: false,
        status: 'success',
        metadata: createMockGenerationMetadata({
          finishReason: 'insufficient_context',
        }),
      });

      renderWithProviders(<AssistantMessage message={abstentionMsg} />);

      expect(screen.getByTestId('insufficient-knowledge-banner')).toBeInTheDocument();
      expect(screen.getByText(/conocimiento insuficiente en el repositorio/i)).toBeInTheDocument();
    });
  });
});
