import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMessage } from '../components/user-message';
import { AssistantMessage } from '../components/assistant-message';
import { CodeBlock } from '../components/code-block';
import { MarkdownRenderer } from '../components/markdown-renderer';
import { ChatComposer } from '../components/chat-composer';
import type { ChatMessage } from '../types/assistant.types';

describe('Message Components & Message Composer (AI-09.2.03)', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
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

  describe('UserMessage', () => {
    it('renders user text content cleanly without evaluating HTML', () => {
      const msg: ChatMessage = {
        id: 'user-1',
        role: 'user',
        content: '<script>alert("xss")</script> ¿Cuál es el tratamiento?',
        createdAt: '2026-11-21T10:00:00Z',
        status: 'success',
      };

      render(<UserMessage message={msg} />);

      expect(screen.getByTestId('chat-message-user-1')).toBeInTheDocument();
      // Should display script tag as pure text, not executable
      expect(
        screen.getByText('<script>alert("xss")</script> ¿Cuál es el tratamiento?'),
      ).toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Mensaje de usuario' })).toBeInTheDocument();
    });

    it('copies user message to clipboard on copy action', async () => {
      const msg: ChatMessage = {
        id: 'user-2',
        role: 'user',
        content: 'Consulta de kinesiología respiratoria',
        createdAt: '2026-11-21T10:05:00Z',
        status: 'success',
      };

      render(<UserMessage message={msg} />);

      const copyBtn = screen.getByLabelText(/Copiar consulta de usuario/i);
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Consulta de kinesiología respiratoria',
      );
      await waitFor(() => {
        expect(screen.getByLabelText(/Mensaje copiado/i)).toBeInTheDocument();
      });
    });
  });

  describe('AssistantMessage & Status Indicators', () => {
    it('renders pending status with progress indication', () => {
      const pendingMsg: ChatMessage = {
        id: 'asst-pending',
        role: 'assistant',
        content: '',
        createdAt: '2026-11-21T10:10:00Z',
        status: 'pending',
      };

      render(<AssistantMessage message={pendingMsg} />);

      expect(screen.getByTestId('message-pending-state')).toBeInTheDocument();
      expect(screen.getByText(/Sintetizando respuesta fundamentada.../i)).toBeInTheDocument();
    });

    it('renders error status with retry trigger', () => {
      const onRetryMock = jest.fn();
      const errorMsg: ChatMessage = {
        id: 'asst-err',
        role: 'assistant',
        content: '',
        createdAt: '2026-11-21T10:12:00Z',
        status: 'error',
        error: 'Timeout en el servicio LLM',
      };

      render(<AssistantMessage message={errorMsg} onRetry={onRetryMock} />);

      expect(screen.getByTestId('message-error-state')).toBeInTheDocument();
      expect(
        screen.getByText(/Error al generar respuesta: Timeout en el servicio LLM/i),
      ).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('renders assistant response with telemetry, citations, and copy action', async () => {
      const successMsg: ChatMessage = {
        id: 'asst-success',
        role: 'assistant',
        content: 'Este es el resultado del análisis clínico.',
        createdAt: '2026-11-21T10:15:00Z',
        status: 'success',
        grounded: true,
        sources: [
          {
            documentId: 'doc-42',
            documentTitle: 'Guía de Rehabilitación Motora',
            chunkId: 'chunk-1',
            pageNumber: 14,
            relevanceScore: 0.96,
          },
        ],
        metadata: {
          model: 'claude-3-5-sonnet',
          retrievalCount: 1,
          latencyMs: 310,
        },
      };

      render(<AssistantMessage message={successMsg} />);

      expect(screen.getByText('Este es el resultado del análisis clínico.')).toBeInTheDocument();
      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByText('Guía de Rehabilitación Motora')).toBeInTheDocument();
      expect(screen.getByText('p.14')).toBeInTheDocument();
      expect(screen.getByText('claude-3-5-sonnet')).toBeInTheDocument();
      expect(screen.getByText('310ms')).toBeInTheDocument();
      expect(screen.getByText('Fundamentado')).toBeInTheDocument();

      // Copy answer
      const copyBtn = screen.getByLabelText(/Copiar respuesta del asistente/i);
      fireEvent.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Este es el resultado del análisis clínico.',
      );
    });
  });

  describe('CodeBlock', () => {
    it('renders code block with language indicator and copy function', async () => {
      const codeSnippet = 'const add = (a: number, b: number) => a + b;';

      render(<CodeBlock code={codeSnippet} language="typescript" />);

      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(screen.getByText(codeSnippet)).toBeInTheDocument();

      const copyBtn = screen.getByRole('button', { name: /Copiar código al portapapeles/i });
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(codeSnippet);
      await waitFor(() => {
        expect(screen.getByText('Copiado!')).toBeInTheDocument();
      });
    });
  });

  describe('MarkdownRenderer (Safe Parsing & Formatting)', () => {
    it('renders headings, lists, quotes, inline formatting and tables', () => {
      const markdown = `
# Título Principal
## Subtítulo Clínico
### Nivel 3

> Esta es una cita importante de la guía.

- Elemento de lista no ordenada 1
- Elemento de lista no ordenada 2

1. Primer paso ordenado
2. Segundo paso ordenado

| Parámetro | Valor Recomendado |
|---|---|
| Frecuencia | 3 veces por semana |
| Duración | 45 minutos |

Texto con **negrita**, *cursiva*, \`código en línea\` y un enlace [Documentación](https://example.com/docs).
`;

      render(<MarkdownRenderer content={markdown} />);

      expect(
        screen.getByRole('heading', { level: 3, name: /Título Principal/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 4, name: /Subtítulo Clínico/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 5, name: /Nivel 3/i })).toBeInTheDocument();

      expect(screen.getByText(/Esta es una cita importante de la guía/i)).toBeInTheDocument();
      expect(screen.getByText('Elemento de lista no ordenada 1')).toBeInTheDocument();
      expect(screen.getByText('Primer paso ordenado')).toBeInTheDocument();

      // Table headers & data
      expect(screen.getByRole('columnheader', { name: /Parámetro/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Valor Recomendado/i })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: /Frecuencia/i })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: /3 veces por semana/i })).toBeInTheDocument();

      // Inline styles
      expect(screen.getByText('negrita')).toBeInTheDocument();
      expect(screen.getByText('cursiva')).toBeInTheDocument();
      expect(screen.getByText('código en línea')).toBeInTheDocument();

      // Safe link
      const link = screen.getByRole('link', { name: /Documentación/i });
      expect(link).toHaveAttribute('href', 'https://example.com/docs');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('neutralizes malicious javascript: links and prevents XSS', () => {
      const maliciousMd = 'Haz click aquí: [Peligro](javascript:alert("hacked"))';

      render(<MarkdownRenderer content={maliciousMd} />);

      // Must not render an <a> tag pointing to javascript:
      expect(screen.queryByRole('link', { name: /Peligro/i })).toBeNull();
      // Should render as neutral text
      expect(screen.getByText('Peligro')).toBeInTheDocument();
    });
  });

  describe('ChatComposer (Multiline, Shortcuts, Validation & Draft Preservation)', () => {
    it('disables submit button when text length is below 3 characters', () => {
      const onSendMock = jest.fn();
      render(<ChatComposer onSend={onSendMock} />);

      const submitBtn = screen.getByRole('button', { name: /Enviar mensaje/i });
      const textarea = screen.getByLabelText(/Escribe tu consulta para el asistente/i);

      expect(submitBtn).toBeDisabled();

      fireEvent.change(textarea, { target: { value: 'ab' } });
      expect(submitBtn).toBeDisabled();

      fireEvent.change(textarea, { target: { value: 'abc' } });
      expect(submitBtn).not.toBeDisabled();
    });

    it('enforces 1000 character boundary and shows warning', () => {
      const onSendMock = jest.fn();
      render(<ChatComposer onSend={onSendMock} />);

      const textarea = screen.getByLabelText(/Escribe tu consulta para el asistente/i);
      const submitBtn = screen.getByRole('button', { name: /Enviar mensaje/i });

      const longText = 'a'.repeat(1001);
      fireEvent.change(textarea, { target: { value: longText } });

      expect(screen.getByText('1001/1000')).toHaveClass('text-destructive');
      expect(submitBtn).toBeDisabled();
    });

    it('submits on Enter key without shift and clears input on success', async () => {
      const onSendMock = jest.fn().mockResolvedValue(undefined);
      render(<ChatComposer onSend={onSendMock} />);

      const textarea = screen.getByLabelText(
        /Escribe tu consulta para el asistente/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: '¿Cuál es el protocolo de esguince?' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSendMock).toHaveBeenCalledWith('¿Cuál es el protocolo de esguince?');
      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('does not submit on Shift+Enter (allows multiline input)', () => {
      const onSendMock = jest.fn();
      render(<ChatComposer onSend={onSendMock} />);

      const textarea = screen.getByLabelText(/Escribe tu consulta para el asistente/i);
      fireEvent.change(textarea, { target: { value: 'Primera línea' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSendMock).not.toHaveBeenCalled();
    });

    it('submits on Ctrl+Enter keyboard shortcut', () => {
      const onSendMock = jest.fn().mockResolvedValue(undefined);
      render(<ChatComposer onSend={onSendMock} />);

      const textarea = screen.getByLabelText(/Escribe tu consulta para el asistente/i);
      fireEvent.change(textarea, { target: { value: 'Consulta con shortcut' } });

      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSendMock).toHaveBeenCalledWith('Consulta con shortcut');
    });

    it('preserves draft text if onSend throws an error', async () => {
      const onSendMock = jest.fn().mockRejectedValue(new Error('Network submission failed'));
      render(<ChatComposer onSend={onSendMock} />);

      const textarea = screen.getByLabelText(
        /Escribe tu consulta para el asistente/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Consulta que fallará' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSendMock).toHaveBeenCalledWith('Consulta que fallará');
      await waitFor(() => {
        // Textarea value should still contain the draft
        expect(textarea.value).toBe('Consulta que fallará');
      });
    });

    it('disables textarea and button during submission', () => {
      const onSendMock = jest.fn();
      render(<ChatComposer onSend={onSendMock} isSubmitting={true} />);

      const textarea = screen.getByLabelText(/Escribe tu consulta para el asistente/i);
      const submitBtn = screen.getByRole('button', { name: /Enviar mensaje/i });

      expect(textarea).toBeDisabled();
      expect(submitBtn).toBeDisabled();
    });
  });
});
