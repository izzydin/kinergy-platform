import React from 'react';
import { Bot } from 'lucide-react';
import { MessageStatusIndicator } from './message-status-indicator';
import { MarkdownRenderer } from './markdown-renderer';
import { MessageCitations } from './message-citations';
import { MessageMetadata } from './message-metadata';
import { MessageActions } from './message-actions';
import type { ChatMessage } from '../types/assistant.types';

export interface AssistantMessageProps {
  message: ChatMessage;
  onRetry?: () => void;
}

/**
 * Assistant Message Component.
 *
 * Provides:
 * - Dedicated Assistant visual identity and avatar
 * - Phased status indicators (pending, error, cancelled, interrupted)
 * - Safe Markdown content rendering (preserving partial content on interruption)
 * - Grounded source citations tray
 * - Telemetry & copy action footer
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = React.memo(
  ({ message, onRetry }) => {
    const isPending = message.status === 'pending';
    const hasText = Boolean(message.content && message.content.trim().length > 0);
    const isTerminalSuccess = message.status === 'success';

    return (
      <article
        data-testid={`chat-message-${message.id}`}
        aria-label="Mensaje de asistente"
        className="flex w-full justify-start gap-3 py-2"
      >
        {/* Bot Avatar */}
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-2xs"
        >
          <Bot className="h-4 w-4" />
        </div>

        {/* Message Bubble Container */}
        <div className="flex flex-col items-start gap-1.5 max-w-[95%] sm:max-w-[85%] md:max-w-[75%]">
          <div className="relative w-full rounded-2xl rounded-tl-xs border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground shadow-2xs break-words">
            {/* Status Indicators (pending, error, cancelled, interrupted) */}
            <MessageStatusIndicator
              status={message.status}
              error={message.error}
              onRetry={onRetry}
            />

            {/* Markdown Content (Rendered whenever content exists, preserving partial text on interruptions) */}
            {!isPending && hasText && (
              <div
                className={
                  message.status !== 'success'
                    ? 'mt-2 border-t border-border/40 pt-2 opacity-90'
                    : ''
                }
              >
                <MarkdownRenderer content={message.content} />
              </div>
            )}

            {/* Verified Source Citations */}
            {isTerminalSuccess && message.sources && message.sources.length > 0 && (
              <MessageCitations sources={message.sources} />
            )}
          </div>

          {/* Footer: Metadata & Actions */}
          <div className="flex w-full items-center justify-between gap-2 px-1">
            <MessageMetadata
              createdAt={message.createdAt}
              metadata={message.metadata}
              grounded={message.grounded}
            />

            {hasText && (
              <MessageActions content={message.content} label="Copiar respuesta del asistente" />
            )}
          </div>
        </div>
      </article>
    );
  },
);
