import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/test-utils';
import { copyToClipboard } from '../utils/clipboard.util';
import { formatMessageForCopy } from '../utils/message-copy-formatter.util';
import { CopyAction, RegenerateAction, MessageActions } from '../components/message-actions';
import { AssistantMessage } from '../components/assistant-message';
import { UserMessage } from '../components/user-message';
import { notificationService } from '../../../../app/providers/notification-provider';
import type { ChatMessage, RAGSourceCitationDto } from '../types/assistant.types';

describe('AI-09.5 - FB.04: Assistant Message Actions & Response Copying Test Suite', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  // =========================================================================
  // 1. Message Copy Formatter Unit Tests
  // =========================================================================
  describe('1. Message Copy Formatter (formatMessageForCopy)', () => {
    it('preserves normal plain text messages cleanly', () => {
      const text = 'Hola, ¿en qué puedo ayudarte hoy?';
      const formatted = formatMessageForCopy(text);
      expect(formatted).toBe('Hola, ¿en qué puedo ayudarte hoy?');
    });

    it('preserves Markdown headers, paragraphs, bold, and italic text structure', () => {
      const markdown = [
        '# Diagnóstico Preliminar',
        '',
        'El paciente presenta **dolor agudo** en la zona lumbar con _irradiación leve_.',
        '',
        'Se recomienda reposo relativo.',
      ].join('\n');

      const formatted = formatMessageForCopy(markdown);
      expect(formatted).toBe(markdown);
    });

    it('preserves numbered lists and bullet points without alteration', () => {
      const listContent = [
        'Fases de rehabilitación:',
        '1. Disminución de edema y dolor.',
        '2. Restauración de arcos de movilidad.',
        '3. Fortalecimiento isométrico.',
        '',
        'Material necesario:',
        '- Banda elástica media',
        '- Rodillo de espuma',
      ].join('\n');

      const formatted = formatMessageForCopy(listContent);
      expect(formatted).toBe(listContent);
    });

    it('preserves code blocks with language indicators and indentation', () => {
      const codeMarkdown = [
        'A continuación se muestra el algoritmo de cálculo:',
        '```python',
        'def calcular_dosificacion(peso, dolor):',
        '    base = peso * 0.15',
        '    return base if dolor < 5 else base * 0.8',
        '```',
        'Verificar antes de aplicar.',
      ].join('\n');

      const formatted = formatMessageForCopy(codeMarkdown);
      expect(formatted).toBe(codeMarkdown);
    });

    it('appends verified source citations in human-readable bibliographic format without internal IDs', () => {
      const content = 'El esguince grado II requiere inmovilización funcional temprana.';
      const sources: RAGSourceCitationDto[] = [
        {
          documentId: 'doc_internal_secret_123',
          chunkId: 'chk_internal_secret_999',
          documentTitle: 'Guía Clínica de Traumatología Deportiva',
          pageNumber: 14,
          headingPath: ['Miembro Inferior', 'Tobillo'],
          relevanceScore: 0.98,
        },
        {
          documentId: 'doc_internal_secret_456',
          chunkId: 'chk_internal_secret_888',
          documentTitle: 'Manual de Crioterapia y Vendajes',
          pageNumber: 22,
          relevanceScore: 0.91,
        },
      ];

      const formatted = formatMessageForCopy(content, sources);

      // Verify content is preserved
      expect(formatted).toContain(content);
      // Verify bibliography header
      expect(formatted).toContain('---');
      expect(formatted).toContain('Fuentes consultadas:');
      // Verify human-readable citation references
      expect(formatted).toContain(
        '[1] Guía Clínica de Traumatología Deportiva (p. 14) - Sección: Miembro Inferior > Tobillo',
      );
      expect(formatted).toContain('[2] Manual de Crioterapia y Vendajes (p. 22)');
      // Verify internal IDs and telemetry are strictly NOT leaked
      expect(formatted).not.toContain('doc_internal_secret');
      expect(formatted).not.toContain('chk_internal_secret');
      expect(formatted).not.toContain('0.98');
    });

    it('deduplicates citations referencing the same document title and page', () => {
      const content = 'Respuesta fundamentada.';
      const sources: RAGSourceCitationDto[] = [
        {
          documentId: 'doc_1',
          chunkId: 'chk_1',
          documentTitle: 'Protocolo de Kinesiología',
          pageNumber: 5,
          relevanceScore: 0.95,
        },
        {
          documentId: 'doc_1',
          chunkId: 'chk_2',
          documentTitle: 'Protocolo de Kinesiología',
          pageNumber: 5,
          relevanceScore: 0.94,
        },
      ];

      const formatted = formatMessageForCopy(content, sources);
      // Only one citation line should be present
      expect(formatted).toContain('[1] Protocolo de Kinesiología (p. 5)');
      expect(formatted).not.toContain('[2]');
    });

    it('returns empty string when input content is empty or whitespace', () => {
      expect(formatMessageForCopy('')).toBe('');
      expect(formatMessageForCopy('   ')).toBe('');
    });
  });

  // =========================================================================
  // 2. Clipboard Utility Unit Tests (copyToClipboard)
  // =========================================================================
  describe('2. Clipboard Utility (copyToClipboard)', () => {
    it('copies text via navigator.clipboard.writeText when modern API is available', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const result = await copyToClipboard('Texto de prueba');
      expect(result.success).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith('Texto de prueba');
    });

    it('falls back to document.execCommand when navigator.clipboard throws', async () => {
      // Modern API throws PermissionDenied
      const writeTextMock = jest.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const execCommandMock = jest.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      const result = await copyToClipboard('Texto con fallback');
      expect(result.success).toBe(true);
      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });

    it('falls back to document.execCommand when navigator.clipboard is undefined', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const execCommandMock = jest.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      const result = await copyToClipboard('Texto sin navigator.clipboard');
      expect(result.success).toBe(true);
      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });

    it('returns failure when both modern clipboard and execCommand fallback fail', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn().mockRejectedValue(new Error('Permission denied')),
        },
        writable: true,
        configurable: true,
      });

      document.execCommand = jest.fn().mockReturnValue(false);

      const result = await copyToClipboard('Falla total');
      expect(result.success).toBe(false);
      expect(result.error).toContain('El portapapeles no está disponible');
    });

    it('rejects invalid non-string payloads', async () => {
      // @ts-expect-error testing runtime resilience
      const result = await copyToClipboard(null);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid text payload');
    });
  });

  // =========================================================================
  // 3. CopyAction Component Unit Tests
  // =========================================================================
  describe('3. CopyAction Component', () => {
    it('renders with copy icon and accessible label', () => {
      renderWithProviders(
        <CopyAction content="Contenido clínico" label="Copiar respuesta del asistente" />,
      );

      const copyBtn = screen.getByTestId('message-copy-button');
      expect(copyBtn).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('aria-label', 'Copiar respuesta del asistente');
      expect(copyBtn).not.toBeDisabled();
    });

    it('executes copy and changes visual state to Check with 2000ms transient indicator', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const onCopySuccessMock = jest.fn();

      renderWithProviders(
        <CopyAction
          content="Contenido exitoso"
          label="Copiar respuesta"
          onCopySuccess={onCopySuccessMock}
        />,
      );

      const copyBtn = screen.getByTestId('message-copy-button');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith('Contenido exitoso');
        expect(onCopySuccessMock).toHaveBeenCalledTimes(1);
      });

      // Visual state changes to copied (Check icon and accessible label updated)
      expect(screen.getByText('Texto copiado al portapapeles')).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('aria-label', 'Mensaje copiado');

      // Fast-forward 2000ms: visual state resets
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(copyBtn).toHaveAttribute('aria-label', 'Copiar respuesta');
    });

    it('handles clipboard failure: triggers notificationService.error and calls onCopyError', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn().mockRejectedValue(new Error('Clipboard blocked')),
        },
        writable: true,
        configurable: true,
      });
      document.execCommand = jest.fn().mockReturnValue(false);

      const notifyErrorSpy = jest.spyOn(notificationService, 'error');
      const onCopyErrorMock = jest.fn();

      renderWithProviders(
        <CopyAction
          content="Contenido con error"
          label="Copiar respuesta"
          onCopyError={onCopyErrorMock}
        />,
      );

      const copyBtn = screen.getByTestId('message-copy-button');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(notifyErrorSpy).toHaveBeenCalled();
        expect(onCopyErrorMock).toHaveBeenCalled();
      });

      // Check that it did NOT set copied to true
      expect(copyBtn).toHaveAttribute('aria-label', 'Copiar respuesta');
      expect(screen.queryByText('Texto copiado al portapapeles')).not.toBeInTheDocument();
    });

    it('prevents rapid repeated duplicate executions during in-flight copy', async () => {
      let resolveCopy: () => void = () => {};
      const pendingPromise = new Promise<void>((resolve) => {
        resolveCopy = resolve;
      });

      const writeTextMock = jest.fn().mockReturnValue(pendingPromise);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderWithProviders(<CopyAction content="Contenido concurrente" />);

      const copyBtn = screen.getByTestId('message-copy-button');

      // Click multiple times rapidly
      fireEvent.click(copyBtn);
      fireEvent.click(copyBtn);
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledTimes(1);

      // Resolve in-flight promise
      act(() => {
        resolveCopy();
      });

      await waitFor(() => {
        expect(screen.getByText('Texto copiado al portapapeles')).toBeInTheDocument();
      });
    });

    it('respects disabled prop and prevents copy action when disabled', () => {
      const writeTextMock = jest.fn();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderWithProviders(<CopyAction content="Deshabilitado" disabled={true} />);

      const copyBtn = screen.getByTestId('message-copy-button');
      expect(copyBtn).toBeDisabled();

      fireEvent.click(copyBtn);
      expect(writeTextMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. RegenerateAction Component Unit Tests
  // =========================================================================
  describe('4. RegenerateAction Component', () => {
    it('renders regenerate button and triggers onRegenerate on click', () => {
      const onRegenerateMock = jest.fn();

      renderWithProviders(
        <RegenerateAction onRegenerate={onRegenerateMock} label="Regenerar respuesta clínica" />,
      );

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeInTheDocument();
      expect(regenBtn).toHaveAttribute('aria-label', 'Regenerar respuesta clínica');

      fireEvent.click(regenBtn);
      expect(onRegenerateMock).toHaveBeenCalledTimes(1);
    });

    it('respects disabled prop on regenerate button', () => {
      const onRegenerateMock = jest.fn();

      renderWithProviders(<RegenerateAction onRegenerate={onRegenerateMock} disabled={true} />);

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeDisabled();

      fireEvent.click(regenBtn);
      expect(onRegenerateMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. MessageActions & AssistantMessage Integration Tests
  // =========================================================================
  describe('5. Integration with AssistantMessage & UserMessage', () => {
    it('copies formatted response with citations from AssistantMessage', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const assistantMessage: ChatMessage = {
        id: 'asst_fb04_test_1',
        role: 'assistant',
        content: 'El tratamiento consiste en crioterapia durante 48 horas.',
        createdAt: '2026-11-25T12:00:00.000Z',
        status: 'success',
        grounded: true,
        sources: [
          {
            documentId: 'doc_1',
            chunkId: 'chk_1',
            documentTitle: 'Guía Médica de Rehabilitación',
            pageNumber: 8,
            relevanceScore: 0.95,
          },
        ],
      };

      renderWithProviders(
        <AssistantMessage message={assistantMessage} conversationId="conv_fb04_test" />,
      );

      // Verify copy button in AssistantMessage toolbar
      const copyBtn = screen.getByTestId('message-copy-button');
      expect(copyBtn).toBeInTheDocument();

      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1);
      });

      const copiedText = writeTextMock.mock.calls[0][0];
      expect(copiedText).toContain('El tratamiento consiste en crioterapia durante 48 horas.');
      expect(copiedText).toContain('Fuentes consultadas:');
      expect(copiedText).toContain('[1] Guía Médica de Rehabilitación (p. 8)');
      expect(copiedText).not.toContain('doc_1');
    });

    it('coexists with MessageFeedback buttons in AssistantMessage toolbar without conflicts', () => {
      const assistantMessage: ChatMessage = {
        id: 'asst_fb04_coexist',
        role: 'assistant',
        content: 'Respuesta con acciones de feedback y copia simultáneas.',
        createdAt: '2026-11-25T12:00:00.000Z',
        status: 'success',
        grounded: true,
      };

      renderWithProviders(
        <AssistantMessage message={assistantMessage} conversationId="conv_fb04_test" />,
      );

      // Both copy button and feedback controls should be rendered
      expect(screen.getByTestId('message-copy-button')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-positive-button')).toBeInTheDocument();
      expect(screen.getByTestId('feedback-negative-button')).toBeInTheDocument();
    });

    it('renders onRegenerate action when provided on AssistantMessage', () => {
      const onRegenerateMock = jest.fn();
      const assistantMessage: ChatMessage = {
        id: 'asst_fb04_regen',
        role: 'assistant',
        content: 'Respuesta regenerable.',
        createdAt: '2026-11-25T12:00:00.000Z',
        status: 'success',
      };

      renderWithProviders(
        <AssistantMessage
          message={assistantMessage}
          conversationId="conv_fb04_test"
          onRegenerate={onRegenerateMock}
        />,
      );

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeInTheDocument();

      fireEvent.click(regenBtn);
      expect(onRegenerateMock).toHaveBeenCalledTimes(1);
    });

    it('allows copying user queries from UserMessage without citation references', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const userMessage: ChatMessage = {
        id: 'user_fb04_query',
        role: 'user',
        content: '¿Cuál es el tiempo de recuperación de un esguince?',
        createdAt: '2026-11-25T12:00:00.000Z',
        status: 'success',
      };

      renderWithProviders(<UserMessage message={userMessage} />);

      const copyBtn = screen.getByTestId('message-copy-button');
      expect(copyBtn).toHaveAttribute('aria-label', 'Copiar consulta de usuario');

      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(
          '¿Cuál es el tiempo de recuperación de un esguince?',
        );
      });
    });

    it('renders standalone MessageActions toolbar with slotted actions and copy button', () => {
      renderWithProviders(
        <MessageActions content="Texto en barra">
          <span data-testid="custom-action-slot">Acción personalizada</span>
        </MessageActions>,
      );

      expect(screen.getByTestId('message-actions-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('custom-action-slot')).toBeInTheDocument();
      expect(screen.getByTestId('message-copy-button')).toBeInTheDocument();
    });
  });
});
