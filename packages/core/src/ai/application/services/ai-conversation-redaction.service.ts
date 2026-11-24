import { AiConversationLogContext } from '../ports/ai-conversation-logger.port';

/**
 * Privacy and Redaction Service for AI conversation operational logging.
 *
 * Guarantees:
 * - Sensitive message prompts and generation outputs are strictly stripped/redacted.
 * - Authentication credentials, database connection strings, and tokens are never leaked.
 * - Structured log contexts contain only non-sensitive operational identifiers.
 */
export class AiConversationRedactionService {
  private static readonly SENSITIVE_KEYS = new Set([
    'prompt',
    'userprompt',
    'content',
    'messagecontent',
    'token',
    'leasetoken',
    'secret',
    'password',
    'authorization',
    'auth',
    'apikey',
    'database_url',
  ]);

  /**
   * Sanitizes an operational logging context, redacting any sensitive data.
   */
  public static sanitizeContext(
    context?: AiConversationLogContext,
  ): AiConversationLogContext | undefined {
    if (!context) {
      return undefined;
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();

      if (this.SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as AiConversationLogContext;
  }

  /**
   * Recursively sanitizes generic key-value metadata objects.
   */
  public static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      if (this.SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
