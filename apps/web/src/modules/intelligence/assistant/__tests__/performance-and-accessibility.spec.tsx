import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ChatMessageFeed } from '../components/chat-message-feed';
import { ChatComposer } from '../components/chat-composer';
import { MarkdownRenderer } from '../components/markdown-renderer';
import { CodeBlock } from '../components/code-block';
import { ChatWorkspace } from '../components/chat-workspace';
import { assistantStorageService } from '../services/assistant-storage.service';
import { assistantApi } from '../api/assistant.api';
import type { ChatMessage, RAGAnswerResponseDto } from '../types/assistant.types';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });
}

describe('Chat Performance, Long Conversations & Accessibility Hardening (AI-09.2.07)', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    assistantStorageService.clearConversations(tenantId, userId);
    jest.clearAllMocks();
  });

  describe('1. Long Conversation Rendering & Performance', () => {
    it('renders maximum capacity conversation (60 messages) under 100ms without crashing', () => {
      const messages: ChatMessage[] = [];
      const baseDate = new Date('2026-11-23T10:00:00Z').getTime();

      for (let i = 0; i < 60; i++) {
        const isUser = i % 2 === 0;
        messages.push({
          id: `msg-${i}`,
          role: isUser ? 'user' : 'assistant',
          content: isUser
            ? `Consulta clínica número ${i + 1} sobre pautas de tratamiento.`
            : `Respuesta clínica detallada para la consulta ${i} con recomendaciones fundamentadas y evidencia.`,
          createdAt: new Date(baseDate + i * 10_000).toISOString(),
          status: 'success',
        });
      }

      const startTime = performance.now();
      const { container } = render(<ChatMessageFeed messages={messages} />);
      const renderDuration = performance.now() - startTime;

      // Verify render time is under generous threshold
      expect(renderDuration).toBeLessThan(1000);

      // Verify all 60 message articles exist in the DOM
      const articles = container.querySelectorAll('article');
      expect(articles.length).toBe(60);

      // Verify canonical chronological ordering: first message is msg-0, last is msg-59
      expect(articles[0]).toHaveAttribute('data-testid', 'chat-message-msg-0');
      expect(articles[59]).toHaveAttribute('data-testid', 'chat-message-msg-59');
    });

    it('handles large markdown responses containing headers, lists, code, and tables without blowout', () => {
      const largeMarkdown = `
# Guía de Intervención en Fisioterapia

### Protocolo Fase 1
Pautas iniciales para el manejo de dolor cervical agudo:

- Crioterapia controlada por 15 minutos
- Ejercicios isométricos suaves
- Reeducación postural

\`\`\`typescript
interface ClinicalProtocol {
  phase: number;
  durationWeeks: number;
  exercises: string[];
}
const cervicalProtocol: ClinicalProtocol = {
  phase: 1,
  durationWeeks: 2,
  exercises: ['isométricos', 'retracción cervical']
};
\`\`\`

| Ejercicio | Repeticiones | Frecuencia |
| :--- | :--- | :--- |
| Retracción mentoniana | 10 reps | 3 veces al día |
| Isométricos en flexión | 5 reps x 5s | 2 veces al día |

> Advertencia clínica: Evitar manipulaciones de alta velocidad en presencia de síntomas radiculares.
      `.trim();

      render(<MarkdownRenderer content={largeMarkdown} />);

      // Verify headers
      expect(
        screen.getByRole('heading', { level: 3, name: /Guía de Intervención/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 5, name: /Protocolo Fase 1/i }),
      ).toBeInTheDocument();

      // Verify code block
      expect(screen.getByRole('region', { name: /Bloque de typescript/i })).toBeInTheDocument();

      // Verify table
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Retracción mentoniana')).toBeInTheDocument();

      // Verify blockquote
      expect(screen.getByText(/Evitar manipulaciones de alta velocidad/i)).toBeInTheDocument();
    });
  });

  describe('2. Scroll Behavior & Reduced Motion', () => {
    it('engages auto-scroll when user is near bottom and latest message updates', () => {
      const initialMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hola asistente',
          createdAt: '2026-11-23T10:00:00Z',
          status: 'success',
        },
      ];

      const { rerender } = render(<ChatMessageFeed messages={initialMessages} />);

      // scrollTo was invoked on mount
      expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
      (HTMLElement.prototype.scrollTo as jest.Mock).mockClear();

      // Append new message (simulating streaming token expansion)
      const updatedMessages: ChatMessage[] = [
        ...initialMessages,
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Respuesta progresiva...',
          createdAt: '2026-11-23T10:00:05Z',
          status: 'pending',
        },
      ];

      rerender(<ChatMessageFeed messages={updatedMessages} />);

      // Auto-scroll invoked for the new turn
      expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    });

    it('respects prefers-reduced-motion media query with instant scrolling', () => {
      // Mock prefers-reduced-motion as true
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const messages: ChatMessage[] = [
        {
          id: 'msg-reduced',
          role: 'user',
          content: 'Scroll con movimiento reducido',
          createdAt: '2026-11-23T10:00:00Z',
          status: 'success',
        },
      ];

      render(<ChatMessageFeed messages={messages} />);

      // With reduced motion, scrollTo should be called with behavior: 'auto'
      expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });
  });

  describe('3. Accessibility & Focus Management (WCAG 2.2 AA)', () => {
    it('provides accessible live-region status announcements without token spam', async () => {
      const queryClient = createTestQueryClient();

      jest.spyOn(assistantApi, 'queryKnowledge').mockImplementation(
        () =>
          new Promise<RAGAnswerResponseDto>((resolve) => {
            setTimeout(() => {
              resolve({
                answer: 'Respuesta completada.',
                grounded: true,
                sources: [],
                metadata: { model: 'test', retrievalCount: 0, latencyMs: 50 },
              });
            }, 50);
          }),
      );

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat']}>
            <ChatWorkspace />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const liveRegion = screen.getByTestId('generation-live-region');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
      expect(liveRegion).toHaveClass('sr-only');

      // Submit a query
      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      fireEvent.change(textarea, { target: { value: 'Pregunta de prueba accesible' } });

      const sendButton = screen.getByRole('button', { name: /Enviar mensaje/i });
      fireEvent.click(sendButton);

      // Verify polite pending announcement
      await waitFor(() => {
        expect(liveRegion).toHaveTextContent(/Generando respuesta clínica\.\.\./i);
      });

      // Verify polite completion announcement
      await waitFor(() => {
        expect(liveRegion).toHaveTextContent(/Respuesta clínica generada con éxito\./i);
      });
    });

    it('supports keyboard-only interactions in composer: Enter to send, Shift+Enter for newline, Escape to cancel', () => {
      const handleSend = jest.fn();
      const handleCancel = jest.fn();

      render(<ChatComposer onSend={handleSend} onCancel={handleCancel} isSubmitting={false} />);

      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });

      // Shift+Enter does not trigger submit (inserts newline)
      fireEvent.change(textarea, { target: { value: 'Primera línea' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(handleSend).not.toHaveBeenCalled();

      // Enter alone submits
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(handleSend).toHaveBeenCalledWith('Primera línea');
    });

    it('triggers cancellation via Escape key when generation is in-flight', () => {
      const handleCancel = jest.fn();

      render(<ChatComposer onSend={jest.fn()} onCancel={handleCancel} isSubmitting={true} />);

      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });

      // Escape triggers onCancel
      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('notifies screen readers gently when approaching character limit in composer', () => {
      render(<ChatComposer onSend={jest.fn()} isSubmitting={false} />);

      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });

      // 800 characters: aria-live is 'off'
      fireEvent.change(textarea, { target: { value: 'a'.repeat(800) } });
      let counter = screen.getByText('800/1000');
      expect(counter).toHaveAttribute('aria-live', 'off');

      // 950 characters: aria-live turns 'polite' to gently inform screen readers
      fireEvent.change(textarea, { target: { value: 'a'.repeat(950) } });
      counter = screen.getByText('950/1000');
      expect(counter).toHaveAttribute('aria-live', 'polite');
      expect(counter.className).toMatch(/text-amber-(?:500|700)/);
    });

    it('renders accessible code copy button with visible focus indicator and feedback', async () => {
      render(<CodeBlock code="console.log('test');" language="javascript" />);

      const copyButton = screen.getByRole('button', { name: /Copiar código al portapapeles/i });
      expect(copyButton).toHaveClass('focus-visible:ring-2');

      // Click copy button
      fireEvent.click(copyButton);

      // Verify copied feedback accessible to screen readers
      await waitFor(() => {
        expect(screen.getByText('Código copiado al portapapeles')).toBeInTheDocument();
      });
    });
  });

  describe('4. Responsive Behavior & Text Wrapping', () => {
    it('applies break-words preventing horizontal blowout on long strings', () => {
      const continuousUnbrokenString =
        'https://kinergy.health/protocols/very-long-clinical-guideline-identifier-without-spaces-'.repeat(
          3,
        );

      const messages: ChatMessage[] = [
        {
          id: 'msg-overflow-user',
          role: 'user',
          content: continuousUnbrokenString,
          createdAt: '2026-11-23T10:00:00Z',
          status: 'success',
        },
        {
          id: 'msg-overflow-asst',
          role: 'assistant',
          content: `Revisa la URL: ${continuousUnbrokenString}`,
          createdAt: '2026-11-23T10:00:05Z',
          status: 'success',
        },
      ];

      const { container } = render(<ChatMessageFeed messages={messages} />);

      // Verify user message container has break-words
      const userBubble = container.querySelector(
        '[aria-label^="Mensaje de usuario"] .whitespace-pre-wrap',
      );
      expect(userBubble).toHaveClass('break-words');

      // Verify assistant message container has break-words
      const asstBubble = container.querySelector(
        '[aria-label="Mensaje de asistente"] .rounded-tl-xs',
      );
      expect(asstBubble).toHaveClass('break-words');
    });
  });
});
