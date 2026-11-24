import React, { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Square } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';

export interface ChatComposerProps {
  onSend: (text: string) => Promise<unknown> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 1000;

/**
 * Chat Composer Input Component.
 *
 * Provides:
 * - Multi-line auto-expanding textarea (up to 160px height)
 * - Keyboard shortcuts:
 *   - Enter (without Shift): Submit query
 *   - Shift + Enter: Insert newline
 *   - Ctrl / Cmd + Enter: Submit query
 * - Explicit cancellation stop button when generation is in-flight
 * - Character count indicator respecting backend limits (1000 chars)
 * - Accessible disabled states during pending requests
 * - Preserves draft if submission throws an error
 */
export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onCancel,
  isSubmitting = false,
  placeholder = 'Pregunta sobre políticas, protocolos de kinesiología o guías clínicas...',
  disabled = false,
}) => {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = draft.trim();
  const isOverLimit = draft.length > MAX_QUERY_LENGTH;
  const isUnderMin = trimmed.length < MIN_QUERY_LENGTH;
  const canSubmit = !isUnderMin && !isOverLimit && !isSubmitting && !disabled;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    const textToSubmit = trimmed;
    try {
      const result = onSend(textToSubmit);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        await result;
      }
      setDraft('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } catch {
      // Preserve draft on submission failure so user never loses their query
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape key: stop active generation
    if (e.key === 'Escape' && isSubmitting && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }

    // Ctrl+Enter or Cmd+Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
      return;
    }

    // Enter without Shift submits
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
  };

  // Auto-resize textarea based on input content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [draft]);

  return (
    <footer
      data-testid="chat-composer"
      className="shrink-0 border-t border-border/40 bg-card/30 p-3 md:p-4 backdrop-blur-xs"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div
          className={`relative flex items-end gap-2 rounded-xl border bg-background/80 p-2 shadow-2xs transition-all ${
            isOverLimit
              ? 'border-destructive/60 focus-within:ring-2 focus-within:ring-destructive/20'
              : 'border-border/60 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSubmitting}
            aria-label="Escribe tu consulta para el asistente"
            aria-describedby="composer-helper-text"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden disabled:opacity-50"
          />

          {isSubmitting && onCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              aria-label="Detener generación de respuesta"
              title="Detener generación"
              className="h-8 w-8 rounded-lg p-0 shrink-0 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 shadow-xs focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-hidden"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={!canSubmit}
              aria-label="Enviar mensaje"
              className="h-8 w-8 rounded-lg p-0 shrink-0 shadow-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Footer Helper & Character Counter */}
        <div
          id="composer-helper-text"
          className="flex items-center justify-between px-1 text-[11px] text-muted-foreground/60"
        >
          <span className="flex items-center gap-1 hidden sm:inline-flex">
            <CornerDownLeft className="h-3 w-3" />
            <span>Presiona Enter para enviar, Shift+Enter para nueva línea</span>
          </span>
          <span
            className={
              isOverLimit
                ? 'font-semibold text-destructive'
                : draft.length > MAX_QUERY_LENGTH - 100
                  ? 'text-amber-500 font-medium'
                  : 'text-muted-foreground/60'
            }
            aria-live={draft.length > MAX_QUERY_LENGTH - 100 ? 'polite' : 'off'}
            aria-atomic="true"
          >
            {draft.length}/{MAX_QUERY_LENGTH}
          </span>
        </div>
      </form>
    </footer>
  );
};
