export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class PlatformLogger {
  private readonly isDev = import.meta.env.DEV;

  constructor(private readonly context = 'App') {}

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
    const errorMetadata = {
      ...metadata,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    };
    this.log('error', message, errorMetadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      timestamp: new Date().toISOString(),
      metadata,
    };

    if (this.isDev) {
      const prefix = `[${entry.timestamp.split('T')[1]?.slice(0, 8)}] [${level.toUpperCase()}] [${entry.context}]`;

      if (level === 'error') {
        console.error(`${prefix} ${message}`, metadata || '');
      } else if (level === 'warn') {
        console.warn(`${prefix} ${message}`, metadata || '');
      } else if (level === 'info') {
        // eslint-disable-next-line no-console
        console.info(`${prefix} ${message}`, metadata || '');
      } else {
        // eslint-disable-next-line no-console
        console.debug(`${prefix} ${message}`, metadata || '');
      }
    } else {
      // Production: Structured JSON logging
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  }
}

export const logger = new PlatformLogger('Global');
