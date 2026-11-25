import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Copy, RotateCw } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import { notificationService } from '../../../../app/providers/notification-provider';
import { copyToClipboard } from '../utils/clipboard.util';
import { formatMessageForCopy } from '../utils/message-copy-formatter.util';
import type { RAGSourceCitationDto } from '../types/assistant.types';

// ============================================================================
// 1. Copy Action Component
// ============================================================================

export interface CopyActionProps {
  readonly content: string;
  readonly sources?: readonly RAGSourceCitationDto[];
  readonly label?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: (error: string) => void;
}

/**
 * Copy Action Button Component.
 *
 * Requirements (AI-09.5 - FB.04):
 * - Preserves complete text structure, Markdown, code blocks, lists
 * - Formats verified source citations cleanly without raw UI artifacts
 * - Uses robust clipboard utility with async API and execCommand fallback
 * - Transient visual check indicator with no layout shift
 * - Disables during copy transition and prevents rapid repeated executions
 * - Accessible labels and live screen-reader feedback
 */
export const CopyAction: React.FC<CopyActionProps> = React.memo(
  ({
    content,
    sources,
    label = 'Copiar mensaje',
    className = '',
    disabled = false,
    onCopySuccess,
    onCopyError,
  }) => {
    const [copied, setCopied] = useState(false);
    const isCopyingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up timeout on unmount
    useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(async () => {
      if (disabled || isCopyingRef.current) return;

      isCopyingRef.current = true;
      try {
        const payloadToCopy = formatMessageForCopy(content, sources);
        const result = await copyToClipboard(payloadToCopy);

        if (result.success) {
          setCopied(true);
          onCopySuccess?.();

          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            setCopied(false);
          }, 2000);
        } else {
          const errMsg = result.error || 'No se pudo copiar el contenido al portapapeles.';
          notificationService.error(errMsg);
          onCopyError?.(errMsg);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Error al copiar al portapapeles.';
        notificationService.error(errMsg);
        onCopyError?.(errMsg);
      } finally {
        isCopyingRef.current = false;
      }
    }, [content, sources, disabled, onCopySuccess, onCopyError]);

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        disabled={disabled}
        aria-label={copied ? 'Mensaje copiado' : label}
        title={copied ? 'Copiado al portapapeles' : label}
        data-testid="message-copy-button"
        className={`h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden transition-colors ${className}`}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
            <span className="sr-only" role="status" aria-live="polite">
              Texto copiado al portapapeles
            </span>
          </>
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
      </Button>
    );
  },
);

CopyAction.displayName = 'CopyAction';

// ============================================================================
// 2. Regenerate Action Component
// ============================================================================

export interface RegenerateActionProps {
  readonly onRegenerate: () => void;
  readonly label?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

/**
 * Regenerate Action Button Component.
 */
export const RegenerateAction: React.FC<RegenerateActionProps> = React.memo(
  ({ onRegenerate, label = 'Regenerar respuesta', className = '', disabled = false }) => {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRegenerate}
        disabled={disabled}
        aria-label={label}
        aria-busy={disabled || undefined}
        title={label}
        data-testid="message-regenerate-button"
        className={`h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden transition-colors ${className}`}
      >
        <RotateCw
          className={`h-3 w-3 ${disabled ? 'motion-safe:animate-spin' : ''}`}
          aria-hidden="true"
        />
      </Button>
    );
  },
);

RegenerateAction.displayName = 'RegenerateAction';

// ============================================================================
// 3. Message Actions Toolbar Component
// ============================================================================

export interface MessageActionsProps {
  readonly content: string;
  readonly sources?: readonly RAGSourceCitationDto[];
  readonly label?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onRegenerate?: () => void;
  readonly isRegenerating?: boolean;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: (error: string) => void;
  readonly children?: React.ReactNode;
}

/**
 * Message Action Region Component.
 *
 * Provides a modular, accessible action toolbar for chat messages:
 * - Copy message content with structure & citations preservation
 * - Optional regenerate action where supported
 * - Slot for custom actions (feedback, etc.)
 */
export const MessageActions: React.FC<MessageActionsProps> = React.memo(
  ({
    content,
    sources,
    label,
    className = '',
    disabled = false,
    onRegenerate,
    isRegenerating = false,
    onCopySuccess,
    onCopyError,
    children,
  }) => {
    return (
      <div
        className={`flex items-center gap-1 ${className}`}
        role="toolbar"
        aria-label="Acciones del mensaje"
        data-testid="message-actions-toolbar"
      >
        {children}

        {onRegenerate && (
          <RegenerateAction onRegenerate={onRegenerate} disabled={disabled || isRegenerating} />
        )}

        <CopyAction
          content={content}
          sources={sources}
          label={label}
          disabled={disabled}
          onCopySuccess={onCopySuccess}
          onCopyError={onCopyError}
        />
      </div>
    );
  },
);

MessageActions.displayName = 'MessageActions';
