/**
 * Structured logging context for AI conversation workflows.
 * Captures operational metrics and identifiers while strictly omitting raw message content or prompts.
 */
export interface AiConversationLogContext {
  readonly operation: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly clientTurnId?: string;
  readonly idempotencyOutcome?: 'CREATED' | 'EXISTING_RECOVERED';
  readonly failureCategory?: string;
  readonly durationMs?: number;
  readonly attemptNumber?: number;
  readonly isRetry?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Outbound port interface for structured, privacy-safe application logging
 * in the AI Conversation Persistence bounded context.
 */
export interface IAiConversationLoggerPort {
  info(message: string, context?: AiConversationLogContext): void;
  warn(message: string, context?: AiConversationLogContext): void;
  error(message: string, trace?: string, context?: AiConversationLogContext): void;
  debug(message: string, context?: AiConversationLogContext): void;
}
