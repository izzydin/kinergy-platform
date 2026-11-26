import React from 'react';
import { Bot, Info } from 'lucide-react';
import { Avatar, AvatarFallback } from '@kinergy-platform/ui';
import { MessageStatusIndicator } from './message-status-indicator';
import { MarkdownRenderer } from './markdown-renderer';
import { MessageCitations } from './message-citations';
import { MessageMetadata } from './message-metadata';
import { MessageActions } from './message-actions';
import { MessageFeedback } from './message-feedback';
import type { ChatMessage } from '../types/assistant.types';

export interface AssistantMessageProps {
  message: ChatMessage;
  conversationId?: string;
  onRetry?: () => void;
  onReconcile?: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  onPreviewDocument?: (
    documentId: string,
    pageNumber?: number | null,
    citationId?: string | null,
    messageId?: string | null,
  ) => void;
}

/**
 * Assistant Message Component.
 *
 * Provides:
 * - Dedicated Assistant visual identity and avatar
 * - Phased status indicators (pending, error, cancelled, interrupted, unknown)
 * - Distinct failure handling (provider unavailable, retrieval unavailable, generation failed)
 * - Grounded abstention handling for insufficient clinical knowledge (ER.06 Condition C)
 * - Safe Markdown content rendering (preserving partial content on interruption)
 * - Grounded source citations tray
 * - Telemetry & copy action footer
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = React.memo(
  ({
    message,
    conversationId,
    onRetry,
    onReconcile,
    onRegenerate,
    isRegenerating,
    onPreviewDocument,
  }) => {
    const isPending =
      message.status === 'pending' ||
      message.status === 'submitting' ||
      message.status === 'retrieving';
    const hasText = Boolean(message.content && message.content.trim().length > 0);
    const isTerminalSuccess = message.status === 'success';

    // Insufficient Knowledge / Abstention detection (ER.06 Condition C)
    const isAbstention =
      isTerminalSuccess &&
      (message.grounded === false ||
        message.metadata?.finishReason === 'insufficient_context' ||
        message.metadata?.finishReason === 'INSUFFICIENT_EVIDENCE' ||
        message.metadata?.finishReason === 'LOW_SIMILARITY');

    return (
      <article
        data-testid={`chat-message-${message.id}`}
        id={`message-${message.id}`}
        aria-label="Mensaje de asistente"
        className="flex w-full justify-start gap-3 py-2"
      >
        {/* Bot Avatar */}
        <Avatar
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-2xs"
        >
          <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>

        {/* Message Bubble Container */}
        <div className="flex flex-col items-start gap-1.5 min-w-0 max-w-[95%] sm:max-w-[85%] md:max-w-[75%]">
          <div className="relative w-full min-w-0 rounded-2xl rounded-tl-xs border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground shadow-2xs break-words">
            {/* Status Indicators (pending, submitting, retrieving, error, cancelled, interrupted, unknown) */}
            <MessageStatusIndicator
              status={message.status}
              error={message.error}
              errorCode={message.errorCode}
              retryable={message.retryable}
              retryAfterSeconds={message.retryAfterSeconds}
              correlationId={message.correlationId}
              onRetry={onRetry}
              onReconcile={onReconcile}
            />

            {/* Markdown Content (Rendered whenever content exists, preserving partial text on interruptions) */}
            {!isPending && hasText && (
              <div
                className={`min-w-0 ${
                  message.status !== 'success'
                    ? 'mt-2 border-t border-border/40 pt-2 opacity-90'
                    : ''
                }`}
              >
                <MarkdownRenderer content={message.content} />
              </div>
            )}

            {/* Insufficient Knowledge Guidance Notice (ER.06 Condition C) */}
            {isAbstention && (
              <div
                data-testid="insufficient-knowledge-banner"
                role="note"
                aria-label="Información sobre conocimiento insuficiente"
                className="mt-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 text-sky-950 dark:text-sky-200"
              >
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" aria-hidden="true" />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-sky-900 dark:text-sky-100">
                      Conocimiento insuficiente en el repositorio
                    </span>
                    <p className="leading-relaxed text-muted-foreground">
                      Los documentos y protocolos clínicos verificados actualmente en el sistema no
                      contienen evidencia suficiente para responder con certeza fundamentada a esta
                      consulta.
                    </p>
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Sugerencias:</span>
                      <span>
                        • Intenta reformular tu consulta con términos clínicos específicos o
                        sinónimos.
                      </span>
                      <span>
                        • Si este protocolo debería formar parte de la base clínica, solicita a un
                        administrador que lo incorpore en el Centro de Conocimiento.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Verified Source Citations */}
            {isTerminalSuccess && message.sources && message.sources.length > 0 && (
              <MessageCitations
                sources={message.sources}
                conversationId={conversationId}
                messageId={message.id}
                onPreviewDocument={onPreviewDocument}
              />
            )}
          </div>

          {/* Footer: Metadata & Actions */}
          <footer
            aria-label="Metadatos y acciones de respuesta del asistente"
            className="flex w-full flex-wrap items-center justify-between gap-2 px-1"
          >
            <MessageMetadata
              createdAt={message.createdAt}
              metadata={message.metadata}
              grounded={message.grounded}
            />

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {conversationId && isTerminalSuccess && hasText && (
                <MessageFeedback conversationId={conversationId} messageId={message.id} />
              )}
              {hasText && (
                <MessageActions
                  content={message.content}
                  sources={message.sources}
                  onRegenerate={onRegenerate}
                  isRegenerating={isRegenerating}
                  label="Copiar respuesta del asistente"
                />
              )}
            </div>
          </footer>
        </div>
      </article>
    );
  },
);
