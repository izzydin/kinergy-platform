export type ChatRole = 'system' | 'user' | 'assistant';

export interface CreateChatMessageProps {
  role: ChatRole;
  content: string;
}

/**
 * Value Object representing a single conversational turn in a multi-turn RAG interaction.
 *
 * Invariants:
 * - Role must be one of: 'system' | 'user' | 'assistant'.
 * - Content must be a non-empty, non-whitespace string.
 * - Maximum character length: 4,000 characters per message.
 */
export class ChatMessage {
  public static readonly MAX_MESSAGE_LENGTH = 4000;

  public readonly role: ChatRole;
  public readonly content: string;

  private constructor(role: ChatRole, content: string) {
    this.role = role;
    this.content = content;
    Object.freeze(this);
  }

  public static create(props: CreateChatMessageProps): ChatMessage {
    if (!props.role || !['system', 'user', 'assistant'].includes(props.role)) {
      throw new Error(`Invalid chat role: ${props.role}. Allowed: system, user, assistant.`);
    }

    if (!props.content || typeof props.content !== 'string') {
      throw new Error('Chat message content must be a non-empty string.');
    }

    const trimmed = props.content.trim();
    if (trimmed.length === 0) {
      throw new Error('Chat message content cannot be purely whitespace.');
    }

    if (trimmed.length > ChatMessage.MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Chat message length (${trimmed.length}) exceeds maximum allowable of ${ChatMessage.MAX_MESSAGE_LENGTH} characters.`,
      );
    }

    return new ChatMessage(props.role, trimmed);
  }

  public static user(content: string): ChatMessage {
    return ChatMessage.create({ role: 'user', content });
  }

  public static assistant(content: string): ChatMessage {
    return ChatMessage.create({ role: 'assistant', content });
  }

  public static system(content: string): ChatMessage {
    return ChatMessage.create({ role: 'system', content });
  }
}
