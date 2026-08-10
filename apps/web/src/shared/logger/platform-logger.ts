import { getAppConfig } from '../../app/config/app-config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogLevelThreshold = LogLevel | 'silent';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface LogSink {
  log(entry: LogEntry): void;
}

const LEVEL_WEIGHTS: Record<LogLevelThreshold, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const SENSITIVE_KEY_PATTERNS =
  /password|pass|secret|token|bearer|authorization|auth_token|access_token|refresh_token|private_key|api_key|apikey|credential|ssn|credit_card/i;

/**
 * Sanitizes arbitrary values to redact sensitive keys, tokens, or credentials.
 */
export function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERNS.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    // Redact inline Bearer tokens if present
    if (value.startsWith('Bearer ') && value.length > 10) {
      return 'Bearer [REDACTED]';
    }
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)) {
    return sanitizeMetadata(value as Record<string, unknown>);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(String(index), item));
  }

  return value;
}

/**
 * Recursively sanitizes structured metadata objects.
 */
export function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const cleanMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    cleanMetadata[key] = sanitizeValue(key, value);
  }

  return cleanMetadata;
}

/**
 * Default console output sink formatting log entries for browser/Node console.
 */
export class ConsoleSink implements LogSink {
  log(entry: LogEntry): void {
    const isDev = getAppConfig().isDev;

    if (isDev) {
      const timeStr = entry.timestamp.includes('T')
        ? entry.timestamp.split('T')[1]?.slice(0, 8)
        : entry.timestamp;
      const prefix = `[${timeStr}] [${entry.level.toUpperCase()}] [${entry.context}]`;

      if (entry.level === 'error') {
        console.error(`${prefix} ${entry.message}`, entry.metadata || '');
      } else if (entry.level === 'warn') {
        console.warn(`${prefix} ${entry.message}`, entry.metadata || '');
      } else if (entry.level === 'info') {
        // eslint-disable-next-line no-console
        console.info(`${prefix} ${entry.message}`, entry.metadata || '');
      } else {
        // eslint-disable-next-line no-console
        console.debug(`${prefix} ${entry.message}`, entry.metadata || '');
      }
    } else {
      // Production: emit structured JSON log line
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  }
}

/**
 * Structured Platform Logger (`shared/logger/platform-logger.ts`)
 *
 * Provides environment-aware, sanitized, structured logging for frontend application infrastructure.
 */
export class PlatformLogger {
  private static minLevel: LogLevelThreshold | null = null;
  private static sinks: LogSink[] = [new ConsoleSink()];

  constructor(private readonly context = 'App') {}

  /** Resolves the effective minimum log level threshold based on environment or explicit setting */
  private get effectiveMinLevel(): LogLevelThreshold {
    if (PlatformLogger.minLevel !== null) {
      return PlatformLogger.minLevel;
    }

    const config = getAppConfig();
    if (config.isTest) {
      return 'warn'; // Suppress noisy info/debug logs during unit test runs
    }
    if (config.isDev) {
      return 'debug';
    }
    return 'info'; // Production log level default
  }

  /** Sets a global minimum log level override for all logger instances */
  public static setMinLevel(level: LogLevelThreshold): void {
    PlatformLogger.minLevel = level;
  }

  /** Resets minimum log level override back to environment default */
  public static resetMinLevel(): void {
    PlatformLogger.minLevel = null;
  }

  /** Registers a pluggable log sink */
  public static addSink(sink: LogSink): void {
    PlatformLogger.sinks.push(sink);
  }

  /** Removes a registered log sink */
  public static removeSink(sink: LogSink): void {
    PlatformLogger.sinks = PlatformLogger.sinks.filter((s) => s !== sink);
  }

  /** Clears all registered sinks (useful for test isolation) */
  public static clearSinks(): void {
    PlatformLogger.sinks = [];
  }

  /** Sets the list of active log sinks */
  public static setSinks(sinks: LogSink[]): void {
    PlatformLogger.sinks = [...sinks];
  }

  /** Creates a child logger with specified context prefix */
  public withContext(contextName: string): PlatformLogger {
    return new PlatformLogger(contextName);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    const errorMetadata: Record<string, unknown> = { ...metadata };

    if (error !== undefined) {
      if (error instanceof Error) {
        errorMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        errorMetadata.error = error;
      }
    }

    this.log('error', message, errorMetadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[this.effectiveMinLevel]) {
      return;
    }

    const cleanMetadata = sanitizeMetadata(metadata);
    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      timestamp: new Date().toISOString(),
      metadata: cleanMetadata,
    };

    for (const sink of PlatformLogger.sinks) {
      try {
        sink.log(entry);
      } catch {
        // Prevent sink errors from crashing application execution
      }
    }
  }
}

/** Shared singleton logger instance */
export const logger = new PlatformLogger('Global');
