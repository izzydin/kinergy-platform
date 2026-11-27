import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatComposer } from '../components/chat-composer';
import { assistantStorageService } from '../services/assistant-storage.service';

describe('AI-09.10-IT.03 — ChatComposer Component Specification', () => {
  const defaultTenantId = 'tenant_composer_test';
  const defaultUserId = 'user_composer_test';
  const defaultConvId = 'conv_composer_test_01';

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    assistantStorageService.clearDraft(defaultTenantId, defaultUserId, defaultConvId);
  });

  describe('1. Input Rendering and Character Limit Enforcement', () => {
    it('renders the textarea with accessible label, placeholder, and initial character count', () => {
      render(
        <ChatComposer
          onSend={jest.fn()}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox', {
        name: /escribe tu consulta para el asistente/i,
      });
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('');
      expect(screen.getByText(/0\s*\/\s*1000/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enviar mensaje/i })).toBeDisabled();
    });

    it('enforces minimum length rule (min 3 chars) before enabling send button', async () => {
      const handleSend = jest.fn();
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /enviar mensaje/i });

      // Typing 2 characters should not enable send
      fireEvent.change(textarea, { target: { value: 'Hi' } });
      expect(sendBtn).toBeDisabled();

      // Typing 3 characters should enable send
      fireEvent.change(textarea, { target: { value: 'Doc' } });
      expect(sendBtn).not.toBeDisabled();

      // Whitespace only should remain disabled
      fireEvent.change(textarea, { target: { value: '   ' } });
      expect(sendBtn).toBeDisabled();
    });

    it('enforces maximum character limit (1000 chars) and presents validation feedback', () => {
      const handleSend = jest.fn();
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const longInput = 'a'.repeat(1001);

      fireEvent.change(textarea, { target: { value: longInput } });

      const counter = screen.getByText(/1001\s*\/\s*1000/);
      expect(counter).toBeInTheDocument();
      expect(counter).toHaveClass('text-destructive');
      expect(screen.getByRole('button', { name: /enviar mensaje/i })).toBeDisabled();
    });
  });

  describe('2. Submission Behavior & Mutation Mutex', () => {
    it('submits trimmed text and clears input on successful send', async () => {
      const handleSend = jest.fn().mockResolvedValue(undefined);
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /enviar mensaje/i });

      fireEvent.change(textarea, { target: { value: '  Protocolo de tendinopatía patelar  ' } });
      expect(sendBtn).not.toBeDisabled();

      fireEvent.click(sendBtn);

      expect(handleSend).toHaveBeenCalledTimes(1);
      expect(handleSend).toHaveBeenCalledWith('Protocolo de tendinopatía patelar');

      await waitFor(() => {
        expect(textarea).toHaveValue('');
        expect(screen.getByText(/0\s*\/\s*1000/)).toBeInTheDocument();
      });
    });

    it('prevents duplicate rapid submissions using internal submission mutex', async () => {
      let resolveSubmission!: () => void;
      const deferredPromise = new Promise<void>((resolve) => {
        resolveSubmission = resolve;
      });
      const handleSend = jest.fn().mockReturnValue(deferredPromise);

      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /enviar mensaje/i });

      fireEvent.change(textarea, { target: { value: 'Consulta neuromuscular' } });

      // Click rapidly twice
      fireEvent.click(sendBtn);
      fireEvent.click(sendBtn);

      expect(handleSend).toHaveBeenCalledTimes(1);

      // Resolve the pending promise
      resolveSubmission();
      await waitFor(() => {
        expect(textarea).toHaveValue('');
      });
    });

    it('preserves draft content in state and storage if submission rejects with an error', async () => {
      const handleSend = jest.fn().mockRejectedValue(new Error('Network offline'));

      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      const query = 'Criterios de alta para rotura de ligamento cruzado anterior';
      fireEvent.change(textarea, { target: { value: query } });

      fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));

      expect(handleSend).toHaveBeenCalledWith(query);

      // Draft must be preserved despite failure
      await waitFor(() => {
        expect(textarea).toHaveValue(query);
      });
      expect(assistantStorageService.getDraft(defaultTenantId, defaultUserId, defaultConvId)).toBe(
        query,
      );
    });
  });

  describe('3. Keyboard Interaction & Shortcuts', () => {
    it('submits on Enter key without shift', () => {
      const handleSend = jest.fn().mockResolvedValue(undefined);
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Pregunta clínica' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false, ctrlKey: false });

      expect(handleSend).toHaveBeenCalledWith('Pregunta clínica');
    });

    it('inserts a newline on Shift+Enter without triggering submission', () => {
      const handleSend = jest.fn();
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Línea 1' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(handleSend).not.toHaveBeenCalled();
    });

    it('submits on Ctrl+Enter keyboard shortcut', () => {
      const handleSend = jest.fn().mockResolvedValue(undefined);
      render(
        <ChatComposer
          onSend={handleSend}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Shortcut test' } });

      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(handleSend).toHaveBeenCalledWith('Shortcut test');
    });
  });

  describe('4. In-Flight State & Cancellation Control', () => {
    it('displays stop generation button when isSubmitting is true and invokes onCancel', () => {
      const handleCancel = jest.fn();
      render(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={handleCancel}
          isSubmitting={true}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /detener generación/i });
      expect(stopBtn).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /enviar mensaje/i })).not.toBeInTheDocument();

      fireEvent.click(stopBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('disables textarea and controls when disabled prop is set', () => {
      render(
        <ChatComposer
          onSend={jest.fn()}
          disabled={true}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
      expect(screen.getByRole('button', { name: /enviar mensaje/i })).toBeDisabled();
    });
  });

  describe('5. Partitioned Draft Storage Persistence', () => {
    it('restores existing saved draft for the given tenant and conversation', () => {
      assistantStorageService.setDraft(
        defaultTenantId,
        defaultUserId,
        defaultConvId,
        'Borrador guardado previamente',
      );

      render(
        <ChatComposer
          onSend={jest.fn()}
          conversationId={defaultConvId}
          tenantId={defaultTenantId}
          userId={defaultUserId}
        />,
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('Borrador guardado previamente');
      expect(screen.getByText(/29\s*\/\s*1000/)).toBeInTheDocument();
    });
  });
});
