import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { ChatMessage, ChatRole } from '../../domain/value-objects/chat-message.vo';
import { InvalidMessageOperationError } from '../errors/ai-conversation-application.error';

/**
 * Mapper for converting canonical persisted conversation messages (AiConversationMessage)
 * into immutable AI-08 context ChatMessage value objects.
 *
 * Guarantees:
 * 1. Preserves role semantics (USER -> user, ASSISTANT -> assistant, SYSTEM -> system).
 * 2. Preserves message content without accidental truncation (bounded only by ChatMessage.MAX_MESSAGE_LENGTH = 4000).
 * 3. Handles empty, missing, or malformed message content defensively.
 * 4. Strips internal persistence identifiers and technical metadata from the LLM prompt.
 * 5. Keeps source citations strictly separated from raw conversational message content.
 * 6. Does NOT create a second duplicate domain model.
 */
export class CanonicalChatMessageMapper {
  /**
   * Maps a domain AiConversationMessage to a ChatMessage value object.
   * Returns null if the message is empty, whitespace-only, or cannot be safely mapped.
   */
  public static toChatMessageOrNull(message: AiConversationMessage): ChatMessage | null {
    if (!message) {
      return null;
    }

    const rawContent = message.content;
    if (typeof rawContent !== 'string') {
      return null;
    }

    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const role = this.mapRoleOrNull(message.role);
    if (!role) {
      return null;
    }

    // Safely enforce maximum character length without throwing
    const safeContent =
      trimmed.length > ChatMessage.MAX_MESSAGE_LENGTH
        ? trimmed.slice(0, ChatMessage.MAX_MESSAGE_LENGTH)
        : trimmed;

    return ChatMessage.create({
      role,
      content: safeContent,
    });
  }

  /**
   * Maps a domain AiConversationMessage to a ChatMessage value object.
   * Throws InvalidMessageOperationError if the message is invalid or cannot be mapped.
   */
  public static toChatMessage(message: AiConversationMessage): ChatMessage {
    if (!message) {
      throw new InvalidMessageOperationError(
        'unknown',
        'Cannot map null or undefined message to ChatMessage.',
      );
    }

    const chatMsg = this.toChatMessageOrNull(message);
    if (!chatMsg) {
      throw new InvalidMessageOperationError(
        message.id?.value ?? 'unknown',
        `Message cannot be mapped to ChatMessage: invalid role '${message.role}' or empty content.`,
      );
    }

    return chatMsg;
  }

  /**
   * Maps ConversationRole enum to ChatRole literal string.
   */
  public static mapRole(role: ConversationRole): ChatRole {
    const mapped = this.mapRoleOrNull(role);
    if (!mapped) {
      throw new InvalidMessageOperationError(
        'unknown',
        `Unsupported conversation role: '${role}'.`,
      );
    }
    return mapped;
  }

  /**
   * Maps ConversationRole enum to ChatRole literal string, or null if unsupported.
   */
  public static mapRoleOrNull(role: ConversationRole): ChatRole | null {
    switch (role) {
      case ConversationRole.USER:
        return 'user';
      case ConversationRole.ASSISTANT:
        return 'assistant';
      case ConversationRole.SYSTEM:
        return 'system';
      default:
        return null;
    }
  }
}
