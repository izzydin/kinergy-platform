import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/test-utils';
import { MessageFeedback } from '../components/message-feedback';
import { AssistantMessage } from '../components/assistant-message';
import { UserMessage } from '../components/user-message';
import { FeedbackExplanationDialog } from '../components/feedback-explanation-dialog';
import { conversationApi } from '../api/conversation.api';
import type { ChatMessage } from '../types/assistant.types';
import type { MessageFeedbackResponse } from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');
const mockedApi = jest.mocked(conversationApi);

describe('AI-09.5 - FB.03: Feedback Submission & Frontend Integration Test Suite', () => {
  const conversationId = 'conv_fb03_test';
  const messageId = 'msg_asst_fb03_1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Component Tests: Feedback Controls & Actions
  // =========================================================================
  describe('1. Feedback Controls & Selection States', () => {
    it('renders positive and negative feedback buttons with accessible labels', () => {
      mockedApi.getFeedback.mockResolvedValue(null);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      const positiveBtn = screen.getByTestId('feedback-positive-button');
      const negativeBtn = screen.getByTestId('feedback-negative-button');

      expect(positiveBtn).toBeInTheDocument();
      expect(positiveBtn).toHaveAttribute('aria-label', 'Respuesta útil (positiva)');
      expect(positiveBtn).toHaveAttribute('aria-pressed', 'false');

      expect(negativeBtn).toBeInTheDocument();
      expect(negativeBtn).toHaveAttribute('aria-label', 'Respuesta no útil (negativa)');
      expect(negativeBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('submits positive feedback when thumbs up is clicked', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);
      const mockFeedbackResponse: MessageFeedbackResponse = {
        id: 'fb_101',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      };
      mockedApi.submitFeedback.mockResolvedValue(mockFeedbackResponse);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      const positiveBtn = screen.getByTestId('feedback-positive-button');
      fireEvent.click(positiveBtn);

      await waitFor(() => {
        expect(mockedApi.submitFeedback).toHaveBeenCalledWith(conversationId, messageId, {
          rating: 'POSITIVE',
        });
      });
    });

    it('renders active selected state when positive feedback is loaded or submitted', async () => {
      const persistedFeedback: MessageFeedbackResponse = {
        id: 'fb_pos_active',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      };
      mockedApi.getFeedback.mockResolvedValue(persistedFeedback);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      await waitFor(() => {
        const positiveBtn = screen.getByTestId('feedback-positive-button');
        expect(positiveBtn).toHaveAttribute('aria-pressed', 'true');
        expect(positiveBtn).toHaveAttribute('aria-label', 'Valoración positiva enviada');
      });
    });

    it('renders active selected state when negative feedback is loaded', async () => {
      const persistedFeedback: MessageFeedbackResponse = {
        id: 'fb_neg_active',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'NEGATIVE',
        explanation: 'Faltó citar la guía de dosificación.',
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      };
      mockedApi.getFeedback.mockResolvedValue(persistedFeedback);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      await waitFor(() => {
        const negativeBtn = screen.getByTestId('feedback-negative-button');
        expect(negativeBtn).toHaveAttribute('aria-pressed', 'true');
        expect(negativeBtn).toHaveAttribute('aria-label', 'Valoración negativa enviada');
      });

      // Explanation trigger should be visible
      expect(screen.getByTestId('feedback-explanation-trigger')).toBeInTheDocument();
      expect(screen.getByText(/Faltó citar la guía/)).toBeInTheDocument();
    });

    it('toggles/revokes feedback when active positive thumb is clicked again', async () => {
      const persistedFeedback: MessageFeedbackResponse = {
        id: 'fb_revoke_1',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      };
      mockedApi.getFeedback.mockResolvedValue(persistedFeedback);
      mockedApi.revokeFeedback.mockResolvedValue({ revoked: true, messageId });

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('feedback-positive-button')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      });

      // Click active thumb to revoke
      fireEvent.click(screen.getByTestId('feedback-positive-button'));

      await waitFor(() => {
        expect(mockedApi.revokeFeedback).toHaveBeenCalledWith(conversationId, messageId);
      });
    });
  });

  // =========================================================================
  // 2. Explanation Dialog & Validation Tests
  // =========================================================================
  describe('2. Optional Explanation Dialog & Validation', () => {
    it('opens explanation dialog when thumbs down is clicked', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      const negativeBtn = screen.getByTestId('feedback-negative-button');
      fireEvent.click(negativeBtn);

      await waitFor(() => {
        expect(screen.getByTestId('feedback-explanation-dialog')).toBeInTheDocument();
        expect(screen.getByText('¿Cómo podemos mejorar esta respuesta?')).toBeInTheDocument();
      });
    });

    it('submits negative feedback with optional explanation', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);
      mockedApi.submitFeedback.mockResolvedValue({
        id: 'fb_neg_exp',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'NEGATIVE',
        explanation: 'Falta precisión en tiempos de reposo articular.',
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      });

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      fireEvent.click(screen.getByTestId('feedback-negative-button'));

      const textarea = await screen.findByTestId('feedback-explanation-textarea');
      fireEvent.change(textarea, {
        target: { value: 'Falta precisión en tiempos de reposo articular.' },
      });

      const submitBtn = screen.getByTestId('feedback-submit-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedApi.submitFeedback).toHaveBeenCalledWith(conversationId, messageId, {
          rating: 'NEGATIVE',
          explanation: 'Falta precisión en tiempos de reposo articular.',
        });
      });
    });

    it('allows submitting empty explanation (explanation is strictly optional)', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);
      mockedApi.submitFeedback.mockResolvedValue({
        id: 'fb_neg_no_exp',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'NEGATIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      });

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      fireEvent.click(screen.getByTestId('feedback-negative-button'));

      const submitBtn = await screen.findByTestId('feedback-submit-button');
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedApi.submitFeedback).toHaveBeenCalledWith(conversationId, messageId, {
          rating: 'NEGATIVE',
          explanation: undefined,
        });
      });
    });

    it('cancels dialog without submitting feedback when cancel is clicked', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      fireEvent.click(screen.getByTestId('feedback-negative-button'));

      const cancelBtn = await screen.findByTestId('feedback-cancel-button');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('feedback-explanation-dialog')).not.toBeInTheDocument();
      });
      expect(mockedApi.submitFeedback).not.toHaveBeenCalled();
    });

    it('enforces 1000-character constraint and displays character count in dialog', () => {
      const onSubmit = jest.fn();
      const onOpenChange = jest.fn();

      renderWithProviders(
        <FeedbackExplanationDialog
          open={true}
          onOpenChange={onOpenChange}
          rating="NEGATIVE"
          onSubmit={onSubmit}
        />,
      );

      expect(screen.getByText('0 / 1000')).toBeInTheDocument();

      const textarea = screen.getByTestId('feedback-explanation-textarea');
      fireEvent.change(textarea, { target: { value: 'Test comment' } });

      expect(screen.getByText('12 / 1000')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Failure Handling & Retry Mechanism
  // =========================================================================
  describe('3. Failure Handling & Retry', () => {
    it('shows retry button when submission fails and allows retry', async () => {
      mockedApi.getFeedback.mockResolvedValue(null);
      mockedApi.submitFeedback.mockRejectedValueOnce(new Error('Network offline'));

      renderWithProviders(
        <MessageFeedback conversationId={conversationId} messageId={messageId} />,
      );

      const positiveBtn = screen.getByTestId('feedback-positive-button');
      fireEvent.click(positiveBtn);

      // Verify retry button appears on error
      const retryBtn = await screen.findByTestId('feedback-retry-button');
      expect(retryBtn).toBeInTheDocument();

      // Second attempt succeeds
      mockedApi.submitFeedback.mockResolvedValueOnce({
        id: 'fb_retry_success',
        messageId,
        conversationId,
        userId: 'usr_test',
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockedApi.submitFeedback).toHaveBeenCalledTimes(2);
      });
    });
  });

  // =========================================================================
  // 4. Invariant: User Messages vs Assistant Messages
  // =========================================================================
  describe('4. Invariant Boundaries: User vs Assistant Messages', () => {
    it('renders feedback controls on successful assistant messages', () => {
      mockedApi.getFeedback.mockResolvedValue(null);
      const asstMsg: ChatMessage = {
        id: 'asst_msg_valid',
        role: 'assistant',
        content: 'El tratamiento adecuado para esguince grado II es reposo y vendaje elástico.',
        createdAt: '2026-11-25T10:00:00Z',
        status: 'success',
      };

      renderWithProviders(<AssistantMessage message={asstMsg} conversationId={conversationId} />);

      expect(screen.getByTestId('message-feedback-controls-asst_msg_valid')).toBeInTheDocument();
    });

    it('does NOT render feedback controls on user messages', () => {
      const userMsg: ChatMessage = {
        id: 'user_msg_invariant',
        role: 'user',
        content: '¿Cuál es el protocolo?',
        createdAt: '2026-11-25T10:00:00Z',
        status: 'success',
      };

      renderWithProviders(<UserMessage message={userMsg} />);

      expect(
        screen.queryByTestId('message-feedback-controls-user_msg_invariant'),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('feedback-positive-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feedback-negative-button')).not.toBeInTheDocument();
    });

    it('does NOT render feedback controls on pending or failed assistant messages', () => {
      const pendingMsg: ChatMessage = {
        id: 'asst_pending',
        role: 'assistant',
        content: '',
        createdAt: '2026-11-25T10:00:00Z',
        status: 'pending',
      };

      renderWithProviders(
        <AssistantMessage message={pendingMsg} conversationId={conversationId} />,
      );

      expect(
        screen.queryByTestId('message-feedback-controls-asst_pending'),
      ).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. Multiple Messages & Isolation
  // =========================================================================
  describe('5. Multiple Messages & Isolation', () => {
    it('maintains independent feedback states for distinct assistant messages', async () => {
      const msg1 = 'msg_asst_1';
      const msg2 = 'msg_asst_2';

      mockedApi.getFeedback.mockImplementation(async (_convId, mId) => {
        if (mId === msg1) {
          return {
            id: 'fb_1',
            messageId: msg1,
            conversationId,
            userId: 'usr_test',
            rating: 'POSITIVE',
            explanation: null,
            category: null,
            createdAt: '2026-11-25T11:00:00.000Z',
            updatedAt: '2026-11-25T11:00:00.000Z',
          };
        }
        if (mId === msg2) {
          return {
            id: 'fb_2',
            messageId: msg2,
            conversationId,
            userId: 'usr_test',
            rating: 'NEGATIVE',
            explanation: 'Incompleto',
            category: null,
            createdAt: '2026-11-25T11:00:00.000Z',
            updatedAt: '2026-11-25T11:00:00.000Z',
          };
        }
        return null;
      });

      renderWithProviders(
        <div>
          <MessageFeedback conversationId={conversationId} messageId={msg1} />
          <MessageFeedback conversationId={conversationId} messageId={msg2} />
        </div>,
      );

      const controls1 = await screen.findByTestId(`message-feedback-controls-${msg1}`);
      const controls2 = await screen.findByTestId(`message-feedback-controls-${msg2}`);

      // Msg 1 should have positive pressed, negative unpressed
      const posBtn1 = within(controls1).getByTestId('feedback-positive-button');
      const negBtn1 = within(controls1).getByTestId('feedback-negative-button');
      expect(posBtn1).toHaveAttribute('aria-pressed', 'true');
      expect(negBtn1).toHaveAttribute('aria-pressed', 'false');

      // Msg 2 should have positive unpressed, negative pressed
      const posBtn2 = within(controls2).getByTestId('feedback-positive-button');
      const negBtn2 = within(controls2).getByTestId('feedback-negative-button');
      expect(posBtn2).toHaveAttribute('aria-pressed', 'false');
      expect(negBtn2).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
