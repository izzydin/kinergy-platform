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

/**
 * Thrown when a conversation turn cannot be found within the specified conversation or tenant.
 */
export class TurnNotFoundException extends Error {
  constructor(turnId: string, conversationId?: string) {
    super(
      conversationId
        ? `Turn '${turnId}' was not found in conversation '${conversationId}'.`
        : `Turn '${turnId}' was not found.`,
    );
    this.name = 'TurnNotFoundException';
    Object.setPrototypeOf(this, TurnNotFoundException.prototype);
  }
}

/**
 * Thrown when a conversation message cannot be found.
 */
export class MessageNotFoundException extends Error {
  constructor(messageId: string, turnId?: string) {
    super(
      turnId
        ? `Message '${messageId}' was not found in turn '${turnId}'.`
        : `Message '${messageId}' was not found.`,
    );
    this.name = 'MessageNotFoundException';
    Object.setPrototypeOf(this, MessageNotFoundException.prototype);
  }
}

/**
 * Thrown when a pagination cursor for message history is malformed or invalid.
 */
export class InvalidCursorException extends Error {
  constructor(message: string) {
    super(`Invalid pagination cursor: ${message}`);
    this.name = 'InvalidCursorException';
    Object.setPrototypeOf(this, InvalidCursorException.prototype);
  }
}

/**
 * Thrown when an invariant on a message or turn generation is violated.
 */
export class InvalidMessageInvariantException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageInvariantException';
    Object.setPrototypeOf(this, InvalidMessageInvariantException.prototype);
  }
}

/**
 * Thrown when an entity identifier or value object identity is invalid or empty.
 */
export class InvalidEntityIdentityException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntityIdentityException';
    Object.setPrototypeOf(this, InvalidEntityIdentityException.prototype);
  }
}

/**
 * Thrown when an invalid or disallowed state machine transition is attempted.
 */
export class InvalidLifecycleTransitionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLifecycleTransitionException';
    Object.setPrototypeOf(this, InvalidLifecycleTransitionException.prototype);
  }
}

/**
 * Thrown when a message or active attempt violates parent turn, conversation, or tenant ownership boundaries.
 */
export class InvalidMessageOwnershipException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageOwnershipException';
    Object.setPrototypeOf(this, InvalidMessageOwnershipException.prototype);
  }
}

/**
 * Thrown when an invalid canonical designation is attempted on a message (e.g. non-assistant or non-success).
 */
export class InvalidCanonicalDesignationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCanonicalDesignationException';
    Object.setPrototypeOf(this, InvalidCanonicalDesignationException.prototype);
  }
}

/**
 * Thrown when an entity uniqueness constraint is violated (e.g. duplicate idempotency key, sequence number).
 */
export class DuplicateEntityException extends Error {
  constructor(entityName: string, identifier: string, tenantId?: string) {
    super(
      tenantId
        ? `${entityName} with identifier '${identifier}' already exists in tenant '${tenantId}'.`
        : `${entityName} with identifier '${identifier}' already exists.`,
    );
    this.name = 'DuplicateEntityException';
    Object.setPrototypeOf(this, DuplicateEntityException.prototype);
  }
}

/**
 * Thrown when an operation violates tenant or parent aggregate ownership boundaries.
 */
export class InvalidOwnershipException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOwnershipException';
    Object.setPrototypeOf(this, InvalidOwnershipException.prototype);
  }
}

/**
 * Thrown when an underlying persistence failure occurs without leaking infrastructure details.
 */
export class ConversationPersistenceException extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConversationPersistenceException';
    Object.setPrototypeOf(this, ConversationPersistenceException.prototype);
  }
}
