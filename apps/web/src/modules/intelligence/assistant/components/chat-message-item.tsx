import React from 'react';
import { UserMessage } from './user-message';
import { AssistantMessage } from './assistant-message';
import type { ChatMessage } from '../types/assistant.types';

export interface ChatMessageItemProps {
  message: ChatMessage;
  conversationId?: string;
  onRetry?: (messageId: string) => void;
}

/**
 * Chat Message Item Dispatcher Component.
 *
 * Dispatches to specialized UserMessage or AssistantMessage components,
 * decoupling user input rendering from complex assistant markdown/telemetry logic.
 */
export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(
  ({ message, conversationId, onRetry }) => {
    const handleRetry = React.useCallback(() => {
      onRetry?.(message.id);
    }, [onRetry, message.id]);

    if (message.role === 'user') {
      return <UserMessage message={message} />;
    }

    return (
      <AssistantMessage
        message={message}
        conversationId={conversationId}
        onRetry={onRetry ? handleRetry : undefined}
      />
    );
  },
);
