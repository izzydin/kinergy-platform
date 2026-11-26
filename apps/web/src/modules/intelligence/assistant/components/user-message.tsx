import React from 'react';
import { User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@kinergy-platform/ui';
import { MessageActions } from './message-actions';
import type { ChatMessage } from '../types/assistant.types';

export interface UserMessageProps {
  message: ChatMessage;
}

/**
 * User Message Component.
 *
 * Provides:
 * - Distinct right-aligned styling
 * - Multiline pre-wrap text without interpreting HTML
 * - Copy message action
 * - Time and status indicator
 */
export const UserMessage: React.FC<UserMessageProps> = React.memo(({ message }) => {
  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article
      data-testid={`chat-message-${message.id}`}
      id={`message-${message.id}`}
      aria-label="Mensaje de usuario"
      className="flex w-full justify-end gap-3 py-2"
    >
      <div className="flex flex-col items-end gap-1.5 min-w-0 max-w-[95%] sm:max-w-[80%] md:max-w-[70%]">
        <div className="relative min-w-0 rounded-2xl rounded-tr-xs bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-xs">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>

        {/* Footer & Actions */}
        <footer
          aria-label="Metadatos de mensaje de usuario"
          className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground"
        >
          <time dateTime={message.createdAt}>{formattedTime}</time>
          <MessageActions content={message.content} label="Copiar consulta de usuario" />
        </footer>
      </div>

      {/* User Avatar */}
      <Avatar
        aria-hidden="true"
        className="h-8 w-8 shrink-0 rounded-lg bg-primary text-primary-foreground shadow-xs"
      >
        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    </article>
  );
});
