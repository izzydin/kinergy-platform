/**
 * Thrown when a user or tenant attempts to access a conversation session
 * without proper authorization or across tenant boundaries.
 */
export class UnauthorizedConversationAccessException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedConversationAccessException';
    Object.setPrototypeOf(this, UnauthorizedConversationAccessException.prototype);
  }
}

/**
 * Thrown when a conversation session cannot be found within the specified tenant.
 */
export class ConversationNotFoundException extends Error {
  constructor(conversationId: string, tenantId: string) {
    super(`Conversation session '${conversationId}' was not found in tenant '${tenantId}'.`);
    this.name = 'ConversationNotFoundException';
    Object.setPrototypeOf(this, ConversationNotFoundException.prototype);
  }
}

/**
 * Thrown when an invalid turn, role, or message format is supplied to a conversation.
 */
export class InvalidConversationTurnException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConversationTurnException';
    Object.setPrototypeOf(this, InvalidConversationTurnException.prototype);
  }
}
