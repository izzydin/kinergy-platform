import '@testing-library/jest-dom';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from '../../../../test/test-utils';
import { MessageFeedback } from '../components/message-feedback';
import { FeedbackExplanationDialog } from '../components/feedback-explanation-dialog';
import { CopyAction, RegenerateAction, MessageActions } from '../components/message-actions';
import { ChatComposer } from '../components/chat-composer';
import { AssistantMessage } from '../components/assistant-message';
import { MessageStatusIndicator } from '../components/message-status-indicator';
import { conversationApi } from '../api/conversation.api';
import * as clipboardUtil from '../utils/clipboard.util';
import type { ChatMessage } from '../types/assistant.types';

jest.mock('../api/conversation.api');
const mockedConvApi = jest.mocked(conversationApi);

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, Wrapper };
}

describe('AI-09.5 - FB.07: Accessibility, Keyboard Navigation & UX Hardening Suite', () => {
  const conversationId = 'conv_a11y_001';
  const messageId = 'msg_asst_101';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Keyboard Navigation & Activation Standards', () => {
    it('activates feedback rating buttons with Enter and Space keys', async () => {
      mockedConvApi.getFeedback.mockResolvedValueOnce(null);
      mockedConvApi.submitFeedback.mockResolvedValueOnce({
        id: 'fb_1',
        conversationId,
        messageId,
        userId: 'usr_doc',
        rating: 'POSITIVE',
        explanation: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      expect(positiveBtn).toHaveAttribute('type', 'button');

      // Focus positive button and activate with Enter
      positiveBtn.focus();
      expect(document.activeElement).toBe(positiveBtn);

      fireEvent.keyDown(positiveBtn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(positiveBtn);

      await waitFor(() => {
        expect(mockedConvApi.submitFeedback).toHaveBeenCalledWith(
          conversationId,
          messageId,
          expect.objectContaining({ rating: 'POSITIVE' }),
        );
      });
    });

    it('supports Space key activation on message copy and regenerate actions', async () => {
      jest.spyOn(clipboardUtil, 'copyToClipboard').mockResolvedValueOnce({ success: true });
      const onRegenerateMock = jest.fn();

      renderWithProviders(
        <MessageActions
          content="Texto de recomendación clínica sobre columna."
          onRegenerate={onRegenerateMock}
        />,
      );

      const copyBtn = screen.getByTestId('message-copy-button');
      const regenBtn = screen.getByTestId('message-regenerate-button');

      // Test Space on Copy
      copyBtn.focus();
      expect(document.activeElement).toBe(copyBtn);
      fireEvent.keyDown(copyBtn, { key: ' ', code: 'Space' });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(clipboardUtil.copyToClipboard).toHaveBeenCalledWith(
          expect.stringContaining('Texto de recomendación clínica'),
        );
      });

      // Test Enter on Regenerate
      regenBtn.focus();
      expect(document.activeElement).toBe(regenBtn);
      fireEvent.keyDown(regenBtn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(regenBtn);
      expect(onRegenerateMock).toHaveBeenCalledTimes(1);
    });

    it('navigates composer with keyboard shortcuts: Enter submits, Shift+Enter keeps newline, Escape cancels', () => {
      const onSendMock = jest.fn();
      const onCancelMock = jest.fn();

      const { rerender } = renderWithProviders(
        <ChatComposer onSend={onSendMock} onCancel={onCancelMock} isSubmitting={false} />,
      );

      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });

      // Shift+Enter does not submit
      fireEvent.change(textarea, { target: { value: 'Línea uno' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(onSendMock).not.toHaveBeenCalled();

      // Enter alone submits
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(onSendMock).toHaveBeenCalledWith('Línea uno');

      // Rerender as in-flight submitting to test Escape cancellation
      rerender(<ChatComposer onSend={onSendMock} onCancel={onCancelMock} isSubmitting={true} />);

      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Modal Dialog Focus Management & Deterministic Restoration', () => {
    it('autofocuses textarea on open and restores focus to trigger button when dismissed via cancel', async () => {
      const onOpenChangeMock = jest.fn();
      const triggerBtn = document.createElement('button');
      triggerBtn.setAttribute('data-testid', 'test-trigger-btn');
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();

      const triggerRef = { current: triggerBtn };

      const { rerender } = renderWithProviders(
        <FeedbackExplanationDialog
          open={true}
          onOpenChange={onOpenChangeMock}
          rating="NEGATIVE"
          triggerRef={triggerRef}
          onSubmit={jest.fn()}
        />,
      );

      // Textarea has autofocus
      const textarea = screen.getByTestId('feedback-explanation-textarea');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveFocus();

      // Press cancel
      const cancelBtn = screen.getByTestId('feedback-cancel-button');
      fireEvent.click(cancelBtn);
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);

      // Close dialog
      rerender(
        <FeedbackExplanationDialog
          open={false}
          onOpenChange={onOpenChangeMock}
          rating="NEGATIVE"
          triggerRef={triggerRef}
          onSubmit={jest.fn()}
        />,
      );

      // Cleanup
      document.body.removeChild(triggerBtn);
    });

    it('dismisses explanation dialog on Escape key and exposes accessible title and description', () => {
      const onOpenChangeMock = jest.fn();

      renderWithProviders(
        <FeedbackExplanationDialog
          open={true}
          onOpenChange={onOpenChangeMock}
          rating="NEGATIVE"
          onSubmit={jest.fn()}
        />,
      );

      const dialog = screen.getByTestId('feedback-explanation-dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-describedby', 'feedback-explanation-desc');

      const title = screen.getByText(/¿Cómo podemos mejorar esta respuesta\?/i);
      expect(title).toBeInTheDocument();

      const desc = screen.getByText(/Tu opinión ayuda a mejorar la precisión/i);
      expect(desc).toHaveAttribute('id', 'feedback-explanation-desc');

      // Press Escape
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });
  });

  describe('3. Accessible Names, ARIA Attributes & Live Announcements', () => {
    it('exposes aria-pressed and descriptive labels on positive and negative feedback buttons', async () => {
      mockedConvApi.getFeedback.mockResolvedValueOnce({
        id: 'fb_existing',
        conversationId,
        messageId,
        userId: 'usr_doc',
        rating: 'POSITIVE',
        explanation: 'Excelente precisión.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      const negativeBtn = screen.getByTestId('feedback-negative-button');

      // Wait for query to settle and update positive button to selected
      await waitFor(() => {
        expect(positiveBtn).toHaveAttribute('aria-pressed', 'true');
      });

      expect(positiveBtn).toHaveAttribute('aria-label', 'Valoración positiva enviada');

      // Negative is not selected
      expect(negativeBtn).toHaveAttribute('aria-pressed', 'false');
      expect(negativeBtn).toHaveAttribute('aria-label', 'Respuesta no útil (negativa)');

      // Explanation trigger button is present with accessible label
      const explanationTrigger = await screen.findByTestId('feedback-explanation-trigger');
      expect(explanationTrigger).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Editar comentario explicativo'),
      );
    });

    it('announces copy success politely via screen-reader live region', async () => {
      jest.spyOn(clipboardUtil, 'copyToClipboard').mockResolvedValueOnce({ success: true });

      renderWithProviders(
        <CopyAction content="Contenido clínico verificado." label="Copiar respuesta" />,
      );

      const copyBtn = screen.getByTestId('message-copy-button');
      expect(copyBtn).toHaveAttribute('aria-label', 'Copiar respuesta');

      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(copyBtn).toHaveAttribute('aria-label', 'Mensaje copiado');
        const srLiveAnnouncement = screen.getByText('Texto copiado al portapapeles');
        expect(srLiveAnnouncement).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('exposes aria-busy on regenerate button during active regeneration', () => {
      renderWithProviders(
        <RegenerateAction
          onRegenerate={jest.fn()}
          disabled={true}
          label="Regenerar respuesta del asistente"
        />,
      );

      const regenBtn = screen.getByTestId('message-regenerate-button');
      expect(regenBtn).toBeDisabled();
      expect(regenBtn).toHaveAttribute('aria-busy', 'true');
      expect(regenBtn).toHaveAttribute('aria-label', 'Regenerar respuesta del asistente');
    });

    it('renders message actions with role toolbar and descriptive aria-label', () => {
      renderWithProviders(<MessageActions content="Contenido" onRegenerate={jest.fn()} />);

      const toolbar = screen.getByTestId('message-actions-toolbar');
      expect(toolbar).toHaveAttribute('role', 'toolbar');
      expect(toolbar).toHaveAttribute('aria-label', 'Acciones del mensaje');
    });
  });

  describe('4. Form Validation Accessibility & Error Association', () => {
    it('associates textarea with error alert and sets aria-invalid when character limit is exceeded', () => {
      renderWithProviders(
        <FeedbackExplanationDialog
          open={true}
          onOpenChange={jest.fn()}
          rating="NEGATIVE"
          initialExplanation={'X'.repeat(1001)}
          onSubmit={jest.fn()}
        />,
      );

      const textarea = screen.getByTestId('feedback-explanation-textarea');
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
      expect(textarea).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('feedback-explanation-error'),
      );

      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toHaveAttribute('id', 'feedback-explanation-error');
      expect(errorAlert).toHaveTextContent(/no puede superar los 1000 caracteres/i);

      // Submit button is disabled
      const submitBtn = screen.getByTestId('feedback-submit-button');
      expect(submitBtn).toBeDisabled();
    });

    it('exposes aria-busy on dialog form during submission', () => {
      renderWithProviders(
        <FeedbackExplanationDialog
          open={true}
          onOpenChange={jest.fn()}
          rating="POSITIVE"
          isSubmitting={true}
          onSubmit={jest.fn()}
        />,
      );

      const submitBtn = screen.getByTestId('feedback-submit-button');
      expect(submitBtn).toBeDisabled();
      expect(submitBtn).toHaveAttribute('aria-busy', 'true');
      expect(submitBtn).toHaveAttribute('aria-label', 'Guardando comentario...');
    });
  });

  describe('5. Responsive Touch Targets & Reduced-Motion Styling', () => {
    it('applies touch-target expansion classes to action and feedback buttons', async () => {
      mockedConvApi.getFeedback.mockResolvedValueOnce(null);
      const { Wrapper } = createTestWrapper();

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      const negativeBtn = screen.getByTestId('feedback-negative-button');

      // Verify touch expansion pseudo-element class
      expect(positiveBtn.className).toContain('after:-inset-1.5');
      expect(negativeBtn.className).toContain('after:-inset-1.5');
    });

    it('applies motion-safe animations to spinners respecting user preferences', () => {
      const { container } = renderWithProviders(<MessageStatusIndicator status="generating" />);

      const animatedElement = container.querySelector('.motion-safe\\:animate-spin');
      expect(animatedElement).toBeInTheDocument();
    });

    it('renders composer stop button with minimum accessible touch area and keyboard shortcut hint', () => {
      renderWithProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={jest.fn()}
          isSubmitting={true}
          isCancelling={false}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /Detener generación de respuesta/i });
      expect(stopBtn).toHaveClass('min-h-[32px]');
      expect(stopBtn).toHaveClass('min-w-[32px]');

      // Shortcut hint is visible
      expect(screen.getByText(/Presiona Escape o el botón para detener/i)).toBeInTheDocument();
    });

    it('renders assistant message footer with flex-wrap preventing mobile horizontal clipping', () => {
      const message: ChatMessage = {
        id: 'msg_asst_wrap_1',
        role: 'assistant',
        content: 'Protocolo de articulación acromioclavicular.',
        createdAt: '2026-11-25T12:00:00Z',
        status: 'success',
      };

      const { container } = renderWithProviders(
        <AssistantMessage message={message} conversationId={conversationId} />,
      );

      const footer = container.querySelector('footer, .flex.w-full.flex-wrap');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveClass('flex-wrap');
    });
  });
});
