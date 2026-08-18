/**
 * Port interface for structured application logging within the Gym Management bounded context.
 */
export interface GymLoggerPort {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, trace?: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
