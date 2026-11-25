import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Textarea,
} from '@kinergy-platform/ui';
import { Loader2, ThumbsDown, ThumbsUp, MessageSquare } from 'lucide-react';
import type { FeedbackRating } from '../types/conversation-contract.types';

export interface FeedbackExplanationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rating: FeedbackRating;
  readonly initialExplanation?: string | null;
  readonly isSubmitting?: boolean;
  readonly onSubmit: (explanation?: string) => Promise<void> | void;
  readonly triggerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Feedback Explanation Modal Dialog Component.
 *
 * Provides:
 * - Accessible modal dialog for optional explanation submission.
 * - Textarea with character boundary validation (capped at 1000 chars).
 * - Distinct context for positive vs negative feedback guidance.
 * - Accidental dismissal protection (preserves draft until explicit submit/cancel).
 */
export const FeedbackExplanationDialog: React.FC<FeedbackExplanationDialogProps> = React.memo(
  ({
    open,
    onOpenChange,
    rating,
    initialExplanation = '',
    isSubmitting = false,
    onSubmit,
    triggerRef,
  }) => {
    const [explanation, setExplanation] = useState(initialExplanation ?? '');

    // Synchronize draft when dialog opens with existing explanation
    useEffect(() => {
      if (open) {
        setExplanation(initialExplanation ?? '');
      }
    }, [open, initialExplanation]);

    const isNegative = rating === 'NEGATIVE';
    const isOverLimit = explanation.length > 1000;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting || isOverLimit) return;
      await onSubmit(explanation.trim() ? explanation.trim() : undefined);
      onOpenChange(false);
    };

    const handleCancel = () => {
      onOpenChange(false);
    };

    const handleCloseAutoFocus = (event: Event) => {
      if (triggerRef?.current) {
        event.preventDefault();
        triggerRef.current.focus();
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          data-testid="feedback-explanation-dialog"
          aria-describedby="feedback-explanation-desc"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <form onSubmit={handleSubmit} aria-busy={isSubmitting}>
            <DialogHeader className="gap-1.5">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    isNegative
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                  aria-hidden="true"
                >
                  {isNegative ? (
                    <ThumbsDown className="h-4 w-4" />
                  ) : (
                    <ThumbsUp className="h-4 w-4" />
                  )}
                </div>
                <DialogTitle id="feedback-explanation-title">
                  {isNegative
                    ? '¿Cómo podemos mejorar esta respuesta?'
                    : 'Comentarios sobre la respuesta'}
                </DialogTitle>
              </div>
              <DialogDescription
                id="feedback-explanation-desc"
                className="text-xs text-muted-foreground"
              >
                {isNegative
                  ? 'Tu opinión ayuda a mejorar la precisión y utilidad de la asistencia clínica. La explicación es totalmente opcional.'
                  : 'Cuéntanos qué fue lo más acertado o útil de esta respuesta. Tu comentario es opcional.'}
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-2">
              <label
                htmlFor="feedback-explanation-textarea"
                className="text-xs font-medium text-foreground flex items-center justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Explicación o comentarios (opcional)
                </span>
                <span
                  id="feedback-char-counter"
                  className={`text-[11px] ${
                    isOverLimit ? 'font-semibold text-destructive' : 'text-muted-foreground'
                  }`}
                  aria-live={isOverLimit ? 'assertive' : 'polite'}
                  aria-atomic="true"
                >
                  {explanation.length} / 1000
                </span>
              </label>

              <Textarea
                id="feedback-explanation-textarea"
                data-testid="feedback-explanation-textarea"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={
                  isNegative
                    ? 'Ejemplo: La información sobre la dosificación de crioterapia no coincide con las guías recientes...'
                    : 'Ejemplo: Muy clara la explicación sobre la progresión de cargas en rehabilitación...'
                }
                rows={4}
                maxLength={1000}
                isInvalid={isOverLimit}
                aria-invalid={isOverLimit}
                aria-describedby={
                  isOverLimit
                    ? 'feedback-explanation-error feedback-explanation-desc feedback-char-counter'
                    : 'feedback-explanation-desc feedback-char-counter'
                }
                disabled={isSubmitting}
                className="resize-none text-xs leading-relaxed focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
                autoFocus
              />

              {isOverLimit && (
                <p
                  id="feedback-explanation-error"
                  className="text-[11px] text-destructive"
                  role="alert"
                >
                  El comentario no puede superar los 1000 caracteres.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSubmitting}
                aria-label="Cancelar y cerrar diálogo"
                data-testid="feedback-cancel-button"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || isOverLimit}
                aria-busy={isSubmitting}
                aria-label={
                  isSubmitting
                    ? 'Guardando comentario...'
                    : isNegative
                      ? 'Enviar sugerencia de mejora'
                      : 'Enviar comentario'
                }
                data-testid="feedback-submit-button"
                className={
                  isNegative
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar valoración'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  },
);

FeedbackExplanationDialog.displayName = 'FeedbackExplanationDialog';
