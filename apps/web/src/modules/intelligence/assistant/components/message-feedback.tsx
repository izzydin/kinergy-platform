import React, { useState, useCallback, useContext, useRef } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquareText, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import { QueryClientContext } from '@tanstack/react-query';
import { notificationService } from '../../../../app/providers/notification-provider';
import { useMessageFeedback } from '../hooks/use-conversation-queries';
import {
  useSubmitFeedbackMutation,
  useRevokeFeedbackMutation,
} from '../hooks/use-conversation-mutations';
import { FeedbackExplanationDialog } from './feedback-explanation-dialog';
import type { FeedbackRating } from '../types/conversation-contract.types';

export interface MessageFeedbackProps {
  readonly conversationId?: string;
  readonly messageId: string;
  readonly className?: string;
}

export type FeedbackLifecycleState = 'NOT_SUBMITTED' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED';

const MessageFeedbackInner: React.FC<MessageFeedbackProps> = React.memo(
  ({ conversationId, messageId, className = '' }) => {
    // Query persisted feedback state for this message
    const { data: feedback } = useMessageFeedback(conversationId, messageId, {
      enabled: Boolean(conversationId && messageId),
    });

    // Mutation hooks
    const submitMutation = useSubmitFeedbackMutation();
    const revokeMutation = useRevokeFeedbackMutation();

    // Button refs for focus restoration
    const positiveBtnRef = useRef<HTMLButtonElement | null>(null);
    const negativeBtnRef = useRef<HTMLButtonElement | null>(null);
    const editExplanationBtnRef = useRef<HTMLButtonElement | null>(null);
    const activeTriggerRef = useRef<HTMLElement | null>(null);

    // Local dialog and pending rating state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pendingRating, setPendingRating] = useState<FeedbackRating>('NEGATIVE');
    const [lifecycleState, setLifecycleState] = useState<FeedbackLifecycleState>('NOT_SUBMITTED');
    const [srAnnouncement, setSrAnnouncement] = useState('');

    const isSubmitting = submitMutation.isPending || revokeMutation.isPending;
    const currentRating = feedback?.rating;
    const isPositive = currentRating === 'POSITIVE';
    const isNegative = currentRating === 'NEGATIVE';
    const hasExplanation = Boolean(feedback?.explanation && feedback.explanation.trim().length > 0);

    // 1. Handle Positive Click
    const handlePositiveClick = useCallback(async () => {
      if (!conversationId || isSubmitting) return;

      if (isPositive) {
        // Toggle off (revoke) if already positive
        setLifecycleState('SUBMITTING');
        try {
          await revokeMutation.mutateAsync({ conversationId, messageId });
          setLifecycleState('NOT_SUBMITTED');
          setSrAnnouncement('Valoración retirada');
          notificationService.success('Valoración retirada');
        } catch {
          setLifecycleState('FAILED');
          setSrAnnouncement('Error al retirar la valoración');
          notificationService.error('No se pudo retirar la valoración. Inténtalo de nuevo.');
        }
        return;
      }

      // Submit positive feedback
      setPendingRating('POSITIVE');
      setLifecycleState('SUBMITTING');
      try {
        await submitMutation.mutateAsync({
          conversationId,
          messageId,
          request: { rating: 'POSITIVE' },
        });
        setLifecycleState('SUBMITTED');
        setSrAnnouncement('Valoración positiva guardada');
        notificationService.success('¡Gracias por tu valoración!');
      } catch {
        setLifecycleState('FAILED');
        setSrAnnouncement('Error al enviar la valoración');
        notificationService.error('Error al enviar la valoración. Inténtalo de nuevo.');
      }
    }, [conversationId, messageId, isPositive, isSubmitting, submitMutation, revokeMutation]);

    // 2. Handle Negative Click
    const handleNegativeClick = useCallback(async () => {
      if (!conversationId || isSubmitting) return;

      if (isNegative) {
        // Toggle off (revoke) if already negative
        setLifecycleState('SUBMITTING');
        try {
          await revokeMutation.mutateAsync({ conversationId, messageId });
          setLifecycleState('NOT_SUBMITTED');
          setSrAnnouncement('Valoración retirada');
          notificationService.success('Valoración retirada');
        } catch {
          setLifecycleState('FAILED');
          setSrAnnouncement('Error al retirar la valoración');
          notificationService.error('No se pudo retirar la valoración. Inténtalo de nuevo.');
        }
        return;
      }

      // Open explanation dialog to allow optional feedback reasoning
      activeTriggerRef.current = negativeBtnRef.current;
      setPendingRating('NEGATIVE');
      setDialogOpen(true);
    }, [conversationId, messageId, isNegative, isSubmitting, revokeMutation]);

    // 3. Handle Explanation Dialog Submit
    const handleExplanationSubmit = useCallback(
      async (explanation?: string) => {
        if (!conversationId) return;

        setLifecycleState('SUBMITTING');
        try {
          await submitMutation.mutateAsync({
            conversationId,
            messageId,
            request: {
              rating: pendingRating,
              explanation,
            },
          });
          setLifecycleState('SUBMITTED');
          const msg =
            pendingRating === 'NEGATIVE'
              ? 'Comentario recibido. Nos ayuda a mejorar.'
              : '¡Gracias por tus comentarios!';
          setSrAnnouncement(msg);
          notificationService.success(msg);
        } catch {
          setLifecycleState('FAILED');
          setSrAnnouncement('Error al guardar el comentario');
          notificationService.error('Error al guardar el comentario. Inténtalo de nuevo.');
        }
      },
      [conversationId, messageId, pendingRating, submitMutation],
    );

    // 4. Handle Edit Existing Explanation
    const handleOpenEditExplanation = useCallback(() => {
      if (!currentRating) return;
      activeTriggerRef.current = editExplanationBtnRef.current;
      setPendingRating(currentRating);
      setDialogOpen(true);
    }, [currentRating]);

    // 5. Retry handler on failure
    const handleRetry = useCallback(() => {
      setLifecycleState('NOT_SUBMITTED');
      if (pendingRating === 'NEGATIVE') {
        activeTriggerRef.current = negativeBtnRef.current;
        setDialogOpen(true);
      } else {
        void handlePositiveClick();
      }
    }, [pendingRating, handlePositiveClick]);

    return (
      <div
        className={`flex items-center gap-1 ${className}`}
        data-testid={`message-feedback-controls-${messageId}`}
        role="group"
        aria-label="Valoración de la respuesta del asistente"
      >
        {/* Screen Reader Live Region for Feedback Status */}
        {srAnnouncement && (
          <span className="sr-only" role="status" aria-live="polite">
            {srAnnouncement}
          </span>
        )}

        {/* Positive Action (ThumbsUp) */}
        <Button
          ref={positiveBtnRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePositiveClick}
          disabled={isSubmitting || !conversationId}
          aria-label={isPositive ? 'Valoración positiva enviada' : 'Respuesta útil (positiva)'}
          title={isPositive ? 'Valoración positiva guardada (clic para retirar)' : 'Respuesta útil'}
          aria-pressed={isPositive}
          data-testid="feedback-positive-button"
          className={`h-6 w-6 p-0 rounded-xs transition-colors relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden ${
            isPositive
              ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold'
              : 'text-muted-foreground/60 hover:text-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
          }`}
        >
          {isSubmitting && isPositive ? (
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
          ) : (
            <ThumbsUp className={`h-3 w-3 ${isPositive ? 'fill-current' : ''}`} />
          )}
        </Button>

        {/* Negative Action (ThumbsDown) */}
        <Button
          ref={negativeBtnRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleNegativeClick}
          disabled={isSubmitting || !conversationId}
          aria-label={isNegative ? 'Valoración negativa enviada' : 'Respuesta no útil (negativa)'}
          title={
            isNegative
              ? 'Valoración negativa guardada (clic para retirar o editar)'
              : 'Respuesta no útil'
          }
          aria-pressed={isNegative}
          data-testid="feedback-negative-button"
          className={`h-6 w-6 p-0 rounded-xs transition-colors relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden ${
            isNegative
              ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 font-semibold'
              : 'text-muted-foreground/60 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20'
          }`}
        >
          {isSubmitting && isNegative ? (
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
          ) : (
            <ThumbsDown className={`h-3 w-3 ${isNegative ? 'fill-current' : ''}`} />
          )}
        </Button>

        {/* Optional Explanation Indicator / Edit Trigger */}
        {(isPositive || isNegative) && (
          <Button
            ref={editExplanationBtnRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpenEditExplanation}
            disabled={isSubmitting}
            aria-label={
              hasExplanation
                ? `Editar comentario explicativo: "${feedback?.explanation?.slice(0, 30)}..."`
                : 'Añadir comentario explicativo a la valoración'
            }
            title={
              hasExplanation ? `Comentario: ${feedback?.explanation}` : 'Añadir comentario opcional'
            }
            data-testid="feedback-explanation-trigger"
            className={`h-6 px-1.5 text-[11px] gap-1 rounded-xs transition-colors relative after:absolute after:-inset-1 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden ${
              hasExplanation
                ? 'text-primary bg-primary/10 font-medium'
                : 'text-muted-foreground/60 hover:text-foreground'
            }`}
          >
            <MessageSquareText className="h-3 w-3" />
            {hasExplanation && (
              <span className="hidden sm:inline max-w-[80px] truncate text-[10px]">
                {feedback?.explanation}
              </span>
            )}
          </Button>
        )}

        {/* Retry Trigger on Failed State */}
        {lifecycleState === 'FAILED' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            aria-label="Reintentar envío de valoración"
            title="Falló el envío. Clic para reintentar."
            data-testid="feedback-retry-button"
            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-hidden"
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        )}

        {/* Explanation Dialog with deterministic focus restoration */}
        <FeedbackExplanationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          rating={pendingRating}
          initialExplanation={feedback?.explanation}
          isSubmitting={isSubmitting}
          onSubmit={handleExplanationSubmit}
          triggerRef={activeTriggerRef}
        />
      </div>
    );
  },
);

MessageFeedbackInner.displayName = 'MessageFeedbackInner';

/**
 * Message Feedback Controls Component.
 *
 * Implements AI-09.5 - FB.03:
 * - Positive and negative rating toggles for assistant responses
 * - Selected state with distinct visual themes and ARIA attributes
 * - Optional explanation interaction via modal dialog
 * - Optimistic UI updates with automatic rollback on error
 * - Prevention of rapid duplicate submissions
 * - Idempotent rating update and feedback revocation
 * - Failure handling and retry mechanism
 * - Safe conditional render when QueryClientProvider is present
 */
export const MessageFeedback: React.FC<MessageFeedbackProps> = React.memo((props) => {
  const queryClient = useContext(QueryClientContext);
  if (!queryClient) {
    return null;
  }

  return <MessageFeedbackInner {...props} />;
});

MessageFeedback.displayName = 'MessageFeedback';
