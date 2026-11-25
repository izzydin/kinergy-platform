/**
 * Base class for all application-layer AI conversation errors.
 * Decoupled from HTTP status codes, NestJS exception filters, and Prisma errors.
 */
export abstract class AiConversationApplicationError extends Error {
  public abstract readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested conversation does not exist within the specified tenant boundary.
 */
export class ConversationNotFoundError extends AiConversationApplicationError {
  public readonly code = 'AI_CONVERSATION_NOT_FOUND';

  constructor(conversationId: string, tenantId: string) {
    super(`Conversation '${conversationId}' not found in tenant '${tenantId}'.`, {
      conversationId,
      tenantId,
    });
  }
}

/**
 * Thrown when a requested turn does not exist within the specified conversation or tenant.
 */
export class TurnNotFoundError extends AiConversationApplicationError {
  public readonly code = 'AI_TURN_NOT_FOUND';

  constructor(turnId: string, conversationId?: string, tenantId?: string) {
    super(
      conversationId
        ? `Turn '${turnId}' not found in conversation '${conversationId}'.`
        : `Turn '${turnId}' not found.`,
      { turnId, conversationId, tenantId },
    );
  }
}

/**
 * Thrown when a requested message or generation attempt does not exist.
 */
export class MessageNotFoundError extends AiConversationApplicationError {
  public readonly code = 'AI_MESSAGE_NOT_FOUND';

  constructor(messageId: string, turnId?: string, conversationId?: string) {
    super(
      turnId
        ? `Message '${messageId}' not found in turn '${turnId}'.`
        : `Message '${messageId}' not found.`,
      { messageId, turnId, conversationId },
    );
  }
}

/**
 * Thrown when an operation violates tenant isolation boundaries.
 */
export class TenantOwnershipViolationError extends AiConversationApplicationError {
  public readonly code = 'AI_TENANT_OWNERSHIP_VIOLATION';

  constructor(entity: string, identifier: string, tenantId: string) {
    super(
      `Tenant ownership violation: Entity '${entity}' (${identifier}) does not belong to tenant '${tenantId}'.`,
      { entity, identifier, tenantId },
    );
  }
}

/**
 * Thrown when an input argument for a turn operation fails syntactic or domain validation.
 */
export class InvalidTurnInputError extends AiConversationApplicationError {
  public readonly code = 'AI_INVALID_TURN_INPUT';

  constructor(field: string, reason: string) {
    super(`Invalid turn input for field '${field}': ${reason}`, {
      field,
      reason,
    });
  }
}

/**
 * Thrown when a clientTurnId is reused with a different user prompt or payload (idempotency conflict).
 */
export class DuplicateClientTurnPayloadMismatchError extends AiConversationApplicationError {
  public readonly code = 'AI_CLIENT_TURN_PAYLOAD_MISMATCH';

  constructor(clientTurnId: string, existingHash: string, receivedHash: string) {
    super(
      `Idempotency violation: clientTurnId '${clientTurnId}' has already been reserved with a different payload hash.`,
      { clientTurnId, existingHash, receivedHash },
    );
  }
}

/**
 * Thrown when attempting to start or reserve a turn while another active turn is already in progress.
 */
export class TurnAlreadyInProgressError extends AiConversationApplicationError {
  public readonly code = 'AI_TURN_ALREADY_IN_PROGRESS';

  constructor(conversationId: string, activeTurnId: string) {
    super(
      `Conversation '${conversationId}' already has an active turn (${activeTurnId}) in progress. Concurrent turns are prohibited.`,
      { conversationId, activeTurnId },
    );
  }
}

/**
 * Thrown when a conversation lifecycle transition is invalid (e.g. archiving an already archived conversation).
 */
export class InvalidConversationLifecycleError extends AiConversationApplicationError {
  public readonly code = 'AI_INVALID_CONVERSATION_LIFECYCLE';

  constructor(conversationId: string, reason: string) {
    super(`Invalid lifecycle operation on conversation '${conversationId}': ${reason}`, {
      conversationId,
      reason,
    });
  }
}

/**
 * Thrown when an operation on a message or generation attempt is disallowed by domain invariants.
 */
export class InvalidMessageOperationError extends AiConversationApplicationError {
  public readonly code = 'AI_INVALID_MESSAGE_OPERATION';

  constructor(messageId: string, reason: string) {
    super(`Invalid message operation on '${messageId}': ${reason}`, {
      messageId,
      reason,
    });
  }
}

/**
 * Thrown when a concurrent write conflict or unique constraint collision occurs during persistence.
 */
export class PersistenceConflictError extends AiConversationApplicationError {
  public readonly code = 'AI_PERSISTENCE_CONFLICT';

  constructor(entity: string, conflictDetails: string) {
    super(`Persistence conflict on entity '${entity}': ${conflictDetails}`, {
      entity,
      conflictDetails,
    });
  }
}

/**
 * Thrown when an atomic transaction boundary aborts or fails to commit.
 */
export class TransactionFailureError extends AiConversationApplicationError {
  public override readonly code: string = 'AI_TRANSACTION_FAILURE';
  public readonly originalError?: unknown;

  constructor(operation: string, rootCause?: unknown) {
    super(
      `Transaction execution failed during '${operation}': ${rootCause instanceof Error ? rootCause.message : String(rootCause)}`,
      {
        operation,
        rootCause: rootCause instanceof Error ? rootCause.message : String(rootCause),
      },
    );
    this.originalError = rootCause;
  }
}

/**
 * Thrown when a transaction fails repeatedly due to transient database conflicts
 * (e.g. serialization failures, deadlocks, connection drops) after exhausting all retry attempts.
 */
export class TransientTransactionFailureError extends TransactionFailureError {
  public override readonly code: string = 'AI_TRANSIENT_TRANSACTION_FAILURE';
  public readonly attempts: number;

  constructor(operation: string, rootCause: unknown, attempts: number) {
    super(operation, rootCause);
    this.attempts = attempts;
  }
}

/**
 * Thrown when a requested citation does not exist within the specified message, conversation, or tenant.
 */
export class CitationNotFoundError extends AiConversationApplicationError {
  public override readonly code: string = 'AI_CITATION_NOT_FOUND';

  constructor(citationId: string, messageId?: string, conversationId?: string) {
    super(
      messageId
        ? `Citation '${citationId}' not found for message '${messageId}'.`
        : `Citation '${citationId}' not found.`,
      { citationId, messageId, conversationId },
    );
  }
}
